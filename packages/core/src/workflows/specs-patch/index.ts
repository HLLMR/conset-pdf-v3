/**
 * Specs patch workflow exports
 */

import { createWorkflowRunner } from '../engine.js';
import { specsPatchWorkflowImpl } from './specsPatchWorkflow.js';
import type { SpecsPatchAnalyzeInput, SpecsPatchExecuteInput } from './types.js';
import type { WorkflowRunner } from '../engine.js';

// Export types
export type { SpecsPatchAnalyzeInput, SpecsPatchExecuteInput } from './types.js';

// Export workflow implementation
export { specsPatchWorkflowImpl } from './specsPatchWorkflow.js';

/**
 * Create specs-patch workflow runner
 */
export function createSpecsPatchWorkflowRunner(): WorkflowRunner<
  SpecsPatchAnalyzeInput,
  SpecsPatchAnalyzeInput,
  SpecsPatchExecuteInput
> {
  return createWorkflowRunner('specs-patch', specsPatchWorkflowImpl);
}
