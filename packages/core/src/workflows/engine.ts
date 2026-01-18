/**
 * Workflow engine runner
 * 
 * Provides a consistent interface for workflow implementations.
 */

import type {
  WorkflowId,
  InventoryResult,
  CorrectionOverlay,
  ExecuteResult,
} from './types.js';

/**
 * Workflow implementation interface
 * 
 * @template IAnalyze - Input type for analyze operation
 * @template ICorrections - Input type for applyCorrections operation (typically same as IAnalyze)
 * @template IExecute - Input type for execute operation
 */
export interface WorkflowImpl<IAnalyze, ICorrections, IExecute> {
  /**
   * Analyze input and produce inventory result
   * Must NOT write output files - this is a dry-run operation
   */
  analyze(input: IAnalyze): Promise<InventoryResult>;

  /**
   * Apply corrections overlay to inventory
   * Returns modified inventory with corrections applied
   */
  applyCorrections(
    input: ICorrections,
    inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult>;

  /**
   * Execute the workflow
   * Produces output files and returns execution result
   */
  execute(input: IExecute): Promise<ExecuteResult>;
}

/**
 * Workflow runner interface
 */
export interface WorkflowRunner<IAnalyze, ICorrections, IExecute> {
  analyze: (input: IAnalyze) => Promise<InventoryResult>;
  applyCorrections: (
    input: ICorrections,
    inventory: InventoryResult,
    corrections: CorrectionOverlay
  ) => Promise<InventoryResult>;
  execute: (input: IExecute) => Promise<ExecuteResult>;
}

/**
 * Create a workflow runner from an implementation
 * 
 * @param _workflowId - Workflow identifier (reserved for future use)
 * @param impl - Workflow implementation
 * @returns Workflow runner with analyze, applyCorrections, and execute methods
 */
export function createWorkflowRunner<IAnalyze, ICorrections, IExecute>(
  _workflowId: WorkflowId,
  impl: WorkflowImpl<IAnalyze, ICorrections, IExecute>
): WorkflowRunner<IAnalyze, ICorrections, IExecute> {
  return {
    analyze: (input: IAnalyze) => impl.analyze(input),
    applyCorrections: (input: ICorrections, inventory: InventoryResult, corrections: CorrectionOverlay) =>
      impl.applyCorrections(input, inventory, corrections),
    execute: (input: IExecute) => impl.execute(input),
  };
}
