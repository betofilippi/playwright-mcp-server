/**
 * Session Cache for State Persistence
 * Handles caching and persistence of session state for recovery
 */

import { EventEmitter } from 'events';
import { writeFile, readFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { SessionStateData } from '../resources/SessionResource.js';

export interface SessionCacheEntry {
  id: string;
  sessionId: string;
  type: 'browser' | 'context' | 'page';
  state: Record<string, unknown>;
  timestamp: Date;
  version: string;
  checksum: string;
  size: number;
  persistent: boolean;
}

export interface SessionCacheConfig {
  cacheDirectory: string;
  maxMemoryEntries: number;
  maxDiskEntries: number;
  persistentEntries: string[];
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  cleanupInterval: number;
  maxAge: number;
}

export class SessionCache extends EventEmitter {
  private memoryCache = new Map<string, SessionCacheEntry>();
  private config: SessionCacheConfig;
  private cleanupTimer?: NodeJS.Timeout;
  
  constructor(config: Partial<SessionCacheConfig> = {}) {
    super();
    
    this.config = {
      cacheDirectory: config.cacheDirectory || './cache/sessions',
      maxMemoryEntries: config.maxMemoryEntries || 1000,
      maxDiskEntries: config.maxDiskEntries || 10000,
      persistentEntries: config.persistentEntries || [],
      compressionEnabled: config.compressionEnabled || false,
      encryptionEnabled: config.encryptionEnabled || false,
      encryptionKey: config.encryptionKey,
      cleanupInterval: config.cleanupInterval || 300000, // 5 minutes
      maxAge: config.maxAge || 24 * 60 * 60 * 1000 // 24 hours
    };

    this.initializeCache();
  }

  /**
   * Initialize cache directory and setup
   */
  private async initializeCache(): Promise<void> {
    try {
      await mkdir(this.config.cacheDirectory, { recursive: true });
      await this.loadPersistentEntries();
      this.setupCleanup();
      console.log(`Session cache initialized at ${this.config.cacheDirectory}`);
    } catch (error) {
      console.error('Failed to initialize session cache:', error);
    }
  }

  /**
   * Store session state in cache
   */
  async set(
    sessionId: string,
    type: SessionCacheEntry['type'],
    state: Record<string, unknown>,
    persistent = false
  ): Promise<string> {
    const entryId = this.generateEntryId(sessionId, type);
    const serializedState = JSON.stringify(state);
    
    const entry: SessionCacheEntry = {
      id: entryId,
      sessionId,
      type,
      state,
      timestamp: new Date(),
      version: '1.0.0',
      checksum: this.calculateChecksum(serializedState),
      size: serializedState.length,
      persistent
    };

    // Store in memory cache
    this.memoryCache.set(entryId, entry);
    
    // Evict old entries if needed
    this.evictOldMemoryEntries();

    // Store on disk if persistent
    if (persistent) {
      await this.saveToDisk(entry);
    }

    this.emit('entry_cached', entry);
    return entryId;
  }

  /**
   * Get session state from cache
   */
  async get(sessionId: string, type: SessionCacheEntry['type']): Promise<Record<string, unknown> | null> {
    const entryId = this.generateEntryId(sessionId, type);
    
    // Check memory cache first
    let entry = this.memoryCache.get(entryId);
    
    if (!entry) {
      // Try to load from disk
      entry = await this.loadFromDisk(entryId);
      if (entry) {
        // Add to memory cache
        this.memoryCache.set(entryId, entry);
      }
    }

    if (!entry) {
      this.emit('cache_miss', { sessionId, type });
      return null;
    }

    // Validate checksum
    const serializedState = JSON.stringify(entry.state);
    const currentChecksum = this.calculateChecksum(serializedState);
    
    if (currentChecksum !== entry.checksum) {
      console.warn(`Checksum mismatch for session ${sessionId}, removing from cache`);
      await this.delete(sessionId, type);
      return null;
    }

    // Update access time
    entry.timestamp = new Date();
    
    this.emit('cache_hit', entry);
    return entry.state;
  }

  /**
   * Check if session state exists in cache
   */
  async has(sessionId: string, type: SessionCacheEntry['type']): Promise<boolean> {
    const entryId = this.generateEntryId(sessionId, type);
    
    // Check memory cache
    if (this.memoryCache.has(entryId)) {
      return true;
    }

    // Check disk cache
    const diskPath = this.getDiskPath(entryId);
    return existsSync(diskPath);
  }

  /**
   * Delete session state from cache
   */
  async delete(sessionId: string, type: SessionCacheEntry['type']): Promise<boolean> {
    const entryId = this.generateEntryId(sessionId, type);
    
    // Remove from memory
    const memoryDeleted = this.memoryCache.delete(entryId);
    
    // Remove from disk
    const diskDeleted = await this.removeFromDisk(entryId);
    
    if (memoryDeleted || diskDeleted) {
      this.emit('entry_removed', { sessionId, type });
      return true;
    }
    
    return false;
  }

  /**
   * Delete all entries for a session
   */
  async deleteSession(sessionId: string): Promise<number> {
    const deletedCount = { memory: 0, disk: 0 };
    
    // Remove from memory cache
    const memoryKeys = Array.from(this.memoryCache.keys());
    for (const key of memoryKeys) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.sessionId === sessionId) {
        this.memoryCache.delete(key);
        deletedCount.memory++;
      }
    }

    // Remove from disk cache
    try {
      const files = await readdir(this.config.cacheDirectory);
      const sessionFiles = files.filter(file => file.startsWith(`${sessionId}_`));
      
      for (const file of sessionFiles) {
        const filePath = join(this.config.cacheDirectory, file);
        try {
          await unlink(filePath);
          deletedCount.disk++;
        } catch (error) {
          console.error(`Failed to delete cache file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to scan cache directory:', error);
    }

    const totalDeleted = deletedCount.memory + deletedCount.disk;
    this.emit('session_removed', { sessionId, deletedCount: totalDeleted });
    return totalDeleted;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    // Clear memory cache
    const memoryCount = this.memoryCache.size;
    this.memoryCache.clear();

    // Clear disk cache
    let diskCount = 0;
    try {
      const files = await readdir(this.config.cacheDirectory);
      for (const file of files) {
        if (file.endsWith('.cache')) {
          const filePath = join(this.config.cacheDirectory, file);
          try {
            await unlink(filePath);
            diskCount++;
          } catch (error) {
            console.error(`Failed to delete cache file ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to clear disk cache:', error);
    }

    this.emit('cache_cleared', { memoryCount, diskCount });
  }

  /**
   * Backup session state to persistent storage
   */
  async backup(sessionStateData: SessionStateData, backupName?: string): Promise<string> {
    const backupId = backupName || `backup_${Date.now()}`;
    const backupPath = join(this.config.cacheDirectory, 'backups');
    
    try {
      await mkdir(backupPath, { recursive: true });
      
      const backupFile = join(backupPath, `${backupId}.json`);
      const backupData = {
        id: backupId,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: sessionStateData
      };

      await writeFile(backupFile, JSON.stringify(backupData, null, 2));
      
      this.emit('backup_created', { backupId, path: backupFile });
      return backupId;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Restore session state from backup
   */
  async restore(backupId: string): Promise<SessionStateData | null> {
    const backupPath = join(this.config.cacheDirectory, 'backups');
    const backupFile = join(backupPath, `${backupId}.json`);
    
    try {
      if (!existsSync(backupFile)) {
        return null;
      }

      const backupContent = await readFile(backupFile, 'utf8');
      const backupData = JSON.parse(backupContent);
      
      this.emit('backup_restored', { backupId });
      return backupData.data;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw error;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<Array<{
    id: string;
    timestamp: string;
    size: number;
  }>> {
    const backupPath = join(this.config.cacheDirectory, 'backups');
    
    try {
      if (!existsSync(backupPath)) {
        return [];
      }

      const files = await readdir(backupPath);
      const backupFiles = files.filter(file => file.endsWith('.json'));
      
      const backups = [];
      for (const file of backupFiles) {
        try {
          const filePath = join(backupPath, file);
          const content = await readFile(filePath, 'utf8');
          const data = JSON.parse(content);
          const stats = await import('fs').then(fs => fs.promises.stat(filePath));
          
          backups.push({
            id: data.id,
            timestamp: data.timestamp,
            size: stats.size
          });
        } catch (error) {
          console.error(`Failed to read backup file ${file}:`, error);
        }
      }
      
      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    memorySize: number;
    diskEntries: number;
    persistentEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.memoryCache.values());
    const timestamps = entries.map(e => e.timestamp).sort((a, b) => a.getTime() - b.getTime());
    
    const memorySize = entries.reduce((total, entry) => total + entry.size, 0);
    const persistentEntries = entries.filter(entry => entry.persistent).length;

    return {
      memoryEntries: this.memoryCache.size,
      memorySize,
      diskEntries: 0, // Would need to scan disk
      persistentEntries,
      oldestEntry: timestamps.length > 0 ? timestamps[0] : undefined,
      newestEntry: timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined
    };
  }

  /**
   * Generate entry ID
   */
  private generateEntryId(sessionId: string, type: string): string {
    return `${sessionId}_${type}`;
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    // Simple checksum (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get disk path for entry
   */
  private getDiskPath(entryId: string): string {
    return join(this.config.cacheDirectory, `${entryId}.cache`);
  }

  /**
   * Save entry to disk
   */
  private async saveToDisk(entry: SessionCacheEntry): Promise<void> {
    try {
      const diskPath = this.getDiskPath(entry.id);
      await mkdir(dirname(diskPath), { recursive: true });
      
      const diskData = {
        ...entry,
        timestamp: entry.timestamp.toISOString()
      };
      
      await writeFile(diskPath, JSON.stringify(diskData));
      this.emit('entry_persisted', entry);
    } catch (error) {
      console.error(`Failed to save entry ${entry.id} to disk:`, error);
      throw error;
    }
  }

  /**
   * Load entry from disk
   */
  private async loadFromDisk(entryId: string): Promise<SessionCacheEntry | null> {
    try {
      const diskPath = this.getDiskPath(entryId);
      
      if (!existsSync(diskPath)) {
        return null;
      }

      const content = await readFile(diskPath, 'utf8');
      const diskData = JSON.parse(content);
      
      const entry: SessionCacheEntry = {
        ...diskData,
        timestamp: new Date(diskData.timestamp)
      };
      
      this.emit('entry_loaded', entry);
      return entry;
    } catch (error) {
      console.error(`Failed to load entry ${entryId} from disk:`, error);
      return null;
    }
  }

  /**
   * Remove entry from disk
   */
  private async removeFromDisk(entryId: string): Promise<boolean> {
    try {
      const diskPath = this.getDiskPath(entryId);
      
      if (!existsSync(diskPath)) {
        return false;
      }

      await unlink(diskPath);
      return true;
    } catch (error) {
      console.error(`Failed to remove entry ${entryId} from disk:`, error);
      return false;
    }
  }

  /**
   * Load persistent entries on startup
   */
  private async loadPersistentEntries(): Promise<void> {
    try {
      const files = await readdir(this.config.cacheDirectory);
      const cacheFiles = files.filter(file => file.endsWith('.cache'));
      
      let loadedCount = 0;
      for (const file of cacheFiles) {
        try {
          const entryId = file.replace('.cache', '');
          const entry = await this.loadFromDisk(entryId);
          
          if (entry && entry.persistent) {
            this.memoryCache.set(entryId, entry);
            loadedCount++;
          }
        } catch (error) {
          console.error(`Failed to load cache file ${file}:`, error);
        }
      }

      if (loadedCount > 0) {
        console.log(`Loaded ${loadedCount} persistent cache entries`);
      }
    } catch (error) {
      console.error('Failed to load persistent entries:', error);
    }
  }

  /**
   * Evict old entries from memory cache
   */
  private evictOldMemoryEntries(): void {
    if (this.memoryCache.size <= this.config.maxMemoryEntries) {
      return;
    }

    const entries = Array.from(this.memoryCache.entries());
    
    // Sort by timestamp (oldest first), but keep persistent entries
    entries.sort((a, b) => {
      if (a[1].persistent && !b[1].persistent) return 1;
      if (!a[1].persistent && b[1].persistent) return -1;
      return a[1].timestamp.getTime() - b[1].timestamp.getTime();
    });

    const entriesToRemove = entries.slice(0, entries.length - this.config.maxMemoryEntries);
    
    for (const [key, entry] of entriesToRemove) {
      if (!entry.persistent) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Setup cleanup timer
   */
  private setupCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup expired entries
   */
  private async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Check memory cache
    for (const [key, entry] of this.memoryCache) {
      const age = now - entry.timestamp.getTime();
      if (age > this.config.maxAge && !entry.persistent) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      const entry = this.memoryCache.get(key);
      if (entry) {
        this.memoryCache.delete(key);
        if (!entry.persistent) {
          await this.removeFromDisk(entry.id);
        }
      }
    }

    if (expiredKeys.length > 0) {
      this.emit('expired_entries_cleaned', expiredKeys.length);
    }
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.memoryCache.clear();
    this.removeAllListeners();
  }
}