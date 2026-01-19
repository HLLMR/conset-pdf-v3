/**
 * Bookmarks workflow exports
 */

import { createWorkflowRunner } from '../engine.js';
import { bookmarksWorkflowImpl } from './bookmarksWorkflow.js';
import type { BookmarksAnalyzeInput, BookmarksExecuteInput } from './types.js';
import type { WorkflowRunner } from '../engine.js';

// Export types
export type { BookmarksAnalyzeInput, BookmarksExecuteInput } from './types.js';

// Export workflow implementation
export { bookmarksWorkflowImpl } from './bookmarksWorkflow.js';

/**
 * Create bookmarks workflow runner
 */
export function createBookmarksWorkflowRunner(): WorkflowRunner<
  BookmarksAnalyzeInput,
  BookmarksAnalyzeInput,
  BookmarksExecuteInput
> {
  return createWorkflowRunner('fix-bookmarks', bookmarksWorkflowImpl);
}
