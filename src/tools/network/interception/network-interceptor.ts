import { Page, Route, Request as PlaywrightRequest, Response as PlaywrightResponse } from 'playwright';
import { MCPServerError, MCP_ERROR_CODES } from '../../../types.js';
import { SessionManager } from '../../../services/session.js';
import { logError, logWarning, logInfo } from '../../../utils/errors.js';
import { EventEmitter } from 'events';

/**
 * Network Interception and Monitoring System
 * Provides comprehensive network traffic interception, mocking, and monitoring
 */

export interface InterceptedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  timestamp: Date;
  pageId: string;
  resourceType: string;
  isNavigationRequest: boolean;
}

export interface InterceptedResponse {
  id: string;
  requestId: string;
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  timestamp: Date;
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
  fromCache: boolean;
  size: number;
}

export interface MockResponse {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  delay?: number;
}

export interface NetworkFailure {
  errorText: string;
  errorCode?: number;
}

export interface InterceptionPattern {
  urlPattern: string | RegExp;
  method?: string;
  resourceType?: string;
  action: 'continue' | 'abort' | 'mock';
  mockResponse?: MockResponse;
  failure?: NetworkFailure;
  modifyHeaders?: Record<string, string>;
  modifyBody?: string | Buffer;
}

export interface NetworkEvent {
  type: 'request' | 'response' | 'requestfailed' | 'requestfinished';
  pageId: string;
  data: InterceptedRequest | InterceptedResponse | any;
  timestamp: Date;
}

export class NetworkInterceptor extends EventEmitter {
  private sessionManager: SessionManager;
  private activeInterceptions = new Map<string, InterceptionPattern[]>(); // pageId -> patterns
  private requestHistory = new Map<string, InterceptedRequest[]>(); // pageId -> requests
  private responseHistory = new Map<string, InterceptedResponse[]>(); // pageId -> responses
  private mockResponses = new Map<string, Map<string, MockResponse>>(); // pageId -> url -> mock
  private requestIdCounter = 0;
  private maxHistorySize = 1000;

  constructor(sessionManager: SessionManager) {
    super();
    this.sessionManager = sessionManager;
  }

  /**
   * Enable network interception for a page with specific patterns
   */
  async enableInterception(
    pageId: string,
    patterns: InterceptionPattern[]
  ): Promise<void> {
    try {
      const page = this.sessionManager.getPage(pageId);
      if (!page) {
        throw new MCPServerError(
          MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
          `Page not found: ${pageId}`
        );
      }

      // Store patterns for this page
      this.activeInterceptions.set(pageId, patterns);

      // Set up request interception
      await page.route('**/*', async (route, request) => {
        await this.handleInterceptedRequest(pageId, route, request);
      });

      // Set up response monitoring
      page.on('response', (response) => {
        this.handleInterceptedResponse(pageId, response);
      });

      page.on('requestfailed', (request) => {
        this.handleFailedRequest(pageId, request);
      });

      page.on('requestfinished', (request) => {
        this.handleFinishedRequest(pageId, request);
      });

      logInfo(`Network Interceptor: Enabled interception for page ${pageId} with ${patterns.length} patterns`);

    } catch (error) {
      logError(error, `Network Interceptor: Failed to enable interception for page ${pageId}`);
      throw error;
    }
  }

  /**
   * Disable network interception for a page
   */
  async disableInterception(pageId: string): Promise<void> {
    try {
      const page = this.sessionManager.getPage(pageId);
      if (page) {
        await page.unroute('**/*');
        page.removeAllListeners('response');
        page.removeAllListeners('requestfailed');
        page.removeAllListeners('requestfinished');
      }

      this.activeInterceptions.delete(pageId);
      this.mockResponses.delete(pageId);

      logInfo(`Network Interceptor: Disabled interception for page ${pageId}`);

    } catch (error) {
      logError(error, `Network Interceptor: Failed to disable interception for page ${pageId}`);
      throw error;
    }
  }

