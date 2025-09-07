/**
 * Message Handler for Enhanced MCP Protocol
 * Orchestrates request/response processing with all enhanced features
 */

import { EventEmitter } from 'events';
import { MCPProtocol, MCPResource } from './MCPProtocol.js';
import { TransportManager } from './TransportManager.js';
import { EventSystem, BrowserEvent } from './EventSystem.js';
import { StreamingManager } from '../streaming/StreamingManager.js';
import { ProgressReporter } from '../streaming/ProgressReporter.js';
import { BrowserResourceManager } from '../resources/BrowserResource.js';
import { PageResourceManager } from '../resources/PageResource.js';
import { SessionResourceManager } from '../resources/SessionResource.js';
import { ResponseCache } from '../cache/ResponseCache.js';
import { SessionCache } from '../cache/SessionCache.js';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPNotification,
  MCPToolResult,
  BrowserSession,
  SessionStats
} from '../types.js';

export interface MessageHandlerConfig {
  enableCaching: boolean;
  enableStreaming: boolean;
  enableEvents: boolean;
  enableResources: boolean;
  maxConcurrentOperations: number;
  operationTimeout: number;
  cacheConfig?: {
    responseCache: boolean;
    sessionCache: boolean;
  };
}

export class MessageHandler extends EventEmitter {
  private protocol: MCPProtocol;
  private transportManager: TransportManager;
  private eventSystem: EventSystem;
  private streamingManager: StreamingManager;
  
  // Resource managers
  private browserResourceManager: BrowserResourceManager;
  private pageResourceManager: PageResourceManager;
  private sessionResourceManager: SessionResourceManager;
  
  // Cache layers
  private responseCache: ResponseCache;
  private sessionCache: SessionCache;
  
  private config: MessageHandlerConfig;
  private activeOperations = new Map<string, ProgressReporter>();

  constructor(config: Partial<MessageHandlerConfig> = {}) {
    super();
    
    this.config = {
      enableCaching: config.enableCaching !== false,
      enableStreaming: config.enableStreaming !== false,
      enableEvents: config.enableEvents !== false,
      enableResources: config.enableResources !== false,
      maxConcurrentOperations: config.maxConcurrentOperations || 50,
      operationTimeout: config.operationTimeout || 300000, // 5 minutes
      cacheConfig: {
        responseCache: config.cacheConfig?.responseCache !== false,
        sessionCache: config.cacheConfig?.sessionCache !== false
      }
    };

    this.initializeComponents();
    this.setupEventHandlers();
  }

  /**
   * Initialize all components
   */
  private initializeComponents(): void {
    // Core protocol and transport
    this.protocol = new MCPProtocol();
    this.transportManager = new TransportManager();
    
    // Enhanced features
    if (this.config.enableEvents) {
      this.eventSystem = new EventSystem();
    }
    
    if (this.config.enableStreaming) {
      this.streamingManager = new StreamingManager();
    }
    
    if (this.config.enableResources) {
      this.browserResourceManager = new BrowserResourceManager();
      this.pageResourceManager = new PageResourceManager();
      this.sessionResourceManager = new SessionResourceManager();
    }
    
    if (this.config.enableCaching) {
      if (this.config.cacheConfig.responseCache) {
        this.responseCache = new ResponseCache();
      }
      if (this.config.cacheConfig.sessionCache) {
        this.sessionCache = new SessionCache();
      }
    }
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Protocol events
    this.protocol.on('tool_call', this.handleToolCall.bind(this));
    this.protocol.on('resource_read', this.handleResourceRead.bind(this));
    this.protocol.on('resource_subscribe', this.handleResourceSubscribe.bind(this));
    this.protocol.on('resource_unsubscribe', this.handleResourceUnsubscribe.bind(this));
    this.protocol.on('prompt_get', this.handlePromptGet.bind(this));

    // Transport events
    this.transportManager.on('message', this.handleIncomingMessage.bind(this));
    this.transportManager.on('transport_connected', this.handleTransportConnected.bind(this));
    this.transportManager.on('transport_disconnected', this.handleTransportDisconnected.bind(this));

    // Event system events
    if (this.eventSystem) {
      this.eventSystem.on('event', this.handleBrowserEvent.bind(this));
    }

    // Streaming events
    if (this.streamingManager) {
      this.streamingManager.on('progress_updated', this.handleProgressUpdate.bind(this));
      this.streamingManager.on('operation_completed', this.handleOperationComplete.bind(this));
      this.streamingManager.on('operation_failed', this.handleOperationFailed.bind(this));
    }

    // Resource events
    if (this.browserResourceManager) {
      this.browserResourceManager.on('resource_added', this.handleResourceAdded.bind(this));
      this.browserResourceManager.on('resource_updated', this.handleResourceUpdated.bind(this));
      this.browserResourceManager.on('resource_removed', this.handleResourceRemoved.bind(this));
    }

    if (this.pageResourceManager) {
      this.pageResourceManager.on('resource_added', this.handleResourceAdded.bind(this));
      this.pageResourceManager.on('resource_updated', this.handleResourceUpdated.bind(this));
      this.pageResourceManager.on('resource_removed', this.handleResourceRemoved.bind(this));
    }
  }

