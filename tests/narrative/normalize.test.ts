/**
 * Tests for normalization helpers
 */

import { normalizeSheetId, normalizeSpecSectionId } from '@conset-pdf/core';

describe('Normalization Helpers', () => {
  describe('normalizeSheetId', () => {
    test('uppercases letters', () => {
      expect(normalizeSheetId('g0.01')).toBe('G0.01');
      expect(normalizeSheetId('M6-03')).toBe('M6-03');
    });
    
    test('preserves dots', () => {
      expect(normalizeSheetId('G0.01')).toBe('G0.01');
      expect(normalizeSheetId('M6.03')).toBe('M6.03');
    });
    
    test('collapses whitespace', () => {
      expect(normalizeSheetId('G 0.01')).toBe('G0.01');
      expect(normalizeSheetId('M 6 - 03')).toBe('M6-03');
    });
    
    test('normalizes spacing around separators', () => {
      expect(normalizeSheetId('G 0.01')).toBe('G0.01');
      expect(normalizeSheetId('M 6 - 03')).toBe('M6-03');
      expect(normalizeSheetId('E7.02')).toBe('E7.02');
    });
    
    test('handles various formats', () => {
      expect(normalizeSheetId('G0.01')).toBe('G0.01');
      expect(normalizeSheetId('M6-03')).toBe('M6-03');
      expect(normalizeSheetId('E7.02')).toBe('E7.02');
      expect(normalizeSheetId('G1.11')).toBe('G1.11');
    });
  });
  
  describe('normalizeSpecSectionId', () => {
    test('formats "230200" as "23 02 00"', () => {
      expect(normalizeSpecSectionId('230200')).toBe('23 02 00');
    });
    
    test('formats "23 02 00" as "23 02 00"', () => {
      expect(normalizeSpecSectionId('23 02 00')).toBe('23 02 00');
    });
    
    test('handles various separators', () => {
      expect(normalizeSpecSectionId('23-02-00')).toBe('23 02 00');
      expect(normalizeSpecSectionId('23.02.00')).toBe('23 02 00');
      expect(normalizeSpecSectionId('23  02  00')).toBe('23 02 00');
    });
    
    test('returns empty string for invalid input', () => {
      expect(normalizeSpecSectionId('23')).toBe('');
      expect(normalizeSpecSectionId('23020')).toBe('');
      expect(normalizeSpecSectionId('2302001')).toBe('');
      expect(normalizeSpecSectionId('abc')).toBe('');
    });
    
    test('handles SECTION prefix', () => {
      expect(normalizeSpecSectionId('SECTION 23 02 00')).toBe('23 02 00');
      expect(normalizeSpecSectionId('SECTION 230200')).toBe('23 02 00');
    });
  });
});
