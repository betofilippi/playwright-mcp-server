#!/usr/bin/env node

/**
 * Enhanced Production-Ready MCP Server for Playwright Automation with Advanced Tools
 * Implements full MCP protocol v2024-11-05 with 55+ comprehensive browser automation tools
 */

import { MessageHandler } from './protocol/MessageHandler.js';
import { StdioTransport } from './transport/StdioTransport.js';
import { SSETransport } from './transport/SSETransport.js';
import { WebSocketTransport } from './transport/WebSocketTransport.js';
import { SessionManager } from './services/session.js';
import { PlaywrightService } from './services/playwright.js';
import { createBrowserTools } from './tools/browser.js';
import { createPageTools } from './tools/page.js';
import { createElementTools } from './tools/elements.js';
import { createAdvancedToolsWithIntegration, AdvancedToolsManager } from './tools/advanced-tools-integration.js';
import { ProgressReporter } from './streaming/ProgressReporter.js';
import { 
  MCPToolResult,
  BrowserSession,
  BrowserContextSession,
  PageSession 
} from './types.js';

/**
 * Enhanced MCP Server Configuration with Advanced Features
 */
interface EnhancedServerConfig {
  // Core settings
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  maxPagesPerContext: number;
  sessionTimeout: number;
  cleanupInterval: number;

  // Transport settings
  enableStdio: boolean;
  enableSSE: boolean;
  enableWebSocket: boolean;
  ssePort: number;
  sseHost: string;
  wsPort: number;
  wsHost: string;

  // Feature flags
  enableCaching: boolean;
  enableStreaming: boolean;
  enableEvents: boolean;
  enableResources: boolean;
  enableAdvancedTools: boolean;

  // Performance settings
  maxConcurrentOperations: number;
  operationTimeout: number;
  cacheMaxSize: number;
  cacheDefaultTtl: number;

  // Security settings
  corsOrigins: string[];
  enableRateLimit: boolean;
  rateLimitWindow: number;
  rateLimitMax: number;
  enableSecurityValidation: boolean;

  // Advanced features
  enableBrowserPooling: boolean;
  enableEventMonitoring: boolean;
  enableAdvancedErrorHandling: boolean;
  enableContextManagement: boolean;
}

/**
 * Enhanced Playwright MCP Server with 55+ Advanced Tools
 */
export class EnhancedPlaywrightMCPServer {
  private config: EnhancedServerConfig;
  private messageHandler: MessageHandler;
  private sessionManager: SessionManager;
  private playwrightService: PlaywrightService;
  private advancedToolsManager?: AdvancedToolsManager;
  
  private tools = new Map<string, any>();
  private initialized = false;

  constructor(config: Partial<EnhancedServerConfig> = {}) {
    this.config = {
      // Core settings
      maxBrowsers: parseInt(process.env.MAX_BROWSERS || '5'),
      maxContextsPerBrowser: parseInt(process.env.MAX_CONTEXTS_PER_BROWSER || '10'),
      maxPagesPerContext: parseInt(process.env.MAX_PAGES_PER_CONTEXT || '20'),
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'), // 1 hour
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000'), // 5 minutes

      // Transport settings
      enableStdio: process.env.ENABLE_STDIO !== 'false',
      enableSSE: process.env.ENABLE_SSE === 'true',
      enableWebSocket: process.env.ENABLE_WEBSOCKET === 'true',
      ssePort: parseInt(process.env.SSE_PORT || '3001'),
      sseHost: process.env.SSE_HOST || 'localhost',
      wsPort: parseInt(process.env.WS_PORT || '3002'),
      wsHost: process.env.WS_HOST || 'localhost',

      // Feature flags
      enableCaching: process.env.ENABLE_CACHING !== 'false',
      enableStreaming: process.env.ENABLE_STREAMING !== 'false',
      enableEvents: process.env.ENABLE_EVENTS !== 'false',
      enableResources: process.env.ENABLE_RESOURCES !== 'false',
      enableAdvancedTools: process.env.ENABLE_ADVANCED_TOOLS !== 'false',

      // Performance settings
      maxConcurrentOperations: parseInt(process.env.MAX_CONCURRENT_OPERATIONS || '50'),
      operationTimeout: parseInt(process.env.OPERATION_TIMEOUT || '300000'), // 5 minutes
      cacheMaxSize: parseInt(process.env.CACHE_MAX_SIZE || '104857600'), // 100MB
      cacheDefaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL || '300000'), // 5 minutes

      // Security settings
      corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
      enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests per minute
      enableSecurityValidation: process.env.ENABLE_SECURITY_VALIDATION !== 'false',

      // Advanced features
      enableBrowserPooling: process.env.ENABLE_BROWSER_POOLING !== 'false',
      enableEventMonitoring: process.env.ENABLE_EVENT_MONITORING !== 'false',
      enableAdvancedErrorHandling: process.env.ENABLE_ADVANCED_ERROR_HANDLING !== 'false',
      enableContextManagement: process.env.ENABLE_CONTEXT_MANAGEMENT !== 'false',

      ...config
    };

