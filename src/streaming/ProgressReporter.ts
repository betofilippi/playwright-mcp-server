/**
 * Progress Reporter for Detailed Operation Tracking
 * Provides fine-grained progress reporting for complex automation tasks
 */

import { EventEmitter } from 'events';
import { ProgressInfo } from './StreamingManager.js';

export interface ProgressStage {
  id: string;
  name: string;
  description: string;
  weight: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  substages?: ProgressStage[];
}

export interface DetailedProgress extends ProgressInfo {
  stages: ProgressStage[];
  currentStage?: string;
  overallProgress: {
    stagesCompleted: number;
    totalStages: number;
    weightCompleted: number;
    totalWeight: number;
  };
}

export class ProgressReporter extends EventEmitter {
  private operationId: string;
  private stages: Map<string, ProgressStage> = new Map();
  private stageOrder: string[] = [];
  private currentStageId?: string;
  private overallProgress: DetailedProgress;

  constructor(operationId: string, initialStages: Omit<ProgressStage, 'status' | 'progress'>[]) {
    super();
    this.operationId = operationId;
    
    // Initialize stages
    for (const stage of initialStages) {
      const fullStage: ProgressStage = {
        ...stage,
        status: 'pending',
        progress: { current: 0, total: stage.substages?.length || 100, percentage: 0 }
      };
      this.stages.set(stage.id, fullStage);
      this.stageOrder.push(stage.id);
    }

    this.overallProgress = this.calculateOverallProgress();
  }

  /**
   * Start a stage
   */
  startStage(stageId: string): void {
    const stage = this.stages.get(stageId);
    if (!stage) {
      console.warn(`Stage ${stageId} not found`);
      return;
    }

    // Complete previous stage if running
    if (this.currentStageId && this.currentStageId !== stageId) {
      this.completeStage(this.currentStageId);
    }

    stage.status = 'running';
    stage.startTime = new Date();
    this.currentStageId = stageId;

    this.updateOverallProgress();
    this.emit('stage_started', stage);
  }

  /**
   * Update stage progress
   */
  updateStageProgress(
    stageId: string, 
    current: number, 
    total?: number, 
    message?: string
  ): void {
    const stage = this.stages.get(stageId);
    if (!stage) {
      console.warn(`Stage ${stageId} not found`);
      return;
    }

    if (total !== undefined) {
      stage.progress.total = total;
    }

    stage.progress.current = Math.min(current, stage.progress.total);
    stage.progress.percentage = stage.progress.total > 0 
      ? Math.round((stage.progress.current / stage.progress.total) * 100)
      : 0;

    if (stage.status === 'pending') {
      this.startStage(stageId);
    }

    this.updateOverallProgress();
    this.emit('stage_progress', stage, message);
  }

  /**
   * Complete a stage
   */
  completeStage(stageId: string): void {
    const stage = this.stages.get(stageId);
    if (!stage) {
      console.warn(`Stage ${stageId} not found`);
      return;
    }

    stage.status = 'completed';
    stage.endTime = new Date();
    stage.progress.current = stage.progress.total;
    stage.progress.percentage = 100;

    if (this.currentStageId === stageId) {
      this.currentStageId = undefined;
      
      // Auto-start next stage if available
      const currentIndex = this.stageOrder.indexOf(stageId);
      if (currentIndex >= 0 && currentIndex < this.stageOrder.length - 1) {
        const nextStageId = this.stageOrder[currentIndex + 1];
        const nextStage = this.stages.get(nextStageId);
        if (nextStage && nextStage.status === 'pending') {
          setTimeout(() => this.startStage(nextStageId), 10);
        }
      }
    }

    this.updateOverallProgress();
    this.emit('stage_completed', stage);
  }

  /**
   * Fail a stage
   */
  failStage(stageId: string, error: string): void {
    const stage = this.stages.get(stageId);
    if (!stage) {
      console.warn(`Stage ${stageId} not found`);
      return;
    }

    stage.status = 'failed';
    stage.endTime = new Date();

    if (this.currentStageId === stageId) {
      this.currentStageId = undefined;
    }

    this.updateOverallProgress();
    this.emit('stage_failed', stage, error);
  }

