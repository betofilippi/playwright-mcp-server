/**
 * Enhanced MCP Protocol Handler v2024-11-05
 * Implements full MCP specification with advanced features
 */

import { EventEmitter } from 'events';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPNotification, 
  MCPError,
  MCPTool,
  MCPToolResult,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ClientCapabilities,
  MCPServerError,
  MCP_ERROR_CODES 
} from '../types.js';

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPBatchRequest {
  jsonrpc: '2.0';
  requests: MCPRequest[];
}

export interface MCPBatchResponse {
  jsonrpc: '2.0';
  responses: MCPResponse[];
}

export interface MCPProgressNotification {
  jsonrpc: '2.0';
  method: 'notifications/progress';
  params: {
    progressToken: string | number;
    progress: {
      total?: number;
      completed: number;
    };
  };
}

export interface MCPCancelRequest extends MCPRequest {
  method: 'cancelled';
  params: {
    requestId: string | number;
    reason?: string;
  };
}

/**
 * Enhanced MCP Protocol Handler
 */
export class MCPProtocol extends EventEmitter {
  private initialized = false;
  private protocolVersion = '2024-11-05';
  private serverInfo = {
    name: 'playwright-mcp-server',
    version: '1.0.0'
  };
  
  private capabilities: ServerCapabilities = {
    tools: { listChanged: true },
    resources: { 
      subscribe: true, 
      listChanged: true 
    },
    prompts: { listChanged: true },
    logging: {}
  };
  
  private clientCapabilities?: ClientCapabilities;
  
  // Request tracking for cancellation and timeout
  private activeRequests = new Map<string | number, {
    timestamp: Date;
    timeoutId?: NodeJS.Timeout;
    cancelled?: boolean;
  }>();
  
  // Progress tracking
  private progressTrackers = new Map<string | number, {
    total?: number;
    completed: number;
  }>();
  
  // Resource and prompt registries
  private resources = new Map<string, MCPResource>();
  private prompts = new Map<string, MCPPrompt>();
  private tools = new Map<string, MCPTool>();
  
  constructor() {
    super();
    this.setupDefaultPrompts();
  }
  
