import { chromium, firefox, webkit, Browser, LaunchOptions } from 'playwright';
import { SessionManager } from './session.js';
import { 
  BrowserLaunchSchema, 
  ContextCreateSchema,
  MCPServerError,
  MCP_ERROR_CODES
} from '../types.js';
import { validateInput, validateNavigationURL, validateBrowserArgs } from '../utils/validation.js';
import { logError } from '../utils/errors.js';

/**
 * Service wrapper for Playwright operations with session management
 */
export class PlaywrightService {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Launches a new browser and creates a session
   */
  async launchBrowser(
    browserType: 'chromium' | 'firefox' | 'webkit',
    options: any
  ): Promise<{ browserId: string; version: string }> {
    const validatedOptions = validateInput(BrowserLaunchSchema, options);

    // Prepare launch options
    const launchOptions: LaunchOptions = {
      headless: validatedOptions.headless,
      timeout: validatedOptions.timeout,
    };

    if (validatedOptions.args) {
      launchOptions.args = validateBrowserArgs(validatedOptions.args);
    }

    if (validatedOptions.executablePath) {
      launchOptions.executablePath = validatedOptions.executablePath;
    }

    if (validatedOptions.viewport) {
      // Viewport will be set on context creation, not browser launch
    }

    try {
      let browser: Browser;
      
      switch (browserType) {
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `Unsupported browser type: ${browserType}`
          );
      }

      const browserId = await this.sessionManager.createBrowserSession(browser, browserType);
      const version = browser.version();

      return { browserId, version };
    } catch (error) {
      logError(error, `Failed to launch ${browserType} browser`);
      throw error;
    }
  }

  /**
   * Closes a browser session
   */
  async closeBrowser(browserId: string, force: boolean = false): Promise<void> {
    await this.sessionManager.closeBrowserSession(browserId, force);
  }

  /**
   * Creates a new browser context
   */
  async createContext(
    browserId: string,
    options: any
  ): Promise<{ contextId: string }> {
    const validatedOptions = validateInput(ContextCreateSchema, options);
    const browserSession = this.sessionManager.getBrowserSession(browserId);

    try {
      const contextOptions: any = {};

      if (validatedOptions.userAgent) {
        contextOptions.userAgent = validatedOptions.userAgent;
      }

      if (validatedOptions.viewport) {
        contextOptions.viewport = validatedOptions.viewport;
      }

      if (validatedOptions.locale) {
        contextOptions.locale = validatedOptions.locale;
      }

      if (validatedOptions.timezone) {
        contextOptions.timezoneId = validatedOptions.timezone;
      }

      if (validatedOptions.geolocation) {
        contextOptions.geolocation = validatedOptions.geolocation;
      }

      if (validatedOptions.permissions) {
        contextOptions.permissions = validatedOptions.permissions;
      }

      const context = await browserSession.browser.newContext(contextOptions);
      const contextId = await this.sessionManager.createContextSession(browserId, context);

      return { contextId };
    } catch (error) {
      logError(error, `Failed to create context for browser ${browserId}`);
      throw error;
    }
  }

  /**
   * Closes a browser context
   */
  async closeContext(contextId: string): Promise<void> {
    await this.sessionManager.closeContextSession(contextId);
  }

  /**
   * Navigates to a URL and creates a page session if needed
   */
  async navigateToURL(
    contextId: string,
    url: string,
    options: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
      referer?: string;
    } = {}
  ): Promise<{ pageId: string; title: string; statusCode?: number }> {
    const validatedURL = validateNavigationURL(url);
    const contextSession = this.sessionManager.getContextSession(contextId);

    try {
      // Create new page
      const page = await contextSession.context.newPage();
      
      // Set referer if provided
      if (options.referer) {
        await page.setExtraHTTPHeaders({
          'Referer': options.referer,
        });
      }

      // Navigate to URL
      const response = await page.goto(validatedURL, {
        waitUntil: options.waitUntil || 'load',
        timeout: options.timeout || 30000,
      });

      // Get page info
      const title = await page.title();
      const statusCode = response?.status();

      // Create page session
      const pageId = await this.sessionManager.createPageSession(contextId, page);

      return { pageId, title, statusCode };
    } catch (error) {
      logError(error, `Failed to navigate to ${url}`);
      throw error;
    }
  }

  /**
   * Goes back in page history
   */
  async goBack(pageId: string, timeout: number = 30000): Promise<{ url: string; title: string }> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      await pageSession.page.goBack({ timeout });
      const url = pageSession.page.url();
      const title = await pageSession.page.title();

      // Update session info
      pageSession.url = url;
      pageSession.title = title;

      return { url, title };
    } catch (error) {
      logError(error, `Failed to go back on page ${pageId}`);
      throw error;
    }
  }

  /**
   * Goes forward in page history
   */
  async goForward(pageId: string, timeout: number = 30000): Promise<{ url: string; title: string }> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      await pageSession.page.goForward({ timeout });
      const url = pageSession.page.url();
      const title = await pageSession.page.title();

      // Update session info
      pageSession.url = url;
      pageSession.title = title;

      return { url, title };
    } catch (error) {
      logError(error, `Failed to go forward on page ${pageId}`);
      throw error;
    }
  }

  /**
   * Reloads the current page
   */
  async reload(pageId: string, timeout: number = 30000): Promise<{ url: string; title: string }> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      await pageSession.page.reload({ timeout });
      const url = pageSession.page.url();
      const title = await pageSession.page.title();

      // Update session info
      pageSession.url = url;
      pageSession.title = title;

      return { url, title };
    } catch (error) {
      logError(error, `Failed to reload page ${pageId}`);
      throw error;
    }
  }

  /**
   * Closes a page
   */
  async closePage(pageId: string): Promise<void> {
    await this.sessionManager.closePageSession(pageId);
  }

  /**
   * Gets page information
   */
  async getPageInfo(pageId: string): Promise<{
    url: string;
    title: string;
    viewport: { width: number; height: number };
  }> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      const url = pageSession.page.url();
      const title = await pageSession.page.title();
      const viewport = pageSession.page.viewportSize() || { width: 1280, height: 720 };

      // Update session info
      pageSession.url = url;
      pageSession.title = title;

      return { url, title, viewport };
    } catch (error) {
      logError(error, `Failed to get page info for ${pageId}`);
      throw error;
    }
  }

  /**
   * Sets page viewport
   */
  async setViewport(
    pageId: string,
    width: number,
    height: number
  ): Promise<void> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      await pageSession.page.setViewportSize({ width, height });
    } catch (error) {
      logError(error, `Failed to set viewport on page ${pageId}`);
      throw error;
    }
  }

  /**
   * Waits for page load state
   */
  async waitForLoadState(
    pageId: string,
    state: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
    timeout: number = 30000
  ): Promise<void> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      await pageSession.page.waitForLoadState(state, { timeout });
    } catch (error) {
      logError(error, `Failed to wait for load state on page ${pageId}`);
      throw error;
    }
  }

  /**
   * Gets page content (HTML)
   */
  async getPageContent(pageId: string): Promise<string> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      return await pageSession.page.content();
    } catch (error) {
      logError(error, `Failed to get page content for ${pageId}`);
      throw error;
    }
  }

  /**
   * Takes a screenshot
   */
  async takeScreenshot(
    pageId: string,
    options: {
      selector?: string;
      type?: 'png' | 'jpeg';
      quality?: number;
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
    } = {}
  ): Promise<{ data: string; format: 'png' | 'jpeg'; dimensions: { width: number; height: number } }> {
    const pageSession = this.sessionManager.getPageSession(pageId);
    
    try {
      let screenshotData: Buffer;
      let dimensions = { width: 0, height: 0 };

      if (options.selector) {
        // Take element screenshot
        const element = await pageSession.page.locator(options.selector).first();
        await element.waitFor({ timeout: 30000 });
        
        const boundingBox = await element.boundingBox();
        if (boundingBox) {
          dimensions = { width: boundingBox.width, height: boundingBox.height };
        }
        
        screenshotData = await element.screenshot({
          type: options.type || 'png',
          quality: options.quality,
        });
      } else {
        // Take page screenshot
        const viewport = pageSession.page.viewportSize();
        if (viewport) {
          dimensions = viewport;
        }
        
        screenshotData = await pageSession.page.screenshot({
          type: options.type || 'png',
          quality: options.quality,
          fullPage: options.fullPage || false,
          clip: options.clip,
        });
      }

      const data = screenshotData.toString('base64');
      const format = options.type || 'png';

      return { data, format, dimensions };
    } catch (error) {
      logError(error, `Failed to take screenshot on page ${pageId}`);
      throw error;
    }
  }

  /**
   * Gets session manager statistics
   */
  getStats() {
    return this.sessionManager.getStats();
  }

  /**
   * Lists all browser sessions
   */
  listBrowsers() {
    return this.sessionManager.listBrowserSessions().map(session => ({
      id: session.id,
      type: session.browserType,
      version: session.browser.version(),
      contexts: Array.from(session.contexts.keys()),
      createdAt: session.createdAt.toISOString(),
    }));
  }

  /**
   * Lists contexts for a browser
   */
  listContexts(browserId: string) {
    return this.sessionManager.listContextSessions(browserId).map(session => ({
      id: session.id,
      browserId,
      pages: Array.from(session.pages.keys()),
      createdAt: session.createdAt.toISOString(),
    }));
  }

  /**
   * Lists pages for a context
   */
  listPages(contextId: string) {
    return this.sessionManager.listPageSessions(contextId).map(session => ({
      id: session.id,
      contextId,
      url: session.url,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
    }));
  }

  /**
   * Shuts down the service and all sessions
   */
  async shutdown(): Promise<void> {
    await this.sessionManager.shutdown();
  }
}