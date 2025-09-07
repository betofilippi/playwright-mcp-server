import { BrowserContext } from 'playwright';
import { SessionManager } from '../services/session.js';
import { MCPServerError, MCP_ERROR_CODES } from '../types.js';
import { logError, logInfo } from '../utils/errors.js';
import { ContextOptions } from './browser-pool.js';

/**
 * Context Manager for Browser Context Lifecycle Management
 * Handles context creation, configuration, and lifecycle operations
 */
export interface ContextStats {
  id: string;
  browserId: string;
  pages: number;
  createdAt: string;
  lastActivity?: string;
  permissions: string[];
  offline: boolean;
  extraHeaders: Record<string, string>;
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  cookies: number;
}

export interface ContextPermissions {
  geolocation?: boolean;
  camera?: boolean;
  microphone?: boolean;
  notifications?: boolean;
  persistentStorage?: boolean;
  backgroundSync?: boolean;
  midi?: boolean;
}

export class ContextManager {
  private sessionManager: SessionManager;
  private contextActivityTracker: Map<string, Date> = new Map();
  private contextPermissions: Map<string, string[]> = new Map();

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Create a new browser context with comprehensive options
   */
  async createContext(
    browserId: string, 
    options: ContextOptions & {
      recordVideo?: { dir: string; size?: { width: number; height: number } };
      recordHar?: { path: string; mode?: 'full' | 'minimal' };
      storageState?: string | { cookies?: any[]; origins?: any[] };
      proxy?: { server: string; bypass?: string; username?: string; password?: string };
      ignoreHTTPSErrors?: boolean;
      acceptDownloads?: boolean;
      bypassCSP?: boolean;
      javaScriptEnabled?: boolean;
    } = {}
  ): Promise<{ contextId: string; context: BrowserContext }> {
    try {
      const browserSession = this.sessionManager.getBrowserSession(browserId);
      
      // Prepare comprehensive context options
      const contextOptions: any = {};

      // Viewport
      if (options.viewport) {
        contextOptions.viewport = options.viewport;
      }

      // User agent
      if (options.userAgent) {
        contextOptions.userAgent = options.userAgent;
      }

      // Device properties
      if (options.deviceScaleFactor) {
        contextOptions.deviceScaleFactor = options.deviceScaleFactor;
      }
      if (options.hasTouch !== undefined) {
        contextOptions.hasTouch = options.hasTouch;
      }

      // Locale and timezone
      if (options.locale) {
        contextOptions.locale = options.locale;
      }
      if (options.timezone) {
        contextOptions.timezoneId = options.timezone;
      }

      // Permissions
      if (options.permissions && options.permissions.length > 0) {
        contextOptions.permissions = options.permissions;
        this.contextPermissions.set(browserId + '_pending', options.permissions);
      }

      // Extra HTTP headers
      if (options.extraHTTPHeaders) {
        contextOptions.extraHTTPHeaders = options.extraHTTPHeaders;
      }

      // Network settings
      if (options.offline !== undefined) {
        contextOptions.offline = options.offline;
      }

      // Authentication
      if (options.httpCredentials) {
        contextOptions.httpCredentials = options.httpCredentials;
      }

      // Geolocation
      if (options.geolocation) {
        contextOptions.geolocation = options.geolocation;
      }

      // Media settings
      if (options.colorScheme) {
        contextOptions.colorScheme = options.colorScheme;
      }
      if (options.reducedMotion) {
        contextOptions.reducedMotion = options.reducedMotion;
      }
      if (options.forcedColors) {
        contextOptions.forcedColors = options.forcedColors;
      }

      // Screen settings
      if (options.screen) {
        contextOptions.screen = options.screen;
      }

      // Extended options
      if (options.recordVideo) {
        contextOptions.recordVideo = options.recordVideo;
      }
      if (options.recordHar) {
        contextOptions.recordHar = options.recordHar;
      }
      if (options.storageState) {
        contextOptions.storageState = options.storageState;
      }
      if (options.proxy) {
        contextOptions.proxy = options.proxy;
      }
      if (options.ignoreHTTPSErrors !== undefined) {
        contextOptions.ignoreHTTPSErrors = options.ignoreHTTPSErrors;
      }
      if (options.acceptDownloads !== undefined) {
        contextOptions.acceptDownloads = options.acceptDownloads;
      }
      if (options.bypassCSP !== undefined) {
        contextOptions.bypassCSP = options.bypassCSP;
      }
      if (options.javaScriptEnabled !== undefined) {
        contextOptions.javaScriptEnabled = options.javaScriptEnabled;
      }

      const context = await browserSession.browser.newContext(contextOptions);
      const contextId = await this.sessionManager.createContextSession(browserId, context);
      
      // Track permissions
      if (options.permissions) {
        this.contextPermissions.set(contextId, options.permissions);
      }
      
      // Track activity
      this.updateContextActivity(contextId);
      
      logInfo(`Context manager: Created context ${contextId} for browser ${browserId}`);
      return { contextId, context };
    } catch (error) {
      logError(error, `Failed to create context for browser ${browserId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to create context: ${error.message}`
      );
    }
  }

  /**
   * Grant permissions to a browser context
   */
  async grantPermissions(
    contextId: string, 
    permissions: string[], 
    origin?: string
  ): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      // Grant permissions
      if (origin) {
        await contextSession.context.grantPermissions(permissions, { origin });
      } else {
        await contextSession.context.grantPermissions(permissions);
      }
      
