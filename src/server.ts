#!/usr/bin/env node

import { 
  MCPRequest, 
  MCPResponse, 
  MCPNotification,
  MCPTool,
  MCPToolResult,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  MCPServerError,
  MCP_ERROR_CODES,
  ToolName
} from './types.js';

import { SessionManager } from './services/session.js';
import { PlaywrightService } from './services/playwright.js';
import { toMCPError, logError, ErrorHelpers } from './utils/errors.js';
import { RateLimiter } from './utils/validation.js';

// Import tool implementations
import { createBrowserTools } from './tools/browser.js';
import { createPageTools } from './tools/page.js';
import { createElementTools } from './tools/elements.js';

/**
 * Production-ready MCP Server for Playwright automation
 * Implements full MCP protocol v2024-11-05 with STDIO transport
 */
export class PlaywrightMCPServer {
  private sessionManager: SessionManager;
  private playwrightService: PlaywrightService;
  private tools: Map<string, MCPTool> = new Map();
  private rateLimiter: RateLimiter;
  private initialized: boolean = false;
  
  // Server info
  private readonly serverInfo = {
    name: 'playwright-mcp-server',
    version: '1.0.0',
  };

  // Protocol version
  private readonly protocolVersion = '2024-11-05';

  constructor() {
    this.sessionManager = new SessionManager({
      maxBrowsers: parseInt(process.env.MAX_BROWSERS || '5'),
      maxContextsPerBrowser: parseInt(process.env.MAX_CONTEXTS_PER_BROWSER || '10'),
      maxPagesPerContext: parseInt(process.env.MAX_PAGES_PER_CONTEXT || '20'),
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'), // 1 hour
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000'), // 5 minutes
    });

    this.playwrightService = new PlaywrightService(this.sessionManager);
    
    this.rateLimiter = new RateLimiter(
      parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
      parseInt(process.env.RATE_LIMIT_MAX || '100') // 100 requests per minute
    );

    this.setupTools();
    this.setupTransport();
    this.setupErrorHandling();
  }

  /**
   * Sets up all available tools
   */
  private setupTools(): void {
    // Browser Management Tools (8 tools)
    const browserTools = createBrowserTools(this.playwrightService);
    
    // Page Navigation Tools (10 tools)
    const pageTools = createPageTools(this.playwrightService);
    
    // Element Interaction Tools (6 tools)
    const elementTools = createElementTools(this.playwrightService);

    // Register all tools
    [...browserTools, ...pageTools, ...elementTools].forEach(tool => {
      this.tools.set(tool.name, tool);
    });

    console.log(`Registered ${this.tools.size} tools`);
  }

