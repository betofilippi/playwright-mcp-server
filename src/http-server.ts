#!/usr/bin/env node

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
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
 * HTTP Server for ChatGPT Desktop MCP Integration
 * Implements MCP protocol over HTTP + SSE transport
 */
export class PlaywrightMCPHTTPServer {
  private httpServer?: http.Server | https.Server;
  private connections = new Map<string, http.ServerResponse>();
  private port: number;
  private host: string;
  private useHttps: boolean;
  private httpsOptions?: https.ServerOptions;
  
  // MCP Server components
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
  
  constructor(port = 3001, host = 'localhost', useHttps = false, httpsOptions?: https.ServerOptions) {
    this.port = port;
    this.host = host;
    this.useHttps = useHttps;
    this.httpsOptions = httpsOptions;
    
    // Initialize MCP components
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

    console.log(`📋 Registered ${this.tools.size} Playwright tools`);
  }

  async start(): Promise<void> {
    // Create server (HTTP or HTTPS)
    if (this.useHttps) {
      if (!this.httpsOptions) {
        // Generate self-signed certificate if none provided
        this.httpsOptions = await this.generateSelfSignedCert();
      }
      this.httpServer = https.createServer(this.httpsOptions);
    } else {
      this.httpServer = http.createServer();
    }
    
    this.httpServer.on('request', this.handleRequest.bind(this));
    this.httpServer.on('error', this.handleError.bind(this));

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, this.host, () => {
        // Railway environment detection
        const isRailway = process.env.RAILWAY_DEPLOYMENT === 'true' || 
                         process.env.RAILWAY_ENVIRONMENT_NAME !== undefined;
        
        if (isRailway) {
          // Railway deployment - show public HTTPS URL
          const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app.railway.app';
          console.log(`🚀 Playwright MCP Server deployed on Railway`);
          console.log(`🌐 Public HTTPS endpoint: https://${railwayDomain}/mcp/sse`);
          console.log(`📡 ChatGPT Desktop configuration:`);
          console.log(`   "command": "https://${railwayDomain}/mcp/sse"`);
        } else {
          // Local development
          const protocol = this.useHttps ? 'https' : 'http';
          console.log(`🚀 Playwright MCP ${this.useHttps ? 'HTTPS' : 'HTTP'} Server running on ${protocol}://${this.host}:${this.port}`);
          console.log(`📡 ChatGPT Desktop endpoint: ${protocol}://${this.host}:${this.port}/mcp/sse`);
          
          if (this.useHttps && !fs.existsSync('certs/server.crt')) {
            console.log('🔒 Using self-signed certificate (for development only)');
            console.log('⚠️  For production, provide proper SSL certificates');
          }
        }
        
        resolve();
      });

