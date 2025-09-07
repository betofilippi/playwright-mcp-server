/**
 * Page Resource Implementation
 * Exposes page contexts as MCP resources
 */

import { EventEmitter } from 'events';
import { MCPResource } from '../protocol/MCPProtocol.js';
import { PageSession, BrowserContextSession } from '../types.js';

export interface PageResourceData {
  id: string;
  contextId: string;
  browserId: string;
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  } | null;
  loadState: 'load' | 'domcontentloaded' | 'networkidle' | 'unknown';
  isVisible: boolean;
  createdAt: string;
  lastUsed: string;
  performance?: {
    navigationStart?: number;
    domContentLoaded?: number;
    loadComplete?: number;
  };
  accessibility?: {
    violations: number;
    warnings: number;
  };
  console: {
    errors: number;
    warnings: number;
    logs: number;
  };
  network: {
    requests: number;
    responses: number;
    failures: number;
  };
}

export class PageResourceManager extends EventEmitter {
  private pageSessions = new Map<string, PageSession>();
  private contextSessions = new Map<string, BrowserContextSession>();
  private resources = new Map<string, MCPResource>();
  private pageMetrics = new Map<string, {
    console: { errors: number; warnings: number; logs: number };
    network: { requests: number; responses: number; failures: number };
  }>();

  constructor() {
    super();
  }

  /**
   * Register a page session as a resource
   */
  registerPageSession(pageSession: PageSession, contextSession: BrowserContextSession): void {
    this.pageSessions.set(pageSession.id, pageSession);
    this.contextSessions.set(pageSession.id, contextSession);

    const resource: MCPResource = {
      uri: `page://sessions/${pageSession.id}`,
      name: `Page: ${pageSession.title || pageSession.url}`,
      description: `Web page at ${pageSession.url}`,
      mimeType: 'application/json'
    };

    this.resources.set(pageSession.id, resource);
    this.initializePageMetrics(pageSession.id);
    this.setupPageEventListeners(pageSession);
    
    this.emit('resource_added', resource);
  }

  /**
   * Unregister a page session
   */
  unregisterPageSession(pageId: string): void {
    const resource = this.resources.get(pageId);
    if (resource) {
      this.resources.delete(pageId);
      this.pageSessions.delete(pageId);
      this.contextSessions.delete(pageId);
      this.pageMetrics.delete(pageId);
      this.emit('resource_removed', resource);
    }
  }

  /**
   * Get all page resources
   */
  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get page resource by ID
   */
  getResource(pageId: string): MCPResource | undefined {
    return this.resources.get(pageId);
  }

  /**
   * Read page resource data
   */
  async readPageResource(pageId: string): Promise<PageResourceData | null> {
    const pageSession = this.pageSessions.get(pageId);
    const contextSession = this.contextSessions.get(pageId);
    
    if (!pageSession || !contextSession) return null;

    try {
      const page = pageSession.page;
      
      // Get current page info
      const url = page.url();
      const title = await page.title().catch(() => pageSession.title);
      const viewport = page.viewportSize();
      
      // Get load state
      let loadState: PageResourceData['loadState'] = 'unknown';
      try {
        // This is a simplified check - in real implementation we'd track this
        loadState = 'load';
      } catch {
        loadState = 'unknown';
      }

      // Get performance metrics
      const performance = await this.getPagePerformanceMetrics(page);
      
      // Get accessibility info (simplified)
      const accessibility = await this.getPageAccessibilityInfo(page);
      
      // Get metrics
      const metrics = this.pageMetrics.get(pageId) || {
        console: { errors: 0, warnings: 0, logs: 0 },
        network: { requests: 0, responses: 0, failures: 0 }
      };

      return {
        id: pageSession.id,
        contextId: contextSession.id,
        browserId: this.getBrowserIdFromContext(contextSession),
        url,
        title,
        viewport,
        loadState,
        isVisible: !page.isClosed(),
        createdAt: pageSession.createdAt.toISOString(),
        lastUsed: pageSession.lastUsed.toISOString(),
        performance,
        accessibility,
        console: metrics.console,
        network: metrics.network
      };

    } catch (error) {
      console.error(`Error reading page resource ${pageId}:`, error);
      return null;
    }
  }

