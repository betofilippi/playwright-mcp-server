/**
 * Response Cache for Performance Optimization
 * Caches tool responses for idempotent operations
 */

import { EventEmitter } from 'events';
import { MCPToolResult } from '../types.js';

export interface CacheEntry {
  key: string;
  value: MCPToolResult;
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: Date;
  size: number; // Approximate size in bytes
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTtl: number; // Default TTL in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  enableCompression: boolean;
  enableMetrics: boolean;
}

export class ResponseCache extends EventEmitter {
  private cache = new Map<string, CacheEntry>();
  private keysByTag = new Map<string, Set<string>>();
  private keysByTimestamp = new Map<number, Set<string>>();
  
  private config: CacheConfig;
  private stats = {
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    totalSize: 0
  };
  
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB
      maxEntries: config.maxEntries || 10000,
      defaultTtl: config.defaultTtl || 300000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      enableCompression: config.enableCompression || false,
      enableMetrics: config.enableMetrics !== false
    };

    this.setupCleanup();
  }

  /**
   * Generate cache key from tool call
   */
  generateKey(toolName: string, args: Record<string, unknown>): string {
    // Create deterministic key from tool name and arguments
    const normalizedArgs = this.normalizeArgs(args);
    const argsString = JSON.stringify(normalizedArgs);
    
    // Use simple hash for now (in production, use crypto.createHash)
    const hash = this.simpleHash(argsString);
    return `${toolName}:${hash}`;
  }

  /**
   * Store response in cache
   */
  set(
    key: string, 
    value: MCPToolResult, 
    ttl?: number, 
    tags: string[] = [],
    metadata?: Record<string, unknown>
  ): void {
    const now = new Date();
    const entryTtl = ttl || this.config.defaultTtl;
    const size = this.calculateSize(value);

    // Check if we need to make room
    this.makeRoom(size);

    const entry: CacheEntry = {
      key,
      value: this.cloneValue(value),
      timestamp: now,
      ttl: entryTtl,
      accessCount: 0,
      lastAccessed: now,
      size,
      tags,
      metadata
    };

    // Remove existing entry if present
    this.delete(key);

    // Store new entry
    this.cache.set(key, entry);
    this.stats.totalSize += size;

    // Index by tags
    for (const tag of tags) {
      if (!this.keysByTag.has(tag)) {
        this.keysByTag.set(tag, new Set());
      }
      this.keysByTag.get(tag)!.add(key);
    }

    // Index by timestamp
    const timestampKey = Math.floor(now.getTime() / 1000) * 1000;
    if (!this.keysByTimestamp.has(timestampKey)) {
      this.keysByTimestamp.set(timestampKey, new Set());
    }
    this.keysByTimestamp.get(timestampKey)!.add(key);

    this.emit('entry_added', entry);
  }

  /**
   * Get response from cache
   */
  get(key: string): MCPToolResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.missCount++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.missCount++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = new Date();
    this.stats.hitCount++;

    this.emit('cache_hit', entry);
    return this.cloneValue(entry.value);
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Remove from cache
    this.cache.delete(key);
    this.stats.totalSize -= entry.size;

    // Remove from tag indexes
    for (const tag of entry.tags) {
      const tagKeys = this.keysByTag.get(tag);
      if (tagKeys) {
        tagKeys.delete(key);
        if (tagKeys.size === 0) {
          this.keysByTag.delete(tag);
        }
      }
    }

    // Remove from timestamp indexes
    const timestampKey = Math.floor(entry.timestamp.getTime() / 1000) * 1000;
    const timestampKeys = this.keysByTimestamp.get(timestampKey);
    if (timestampKeys) {
      timestampKeys.delete(key);
      if (timestampKeys.size === 0) {
        this.keysByTimestamp.delete(timestampKey);
      }
    }

    this.emit('entry_removed', entry);
    return true;
  }

  /**
   * Delete entries by tag
   */
  deleteByTag(tag: string): number {
    const keys = this.keysByTag.get(tag);
    if (!keys) return 0;

    const keysToDelete = Array.from(keys);
    let deletedCount = 0;

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Delete entries matching pattern
   */
  deleteByPattern(pattern: RegExp): number {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    let deletedCount = 0;
    for (const key of keysToDelete) {
      if (this.delete(key)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.keysByTag.clear();
    this.keysByTimestamp.clear();
    this.stats.totalSize = 0;
    this.emit('cache_cleared', count);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(e => e.timestamp).sort((a, b) => a.getTime() - b.getTime());

    return {
      totalEntries: this.cache.size,
      totalSize: this.stats.totalSize,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate: this.stats.hitCount + this.stats.missCount > 0 
        ? this.stats.hitCount / (this.stats.hitCount + this.stats.missCount) 
        : 0,
      evictionCount: this.stats.evictionCount,
      oldestEntry: timestamps.length > 0 ? timestamps[0] : undefined,
      newestEntry: timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined
    };
  }

  /**
   * Get entries by tag
   */
  getByTag(tag: string): CacheEntry[] {
    const keys = this.keysByTag.get(tag);
    if (!keys) return [];

    const entries: CacheEntry[] = [];
    for (const key of keys) {
      const entry = this.cache.get(key);
      if (entry && !this.isExpired(entry)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Get all cache keys
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all tags
   */
  getTags(): string[] {
    return Array.from(this.keysByTag.keys());
  }

  /**
   * Get cache entry metadata
   */
  getEntryInfo(key: string): Omit<CacheEntry, 'value'> | null {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) return null;

    return {
      key: entry.key,
      timestamp: entry.timestamp,
      ttl: entry.ttl,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      size: entry.size,
      tags: entry.tags,
      metadata: entry.metadata
    };
  }

  /**
   * Update TTL for existing entry
   */
  updateTtl(key: string, newTtl: number): boolean {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) return false;

    entry.ttl = newTtl;
    entry.timestamp = new Date(); // Reset timestamp
    return true;
  }

  /**
   * Check if cache should be used for a tool
   */
  isCacheableOperation(toolName: string, args: Record<string, unknown>): boolean {
    // Define which operations are cacheable
    const cacheableOperations = new Set([
      'page_title',
      'page_url', 
      'page_content',
      'browser_version',
      'browser_list_contexts'
    ]);

    // Screenshots are cacheable if they don't change frequently
    if (toolName === 'page_screenshot') {
      // Only cache if no dynamic parameters
      return !args.clip && !args.fullPage;
    }

    return cacheableOperations.has(toolName);
  }

  /**
   * Get optimal TTL for operation
   */
  getOptimalTtl(toolName: string, args: Record<string, unknown>): number {
    const ttlMap: Record<string, number> = {
      'page_title': 60000, // 1 minute
      'page_url': 30000, // 30 seconds
      'page_content': 120000, // 2 minutes
      'page_screenshot': 300000, // 5 minutes
      'browser_version': 3600000, // 1 hour
      'browser_list_contexts': 10000 // 10 seconds
    };

    return ttlMap[toolName] || this.config.defaultTtl;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    const expiryTime = entry.timestamp.getTime() + entry.ttl;
    return now > expiryTime;
  }

  /**
   * Calculate approximate size of value
   */
  private calculateSize(value: MCPToolResult): number {
    return JSON.stringify(value).length * 2; // Rough estimate (2 bytes per char)
  }

  /**
   * Clone cache value to prevent mutation
   */
  private cloneValue(value: MCPToolResult): MCPToolResult {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Normalize arguments for consistent key generation
   */
  private normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    
    // Sort keys and normalize values
    const sortedKeys = Object.keys(args).sort();
    for (const key of sortedKeys) {
      const value = args[key];
      if (typeof value === 'object' && value !== null) {
        normalized[key] = this.normalizeArgs(value as Record<string, unknown>);
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }

  /**
   * Simple hash function (replace with crypto in production)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Make room in cache by evicting entries
   */
  private makeRoom(requiredSize: number): void {
    if (this.stats.totalSize + requiredSize <= this.config.maxSize && 
        this.cache.size < this.config.maxEntries) {
      return;
    }

    const entries = Array.from(this.cache.values());
    
    // Sort by LRU (least recently used)
    entries.sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

    let freedSize = 0;
    let evictedCount = 0;

    for (const entry of entries) {
      if (this.stats.totalSize + requiredSize - freedSize <= this.config.maxSize &&
          this.cache.size - evictedCount < this.config.maxEntries) {
        break;
      }

      this.delete(entry.key);
      freedSize += entry.size;
      evictedCount++;
    }

    this.stats.evictionCount += evictedCount;
    
    if (evictedCount > 0) {
      this.emit('entries_evicted', evictedCount, freedSize);
    }
  }

  /**
   * Setup cleanup timer for expired entries
   */
  private setupCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    let cleanedCount = 0;
    for (const key of expiredKeys) {
      if (this.delete(key)) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.emit('expired_entries_cleaned', cleanedCount);
    }
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.clear();
    this.removeAllListeners();
  }
}