  /**
   * Initialize the protocol with client capabilities
   */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    // Validate protocol version
    if (params.protocolVersion !== this.protocolVersion) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Unsupported protocol version. Expected ${this.protocolVersion}, got ${params.protocolVersion}`
      );
    }
    
    this.clientCapabilities = params.capabilities;
    this.initialized = true;
    
    this.emit('initialized', {
      clientInfo: params.clientInfo,
      capabilities: params.capabilities
    });
    
    return {
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      serverInfo: this.serverInfo
    };
  }
  
  /**
   * Handle incoming requests with enhanced features
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const requestId = request.id ?? this.generateId();
    
    // Track request for cancellation/timeout
    this.trackRequest(requestId);
    
    try {
      // Check if server is initialized (except for initialize request)
      if (!this.initialized && request.method !== 'initialize') {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_REQUEST,
          'Server not initialized'
        );
      }
      
      let result: unknown;
      
      switch (request.method) {
        case 'initialize':
          result = await this.initialize(request.params as InitializeParams);
          break;
          
        case 'tools/list':
          result = this.handleToolsList();
          break;
          
        case 'tools/call':
          result = await this.handleToolsCall(request.params as any);
          break;
          
        case 'resources/list':
          result = this.handleResourcesList();
          break;
          
        case 'resources/read':
          result = await this.handleResourcesRead(request.params as any);
          break;
          
        case 'resources/subscribe':
          result = await this.handleResourcesSubscribe(request.params as any);
          break;
          
        case 'resources/unsubscribe':
          result = await this.handleResourcesUnsubscribe(request.params as any);
          break;
          
        case 'prompts/list':
          result = this.handlePromptsList();
          break;
          
        case 'prompts/get':
          result = await this.handlePromptsGet(request.params as any);
          break;
          
        case 'logging/setLevel':
          result = this.handleLoggingSetLevel(request.params as any);
          break;
          
        case 'ping':
          result = { success: true, timestamp: Date.now() };
          break;
          
        case 'cancelled':
          result = await this.handleCancellation(request.params as any);
          break;
          
        default:
          throw new MCPServerError(
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Method '${request.method}' not found`
          );
      }
      
      this.untrackRequest(requestId);
      
      return {
        jsonrpc: '2.0',
        id: requestId,
        result
      };
      
    } catch (error) {
      this.untrackRequest(requestId);
      
      return {
        jsonrpc: '2.0',
        id: requestId,
        error: this.toMCPError(error)
      };
    }
  }
  
  /**
   * Handle batch requests
   */
  async handleBatchRequest(batch: MCPBatchRequest): Promise<MCPBatchResponse> {
    const responses = await Promise.all(
      batch.requests.map(request => this.handleRequest(request))
    );
    
    return {
      jsonrpc: '2.0',
      responses
    };
  }
  
  /**
   * Handle notifications
   */
  async handleNotification(notification: MCPNotification): Promise<void> {
    try {
      switch (notification.method) {
        case 'notifications/initialized':
          this.emit('client_initialized');
          break;
          
        case 'notifications/cancelled':
          await this.handleCancellation(notification.params as any);
          break;
          
        default:
          console.warn(`Unknown notification method: ${notification.method}`);
      }
    } catch (error) {
      console.error('Notification handling failed:', error);
    }
  }
  
  /**
   * Register a tool
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.emit('tools_changed');
  }
  
  /**
   * Register multiple tools
   */
  registerTools(tools: MCPTool[]): void {
    tools.forEach(tool => this.tools.set(tool.name, tool));
    this.emit('tools_changed');
  }
  
  /**
   * Register a resource
   */
  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
    this.emit('resources_changed');
  }
  
  /**
   * Register a prompt
   */
  registerPrompt(prompt: MCPPrompt): void {
    this.prompts.set(prompt.name, prompt);
    this.emit('prompts_changed');
  }
  
  /**
   * Send progress notification
   */
  sendProgress(progressToken: string | number, completed: number, total?: number): void {
    const progress = { completed, total };
    this.progressTrackers.set(progressToken, progress);
    
    const notification: MCPProgressNotification = {
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress
      }
    };
    
    this.emit('notification', notification);
  }
  
  /**
   * Send resource update notification
   */
  sendResourceUpdate(uri: string, resource?: MCPResource): void {
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/resources/updated',
      params: {
        uri,
        resource
      }
    };
    
    this.emit('notification', notification);
  }
  
  /**
   * Handle tools/list request
   */
  private handleToolsList(): { tools: MCPTool[] } {
    return {
      tools: Array.from(this.tools.values())
    };
  }
  
  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<MCPToolResult> {
    const { name, arguments: args = {} } = params;
    
    const tool = this.tools.get(name);
    if (!tool) {
      throw new MCPServerError(
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Tool '${name}' not found`
      );
    }
    
    // Emit tool call event to be handled by the server implementation
    return new Promise((resolve, reject) => {
      this.emit('tool_call', { name, arguments: args, resolve, reject });
    });
  }
  
  /**
   * Handle resources/list request
   */
  private handleResourcesList(): { resources: MCPResource[] } {
    return {
      resources: Array.from(this.resources.values())
    };
  }
  
  /**
   * Handle resources/read request
   */
  private async handleResourcesRead(params: {
    uri: string;
  }): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
    const { uri } = params;
    
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new MCPServerError(
        MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
        `Resource '${uri}' not found`
      );
    }
    
    // Emit resource read event to be handled by the server implementation
    return new Promise((resolve, reject) => {
      this.emit('resource_read', { uri, resource, resolve, reject });
    });
  }
  
  /**
   * Handle resources/subscribe request
   */
  private async handleResourcesSubscribe(params: {
    uri: string;
  }): Promise<{ success: boolean }> {
    const { uri } = params;
    
    this.emit('resource_subscribe', uri);
    return { success: true };
  }
  
  /**
   * Handle resources/unsubscribe request
   */
  private async handleResourcesUnsubscribe(params: {
    uri: string;
  }): Promise<{ success: boolean }> {
    const { uri } = params;
    
    this.emit('resource_unsubscribe', uri);
    return { success: true };
  }
  
  /**
   * Handle prompts/list request
   */
  private handlePromptsList(): { prompts: MCPPrompt[] } {
    return {
      prompts: Array.from(this.prompts.values())
    };
  }
  
  /**
   * Handle prompts/get request
   */
  private async handlePromptsGet(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{ description?: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    const { name, arguments: args = {} } = params;
    
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new MCPServerError(
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Prompt '${name}' not found`
      );
    }
    
    // Emit prompt get event to be handled by the server implementation
    return new Promise((resolve, reject) => {
      this.emit('prompt_get', { name, arguments: args, prompt, resolve, reject });
    });
  }
  
  /**
   * Handle logging/setLevel request
   */
  private handleLoggingSetLevel(params: {
    level: 'error' | 'warn' | 'info' | 'debug';
  }): { success: boolean } {
    const { level } = params;
    
    this.emit('logging_level_changed', level);
    return { success: true };
  }
  
  /**
   * Handle cancellation request
   */
  private async handleCancellation(params: {
    requestId: string | number;
    reason?: string;
  }): Promise<{ success: boolean }> {
    const { requestId, reason } = params;
    
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.cancelled = true;
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      this.emit('request_cancelled', { requestId, reason });
    }
    
    return { success: true };
  }
  
  /**
   * Setup default prompt templates
   */
  private setupDefaultPrompts(): void {
    this.registerPrompt({
      name: 'automation_workflows',
      description: 'Common browser automation workflow patterns',
      arguments: [
        { name: 'workflow_type', description: 'Type of automation workflow', required: true },
        { name: 'target_url', description: 'Target URL for automation', required: false }
      ]
    });
    
    this.registerPrompt({
      name: 'testing_patterns',
      description: 'End-to-end testing patterns and best practices',
      arguments: [
        { name: 'test_type', description: 'Type of test to generate', required: true },
        { name: 'page_url', description: 'URL of the page to test', required: false }
      ]
    });
    
    this.registerPrompt({
      name: 'scraping_templates',
      description: 'Data extraction and scraping templates',
      arguments: [
        { name: 'data_type', description: 'Type of data to extract', required: true },
        { name: 'source_url', description: 'Source URL for scraping', required: true }
      ]
    });
    
    this.registerPrompt({
      name: 'performance_audits',
      description: 'Performance testing and audit workflows',
      arguments: [
        { name: 'audit_type', description: 'Type of performance audit', required: true },
        { name: 'target_url', description: 'URL to audit', required: true }
      ]
    });
  }
  
  /**
   * Track active requests for cancellation and timeout
   */
  private trackRequest(id: string | number, timeout = 300000): void {
    const timeoutId = setTimeout(() => {
      this.emit('request_timeout', id);
      this.untrackRequest(id);
    }, timeout);
    
    this.activeRequests.set(id, {
      timestamp: new Date(),
      timeoutId
    });
  }
  
  /**
   * Untrack completed requests
   */
  private untrackRequest(id: string | number): void {
    const request = this.activeRequests.get(id);
    if (request?.timeoutId) {
      clearTimeout(request.timeoutId);
    }
    this.activeRequests.delete(id);
  }
  
  /**
   * Generate unique request ID
   */
  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Convert error to MCP error format
   */
  private toMCPError(error: unknown): MCPError {
    if (error instanceof MCPServerError) {
      return {
        code: error.code,
        message: error.message,
        data: error.data
      };
    }
    
    if (error instanceof Error) {
      return {
        code: MCP_ERROR_CODES.INTERNAL_ERROR,
        message: error.message,
        data: { stack: error.stack }
      };
    }
    
    return {
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: 'Unknown error occurred',
      data: { error }
    };
  }
  
  /**
   * Check if a request is cancelled
   */
  isRequestCancelled(id: string | number): boolean {
    return this.activeRequests.get(id)?.cancelled ?? false;
  }
  
  /**
   * Get server statistics
   */
  getStats(): {
    initialized: boolean;
    activeRequests: number;
    registeredTools: number;
    registeredResources: number;
    registeredPrompts: number;
  } {
    return {
      initialized: this.initialized,
      activeRequests: this.activeRequests.size,
      registeredTools: this.tools.size,
      registeredResources: this.resources.size,
      registeredPrompts: this.prompts.size
    };
  }
}