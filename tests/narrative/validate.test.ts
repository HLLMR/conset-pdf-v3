/**
 * Tests for narrative validation against inventory
 */

import {
  validateNarrativeAgainstInventory,
  type NarrativeInstructionSet,
} from '@conset-pdf/core';
import type { InventoryResult, InventoryRowBase } from '@conset-pdf/core';

/**
 * Helper to create a minimal narrative instruction set
 */
function createNarrative(
  drawings: Array<{ raw: string; normalized: string }> = [],
  specs: Array<{ raw: string; normalized: string }> = []
): NarrativeInstructionSet {
  return {
    meta: {
      fileHash: 'test-hash',
      pageCount: 1,
      extractedAtIso: new Date().toISOString(),
    },
    drawings: drawings.map(d => ({
      kind: 'sheetChange',
      changeType: 'revised_reissued',
      sheetIdRaw: d.raw,
      sheetIdNormalized: d.normalized,
      evidence: {
        pageNumber: 1,
        rawLine: `Sheet ${d.raw}`,
      },
      source: 'algorithmic',
    })),
    specs: specs.map(s => ({
      kind: 'specSectionChange',
      sectionIdRaw: s.raw,
      sectionIdNormalized: s.normalized,
      actions: [
        {
          verb: 'revise',
          rawText: `Revise ${s.raw}`,
        },
      ],
      evidence: {
        pageNumber: 1,
        rawBlock: `Section ${s.raw}`,
      },
      source: 'algorithmic',
    })),
    issues: [],
  };
}

/**
 * Helper to create a minimal inventory result
 */
function createInventory(
  rows: Array<{
    id: string;
    normalizedId: string;
    status?: 'ok' | 'warning' | 'error';
    docType?: 'drawings' | 'specs';
  }> = [],
  docType: 'drawings' | 'specs' = 'drawings'
): InventoryResult {
  return {
    workflowId: 'merge',
    rows: rows.map(r => ({
      id: r.id,
      normalizedId: r.normalizedId,
      status: r.status || 'ok',
      confidence: 1.0,
    } as InventoryRowBase & { normalizedId: string })),
    issues: [],
    conflicts: [],
    summary: {
      totalRows: rows.length,
      rowsWithIds: rows.length,
      rowsWithoutIds: 0,
      rowsOk: rows.filter(r => r.status !== 'error' && r.status !== 'warning').length,
      rowsWarning: rows.filter(r => r.status === 'warning').length,
      rowsError: rows.filter(r => r.status === 'error').length,
      rowsConflict: 0,
      issuesCount: 0,
      conflictsCount: 0,
    },
    meta: {
      docType,
    },
  };
}

