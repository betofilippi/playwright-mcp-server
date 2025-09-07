/**
 * WebSocket Transport Implementation
 * Provides bidirectional real-time communication for advanced clients
 */

import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { Transport, TransportCapabilities } from '../protocol/TransportManager.js';
import { MCPRequest, MCPResponse, MCPNotification } from '../types.js';

export interface WebSocketTransportConfig {
  port: number;
  host: string;
  maxConnections: number;
  connectionTimeout: number;
  pingInterval: number;
  pongTimeout: number;
  enableCompression: boolean;
  maxFrameSize: number;
  maxMessageSize: number;
}

interface WSConnection {
  id: string;
  ws: WebSocket;
  lastSeen: Date;
  lastPing?: Date;
  userAgent?: string;
  remoteAddress?: string;
  authenticated: boolean;
  clientInfo?: {
    name: string;
    version: string;
  };
}

export class WebSocketTransport extends Transport {
  private server?: http.Server;
  private wsServer?: WebSocketServer;
  private connections = new Map<string, WSConnection>();
  private wsConfig: WebSocketTransportConfig;
  private pingTimer?: NodeJS.Timeout;

  constructor(config: Partial<WebSocketTransportConfig> = {}) {
    super();
    this.wsConfig = {
      port: config.port || 3002,
      host: config.host || 'localhost',
      maxConnections: config.maxConnections || 100,
      connectionTimeout: config.connectionTimeout || 300000, // 5 minutes
      pingInterval: config.pingInterval || 30000, // 30 seconds
      pongTimeout: config.pongTimeout || 10000, // 10 seconds
      enableCompression: config.enableCompression !== false,
      maxFrameSize: config.maxFrameSize || 16 * 1024 * 1024, // 16MB
      maxMessageSize: config.maxMessageSize || 10 * 1024 * 1024 // 10MB
    };
  }

  get capabilities(): TransportCapabilities {
    return {
      supportsStreaming: true,
      supportsBidirectional: true,
      supportsMultipleClients: true,
      maxMessageSize: this.wsConfig.maxMessageSize,
      keepAlive: true
    };
  }

  async start(): Promise<void> {
    if (this.connected) {
      throw new Error('WebSocket transport already started');
    }

    // Create HTTP server for WebSocket upgrade
    this.server = http.createServer();
    
    // Create WebSocket server
    this.wsServer = new WebSocketServer({
      server: this.server,
      perMessageDeflate: this.wsConfig.enableCompression,
      maxPayload: this.wsConfig.maxFrameSize,
      clientTracking: false // We manage connections manually
    });

    this.wsServer.on('connection', this.handleConnection.bind(this));
    this.wsServer.on('error', this.handleError.bind(this));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.wsConfig.port, this.wsConfig.host, () => {
        this.connected = true;
        this.stats.connectionTime = new Date();
        
        this.setupPingInterval();
        this.setupConnectionCleanup();
        
        console.error(`WebSocket MCP Transport started on ws://${this.wsConfig.host}:${this.wsConfig.port}`);
        this.emit('connect');
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.connected) return;

    this.connected = false;

    // Clear timers
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    // Close all WebSocket connections
    for (const [id, connection] of this.connections) {
      this.closeConnection(id, 1001, 'Server shutting down');
    }

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
    }

