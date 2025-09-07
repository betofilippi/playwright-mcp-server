#!/usr/bin/env node

/**
 * Enhanced Production-Ready MCP Server for Playwright Automation
 * Implements full MCP protocol v2024-11-05 with advanced features
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
import { ProgressReporter } from './streaming/ProgressReporter.js';
import { 
  MCPToolResult,
  BrowserSession,
  BrowserContextSession,
  PageSession 
} from './types.js';

/**
 * Enhanced MCP Server Configuration
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
}

/**
 * Enhanced Playwright MCP Server
 */
export class EnhancedPlaywrightMCPServer {
  private config: EnhancedServerConfig;
  private messageHandler: MessageHandler;
  private sessionManager: SessionManager;
  private playwrightService: PlaywrightService;
  
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

      ...config
    };

    this.initializeComponents();
    this.setupEventHandlers();
    this.setupErrorHandling();
  }

  /**
   * Initialize all server components
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
   * Setup all available tools
   */
  private setupTools(): void {
    // Browser Management Tools
    const browserTools = createBrowserTools(this.playwrightService);
    
    // Page Navigation Tools
    const pageTools = createPageTools(this.playwrightService);
    
    // Element Interaction Tools
    const elementTools = createElementTools(this.playwrightService);

    // Register all tools
    const allTools = [...browserTools, ...pageTools, ...elementTools];
    allTools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });

    this.messageHandler.registerTools(allTools);
    console.error(`Registered ${allTools.length} tools`);
  }

  /**
   * Setup transport layers
   */
  private setupTransports(): void {
    const transportManager = (this.messageHandler as any).transportManager;

    // STDIO Transport (primary for ChatGPT Desktop)
    if (this.config.enableStdio) {
      const stdioTransport = new StdioTransport();
      transportManager.registerTransport('stdio', stdioTransport, true);
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
    }

    // WebSocket Transport (for real-time clients)
    if (this.config.enableWebSocket) {
      const wsTransport = new WebSocketTransport({
        port: this.config.wsPort,
        host: this.config.wsHost,
        maxConnections: 100,
        connectionTimeout: 300000,
        pingInterval: 30000,
        pongTimeout: 10000,
        enableCompression: true
      });
      transportManager.registerTransport('websocket', wsTransport);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle tool execution requests
    this.messageHandler.on('execute_tool', this.handleToolExecution.bind(this));

    // Handle session events
    this.sessionManager.on('browser_created', (session: BrowserSession) => {
      this.messageHandler.registerBrowserSession(session);
    });

    this.sessionManager.on('context_created', (browserSession: BrowserSession, contextSession: BrowserContextSession) => {
      // Register context resources
      this.handleContextCreated(browserSession, contextSession);
    });

    this.sessionManager.on('page_created', (contextSession: BrowserContextSession, pageSession: PageSession) => {
      // Register page resources
      this.handlePageCreated(contextSession, pageSession);
    });
  }

  /**
   * Setup global error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      this.shutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled promise rejection:', reason);
    });

    // Handle shutdown signals
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGQUIT', () => this.shutdown());
  }

  /**
   * Start the enhanced server
   */
  async start(): Promise<void> {
    try {
      console.error('Starting Enhanced Playwright MCP Server...');
      
      // Start message handler (which starts transports)
      await this.messageHandler.start();
      
      this.initialized = true;
      console.error('Enhanced Playwright MCP Server started successfully');
      
      this.logServerInfo();
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    console.error('Shutting down Enhanced Playwright MCP Server...');
    
    try {
      if (this.messageHandler) {
        await this.messageHandler.stop();
      }
      
      if (this.playwrightService) {
        await this.playwrightService.shutdown();
      }
      
      console.error('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Handle tool execution with enhanced features
   */
  private async handleToolExecution(params: {
    toolName: string;
    args: Record<string, unknown>;
    progressReporter?: ProgressReporter;
    resolve: (result: MCPToolResult) => void;
    reject: (error: Error) => void;
  }): Promise<void> {
    const { toolName, args, progressReporter, resolve, reject } = params;

    try {
      let result: unknown;

      // Execute tool based on category
      if (toolName.startsWith('browser_')) {
        result = await this.executeBrowserTool(toolName, args, progressReporter);
      } else if (toolName.startsWith('page_')) {
        result = await this.executePageTool(toolName, args, progressReporter);
      } else if (toolName.startsWith('element_')) {
        result = await this.executeElementTool(toolName, args, progressReporter);
      } else {
        throw new Error(`Unknown tool category for: ${toolName}`);
      }

      // Format result as MCPToolResult
      const mcpResult: MCPToolResult = {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }],
        isError: false
      };

      resolve(mcpResult);

    } catch (error) {
      console.error(`Tool execution failed: ${toolName}`, error);
      
      const errorResult: MCPToolResult = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }, null, 2)
        }],
        isError: true
      };

      resolve(errorResult); // Don't reject, return error result instead
    }
  }

  /**
   * Execute browser management tools with progress reporting
   */
  private async executeBrowserTool(
    toolName: string,
    args: Record<string, unknown>,
    progressReporter?: ProgressReporter
  ): Promise<unknown> {
    if (progressReporter) {
      progressReporter.startStage('prepare');
      progressReporter.updateStageProgress('prepare', 50, 100);
    }

    let result: unknown;

    switch (toolName) {
      case 'browser_launch_chromium':
        result = await this.playwrightService.launchBrowser('chromium', args);
        break;
      case 'browser_launch_firefox':
        result = await this.playwrightService.launchBrowser('firefox', args);
        break;
      case 'browser_launch_webkit':
        result = await this.playwrightService.launchBrowser('webkit', args);
        break;
      case 'browser_close':
        await this.playwrightService.closeBrowser(args.browserId as string, args.force as boolean);
        result = { success: true };
        break;
      case 'browser_contexts_create':
        result = await this.playwrightService.createContext(args.browserId as string, args);
        break;
      case 'browser_contexts_close':
        await this.playwrightService.closeContext(args.contextId as string);
        result = { success: true };
        break;
      case 'browser_list_contexts':
        result = { contexts: this.playwrightService.listContexts(args.browserId as string) };
        break;
      case 'browser_version':
        const stats = this.playwrightService.getStats();
        const browsers = this.playwrightService.listBrowsers();
        result = { browsers, stats };
        break;
      default:
        throw new Error(`Unknown browser tool: ${toolName}`);
    }

    if (progressReporter) {
      progressReporter.completeStage('prepare');
    }

    return result;
  }

  /**
   * Execute page navigation tools with progress reporting
   */
  private async executePageTool(
    toolName: string,
    args: Record<string, unknown>,
    progressReporter?: ProgressReporter
  ): Promise<unknown> {
    if (progressReporter) {
      if (toolName === 'page_goto') {
        progressReporter.startStage('navigate');
        progressReporter.updateStageProgress('navigate', 25, 100);
      } else if (toolName === 'page_screenshot') {
        progressReporter.startStage('prepare');
        progressReporter.updateStageProgress('prepare', 50, 100);
      }
    }

    let result: unknown;

    switch (toolName) {
      case 'page_goto':
        if (progressReporter) {
          progressReporter.updateStageProgress('navigate', 75, 100);
        }
        result = await this.playwrightService.navigateToURL(
          args.contextId as string,
          args.url as string,
          {
            waitUntil: args.waitUntil as any,
            timeout: args.timeout as number,
            referer: args.referer as string
          }
        );
        if (progressReporter) {
          progressReporter.completeStage('navigate');
          progressReporter.startStage('wait');
          progressReporter.completeStage('wait');
          progressReporter.startStage('verify');
          progressReporter.completeStage('verify');
        }
        break;

      case 'page_screenshot':
        if (progressReporter) {
          progressReporter.completeStage('prepare');
          progressReporter.startStage('capture');
          progressReporter.updateStageProgress('capture', 50, 100);
        }
        result = await this.playwrightService.takeScreenshot(args.pageId as string, {
          type: args.type as any,
          quality: args.quality as number,
          fullPage: args.fullPage as boolean,
          clip: args.clip as any
        });
        if (progressReporter) {
          progressReporter.completeStage('capture');
          progressReporter.startStage('process');
          progressReporter.completeStage('process');
        }
        break;

      case 'page_go_back':
        result = await this.playwrightService.goBack(args.pageId as string, args.timeout as number);
        break;

      case 'page_go_forward':
        result = await this.playwrightService.goForward(args.pageId as string, args.timeout as number);
        break;

      case 'page_reload':
        result = await this.playwrightService.reload(args.pageId as string, args.timeout as number);
        break;

      case 'page_close':
        await this.playwrightService.closePage(args.pageId as string);
        result = { success: true };
        break;

      case 'page_title':
      case 'page_url':
      case 'page_content':
        const pageInfo = await this.playwrightService.getPageInfo(args.pageId as string);
        if (toolName === 'page_title') result = { title: pageInfo.title };
        else if (toolName === 'page_url') result = { url: pageInfo.url };
        else if (toolName === 'page_content') {
          const content = await this.playwrightService.getPageContent(args.pageId as string);
          result = { content };
        }
        break;

      case 'page_set_viewport':
        await this.playwrightService.setViewport(
          args.pageId as string,
          args.width as number,
          args.height as number
        );
        result = { success: true };
        break;

      case 'page_wait_for_load_state':
        await this.playwrightService.waitForLoadState(
          args.pageId as string,
          args.state as any,
          args.timeout as number
        );
        result = { success: true };
        break;

      default:
        throw new Error(`Unknown page tool: ${toolName}`);
    }

    return result;
  }

  /**
   * Execute element interaction tools
   */
  private async executeElementTool(
    toolName: string,
    args: Record<string, unknown>,
    progressReporter?: ProgressReporter
  ): Promise<unknown> {
    const pageSession = this.sessionManager.getPageSession(args.pageId as string);

    switch (toolName) {
      case 'element_click':
        const element = await pageSession.page.locator(args.selector as string).first();
        await element.click({
          button: args.button as any,
          clickCount: args.clickCount as number,
          force: args.force as boolean,
          position: args.position as any,
          timeout: args.timeout as number
        });

        const boundingBox = await element.boundingBox();
        const text = await element.textContent() || '';

        return {
          success: true,
          element: {
            tagName: await element.evaluate((el: any) => el.tagName),
            text,
            boundingBox: boundingBox || { x: 0, y: 0, width: 0, height: 0 }
          }
        };

      case 'element_fill':
        const fillElement = await pageSession.page.locator(args.selector as string).first();
        await fillElement.fill(args.value as string, {
          force: args.force as boolean,
          timeout: args.timeout as number
        });
        return { success: true };

      case 'element_type':
        const typeElement = await pageSession.page.locator(args.selector as string).first();
        await typeElement.type(args.text as string, {
          delay: args.delay as number
        });
        return { success: true };

      case 'element_hover':
        const hoverElement = await pageSession.page.locator(args.selector as string).first();
        await hoverElement.hover({
          position: args.position as any,
          timeout: args.timeout as number
        });
        return { success: true };

      case 'element_screenshot':
        return await this.playwrightService.takeScreenshot(args.pageId as string, {
          selector: args.selector as string,
          type: args.type as any,
          quality: args.quality as number
        });

      case 'element_wait_for':
        const waitElement = await pageSession.page.locator(args.selector as string);
        await waitElement.waitFor({
          state: args.state as any || 'visible',
          timeout: args.timeout as number
        });
        return { success: true };

      default:
        throw new Error(`Unknown element tool: ${toolName}`);
    }
  }

  /**
   * Handle context creation
   */
  private handleContextCreated(browserSession: BrowserSession, contextSession: BrowserContextSession): void {
    // Register context as resource if resources are enabled
    if (this.config.enableResources) {
      // This would integrate with the resource manager
      console.debug(`Context created: ${contextSession.id} in browser ${browserSession.id}`);
    }
  }

  /**
   * Handle page creation
   */
  private handlePageCreated(contextSession: BrowserContextSession, pageSession: PageSession): void {
    // Register page as resource if resources are enabled
    if (this.config.enableResources) {
      // This would integrate with the page resource manager
      console.debug(`Page created: ${pageSession.id} in context ${contextSession.id}`);
    }
  }

  /**
   * Log server information
   */
  private logServerInfo(): void {
    const stats = this.messageHandler.getStats();
    
    console.error('='.repeat(60));
    console.error('Enhanced Playwright MCP Server - Started');
    console.error('='.repeat(60));
    console.error(`Protocol Version: 2024-11-05`);
    console.error(`Registered Tools: ${this.tools.size}`);
    console.error(`Active Transports: ${stats.transport.connectedTransports}`);
    console.error(`Features Enabled:`);
    console.error(`  - Caching: ${this.config.enableCaching}`);
    console.error(`  - Streaming: ${this.config.enableStreaming}`);
    console.error(`  - Events: ${this.config.enableEvents}`);
    console.error(`  - Resources: ${this.config.enableResources}`);
    
    if (this.config.enableSSE) {
      console.error(`SSE Endpoint: http://${this.config.sseHost}:${this.config.ssePort}/events`);
    }
    
    if (this.config.enableWebSocket) {
      console.error(`WebSocket Endpoint: ws://${this.config.wsHost}:${this.config.wsPort}`);
    }
    
    console.error('='.repeat(60));
  }

  /**
   * Get server status and statistics
   */
  getStatus(): {
    initialized: boolean;
    config: EnhancedServerConfig;
    stats: any;
  } {
    return {
      initialized: this.initialized,
      config: this.config,
      stats: this.initialized ? this.messageHandler.getStats() : null
    };
  }
}

// Start the server if this file is run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const server = new EnhancedPlaywrightMCPServer();
  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}