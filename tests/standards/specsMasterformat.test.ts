/**
 * Tests for specs MasterFormat normalization
 */

import {
  extractSpecSectionId,
  normalizeSpecsMasterformat,
} from '@conset-pdf/core';

describe('Specs MasterFormat Normalization', () => {
  describe('extractSpecSectionId', () => {
    test('extracts valid MasterFormat section ID', () => {
      expect(extractSpecSectionId('23 09 00')).toBe('23 09 00');
      expect(extractSpecSectionId('01 10 00')).toBe('01 10 00');
      expect(extractSpecSectionId('25 10 00')).toBe('25 10 00');
    });

    test('handles whitespace trimming', () => {
      expect(extractSpecSectionId('  23 09 00  ')).toBe('23 09 00');
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
  });

  describe('normalizeSpecsMasterformat', () => {
    test('normalizedId = "23 09 00" => division "23", title present, order 23, confidence 1', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '23 09 00' });
      expect(result.sectionId).toBe('23 09 00');
      expect(result.division).toBe('23');
      expect(result.divisionTitle).toBe(
        'Heating, Ventilating, and Air Conditioning (HVAC)'
      );
      expect(result.order).toBe(23);
      expect(result.confidence).toBe(1.0);
      expect(result.basis).toBe('MASTERFORMAT');
      expect(result.reason).toBeUndefined();
    });

    test('normalizedId = "25 10 00" => division "25", title present, order 25', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '25 10 00' });
      expect(result.sectionId).toBe('25 10 00');
      expect(result.division).toBe('25');
      expect(result.divisionTitle).toBe('Integrated Automation');
      expect(result.order).toBe(25);
      expect(result.confidence).toBe(1.0);
      expect(result.basis).toBe('MASTERFORMAT');
    });

    test('normalizedId = "99 01 23" => division "99", title null, order 99, confidence 0.7, reason unknown-division', () => {
      const result = normalizeSpecsMasterformat({ normalizedId: '99 01 23' });
      expect(result.sectionId).toBe('99 01 23');
      expect(result.division).toBe('99');
      expect(result.divisionTitle).toBeNull();
      expect(result.order).toBe(99);
      expect(result.confidence).toBe(0.7);
      expect(result.basis).toBe('MASTERFORMAT');
      expect(result.reason).toBe('unknown-division');
    });

    test('normalizedId missing/invalid => UNKNOWN meta, order 999', () => {
      const result1 = normalizeSpecsMasterformat({});
      expect(result1.sectionId).toBeNull();
      expect(result1.division).toBeNull();
      expect(result1.divisionTitle).toBeNull();
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
        expect(result.division).toBe(div);
        expect(result.divisionTitle).not.toBeNull();
        expect(result.confidence).toBe(1.0);
        expect(result.basis).toBe('MASTERFORMAT');
        expect(result.order).toBe(parseInt(div, 10));
      }
    });
  });
});
