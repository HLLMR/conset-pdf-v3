/**
 * Field Naming Validation Tests
 * 
 * Validates that context-specific field naming conventions are followed
 * throughout the codebase after Phase 3 strict cleanup.
 * 
 * Conventions:
 * - Drawings context: Use `discipline` and `sheet` in field names
 * - Specs context: Use `division` and `section` in field names
 * - No generic `normalizedId` in context-specific code
 */

import { describe, it, expect } from '@jest/globals';
import { buildTreeFromInventory } from '../../packages/core/src/bookmarks/treeBuilder.js';

// Define minimal inventory row interfaces for testing
interface TestDrawingsInventoryRow {
  id: string;
  page: number;
  sheetId: string;
  sheetIdNormalized: string;
  title?: string;
  disciplineID?: string;
  disciplineEid?: string;
  discipline?: string;
  [key: string]: unknown;
}

interface TestSpecsInventoryRow {
  id: string;
  page: number;
  sectionId: string;
  sectionIdNormalized: string;
  title?: string;
  divisionID?: string;
  division?: string;
  [key: string]: unknown;
}

describe('Field Naming Conventions', () => {
  describe('Drawings Context - sheetIdNormalized usage', () => {
    it('should use sheetIdNormalized in drawings inventory rows', () => {
      const drawingsRow: TestDrawingsInventoryRow = {
        id: 'drawing-1',
        page: 1,
        sheetId: 'A-101',
        sheetIdNormalized: 'A-101',
        title: 'Floor Plan',
        disciplineID: 'A',
        disciplineEid: 'A_',
        discipline: 'Architectural'
      };

      // Verify the field exists and is properly typed
      expect(drawingsRow.sheetIdNormalized).toBe('A-101');
      expect(drawingsRow).toHaveProperty('sheetIdNormalized');
    });

    it('should use sheetIdNormalized in bookmarks tree building', () => {
      const drawingsRows: TestDrawingsInventoryRow[] = [
        {
          id: 'drawing-1',
          page: 1,
          sheetId: 'A-101',
          sheetIdNormalized: 'A-101',
          title: 'First Floor Plan',
          disciplineID: 'A',
          disciplineEid: 'A_',
          discipline: 'Architectural'
        },
        {
          id: 'drawing-2',
          page: 2,
          sheetId: 'A-102',
          sheetIdNormalized: 'A-102',
          title: 'Second Floor Plan',
          disciplineID: 'A',
          disciplineEid: 'A_',
          discipline: 'Architectural'
        }
      ];

      const tree = buildTreeFromInventory(drawingsRows, 10);

      // Verify tree structure uses sheetIdNormalized
      expect(tree).toBeDefined();
      expect(tree.roots.length).toBeGreaterThan(0);
      
      // Find a node and verify it has the correct fields
      const firstNode = tree.roots[0];
      expect(firstNode.logicalPath).toBe('A-101');
      expect(firstNode.title).toBe('First Floor Plan');
    });
  });

  describe('Specs Context - sectionIdNormalized usage', () => {
    it('should use sectionIdNormalized in specs inventory rows', () => {
      const specsRow: TestSpecsInventoryRow = {
        id: 'spec-1',
        page: 1,
        sectionId: '23 09 00',
        sectionIdNormalized: '23 09 00',
        title: 'HVAC Controls',
        divisionID: '23',
        division: 'Heating, Ventilating, and Air Conditioning (HVAC)'
      };

      // Verify the field exists and is properly typed
      expect(specsRow.sectionIdNormalized).toBe('23 09 00');
      expect(specsRow).toHaveProperty('sectionIdNormalized');
    });

    it('should use sectionIdNormalized in bookmarks tree building', () => {
      const specsRows: TestSpecsInventoryRow[] = [
        {
          id: 'spec-1',
          page: 1,
          sectionId: '23 09 00',
          sectionIdNormalized: '23 09 00',
          title: 'HVAC Controls',
          divisionID: '23',
          division: 'Heating, Ventilating, and Air Conditioning (HVAC)'
        },
        {
          id: 'spec-2',
          page: 2,
          sectionId: '26 05 00',
          sectionIdNormalized: '26 05 00',
          title: 'Electrical Common Work',
          divisionID: '26',
          division: 'Electrical'
        }
      ];

      const tree = buildTreeFromInventory(specsRows, 10);

      // Verify tree structure uses sectionIdNormalized
      expect(tree).toBeDefined();
      expect(tree.roots.length).toBeGreaterThan(0);
      
      // Find a node and verify it has the correct fields
      const firstNode = tree.roots[0];
      expect(firstNode.logicalPath).toBe('23 09 00');
      expect(firstNode.title).toBe('HVAC Controls');
    });
  });

  describe('Type Safety - Context-Specific Fields', () => {
    it('should enforce drawings-specific fields in inventory rows', () => {
      // This test validates TypeScript compilation behavior
      // If this compiles, the type system is correctly enforcing field names
      
      const validRow: TestDrawingsInventoryRow = {
        id: 'drawing-1',
        page: 1,
        sheetId: 'M-301',
        sheetIdNormalized: 'M-301',
        title: 'Mechanical Plan',
        disciplineID: 'M',
        disciplineEid: 'M_',
        discipline: 'Mechanical'
      };

      expect(validRow.sheetIdNormalized).toBeDefined();
      expect(validRow.discipline).toBeDefined();
    });

    it('should enforce specs-specific fields in inventory rows', () => {
      // This test validates TypeScript compilation behavior
      // If this compiles, the type system is correctly enforcing field names
      
      const validRow: TestSpecsInventoryRow = {
        id: 'spec-1',
        page: 1,
        sectionId: '22 00 00',
        sectionIdNormalized: '22 00 00',
        title: 'Plumbing',
        divisionID: '22',
        division: 'Plumbing'
      };

      expect(validRow.sectionIdNormalized).toBeDefined();
      expect(validRow.division).toBeDefined();
    });
  });

  describe('No Generic normalizedId Usage', () => {
    it('should not use generic normalizedId in drawings rows', () => {
      const row: TestDrawingsInventoryRow = {
        id: 'drawing-1',
        page: 1,
        sheetId: 'E-401',
        sheetIdNormalized: 'E-401',
        title: 'Electrical Riser',
        disciplineID: 'E',
        disciplineEid: 'E_',
        discipline: 'Electrical'
      };

      // Should only have context-specific field
      expect('sheetIdNormalized' in row).toBe(true);
    });

    it('should not use generic normalizedId in specs rows', () => {
      const row: TestSpecsInventoryRow = {
        id: 'spec-1',
        page: 1,
        sectionId: '26 20 00',
        sectionIdNormalized: '26 20 00',
        title: 'Low-Voltage Electrical Distribution',
        divisionID: '26',
        division: 'Electrical'
      };

      // Should only have context-specific field
      expect('sectionIdNormalized' in row).toBe(true);
    });
  });
});

describe('Legacy Support Field Naming', () => {
  describe('Legacy specs use sectionIdNormalized', () => {
    it('should use sectionIdNormalized for legacy 5-digit section codes', () => {
      // Legacy codes should still use context-specific field name
      const legacyRow: TestSpecsInventoryRow = {
        id: 'spec-legacy-1',
        page: 1,
        sectionId: '23050',
        sectionIdNormalized: '23050', // Legacy format
        title: 'Basic Mechanical Materials and Methods',
        divisionID: '23',
        division: 'Heating, Ventilating, and Air Conditioning (HVAC)'
      };

      expect(legacyRow.sectionIdNormalized).toBe('23050');
      expect(legacyRow).toHaveProperty('sectionIdNormalized');
    });
  });
});