    // Close HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.error('WebSocket MCP Transport stopped');
          this.emit('disconnect');
          resolve();
        });
      });
    }
  }

  async send(message: MCPResponse | MCPNotification): Promise<void> {
    return this.broadcast(message);
  }

  /**
   * Broadcast message to all connected clients
   */
  async broadcast(message: MCPResponse | MCPNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('WebSocket transport not connected');
    }

    const messageStr = JSON.stringify(message);
    const messageBytes = Buffer.byteLength(messageStr, 'utf8');
    
    if (messageBytes > this.wsConfig.maxMessageSize) {
      throw new Error(`Message too large: ${messageBytes} bytes (max: ${this.wsConfig.maxMessageSize})`);
    }

    const promises: Promise<void>[] = [];

    for (const [id, connection] of this.connections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        promises.push(this.sendToConnection(id, message));
      }
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

    if (connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Connection ${connectionId} not open`);
    }

    const messageStr = JSON.stringify(message);
    const messageBytes = Buffer.byteLength(messageStr, 'utf8');

    return new Promise((resolve, reject) => {
      connection.ws.send(messageStr, (error) => {
        if (error) {
          console.error(`Failed to send to connection ${connectionId}:`, error);
          this.closeConnection(connectionId, 1011, 'Send error');
          reject(error);
        } else {
          connection.lastSeen = new Date();
          this.updateStats('sent', messageBytes);
          resolve();
        }
      });
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    // Check connection limits
    if (this.connections.size >= this.wsConfig.maxConnections) {
      ws.close(1013, 'Connection limit exceeded');
      return;
    }

    const connectionId = this.generateConnectionId();
    const connection: WSConnection = {
      id: connectionId,
      ws,
      lastSeen: new Date(),
      userAgent: req.headers['user-agent'],
      remoteAddress: req.connection.remoteAddress,
      authenticated: false
    };

    this.connections.set(connectionId, connection);

    // Setup connection event handlers
    ws.on('message', (data) => {
      this.handleMessage(connectionId, data);
    });

    ws.on('ping', (data) => {
      this.handlePing(connectionId, data);
    });

    ws.on('pong', (data) => {
      this.handlePong(connectionId, data);
    });

    ws.on('close', (code, reason) => {
      this.handleClose(connectionId, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket connection ${connectionId} error:`, error);
      this.closeConnection(connectionId, 1011, 'Connection error');
    });

    // Send welcome message
    const welcomeMessage: MCPNotification = {
      jsonrpc: '2.0',
      method: 'notifications/welcome',
      params: {
        connectionId,
        timestamp: new Date().toISOString(),
        serverInfo: {
          name: 'playwright-mcp-server',
          version: '1.0.0',
          transport: 'websocket'
        }
      }
    };

    this.sendToConnection(connectionId, welcomeMessage).catch(error => {
      console.error('Failed to send welcome message:', error);
    });

    console.error(`WebSocket connection established: ${connectionId}`);
    this.emit('client_connected', connectionId);
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(connectionId: string, data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const messageStr = data.toString();
      const messageBytes = Buffer.byteLength(messageStr, 'utf8');

      // Check message size
      if (messageBytes > this.wsConfig.maxMessageSize) {
        this.closeConnection(connectionId, 1009, 'Message too large');
        return;
      }

      // Parse JSON-RPC message
      const message = JSON.parse(messageStr);

      // Validate message
      if (!this.isValidJSONRPC(message)) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: message.id || null,
          error: {
            code: -32600,
            message: 'Invalid Request'
          }
        };
        await this.sendToConnection(connectionId, errorResponse);
        return;
      }

      connection.lastSeen = new Date();
      this.updateStats('received', messageBytes);

      // Handle authentication for first message
      if (!connection.authenticated && message.method === 'initialize') {
        connection.authenticated = true;
        if (message.params?.clientInfo) {
          connection.clientInfo = message.params.clientInfo;
        }
      }

      // Emit message for processing
      this.emit('message', message, connectionId);

    } catch (error) {
      console.error(`Failed to process message from ${connectionId}:`, error);
      
      // Send parse error
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };

      await this.sendToConnection(connectionId, errorResponse).catch(() => {
        // If we can't send error response, close connection
        this.closeConnection(connectionId, 1003, 'Parse error');
      });
    }
  }

  /**
   * Handle WebSocket ping
   */
  private handlePing(connectionId: string, data: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastSeen = new Date();
    
    // WebSocket automatically sends pong, but we track it
    console.debug(`Ping received from ${connectionId}`);
  }

  /**
   * Handle WebSocket pong
   */
  private handlePong(connectionId: string, data: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastSeen = new Date();
    console.debug(`Pong received from ${connectionId}`);
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(connectionId: string, code: number, reason: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.connections.delete(connectionId);
    
    const reasonStr = reason.toString();
    console.error(`WebSocket connection closed: ${connectionId} (code: ${code}, reason: ${reasonStr})`);
    this.emit('client_disconnected', connectionId);
  }

  /**
   * Close WebSocket connection
   */
  private closeConnection(connectionId: string, code: number, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      connection.ws.close(code, reason);
    } catch (error) {
      // Connection already closed
    }

    this.connections.delete(connectionId);
    console.error(`WebSocket connection closed: ${connectionId} (${reason})`);
    this.emit('client_disconnected', connectionId);
  }

  /**
   * Setup ping interval for keep-alive
   */
  private setupPingInterval(): void {
    this.pingTimer = setInterval(() => {
      for (const [id, connection] of this.connections) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.lastPing = new Date();
          connection.ws.ping();
        }
      }
    }, this.wsConfig.pingInterval);
  }

  /**
   * Setup connection cleanup
   */
  private setupConnectionCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = this.wsConfig.connectionTimeout;
      const pongTimeout = this.wsConfig.pongTimeout;

      for (const [id, connection] of this.connections) {
        // Check for general timeout
        if (now.getTime() - connection.lastSeen.getTime() > timeout) {
          this.closeConnection(id, 1000, 'Connection timeout');
          continue;
        }

        // Check for pong timeout
        if (connection.lastPing && 
            now.getTime() - connection.lastPing.getTime() > pongTimeout) {
          this.closeConnection(id, 1002, 'Pong timeout');
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Validate JSON-RPC message
   */
  private isValidJSONRPC(message: any): message is MCPRequest | MCPNotification {
    return (
      typeof message === 'object' &&
      message !== null &&
      message.jsonrpc === '2.0' &&
      typeof message.method === 'string'
    );
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get transport-specific information
   */
  getTransportInfo(): {
    type: 'websocket';
    port: number;
    host: string;
    connections: number;
    maxConnections: number;
    pingInterval: number;
  } {
    return {
      type: 'websocket',
      port: this.wsConfig.port,
      host: this.wsConfig.host,
      connections: this.connections.size,
      maxConnections: this.wsConfig.maxConnections,
      pingInterval: this.wsConfig.pingInterval
    };
  }

  /**
   * Get connection details
   */
  getConnections(): Array<{
    id: string;
    lastSeen: Date;
    lastPing?: Date;
    userAgent?: string;
    remoteAddress?: string;
    authenticated: boolean;
    clientInfo?: { name: string; version: string };
    readyState: number;
  }> {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      lastSeen: conn.lastSeen,
      lastPing: conn.lastPing,
      userAgent: conn.userAgent,
      remoteAddress: conn.remoteAddress,
      authenticated: conn.authenticated,
      clientInfo: conn.clientInfo,
      readyState: conn.ws.readyState
    }));
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): WSConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if connection is authenticated
   */
  isConnectionAuthenticated(connectionId: string): boolean {
    return this.connections.get(connectionId)?.authenticated ?? false;
  }

  /**
   * Set connection authentication status
   */
  setConnectionAuthenticated(connectionId: string, authenticated: boolean): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.authenticated = authenticated;
    }
  }
}