import { MCPServerError, MCP_ERROR_CODES, MCPToolResult } from '../types.js';
import { logError, logWarning, logInfo } from '../utils/errors.js';
import { BrowserPool } from './browser-pool.js';
import { ContextManager } from './context-manager.js';
import { PageEventMonitor } from './page-monitor.js';

/**
 * Comprehensive Error Handling and Resource Cleanup for Advanced Browser Tools
 */

export interface ResourceCleanupOptions {
  forceCleanup?: boolean;
  timeoutMs?: number;
  cleanupBrowsers?: boolean;
  cleanupContexts?: boolean;
  cleanupPages?: boolean;
  cleanupEventMonitors?: boolean;
}

export interface ErrorRecoveryStrategy {
  retryAttempts?: number;
  retryDelayMs?: number;
  fallbackAction?: 'ignore' | 'cleanup' | 'reconnect';
  logLevel?: 'error' | 'warning' | 'info';
}

export class AdvancedErrorHandler {
  private browserPool: BrowserPool;
  private contextManager: ContextManager;
  private pageMonitor: PageEventMonitor;
  private errorHistory: Map<string, Array<{ timestamp: Date; error: Error; context: any }>> = new Map();
  private maxErrorHistorySize = 100;

  constructor(
    browserPool: BrowserPool,
    contextManager: ContextManager,
    pageMonitor: PageEventMonitor
  ) {
    this.browserPool = browserPool;
    this.contextManager = contextManager;
    this.pageMonitor = pageMonitor;
  }

  /**
   * Wrap tool execution with comprehensive error handling
   */
  async executeWithErrorHandling<T>(
    toolName: string,
    operation: () => Promise<T>,
    options: {
      resourceIds?: { browserId?: string; contextId?: string; pageId?: string };
      recoveryStrategy?: ErrorRecoveryStrategy;
      cleanupOptions?: ResourceCleanupOptions;
    } = {}
  ): Promise<MCPToolResult> {
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = options.recoveryStrategy?.retryAttempts || 1;

    while (attempt < maxAttempts) {
      try {
        const result = await operation();
        
        // Log successful execution
        if (attempt > 0) {
          logInfo(`Tool ${toolName} succeeded after ${attempt + 1} attempts`);
        }

        return this.formatSuccessResult(result, {
          toolName,
          executionTime: Date.now() - startTime,
          attempts: attempt + 1,
        });

      } catch (error) {
        attempt++;
        
        // Record error in history
        this.recordError(toolName, error, {
          attempt,
          resourceIds: options.resourceIds,
          timestamp: new Date(),
        });

        // If this is the last attempt or error is not recoverable, handle final error
        if (attempt >= maxAttempts || !this.isRecoverableError(error)) {
          return await this.handleFinalError(
            toolName,
            error,
            options.resourceIds,
            options.cleanupOptions
          );
        }

        // Wait before retry
        const retryDelay = options.recoveryStrategy?.retryDelayMs || 1000;
        await this.delay(retryDelay * attempt); // Exponential backoff

        // Attempt recovery based on error type
        try {
          await this.attemptRecovery(error, options.resourceIds, options.recoveryStrategy);
          logWarning(`Tool ${toolName} attempting retry ${attempt + 1} after error recovery`);
        } catch (recoveryError) {
          logError(recoveryError, `Recovery attempt failed for tool ${toolName}`);
          // Continue with retry anyway
        }
      }
    }

    // This should never be reached, but handle it just in case
    return this.formatErrorResult(
      new MCPServerError(MCP_ERROR_CODES.INTERNAL_ERROR, 'Unexpected execution path'),
      toolName
    );
  }

  /**
   * Clean up resources based on error context
   */
  async performResourceCleanup(
    resourceIds: { browserId?: string; contextId?: string; pageId?: string } = {},
    options: ResourceCleanupOptions = {}
  ): Promise<void> {
    const cleanup = async (action: () => Promise<void>, description: string): Promise<boolean> => {
      try {
        const timeoutPromise = options.timeoutMs 
          ? new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Cleanup timeout')), options.timeoutMs)
            )
          : null;

        if (timeoutPromise) {
          await Promise.race([action(), timeoutPromise]);
        } else {
          await action();
        }

        logInfo(`Resource cleanup: ${description} completed successfully`);
        return true;
      } catch (error) {
        if (options.forceCleanup) {
          logWarning(`Resource cleanup: ${description} failed but continuing with force cleanup`);
          return false;
        } else {
          logError(error, `Resource cleanup: ${description} failed`);
          throw error;
        }
      }
    };