  /**
   * Sets up STDIO transport for ChatGPT Desktop integration
   */
  private setupTransport(): void {
    // Handle STDIN messages
    process.stdin.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line).catch(error => {
            logError(error, 'Message handling failed');
          });
        }
      }
    });

    // Handle process signals
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    
    console.error('Playwright MCP Server started - listening on STDIN');
  }

  /**
   * Sets up global error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      logError(error, 'Uncaught exception');
      this.shutdown();
    });

    process.on('unhandledRejection', (reason) => {
      logError(reason, 'Unhandled promise rejection');
    });
  }

  /**
   * Handles incoming JSON-RPC messages
   */
  private async handleMessage(message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message) as MCPRequest | MCPNotification;
      
      if ('id' in parsed) {
        // Request - needs response
        await this.handleRequest(parsed as MCPRequest);
      } else {
        // Notification - no response needed
        await this.handleNotification(parsed as MCPNotification);
      }
    } catch (error) {
      // Send parse error response
      this.sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: ErrorHelpers.invalidRequest('Invalid JSON-RPC format'),
      });
    }
  }

  /**
   * Handles JSON-RPC requests
   */
  private async handleRequest(request: MCPRequest): Promise<void> {
    const { id, method, params } = request;

    try {
      // Rate limiting check
      if (!this.rateLimiter.isAllowed(method)) {
        this.sendResponse({
          jsonrpc: '2.0',
          id: id ?? null,
          error: ErrorHelpers.rateLimited(),
        });
        return;
      }

      let result: unknown;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params as InitializeParams);
          break;
          
        case 'tools/list':
          result = await this.handleToolsList();
          break;
          
        case 'tools/call':
          result = await this.handleToolsCall(params as any);
          break;
          
        default:
          throw new MCPServerError(
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Method '${method}' not found`
          );
      }

      this.sendResponse({
        jsonrpc: '2.0',
        id: id ?? null,
        result,
      });

    } catch (error) {
      this.sendResponse({
        jsonrpc: '2.0',
        id: id ?? null,
        error: toMCPError(error),
      });
    }
  }

  /**
   * Handles JSON-RPC notifications
   */
  private async handleNotification(notification: MCPNotification): Promise<void> {
    const { method } = notification;

    try {
      switch (method) {
        case 'notifications/initialized':
          await this.handleInitialized();
          break;
          
        case 'ping':
          // Health check - no response needed for notification
          break;
          
        default:
          console.error(`Unknown notification method: ${method}`);
      }
    } catch (error) {
      logError(error, `Notification handling failed for method: ${method}`);
    }
  }

  /**
   * Handles initialize request
   */
  private async handleInitialize(params: InitializeParams): Promise<InitializeResult> {
    // Validate protocol version
    if (params.protocolVersion !== this.protocolVersion) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Unsupported protocol version. Expected ${this.protocolVersion}, got ${params.protocolVersion}`
      );
    }

    const capabilities: ServerCapabilities = {
      tools: {
        listChanged: false,
      },
      logging: {},
    };

    return {
      protocolVersion: this.protocolVersion,
      capabilities,
      serverInfo: this.serverInfo,
    };
  }

  /**
   * Handles initialized notification
   */
  private async handleInitialized(): Promise<void> {
    this.initialized = true;
    console.error('MCP Server initialized successfully');
  }

  /**
   * Handles tools/list request
   */
  private async handleToolsList(): Promise<{ tools: MCPTool[] }> {
    if (!this.initialized) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    return {
      tools: Array.from(this.tools.values()),
    };
  }

  /**
   * Handles tools/call request
   */
  private async handleToolsCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<MCPToolResult> {
    if (!this.initialized) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    const { name, arguments: args = {} } = params;

    // Find tool
    const tool = this.tools.get(name);
    if (!tool) {
      throw new MCPServerError(
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        `Tool '${name}' not found`
      );
    }

    try {
      // Execute tool
      const result = await this.executeTool(name as ToolName, args);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
        isError: false,
      };
    } catch (error) {
      logError(error, `Tool execution failed: ${name}`);
      
      const mcpError = toMCPError(error);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: mcpError.message,
            code: mcpError.code,
            data: mcpError.data,
          }, null, 2),
        }],
        isError: true,
      };
    }
  }

  /**
   * Executes a tool with proper error handling
   */
  private async executeTool(toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
    // Browser Management Tools
    if (toolName.startsWith('browser_')) {
      return await this.executeBrowserTool(toolName, args);
    }
    
    // Page Navigation Tools
    if (toolName.startsWith('page_')) {
      return await this.executePageTool(toolName, args);
    }
    
    // Element Interaction Tools
    if (toolName.startsWith('element_')) {
      return await this.executeElementTool(toolName, args);
    }

    throw new MCPServerError(
      MCP_ERROR_CODES.METHOD_NOT_FOUND,
      `Unknown tool category for: ${toolName}`
    );
  }

  /**
   * Executes browser management tools
   */
  private async executeBrowserTool(toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'browser_launch_chromium':
        return await this.playwrightService.launchBrowser('chromium', args);
        
      case 'browser_launch_firefox':
        return await this.playwrightService.launchBrowser('firefox', args);
        
      case 'browser_launch_webkit':
        return await this.playwrightService.launchBrowser('webkit', args);
        
      case 'browser_close':
        await this.playwrightService.closeBrowser(args.browserId as string, args.force as boolean);
        return { success: true };
        
      case 'browser_contexts_create':
        return await this.playwrightService.createContext(args.browserId as string, args);
        
      case 'browser_contexts_close':
        await this.playwrightService.closeContext(args.contextId as string);
        return { success: true };
        
      case 'browser_list_contexts':
        return {
          contexts: this.playwrightService.listContexts(args.browserId as string),
        };
        
      case 'browser_version':
        const stats = this.playwrightService.getStats();
        const browsers = this.playwrightService.listBrowsers();
        return { browsers, stats };
        
      default:
        throw new MCPServerError(
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Unknown browser tool: ${toolName}`
        );
    }
  }

  /**
   * Executes page navigation tools
   */
  private async executePageTool(toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'page_goto':
        return await this.playwrightService.navigateToURL(
          args.contextId as string,
          args.url as string,
          {
            waitUntil: args.waitUntil as any,
            timeout: args.timeout as number,
            referer: args.referer as string,
          }
        );
        
      case 'page_go_back':
        return await this.playwrightService.goBack(
          args.pageId as string,
          args.timeout as number
        );
        
      case 'page_go_forward':
        return await this.playwrightService.goForward(
          args.pageId as string,
          args.timeout as number
        );
        
      case 'page_reload':
        return await this.playwrightService.reload(
          args.pageId as string,
          args.timeout as number
        );
        
      case 'page_close':
        await this.playwrightService.closePage(args.pageId as string);
        return { success: true };
        
      case 'page_title':
      case 'page_url':
      case 'page_content':
        const pageInfo = await this.playwrightService.getPageInfo(args.pageId as string);
        if (toolName === 'page_title') return { title: pageInfo.title };
        if (toolName === 'page_url') return { url: pageInfo.url };
        if (toolName === 'page_content') {
          const content = await this.playwrightService.getPageContent(args.pageId as string);
          return { content };
        }
        return { success: true };
        
      case 'page_set_viewport':
        await this.playwrightService.setViewport(
          args.pageId as string,
          args.width as number,
          args.height as number
        );
        return { success: true };
        
      case 'page_wait_for_load_state':
        await this.playwrightService.waitForLoadState(
          args.pageId as string,
          args.state as any,
          args.timeout as number
        );
        return { success: true };
        
      case 'page_screenshot':
        return await this.playwrightService.takeScreenshot(args.pageId as string, {
          type: args.type as any,
          quality: args.quality as number,
          fullPage: args.fullPage as boolean,
          clip: args.clip as any,
        });
        
      default:
        throw new MCPServerError(
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Unknown page tool: ${toolName}`
        );
    }
  }

  /**
   * Executes element interaction tools
   */
  private async executeElementTool(toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'element_click':
        const pageSession = this.sessionManager.getPageSession(args.pageId as string);
        const element = await pageSession.page.locator(args.selector as string).first();
        
        await element.click({
          button: args.button as any,
          clickCount: args.clickCount as number,
          force: args.force as boolean,
          position: args.position as any,
          timeout: args.timeout as number,
        });
        
        const boundingBox = await element.boundingBox();
        const text = await element.textContent() || '';
        
        return {
          success: true,
          element: {
            tagName: await element.evaluate((el: any) => el.tagName),
            text,
            boundingBox: boundingBox || { x: 0, y: 0, width: 0, height: 0 },
          },
        };
        
      case 'element_fill':
        const fillPageSession = this.sessionManager.getPageSession(args.pageId as string);
        const fillElement = await fillPageSession.page.locator(args.selector as string).first();
        
        await fillElement.fill(args.value as string, {
          force: args.force as boolean,
          timeout: args.timeout as number,
        });
        
        return { success: true };
        
      case 'element_type':
        const typePageSession = this.sessionManager.getPageSession(args.pageId as string);
        const typeElement = await typePageSession.page.locator(args.selector as string).first();
        
        await typeElement.type(args.text as string, {
          delay: args.delay as number,
        });
        
        return { success: true };
        
      case 'element_hover':
        const hoverPageSession = this.sessionManager.getPageSession(args.pageId as string);
        const hoverElement = await hoverPageSession.page.locator(args.selector as string).first();
        
        await hoverElement.hover({
          position: args.position as any,
          timeout: args.timeout as number,
        });
        
        return { success: true };
        
      case 'element_screenshot':
        return await this.playwrightService.takeScreenshot(args.pageId as string, {
          selector: args.selector as string,
          type: args.type as any,
          quality: args.quality as number,
        });

      case 'element_wait_for':
        const waitPageSession = this.sessionManager.getPageSession(args.pageId as string);
        const waitElement = await waitPageSession.page.locator(args.selector as string);
        
        await waitElement.waitFor({
          state: args.state as any || 'visible',
          timeout: args.timeout as number,
        });
        
        return { success: true };
        
      default:
        throw new MCPServerError(
          MCP_ERROR_CODES.METHOD_NOT_FOUND,
          `Unknown element tool: ${toolName}`
        );
    }
  }

  /**
   * Sends a response via STDOUT
   */
  private sendResponse(response: MCPResponse): void {
    const message = JSON.stringify(response);
    process.stdout.write(message + '\n');
  }

  /**
   * Gracefully shuts down the server
   */
  private async shutdown(): Promise<void> {
    console.error('Shutting down Playwright MCP Server...');
    
    try {
      await this.playwrightService.shutdown();
      console.error('Server shut down successfully');
      process.exit(0);
    } catch (error) {
      logError(error, 'Error during shutdown');
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  new PlaywrightMCPServer();
}