/**
 * Server-Sent Events Transport Implementation
 * Provides HTTP-based streaming transport for web clients
 */

import http from 'http';
import { URL } from 'url';
import { Transport, TransportCapabilities } from '../protocol/TransportManager.js';
import { MCPRequest, MCPResponse, MCPNotification } from '../types.js';

export interface SSETransportConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  maxConnections: number;
  connectionTimeout: number;
  requestTimeout: number;
  enableCompression: boolean;
}

interface SSEConnection {
  id: string;
  response: http.ServerResponse;
  lastSeen: Date;
  userAgent?: string;
  remoteAddress?: string;
}

export class SSETransport extends Transport {
  private server?: http.Server;
  private connections = new Map<string, SSEConnection>();
  private sseConfig: SSETransportConfig;

  constructor(config: SSETransportConfig) {
    super();
    this.sseConfig = {
      port: config.port || 3001,
      host: config.host || 'localhost',
      corsOrigins: config.corsOrigins || ['*'],
      maxConnections: config.maxConnections || 100,
      connectionTimeout: config.connectionTimeout || 300000, // 5 minutes
      requestTimeout: config.requestTimeout || 30000,
      enableCompression: config.enableCompression || true
    };
  }

  get capabilities(): TransportCapabilities {
    return {
      supportsStreaming: true,
      supportsBidirectional: false, // SSE is unidirectional (server -> client)
      supportsMultipleClients: true,
      maxMessageSize: this.config.maxMessageSize,
      keepAlive: true
    };
  }

  async start(): Promise<void> {
    if (this.connected) {
      throw new Error('SSE transport already started');
    }

    this.server = http.createServer();
    
    this.server.on('request', this.handleRequest.bind(this));
    this.server.on('error', this.handleError.bind(this));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.sseConfig.port, this.sseConfig.host, () => {
        this.connected = true;
        this.stats.connectionTime = new Date();
        this.setupConnectionCleanup();
        
        console.error(`SSE MCP Transport started on ${this.sseConfig.host}:${this.sseConfig.port}`);
        this.emit('connect');
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.connected || !this.server) return;

    this.connected = false;

    // Close all SSE connections
    for (const [id, connection] of this.connections) {
      this.closeConnection(id, 'Server shutting down');
    }

    // Close HTTP server
    return new Promise((resolve) => {
      this.server!.close(() => {
        console.error('SSE MCP Transport stopped');
        this.emit('disconnect');
        resolve();
      });
    });
  }

  async send(message: MCPResponse | MCPNotification): Promise<void> {
    return this.broadcast(message);
  }

  /**
   * Broadcast message to all connected clients
   */
  async broadcast(message: MCPResponse | MCPNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('SSE transport not connected');
    }

    const messageStr = JSON.stringify(message);
    const messageBytes = Buffer.byteLength(messageStr, 'utf8');
    
    if (messageBytes > this.config.maxMessageSize) {
      throw new Error(`Message too large: ${messageBytes} bytes (max: ${this.config.maxMessageSize})`);
    }

    const sseMessage = this.formatSSEMessage(messageStr);
    const promises: Promise<void>[] = [];

    for (const [id, connection] of this.connections) {
      promises.push(this.sendToConnection(id, sseMessage, messageBytes));
    }