  /**
   * Add mock response for specific URL pattern
   */
  setMockResponse(
    pageId: string,
    urlPattern: string | RegExp,
    mockResponse: MockResponse
  ): void {
    let pageMocks = this.mockResponses.get(pageId);
    if (!pageMocks) {
      pageMocks = new Map();
      this.mockResponses.set(pageId, pageMocks);
    }

    const patternKey = urlPattern instanceof RegExp ? urlPattern.toString() : urlPattern;
    pageMocks.set(patternKey, mockResponse);

    logInfo(`Network Interceptor: Set mock response for ${patternKey} on page ${pageId}`);
  }

  /**
   * Clear mock response for specific URL pattern
   */
  clearMockResponse(pageId: string, urlPattern: string | RegExp): void {
    const pageMocks = this.mockResponses.get(pageId);
    if (pageMocks) {
      const patternKey = urlPattern instanceof RegExp ? urlPattern.toString() : urlPattern;
      pageMocks.delete(patternKey);
    }
  }

  /**
   * Get all network requests for a page
   */
  getRequests(
    pageId: string,
    filter?: {
      method?: string;
      urlPattern?: string | RegExp;
      resourceType?: string;
      limit?: number;
    }
  ): InterceptedRequest[] {
    let requests = this.requestHistory.get(pageId) || [];

    if (filter) {
      if (filter.method) {
        requests = requests.filter(req => req.method === filter.method);
      }
      
      if (filter.urlPattern) {
        if (typeof filter.urlPattern === 'string') {
          requests = requests.filter(req => req.url.includes(filter.urlPattern as string));
        } else {
          requests = requests.filter(req => (filter.urlPattern as RegExp).test(req.url));
        }
      }

      if (filter.resourceType) {
        requests = requests.filter(req => req.resourceType === filter.resourceType);
      }

      if (filter.limit && filter.limit > 0) {
        requests = requests.slice(-filter.limit);
      }
    }

    return requests;
  }

  /**
   * Get all network responses for a page
   */
  getResponses(
    pageId: string,
    filter?: {
      status?: number;
      urlPattern?: string | RegExp;
      fromCache?: boolean;
      limit?: number;
    }
  ): InterceptedResponse[] {
    let responses = this.responseHistory.get(pageId) || [];

    if (filter) {
      if (filter.status) {
        responses = responses.filter(res => res.status === filter.status);
      }
      
      if (filter.urlPattern) {
        if (typeof filter.urlPattern === 'string') {
          responses = responses.filter(res => res.url.includes(filter.urlPattern as string));
        } else {
          responses = responses.filter(res => (filter.urlPattern as RegExp).test(res.url));
        }
      }

      if (typeof filter.fromCache === 'boolean') {
        responses = responses.filter(res => res.fromCache === filter.fromCache);
      }

      if (filter.limit && filter.limit > 0) {
        responses = responses.slice(-filter.limit);
      }
    }

    return responses;
  }

  /**
   * Clear network history for a page
   */
  clearHistory(pageId: string): void {
    this.requestHistory.delete(pageId);
    this.responseHistory.delete(pageId);
    
    logInfo(`Network Interceptor: Cleared history for page ${pageId}`);
  }

