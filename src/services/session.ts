import { v4 as uuidv4 } from 'uuid';
import { 
  BrowserSession, 
  BrowserContextSession, 
  PageSession,
  SessionManagerConfig,
  SessionStats,
  BrowserSessionError
} from '../types.js';
import { Browser, BrowserContext, Page } from 'playwright';
import { logError } from '../utils/errors.js';

/**
 * Manages browser sessions, contexts, and pages with automatic cleanup
 */
export class SessionManager {
  private browsers: Map<string, BrowserSession> = new Map();
  private contexts: Map<string, BrowserContextSession> = new Map();
  private pages: Map<string, PageSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private readonly config: SessionManagerConfig = {
    maxBrowsers: 5,
    maxContextsPerBrowser: 10,
    maxPagesPerContext: 20,
    sessionTimeout: 3600000, // 1 hour
    cleanupInterval: 300000, // 5 minutes
  };

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = { ...this.config, ...config };
    this.startCleanup();
  }

  /**
   * Creates a new browser session
   */
  async createBrowserSession(
    browser: Browser,
    browserType: 'chromium' | 'firefox' | 'webkit'
  ): Promise<string> {
    // Check browser limit
    if (this.browsers.size >= this.config.maxBrowsers) {
      await this.cleanupOldestBrowser();
    }

    const sessionId = uuidv4();
    const session: BrowserSession = {
      id: sessionId,
      browser,
      browserType,
      contexts: new Map(),
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    this.browsers.set(sessionId, session);

    // Set up browser event handlers
    browser.on('disconnected', () => {
      this.removeBrowserSession(sessionId);
    });

    return sessionId;
  }

  /**
   * Creates a new browser context
   */
  async createContextSession(
    browserId: string,
    context: BrowserContext
  ): Promise<string> {
    const browserSession = this.getBrowserSession(browserId);
    
    // Check context limit
    if (browserSession.contexts.size >= this.config.maxContextsPerBrowser) {
      await this.cleanupOldestContext(browserId);
    }

    const contextId = uuidv4();
    const contextSession: BrowserContextSession = {
      id: contextId,
      context,
      pages: new Map(),
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    browserSession.contexts.set(contextId, contextSession);
    this.contexts.set(contextId, contextSession);
    browserSession.lastUsed = new Date();

    // Set up context event handlers
    context.on('close', () => {
      this.removeContextSession(contextId);
    });

    return contextId;
  }

  /**
   * Creates a new page session
   */
  async createPageSession(
    contextId: string,
    page: Page
  ): Promise<string> {
    const contextSession = this.getContextSession(contextId);
    
    // Check page limit
    if (contextSession.pages.size >= this.config.maxPagesPerContext) {
      await this.cleanupOldestPage(contextId);
    }

    const pageId = uuidv4();
    const pageSession: PageSession = {
      id: pageId,
      page,
      url: page.url(),
      title: await page.title().catch(() => ''),
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    contextSession.pages.set(pageId, pageSession);
    this.pages.set(pageId, pageSession);
    contextSession.lastUsed = new Date();

    // Update browser session timestamp
    const browserSession = this.findBrowserForContext(contextId);
    if (browserSession) {
      browserSession.lastUsed = new Date();
    }

    // Set up page event handlers
    page.on('close', () => {
      this.removePageSession(pageId);
    });

    return pageId;
  }

  /**
   * Gets a browser session by ID
   */
  getBrowserSession(browserId: string): BrowserSession {
    const session = this.browsers.get(browserId);
    if (!session) {
      throw new BrowserSessionError(
        `Browser session not found: ${browserId}`,
        browserId
      );
    }

    // Check if browser is still connected
    if (!session.browser.isConnected()) {
      this.removeBrowserSession(browserId);
      throw new BrowserSessionError(
        `Browser session is no longer connected: ${browserId}`,
        browserId
      );
    }

    session.lastUsed = new Date();
    return session;
  }

  /**
   * Gets a context session by ID
   */
  getContextSession(contextId: string): BrowserContextSession {
    const session = this.contexts.get(contextId);
    if (!session) {
      throw new BrowserSessionError(
        `Context session not found: ${contextId}`,
        contextId
      );
    }

    session.lastUsed = new Date();
    
    // Update browser session timestamp
    const browserSession = this.findBrowserForContext(contextId);
    if (browserSession) {
      browserSession.lastUsed = new Date();
    }

    return session;
  }

  /**
   * Gets a page session by ID
   */
  getPageSession(pageId: string): PageSession {
    const session = this.pages.get(pageId);
    if (!session) {
      throw new BrowserSessionError(
        `Page session not found: ${pageId}`,
        pageId
      );
    }

    // Check if page is still attached
    if (session.page.isClosed()) {
      this.removePageSession(pageId);
      throw new BrowserSessionError(
        `Page session is closed: ${pageId}`,
        pageId
      );
    }

    session.lastUsed = new Date();
    
    // Update context and browser timestamps
    const contextSession = this.findContextForPage(pageId);
    if (contextSession) {
      contextSession.lastUsed = new Date();
      
      const browserSession = this.findBrowserForContext(contextSession.id);
      if (browserSession) {
        browserSession.lastUsed = new Date();
      }
    }

    return session;
  }

  /**
   * Lists all browser sessions
   */
  listBrowserSessions(): BrowserSession[] {
    return Array.from(this.browsers.values());
  }

  /**
   * Lists contexts for a browser
   */
  listContextSessions(browserId: string): BrowserContextSession[] {
    const browserSession = this.getBrowserSession(browserId);
    return Array.from(browserSession.contexts.values());
  }

  /**
   * Lists pages for a context
   */
  listPageSessions(contextId: string): PageSession[] {
    const contextSession = this.getContextSession(contextId);
    return Array.from(contextSession.pages.values());
  }

  /**
   * Closes and removes a browser session
   */
  async closeBrowserSession(browserId: string, force: boolean = false): Promise<void> {
    const session = this.browsers.get(browserId);
    if (!session) {
      return; // Already removed
    }

    try {
      // Close all contexts first
      const contextIds = Array.from(session.contexts.keys());
      await Promise.all(contextIds.map(id => this.closeContextSession(id)));

      // Close browser
      if (session.browser.isConnected()) {
        await session.browser.close();
      }
    } catch (error) {
      if (!force) {
        logError(error, `Failed to close browser session ${browserId}`);
        throw error;
      }
      logError(error, `Force closing browser session ${browserId}`);
    }

    this.removeBrowserSession(browserId);
  }

  /**
   * Closes and removes a context session
   */
  async closeContextSession(contextId: string): Promise<void> {
    const session = this.contexts.get(contextId);
    if (!session) {
      return; // Already removed
    }

    try {
      // Close all pages first
      const pageIds = Array.from(session.pages.keys());
      await Promise.all(pageIds.map(id => this.closePageSession(id)));

      // Close context
      await session.context.close();
    } catch (error) {
      logError(error, `Failed to close context session ${contextId}`);
    }

    this.removeContextSession(contextId);
  }

  /**
   * Closes and removes a page session
   */
  async closePageSession(pageId: string): Promise<void> {
    const session = this.pages.get(pageId);
    if (!session) {
      return; // Already removed
    }

    try {
      if (!session.page.isClosed()) {
        await session.page.close();
      }
    } catch (error) {
      logError(error, `Failed to close page session ${pageId}`);
    }

    this.removePageSession(pageId);
  }

  /**
   * Gets session statistics
   */
  getStats(): SessionStats {
    const memoryUsage = process.memoryUsage();
    
    return {
      totalBrowsers: this.browsers.size,
      totalContexts: this.contexts.size,
      totalPages: this.pages.size,
      memoryUsage: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
      },
    };
  }

  /**
   * Performs cleanup of expired sessions
   */
  async performCleanup(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    // Find expired browser sessions
    for (const [id, session] of this.browsers) {
      if (now - session.lastUsed.getTime() > this.config.sessionTimeout) {
        expiredSessions.push(id);
      }
    }

    // Clean up expired sessions
    for (const sessionId of expiredSessions) {
      try {
        await this.closeBrowserSession(sessionId, true);
      } catch (error) {
        logError(error, `Failed to cleanup browser session ${sessionId}`);
      }
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired browser sessions`);
    }
  }

  /**
   * Shuts down the session manager and closes all sessions
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all browser sessions
    const browserIds = Array.from(this.browsers.keys());
    await Promise.all(
      browserIds.map(id => this.closeBrowserSession(id, true))
    );

    console.log('Session manager shut down successfully');
  }

  // Private helper methods

  private removeBrowserSession(browserId: string): void {
    const session = this.browsers.get(browserId);
    if (!session) return;

    // Remove all contexts
    for (const contextId of session.contexts.keys()) {
      this.removeContextSession(contextId);
    }

    this.browsers.delete(browserId);
  }

  private removeContextSession(contextId: string): void {
    const session = this.contexts.get(contextId);
    if (!session) return;

    // Remove all pages
    for (const pageId of session.pages.keys()) {
      this.removePageSession(pageId);
    }

    // Remove from browser session
    const browserSession = this.findBrowserForContext(contextId);
    if (browserSession) {
      browserSession.contexts.delete(contextId);
    }

    this.contexts.delete(contextId);
  }

  private removePageSession(pageId: string): void {
    const session = this.pages.get(pageId);
    if (!session) return;

    // Remove from context session
    const contextSession = this.findContextForPage(pageId);
    if (contextSession) {
      contextSession.pages.delete(pageId);
    }

    this.pages.delete(pageId);
  }

  private findBrowserForContext(contextId: string): BrowserSession | null {
    for (const session of this.browsers.values()) {
      if (session.contexts.has(contextId)) {
        return session;
      }
    }
    return null;
  }

  private findContextForPage(pageId: string): BrowserContextSession | null {
    for (const session of this.contexts.values()) {
      if (session.pages.has(pageId)) {
        return session;
      }
    }
    return null;
  }

  private async cleanupOldestBrowser(): Promise<void> {
    let oldest: { id: string; session: BrowserSession } | null = null;
    
    for (const [id, session] of this.browsers) {
      if (!oldest || session.lastUsed < oldest.session.lastUsed) {
        oldest = { id, session };
      }
    }

    if (oldest) {
      await this.closeBrowserSession(oldest.id, true);
    }
  }

  private async cleanupOldestContext(browserId: string): Promise<void> {
    const browserSession = this.getBrowserSession(browserId);
    let oldest: { id: string; session: BrowserContextSession } | null = null;
    
    for (const [id, session] of browserSession.contexts) {
      if (!oldest || session.lastUsed < oldest.session.lastUsed) {
        oldest = { id, session };
      }
    }

    if (oldest) {
      await this.closeContextSession(oldest.id);
    }
  }

  private async cleanupOldestPage(contextId: string): Promise<void> {
    const contextSession = this.getContextSession(contextId);
    let oldest: { id: string; session: PageSession } | null = null;
    
    for (const [id, session] of contextSession.pages) {
      if (!oldest || session.lastUsed < oldest.session.lastUsed) {
        oldest = { id, session };
      }
    }

    if (oldest) {
      await this.closePageSession(oldest.id);
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(
      () => this.performCleanup().catch(error => 
        logError(error, 'Session cleanup failed')
      ),
      this.config.cleanupInterval
    );
  }
}