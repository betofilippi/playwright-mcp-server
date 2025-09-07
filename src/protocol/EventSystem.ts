/**
 * Event System for Real-time Browser Automation Feedback
 * Provides event publishing, subscription, and filtering capabilities
 */

import { EventEmitter } from 'events';
import { MCPNotification } from '../types.js';

export interface BrowserEvent {
  id: string;
  type: 'browser' | 'context' | 'page' | 'network' | 'console' | 'error' | 'performance';
  category: string;
  timestamp: Date;
  source: {
    browserId?: string;
    contextId?: string;
    pageId?: string;
  };
  data: Record<string, unknown>;
  severity: 'info' | 'warn' | 'error' | 'debug';
  tags: string[];
}

export interface EventFilter {
  types?: string[];
  categories?: string[];
  severities?: ('info' | 'warn' | 'error' | 'debug')[];
  sources?: {
    browserId?: string;
    contextId?: string;
    pageId?: string;
  };
  tags?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface EventSubscription {
  id: string;
  filter: EventFilter;
  callback: (event: BrowserEvent) => void;
  transportId?: string;
  active: boolean;
  created: Date;
  lastActivity: Date;
}

export class EventSystem extends EventEmitter {
  private subscriptions = new Map<string, EventSubscription>();
  private eventHistory = new Map<string, BrowserEvent>();
  private eventsByType = new Map<string, Set<string>>();
  private eventsByCategory = new Map<string, Set<string>>();
  private eventsBySource = new Map<string, Set<string>>();
  
  private maxHistorySize = 10000;
  private historyCleanupInterval = 300000; // 5 minutes
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupHistoryCleanup();
  }

  /**
   * Publish a browser event
   */
  publishEvent(event: Omit<BrowserEvent, 'id' | 'timestamp'>): string {
    const eventId = this.generateEventId();
    const fullEvent: BrowserEvent = {
      ...event,
      id: eventId,
      timestamp: new Date()
    };

    // Store in history
    this.eventHistory.set(eventId, fullEvent);
    
    // Index by type, category, and source
    this.indexEvent(fullEvent);

    // Notify subscribers
    this.notifySubscribers(fullEvent);

    // Emit on internal event emitter
    this.emit('event', fullEvent);

    return eventId;
  }

  /**
   * Subscribe to browser events
   */
  subscribe(
    filter: EventFilter, 
    callback: (event: BrowserEvent) => void,
    transportId?: string
  ): string {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: EventSubscription = {
      id: subscriptionId,
      filter,
      callback,
      transportId,
      active: true,
      created: new Date(),
      lastActivity: new Date()
    };

    this.subscriptions.set(subscriptionId, subscription);
    
    this.emit('subscription_created', subscription);
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    this.emit('subscription_removed', subscription);
    return true;
  }

