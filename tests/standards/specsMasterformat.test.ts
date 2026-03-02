/**
 * Tests for specs MasterFormat normalization
 */

import { describe, test, expect } from '@jest/globals';
import {
  extractSpecSectionId,
  normalizeSpecsMasterformat,
} from '@conset-pdf/core';

describe('Specs MasterFormat Normalization', () => {
  describe('extractSpecSectionId', () => {
    test('extracts valid MasterFormat section ID', () => {
      expect(extractSpecSectionId('23 09 00')).toEqual({ sectionId: '23 09 00', format: 'MODERN' });
      expect(extractSpecSectionId('01 10 00')).toEqual({ sectionId: '01 10 00', format: 'MODERN' });
      expect(extractSpecSectionId('25 10 00')).toEqual({ sectionId: '25 10 00', format: 'MODERN' });
    });

    test('handles whitespace trimming', () => {
      expect(extractSpecSectionId('  23 09 00  ')).toEqual({ sectionId: '23 09 00', format: 'MODERN' });
    });

    test('returns null for invalid formats', () => {
      expect(extractSpecSectionId('23-09-00')).toBeNull();
      expect(extractSpecSectionId('230900')).toBeNull();
      expect(extractSpecSectionId('M1-01')).toBeNull();
      expect(extractSpecSectionId('A-101')).toBeNull();
    });

    test('returns null for missing input', () => {
      expect(extractSpecSectionId(null)).toBeNull();
      expect(extractSpecSectionId(undefined)).toBeNull();
      expect(extractSpecSectionId('')).toBeNull();
    });

    test('extracts legacy pre-2004 5-digit section ID', () => {
      expect(extractSpecSectionId('23050')).toEqual({ sectionId: '23050', format: 'LEGACY' });
      expect(extractSpecSectionId('  15100  ')).toEqual({ sectionId: '15100', format: 'LEGACY' });
    });
  });

  describe('normalizeSpecsMasterformat', () => {
    test('normalizedId = "23 09 00" => divisionID "23", division name present, order 23, confidence 1', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '23 09 00' });
      expect(result.sectionId).toBe('23 09 00');
      expect(result.divisionID).toBe('23');
      expect(result.division).toBe(
        'Heating, Ventilating, and Air Conditioning (HVAC)'
      );
      expect(result.order).toBe(23);
      expect(result.confidence).toBe(1.0);
      expect(result.basis).toBe('MASTERFORMAT');
      expect(result.reason).toBeUndefined();
    });

    test('normalizedId = "25 10 00" => divisionID "25", division name present, order 25', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '25 10 00' });
      expect(result.sectionId).toBe('25 10 00');
      expect(result.divisionID).toBe('25');
      expect(result.division).toBe('Integrated Automation');
      expect(result.order).toBe(25);
      expect(result.confidence).toBe(1.0);
      expect(result.basis).toBe('MASTERFORMAT');
    });

    test('normalizedId = "99 01 23" => divisionID "99", division null, order 99, confidence 0.7, reason unknown-division', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '99 01 23' });
      expect(result.sectionId).toBe('99 01 23');
      expect(result.divisionID).toBe('99');
      expect(result.division).toBeNull();
      expect(result.order).toBe(99);
      expect(result.confidence).toBe(0.7);
      expect(result.basis).toBe('MASTERFORMAT');
      expect(result.reason).toBe('unknown-division');
    });

    test('normalizedId missing/invalid => UNKNOWN meta, order 999', () => {
      const result1 = normalizeSpecsMasterformat({});
      expect(result1.sectionId).toBeNull();
      expect(result1.divisionID).toBeNull();
      expect(result1.division).toBeNull();
      expect(result1.order).toBe(999);
      expect(result1.confidence).toBe(0.2);
      expect(result1.basis).toBe('UNKNOWN');
      expect(result1.reason).toBe('no-spec-section-id');

      const result2 = normalizeSpecsMasterformat({ normalizedId: null });
      expect(result2.sectionId).toBeNull();
      expect(result2.order).toBe(999);
      expect(result2.basis).toBe('UNKNOWN');

      const result3 = normalizeSpecsMasterformat({ normalizedId: 'M1-01' });
      expect(result3.sectionId).toBeNull();
      expect(result3.order).toBe(999);
      expect(result3.basis).toBe('UNKNOWN');
    });

    test('handles all divisions in dataset', () => {
      const divisions = [
        '00',
        '01',
        '02',
        '03',
        '04',
        '05',
        '06',
        '07',
        '08',
        '09',
        '10',
        '11',
        '12',
        '13',
        '14',
        '21',
        '22',
        '23',
        '25',
        '26',
        '27',
        '28',
        '31',
        '32',
        '33',
        '34',
        '35',
        '40',
        '41',
        '42',
        '43',
        '44',
        '45',
        '46',
        '48',
        '49',
      ];

      for (const div of divisions) {
        const sectionId = `${div} 10 00`;
        const result = normalizeSpecsMasterformat({ normalizedId: sectionId });
        expect(result.divisionID).toBe(div);
        expect(result.division).not.toBeNull();
        expect(result.confidence).toBe(1.0);
        expect(result.basis).toBe('MASTERFORMAT');
        expect(result.order).toBeGreaterThanOrEqual(0);
      }
    });

    test('legacy 5-digit section IDs resolve via legacy mapping', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '23050' });
      expect(result.sectionId).toBe('23050');
      expect(result.divisionID).toBeTruthy();
      expect(typeof result.division === 'string' || result.division === null).toBe(true);
      expect(result.order).toBeGreaterThanOrEqual(0);
      expect(result.basis).toBe('MASTERFORMAT_LEGACY');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });
});
