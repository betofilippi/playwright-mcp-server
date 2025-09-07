/**
 * Session Resource Implementation
 * Exposes session state as MCP resources for persistence and recovery
 */

import { EventEmitter } from 'events';
import { MCPResource } from '../protocol/MCPProtocol.js';
import { 
  BrowserSession, 
  BrowserContextSession, 
  PageSession,
  SessionStats 
} from '../types.js';

export interface SessionStateData {
  id: string;
  type: 'browser' | 'context' | 'page' | 'global';
  timestamp: string;
  version: string;
  state: {
    browsers: Array<{
      id: string;
      type: 'chromium' | 'firefox' | 'webkit';
      contexts: string[];
      createdAt: string;
      lastUsed: string;
      options?: Record<string, unknown>;
    }>;
    contexts: Array<{
      id: string;
      browserId: string;
      pages: string[];
      createdAt: string;
      lastUsed: string;
      options?: Record<string, unknown>;
    }>;
    pages: Array<{
      id: string;
      contextId: string;
      url: string;
      title: string;
      viewport?: { width: number; height: number };
      createdAt: string;
      lastUsed: string;
    }>;
  };
  metadata: {
    serverVersion: string;
    protocolVersion: string;
    platform: string;
    nodeVersion: string;
  };
}

export interface SessionSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  state: SessionStateData;
  size: number;
}

export class SessionResourceManager extends EventEmitter {
  private snapshots = new Map<string, SessionSnapshot>();
  private resources = new Map<string, MCPResource>();
  private sessionData = new Map<string, SessionStateData>();
  
  constructor() {
    super();
  }

  /**
   * Create a session snapshot
   */
  async createSnapshot(
    name: string,
    description: string,
    browserSessions: Map<string, BrowserSession>
  ): Promise<string> {
    const snapshotId = this.generateSnapshotId();
    const timestamp = new Date().toISOString();
    
    // Build session state
    const state: SessionStateData = {
      id: snapshotId,
      type: 'global',
      timestamp,
      version: '1.0.0',
      state: {
        browsers: [],
        contexts: [],
        pages: []
      },
      metadata: {
        serverVersion: '1.0.0',
        protocolVersion: '2024-11-05',
        platform: process.platform,
        nodeVersion: process.version
      }
    };

    // Serialize browser sessions
    for (const [browserId, browserSession] of browserSessions) {
      state.state.browsers.push({
        id: browserId,
        type: browserSession.browserType,
        contexts: Array.from(browserSession.contexts.keys()),
        createdAt: browserSession.createdAt.toISOString(),
        lastUsed: browserSession.lastUsed.toISOString()
      });

      // Serialize contexts
      for (const [contextId, contextSession] of browserSession.contexts) {
        state.state.contexts.push({
          id: contextId,
          browserId,
          pages: Array.from(contextSession.pages.keys()),
          createdAt: contextSession.createdAt.toISOString(),
          lastUsed: contextSession.lastUsed.toISOString()
        });

        // Serialize pages
        for (const [pageId, pageSession] of contextSession.pages) {
          state.state.pages.push({
            id: pageId,
            contextId,
            url: pageSession.url,
            title: pageSession.title,
            viewport: pageSession.page.viewportSize(),
            createdAt: pageSession.createdAt.toISOString(),
            lastUsed: pageSession.lastUsed.toISOString()
          });
        }
      }
    }

    // Create snapshot
    const snapshot: SessionSnapshot = {
      id: snapshotId,
      name,
      description,
      createdAt: new Date(),
      state,
      size: JSON.stringify(state).length
    };

    this.snapshots.set(snapshotId, snapshot);
    this.sessionData.set(snapshotId, state);

    // Create resource
    const resource: MCPResource = {
      uri: `session://snapshots/${snapshotId}`,
      name: `Session Snapshot: ${name}`,
      description: `Session state snapshot with ${state.state.browsers.length} browsers, ${state.state.contexts.length} contexts, ${state.state.pages.length} pages`,
      mimeType: 'application/json'
    };

    this.resources.set(snapshotId, resource);
    this.emit('resource_added', resource);

    return snapshotId;
  }