  /**
   * Handle intercepted network request
   */
  private async handleInterceptedRequest(
    pageId: string,
    route: Route,
    request: PlaywrightRequest
  ): Promise<void> {
    const requestId = this.generateRequestId();
    
    // Create intercepted request record
    const interceptedRequest: InterceptedRequest = {
      id: requestId,
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData() ? Buffer.from(request.postData() || '') : undefined,
      timestamp: new Date(),
      pageId,
      resourceType: request.resourceType(),
      isNavigationRequest: request.isNavigationRequest(),
    };

    // Store request in history
    this.addRequestToHistory(pageId, interceptedRequest);

    // Emit request event
    this.emit('request', {
      type: 'request',
      pageId,
      data: interceptedRequest,
      timestamp: new Date(),
    } as NetworkEvent);

    // Check for interception patterns
    const patterns = this.activeInterceptions.get(pageId) || [];
    let matchedPattern: InterceptionPattern | null = null;

    for (const pattern of patterns) {
      if (this.matchesPattern(interceptedRequest, pattern)) {
        matchedPattern = pattern;
        break;
      }
    }

    // Handle the request based on matched pattern
    if (matchedPattern) {
      await this.executeInterceptionAction(route, request, matchedPattern);
    } else {
      // Check for mock responses
      const mockResponse = this.findMockResponse(pageId, request.url());
      if (mockResponse) {
        await this.fulfillWithMockResponse(route, mockResponse);
      } else {
        // Continue with normal request
        await route.continue();
      }
    }
  }

  /**
   * Handle intercepted network response
   */
  private async handleInterceptedResponse(
    pageId: string,
    response: PlaywrightResponse
  ): Promise<void> {
    try {
      const request = response.request();
      const startTime = Date.now(); // Approximate timing
      
      const interceptedResponse: InterceptedResponse = {
        id: this.generateRequestId(),
        requestId: '', // Would need to track request-response mapping
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        body: undefined, // Getting body asynchronously can be expensive
        timestamp: new Date(),
        timing: {
          startTime,
          endTime: Date.now(),
          duration: 0, // Would calculate from actual timing
        },
        fromCache: false, // Playwright doesn't expose this directly
        size: 0, // Would need to calculate from headers or body
      };

      // Store response in history
      this.addResponseToHistory(pageId, interceptedResponse);

      // Emit response event
      this.emit('response', {
        type: 'response',
        pageId,
        data: interceptedResponse,
        timestamp: new Date(),
      } as NetworkEvent);

    } catch (error) {
      logError(error, 'Network Interceptor: Error handling response');
    }
  }