      // Update tracked permissions
      const existingPermissions = this.contextPermissions.get(contextId) || [];
      const updatedPermissions = [...new Set([...existingPermissions, ...permissions])];
      this.contextPermissions.set(contextId, updatedPermissions);
      
      this.updateContextActivity(contextId);
      logInfo(`Context manager: Granted permissions ${permissions.join(', ')} to context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to grant permissions to context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to grant permissions: ${error.message}`
      );
    }
  }

  /**
   * Clear permissions from a browser context
   */
  async clearPermissions(contextId: string): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      await contextSession.context.clearPermissions();
      this.contextPermissions.delete(contextId);
      
      this.updateContextActivity(contextId);
      logInfo(`Context manager: Cleared permissions for context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to clear permissions for context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to clear permissions: ${error.message}`
      );
    }
  }

  /**
   * Set geolocation for a context
   */
  async setGeolocation(
    contextId: string,
    geolocation: { latitude: number; longitude: number; accuracy?: number }
  ): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      await contextSession.context.setGeolocation(geolocation);
      this.updateContextActivity(contextId);
      
      logInfo(`Context manager: Set geolocation for context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to set geolocation for context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to set geolocation: ${error.message}`
      );
    }
  }

  /**
   * Set offline mode for a context
   */
  async setOfflineMode(contextId: string, offline: boolean): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      await contextSession.context.setOffline(offline);
      this.updateContextActivity(contextId);
      
      logInfo(`Context manager: Set offline mode ${offline} for context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to set offline mode for context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to set offline mode: ${error.message}`
      );
    }
  }

  /**
   * Add init script to context (runs on every new page)
   */
  async addInitScript(
    contextId: string,
    script: string | { path: string } | { content: string }
  ): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      if (typeof script === 'string') {
        await contextSession.context.addInitScript(script);
      } else if ('path' in script) {
        await contextSession.context.addInitScript({ path: script.path });
      } else {
        await contextSession.context.addInitScript(script.content);
      }
      
      this.updateContextActivity(contextId);
      logInfo(`Context manager: Added init script to context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to add init script to context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to add init script: ${error.message}`
      );
    }
  }

  /**
   * Set extra HTTP headers for a context
   */
  async setExtraHTTPHeaders(
    contextId: string,
    headers: Record<string, string>
  ): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      await contextSession.context.setExtraHTTPHeaders(headers);
      this.updateContextActivity(contextId);
      
      logInfo(`Context manager: Set extra HTTP headers for context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to set extra HTTP headers for context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to set extra HTTP headers: ${error.message}`
      );
    }
  }

  /**
   * Get all cookies from context
   */
  async getCookies(contextId: string, urls?: string[]): Promise<any[]> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      const cookies = urls 
        ? await contextSession.context.cookies(urls)
        : await contextSession.context.cookies();
      
      this.updateContextActivity(contextId);
      return cookies;
    } catch (error) {
      logError(error, `Failed to get cookies from context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get cookies: ${error.message}`
      );
    }
  }

  /**
   * Set cookies in context
   */
  async setCookies(contextId: string, cookies: any[]): Promise<void> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      
      await contextSession.context.addCookies(cookies);
      this.updateContextActivity(contextId);
      
      logInfo(`Context manager: Set ${cookies.length} cookies for context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to set cookies for context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to set cookies: ${error.message}`
      );
    }
  }

  /**
   * Get detailed context statistics
   */
  async getContextStats(contextId: string): Promise<ContextStats> {
    try {
      const contextSession = this.sessionManager.getContextSession(contextId);
      const pages = this.sessionManager.listPageSessions(contextId);
      const cookies = await this.getCookies(contextId);
      
      return {
        id: contextId,
        browserId: contextSession.browserId,
        pages: pages.length,
        createdAt: contextSession.createdAt.toISOString(),
        lastActivity: this.contextActivityTracker.get(contextId)?.toISOString(),
        permissions: this.contextPermissions.get(contextId) || [],
        offline: false, // Would need to track this separately
        extraHeaders: {}, // Would need to track this separately
        cookies: cookies.length,
      };
    } catch (error) {
      logError(error, `Failed to get context stats for ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get context stats: ${error.message}`
      );
    }
  }

  /**
   * Get all contexts for a browser with their stats
   */
  async getBrowserContexts(browserId: string): Promise<ContextStats[]> {
    try {
      const contexts = this.sessionManager.listContextSessions(browserId);
      const contextStats = await Promise.all(
        contexts.map(context => this.getContextStats(context.id))
      );
      
      return contextStats;
    } catch (error) {
      logError(error, `Failed to get contexts for browser ${browserId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to get browser contexts: ${error.message}`
      );
    }
  }

  /**
   * Close context and cleanup resources
   */
  async closeContext(contextId: string): Promise<void> {
    try {
      await this.sessionManager.closeContextSession(contextId);
      
      // Cleanup tracking
      this.contextActivityTracker.delete(contextId);
      this.contextPermissions.delete(contextId);
      
      logInfo(`Context manager: Closed context ${contextId}`);
    } catch (error) {
      logError(error, `Failed to close context ${contextId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to close context: ${error.message}`
      );
    }
  }

  private updateContextActivity(contextId: string): void {
    this.contextActivityTracker.set(contextId, new Date());
  }

  /**
   * Cleanup all tracking data
   */
  cleanup(): void {
    this.contextActivityTracker.clear();
    this.contextPermissions.clear();
    logInfo('Context manager: Cleanup completed');
  }
}