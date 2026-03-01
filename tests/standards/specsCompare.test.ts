/**
 * Tests for specs row comparison
 */

import { describe, test, expect } from '@jest/globals';
import { compareSpecsRows } from '@conset-pdf/core';
import type { SpecsMasterformatMeta } from '@conset-pdf/core';

describe('Specs Row Comparison', () => {
  const createRow = (
    specs: SpecsMasterformatMeta | null,
    id: string,
    source?: string,
    page?: number
  ) => ({
    specs,
    id,
    source: source ?? 'test',
    page: page ?? 1,
  });

  test('sorts by division order (primary): 01 before 23 before 25 before 99', () => {
    const div01 = createRow(
      {
        sectionId: '01 10 00',
        division: '01',
        divisionTitle: 'General Requirements',
        order: 1,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-01'
    );
    const div23 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-23'
    );
    const div25 = createRow(
      {
        sectionId: '25 10 00',
        division: '25',
        divisionTitle: 'Integrated Automation',
        order: 25,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-25'
    );
    const div99 = createRow(
      {
        sectionId: '99 01 23',
        division: '99',
        divisionTitle: null,
        order: 99,
        confidence: 0.7,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-99'
    );

    const rows = [div99, div25, div23, div01];
    rows.sort(compareSpecsRows);

    expect(rows[0].specs?.division).toBe('01');
    expect(rows[1].specs?.division).toBe('23');
    expect(rows[2].specs?.division).toBe('25');
    expect(rows[3].specs?.division).toBe('99');
  });

  test('within same division: 23 05 00 before 23 09 00 before 23 31 00', () => {
    const sec05 = createRow(
      {
        sectionId: '23 05 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-05'
    );
    const sec09 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-09'
    );
    const sec31 = createRow(
      {
        sectionId: '23 31 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-31'
    );

    const rows = [sec31, sec09, sec05];
    rows.sort(compareSpecsRows);

    expect(rows[0].specs?.sectionId).toBe('23 05 00');
    expect(rows[1].specs?.sectionId).toBe('23 09 00');
    expect(rows[2].specs?.sectionId).toBe('23 31 00');
  });

  test('section tuple comparison handles subsection differences', () => {
    const sec0900 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-0900'
    );
    const sec0901 = createRow(
      {
        sectionId: '23 09 01',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-0901'
    );
    const sec1000 = createRow(
      {
        sectionId: '23 10 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-1000'
    );

    const rows = [sec1000, sec0901, sec0900];
    rows.sort(compareSpecsRows);

    expect(rows[0].specs?.sectionId).toBe('23 09 00');
    expect(rows[1].specs?.sectionId).toBe('23 09 01');
    expect(rows[2].specs?.sectionId).toBe('23 10 00');
  });

  test('rows without specs sort last (order 999)', () => {
    const withSpecs = createRow(
      {
        sectionId: '01 10 00',
        division: '01',
        divisionTitle: 'General Requirements',
        order: 1,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-with'
    );
    const withoutSpecs = createRow(null, 'id-without');

    const rows = [withoutSpecs, withSpecs];
    rows.sort(compareSpecsRows);

    expect(rows[0].specs?.division).toBe('01');
    expect(rows[1].specs).toBeNull();
  });

  test('sorts by source (tertiary) when order and section are same', () => {
    const row1 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-1',
      'source-a'
    );
    const row2 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-2',
      'source-b'
    );

    const rows = [row2, row1];
    rows.sort(compareSpecsRows);

    expect(rows[0].source).toBe('source-a');
    expect(rows[1].source).toBe('source-b');
  });

  test('sorts by page (tertiary) when order, section, and source are same', () => {
    const row1 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-1',
      'source-a',
      1
    );
    const row2 = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-2',
      'source-a',
      2
    );

    const rows = [row2, row1];
    rows.sort(compareSpecsRows);

    expect(rows[0].page).toBe(1);
    expect(rows[1].page).toBe(2);
  });

  test('handles missing sectionId in tuple comparison', () => {
    const withSection = createRow(
      {
        sectionId: '23 09 00',
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-with'
    );
    const withoutSection = createRow(
      {
        sectionId: null,
        division: '23',
        divisionTitle: 'HVAC',
        order: 23,
        confidence: 1.0,
        basis: 'MASTERFORMAT',
      } as SpecsMasterformatMeta,
      'id-without'
    );

    const rows = [withoutSection, withSection];
    rows.sort(compareSpecsRows);

    // Row with sectionId should come first (null treated as large)
    expect(rows[0].specs?.sectionId).toBe('23 09 00');
    expect(rows[1].specs?.sectionId).toBeNull();
  });
});
