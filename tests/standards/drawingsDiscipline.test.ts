/**
 * Tests for drawings discipline normalization
 */

import {
  extractDrawingsPrefix,
  normalizeDrawingsDiscipline,
} from '@conset-pdf/core';

describe('Drawings Discipline Normalization', () => {
  describe('extractDrawingsPrefix', () => {
    test('extracts single letter prefix', () => {
      expect(extractDrawingsPrefix('M1-01')).toBe('M');
      expect(extractDrawingsPrefix('A-101')).toBe('A');
      expect(extractDrawingsPrefix('E7.02')).toBe('E');
    });

    test('extracts multi-letter prefix', () => {
      expect(extractDrawingsPrefix('FP-101')).toBe('FP');
      expect(extractDrawingsPrefix('DDC-001')).toBe('DDC');
      expect(extractDrawingsPrefix('ATC-500')).toBe('ATC');
    });

    test('handles uppercase and trimming', () => {
      expect(extractDrawingsPrefix('  m1-01  ')).toBe('M');
      expect(extractDrawingsPrefix('fp-101')).toBe('FP');
    });

    test('returns null for specs format', () => {
      expect(extractDrawingsPrefix('23 02 00')).toBeNull();
      expect(extractDrawingsPrefix('23 09 00')).toBeNull();
    });

    test('returns null for invalid input', () => {
      expect(extractDrawingsPrefix(null)).toBeNull();
      expect(extractDrawingsPrefix(undefined)).toBeNull();
      expect(extractDrawingsPrefix('')).toBeNull();
      expect(extractDrawingsPrefix('123')).toBeNull();
    });
  });

  describe('normalizeDrawingsDiscipline', () => {
    test('A-101 => ARCH, designator A', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'A-101' });
      expect(result.canonical4).toBe('ARCH');
      expect(result.designator).toBe('A');
      expect(result.displayName).toBe('Architectural');
      expect(result.basis).toBe('UDS');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('AD-501 => ARCH, designator A, modifier D', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'AD-501' });
      expect(result.canonical4).toBe('ARCH');
      expect(result.designator).toBe('A');
      expect(result.modifier).toBe('D');
      expect(result.displayName).toBe('Architectural');
      expect(result.basis).toBe('UDS');
    });

    test('M1-01 => MECH', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'M1-01' });
      expect(result.canonical4).toBe('MECH');
      expect(result.designator).toBe('M');
      expect(result.displayName).toBe('Mechanical');
      expect(result.basis).toBe('UDS');
    });

    test('FP-101 => FIRE, basis ALIAS', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'FP-101' });
      expect(result.canonical4).toBe('FIRE');
      expect(result.designator).toBe('F');
      expect(result.alias).toBe('FP');
      expect(result.displayName).toBe('Fire Protection');
      expect(result.basis).toBe('ALIAS');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('C-101 + title "TEMPERATURE CONTROL DIAGRAMS" => CTRL, basis HEURISTIC', () => {
      const result = normalizeDrawingsDiscipline({
        normalizedId: 'C-101',
        title: 'TEMPERATURE CONTROL DIAGRAMS',
      });
      expect(result.canonical4).toBe('CTRL');
      expect(result.designator).toBe('C');
      expect(result.displayName).toBe('Controls');
      expect(result.basis).toBe('HEURISTIC');
      expect(result.reason).toContain('controls keywords');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('C-101 + title "SITE GRADING PLAN" => CIVL, basis HEURISTIC', () => {
      const result = normalizeDrawingsDiscipline({
        normalizedId: 'C-101',
        title: 'SITE GRADING PLAN',
      });
      expect(result.canonical4).toBe('CIVL');
      expect(result.designator).toBe('C');
      expect(result.displayName).toBe('Civil');
      expect(result.basis).toBe('HEURISTIC');
      expect(result.reason).toContain('civil keywords');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('C-101 without title => CIVL, basis HEURISTIC (default)', () => {
      const result = normalizeDrawingsDiscipline({
        normalizedId: 'C-101',
      });
      expect(result.canonical4).toBe('CIVL');
      expect(result.designator).toBe('C');
      expect(result.basis).toBe('HEURISTIC');
      expect(result.reason).toContain('defaulting to Civil');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    test('DDC-001 => CTRL, basis ALIAS', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'DDC-001' });
      expect(result.canonical4).toBe('CTRL');
      expect(result.designator).toBeNull();
      expect(result.alias).toBe('DDC');
      expect(result.displayName).toBe('Direct Digital Controls');
      expect(result.basis).toBe('ALIAS');
    });

    test('SEC-200 => TECH, basis ALIAS', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'SEC-200' });
      expect(result.canonical4).toBe('TECH');
      expect(result.alias).toBe('SEC');
      expect(result.displayName).toBe('Security');
      expect(result.basis).toBe('ALIAS');
    });

    test('no normalizedId => UNKN', () => {
      const result = normalizeDrawingsDiscipline({});
      expect(result.canonical4).toBe('UNKN');
      expect(result.designator).toBeNull();
      expect(result.basis).toBe('UNKNOWN');
      expect(result.reason).toContain('No normalizedId');
    });

    test('unknown prefix => UNKN', () => {
      const result = normalizeDrawingsDiscipline({ normalizedId: 'XYZ-100' });
      expect(result.canonical4).toBe('UNKN');
      expect(result.alias).toBe('XYZ');
      expect(result.basis).toBe('UNKNOWN');
      expect(result.reason).toContain('Unknown prefix');
    });

    test('all UDS designators work', () => {
      const designators = ['G', 'C', 'L', 'A', 'I', 'S', 'M', 'P', 'E', 'F', 'T'];
      for (const d of designators) {
        const result = normalizeDrawingsDiscipline({ normalizedId: `${d}-001` });
        expect(result.designator).toBe(d);
        expect(result.canonical4).not.toBe('UNKN');
        if (d !== 'C') {
          // C is special case with HEURISTIC
          expect(result.basis).toBe('UDS');
        }
      }
    });
  });
});