  /**
   * Load a session snapshot
   */
  async loadSnapshot(snapshotId: string): Promise<SessionStateData | null> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return null;

    return snapshot.state;
  }

  /**
   * Delete a session snapshot
   */
  deleteSnapshot(snapshotId: string): boolean {
    const resource = this.resources.get(snapshotId);
    if (!resource) return false;

    this.snapshots.delete(snapshotId);
    this.sessionData.delete(snapshotId);
    this.resources.delete(snapshotId);
    
    this.emit('resource_removed', resource);
    return true;
  }

  /**
   * Get all session resources
   */
  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get session resource by ID
   */
  getResource(snapshotId: string): MCPResource | undefined {
    return this.resources.get(snapshotId);
  }

  /**
   * Read session resource data
   */
  async readSessionResource(snapshotId: string): Promise<SessionStateData | null> {
    return this.sessionData.get(snapshotId) || null;
  }

  /**
   * List all snapshots
   */
  listSnapshots(): Array<{
    id: string;
    name: string;
    description: string;
    createdAt: string;
    size: number;
    browsers: number;
    contexts: number;
    pages: number;
  }> {
    return Array.from(this.snapshots.values()).map(snapshot => ({
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description,
      createdAt: snapshot.createdAt.toISOString(),
      size: snapshot.size,
      browsers: snapshot.state.state.browsers.length,
      contexts: snapshot.state.state.contexts.length,
      pages: snapshot.state.state.pages.length
    }));
  }

  /**
   * Search snapshots
   */
  searchSnapshots(query: string): Array<SessionSnapshot> {
    const normalizedQuery = query.toLowerCase();
    
    return Array.from(this.snapshots.values()).filter(snapshot =>
      snapshot.name.toLowerCase().includes(normalizedQuery) ||
      snapshot.description.toLowerCase().includes(normalizedQuery)
    );
  }

  /**
   * Export session state to JSON
   */
  exportSessionState(snapshotId: string): string | null {
    const state = this.sessionData.get(snapshotId);
    if (!state) return null;

    return JSON.stringify(state, null, 2);
  }

  /**
   * Import session state from JSON
   */
  async importSessionState(
    name: string,
    description: string,
    jsonData: string
  ): Promise<string | null> {
    try {
      const state = JSON.parse(jsonData) as SessionStateData;
      
      // Validate state structure
      if (!this.isValidSessionState(state)) {
        throw new Error('Invalid session state format');
      }

      const snapshotId = this.generateSnapshotId();
      state.id = snapshotId;
      state.timestamp = new Date().toISOString();

      const snapshot: SessionSnapshot = {
        id: snapshotId,
        name,
        description,
        createdAt: new Date(),
        state,
        size: jsonData.length
      };

      this.snapshots.set(snapshotId, snapshot);
      this.sessionData.set(snapshotId, state);

      // Create resource
      const resource: MCPResource = {
        uri: `session://snapshots/${snapshotId}`,
        name: `Session Snapshot: ${name}`,
        description: `Imported session state with ${state.state.browsers.length} browsers`,
        mimeType: 'application/json'
      };

      this.resources.set(snapshotId, resource);
      this.emit('resource_added', resource);

      return snapshotId;
    } catch (error) {
      console.error('Failed to import session state:', error);
      return null;
    }
  }

  /**
   * Create session diff between two snapshots
   */
  createSessionDiff(snapshot1Id: string, snapshot2Id: string): {
    added: {
      browsers: string[];
      contexts: string[];
      pages: string[];
    };
    removed: {
      browsers: string[];
      contexts: string[];
      pages: string[];
    };
    modified: {
      browsers: string[];
      contexts: string[];
      pages: string[];
    };
  } | null {
    const state1 = this.sessionData.get(snapshot1Id);
    const state2 = this.sessionData.get(snapshot2Id);
    
    if (!state1 || !state2) return null;

    const diff = {
      added: { browsers: [], contexts: [], pages: [] },
      removed: { browsers: [], contexts: [], pages: [] },
      modified: { browsers: [], contexts: [], pages: [] }
    };

    // Compare browsers
    const browsers1 = new Set(state1.state.browsers.map(b => b.id));
    const browsers2 = new Set(state2.state.browsers.map(b => b.id));
    
    diff.added.browsers = Array.from(browsers2).filter(id => !browsers1.has(id));
    diff.removed.browsers = Array.from(browsers1).filter(id => !browsers2.has(id));

    // Compare contexts
    const contexts1 = new Set(state1.state.contexts.map(c => c.id));
    const contexts2 = new Set(state2.state.contexts.map(c => c.id));
    
    diff.added.contexts = Array.from(contexts2).filter(id => !contexts1.has(id));
    diff.removed.contexts = Array.from(contexts1).filter(id => !contexts2.has(id));

    // Compare pages
    const pages1 = new Set(state1.state.pages.map(p => p.id));
    const pages2 = new Set(state2.state.pages.map(p => p.id));
    
    diff.added.pages = Array.from(pages2).filter(id => !pages1.has(id));
    diff.removed.pages = Array.from(pages1).filter(id => !pages2.has(id));

    return diff;
  }

  /**
   * Get session statistics
   */
  getSessionStats(snapshotId: string): SessionStats | null {
    const state = this.sessionData.get(snapshotId);
    if (!state) return null;

    return {
      totalBrowsers: state.state.browsers.length,
      totalContexts: state.state.contexts.length,
      totalPages: state.state.pages.length,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Cleanup old snapshots
   */
  cleanupOldSnapshots(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = new Date();
    
    for (const [snapshotId, snapshot] of this.snapshots) {
      const age = now.getTime() - snapshot.createdAt.getTime();
      if (age > maxAge) {
        this.deleteSnapshot(snapshotId);
        console.log(`Cleaned up old snapshot: ${snapshot.name}`);
      }
    }
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalSnapshots: number;
    totalSize: number;
    oldestSnapshot?: Date;
    newestSnapshot?: Date;
    avgSize: number;
  } {
    const snapshots = Array.from(this.snapshots.values());
    const totalSize = snapshots.reduce((sum, s) => sum + s.size, 0);
    
    return {
      totalSnapshots: snapshots.length,
      totalSize,
      oldestSnapshot: snapshots.length > 0 ? 
        snapshots.reduce((oldest, s) => s.createdAt < oldest ? s.createdAt : oldest, snapshots[0].createdAt) : 
        undefined,
      newestSnapshot: snapshots.length > 0 ? 
        snapshots.reduce((newest, s) => s.createdAt > newest ? s.createdAt : newest, snapshots[0].createdAt) : 
        undefined,
      avgSize: snapshots.length > 0 ? totalSize / snapshots.length : 0
    };
  }

  /**
   * Validate session state structure
   */
  private isValidSessionState(state: any): state is SessionStateData {
    return (
      typeof state === 'object' &&
      state !== null &&
      typeof state.id === 'string' &&
      typeof state.type === 'string' &&
      typeof state.timestamp === 'string' &&
      typeof state.version === 'string' &&
      typeof state.state === 'object' &&
      Array.isArray(state.state.browsers) &&
      Array.isArray(state.state.contexts) &&
      Array.isArray(state.state.pages) &&
      typeof state.metadata === 'object'
    );
  }

  /**
   * Generate unique snapshot ID
   */
  private generateSnapshotId(): string {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): SessionSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Check if snapshot exists
   */
  hasSnapshot(snapshotId: string): boolean {
    return this.snapshots.has(snapshotId);
  }

  /**
   * Update snapshot metadata
   */
  updateSnapshotMetadata(
    snapshotId: string, 
    updates: { name?: string; description?: string }
  ): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    const resource = this.resources.get(snapshotId);
    
    if (!snapshot || !resource) return false;

    if (updates.name) {
      snapshot.name = updates.name;
      resource.name = `Session Snapshot: ${updates.name}`;
    }

    if (updates.description) {
      snapshot.description = updates.description;
    }

    this.emit('resource_updated', resource);
    return true;
  }
}