  /**
   * Update page session (refresh resource)
   */
  async updatePageSession(pageId: string): Promise<void> {
    const pageSession = this.pageSessions.get(pageId);
    const resource = this.resources.get(pageId);
    
    if (pageSession && resource) {
      pageSession.lastUsed = new Date();
      
      try {
        // Update URL and title
        const url = pageSession.page.url();
        const title = await pageSession.page.title();
        
        pageSession.url = url;
        pageSession.title = title;
        
        // Update resource
        resource.name = `Page: ${title || url}`;
        resource.description = `Web page at ${url}`;
        
        this.emit('resource_updated', resource);
      } catch (error) {
        console.error(`Error updating page session ${pageId}:`, error);
      }
    }
  }

  /**
   * Take screenshot of page
   */
  async takePageScreenshot(pageId: string, options: {
    fullPage?: boolean;
    quality?: number;
    type?: 'png' | 'jpeg';
    clip?: { x: number; y: number; width: number; height: number };
  } = {}): Promise<{
    data: string;
    format: string;
    dimensions: { width: number; height: number };
  } | null> {
    const pageSession = this.pageSessions.get(pageId);
    if (!pageSession) return null;

    try {
      const screenshotBuffer = await pageSession.page.screenshot({
        fullPage: options.fullPage || false,
        quality: options.quality,
        type: options.type || 'png',
        clip: options.clip
      });

      // Get viewport for dimensions
      const viewport = pageSession.page.viewportSize() || { width: 1280, height: 720 };

      return {
        data: screenshotBuffer.toString('base64'),
        format: options.type || 'png',
        dimensions: {
          width: options.clip?.width || viewport.width,
          height: options.clip?.height || viewport.height
        }
      };

    } catch (error) {
      console.error(`Error taking screenshot of page ${pageId}:`, error);
      return null;
    }
  }

  /**
   * Get page content
   */
  async getPageContent(pageId: string): Promise<string | null> {
    const pageSession = this.pageSessions.get(pageId);
    if (!pageSession) return null;

    try {
      return await pageSession.page.content();
    } catch (error) {
      console.error(`Error getting content of page ${pageId}:`, error);
      return null;
    }
  }

  /**
   * Get page HTML
   */
  async getPageHTML(pageId: string): Promise<string | null> {
    return this.getPageContent(pageId);
  }

  /**
   * Get page text content
   */
  async getPageText(pageId: string): Promise<string | null> {
    const pageSession = this.pageSessions.get(pageId);
    if (!pageSession) return null;

    try {
      return await pageSession.page.textContent('body') || '';
    } catch (error) {
      console.error(`Error getting text content of page ${pageId}:`, error);
      return null;
    }
  }

  /**
   * Search page resources
   */
  searchResources(query: string): MCPResource[] {
    const normalizedQuery = query.toLowerCase();
    
    return Array.from(this.resources.values()).filter(resource => 
      resource.name.toLowerCase().includes(normalizedQuery) ||
      resource.description?.toLowerCase().includes(normalizedQuery) ||
      resource.uri.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * Get resources by URL pattern
   */
  getResourcesByUrl(urlPattern: string): MCPResource[] {
    const regex = new RegExp(urlPattern, 'i');
    
    return Array.from(this.pageSessions.values())
      .filter(session => regex.test(session.url))
      .map(session => this.resources.get(session.id))
      .filter(Boolean) as MCPResource[];
  }

  /**
   * List all page sessions with basic info
   */
  listPageSessions(): Array<{
    id: string;
    contextId: string;
    url: string;
    title: string;
    createdAt: string;
    isVisible: boolean;
  }> {
    return Array.from(this.pageSessions.values()).map(session => ({
      id: session.id,
      contextId: this.contextSessions.get(session.id)?.id || 'unknown',
      url: session.url,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      isVisible: !session.page.isClosed()
    }));
  }

  /**
   * Close page session and remove resource
   */
  async closePageSession(pageId: string): Promise<boolean> {
    const pageSession = this.pageSessions.get(pageId);
    if (!pageSession) return false;

    try {
      await pageSession.page.close();
      this.unregisterPageSession(pageId);
      return true;
    } catch (error) {
      console.error(`Error closing page session ${pageId}:`, error);
      return false;
    }
  }

  /**
   * Initialize page metrics tracking
   */
  private initializePageMetrics(pageId: string): void {
    this.pageMetrics.set(pageId, {
      console: { errors: 0, warnings: 0, logs: 0 },
      network: { requests: 0, responses: 0, failures: 0 }
    });
  }

  /**
   * Setup page event listeners for metrics
   */
  private setupPageEventListeners(pageSession: PageSession): void {
    const page = pageSession.page;
    const metrics = this.pageMetrics.get(pageSession.id);
    if (!metrics) return;

    // Console events
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') metrics.console.errors++;
      else if (type === 'warning') metrics.console.warnings++;
      else metrics.console.logs++;
    });

    // Request events
    page.on('request', () => {
      metrics.network.requests++;
    });

    page.on('response', () => {
      metrics.network.responses++;
    });

    page.on('requestfailed', () => {
      metrics.network.failures++;
    });
  }