  /**
   * Skip a stage
   */
  skipStage(stageId: string, reason?: string): void {
    const stage = this.stages.get(stageId);
    if (!stage) {
      console.warn(`Stage ${stageId} not found`);
      return;
    }

    stage.status = 'skipped';
    stage.endTime = new Date();
    stage.progress.percentage = 100; // Consider skipped as completed for progress

    if (this.currentStageId === stageId) {
      this.currentStageId = undefined;
    }

    this.updateOverallProgress();
    this.emit('stage_skipped', stage, reason);
  }

  /**
   * Add a substage to an existing stage
   */
  addSubstage(
    parentStageId: string, 
    substage: Omit<ProgressStage, 'status' | 'progress'>
  ): void {
    const parentStage = this.stages.get(parentStageId);
    if (!parentStage) {
      console.warn(`Parent stage ${parentStageId} not found`);
      return;
    }

    const fullSubstage: ProgressStage = {
      ...substage,
      status: 'pending',
      progress: { current: 0, total: 100, percentage: 0 }
    };

    if (!parentStage.substages) {
      parentStage.substages = [];
    }

    parentStage.substages.push(fullSubstage);
    parentStage.progress.total = parentStage.substages.length;

    this.updateOverallProgress();
    this.emit('substage_added', parentStage, fullSubstage);
  }

  /**
   * Update substage progress
   */
  updateSubstageProgress(
    parentStageId: string,
    substageId: string,
    current: number,
    total?: number
  ): void {
    const parentStage = this.stages.get(parentStageId);
    if (!parentStage?.substages) {
      console.warn(`Parent stage ${parentStageId} or substages not found`);
      return;
    }

    const substage = parentStage.substages.find(s => s.id === substageId);
    if (!substage) {
      console.warn(`Substage ${substageId} not found`);
      return;
    }

    if (total !== undefined) {
      substage.progress.total = total;
    }

    substage.progress.current = Math.min(current, substage.progress.total);
    substage.progress.percentage = substage.progress.total > 0 
      ? Math.round((substage.progress.current / substage.progress.total) * 100)
      : 0;

    if (substage.status === 'pending') {
      substage.status = 'running';
      substage.startTime = new Date();
    }

    // Update parent stage progress based on substages
    const completedSubstages = parentStage.substages.filter(s => 
      s.status === 'completed' || s.status === 'skipped'
    ).length;
    
    parentStage.progress.current = completedSubstages;
    parentStage.progress.percentage = parentStage.substages.length > 0
      ? Math.round((completedSubstages / parentStage.substages.length) * 100)
      : 0;

    this.updateOverallProgress();
    this.emit('substage_progress', parentStage, substage);
  }

  /**
   * Get current progress as ProgressInfo
   */
  getProgressInfo(): DetailedProgress {
    return { ...this.overallProgress };
  }

  /**
   * Get stage by ID
   */
  getStage(stageId: string): ProgressStage | undefined {
    return this.stages.get(stageId);
  }

  /**
   * Get all stages
   */
  getAllStages(): ProgressStage[] {
    return this.stageOrder.map(id => this.stages.get(id)!);
  }

  /**
   * Get current stage
   */
  getCurrentStage(): ProgressStage | undefined {
    return this.currentStageId ? this.stages.get(this.currentStageId) : undefined;
  }

  /**
   * Get next pending stage
   */
  getNextPendingStage(): ProgressStage | undefined {
    for (const stageId of this.stageOrder) {
      const stage = this.stages.get(stageId);
      if (stage && stage.status === 'pending') {
        return stage;
      }
    }
    return undefined;
  }

  /**
   * Check if all stages are completed
   */
  isCompleted(): boolean {
    return Array.from(this.stages.values()).every(stage => 
      stage.status === 'completed' || stage.status === 'skipped'
    );
  }

  /**
   * Check if any stage has failed
   */
  hasFailed(): boolean {
    return Array.from(this.stages.values()).some(stage => 
      stage.status === 'failed'
    );
  }

