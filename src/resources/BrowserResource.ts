/**
 * Browser Resource Implementation
 * Exposes browser instances as MCP resources
 */

import { EventEmitter } from 'events';
import { MCPResource } from '../protocol/MCPProtocol.js';
import { BrowserSession, SessionStats } from '../types.js';

export interface BrowserResourceData {
  id: string;
  type: 'chromium' | 'firefox' | 'webkit';
  version: string;
  contexts: string[];
  pages: string[];
  createdAt: string;
  lastUsed: string;
  isConnected: boolean;
  processId?: number;
  memoryUsage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

export class BrowserResourceManager extends EventEmitter {
  private browserSessions = new Map<string, BrowserSession>();
  private resources = new Map<string, MCPResource>();

  constructor() {
    super();
  }

  /**
   * Register a browser session as a resource
   */
  registerBrowserSession(session: BrowserSession): void {
    this.browserSessions.set(session.id, session);

    const resource: MCPResource = {
      uri: `browser://sessions/${session.id}`,
      name: `Browser ${session.browserType} (${session.id.slice(0, 8)})`,
      description: `${session.browserType} browser instance with ${session.contexts.size} contexts`,
      mimeType: 'application/json'
    };

    this.resources.set(session.id, resource);
    this.emit('resource_added', resource);
  }

  /**
   * Unregister a browser session
   */
  unregisterBrowserSession(sessionId: string): void {
    const resource = this.resources.get(sessionId);
    if (resource) {
      this.resources.delete(sessionId);
      this.browserSessions.delete(sessionId);
      this.emit('resource_removed', resource);
    }
  }

  /**
   * Get all browser resources
   */
  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get browser resource by ID
   */
  getResource(sessionId: string): MCPResource | undefined {
    return this.resources.get(sessionId);
  }

  /**
   * Read browser resource data
   */
  async readBrowserResource(sessionId: string): Promise<BrowserResourceData | null> {
    const session = this.browserSessions.get(sessionId);
    if (!session) return null;

    try {
      const contexts = Array.from(session.contexts.keys());
      const pages: string[] = [];
      
      for (const context of session.contexts.values()) {
        pages.push(...Array.from(context.pages.keys()));
      }

      // Get browser version if available
      let version = 'unknown';
      try {
        version = session.browser.version();
      } catch (error) {
        // Browser might be closed
      }

      return {
        id: session.id,
        type: session.browserType,
        version,
        contexts,
        pages,
        createdAt: session.createdAt.toISOString(),
        lastUsed: session.lastUsed.toISOString(),
        isConnected: session.browser.isConnected(),
        processId: this.getBrowserProcessId(session),
        memoryUsage: this.getBrowserMemoryUsage()
      };

    } catch (error) {
      console.error(`Error reading browser resource ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get browser process ID if available
   */
  private getBrowserProcessId(session: BrowserSession): number | undefined {
    try {
      // This is a private method that might not be available in all Playwright versions
      const process = (session.browser as any)._connection?._transport?.onmessage?.process;
      return process?.pid;
    } catch {
      return undefined;
    }
  }

  /**
   * Get browser memory usage
   */
  private getBrowserMemoryUsage(): BrowserResourceData['memoryUsage'] {
    return process.memoryUsage();
  }

  /**
   * Update browser session (refresh resource)
   */
  updateBrowserSession(sessionId: string): void {
    const session = this.browserSessions.get(sessionId);
    const resource = this.resources.get(sessionId);
    
    if (session && resource) {
      session.lastUsed = new Date();
      
      // Update resource description with current context count
      resource.description = `${session.browserType} browser instance with ${session.contexts.size} contexts`;
      
      this.emit('resource_updated', resource);
    }
  }

  /**
   * Get browser session statistics
   */
  getSessionStats(sessionId: string): SessionStats | null {
    const session = this.browserSessions.get(sessionId);
    if (!session) return null;

    let totalPages = 0;
    for (const context of session.contexts.values()) {
      totalPages += context.pages.size;
    }

    return {
      totalBrowsers: 1,
      totalContexts: session.contexts.size,
      totalPages,
      memoryUsage: this.getBrowserMemoryUsage()
    };
  }

  /**
   * List all browser sessions with basic info
   */
  listBrowserSessions(): Array<{
    id: string;
    type: 'chromium' | 'firefox' | 'webkit';
    contexts: number;
    pages: number;
    createdAt: string;
    isConnected: boolean;
  }> {
    return Array.from(this.browserSessions.values()).map(session => {
      let totalPages = 0;
      for (const context of session.contexts.values()) {
        totalPages += context.pages.size;
      }

      return {
        id: session.id,
        type: session.browserType,
        contexts: session.contexts.size,
        pages: totalPages,
        createdAt: session.createdAt.toISOString(),
        isConnected: session.browser.isConnected()
      };
    });
  }

  /**
   * Get browser contexts for a session
   */
  getBrowserContexts(sessionId: string): Array<{
    id: string;
    pages: number;
    createdAt: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
  }> | null {
    const session = this.browserSessions.get(sessionId);
    if (!session) return null;

    return Array.from(session.contexts.values()).map(context => ({
      id: context.id,
      pages: context.pages.size,
      createdAt: context.createdAt.toISOString(),
      // Note: Getting userAgent and viewport would require async calls
      // which we can't do in this synchronous method
    }));
  }

  /**
   * Search browser resources
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
   * Get resource by URI
   */
  getResourceByUri(uri: string): MCPResource | undefined {
    return Array.from(this.resources.values()).find(resource => resource.uri === uri);
  }

  /**
   * Check if browser resource exists
   */
  hasResource(sessionId: string): boolean {
    return this.resources.has(sessionId);
  }

  /**
   * Get browser session by ID
   */
  getBrowserSession(sessionId: string): BrowserSession | undefined {
    return this.browserSessions.get(sessionId);
  }

  /**
   * Close browser session and remove resource
   */
  async closeBrowserSession(sessionId: string): Promise<boolean> {
    const session = this.browserSessions.get(sessionId);
    if (!session) return false;

    try {
      // Close all contexts (which closes all pages)
      for (const context of session.contexts.values()) {
        try {
          await context.context.close();
        } catch (error) {
          console.error(`Error closing context ${context.id}:`, error);
        }
      }

      // Close browser
      await session.browser.close();
      
      // Remove from tracking
      this.unregisterBrowserSession(sessionId);
      
      return true;
    } catch (error) {
      console.error(`Error closing browser session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup disconnected browsers
   */
  cleanupDisconnectedBrowsers(): void {
    for (const [sessionId, session] of this.browserSessions) {
      if (!session.browser.isConnected()) {
        console.warn(`Cleaning up disconnected browser session: ${sessionId}`);
        this.unregisterBrowserSession(sessionId);
      }
    }
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalBrowsers: number;
    totalContexts: number;
    totalPages: number;
    browserTypes: Record<string, number>;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    let totalContexts = 0;
    let totalPages = 0;
    const browserTypes: Record<string, number> = {};

    for (const session of this.browserSessions.values()) {
      totalContexts += session.contexts.size;
      
      for (const context of session.contexts.values()) {
        totalPages += context.pages.size;
      }

      browserTypes[session.browserType] = (browserTypes[session.browserType] || 0) + 1;
    }

    return {
      totalBrowsers: this.browserSessions.size,
      totalContexts,
      totalPages,
      browserTypes,
      memoryUsage: process.memoryUsage()
    };
  }
}