  /**
   * Start message handler
   */
  async start(): Promise<void> {
    await this.transportManager.startAll();
    
    // Register default resources if enabled
    if (this.config.enableResources) {
      this.registerDefaultResources();
    }

    this.emit('started');
  }

  /**
   * Stop message handler
   */
  async stop(): Promise<void> {
    await this.transportManager.stopAll();
    
    // Cleanup components
    if (this.streamingManager) {
      this.streamingManager.destroy();
    }
    
    if (this.eventSystem) {
      this.eventSystem.destroy();
    }
    
    if (this.responseCache) {
      this.responseCache.destroy();
    }
    
    if (this.sessionCache) {
      this.sessionCache.destroy();
    }

    this.emit('stopped');
  }

  /**
   * Register tools with the protocol
   */
  registerTools(tools: any[]): void {
    this.protocol.registerTools(tools);
  }

  /**
   * Register browser session as resource
   */
  registerBrowserSession(session: BrowserSession): void {
    if (this.browserResourceManager) {
      this.browserResourceManager.registerBrowserSession(session);
    }
  }

  /**
   * Handle incoming message from transport
   */
  private async handleIncomingMessage(
    message: MCPRequest | MCPNotification,
    transportId: string
  ): Promise<void> {
    try {
      if ('id' in message) {
        // Request - handle and send response
        const response = await this.protocol.handleRequest(message as MCPRequest);
        await this.transportManager.sendViaTransport(transportId, response);
      } else {
        // Notification - handle without response
        await this.protocol.handleNotification(message as MCPNotification);
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
      
      // Send error response for requests
      if ('id' in message) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: 'Internal error'
          }
        };
        
        await this.transportManager.sendViaTransport(transportId, errorResponse);
      }
    }
  }

  /**
   * Handle tool call with enhanced features
   */
  private async handleToolCall(params: {
    name: string;
    arguments: Record<string, unknown>;
    resolve: (result: MCPToolResult) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    const { name, arguments: args, resolve, reject } = params;
    
    try {
      // Check cache first if enabled
      let cachedResult: MCPToolResult | null = null;
      
      if (this.responseCache && this.responseCache.isCacheableOperation(name, args)) {
        const cacheKey = this.responseCache.generateKey(name, args);
        cachedResult = this.responseCache.get(cacheKey);
        
        if (cachedResult) {
          resolve(cachedResult);
          return;
        }
      }

      // Start streaming operation if enabled
      let operationId: string | undefined;
      let progressReporter: ProgressReporter | undefined;
      
      if (this.streamingManager && this.shouldUseStreaming(name)) {
        operationId = this.streamingManager.startOperation(
          params.resolve.toString(), // Use function reference as ID
          this.getOperationType(name)
        );
        
        // Create progress reporter for complex operations
        if (this.shouldUseDetailedProgress(name)) {
          const stages = this.createProgressStages(name);
          progressReporter = new ProgressReporter(operationId, stages);
          this.activeOperations.set(operationId, progressReporter);
        }
      }

      // Execute the actual tool
      const result = await this.executeTool(name, args, progressReporter);

      // Cache result if enabled
      if (this.responseCache && this.responseCache.isCacheableOperation(name, args)) {
        const cacheKey = this.responseCache.generateKey(name, args);
        const ttl = this.responseCache.getOptimalTtl(name, args);
        this.responseCache.set(cacheKey, result, ttl, [name]);
      }

      // Complete streaming operation
      if (operationId) {
        this.streamingManager.completeOperation(operationId, result);
        this.activeOperations.delete(operationId);
      }

      resolve(result);

    } catch (error) {
      // Fail streaming operation
      if (operationId) {
        this.streamingManager.failOperation(operationId, error as Error);
        this.activeOperations.delete(operationId);
      }

      reject(error as Error);
    }
  }

  /**
   * Execute tool with enhanced features
   */
  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    progressReporter?: ProgressReporter
  ): Promise<MCPToolResult> {
    // This would delegate to the actual tool implementations
    // For now, emit event to be handled by the server
    return new Promise((resolve, reject) => {
      this.emit('execute_tool', { toolName, args, progressReporter, resolve, reject });
    });
  }

  /**
   * Handle resource read request
   */
  private async handleResourceRead(params: {
    uri: string;
    resource: MCPResource;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    const { uri, resolve, reject } = params;
    
    try {
      let result = null;
      
      // Route to appropriate resource manager
      if (uri.startsWith('browser://')) {
        const sessionId = this.extractSessionId(uri);
        result = await this.browserResourceManager?.readBrowserResource(sessionId);
      } else if (uri.startsWith('page://')) {
        const pageId = this.extractPageId(uri);
        result = await this.pageResourceManager?.readPageResource(pageId);
      } else if (uri.startsWith('session://')) {
        const snapshotId = this.extractSnapshotId(uri);
        result = await this.sessionResourceManager?.readSessionResource(snapshotId);
      }
      
      if (result) {
        resolve({
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2)
          }]
        });
      } else {
        reject(new Error(`Resource not found: ${uri}`));
      }
    } catch (error) {
      reject(error as Error);
    }
  }

  /**
   * Handle resource subscription
   */
  private handleResourceSubscribe(uri: string): void {
    // Subscribe to resource updates
    if (this.eventSystem) {
      this.eventSystem.subscribe(
        { 
          types: ['resource'],
          tags: [uri]
        },
        (event: BrowserEvent) => {
          const notification: MCPNotification = {
            jsonrpc: '2.0',
            method: 'notifications/resources/updated',
            params: {
              uri,
              timestamp: event.timestamp.toISOString(),
              data: event.data
            }
          };
          
          this.transportManager.broadcast(notification);
        }
      );
    }
  }

  /**
   * Handle resource unsubscription
   */
  private handleResourceUnsubscribe(uri: string): void {
    // Unsubscribe from resource updates
    // Implementation depends on event system subscription management
  }

  /**
   * Handle prompt get request
   */
  private async handlePromptGet(params: {
    name: string;
    arguments: Record<string, unknown>;
    prompt: any;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    const { name, arguments: args, resolve, reject } = params;
    
    try {
      // Generate prompt content based on name and arguments
      const messages = await this.generatePromptMessages(name, args);
      
      resolve({
        description: `Generated prompt for ${name}`,
        messages
      });
    } catch (error) {
      reject(error as Error);
    }
  }

  /**
   * Handle browser events
   */
  private handleBrowserEvent(event: BrowserEvent): void {
    // Broadcast event as MCP notification
    const notification = this.eventSystem.createMCPNotification(event);
    this.transportManager.broadcast(notification);
  }

  /**
   * Handle progress updates
   */
  private handleProgressUpdate(operation: any, response: any): void {
    const notification = this.streamingManager.createProgressNotification(operation.id);
    if (notification) {
      this.transportManager.broadcast(notification);
    }
  }

  /**
   * Handle operation completion
   */
  private handleOperationComplete(operation: any, response: any): void {
    const notification = this.streamingManager.createStreamingNotification(operation.id, response);
    if (notification) {
      this.transportManager.broadcast(notification);
    }
  }

  /**
   * Handle operation failure
   */
  private handleOperationFailed(operation: any, response: any): void {
    const notification = this.streamingManager.createStreamingNotification(operation.id, response);
    if (notification) {
      this.transportManager.broadcast(notification);
    }
  }

  /**
   * Handle transport connection
   */
  private handleTransportConnected(transportId: string): void {
    console.log(`Transport connected: ${transportId}`);
    
    // Send welcome notification
    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method: 'notifications/transport/connected',
      params: {
        transportId,
        timestamp: new Date().toISOString()
      }
    };
    
    this.transportManager.sendViaTransport(transportId, notification);
  }

  /**
   * Handle transport disconnection
   */
  private handleTransportDisconnected(transportId: string): void {
    console.log(`Transport disconnected: ${transportId}`);
    
    // Cancel operations for this transport
    if (this.streamingManager) {
      this.streamingManager.cancelOperationsByTransport(transportId);
    }
    
    // Remove event subscriptions for this transport
    if (this.eventSystem) {
      this.eventSystem.removeSubscriptionsByTransport(transportId);
    }
  }

  /**
   * Handle resource added
   */
  private handleResourceAdded(resource: MCPResource): void {
    this.protocol.registerResource(resource);
    
    // Publish event
    if (this.eventSystem) {
      this.eventSystem.publishEvent({
        type: 'resource',
        category: 'resource_added',
        source: {},
        data: { resource },
        severity: 'info',
        tags: ['resource', 'added']
      });
    }
  }

  /**
   * Handle resource updated
   */
  private handleResourceUpdated(resource: MCPResource): void {
    // Send resource update notification
    this.protocol.sendResourceUpdate(resource.uri, resource);
    
    // Publish event
    if (this.eventSystem) {
      this.eventSystem.publishEvent({
        type: 'resource',
        category: 'resource_updated',
        source: {},
        data: { resource },
        severity: 'info',
        tags: ['resource', 'updated']
      });
    }
  }

  /**
   * Handle resource removed
   */
  private handleResourceRemoved(resource: MCPResource): void {
    // Send resource update notification (null indicates removal)
    this.protocol.sendResourceUpdate(resource.uri);
    
    // Publish event
    if (this.eventSystem) {
      this.eventSystem.publishEvent({
        type: 'resource',
        category: 'resource_removed',
        source: {},
        data: { resource },
        severity: 'info',
        tags: ['resource', 'removed']
      });
    }
  }

  /**
   * Register default resources
   */
  private registerDefaultResources(): void {
    // Register system resources
    const systemResource: MCPResource = {
      uri: 'system://stats',
      name: 'System Statistics',
      description: 'Server performance and usage statistics',
      mimeType: 'application/json'
    };
    
    this.protocol.registerResource(systemResource);
    
    const configResource: MCPResource = {
      uri: 'system://config',
      name: 'Server Configuration',
      description: 'Current server configuration and capabilities',
      mimeType: 'application/json'
    };
    
    this.protocol.registerResource(configResource);
  }

  /**
   * Utility methods
   */
  private shouldUseStreaming(toolName: string): boolean {
    const streamingOperations = new Set([
      'page_screenshot',
      'page_goto',
      'page_content',
      'browser_launch_chromium',
      'browser_launch_firefox',
      'browser_launch_webkit'
    ]);
    
    return streamingOperations.has(toolName);
  }

  private shouldUseDetailedProgress(toolName: string): boolean {
    const detailedProgressOperations = new Set([
      'page_screenshot',
      'page_goto',
      'page_content'
    ]);
    
    return detailedProgressOperations.has(toolName);
  }

  private getOperationType(toolName: string): 'screenshot' | 'navigation' | 'extraction' | 'automation' | 'custom' {
    if (toolName.includes('screenshot')) return 'screenshot';
    if (toolName.includes('goto')) return 'navigation';
    if (toolName.includes('content')) return 'extraction';
    if (toolName.includes('launch')) return 'automation';
    return 'custom';
  }

  private createProgressStages(toolName: string): any[] {
    switch (this.getOperationType(toolName)) {
      case 'screenshot':
        return ProgressReporter.createScreenshotStages();
      case 'navigation':
        return ProgressReporter.createNavigationStages();
      case 'extraction':
        return ProgressReporter.createExtractionStages();
      default:
        return [];
    }
  }

  private extractSessionId(uri: string): string {
    return uri.split('/').pop() || '';
  }

  private extractPageId(uri: string): string {
    return uri.split('/').pop() || '';
  }

  private extractSnapshotId(uri: string): string {
    return uri.split('/').pop() || '';
  }

  private async generatePromptMessages(
    name: string, 
    args: Record<string, unknown>
  ): Promise<Array<{ role: string; content: { type: string; text: string } }>> {
    // Generate contextual prompt messages based on template name and arguments
    const templates: Record<string, (args: Record<string, unknown>) => string> = {
      automation_workflows: (args) => `Create an automation workflow for ${args.workflow_type} on ${args.target_url || 'the specified URL'}`,
      testing_patterns: (args) => `Generate ${args.test_type} test patterns for ${args.page_url || 'the target page'}`,
      scraping_templates: (args) => `Create data extraction template for ${args.data_type} from ${args.source_url}`,
      performance_audits: (args) => `Generate ${args.audit_type} performance audit for ${args.target_url}`
    };

    const template = templates[name];
    const content = template ? template(args) : `Generate content for ${name}`;

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: content
        }
      }
    ];
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): {
    protocol: any;
    transport: any;
    events?: any;
    streaming?: any;
    resources?: any;
    cache?: any;
  } {
    const stats: any = {
      protocol: this.protocol.getStats(),
      transport: this.transportManager.getOverallStats()
    };

    if (this.eventSystem) {
      stats.events = this.eventSystem.getEventStats();
    }

    if (this.streamingManager) {
      stats.streaming = this.streamingManager.getStats();
    }

    if (this.browserResourceManager) {
      stats.resources = {
        browser: this.browserResourceManager.getOverallStats(),
        page: this.pageResourceManager?.getOverallStats(),
        session: this.sessionResourceManager?.getOverallStats()
      };
    }

    if (this.responseCache || this.sessionCache) {
      stats.cache = {
        response: this.responseCache?.getStats(),
        session: this.sessionCache?.getStats()
      };
    }

    return stats;
  }
}