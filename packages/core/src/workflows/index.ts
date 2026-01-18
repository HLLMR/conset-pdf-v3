/**
 * Workflow engine exports
 * 
 * Provides a consistent interface for workflow operations across the codebase.
 */

// Export types
export type {
  WorkflowId,
  Severity,
  RowStatus,
  Confidence,
  InventoryRowBase,
  Issue,
  Conflict,
  InventoryResult,
  CorrectionOverlay,
  ExecuteResult,
} from './types.js';

// Export engine
export {
  createWorkflowRunner,
  type WorkflowImpl,
  type WorkflowRunner,
} from './engine.js';

// Export merge mappers
export {
  mapParseInventoryToInventoryRows,
  mapMergePlanToSummary,
  mapMergeReportWarningsToIssues,
  mapUnmatchedToIssuesOrConflicts,
} from './mappers/merge.js';

// Export merge workflow
export {
  createMergeWorkflowRunner,
  mergeWorkflowImpl,
  type MergeAnalyzeInput,
  type MergeExecuteInput,
} from './merge/index.js';
