/**
 * Streaming Manager for Long-Running Operations
 * Handles streaming responses and progress reporting for browser automation tasks
 */

import { EventEmitter } from 'events';
import { MCPResponse, MCPNotification } from '../types.js';

export interface StreamingResponse {
  id: string;
  requestId: string | number;
  type: 'partial' | 'progress' | 'complete' | 'error';
  timestamp: Date;
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface ProgressInfo {
  total?: number;
  completed: number;
  message?: string;
  stage?: string;
  percentage?: number;
  estimatedTimeRemaining?: number;
}

export interface StreamingOperation {
  id: string;
  requestId: string | number;
  type: 'screenshot' | 'navigation' | 'extraction' | 'automation' | 'custom';
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  progress: ProgressInfo;
  startTime: Date;
  endTime?: Date;
  transportId?: string;
  cleanup?: () => Promise<void>;
}

export class StreamingManager extends EventEmitter {
  private operations = new Map<string, StreamingOperation>();
  private progressTokens = new Map<string | number, string>();
  private responseBuffer = new Map<string, StreamingResponse[]>();
  
  private maxBufferSize = 1000;
  private maxOperationAge = 600000; // 10 minutes
  private cleanupInterval = 60000; // 1 minute
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupCleanup();
  }

  /**
   * Start a streaming operation
   */
  startOperation(
    requestId: string | number,
    type: StreamingOperation['type'],
    transportId?: string
  ): string {
    const operationId = this.generateOperationId();
    
    const operation: StreamingOperation = {
      id: operationId,
      requestId,
      type,
      status: 'pending',
      progress: { completed: 0 },
      startTime: new Date(),
      transportId
    };

    this.operations.set(operationId, operation);
    this.progressTokens.set(requestId, operationId);
    this.responseBuffer.set(operationId, []);

    this.emit('operation_started', operation);
    return operationId;
  }

  /**
   * Update operation progress
   */
  updateProgress(
    operationId: string,
    progress: Partial<ProgressInfo>,
    data?: unknown
  ): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    // Update progress
    operation.progress = {
      ...operation.progress,
      ...progress
    };

    // Calculate percentage if not provided
    if (operation.progress.total && operation.progress.total > 0 && !operation.progress.percentage) {
      operation.progress.percentage = Math.round(
        (operation.progress.completed / operation.progress.total) * 100
      );
    }

    // Estimate time remaining
    if (operation.progress.total && operation.progress.completed > 0) {
      const elapsed = Date.now() - operation.startTime.getTime();
      const rate = operation.progress.completed / elapsed;
      const remaining = operation.progress.total - operation.progress.completed;
      operation.progress.estimatedTimeRemaining = Math.round(remaining / rate);
    }

    // Update status
    if (operation.status === 'pending') {
      operation.status = 'running';
    }

    // Create streaming response
    const response: StreamingResponse = {
      id: this.generateResponseId(),
      requestId: operation.requestId,
      type: 'progress',
      timestamp: new Date(),
      data: {
        operationId,
        progress: operation.progress,
        operationType: operation.type,
        ...(data && { additionalData: data })
      }
    };

