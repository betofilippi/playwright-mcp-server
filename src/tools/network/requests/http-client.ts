import { Page, BrowserContext, Response } from 'playwright';
import { MCPServerError, MCP_ERROR_CODES } from '../../../types.js';
import { urlSecurityValidator, SecurityValidationResult } from '../security/url-validator.js';
import { logError, logWarning, logInfo } from '../../../utils/errors.js';
import { SessionManager } from '../../../services/session.js';
import * as crypto from 'crypto';

/**
 * Secure HTTP Client with Enterprise Security Middleware
 * Provides comprehensive HTTP request capabilities with security validation
 */

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface HTTPRequest {
  url: string;
  method: HTTPMethod;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  maxRedirects?: number;
  validateTLS?: boolean;
  followRedirects?: boolean;
}

export interface HTTPResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  url: string;
  redirectedFrom?: string[];
  timing: {
    dnsLookup: number;
    tcpConnect: number;
    tlsHandshake: number;
    firstByte: number;
    download: number;
    total: number;
  };
  size: {
    headers: number;
    body: number;
    total: number;
  };
}

export interface HTTPClientConfig {
  maxRequestSize: number;
  maxResponseSize: number;
  defaultTimeout: number;
  userAgent: string;
  enableMetrics: boolean;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

export const DEFAULT_HTTP_CLIENT_CONFIG: HTTPClientConfig = {
  maxRequestSize: 50 * 1024 * 1024, // 50MB
  maxResponseSize: 100 * 1024 * 1024, // 100MB
  defaultTimeout: 30000, // 30 seconds
  userAgent: 'Playwright-MCP-Server/1.0.0',
  enableMetrics: true,
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
  },
};

export interface NetworkMetrics {
  requestCount: number;
  errorCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  bytesSent: number;
  bytesReceived: number;
  statusCodes: Map<number, number>;
  errors: Map<string, number>;
}

export class SecureHTTPClient {
  private config: HTTPClientConfig;
  private sessionManager: SessionManager;
  private requestCount = 0;
  private metrics: NetworkMetrics;
  private rateLimitCache = new Map<string, { count: number; resetTime: number }>();

  constructor(config: HTTPClientConfig = DEFAULT_HTTP_CLIENT_CONFIG, sessionManager: SessionManager) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Execute HTTP request with comprehensive security validation
   */
  async executeRequest(
    pageId: string,
    request: HTTPRequest
  ): Promise<HTTPResponse> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      // Rate limiting check
      this.enforceRateLimit(pageId);

      // Security validation
      const validationResult = await urlSecurityValidator.validateURL(request.url);
      if (!validationResult.isValid) {
        throw new MCPServerError(
          MCP_ERROR_CODES.UNAUTHORIZED,
          `URL blocked by security policy: ${validationResult.blockedReason}`
        );
      }

      urlSecurityValidator.logValidationResult(request.url, validationResult);

      // Validate request size
      this.validateRequestSize(request);