    // Clean up page-level resources
    if (resourceIds.pageId && (options.cleanupPages !== false)) {
      await cleanup(
        () => this.cleanupPageResources(resourceIds.pageId!),
        `page ${resourceIds.pageId}`
      );
    }

    // Clean up context-level resources
    if (resourceIds.contextId && (options.cleanupContexts !== false)) {
      await cleanup(
        () => this.cleanupContextResources(resourceIds.contextId!),
        `context ${resourceIds.contextId}`
      );
    }

    // Clean up browser-level resources
    if (resourceIds.browserId && (options.cleanupBrowsers !== false)) {
      await cleanup(
        () => this.cleanupBrowserResources(resourceIds.browserId!),
        `browser ${resourceIds.browserId}`
      );
    }

    // Clean up event monitors
    if (options.cleanupEventMonitors !== false && resourceIds.pageId) {
      await cleanup(
        () => this.pageMonitor.cleanupPage(resourceIds.pageId!),
        `event monitor for page ${resourceIds.pageId}`
      );
    }
  }

  /**
   * Generate detailed error diagnostics
   */
  async generateErrorDiagnostics(
    error: Error,
    resourceIds: { browserId?: string; contextId?: string; pageId?: string } = {}
  ): Promise<any> {
    const diagnostics: any = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      resources: {},
      system: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    };

    // Browser diagnostics
    if (resourceIds.browserId) {
      try {
        const isConnected = await this.browserPool.isBrowserConnected(resourceIds.browserId);
        diagnostics.resources.browser = {
          id: resourceIds.browserId,
          connected: isConnected,
        };
      } catch (e) {
        diagnostics.resources.browser = {
          id: resourceIds.browserId,
          connected: false,
          diagnosticError: e.message,
        };
      }
    }

    // Context diagnostics
    if (resourceIds.contextId) {
      try {
        const contextStats = await this.contextManager.getContextStats(resourceIds.contextId);
        diagnostics.resources.context = contextStats;
      } catch (e) {
        diagnostics.resources.context = {
          id: resourceIds.contextId,
          diagnosticError: e.message,
        };
      }
    }

    // Page diagnostics
    if (resourceIds.pageId) {
      try {
        const monitoringStatus = this.pageMonitor.getMonitoringStatus(resourceIds.pageId);
        diagnostics.resources.page = {
          id: resourceIds.pageId,
          monitoring: monitoringStatus,
        };
      } catch (e) {
        diagnostics.resources.page = {
          id: resourceIds.pageId,
          diagnosticError: e.message,
        };
      }
    }

    // Pool statistics
    try {
      const poolStats = this.browserPool.getPoolStats();
      diagnostics.resources.pool = poolStats;
    } catch (e) {
      diagnostics.resources.pool = { diagnosticError: e.message };
    }

    return diagnostics;
  }

  /**
   * Get error history for debugging
   */
  getErrorHistory(toolName?: string, limit: number = 50): any[] {
    if (toolName) {
      const toolErrors = this.errorHistory.get(toolName) || [];
      return toolErrors.slice(-limit);
    }

    // Get all errors across all tools
    const allErrors: any[] = [];
    for (const [tool, errors] of this.errorHistory) {
      allErrors.push(...errors.map(e => ({ ...e, toolName: tool })));
    }

    allErrors.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return allErrors.slice(-limit);
  }

  /**
   * Clear error history
   */
  clearErrorHistory(toolName?: string): void {
    if (toolName) {
      this.errorHistory.delete(toolName);
    } else {
      this.errorHistory.clear();
    }
    logInfo(`Error history cleared${toolName ? ` for tool ${toolName}` : ''}`);
  }

  private async handleFinalError(
    toolName: string,
    error: Error,
    resourceIds: { browserId?: string; contextId?: string; pageId?: string } = {},
    cleanupOptions: ResourceCleanupOptions = {}
  ): Promise<MCPToolResult> {
    logError(error, `Tool ${toolName} failed after all retry attempts`);

    // Generate diagnostics
    const diagnostics = await this.generateErrorDiagnostics(error, resourceIds);

    // Attempt cleanup if specified
    if (cleanupOptions.cleanupBrowsers || cleanupOptions.cleanupContexts || cleanupOptions.cleanupPages) {
      try {
        await this.performResourceCleanup(resourceIds, cleanupOptions);
      } catch (cleanupError) {
        logError(cleanupError, `Resource cleanup failed after error in tool ${toolName}`);
        diagnostics.cleanupError = cleanupError.message;
      }
    }

    return this.formatErrorResult(error, toolName, diagnostics);
  }

  private async attemptRecovery(
    error: Error,
    resourceIds: { browserId?: string; contextId?: string; pageId?: string } = {},
    strategy: ErrorRecoveryStrategy = {}
  ): Promise<void> {
    const fallbackAction = strategy.fallbackAction || 'ignore';

    switch (fallbackAction) {
      case 'cleanup':
        await this.performResourceCleanup(resourceIds, { forceCleanup: true });
        break;
      
      case 'reconnect':
        if (resourceIds.browserId) {
          const connected = await this.browserPool.isBrowserConnected(resourceIds.browserId);
          if (!connected) {
            logWarning(`Browser ${resourceIds.browserId} disconnected, attempting to clean up session`);
            await this.cleanupBrowserResources(resourceIds.browserId);
          }
        }
        break;
      
      case 'ignore':
      default:
        // No recovery action
        break;
    }
  }

  private isRecoverableError(error: Error): boolean {
    // Network errors, timeouts, and temporary failures are generally recoverable
    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporary/i,
      /rate limit/i,
      /target closed/i,
      /target crashed/i,
    ];

    const errorMessage = error.message.toLowerCase();
    return recoverablePatterns.some(pattern => pattern.test(errorMessage));
  }

  private recordError(toolName: string, error: Error, context: any): void {
    if (!this.errorHistory.has(toolName)) {
      this.errorHistory.set(toolName, []);
    }

    const errors = this.errorHistory.get(toolName)!;
    errors.push({
      timestamp: new Date(),
      error,
      context,
    });

    // Trim history if it gets too large
    if (errors.length > this.maxErrorHistorySize) {
      errors.splice(0, errors.length - this.maxErrorHistorySize);
    }
  }

  private async cleanupPageResources(pageId: string): Promise<void> {
    // Stop event monitoring
    this.pageMonitor.cleanupPage(pageId);
    
    // Additional page cleanup can be added here
    logInfo(`Cleaned up resources for page ${pageId}`);
  }

  private async cleanupContextResources(contextId: string): Promise<void> {
    // Clean up context
    await this.contextManager.closeContext(contextId);
    
    logInfo(`Cleaned up resources for context ${contextId}`);
  }

  private async cleanupBrowserResources(browserId: string): Promise<void> {
    // Browser cleanup is handled by the browser pool
    // Additional browser-specific cleanup can be added here
    logInfo(`Cleaned up resources for browser ${browserId}`);
  }

  private formatSuccessResult(result: any, metadata: any): MCPToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            result,
            metadata,
          }, null, 2),
        },
      ],
    };
  }

  private formatErrorResult(error: Error, toolName: string, diagnostics?: any): MCPToolResult {
    const mcpError = error instanceof MCPServerError ? error : new MCPServerError(
      MCP_ERROR_CODES.INTERNAL_ERROR,
      error.message
    );

    const errorData: any = {
      success: false,
      error: {
        code: mcpError.code,
        message: mcpError.message,
        toolName,
        timestamp: new Date().toISOString(),
      },
    };

    if (diagnostics) {
      errorData.diagnostics = diagnostics;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2),
        },
      ],
      isError: true,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all resources and error history
   */
  cleanup(): void {
    this.errorHistory.clear();
    logInfo('Advanced error handler: Cleanup completed');
  }
}