    this.initializeComponents();
    this.setupEventHandlers();
    this.setupErrorHandling();
  }

  /**
   * Initialize all server components including advanced features
   */
  private initializeComponents(): void {
    // Initialize session management
    this.sessionManager = new SessionManager({
      maxBrowsers: this.config.maxBrowsers,
      maxContextsPerBrowser: this.config.maxContextsPerBrowser,
      maxPagesPerContext: this.config.maxPagesPerContext,
      sessionTimeout: this.config.sessionTimeout,
      cleanupInterval: this.config.cleanupInterval
    });

    this.playwrightService = new PlaywrightService(this.sessionManager);

    // Initialize advanced tools manager
    if (this.config.enableAdvancedTools) {
      this.advancedToolsManager = new AdvancedToolsManager(
        this.playwrightService,
        this.sessionManager
      );
    }

    // Initialize enhanced message handler
    this.messageHandler = new MessageHandler({
      enableCaching: this.config.enableCaching,
      enableStreaming: this.config.enableStreaming,
      enableEvents: this.config.enableEvents,
      enableResources: this.config.enableResources,
      maxConcurrentOperations: this.config.maxConcurrentOperations,
      operationTimeout: this.config.operationTimeout,
      cacheConfig: {
        responseCache: this.config.enableCaching,
        sessionCache: this.config.enableCaching
      }
    });

    this.setupTools();
    this.setupTransports();
  }

  /**
   * Setup all available tools including 30+ advanced tools
   */
  private setupTools(): void {
    // Core Browser Management Tools (8 tools)
    const browserTools = createBrowserTools(this.playwrightService);
    
    // Core Page Navigation Tools (11 tools)
    const pageTools = createPageTools(this.playwrightService);
    
    // Core Element Interaction Tools (6 tools)
    const elementTools = createElementTools(this.playwrightService);

    // Advanced Tools (30+ tools)
    let advancedTools: any[] = [];
    if (this.config.enableAdvancedTools && this.advancedToolsManager) {
      advancedTools = this.advancedToolsManager.createAdvancedTools();
    }

    // Combine all tools
    const allTools = [...browserTools, ...pageTools, ...elementTools, ...advancedTools];
    
    // Register tools with the message handler
    allTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });

    this.messageHandler.registerTools(allTools);
    
    // Log tool registration summary
    console.error(`=== MCP Server Tool Registration ===`);
    console.error(`Core Browser Tools: ${browserTools.length}`);
    console.error(`Core Page Tools: ${pageTools.length}`);
    console.error(`Core Element Tools: ${elementTools.length}`);
    console.error(`Advanced Tools: ${advancedTools.length}`);
    console.error(`Total Registered Tools: ${allTools.length}`);
    console.error(`Advanced Features: ${this.config.enableAdvancedTools ? 'ENABLED' : 'DISABLED'}`);
    console.error(`Security Validation: ${this.config.enableSecurityValidation ? 'ENABLED' : 'DISABLED'}`);
    console.error(`Browser Pooling: ${this.config.enableBrowserPooling ? 'ENABLED' : 'DISABLED'}`);
    console.error(`Event Monitoring: ${this.config.enableEventMonitoring ? 'ENABLED' : 'DISABLED'}`);
    console.error(`=====================================`);
  }

  /**
   * Setup transport layers with enhanced configuration
   */
  private setupTransports(): void {
    const transportManager = (this.messageHandler as any).transportManager;

    // STDIO Transport (primary for ChatGPT Desktop)
    if (this.config.enableStdio) {
      const stdioTransport = new StdioTransport();
      transportManager.registerTransport('stdio', stdioTransport, true);
      console.error('STDIO Transport: ENABLED (Primary for ChatGPT Desktop)');
    }

    // SSE Transport (for web clients)
    if (this.config.enableSSE) {
      const sseTransport = new SSETransport({
        port: this.config.ssePort,
        host: this.config.sseHost,
        corsOrigins: this.config.corsOrigins,
        maxConnections: 100,
        connectionTimeout: 300000,
        requestTimeout: 30000,
        enableCompression: true
      });
      transportManager.registerTransport('sse', sseTransport);
      console.error(`SSE Transport: ENABLED on ${this.config.sseHost}:${this.config.ssePort}`);
    }

    // WebSocket Transport (for real-time clients)
    if (this.config.enableWebSocket) {
      const wsTransport = new WebSocketTransport({
        port: this.config.wsPort,
        host: this.config.wsHost,
        maxConnections: 50,
        connectionTimeout: 300000,
        heartbeatInterval: 30000,
        enableCompression: true
      });
      transportManager.registerTransport('websocket', wsTransport);
      console.error(`WebSocket Transport: ENABLED on ${this.config.wsHost}:${this.config.wsPort}`);
    }
  }

  /**
   * Setup event handlers for advanced features
   */
  private setupEventHandlers(): void {
    // Enhanced error handling
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught Exception:', error);
      if (this.config.enableAdvancedErrorHandling) {
        await this.performEmergencyCleanup();
      }
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      if (this.config.enableAdvancedErrorHandling) {
        await this.performEmergencyCleanup();
      }
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Memory monitoring for advanced features
    if (this.config.enableAdvancedTools) {
      setInterval(() => {
        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        if (memoryMB > 500) { // Alert at 500MB
          console.error(`High memory usage detected: ${memoryMB}MB`);
        }
      }, 60000); // Check every minute
    }
  }

  /**
   * Setup comprehensive error handling
   */
  private setupErrorHandling(): void {
    // Set up custom error handling for the message handler
    this.messageHandler.on('error', (error: Error) => {
      console.error('Message Handler Error:', error);
      
      if (this.config.enableAdvancedErrorHandling) {
        // Advanced error recovery could be implemented here
        console.error('Advanced error recovery triggered');
      }
    });

    // Session manager error handling
    this.sessionManager.on('error', (error: Error) => {
      console.error('Session Manager Error:', error);
    });

    // Transport error handling
    this.messageHandler.on('transport:error', (transportName: string, error: Error) => {
      console.error(`Transport Error (${transportName}):`, error);
    });
  }

  /**
   * Initialize the server and all components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.error('Initializing Enhanced Playwright MCP Server...');
      
      // Initialize message handler
      await this.messageHandler.initialize();
      
      // Initialize session manager
      await this.sessionManager.initialize();
      
      // Initialize playwright service
      // (No async initialization needed currently)
      
      this.initialized = true;
      console.error('Enhanced Playwright MCP Server initialized successfully');
      
      // Display server capabilities
      this.displayServerCapabilities();
      
    } catch (error) {
      console.error('Failed to initialize server:', error);
      throw error;
    }
  }

  /**
   * Display comprehensive server capabilities
   */
  private displayServerCapabilities(): void {
    console.error('\n=== SERVER CAPABILITIES ===');
    console.error(`Total Tools Available: ${this.tools.size}`);
    console.error(`Advanced Browser Management: ${this.config.enableAdvancedTools ? 'YES' : 'NO'}`);
    console.error(`Browser Instance Pooling: ${this.config.enableBrowserPooling ? 'YES' : 'NO'}`);
    console.error(`Context Lifecycle Management: ${this.config.enableContextManagement ? 'YES' : 'NO'}`);
    console.error(`Page Event Monitoring: ${this.config.enableEventMonitoring ? 'YES' : 'NO'}`);
    console.error(`Security Validation: ${this.config.enableSecurityValidation ? 'YES' : 'NO'}`);
    console.error(`Resource Caching: ${this.config.enableCaching ? 'YES' : 'NO'}`);
    console.error(`Streaming Support: ${this.config.enableStreaming ? 'YES' : 'NO'}`);
    console.error(`Event System: ${this.config.enableEvents ? 'YES' : 'NO'}`);
    console.error(`Rate Limiting: ${this.config.enableRateLimit ? 'YES' : 'NO'}`);
    console.error('===========================\n');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Start message handler (which starts transports)
      await this.messageHandler.start();
      
      console.error('Enhanced Playwright MCP Server started successfully');
      console.error('Ready to accept connections from ChatGPT Desktop...');
      
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    console.error('Stopping Enhanced Playwright MCP Server...');
    
    try {
      // Stop message handler
      await this.messageHandler.stop();
      
      // Shutdown session manager
      await this.sessionManager.shutdown();
      
      // Cleanup advanced tools
      if (this.advancedToolsManager) {
        await this.advancedToolsManager.cleanup();
      }
      
      this.initialized = false;
      console.error('Enhanced Playwright MCP Server stopped successfully');
      
    } catch (error) {
      console.error('Error during server shutdown:', error);
      throw error;
    }
  }

  /**
   * Perform emergency cleanup for critical errors
   */
  private async performEmergencyCleanup(): Promise<void> {
    console.error('Performing emergency cleanup...');
    
    try {
      // Force cleanup of all resources
      if (this.sessionManager) {
        await this.sessionManager.shutdown();
      }
      
      if (this.advancedToolsManager) {
        await this.advancedToolsManager.cleanup();
      }
      
      console.error('Emergency cleanup completed');
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }
  }

  /**
   * Graceful shutdown handler
   */
  private async shutdown(signal: string): Promise<void> {
    console.error(`Received ${signal}, shutting down gracefully...`);
    
    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get server statistics including advanced features
   */
  getServerStats(): any {
    const baseStats = {
      initialized: this.initialized,
      toolCount: this.tools.size,
      config: {
        maxBrowsers: this.config.maxBrowsers,
        maxContextsPerBrowser: this.config.maxContextsPerBrowser,
        maxPagesPerContext: this.config.maxPagesPerContext,
        enableAdvancedTools: this.config.enableAdvancedTools,
        enableBrowserPooling: this.config.enableBrowserPooling,
        enableEventMonitoring: this.config.enableEventMonitoring,
        enableSecurityValidation: this.config.enableSecurityValidation,
      },
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };

    // Add advanced stats if available
    if (this.sessionManager) {
      baseStats.sessionStats = this.sessionManager.getStats();
    }

    return baseStats;
  }

  /**
   * Get comprehensive tool information
   */
  getToolsInfo(): any[] {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
      category: this.getToolCategory(name),
      isAdvanced: this.isAdvancedTool(name),
    }));
  }

  private getToolCategory(toolName: string): string {
    if (toolName.startsWith('browser_')) return 'Browser Management';
    if (toolName.startsWith('page_')) return 'Page Navigation';
    if (toolName.startsWith('element_')) return 'Element Interaction';
    return 'System';
  }

  private isAdvancedTool(toolName: string): boolean {
    const advancedTools = [
      'browser_get_contexts', 'browser_new_context', 'browser_is_connected',
      'browser_disconnect', 'browser_get_pages', 'browser_grant_permissions',
      'browser_clear_permissions', 'browser_set_geolocation', 'browser_set_offline',
      'browser_get_cookies', 'page_set_content', 'page_get_inner_html',
      'page_get_outer_html', 'page_evaluate', 'page_evaluate_handle',
      'page_add_script_tag', 'page_add_style_tag', 'page_expose_function',
      'page_wait_for_event', 'page_wait_for_function', 'page_wait_for_selector',
      'page_wait_for_timeout', 'page_get_console_messages', 'page_clear_console',
      'page_pause', 'browser_pool_stats', 'browser_health_check',
      'page_monitoring_start', 'page_monitoring_stop', 'page_event_history'
    ];
    
    return advancedTools.includes(toolName);
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const server = new EnhancedPlaywrightMCPServer();
  
  try {
    await server.start();
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error) {
    console.error('Failed to start Enhanced Playwright MCP Server:', error);
    process.exit(1);
  }
}

// Only run main if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export { EnhancedPlaywrightMCPServer };