  /**
   * Handle failed network request
   */
  private handleFailedRequest(pageId: string, request: PlaywrightRequest): void {
    this.emit('requestfailed', {
      type: 'requestfailed',
      pageId,
      data: {
        url: request.url(),
        method: request.method(),
        failure: request.failure(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
    } as NetworkEvent);
  }

  /**
   * Handle finished network request
   */
  private handleFinishedRequest(pageId: string, request: PlaywrightRequest): void {
    this.emit('requestfinished', {
      type: 'requestfinished',
      pageId,
      data: {
        url: request.url(),
        method: request.method(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
    } as NetworkEvent);
  }

  /**
   * Execute interception action based on pattern
   */
  private async executeInterceptionAction(
    route: Route,
    request: PlaywrightRequest,
    pattern: InterceptionPattern
  ): Promise<void> {
    switch (pattern.action) {
      case 'continue':
        // Modify request if specified
        const continueOptions: any = {};
        
        if (pattern.modifyHeaders) {
          continueOptions.headers = { ...request.headers(), ...pattern.modifyHeaders };
        }
        
        if (pattern.modifyBody) {
          continueOptions.postData = pattern.modifyBody;
        }
        
        await route.continue(continueOptions);
        break;

      case 'abort':
        const errorText = pattern.failure?.errorText || 'Request aborted by interception';
        await route.abort(errorText);
        break;

      case 'mock':
        if (pattern.mockResponse) {
          await this.fulfillWithMockResponse(route, pattern.mockResponse);
        } else {
          await route.continue();
        }
        break;

      default:
        logWarning(`Network Interceptor: Unknown action: ${pattern.action}`);
        await route.continue();
    }
  }

  /**
   * Fulfill request with mock response
   */
  private async fulfillWithMockResponse(route: Route, mockResponse: MockResponse): Promise<void> {
    // Add delay if specified
    if (mockResponse.delay) {
      await new Promise(resolve => setTimeout(resolve, mockResponse.delay));
    }

    await route.fulfill({
      status: mockResponse.status,
      contentType: mockResponse.headers?.['content-type'] || 'application/json',
      headers: mockResponse.headers,
      body: typeof mockResponse.body === 'string' 
        ? mockResponse.body 
        : mockResponse.body?.toString() || '',
    });
  }

  /**
   * Check if request matches interception pattern
   */
  private matchesPattern(request: InterceptedRequest, pattern: InterceptionPattern): boolean {
    // Check URL pattern
    let urlMatches = false;
    if (typeof pattern.urlPattern === 'string') {
      urlMatches = request.url.includes(pattern.urlPattern);
    } else {
      urlMatches = pattern.urlPattern.test(request.url);
    }

    if (!urlMatches) return false;

    // Check method if specified
    if (pattern.method && pattern.method !== request.method) {
      return false;
    }

    // Check resource type if specified
    if (pattern.resourceType && pattern.resourceType !== request.resourceType) {
      return false;
    }

    return true;
  }

  /**
   * Find mock response for URL
   */
  private findMockResponse(pageId: string, url: string): MockResponse | null {
    const pageMocks = this.mockResponses.get(pageId);
    if (!pageMocks) return null;

    for (const [patternKey, mockResponse] of pageMocks) {
      try {
        // Try to treat as regex first
        const regex = new RegExp(patternKey.replace(/^\/|\/$/g, ''));
        if (regex.test(url)) {
          return mockResponse;
        }
      } catch {
        // If regex parsing fails, treat as string
        if (url.includes(patternKey)) {
          return mockResponse;
        }
      }
    }

    return null;
  }

  /**
   * Add request to history with size limit
   */
  private addRequestToHistory(pageId: string, request: InterceptedRequest): void {
    let requests = this.requestHistory.get(pageId) || [];
    requests.push(request);

    // Limit history size
    if (requests.length > this.maxHistorySize) {
      requests = requests.slice(-this.maxHistorySize);
    }

    this.requestHistory.set(pageId, requests);
  }

  /**
   * Add response to history with size limit
   */
  private addResponseToHistory(pageId: string, response: InterceptedResponse): void {
    let responses = this.responseHistory.get(pageId) || [];
    responses.push(response);

    // Limit history size
    if (responses.length > this.maxHistorySize) {
      responses = responses.slice(-this.maxHistorySize);
    }

    this.responseHistory.set(pageId, responses);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Get interception statistics
   */
  getStatistics(): {
    activePagesWithInterception: number;
    totalRequests: number;
    totalResponses: number;
    totalMockResponses: number;
    interceptionPatterns: number;
  } {
    let totalRequests = 0;
    let totalResponses = 0;
    let totalMockResponses = 0;
    let interceptionPatterns = 0;

    for (const requests of this.requestHistory.values()) {
      totalRequests += requests.length;
    }

    for (const responses of this.responseHistory.values()) {
      totalResponses += responses.length;
    }

    for (const mocks of this.mockResponses.values()) {
      totalMockResponses += mocks.size;
    }

    for (const patterns of this.activeInterceptions.values()) {
      interceptionPatterns += patterns.length;
    }

    return {
      activePagesWithInterception: this.activeInterceptions.size,
      totalRequests,
      totalResponses,
      totalMockResponses,
      interceptionPatterns,
    };
  }

  /**
   * Clean up resources for a page
   */
  async cleanupPage(pageId: string): Promise<void> {
    await this.disableInterception(pageId);
    this.clearHistory(pageId);
    this.mockResponses.delete(pageId);
    
    logInfo(`Network Interceptor: Cleaned up resources for page ${pageId}`);
  }

  /**
   * Clean up all resources
   */
  cleanup(): void {
    this.activeInterceptions.clear();
    this.requestHistory.clear();
    this.responseHistory.clear();
    this.mockResponses.clear();
    this.removeAllListeners();
    
    logInfo('Network Interceptor: Cleaned up all resources');
  }
}