  /**
   * Get page performance metrics
   */
  private async getPagePerformanceMetrics(page: any): Promise<PageResourceData['performance']> {
    try {
      const metrics = await page.evaluate(() => {
        const timing = performance.timing;
        return {
          navigationStart: timing.navigationStart,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          loadComplete: timing.loadEventEnd - timing.navigationStart
        };
      });
      return metrics;
    } catch {
      return undefined;
    }
  }

  /**
   * Get page accessibility information (simplified)
   */
  private async getPageAccessibilityInfo(page: any): Promise<PageResourceData['accessibility']> {
    try {
      // This is a simplified implementation
      // In a real implementation, you'd use axe-core or similar
      const violations = await page.evaluate(() => {
        const images = document.querySelectorAll('img:not([alt])').length;
        const inputs = document.querySelectorAll('input:not([label]):not([aria-label])').length;
        return images + inputs;
      });

      return {
        violations,
        warnings: 0
      };
    } catch {
      return {
        violations: 0,
        warnings: 0
      };
    }
  }

  /**
   * Get browser ID from context session
   */
  private getBrowserIdFromContext(contextSession: BrowserContextSession): string {
    // This would need to be tracked when creating the context
    // For now, return a placeholder
    return 'browser-id-unknown';
  }

  /**
   * Get page session by ID
   */
  getPageSession(pageId: string): PageSession | undefined {
    return this.pageSessions.get(pageId);
  }

  /**
   * Get context session for page
   */
  getContextSession(pageId: string): BrowserContextSession | undefined {
    return this.contextSessions.get(pageId);
  }

  /**
   * Check if page resource exists
   */
  hasResource(pageId: string): boolean {
    return this.resources.has(pageId);
  }

  /**
   * Get page metrics
   */
  getPageMetrics(pageId: string): {
    console: { errors: number; warnings: number; logs: number };
    network: { requests: number; responses: number; failures: number };
  } | undefined {
    return this.pageMetrics.get(pageId);
  }

  /**
   * Reset page metrics
   */
  resetPageMetrics(pageId: string): void {
    const metrics = this.pageMetrics.get(pageId);
    if (metrics) {
      metrics.console = { errors: 0, warnings: 0, logs: 0 };
      metrics.network = { requests: 0, responses: 0, failures: 0 };
    }
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalPages: number;
    activePages: number;
    totalRequests: number;
    totalErrors: number;
    avgLoadTime?: number;
  } {
    let totalRequests = 0;
    let totalErrors = 0;
    let activePages = 0;

    for (const [pageId, metrics] of this.pageMetrics) {
      totalRequests += metrics.network.requests;
      totalErrors += metrics.console.errors + metrics.network.failures;
      
      const pageSession = this.pageSessions.get(pageId);
      if (pageSession && !pageSession.page.isClosed()) {
        activePages++;
      }
    }

    return {
      totalPages: this.pageSessions.size,
      activePages,
      totalRequests,
      totalErrors
    };
  }
}