    await Promise.allSettled(promises);
    this.emit('message_sent', message);
  }

  /**
   * Send message to specific connection
   */
  async sendToConnection(connectionId: string, message: MCPResponse | MCPNotification): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const messageStr = JSON.stringify(message);
    const messageBytes = Buffer.byteLength(messageStr, 'utf8');
    const sseMessage = this.formatSSEMessage(messageStr);

    await this.sendToConnection(connectionId, sseMessage, messageBytes);
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        this.handleCORSPreflight(req, res);
        return;
      }

      // Route requests
      switch (url.pathname) {
        case '/events':
          if (req.method === 'GET') {
            this.handleSSEConnection(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        case '/jsonrpc':
          if (req.method === 'POST') {
            await this.handleJSONRPCRequest(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        case '/status':
          if (req.method === 'GET') {
            this.handleStatusRequest(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        default:
          this.sendNotFound(res);
      }

    } catch (error) {
      console.error('Request handling error:', error);
      this.sendInternalError(res);
    }
  }

  /**
   * Handle SSE connection establishment
   */
  private handleSSEConnection(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Check connection limits
    if (this.connections.size >= this.sseConfig.maxConnections) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Connection limit exceeded');
      return;
    }

    // Setup CORS headers
    this.setCORSHeaders(req, res);

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Credentials': 'true'
    });

    const connectionId = this.generateConnectionId();
    const connection: SSEConnection = {
      id: connectionId,
      response: res,
      lastSeen: new Date(),
      userAgent: req.headers['user-agent'],
      remoteAddress: req.connection.remoteAddress
    };

    this.connections.set(connectionId, connection);

    // Send initial connection message
    const welcomeMessage = {
      type: 'connection',
      connectionId,
      timestamp: new Date().toISOString(),
      serverInfo: {
        name: 'playwright-mcp-server',
        version: '1.0.0',
        transport: 'sse'
      }
    };

    this.sendSSEMessage(res, 'welcome', JSON.stringify(welcomeMessage));

    // Setup connection handlers
    req.on('close', () => {
      this.closeConnection(connectionId, 'Client disconnected');
    });

    req.on('error', (error) => {
      console.error(`Connection ${connectionId} error:`, error);
      this.closeConnection(connectionId, 'Connection error');
    });

    // Send keep-alive
    this.sendSSEMessage(res, 'ping', JSON.stringify({ timestamp: Date.now() }));

    console.error(`SSE connection established: ${connectionId}`);
    this.emit('client_connected', connectionId);
  }

  /**
   * Handle JSON-RPC over HTTP
   */
  private async handleJSONRPCRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCORSHeaders(req, res);

    try {
      const body = await this.readRequestBody(req);
      const message = JSON.parse(body) as MCPRequest;

      // Validate message
      if (!this.isValidJSONRPC(message)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Request' }
        }));
        return;
      }

      this.updateStats('received', Buffer.byteLength(body, 'utf8'));
      
      // Emit message for processing
      this.emit('message', message);

      // Send acknowledgment
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: { received: true, timestamp: Date.now() }
      }));

    } catch (error) {
      console.error('JSON-RPC request error:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }));
    }
  }

  /**
   * Handle status request
   */
  private handleStatusRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.setCORSHeaders(req, res);

    const status = {
      status: 'online',
      connections: this.connections.size,
      uptime: Date.now() - this.stats.connectionTime.getTime(),
      stats: this.getStats(),
      capabilities: this.capabilities
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  /**
   * Close SSE connection
   */
  private closeConnection(connectionId: string, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      // Send close message
      this.sendSSEMessage(connection.response, 'close', JSON.stringify({ reason }));
      connection.response.end();
    } catch (error) {
      // Connection already closed
    }

    this.connections.delete(connectionId);
    console.error(`SSE connection closed: ${connectionId} (${reason})`);
    this.emit('client_disconnected', connectionId);
  }

  /**
   * Send SSE formatted message to specific connection
   */
  private async sendToConnection(connectionId: string, sseMessage: string, bytes: number): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      connection.response.write(sseMessage);
      connection.lastSeen = new Date();
      this.updateStats('sent', bytes);
    } catch (error) {
      console.error(`Failed to send to connection ${connectionId}:`, error);
      this.closeConnection(connectionId, 'Write error');
    }
  }

  /**
   * Format message for SSE
   */
  private formatSSEMessage(data: string, event = 'message'): string {
    return `event: ${event}\ndata: ${data}\n\n`;
  }

  /**
   * Send SSE message to specific response
   */
  private sendSSEMessage(res: http.ServerResponse, event: string, data: string): void {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  /**
   * Setup connection cleanup timer
   */
  private setupConnectionCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = this.sseConfig.connectionTimeout;

      for (const [id, connection] of this.connections) {
        if (now.getTime() - connection.lastSeen.getTime() > timeout) {
          this.closeConnection(id, 'Timeout');
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Set CORS headers
   */
  private setCORSHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    
    if (this.sseConfig.corsOrigins.includes('*') || 
        (origin && this.sseConfig.corsOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  /**
   * Handle CORS preflight
   */
  private handleCORSPreflight(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.setCORSHeaders(req, res);
    res.writeHead(204);
    res.end();
  }

  /**
   * Read request body
   */
  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
        if (body.length > this.config.maxMessageSize) {
          reject(new Error('Request too large'));
        }
      });

      req.on('end', () => resolve(body));
      req.on('error', reject);

      setTimeout(() => reject(new Error('Request timeout')), this.sseConfig.requestTimeout);
    });
  }

  /**
   * Validate JSON-RPC message
   */
  private isValidJSONRPC(message: any): message is MCPRequest {
    return (
      typeof message === 'object' &&
      message !== null &&
      message.jsonrpc === '2.0' &&
      typeof message.method === 'string'
    );
  }

  /**
   * Send HTTP error responses
   */
  private sendMethodNotAllowed(res: http.ServerResponse): void {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
  }

  private sendNotFound(res: http.ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private sendInternalError(res: http.ServerResponse): void {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get transport-specific information
   */
  getTransportInfo(): {
    type: 'sse';
    port: number;
    host: string;
    connections: number;
    maxConnections: number;
  } {
    return {
      type: 'sse',
      port: this.sseConfig.port,
      host: this.sseConfig.host,
      connections: this.connections.size,
      maxConnections: this.sseConfig.maxConnections
    };
  }

  /**
   * Get connection details
   */
  getConnections(): Array<{
    id: string;
    lastSeen: Date;
    userAgent?: string;
    remoteAddress?: string;
  }> {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      lastSeen: conn.lastSeen,
      userAgent: conn.userAgent,
      remoteAddress: conn.remoteAddress
    }));
  }
}