/**
 * STDIO Transport Implementation for ChatGPT Desktop Integration
 * Handles JSON-RPC over stdin/stdout with process lifecycle management
 */

import { Transport, TransportCapabilities } from '../protocol/TransportManager.js';
import { MCPRequest, MCPResponse, MCPNotification } from '../types.js';

export class StdioTransport extends Transport {
  private messageQueue: string[] = [];
  private processing = false;

  get capabilities(): TransportCapabilities {
    return {
      supportsStreaming: false,
      supportsBidirectional: true,
      supportsMultipleClients: false,
      maxMessageSize: this.config.maxMessageSize,
      keepAlive: false
    };
  }

  async start(): Promise<void> {
    if (this.connected) {
      throw new Error('STDIO transport already started');
    }

    // Set up stdin handling
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this.handleStdinData.bind(this));
    process.stdin.on('end', this.handleStdinEnd.bind(this));
    process.stdin.on('error', this.handleError.bind(this));

    // Set up process signal handlers
    process.on('SIGINT', this.handleShutdown.bind(this));
    process.on('SIGTERM', this.handleShutdown.bind(this));
    process.on('SIGQUIT', this.handleShutdown.bind(this));

    // Handle uncaught exceptions gracefully
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in STDIO transport:', error);
      this.handleError(error);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection in STDIO transport:', reason);
      this.handleError(new Error(`Unhandled rejection: ${reason}`));
    });

    this.connected = true;
    this.stats.connectionTime = new Date();

    // Log to stderr (stdout is reserved for MCP messages)
    console.error('STDIO MCP Transport started - listening on stdin');
    this.emit('connect');
  }

  async stop(): Promise<void> {
    if (!this.connected) return;

    this.connected = false;

    // Clean up timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    // Process any remaining queued messages
    await this.processMessageQueue();

    console.error('STDIO MCP Transport stopped');
    this.emit('disconnect');
  }

  async send(message: MCPResponse | MCPNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('STDIO transport not connected');
    }

    try {
      const messageStr = JSON.stringify(message);
      
      // Check message size
      const messageBytes = Buffer.byteLength(messageStr, 'utf8');
      if (messageBytes > this.config.maxMessageSize) {
        throw new Error(`Message too large: ${messageBytes} bytes (max: ${this.config.maxMessageSize})`);
      }

      // Send via stdout with newline delimiter
      process.stdout.write(messageStr + '\n');
      
      this.updateStats('sent', messageBytes);
      this.emit('message_sent', message);
      
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Handle incoming stdin data
   */
  private handleStdinData(data: string): void {
    try {
      // Add to message queue for processing
      const lines = data.toString().trim().split('\n');
      this.messageQueue.push(...lines.filter(line => line.trim()));
      
      // Process messages asynchronously
      this.processMessageQueue().catch(error => {
        this.handleError(error);
      });
      
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Process queued messages
   */
  private async processMessageQueue(): Promise<void> {
    if (this.processing || this.messageQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.messageQueue.length > 0) {
        const messageStr = this.messageQueue.shift();
        if (!messageStr) continue;

        await this.processMessage(messageStr);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(messageStr: string): Promise<void> {
    try {
      const messageBytes = Buffer.byteLength(messageStr, 'utf8');
      
      // Check message size
      if (messageBytes > this.config.maxMessageSize) {
        throw new Error(`Received message too large: ${messageBytes} bytes`);
      }

      // Parse JSON-RPC message
      const message = JSON.parse(messageStr);
      
      // Validate basic JSON-RPC structure
      if (!this.isValidJSONRPC(message)) {
        throw new Error('Invalid JSON-RPC message format');
      }

      this.updateStats('received', messageBytes);
      
      // Emit parsed message
      this.emit('message', message);
      
    } catch (error) {
      console.error('Failed to process message:', messageStr, error);
      
      // Send parse error response if message has an ID
      try {
        const partialMessage = JSON.parse(messageStr);
        if (partialMessage.id !== undefined) {
          const errorResponse: MCPResponse = {
            jsonrpc: '2.0',
            id: partialMessage.id,
            error: {
              code: -32700,
              message: 'Parse error',
              data: { originalMessage: messageStr }
            }
          };
          await this.send(errorResponse);
        }
      } catch {
        // If we can't even parse for an ID, just log the error
        this.handleError(error as Error);
      }
    }
  }

  /**
   * Validate JSON-RPC message structure
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
   * Handle stdin end (client disconnected)
   */
  private handleStdinEnd(): void {
    console.error('stdin ended - client disconnected');
    this.connected = false;
    this.emit('disconnect');
  }

  /**
   * Handle process shutdown signals
   */
  private handleShutdown(signal: string): void {
    console.error(`Received ${signal} - shutting down STDIO transport`);
    
    this.stop().then(() => {
      process.exit(0);
    }).catch(error => {
      console.error('Error during shutdown:', error);
      process.exit(1);
    });
  }

  /**
   * Get transport-specific information
   */
  getTransportInfo(): {
    type: 'stdio';
    processId: number;
    platform: NodeJS.Platform;
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  } {
    return {
      type: 'stdio',
      processId: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Check if stdin is in TTY mode (interactive)
   */
  isInteractive(): boolean {
    return process.stdin.isTTY ?? false;
  }

  /**
   * Get stdin/stdout status
   */
  getStreamStatus(): {
    stdin: {
      readable: boolean;
      readableEnded: boolean;
      readableFlowing: boolean | null;
    };
    stdout: {
      writable: boolean;
      writableEnded: boolean;
      writableFinished: boolean;
    };
    stderr: {
      writable: boolean;
      writableEnded: boolean;
      writableFinished: boolean;
    };
  } {
    return {
      stdin: {
        readable: process.stdin.readable,
        readableEnded: process.stdin.readableEnded,
        readableFlowing: process.stdin.readableFlowing
      },
      stdout: {
        writable: process.stdout.writable,
        writableEnded: process.stdout.writableEnded,
        writableFinished: process.stdout.writableFinished
      },
      stderr: {
        writable: process.stderr.writable,
        writableEnded: process.stderr.writableEnded,
        writableFinished: process.stderr.writableFinished
      }
    };
  }

  /**
   * Handle backpressure from stdout
   */
  private async handleBackpressure(): Promise<void> {
    return new Promise((resolve) => {
      if (process.stdout.writableNeedDrain) {
        process.stdout.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Send with backpressure handling
   */
  async sendWithBackpressure(message: MCPResponse | MCPNotification): Promise<void> {
    await this.handleBackpressure();
    await this.send(message);
  }

  /**
   * Flush any pending writes
   */
  async flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      process.stdout.write('', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}