    this.addResponse(operationId, response);
    this.emit('progress_updated', operation, response);
  }

  /**
   * Send partial result
   */
  sendPartialResult(operationId: string, data: unknown, metadata?: Record<string, unknown>): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    const response: StreamingResponse = {
      id: this.generateResponseId(),
      requestId: operation.requestId,
      type: 'partial',
      timestamp: new Date(),
      data,
      metadata
    };

    this.addResponse(operationId, response);
    this.emit('partial_result', operation, response);
  }

  /**
   * Complete operation
   */
  completeOperation(operationId: string, finalResult: unknown): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'completed';
    operation.endTime = new Date();
    operation.progress.completed = operation.progress.total || operation.progress.completed;
    operation.progress.percentage = 100;

    const response: StreamingResponse = {
      id: this.generateResponseId(),
      requestId: operation.requestId,
      type: 'complete',
      timestamp: new Date(),
      data: finalResult,
      metadata: {
        duration: operation.endTime.getTime() - operation.startTime.getTime(),
        operationType: operation.type
      }
    };

    this.addResponse(operationId, response);
    this.emit('operation_completed', operation, response);
  }

  /**
   * Fail operation with error
   */
  failOperation(operationId: string, error: Error | string): void {
    const operation = this.operations.get(operationId);
    if (!operation) return;

    operation.status = 'error';
    operation.endTime = new Date();

    const response: StreamingResponse = {
      id: this.generateResponseId(),
      requestId: operation.requestId,
      type: 'error',
      timestamp: new Date(),
      data: {
        error: error instanceof Error ? error.message : error,
        operationType: operation.type,
        ...(error instanceof Error && { stack: error.stack })
      },
      metadata: {
        duration: operation.endTime.getTime() - operation.startTime.getTime()
      }
    };

    this.addResponse(operationId, response);
    this.emit('operation_failed', operation, response);
  }

  /**
   * Cancel operation
   */
  async cancelOperation(operationId: string, reason = 'Cancelled by user'): Promise<boolean> {
    const operation = this.operations.get(operationId);
    if (!operation || operation.status === 'completed' || operation.status === 'error') {
      return false;
    }

    // Run cleanup if available
    if (operation.cleanup) {
      try {
        await operation.cleanup();
      } catch (error) {
        console.error(`Error during operation cleanup:`, error);
      }
    }

    operation.status = 'cancelled';
    operation.endTime = new Date();

    const response: StreamingResponse = {
      id: this.generateResponseId(),
      requestId: operation.requestId,
      type: 'error',
      timestamp: new Date(),
      data: {
        cancelled: true,
        reason,
        operationType: operation.type
      },
      metadata: {
        duration: operation.endTime.getTime() - operation.startTime.getTime()
      }
    };

    this.addResponse(operationId, response);
    this.emit('operation_cancelled', operation, response);
    return true;
  }

  /**
   * Get operation by ID
   */
  getOperation(operationId: string): StreamingOperation | undefined {
    return this.operations.get(operationId);
  }

  /**
   * Get operation by request ID
   */
  getOperationByRequestId(requestId: string | number): StreamingOperation | undefined {
    const operationId = this.progressTokens.get(requestId);
    return operationId ? this.operations.get(operationId) : undefined;
  }

  /**
   * Get all responses for an operation
   */
  getOperationResponses(operationId: string): StreamingResponse[] {
    return this.responseBuffer.get(operationId) || [];
  }

  /**
   * Get recent responses for an operation
   */
  getRecentResponses(operationId: string, limit = 10): StreamingResponse[] {
    const responses = this.responseBuffer.get(operationId) || [];
    return responses.slice(-limit);
  }

  /**
   * Create progress notification for MCP
   */
  createProgressNotification(operationId: string): MCPNotification | null {
    const operation = this.operations.get(operationId);
    if (!operation) return null;

    return {
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken: operation.requestId,
        progress: {
          total: operation.progress.total,
          completed: operation.progress.completed
        }
      }
    };
  }

  /**
   * Create streaming notification for MCP
   */
  createStreamingNotification(
    operationId: string,
    response: StreamingResponse
  ): MCPNotification | null {
    const operation = this.operations.get(operationId);
    if (!operation) return null;

    return {
      jsonrpc: '2.0',
      method: `notifications/streaming/${response.type}`,
      params: {
        operationId,
        requestId: operation.requestId,
        type: response.type,
        timestamp: response.timestamp.toISOString(),
        data: response.data,
        metadata: response.metadata
      }
    };
  }

  /**
   * List active operations
   */
  getActiveOperations(): StreamingOperation[] {
    return Array.from(this.operations.values()).filter(
      op => op.status === 'pending' || op.status === 'running'
    );
  }

  /**
   * List all operations
   */
  getAllOperations(): StreamingOperation[] {
    return Array.from(this.operations.values());
  }

  /**
   * Get operations by transport
   */
  getOperationsByTransport(transportId: string): StreamingOperation[] {
    return Array.from(this.operations.values()).filter(
      op => op.transportId === transportId
    );
  }

  /**
   * Get operation statistics
   */
  getStats(): {
    totalOperations: number;
    activeOperations: number;
    completedOperations: number;
    failedOperations: number;
    cancelledOperations: number;
    operationsByType: Record<string, number>;
    avgDuration: number;
    totalResponses: number;
  } {
    const operations = Array.from(this.operations.values());
    
    const stats = {
      totalOperations: operations.length,
      activeOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      cancelledOperations: 0,
      operationsByType: {} as Record<string, number>,
      avgDuration: 0,
      totalResponses: 0
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const op of operations) {
      // Count by status
      if (op.status === 'pending' || op.status === 'running') {
        stats.activeOperations++;
      } else if (op.status === 'completed') {
        stats.completedOperations++;
      } else if (op.status === 'error') {
        stats.failedOperations++;
      } else if (op.status === 'cancelled') {
        stats.cancelledOperations++;
      }

      // Count by type
      stats.operationsByType[op.type] = (stats.operationsByType[op.type] || 0) + 1;

      // Calculate duration
      if (op.endTime) {
        totalDuration += op.endTime.getTime() - op.startTime.getTime();
        completedCount++;
      }
    }

    // Calculate average duration
    stats.avgDuration = completedCount > 0 ? totalDuration / completedCount : 0;

    // Count total responses
    for (const responses of this.responseBuffer.values()) {
      stats.totalResponses += responses.length;
    }

    return stats;
  }

  /**
   * Add response to buffer
   */
  private addResponse(operationId: string, response: StreamingResponse): void {
    const buffer = this.responseBuffer.get(operationId) || [];
    buffer.push(response);

    // Limit buffer size
    if (buffer.length > this.maxBufferSize) {
      buffer.splice(0, buffer.length - this.maxBufferSize);
    }

    this.responseBuffer.set(operationId, buffer);
  }

  /**
   * Setup cleanup timer
   */
  private setupCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldOperations();
    }, this.cleanupInterval);
  }

  /**
   * Cleanup old completed operations
   */
  private cleanupOldOperations(): void {
    const now = Date.now();
    const operationsToCleanup: string[] = [];

    for (const [operationId, operation] of this.operations) {
      // Only cleanup completed/failed/cancelled operations
      if (operation.status === 'pending' || operation.status === 'running') {
        continue;
      }

      const age = now - operation.startTime.getTime();
      if (age > this.maxOperationAge) {
        operationsToCleanup.push(operationId);
      }
    }

    for (const operationId of operationsToCleanup) {
      const operation = this.operations.get(operationId);
      if (operation) {
        this.operations.delete(operationId);
        this.progressTokens.delete(operation.requestId);
        this.responseBuffer.delete(operationId);
      }
    }

    if (operationsToCleanup.length > 0) {
      console.log(`Cleaned up ${operationsToCleanup.length} old operations`);
    }
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique response ID
   */
  private generateResponseId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cancel operations by transport
   */
  async cancelOperationsByTransport(transportId: string): Promise<number> {
    const operations = this.getOperationsByTransport(transportId);
    let cancelledCount = 0;

    for (const operation of operations) {
      const success = await this.cancelOperation(
        operation.id, 
        'Transport disconnected'
      );
      if (success) cancelledCount++;
    }

    return cancelledCount;
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Cancel all active operations
    const activeOps = this.getActiveOperations();
    for (const operation of activeOps) {
      this.cancelOperation(operation.id, 'Server shutting down').catch(console.error);
    }

    this.operations.clear();
    this.progressTokens.clear();
    this.responseBuffer.clear();
    this.removeAllListeners();
  }
}