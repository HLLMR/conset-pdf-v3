/**
 * Bookmarks workflow tests
 */

import { describe, it, expect } from '@jest/globals';
import { createBookmarksWorkflowRunner } from './index.js';
import type { BookmarksAnalyzeInput } from './types.js';

describe('BookmarksWorkflow', () => {
  it('should create workflow runner', () => {
    const runner = createBookmarksWorkflowRunner();
    expect(runner).toBeDefined();
    expect(runner.analyze).toBeDefined();
    expect(runner.applyCorrections).toBeDefined();
    expect(runner.execute).toBeDefined();
  });

  it('should return empty result from analyze', async () => {
    const runner = createBookmarksWorkflowRunner();
    const input: BookmarksAnalyzeInput = {
      inputPdfPath: 'test.pdf',
    };
    const result = await runner.analyze(input);
    expect(result.workflowId).toBe('fix-bookmarks');
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
