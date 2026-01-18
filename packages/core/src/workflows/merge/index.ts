/**
 * Merge workflow exports
 */

import { createWorkflowRunner } from '../engine.js';
import { mergeWorkflowImpl } from './mergeWorkflow.js';
import type { MergeAnalyzeInput, MergeExecuteInput } from './types.js';
import type { WorkflowRunner } from '../engine.js';

// Export types
export type { MergeAnalyzeInput, MergeExecuteInput } from './types.js';

// Export workflow implementation
export { mergeWorkflowImpl } from './mergeWorkflow.js';

/**
 * Create merge workflow runner
 */
export function createMergeWorkflowRunner(): WorkflowRunner<
  MergeAnalyzeInput,
  MergeAnalyzeInput,
  MergeExecuteInput
> {
  return createWorkflowRunner('merge', mergeWorkflowImpl);
}
