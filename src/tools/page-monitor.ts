import { Page, ConsoleMessage, Dialog, Download, FileChooser } from 'playwright';
import { SessionManager } from '../services/session.js';
import { MCPServerError, MCP_ERROR_CODES } from '../types.js';
import { logError, logInfo } from '../utils/errors.js';

/**
 * Page Event Monitoring System
 * Monitors and tracks various page events for comprehensive automation
 */
export interface ConsoleMessageData {
  type: 'log' | 'warning' | 'error' | 'info' | 'debug';
  text: string;
  location: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  timestamp: string;
  args: any[];
}

export interface DialogData {
  type: 'alert' | 'beforeunload' | 'confirm' | 'prompt';
  message: string;
  defaultValue?: string;
  timestamp: string;
}

export interface RequestData {
  url: string;
  method: string;
  headers: Record<string, string>;
  resourceType: string;
  timestamp: string;
  redirectedFrom?: string;
  failure?: {
    errorText: string;
  };
}

export interface ResponseData {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timestamp: string;
  fromCache: boolean;
  fromServiceWorker: boolean;
}

export interface PageEventHistory {
  console: ConsoleMessageData[];
  dialogs: DialogData[];
  requests: RequestData[];
  responses: ResponseData[];
  downloads: any[];
  errors: any[];
}

export class PageEventMonitor {
  private sessionManager: SessionManager;
  private eventHistory: Map<string, PageEventHistory> = new Map();
  private activeListeners: Map<string, Set<string>> = new Map(); // pageId -> Set<eventType>
  private maxHistorySize: number = 1000;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Start monitoring events for a page
   */
  async startMonitoring(
    pageId: string, 
    events: string[] = ['console', 'dialog', 'request', 'response', 'download', 'pageerror']
  ): Promise<void> {
    try {
      const pageSession = this.sessionManager.getPageSession(pageId);
      const page = pageSession.page;

      // Initialize event history for this page
      if (!this.eventHistory.has(pageId)) {
        this.eventHistory.set(pageId, {
          console: [],
          dialogs: [],
          requests: [],
          responses: [],
          downloads: [],
          errors: [],
        });
      }

      const activeEvents = this.activeListeners.get(pageId) || new Set();

      // Console events
      if (events.includes('console') && !activeEvents.has('console')) {
        page.on('console', (message: ConsoleMessage) => {
          this.handleConsoleMessage(pageId, message);
        });
        activeEvents.add('console');
      }

      // Dialog events
      if (events.includes('dialog') && !activeEvents.has('dialog')) {
        page.on('dialog', (dialog: Dialog) => {
          this.handleDialog(pageId, dialog);
        });
        activeEvents.add('dialog');
      }

      // Request events
      if (events.includes('request') && !activeEvents.has('request')) {
        page.on('request', (request) => {
          this.handleRequest(pageId, request);
        });
        activeEvents.add('request');
      }

      // Response events
      if (events.includes('response') && !activeEvents.has('response')) {
        page.on('response', (response) => {
          this.handleResponse(pageId, response);
        });
        activeEvents.add('response');
      }

      // Request failed events
      if (events.includes('requestfailed') && !activeEvents.has('requestfailed')) {
        page.on('requestfailed', (request) => {
          this.handleRequestFailed(pageId, request);
        });
        activeEvents.add('requestfailed');
      }

      // Download events
      if (events.includes('download') && !activeEvents.has('download')) {
        page.on('download', (download: Download) => {
          this.handleDownload(pageId, download);
        });
        activeEvents.add('download');
      }

      // Page error events
      if (events.includes('pageerror') && !activeEvents.has('pageerror')) {
        page.on('pageerror', (error) => {
          this.handlePageError(pageId, error);
        });
        activeEvents.add('pageerror');
      }

      // File chooser events
      if (events.includes('filechooser') && !activeEvents.has('filechooser')) {
        page.on('filechooser', (fileChooser: FileChooser) => {
          this.handleFileChooser(pageId, fileChooser);
        });
        activeEvents.add('filechooser');
      }

      // Popup events
      if (events.includes('popup') && !activeEvents.has('popup')) {
        page.on('popup', (popup) => {
          this.handlePopup(pageId, popup);
        });
        activeEvents.add('popup');
      }

      // Worker events
      if (events.includes('worker') && !activeEvents.has('worker')) {
        page.on('worker', (worker) => {
          this.handleWorker(pageId, worker);
        });
        activeEvents.add('worker');
      }

      this.activeListeners.set(pageId, activeEvents);
      logInfo(`Page monitor: Started monitoring ${events.join(', ')} events for page ${pageId}`);
    } catch (error) {
      logError(error, `Failed to start monitoring for page ${pageId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to start event monitoring: ${error.message}`
      );
    }
  }

  /**
   * Stop monitoring events for a page
   */
  async stopMonitoring(pageId: string, events?: string[]): Promise<void> {
    try {
      const pageSession = this.sessionManager.getPageSession(pageId);
      const page = pageSession.page;
      const activeEvents = this.activeListeners.get(pageId);

      if (!activeEvents) return;

      const eventsToStop = events || Array.from(activeEvents);

      // Remove event listeners
      for (const event of eventsToStop) {
        if (activeEvents.has(event)) {
          page.removeAllListeners(event);
          activeEvents.delete(event);
        }
      }

      if (activeEvents.size === 0) {
        this.activeListeners.delete(pageId);
      }

      logInfo(`Page monitor: Stopped monitoring ${eventsToStop.join(', ')} events for page ${pageId}`);
    } catch (error) {
      logError(error, `Failed to stop monitoring for page ${pageId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to stop event monitoring: ${error.message}`
      );
    }
  }