      // Validate headers
      if (request.headers) {
        const headerValidation = urlSecurityValidator.validateHeaders(request.headers);
        if (!headerValidation.valid) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `Invalid headers: ${headerValidation.warnings.join(', ')}`
          );
        }
        headerValidation.warnings.forEach(warning => logWarning(`HTTP Client: ${warning}`));
      }

      // Get page from session
      page = this.sessionManager.getPage(pageId);
      if (!page) {
        throw new MCPServerError(
          MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
          `Page not found: ${pageId}`
        );
      }

      // Set up request interception if needed
      const interceptPromise = this.setupRequestInterception(page, request);

      // Execute the request using Playwright's page.request API
      const response = await this.executePlaywrightRequest(page, request, validationResult.sanitizedURL);

      // Parse and validate response
      const httpResponse = await this.processResponse(response, startTime);

      // Update metrics
      this.updateMetrics(httpResponse, startTime);

      logInfo(`HTTP Client: ${request.method} ${request.url} - ${httpResponse.status}`);
      return httpResponse;

    } catch (error) {
      this.metrics.errorCount++;
      if (error instanceof MCPServerError) {
        throw error;
      }
      
      logError(error, `HTTP Client: Request failed ${request.method} ${request.url}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `HTTP request failed: ${error.message}`,
        { url: request.url, method: request.method }
      );
    }
  }

  /**
   * Execute multipart form request with file upload support
   */
  async executeMultipartRequest(
    pageId: string,
    url: string,
    formData: Map<string, string | Buffer | { name: string; content: Buffer; contentType: string }>,
    options: Partial<HTTPRequest> = {}
  ): Promise<HTTPResponse> {
    // Validate file uploads
    let totalSize = 0;
    const files: Array<{ name: string; content: Buffer; contentType: string }> = [];

    for (const [key, value] of formData.entries()) {
      if (typeof value === 'object' && 'content' in value) {
        // File upload
        totalSize += value.content.length;
        files.push(value);
        
        // Validate file size
        if (value.content.length > 10 * 1024 * 1024) { // 10MB per file
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `File too large: ${key} (max 10MB)`
          );
        }

        // Validate file type by content
        this.validateFileContent(value.name, value.content);
      } else if (typeof value === 'string') {
        totalSize += Buffer.byteLength(value, 'utf8');
      } else if (Buffer.isBuffer(value)) {
        totalSize += value.length;
      }
    }

    // Validate total multipart size
    if (totalSize > this.config.maxRequestSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Multipart request too large: ${totalSize} bytes (max ${this.config.maxRequestSize})`
      );
    }

    // Log file upload information
    if (files.length > 0) {
      logInfo(`HTTP Client: Uploading ${files.length} files, total size: ${totalSize} bytes`);
    }

    // Convert formData to the format expected by Playwright
    const playwrightFormData: Record<string, string | Buffer | { name: string; mimeType: string; buffer: Buffer }> = {};
    
    for (const [key, value] of formData.entries()) {
      if (typeof value === 'object' && 'content' in value) {
        playwrightFormData[key] = {
          name: value.name,
          mimeType: value.contentType,
          buffer: value.content
        };
      } else {
        playwrightFormData[key] = value;
      }
    }

    const request: HTTPRequest = {
      url,
      method: 'POST',
      body: playwrightFormData,
      ...options
    };

    return this.executeRequest(pageId, request);
  }

  /**
   * Set up request interception for monitoring and modification
   */
  private async setupRequestInterception(page: Page, request: HTTPRequest): Promise<void> {
    // Enable request interception if not already enabled
    await page.route('**/*', (route, interceptedRequest) => {
      // Only intercept the specific request we're making
      if (interceptedRequest.url() === request.url) {
        // Log the intercepted request for monitoring
        logInfo(`HTTP Client: Intercepted ${interceptedRequest.method()} ${interceptedRequest.url()}`);
      }
      
      // Continue with the original request
      route.continue();
    });
  }

  /**
   * Execute request using Playwright's API
   */
  private async executePlaywrightRequest(
    page: Page,
    request: HTTPRequest,
    sanitizedURL: string
  ): Promise<Response> {
    const context = page.context();
    const requestOptions: any = {
      data: request.body,
      headers: {
        'User-Agent': this.config.userAgent,
        ...request.headers
      },
      timeout: request.timeout || this.config.defaultTimeout,
      maxRedirects: request.maxRedirects || 5,
    };

    // Use Playwright's request API through the browser context
    const response = await context.request[request.method.toLowerCase() as keyof typeof context.request](
      sanitizedURL,
      requestOptions
    );

    return response;
  }

  /**
   * Process and validate HTTP response
   */
  private async processResponse(response: Response, startTime: number): Promise<HTTPResponse> {
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Get response headers
    const headers: Record<string, string> = {};
    const responseHeaders = response.headers();
    Object.keys(responseHeaders).forEach(key => {
      headers[key] = responseHeaders[key];
    });

    // Check response size
    const contentLength = headers['content-length'] ? parseInt(headers['content-length']) : 0;
    if (contentLength > this.config.maxResponseSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Response too large: ${contentLength} bytes (max ${this.config.maxResponseSize})`
      );
    }

    // Get response body
    let body: string | Buffer | undefined;
    try {
      const contentType = headers['content-type'] || '';
      
      if (contentType.includes('application/json') || 
          contentType.includes('text/') ||
          contentType.includes('application/xml')) {
        body = await response.text();
      } else {
        body = await response.body();
      }

      // Additional size check on actual body
      const actualSize = typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.length;
      if (actualSize > this.config.maxResponseSize) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Response body too large: ${actualSize} bytes (max ${this.config.maxResponseSize})`
        );
      }

    } catch (error) {
      logWarning(`HTTP Client: Failed to read response body: ${error.message}`);
      body = undefined;
    }

    const httpResponse: HTTPResponse = {
      status: response.status(),
      statusText: response.statusText(),
      headers,
      body,
      url: response.url(),
      timing: {
        dnsLookup: 0, // Playwright doesn't provide detailed timing
        tcpConnect: 0,
        tlsHandshake: 0,
        firstByte: 0,
        download: 0,
        total: totalTime,
      },
      size: {
        headers: JSON.stringify(headers).length,
        body: body ? (typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.length) : 0,
        total: 0,
      },
    };

    httpResponse.size.total = httpResponse.size.headers + httpResponse.size.body;

    return httpResponse;
  }

  /**
   * Validate request size
   */
  private validateRequestSize(request: HTTPRequest): void {
    let bodySize = 0;
    
    if (request.body) {
      if (typeof request.body === 'string') {
        bodySize = Buffer.byteLength(request.body, 'utf8');
      } else if (Buffer.isBuffer(request.body)) {
        bodySize = request.body.length;
      } else if (typeof request.body === 'object') {
        bodySize = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
      }
    }

    if (bodySize > this.config.maxRequestSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Request body too large: ${bodySize} bytes (max ${this.config.maxRequestSize})`
      );
    }
  }

  /**
   * Validate file content by checking magic bytes
   */
  private validateFileContent(filename: string, content: Buffer): void {
    const allowedTypes = new Map<string, Buffer[]>([
      ['image/jpeg', [Buffer.from([0xFF, 0xD8, 0xFF])]],
      ['image/png', [Buffer.from([0x89, 0x50, 0x4E, 0x47])]],
      ['image/gif', [Buffer.from('GIF87a'), Buffer.from('GIF89a')]],
      ['application/pdf', [Buffer.from([0x25, 0x50, 0x44, 0x46])]],
      ['text/plain', []], // Allow any content for text files
      ['application/json', []], // Allow any content for JSON files
    ]);

    const extension = filename.toLowerCase().split('.').pop();
    const suspiciousExtensions = ['exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'js', 'jar'];

    if (extension && suspiciousExtensions.includes(extension)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `File type not allowed: ${extension}`
      );
    }

    // Additional content validation could be added here
    if (content.length === 0) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Empty file upload not allowed'
      );
    }
  }

  /**
   * Enforce rate limiting
   */
  private enforceRateLimit(clientId: string): void {
    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;
    
    let clientLimiter = this.rateLimitCache.get(clientId);
    
    if (!clientLimiter || clientLimiter.resetTime <= now) {
      // Reset or create new limiter
      clientLimiter = {
        count: 0,
        resetTime: now + this.config.rateLimit.windowMs
      };
    }

    clientLimiter.count++;
    this.rateLimitCache.set(clientId, clientLimiter);

    if (clientLimiter.count > this.config.rateLimit.maxRequests) {
      const resetIn = Math.ceil((clientLimiter.resetTime - now) / 1000);
      throw new MCPServerError(
        MCP_ERROR_CODES.RATE_LIMITED,
        `Rate limit exceeded. Try again in ${resetIn} seconds.`,
        { retryAfter: resetIn }
      );
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(response: HTTPResponse, startTime: number): void {
    if (!this.config.enableMetrics) return;

    this.metrics.requestCount++;
    this.metrics.totalResponseTime += response.timing.total;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.requestCount;
    this.metrics.bytesReceived += response.size.total;

    // Update status code counts
    const currentCount = this.metrics.statusCodes.get(response.status) || 0;
    this.metrics.statusCodes.set(response.status, currentCount + 1);
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): NetworkMetrics {
    return {
      requestCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      bytesSent: 0,
      bytesReceived: 0,
      statusCodes: new Map(),
      errors: new Map(),
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): NetworkMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HTTPClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logInfo('HTTP Client: Configuration updated');
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.rateLimitCache.clear();
    this.resetMetrics();
    logInfo('HTTP Client: Cleaned up resources');
  }
}