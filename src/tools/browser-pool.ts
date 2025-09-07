import { Browser, BrowserContext, Page } from 'playwright';
import { SessionManager } from '../services/session.js';
import { MCPServerError, MCP_ERROR_CODES } from '../types.js';
import { logError, logInfo } from '../utils/errors.js';

/**
 * Browser Pool Management System
 * Manages browser instances, contexts, and pages efficiently
 */
export interface ContextOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
  deviceScaleFactor?: number;
  hasTouch?: boolean;
  locale?: string;
  timezone?: string;
  permissions?: string[];
  extraHTTPHeaders?: Record<string, string>;
  offline?: boolean;
  httpCredentials?: { username: string; password: string };
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
  colorScheme?: 'light' | 'dark' | 'no-preference';
  reducedMotion?: 'reduce' | 'no-preference';
  forcedColors?: 'active' | 'none';
  screen?: { width: number; height: number };
}

export interface BrowserPoolStats {
  browsers: {
    total: number;
    byType: Record<string, number>;
    connected: number;
    disconnected: number;
  };
  contexts: {
    total: number;
    byBrowser: Record<string, number>;
    active: number;
  };
  pages: {
    total: number;
    byContext: Record<string, number>;
    active: number;
  };
  memory?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

export class BrowserPool {
  private sessionManager: SessionManager;
  private connectionHealthCheck: Map<string, NodeJS.Timeout> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
    
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute
  }

  /**
   * Get browser instance by type with connection pooling
   */
  async getBrowser(type: 'chromium' | 'firefox' | 'webkit', options?: any): Promise<{ browserId: string; browser: Browser }> {
    try {
      // Check for existing healthy browser of same type
      const existingBrowser = this.findHealthyBrowser(type);
      if (existingBrowser) {
        return existingBrowser;
      }

      // Launch new browser if none available
      const { browserId } = await this.sessionManager.createBrowser(type, options);
      const browserSession = this.sessionManager.getBrowserSession(browserId);
      
      // Start health monitoring
      this.startHealthMonitoring(browserId, browserSession.browser);
      
      logInfo(`Browser pool: Created new ${type} browser ${browserId}`);
      return { browserId, browser: browserSession.browser };
    } catch (error) {
      logError(error, `Failed to get ${type} browser from pool`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get browser from pool: ${error.message}`
      );
    }
  }

  /**
   * Get context with optimal reuse strategy
   */
  async getContext(
    browserId: string, 
    options: ContextOptions = {}
  ): Promise<{ contextId: string; context: BrowserContext }> {
    try {
      const browserSession = this.sessionManager.getBrowserSession(browserId);
      
      // Check for reusable context with similar options
      const reuseableContext = this.findReuseableContext(browserId, options);
      if (reuseableContext && this.shouldReuseContext(options)) {
        return reuseableContext;
      }

      // Create new context
      const contextId = await this.sessionManager.createContext(browserId, options);
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      logInfo(`Browser pool: Created new context ${contextId} for browser ${browserId}`);
      return { contextId, context: contextSession.context };
    } catch (error) {
      logError(error, `Failed to get context from pool`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get context from pool: ${error.message}`
      );
    }
  }

  /**
   * Get page from context
   */
  async getPage(contextId: string): Promise<{ pageId: string; page: Page }> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      // Check for available page in context
      const existingPage = this.findAvailablePage(contextId);
      if (existingPage) {
        return existingPage;
      }

      // Create new page
      const page = await contextSession.context.newPage();
      const pageId = await this.sessionManager.createPageSession(contextId, page);
      