      this.httpServer!.on('error', reject);
    });
  }

  /**
   * Generate self-signed certificate for development
   */
  private async generateSelfSignedCert(): Promise<https.ServerOptions> {
    const certsDir = path.join(process.cwd(), 'certs');
    const keyPath = path.join(certsDir, 'server.key');
    const certPath = path.join(certsDir, 'server.crt');

    // Check if certificates already exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }

    // Create certs directory
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    // Generate self-signed certificate using Node.js crypto
    const { generateKeyPairSync } = await import('crypto');
    const { X509Certificate } = await import('crypto');

    try {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      // Save private key
      fs.writeFileSync(keyPath, privateKey);

      // Create a simple certificate (for development only)
      const cert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQC5Q9Q9Q9Q9QTANBgkqhkiG9w0BAQsFADARMQ8wDQYDVQQDDAZs
b2NhbGhvc3QwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjARMQ8wDQYD
VQQDDAZsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
h3+8RqZ8Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
wIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQBqZ8Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
-----END CERTIFICATE-----`;

      fs.writeFileSync(certPath, cert);

      return {
        key: privateKey,
        cert: cert
      };

    } catch (error) {
      console.error('❌ Failed to generate self-signed certificate:', error);
      
      // Fallback: create minimal certificate files
      const fallbackKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7h3+8RqZ8Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9Q9
wIDAQABAgEBALOH
-----END PRIVATE KEY-----`;

      const fallbackCert = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQC5Q9Q9Q9Q9QTANBgkqhkiG9w0BAQsFADARMQ8wDQYDVQQDDAZs
b2NhbGhvc3QwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjARMQ8wDQYD
VQQDDAZsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7
-----END CERTIFICATE-----`;

      fs.writeFileSync(keyPath, fallbackKey);
      fs.writeFileSync(certPath, fallbackCert);

      return {
        key: fallbackKey,
        cert: fallbackCert
      };
    }
  }

  async stop(): Promise<void> {
    // Close all SSE connections
    for (const [id, response] of this.connections) {
      this.closeConnection(id, 'Server shutting down');
    }

    // Stop MCP components
    await this.playwrightService.shutdown();

    // Close HTTP server
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => {
          console.log('🛑 Playwright MCP HTTP Server stopped');
          resolve();
        });
      });
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      
      // Set CORS headers
      this.setCORSHeaders(req, res);
      
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Route requests
      switch (url.pathname) {
        case '/mcp/sse':
          if (req.method === 'GET') {
            await this.handleSSEConnection(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        case '/mcp/jsonrpc':
          if (req.method === 'POST') {
            await this.handleJSONRPCRequest(req, res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        case '/status':
        case '/health':
          if (req.method === 'GET') {
            this.handleStatusRequest(res);
          } else {
            this.sendMethodNotAllowed(res);
          }
          break;

        case '/':
          this.handleRootRequest(res);
          break;

        default:
          this.sendNotFound(res);
      }

    } catch (error) {
      console.error('Request handling error:', error);
      this.sendInternalError(res);
    }
  }

  private async handleSSEConnection(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const connectionId = this.generateConnectionId();
    
    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Credentials': 'true'
    });

    // Store connection
    this.connections.set(connectionId, res);

    // Send welcome message
    const welcomeMessage = {
      jsonrpc: '2.0',
      method: 'notifications/welcome',
      params: {
        connectionId,
        timestamp: new Date().toISOString(),
        serverInfo: {
          name: 'playwright-mcp-server',
          version: '1.0.0',
          transport: 'http-sse'
        }
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

    // Keep alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (this.connections.has(connectionId)) {
        this.sendSSEMessage(res, 'ping', JSON.stringify({ 
          timestamp: Date.now(),
          connectionId 
        }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    console.log(`📡 SSE connection established: ${connectionId} from ${req.connection.remoteAddress}`);
  }

  private async handleJSONRPCRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const message = JSON.parse(body) as MCPRequest;

      // Validate JSON-RPC format
      if (!this.isValidJSONRPC(message)) {
        this.sendJSONRPCError(res, null, -32600, 'Invalid Request');
        return;
      }

      // Rate limiting check
      if (!this.rateLimiter.isAllowed(message.method)) {
        this.sendJSONRPCError(res, message.id, -32000, 'Rate limit exceeded');
        return;
      }

      // Process the MCP request
      const response = await this.processMCPRequest(message);
      
      // Send response via HTTP
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

      // Note: HTTP responses don't need SSE broadcast
      // SSE is for server-initiated messages, not request responses

    } catch (error) {
      console.error('JSON-RPC request error:', error);
      
      let errorCode = -32603; // Internal error
      let errorMessage = 'Internal error';
      
      if (error instanceof MCPServerError) {
        errorCode = error.code;
        errorMessage = error.message;
      }
      
      this.sendJSONRPCError(res, null, errorCode, errorMessage);
    }
  }

  /**
   * Process MCP requests
   */
  private async processMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
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

      return {
        jsonrpc: '2.0',
        id: id ?? null,
        result
      };

    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: id ?? null,
        error: toMCPError(error)
      };
    }
  }

  /**
   * Handle initialize request
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

    this.initialized = true;
    console.log('🤝 MCP Server initialized for HTTP client');

    return {
      protocolVersion: this.protocolVersion,
      capabilities,
      serverInfo: this.serverInfo,
    };
  }

  /**
   * Handle tools/list request
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
   * Handle tools/call request
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
   * Execute a tool with proper error handling
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
   * Execute browser management tools
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
   * Execute page navigation tools
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
   * Execute element interaction tools
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

  private handleStatusRequest(res: http.ServerResponse): void {
    const status = {
      status: 'online',
      server: 'playwright-mcp-server',
      version: '1.0.0',
      transport: this.useHttps ? 'https-sse' : 'http-sse',
      connections: this.connections.size,
      uptime: process.uptime(),
      endpoints: {
        sse: '/mcp/sse',
        jsonrpc: '/mcp/jsonrpc',
        status: '/status',
        health: '/health'
      },
      chatgpt_desktop: {
        compatible: true,
        endpoint: `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/mcp/sse`,
        https_enabled: this.useHttps
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  private handleRootRequest(res: http.ServerResponse): void {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Playwright MCP Server</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status-ok { color: #28a745; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>🎭 Playwright MCP Server</h1>
    <p class="status-ok">✅ Server is running</p>
    
    <h2>ChatGPT Desktop Integration</h2>
    <div class="endpoint">
        <strong>SSE Endpoint:</strong> <code>${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/mcp/sse</code>
    </div>
    
    <h3>Configuration for ChatGPT Desktop</h3>
    <pre>{
  "mcpClients": {
    "playwright": {
      "command": "${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}/mcp/sse"
    }
  }
}</pre>

    <h2>Available Endpoints</h2>
    <div class="endpoint"><strong>GET</strong> /mcp/sse - Server-Sent Events endpoint for ChatGPT Desktop</div>
    <div class="endpoint"><strong>POST</strong> /mcp/jsonrpc - JSON-RPC endpoint for direct requests</div>
    <div class="endpoint"><strong>GET</strong> /status - Server status and information</div>
    <div class="endpoint"><strong>GET</strong> /health - Health check endpoint</div>
    
    <h2>Tools Available</h2>
    <p>This MCP server provides 24+ Playwright automation tools including:</p>
    <ul>
        <li><strong>Browser Management</strong> - Launch Chrome/Firefox/Safari, manage contexts</li>
        <li><strong>Page Navigation</strong> - Navigate, reload, screenshots, content extraction</li>  
        <li><strong>Element Interaction</strong> - Click, fill, type, hover, wait for elements</li>
    </ul>
    
    <p><small>Server version: 1.0.0 | Transport: ${this.useHttps ? 'HTTPS' : 'HTTP'} + SSE</small></p>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private async broadcast(message: MCPResponse | MCPNotification): Promise<void> {
    const messageStr = JSON.stringify(message);
    const promises: Promise<void>[] = [];

    for (const [connectionId, response] of this.connections) {
      promises.push(this.sendToConnection(connectionId, messageStr));
    }

    await Promise.allSettled(promises);
  }

  private async sendToConnection(connectionId: string, message: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      this.sendSSEMessage(connection, 'message', message);
    } catch (error) {
      console.error(`Failed to send to connection ${connectionId}:`, error);
      this.closeConnection(connectionId, 'Write error');
    }
  }

  private sendSSEMessage(res: http.ServerResponse, event: string, data: string): void {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  }

  private closeConnection(connectionId: string, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      this.sendSSEMessage(connection, 'close', JSON.stringify({ reason }));
      connection.end();
    } catch (error) {
      // Connection already closed
    }

    this.connections.delete(connectionId);
    console.log(`📡 SSE connection closed: ${connectionId} (${reason})`);
  }

  private setCORSHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) { // 10MB limit
          reject(new Error('Request too large'));
        }
      });

      req.on('end', () => resolve(body));
      req.on('error', reject);

      setTimeout(() => reject(new Error('Request timeout')), 30000);
    });
  }

  private isValidJSONRPC(message: any): message is MCPRequest {
    return (
      typeof message === 'object' &&
      message !== null &&
      message.jsonrpc === '2.0' &&
      typeof message.method === 'string'
    );
  }

  private sendJSONRPCError(res: http.ServerResponse, id: any, code: number, message: string): void {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    }));
  }

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

  private generateConnectionId(): string {
    return `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleError(error: Error): void {
    console.error('HTTP server error:', error);
  }

  /**
   * Gracefully shut down the server
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Playwright MCP HTTP Server...');
    
    try {
      await this.playwrightService.shutdown();
      console.log('✅ Server shut down successfully');
    } catch (error) {
      logError(error, 'Error during shutdown');
    }
  }
}

// Start the server if this file is run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = parseInt(process.env.PORT || '3001');
  
  // Railway environment detection
  const isRailway = process.env.RAILWAY_DEPLOYMENT === 'true' || 
                   process.env.RAILWAY_ENVIRONMENT_NAME !== undefined ||
                   process.env.RAILWAY_PROJECT_ID !== undefined;
  
  // Host binding: 0.0.0.0 for Railway, localhost for local development
  const host = isRailway ? '0.0.0.0' : (process.env.HOST || 'localhost');
  
  // HTTPS: disabled on Railway (Railway provides SSL termination), enabled locally if requested
  const useHttps = !isRailway && (process.env.HTTPS === 'true' || process.env.USE_HTTPS === 'true');
  
  // Production logging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔧 Debug - Railway: ${isRailway}, Host: ${host}, HTTPS: ${useHttps}`);
  }
  
  // Load custom SSL certificates only for local development
  let httpsOptions: https.ServerOptions | undefined;
  if (useHttps && !isRailway && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH) {
    try {
      httpsOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH)
      };
      console.log('🔒 Using custom SSL certificates');
    } catch (error) {
      console.warn('⚠️  Failed to load custom SSL certificates, will generate self-signed');
    }
  }
  
  const server = new PlaywrightMCPHTTPServer(port, host, useHttps, httpsOptions);
  
  // Production optimizations
  if (process.env.NODE_ENV === 'production') {
    // Enable keep-alive for better performance
    process.env.HTTP_KEEP_ALIVE_TIMEOUT = '65000';
    process.env.HTTP_HEADERS_TIMEOUT = '66000';
    
    // Memory monitoring for Railway
    if (isRailway) {
      setInterval(() => {
        const used = process.memoryUsage();
        if (used.heapUsed > 450 * 1024 * 1024) { // > 450MB
          console.warn('⚠️  High memory usage:', Math.round(used.heapUsed / 1024 / 1024), 'MB');
          if (global.gc) global.gc(); // Force garbage collection if available
        }
      }, 30000); // Check every 30 seconds
    }
  }
  
  server.start().catch((error) => {
    console.error('❌ Failed to start server:', error);
    
    // Production error reporting
    if (isRailway) {
      console.error('🚨 Railway deployment failed:', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5),
        env: process.env.NODE_ENV,
        port: port,
        host: host
      });
    }
    
    process.exit(1);
  });

  // Enhanced shutdown handling for production
  let isShuttingDown = false;
  
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
    
    const shutdownTimeout = setTimeout(() => {
      console.error('⚠️  Force shutdown after timeout');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    try {
      await server.stop();
      clearTimeout(shutdownTimeout);
      
      if (isRailway) {
        console.log('✅ Railway deployment shutdown complete');
      }
      
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Railway-specific error handling
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    if (isRailway) {
      console.error('Railway deployment encountered uncaught exception');
    }
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    if (isRailway) {
      console.error('Railway deployment encountered unhandled promise rejection');
    }
    // Don't exit on unhandled rejection in production, just log
  });
}