describe('Narrative Validation', () => {
  describe('Drawing instructions', () => {
    test('exact match emits no issue', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-101' },
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(0);
    });

    test('missing sheet emits NOT_FOUND issue', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'Z-999' }, // Very different ID
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SHEET_NOT_FOUND');
      expect(report.issues[0].severity).toBe('warn');
      expect(report.issues[0].ref?.idNormalized).toBe('A-101');
    });

    test('near match emits NEAR_MATCH issue with candidates', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-102' }, // Close match
        { id: 'row2', normalizedId: 'B-201' }, // Not close
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.75,
      });

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SHEET_NEAR_MATCH');
      expect(report.issues[0].nearMatches).toBeDefined();
      expect(report.issues[0].nearMatches!.length).toBeGreaterThan(0);
      expect(report.issues[0].nearMatches![0].rowId).toBe('row1');
    });

    test('ambiguous exact matches emits AMBIGUOUS issue', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-101' },
        { id: 'row2', normalizedId: 'A-101' },
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SHEET_AMBIGUOUS_MATCH');
      expect(report.issues[0].inventoryRowIds).toHaveLength(2);
      expect(report.issues[0].inventoryRowIds).toContain('row1');
      expect(report.issues[0].inventoryRowIds).toContain('row2');
    });
  });

  describe('Spec instructions', () => {
    test('exact match emits no issue', () => {
      const narrative = createNarrative([], [{ raw: '23 02 00', normalized: '23 02 00' }]);
      const inventory = createInventory(
        [{ id: 'row1', normalizedId: '23 02 00' }],
        'specs'
      );

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(0);
    });

    test('missing spec emits NOT_FOUND issue', () => {
      const narrative = createNarrative([], [{ raw: '23 02 00', normalized: '23 02 00' }]);
      const inventory = createInventory(
        [{ id: 'row1', normalizedId: '99 99 99' }], // Very different ID
        'specs'
      );

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SPEC_NOT_FOUND');
      expect(report.issues[0].ref?.idNormalized).toBe('23 02 00');
    });

    test('near match emits NEAR_MATCH issue', () => {
      const narrative = createNarrative([], [{ raw: '23 02 00', normalized: '23 02 00' }]);
      const inventory = createInventory(
        [{ id: 'row1', normalizedId: '23 02 01' }], // Close match
        'specs'
      );

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.75,
      });

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SPEC_NEAR_MATCH');
      expect(report.issues[0].nearMatches).toBeDefined();
    });

    test('ambiguous exact matches emits AMBIGUOUS issue', () => {
      const narrative = createNarrative([], [{ raw: '23 02 00', normalized: '23 02 00' }]);
      const inventory = createInventory(
        [
          { id: 'row1', normalizedId: '23 02 00' },
          { id: 'row2', normalizedId: '23 02 00' },
        ],
        'specs'
      );

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0].code).toBe('NARR_SPEC_AMBIGUOUS_MATCH');
    });
  });

  describe('Inventory-not-mentioned check', () => {
    test('changed inventory rows not mentioned emit warn', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-101', status: 'ok' }, // Mentioned, no issue
        { id: 'row2', normalizedId: 'A-102', status: 'warning' }, // Changed but not mentioned
        { id: 'row3', normalizedId: 'A-103', status: 'error' }, // Changed but not mentioned
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      // Should have one issue for inventory not mentioned
      const notMentionedIssues = report.issues.filter(
        i => i.code === 'NARR_INVENTORY_NOT_MENTIONED'
      );
      expect(notMentionedIssues.length).toBeGreaterThan(0);
      expect(notMentionedIssues[0].severity).toBe('warn');
    });

    test('capped to maxUnmentioned rows', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const rows = Array.from({ length: 60 }, (_, i) => ({
        id: `row${i}`,
        normalizedId: `A-${100 + i}`,
        status: 'warning' as const,
      }));
      const inventory = createInventory(rows);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      const notMentionedIssues = report.issues.filter(
        i => i.code === 'NARR_INVENTORY_NOT_MENTIONED'
      );
      expect(notMentionedIssues.length).toBeGreaterThan(0);
      // Should mention "+N more" if capped
      if (notMentionedIssues[0].inventoryRowIds!.length >= 50) {
        expect(notMentionedIssues[0].message).toContain('more');
      }
    });
  });

  describe('Validation report structure', () => {
    test('report includes meta with timestamps and hashes', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([{ id: 'row1', normalizedId: 'A-101' }]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.meta).toBeDefined();
      expect(report.meta.comparedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(report.meta.narrativeHash).toBeDefined();
      expect(report.meta.inventoryHash).toBeDefined();
    });

    test('report includes issues array', () => {
      const narrative = createNarrative([{ raw: 'A-999', normalized: 'A-999' }]);
      const inventory = createInventory([{ id: 'row1', normalizedId: 'A-101' }]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(Array.isArray(report.issues)).toBe(true);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Near match scoring', () => {
    test('respects nearMatchThreshold option', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-102' }, // Similar but might not meet high threshold
      ]);

      // High threshold - should not match
      const reportHigh = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.95,
      });
      const nearMatchHigh = reportHigh.issues.find(i => i.code === 'NARR_SHEET_NEAR_MATCH');
      expect(nearMatchHigh).toBeUndefined();

      // Lower threshold - should match
      const reportLow = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.5,
      });
      const nearMatchLow = reportLow.issues.find(i => i.code === 'NARR_SHEET_NEAR_MATCH');
      expect(nearMatchLow).toBeDefined();
    });

    test('respects maxNearMatches option', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-102' },
        { id: 'row2', normalizedId: 'A-103' },
        { id: 'row3', normalizedId: 'A-104' },
        { id: 'row4', normalizedId: 'A-105' },
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        maxNearMatches: 2,
        nearMatchThreshold: 0.5,
      });

      const nearMatchIssue = report.issues.find(i => i.code === 'NARR_SHEET_NEAR_MATCH');
      expect(nearMatchIssue).toBeDefined();
      expect(nearMatchIssue!.nearMatches!.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Suggested corrections', () => {
    test('NEAR_MATCH with single candidate produces exactly one suggested correction', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-102' }, // Single near match
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.5,
      });

      expect(report.suggestedCorrections).toBeDefined();
      expect(report.suggestedCorrections!.length).toBe(1);
      
      const suggestion = report.suggestedCorrections![0];
      expect(suggestion.type).toBe('sheet');
      expect(suggestion.narrativeIdNormalized).toBe('A-101');
      expect(suggestion.suggestedRowId).toBe('row1');
      expect(suggestion.reason).toContain('id_similarity');
      expect(suggestion.explanation).toBeDefined();
      expect(suggestion.explanation).toContain('A-101');
      expect(suggestion.explanation).toContain('A-102');
    });

    test('NEAR_MATCH with multiple candidates produces zero suggestions', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-102' }, // Multiple near matches
        { id: 'row2', normalizedId: 'A-103' },
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.5,
      });

      // Should have NEAR_MATCH issue but NO suggestions (too risky)
      const nearMatchIssue = report.issues.find(i => i.code === 'NARR_SHEET_NEAR_MATCH');
      expect(nearMatchIssue).toBeDefined();
      expect(report.suggestedCorrections).toBeUndefined();
    });

    test('NOT_FOUND produces zero suggestions', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'Z-999' }, // Very different, no match
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues.find(i => i.code === 'NARR_SHEET_NOT_FOUND')).toBeDefined();
      expect(report.suggestedCorrections).toBeUndefined();
    });

    test('INVENTORY_NOT_MENTIONED produces zero suggestions', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-101', status: 'ok' }, // Mentioned, no issue
        { id: 'row2', normalizedId: 'A-102', status: 'warning' }, // Changed but not mentioned
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues.find(i => i.code === 'NARR_INVENTORY_NOT_MENTIONED')).toBeDefined();
      expect(report.suggestedCorrections).toBeUndefined();
    });

    test('suggestedCorrections absent when no suggestions exist', () => {
      const narrative = createNarrative([{ raw: 'A-101', normalized: 'A-101' }]);
      const inventory = createInventory([
        { id: 'row1', normalizedId: 'A-101' }, // Exact match, no issues
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      expect(report.issues).toHaveLength(0);
      expect(report.suggestedCorrections).toBeUndefined();
    });

    test('spec NEAR_MATCH with single candidate produces suggestion', () => {
      const narrative = createNarrative([], [{ raw: '23 02 00', normalized: '23 02 00' }]);
      const inventory = createInventory(
        [{ id: 'row1', normalizedId: '23 02 01' }], // Single near match
        'specs'
      );

      const report = validateNarrativeAgainstInventory(narrative, inventory, {
        nearMatchThreshold: 0.5,
      });

      expect(report.suggestedCorrections).toBeDefined();
      expect(report.suggestedCorrections!.length).toBe(1);
      
      const suggestion = report.suggestedCorrections![0];
      expect(suggestion.type).toBe('specSection');
      expect(suggestion.narrativeIdNormalized).toBe('23 02 00');
      expect(suggestion.suggestedRowId).toBe('row1');
    });
  });

  describe('Line-based hard matching logic', () => {
    test('same-line matching: addendum ID + original ID on same line', () => {
      // Narrative: Sheet G1.11 on same line as DG1.1
      const narrative = createNarrative([
        { raw: 'G1.11', normalized: 'G1.11' }
      ]);
      // Modify evidence to have both IDs on same line (simulating "G1.11 replaces DG1.1")
      narrative.drawings[0].evidence.rawLine = '2. SHEET - G1.11 REFLECTED CEILING PLAN (formerly DG1.1)';
      
      // Inventory: DG1.1 exists in original
      const inventory = createInventory([
        { id: 'orig-row', normalizedId: 'DG1.1' }
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      // Should produce a suggestion from two-ID matching
      expect(report.suggestedCorrections).toBeDefined();
      expect(report.suggestedCorrections!.length).toBeGreaterThanOrEqual(1);
      
      const twoIdMatch = report.suggestedCorrections!.find(
        s => s.reason === 'two_id_match'
      );
      expect(twoIdMatch).toBeDefined();
      expect(twoIdMatch!.narrativeIdNormalized).toBe('G1.11');
      expect(twoIdMatch!.suggestedRowId).toBe('orig-row');
    });

    test('notes matching: original ID in notes array (Formerly named)', () => {
      // Narrative: Sheet G1.11 with notes containing the original ID
      const narrative = createNarrative([
        { raw: 'G1.11', normalized: 'G1.11' }
      ]);
      // Add notes containing the original ID
      narrative.drawings[0].notes = ['a. Formerly named DG1.1'];
      narrative.drawings[0].evidence.rawLine = '2. SHEET - G1.11 REFLECTED CEILING PLAN - LEVEL 1 - DEMOLITION';
      
      // Inventory: DG1.1 exists in original
      const inventory = createInventory([
        { id: 'orig-row', normalizedId: 'DG1.1' }
      ]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      // Should produce a suggestion from two-ID matching (rawText has G1.11, notes have DG1.1)
      expect(report.suggestedCorrections).toBeDefined();
      expect(report.suggestedCorrections!.length).toBeGreaterThanOrEqual(1);
      
      const twoIdMatch = report.suggestedCorrections!.find(
        s => s.reason === 'two_id_match'
      );
      expect(twoIdMatch).toBeDefined();
      expect(twoIdMatch!.narrativeIdNormalized).toBe('G1.11');
      expect(twoIdMatch!.suggestedRowId).toBe('orig-row');
    });

    test('no match when unresolved addendum has no next-line context', () => {
      // Narrative: Only one sheet, no original match anywhere
      const narrative = createNarrative([
        { raw: 'A-101-NEW', normalized: 'A-101-NEW' }
      ]);
      narrative.drawings[0].evidence.rawLine = '3. SHEET - A-101-NEW NEW LAYOUT';

      // Inventory: No matching original
      const inventory = createInventory([]);

      const report = validateNarrativeAgainstInventory(narrative, inventory);

      // Should NOT produce a suggestion (no match found)
      expect(report.suggestedCorrections).toBeUndefined();
      
      // Should have a NOT_FOUND issue
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          code: 'NARR_SHEET_NOT_FOUND',
          ref: expect.objectContaining({
            idNormalized: 'A-101-NEW',
          }),
        })
      );
    });
  });
});
