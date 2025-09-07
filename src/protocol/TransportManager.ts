/**
 * Multi-Transport Manager for MCP Server
 * Manages STDIO, SSE, and WebSocket transports
 */

import { EventEmitter } from 'events';
import { MCPRequest, MCPResponse, MCPNotification } from '../types.js';

export interface TransportCapabilities {
  supportsStreaming: boolean;
  supportsBidirectional: boolean;
  supportsMultipleClients: boolean;
  maxMessageSize: number;
  keepAlive: boolean;
}

export interface TransportStats {
  messagesReceived: number;
  messagesSent: number;
  errors: number;
  connectionTime: Date;
  lastActivity: Date;
  bytesReceived: number;
  bytesSent: number;
}

export interface TransportConfig {
  maxMessageSize?: number;
  timeout?: number;
  keepAliveInterval?: number;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export abstract class Transport extends EventEmitter {
  protected config: Required<TransportConfig>;
  protected stats: TransportStats;
  protected connected = false;
  protected heartbeatTimer?: NodeJS.Timeout;
  protected keepAliveTimer?: NodeJS.Timeout;

  constructor(config: TransportConfig = {}) {
    super();
    
    this.config = {
      maxMessageSize: config.maxMessageSize ?? 10 * 1024 * 1024, // 10MB
      timeout: config.timeout ?? 30000,
      keepAliveInterval: config.keepAliveInterval ?? 60000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
      reconnectDelay: config.reconnectDelay ?? 5000
    };
    
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      connectionTime: new Date(),
      lastActivity: new Date(),
      bytesReceived: 0,
      bytesSent: 0
    };
  }