      logInfo(`Browser pool: Created new page ${pageId} in context ${contextId}`);
      return { pageId, page };
    } catch (error) {
      logError(error, `Failed to get page from pool`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get page from pool: ${error.message}`
      );
    }
  }

  /**
   * Check if browser is connected and healthy
   */
  async isBrowserConnected(browserId: string): Promise<boolean> {
    try {
      const browserSession = this.sessionManager.getBrowserSession(browserId);
      return browserSession.browser.isConnected();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all browsers with their connection status
   */
  getBrowsersWithStatus(): Array<{
    id: string;
    type: string;
    version: string;
    connected: boolean;
    contexts: number;
    pages: number;
    createdAt: string;
  }> {
    return this.sessionManager.listBrowserSessions().map(session => ({
      id: session.id,
      type: session.browserType,
      version: session.browser.version(),
      connected: session.browser.isConnected(),
      contexts: session.contexts.size,
      pages: Array.from(session.contexts.values()).reduce((total, ctx) => total + ctx.pages.size, 0),
      createdAt: session.createdAt.toISOString(),
    }));
  }

  /**
   * Get detailed pool statistics
   */
  getPoolStats(): BrowserPoolStats {
    const browsers = this.sessionManager.listBrowserSessions();
    const contexts = browsers.flatMap(b => this.sessionManager.listContextSessions(b.id));
    const pages = contexts.flatMap(c => this.sessionManager.listPageSessions(c.id));

    const browsersByType: Record<string, number> = {};
    let connectedBrowsers = 0;
    
    browsers.forEach(b => {
      browsersByType[b.browserType] = (browsersByType[b.browserType] || 0) + 1;
      if (b.browser.isConnected()) {
        connectedBrowsers++;
      }
    });

    const contextsByBrowser: Record<string, number> = {};
    browsers.forEach(b => {
      contextsByBrowser[b.id] = b.contexts.size;
    });

    const pagesByContext: Record<string, number> = {};
    contexts.forEach(c => {
      pagesByContext[c.id] = c.pages.size;
    });

    // Get memory stats if available
    const memoryStats = process.memoryUsage ? {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
    } : undefined;

    return {
      browsers: {
        total: browsers.length,
        byType: browsersByType,
        connected: connectedBrowsers,
        disconnected: browsers.length - connectedBrowsers,
      },
      contexts: {
        total: contexts.length,
        byBrowser: contextsByBrowser,
        active: contexts.filter(c => c.pages.size > 0).length,
      },
      pages: {
        total: pages.length,
        byContext: pagesByContext,
        active: pages.length, // All pages are considered active
      },
      memory: memoryStats,
    };
  }

  /**
   * Cleanup resources and perform maintenance
   */
  async cleanup(): Promise<void> {
    // Clear health check intervals
    for (const [browserId, interval] of this.connectionHealthCheck) {
      clearInterval(interval);
    }
    this.connectionHealthCheck.clear();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Shutdown session manager
    await this.sessionManager.shutdown();
    
    logInfo('Browser pool: Cleanup completed');
  }

  private findHealthyBrowser(type: string): { browserId: string; browser: Browser } | null {
    const browsers = this.sessionManager.listBrowserSessions()
      .filter(session => session.browserType === type && session.browser.isConnected())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Prefer newer browsers

    if (browsers.length === 0) {
      return null;
    }

    const session = browsers[0];
    return { browserId: session.id, browser: session.browser };
  }

  private findReuseableContext(browserId: string, options: ContextOptions): { contextId: string; context: BrowserContext } | null {
    const contexts = this.sessionManager.listContextSessions(browserId);
    
    // For now, we'll be conservative and not reuse contexts with different options
    // This can be enhanced to match contexts with compatible options
    return null;
  }

  private shouldReuseContext(options: ContextOptions): boolean {
    // Don't reuse contexts if they have specific configurations
    return !options.permissions && 
           !options.extraHTTPHeaders && 
           !options.httpCredentials &&
           !options.geolocation &&
           Object.keys(options).length === 0;
  }

  private findAvailablePage(contextId: string): { pageId: string; page: Page } | null {
    const pages = this.sessionManager.listPageSessions(contextId);
    
    // Return the most recently created page
    if (pages.length > 0) {
      const latestPage = pages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return { pageId: latestPage.id, page: latestPage.page };
    }
    
    return null;
  }

  private startHealthMonitoring(browserId: string, browser: Browser): void {
    const interval = setInterval(async () => {
      try {
        if (!browser.isConnected()) {
          logInfo(`Browser pool: Browser ${browserId} disconnected, cleaning up`);
          await this.sessionManager.closeBrowserSession(browserId, true);
          clearInterval(interval);
          this.connectionHealthCheck.delete(browserId);
        }
      } catch (error) {
        logError(error, `Health check failed for browser ${browserId}`);
      }
    }, 30000); // Check every 30 seconds

    this.connectionHealthCheck.set(browserId, interval);
  }

  private async performCleanup(): Promise<void> {
    try {
      // Remove disconnected browsers
      const browsers = this.sessionManager.listBrowserSessions();
      for (const browserSession of browsers) {
        if (!browserSession.browser.isConnected()) {
          logInfo(`Browser pool: Cleaning up disconnected browser ${browserSession.id}`);
          await this.sessionManager.closeBrowserSession(browserSession.id, true);
        }
      }

      // Log pool stats periodically
      const stats = this.getPoolStats();
      logInfo(`Browser pool stats: ${stats.browsers.total} browsers, ${stats.contexts.total} contexts, ${stats.pages.total} pages`);
    } catch (error) {
      logError(error, 'Failed to perform browser pool cleanup');
    }
  }
}