  /**
   * Pause subscription
   */
  pauseSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    subscription.active = false;
    return true;
  }

  /**
   * Resume subscription
   */
  resumeSubscription(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    subscription.active = true;
    return true;
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): BrowserEvent | undefined {
    return this.eventHistory.get(eventId);
  }

  /**
   * Query events with filter
   */
  queryEvents(filter: EventFilter, limit = 100): BrowserEvent[] {
    const events = Array.from(this.eventHistory.values());
    const filteredEvents = this.applyFilter(events, filter);
    
    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return filteredEvents.slice(0, limit);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 50): BrowserEvent[] {
    const events = Array.from(this.eventHistory.values());
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string, limit = 100): BrowserEvent[] {
    const eventIds = this.eventsByType.get(type) || new Set();
    const events = Array.from(eventIds)
      .map(id => this.eventHistory.get(id))
      .filter(Boolean) as BrowserEvent[];
    
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }

  /**
   * Get events by category
   */
  getEventsByCategory(category: string, limit = 100): BrowserEvent[] {
    const eventIds = this.eventsByCategory.get(category) || new Set();
    const events = Array.from(eventIds)
      .map(id => this.eventHistory.get(id))
      .filter(Boolean) as BrowserEvent[];
    
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }

  /**
   * Get events by source
   */
  getEventsBySource(source: {
    browserId?: string;
    contextId?: string;
    pageId?: string;
  }, limit = 100): BrowserEvent[] {
    const sourceKey = this.getSourceKey(source);
    const eventIds = this.eventsBySource.get(sourceKey) || new Set();
    const events = Array.from(eventIds)
      .map(id => this.eventHistory.get(id))
      .filter(Boolean) as BrowserEvent[];
    
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return events.slice(0, limit);
  }

  /**
   * Get event statistics
   */
  getEventStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByCategory: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentActivity: {
      lastHour: number;
      lastDay: number;
    };
  } {
    const events = Array.from(this.eventHistory.values());
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stats = {
      totalEvents: events.length,
      eventsByType: {} as Record<string, number>,
      eventsByCategory: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      recentActivity: {
        lastHour: 0,
        lastDay: 0
      }
    };

    for (const event of events) {
      // Count by type
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
      
      // Count by category
      stats.eventsByCategory[event.category] = (stats.eventsByCategory[event.category] || 0) + 1;
      
      // Count by severity
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      
      // Recent activity
      if (event.timestamp >= oneHourAgo) {
        stats.recentActivity.lastHour++;
      }
      if (event.timestamp >= oneDayAgo) {
        stats.recentActivity.lastDay++;
      }
    }

    return stats;
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): {
    totalSubscriptions: number;
    activeSubscriptions: number;
    subscriptionsByTransport: Record<string, number>;
  } {
    const subscriptions = Array.from(this.subscriptions.values());
    const stats = {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter(s => s.active).length,
      subscriptionsByTransport: {} as Record<string, number>
    };

    for (const subscription of subscriptions) {
      const transport = subscription.transportId || 'unknown';
      stats.subscriptionsByTransport[transport] = (stats.subscriptionsByTransport[transport] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory.clear();
    this.eventsByType.clear();
    this.eventsByCategory.clear();
    this.eventsBySource.clear();
    this.emit('history_cleared');
  }

  /**
   * Remove subscriptions by transport
   */
  removeSubscriptionsByTransport(transportId: string): number {
    let removed = 0;
    
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.transportId === transportId) {
        this.subscriptions.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Create MCP notification from event
   */
  createMCPNotification(event: BrowserEvent): MCPNotification {
    return {
      jsonrpc: '2.0',
      method: `notifications/browser/${event.category}`,
      params: {
        eventId: event.id,
        type: event.type,
        category: event.category,
        timestamp: event.timestamp.toISOString(),
        source: event.source,
        data: event.data,
        severity: event.severity,
        tags: event.tags
      }
    };
  }

  /**
   * Notify subscribers of an event
   */
  private notifySubscribers(event: BrowserEvent): void {
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;
      
      if (this.eventMatchesFilter(event, subscription.filter)) {
        try {
          subscription.callback(event);
          subscription.lastActivity = new Date();
        } catch (error) {
          console.error(`Error in event subscription callback:`, error);
        }
      }
    }
  }

  /**
   * Check if event matches filter
   */
  private eventMatchesFilter(event: BrowserEvent, filter: EventFilter): boolean {
    // Check types
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    // Check categories
    if (filter.categories && !filter.categories.includes(event.category)) {
      return false;
    }

    // Check severities
    if (filter.severities && !filter.severities.includes(event.severity)) {
      return false;
    }

    // Check sources
    if (filter.sources) {
      const { browserId, contextId, pageId } = filter.sources;
      if (browserId && event.source.browserId !== browserId) return false;
      if (contextId && event.source.contextId !== contextId) return false;
      if (pageId && event.source.pageId !== pageId) return false;
    }

    // Check tags
    if (filter.tags && !filter.tags.some(tag => event.tags.includes(tag))) {
      return false;
    }

    // Check time range
    if (filter.timeRange) {
      const eventTime = event.timestamp.getTime();
      if (eventTime < filter.timeRange.start.getTime() || 
          eventTime > filter.timeRange.end.getTime()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Apply filter to event list
   */
  private applyFilter(events: BrowserEvent[], filter: EventFilter): BrowserEvent[] {
    return events.filter(event => this.eventMatchesFilter(event, filter));
  }

  /**
   * Index event for faster querying
   */
  private indexEvent(event: BrowserEvent): void {
    // Index by type
    if (!this.eventsByType.has(event.type)) {
      this.eventsByType.set(event.type, new Set());
    }
    this.eventsByType.get(event.type)!.add(event.id);

    // Index by category
    if (!this.eventsByCategory.has(event.category)) {
      this.eventsByCategory.set(event.category, new Set());
    }
    this.eventsByCategory.get(event.category)!.add(event.id);

    // Index by source
    const sourceKey = this.getSourceKey(event.source);
    if (!this.eventsBySource.has(sourceKey)) {
      this.eventsBySource.set(sourceKey, new Set());
    }
    this.eventsBySource.get(sourceKey)!.add(event.id);
  }

  /**
   * Get source key for indexing
   */
  private getSourceKey(source: {
    browserId?: string;
    contextId?: string;
    pageId?: string;
  }): string {
    return `${source.browserId || 'none'}:${source.contextId || 'none'}:${source.pageId || 'none'}`;
  }

  /**
   * Setup history cleanup timer
   */
  private setupHistoryCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupHistory();
    }, this.historyCleanupInterval);
  }

  /**
   * Cleanup old events from history
   */
  private cleanupHistory(): void {
    if (this.eventHistory.size <= this.maxHistorySize) return;

    const events = Array.from(this.eventHistory.values());
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    const eventsToKeep = events.slice(0, this.maxHistorySize);
    const eventsToRemove = events.slice(this.maxHistorySize);

    // Clear history and rebuild with recent events
    this.eventHistory.clear();
    this.eventsByType.clear();
    this.eventsByCategory.clear();
    this.eventsBySource.clear();

    for (const event of eventsToKeep) {
      this.eventHistory.set(event.id, event);
      this.indexEvent(event);
    }

    if (eventsToRemove.length > 0) {
      console.log(`Cleaned up ${eventsToRemove.length} old events from history`);
      this.emit('history_cleaned', eventsToRemove.length);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): EventSubscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Cleanup when shutting down
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.subscriptions.clear();
    this.eventHistory.clear();
    this.eventsByType.clear();
    this.eventsByCategory.clear();
    this.eventsBySource.clear();
    
    this.removeAllListeners();
  }
}