  /**
   * Get progress summary
   */
  getProgressSummary(): {
    operationId: string;
    currentStage?: string;
    overallPercentage: number;
    stagesCompleted: number;
    totalStages: number;
    timeElapsed: number;
    estimatedTimeRemaining?: number;
  } {
    const firstStage = this.stageOrder.length > 0 ? 
      this.stages.get(this.stageOrder[0]) : null;
    
    const timeElapsed = firstStage?.startTime ? 
      Date.now() - firstStage.startTime.getTime() : 0;

    return {
      operationId: this.operationId,
      currentStage: this.currentStageId,
      overallPercentage: Math.round(this.overallProgress.percentage || 0),
      stagesCompleted: this.overallProgress.overallProgress.stagesCompleted,
      totalStages: this.overallProgress.overallProgress.totalStages,
      timeElapsed,
      estimatedTimeRemaining: this.overallProgress.estimatedTimeRemaining
    };
  }

  /**
   * Reset all stages to pending
   */
  reset(): void {
    for (const stage of this.stages.values()) {
      stage.status = 'pending';
      stage.startTime = undefined;
      stage.endTime = undefined;
      stage.progress = { current: 0, total: stage.progress.total, percentage: 0 };
      
      if (stage.substages) {
        for (const substage of stage.substages) {
          substage.status = 'pending';
          substage.startTime = undefined;
          substage.endTime = undefined;
          substage.progress = { current: 0, total: substage.progress.total, percentage: 0 };
        }
      }
    }

    this.currentStageId = undefined;
    this.updateOverallProgress();
    this.emit('progress_reset');
  }

  /**
   * Calculate overall progress
   */
  private calculateOverallProgress(): DetailedProgress {
    const stages = Array.from(this.stages.values());
    let totalWeight = 0;
    let completedWeight = 0;
    let stagesCompleted = 0;

    for (const stage of stages) {
      totalWeight += stage.weight;
      
      if (stage.status === 'completed' || stage.status === 'skipped') {
        completedWeight += stage.weight;
        stagesCompleted++;
      } else if (stage.status === 'running') {
        completedWeight += (stage.weight * stage.progress.percentage) / 100;
      }
    }

    const overallPercentage = totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;

    return {
      total: 100,
      completed: Math.round(overallPercentage),
      percentage: Math.round(overallPercentage),
      message: this.currentStageId ? this.stages.get(this.currentStageId)?.name : undefined,
      stage: this.currentStageId,
      stages: stages,
      currentStage: this.currentStageId,
      overallProgress: {
        stagesCompleted,
        totalStages: stages.length,
        weightCompleted: completedWeight,
        totalWeight
      }
    };
  }

  /**
   * Update overall progress and emit event
   */
  private updateOverallProgress(): void {
    this.overallProgress = this.calculateOverallProgress();
    this.emit('progress_updated', this.overallProgress);
  }

  /**
   * Create a stage template for common operations
   */
  static createScreenshotStages(): Omit<ProgressStage, 'status' | 'progress'>[] {
    return [
      {
        id: 'prepare',
        name: 'Preparing Screenshot',
        description: 'Preparing page and viewport for screenshot',
        weight: 20
      },
      {
        id: 'capture',
        name: 'Capturing Screenshot',
        description: 'Taking screenshot of the page',
        weight: 50
      },
      {
        id: 'process',
        name: 'Processing Image',
        description: 'Processing and encoding screenshot data',
        weight: 30
      }
    ];
  }

  static createNavigationStages(): Omit<ProgressStage, 'status' | 'progress'>[] {
    return [
      {
        id: 'navigate',
        name: 'Navigating to URL',
        description: 'Loading the target URL',
        weight: 40
      },
      {
        id: 'wait',
        name: 'Waiting for Page Load',
        description: 'Waiting for page content to load',
        weight: 40
      },
      {
        id: 'verify',
        name: 'Verifying Page',
        description: 'Verifying page loaded successfully',
        weight: 20
      }
    ];
  }

  static createExtractionStages(): Omit<ProgressStage, 'status' | 'progress'>[] {
    return [
      {
        id: 'analyze',
        name: 'Analyzing Page',
        description: 'Analyzing page structure for data extraction',
        weight: 25
      },
      {
        id: 'extract',
        name: 'Extracting Data',
        description: 'Extracting data from page elements',
        weight: 50
      },
      {
        id: 'format',
        name: 'Formatting Results',
        description: 'Formatting and structuring extracted data',
        weight: 25
      }
    ];
  }
}