  /**
   * Get event history for a page
   */
  getEventHistory(pageId: string, eventType?: string, limit?: number): any[] {
    const history = this.eventHistory.get(pageId);
    if (!history) return [];

    if (eventType) {
      const events = history[eventType as keyof PageEventHistory] || [];
      return limit ? events.slice(-limit) : events;
    }

    // Return all events combined and sorted by timestamp
    const allEvents = [
      ...history.console.map(e => ({ ...e, eventType: 'console' })),
      ...history.dialogs.map(e => ({ ...e, eventType: 'dialog' })),
      ...history.requests.map(e => ({ ...e, eventType: 'request' })),
      ...history.responses.map(e => ({ ...e, eventType: 'response' })),
      ...history.downloads.map(e => ({ ...e, eventType: 'download' })),
      ...history.errors.map(e => ({ ...e, eventType: 'error' })),
    ];

    allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return limit ? allEvents.slice(-limit) : allEvents;
  }

  /**
   * Clear event history for a page
   */
  clearEventHistory(pageId: string, eventType?: string): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    if (eventType) {
      if (eventType in history) {
        (history[eventType as keyof PageEventHistory] as any[]).length = 0;
      }
    } else {
      // Clear all event types
      history.console.length = 0;
      history.dialogs.length = 0;
      history.requests.length = 0;
      history.responses.length = 0;
      history.downloads.length = 0;
      history.errors.length = 0;
    }

    logInfo(`Page monitor: Cleared ${eventType || 'all'} event history for page ${pageId}`);
  }

  /**
   * Get monitoring status for a page
   */
  getMonitoringStatus(pageId: string): {
    isMonitoring: boolean;
    activeEvents: string[];
    historySize: Record<string, number>;
  } {
    const activeEvents = this.activeListeners.get(pageId);
    const history = this.eventHistory.get(pageId);

    return {
      isMonitoring: activeEvents ? activeEvents.size > 0 : false,
      activeEvents: activeEvents ? Array.from(activeEvents) : [],
      historySize: history ? {
        console: history.console.length,
        dialogs: history.dialogs.length,
        requests: history.requests.length,
        responses: history.responses.length,
        downloads: history.downloads.length,
        errors: history.errors.length,
      } : {},
    };
  }

  private handleConsoleMessage(pageId: string, message: ConsoleMessage): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const consoleData: ConsoleMessageData = {
      type: message.type() as any,
      text: message.text(),
      location: message.location(),
      timestamp: new Date().toISOString(),
      args: message.args().map(arg => arg.toString()),
    };

    history.console.push(consoleData);
    this.trimHistory(history.console);
  }

  private handleDialog(pageId: string, dialog: Dialog): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const dialogData: DialogData = {
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue(),
      timestamp: new Date().toISOString(),
    };

    history.dialogs.push(dialogData);
    this.trimHistory(history.dialogs);

    // Auto-dismiss dialogs to prevent hanging
    dialog.accept().catch(() => dialog.dismiss());
  }

  private handleRequest(pageId: string, request: any): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const requestData: RequestData = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
      redirectedFrom: request.redirectedFrom()?.url(),
    };

    history.requests.push(requestData);
    this.trimHistory(history.requests);
  }

  private handleResponse(pageId: string, response: any): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const responseData: ResponseData = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      timestamp: new Date().toISOString(),
      fromCache: response.fromCache(),
      fromServiceWorker: response.fromServiceWorker(),
    };

    history.responses.push(responseData);
    this.trimHistory(history.responses);
  }

  private handleRequestFailed(pageId: string, request: any): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const requestData: RequestData = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString(),
      failure: request.failure() ? {
        errorText: request.failure().errorText,
      } : undefined,
    };

    history.requests.push(requestData);
    this.trimHistory(history.requests);
  }

  private handleDownload(pageId: string, download: Download): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const downloadData = {
      url: download.url(),
      suggestedFilename: download.suggestedFilename(),
      timestamp: new Date().toISOString(),
    };

    history.downloads.push(downloadData);
    this.trimHistory(history.downloads);
  }

  private handlePageError(pageId: string, error: Error): void {
    const history = this.eventHistory.get(pageId);
    if (!history) return;

    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    history.errors.push(errorData);
    this.trimHistory(history.errors);
  }

  private handleFileChooser(pageId: string, fileChooser: FileChooser): void {
    // File chooser events could be logged or handled specially
    logInfo(`Page monitor: File chooser opened on page ${pageId}`);
  }

  private handlePopup(pageId: string, popup: Page): void {
    logInfo(`Page monitor: Popup opened on page ${pageId}: ${popup.url()}`);
  }

  private handleWorker(pageId: string, worker: any): void {
    logInfo(`Page monitor: Worker created on page ${pageId}: ${worker.url()}`);
  }

  private trimHistory(array: any[]): void {
    if (array.length > this.maxHistorySize) {
      array.splice(0, array.length - this.maxHistorySize);
    }
  }

  /**
   * Cleanup all monitoring for a page
   */
  cleanupPage(pageId: string): void {
    this.stopMonitoring(pageId).catch(() => {});
    this.eventHistory.delete(pageId);
    this.activeListeners.delete(pageId);
    logInfo(`Page monitor: Cleaned up monitoring for page ${pageId}`);
  }

  /**
   * Cleanup all monitoring
   */
  cleanup(): void {
    for (const pageId of this.eventHistory.keys()) {
      this.cleanupPage(pageId);
    }
    logInfo('Page monitor: Cleanup completed');
  }
}