  abstract get capabilities(): TransportCapabilities;
  abstract send(message: MCPResponse | MCPNotification): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  protected setupHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.sendHeartbeat();
      }
    }, this.config.heartbeatInterval);
  }

  protected setupKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    this.keepAliveTimer = setInterval(() => {
      if (this.connected) {
        this.sendKeepAlive();
      }
    }, this.config.keepAliveInterval);
  }

  protected sendHeartbeat(): void {
    const heartbeat: MCPNotification = {
      jsonrpc: '2.0',
      method: 'ping',
      params: { timestamp: Date.now() }
    };
    
    this.send(heartbeat).catch(error => {
      console.error('Heartbeat failed:', error);
    });
  }

  protected sendKeepAlive(): void {
    // Transport-specific keep-alive implementation
    this.emit('keepalive');
  }

  protected updateStats(type: 'received' | 'sent', bytes: number): void {
    if (type === 'received') {
      this.stats.messagesReceived++;
      this.stats.bytesReceived += bytes;
    } else {
      this.stats.messagesSent++;
      this.stats.bytesSent += bytes;
    }
    this.stats.lastActivity = new Date();
  }

  protected handleError(error: Error): void {
    this.stats.errors++;
    this.emit('error', error);
  }

  getStats(): TransportStats {
    return { ...this.stats };
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Transport Manager - Orchestrates multiple transport types
 */
export class TransportManager extends EventEmitter {
  private transports = new Map<string, Transport>();
  private primaryTransport?: Transport;
  private messageBuffer: (MCPResponse | MCPNotification)[] = [];
  private bufferSize = 100;

  constructor() {
    super();
  }

  /**
   * Register a transport
   */
  registerTransport(name: string, transport: Transport, isPrimary = false): void {
    if (this.transports.has(name)) {
      throw new Error(`Transport '${name}' already registered`);
    }

    this.transports.set(name, transport);
    
    if (isPrimary || !this.primaryTransport) {
      this.primaryTransport = transport;
    }

    // Setup transport event handlers
    transport.on('message', (message: MCPRequest | MCPNotification) => {
      this.emit('message', message, name);
    });

    transport.on('connect', () => {
      this.emit('transport_connected', name);
    });

    transport.on('disconnect', () => {
      this.emit('transport_disconnected', name);
      this.handleTransportDisconnect(name);
    });

    transport.on('error', (error: Error) => {
      this.emit('transport_error', { transport: name, error });
    });
  }

  /**
   * Start all transports
   */
  async startAll(): Promise<void> {
    const startPromises = Array.from(this.transports.entries()).map(
      async ([name, transport]) => {
        try {
          await transport.start();
          console.log(`Transport '${name}' started successfully`);
        } catch (error) {
          console.error(`Failed to start transport '${name}':`, error);
          throw error;
        }
      }
    );

    await Promise.all(startPromises);
  }

  /**
   * Stop all transports
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.transports.values()).map(
      transport => transport.stop()
    );

    await Promise.all(stopPromises);
  }

  /**
   * Send message via primary transport
   */
  async send(message: MCPResponse | MCPNotification): Promise<void> {
    if (!this.primaryTransport) {
      throw new Error('No primary transport available');
    }

    await this.primaryTransport.send(message);
    this.bufferMessage(message);
  }

  /**
   * Broadcast message to all connected transports
   */
  async broadcast(message: MCPResponse | MCPNotification): Promise<void> {
    const sendPromises = Array.from(this.transports.values())
      .filter(transport => transport.isConnected())
      .map(transport => 
        transport.send(message).catch(error => 
          console.error('Broadcast failed for transport:', error)
        )
      );

    await Promise.allSettled(sendPromises);
    this.bufferMessage(message);
  }

  /**
   * Send message via specific transport
   */
  async sendViaTransport(transportName: string, message: MCPResponse | MCPNotification): Promise<void> {
    const transport = this.transports.get(transportName);
    if (!transport) {
      throw new Error(`Transport '${transportName}' not found`);
    }

    if (!transport.isConnected()) {
      throw new Error(`Transport '${transportName}' not connected`);
    }

    await transport.send(message);
  }

  /**
   * Get transport statistics
   */
  getTransportStats(): Record<string, TransportStats & { capabilities: TransportCapabilities }> {
    const stats: Record<string, TransportStats & { capabilities: TransportCapabilities }> = {};
    
    for (const [name, transport] of this.transports) {
      stats[name] = {
        ...transport.getStats(),
        capabilities: transport.capabilities
      };
    }
    
    return stats;
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalTransports: number;
    connectedTransports: number;
    totalMessagesReceived: number;
    totalMessagesSent: number;
    totalErrors: number;
    bufferedMessages: number;
  } {
    const stats = Object.values(this.getTransportStats());
    
    return {
      totalTransports: stats.length,
      connectedTransports: stats.filter(s => s.connectionTime).length,
      totalMessagesReceived: stats.reduce((sum, s) => sum + s.messagesReceived, 0),
      totalMessagesSent: stats.reduce((sum, s) => sum + s.messagesSent, 0),
      totalErrors: stats.reduce((sum, s) => sum + s.errors, 0),
      bufferedMessages: this.messageBuffer.length
    };
  }

  /**
   * Handle transport disconnection
   */
  private handleTransportDisconnect(transportName: string): void {
    const transport = this.transports.get(transportName);
    if (transport === this.primaryTransport) {
      // Find next available transport as primary
      this.primaryTransport = Array.from(this.transports.values())
        .find(t => t !== transport && t.isConnected());
      
      if (this.primaryTransport) {
        console.log(`Switched primary transport to: ${this.getTransportName(this.primaryTransport)}`);
      } else {
        console.warn('No available primary transport');
      }
    }
  }

  /**
   * Get transport name by instance
   */
  private getTransportName(transport: Transport): string {
    for (const [name, t] of this.transports) {
      if (t === transport) return name;
    }
    return 'unknown';
  }

  /**
   * Buffer message for replay on reconnect
   */
  private bufferMessage(message: MCPResponse | MCPNotification): void {
    this.messageBuffer.push(message);
    
    // Keep buffer size manageable
    if (this.messageBuffer.length > this.bufferSize) {
      this.messageBuffer = this.messageBuffer.slice(-this.bufferSize);
    }
  }

  /**
   * Get buffered messages
   */
  getBufferedMessages(): (MCPResponse | MCPNotification)[] {
    return [...this.messageBuffer];
  }

  /**
   * Clear message buffer
   */
  clearBuffer(): void {
    this.messageBuffer = [];
  }

  /**
   * Get available transports
   */
  getAvailableTransports(): string[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Get connected transports
   */
  getConnectedTransports(): string[] {
    return Array.from(this.transports.entries())
      .filter(([, transport]) => transport.isConnected())
      .map(([name]) => name);
  }

  /**
   * Check if any transport is connected
   */
  hasConnectedTransport(): boolean {
    return Array.from(this.transports.values()).some(transport => transport.isConnected());
  }

  /**
   * Get primary transport name
   */
  getPrimaryTransportName(): string | undefined {
    if (!this.primaryTransport) return undefined;
    return this.getTransportName(this.primaryTransport);
  }
}