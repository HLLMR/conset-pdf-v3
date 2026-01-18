/**
 * Tests for drawings row comparison
 */

import { compareDrawingsRows } from '@conset-pdf/core';
import type { DrawingsDisciplineMeta } from '@conset-pdf/core';

describe('Drawings Row Comparison', () => {
  const createRow = (
    discipline: DrawingsDisciplineMeta | null,
    normalizedId: string,
    source?: string,
    page?: number,
    id?: string
  ) => ({
    discipline,
    normalizedId,
    source: source ?? 'test',
    page: page ?? 1,
    id: id ?? `id-${normalizedId}`,
  });

  test('sorts by discipline order (primary)', () => {
    const genr = createRow(
      { canonical4: 'GENR', order: 10, designator: 'G', displayName: 'General', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'G-001'
    );
    const arch = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-001'
    );
    const mech = createRow(
      { canonical4: 'MECH', order: 70, designator: 'M', displayName: 'Mechanical', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'M-001'
    );

    const rows = [mech, genr, arch];
    rows.sort(compareDrawingsRows);

    expect(rows[0].discipline?.canonical4).toBe('GENR');
    expect(rows[1].discipline?.canonical4).toBe('ARCH');
    expect(rows[2].discipline?.canonical4).toBe('MECH');
  });

  test('sorts by normalizedId (secondary) when discipline order is same', () => {
    const a1 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-101'
    );
    const a2 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-102'
    );
    const a10 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-110'
    );

    const rows = [a10, a2, a1];
    rows.sort(compareDrawingsRows);

    expect(rows[0].normalizedId).toBe('A-101');
    expect(rows[1].normalizedId).toBe('A-102');
    expect(rows[2].normalizedId).toBe('A-110');
  });

  test('natural sort handles numeric segments correctly', () => {
    const m1 = createRow(
      { canonical4: 'MECH', order: 70, designator: 'M', displayName: 'Mechanical', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'M1-01'
    );
    const m2 = createRow(
      { canonical4: 'MECH', order: 70, designator: 'M', displayName: 'Mechanical', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'M2-01'
    );
    const m10 = createRow(
      { canonical4: 'MECH', order: 70, designator: 'M', displayName: 'Mechanical', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'M10-01'
    );

    const rows = [m10, m2, m1];
    rows.sort(compareDrawingsRows);

    expect(rows[0].normalizedId).toBe('M1-01');
    expect(rows[1].normalizedId).toBe('M2-01');
    expect(rows[2].normalizedId).toBe('M10-01');
  });

  test('sorts by source (tertiary) when order and ID are same', () => {
    const row1 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-101',
      'source-a'
    );
    const row2 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-101',
      'source-b'
    );

    const rows = [row2, row1];
    rows.sort(compareDrawingsRows);

    expect(rows[0].source).toBe('source-a');
    expect(rows[1].source).toBe('source-b');
  });

  test('sorts by page (tertiary) when order, ID, and source are same', () => {
    const row1 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-101',
      'source-a',
      1
    );
    const row2 = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-101',
      'source-a',
      2
    );

    const rows = [row2, row1];
    rows.sort(compareDrawingsRows);

    expect(rows[0].page).toBe(1);
    expect(rows[1].page).toBe(2);
  });

  test('rows without discipline sort last (order 999)', () => {
    const withDiscipline = createRow(
      { canonical4: 'ARCH', order: 50, designator: 'A', displayName: 'Architectural', confidence: 0.95, basis: 'UDS' } as DrawingsDisciplineMeta,
      'A-001'
    );
    const withoutDiscipline = createRow(null, 'X-001');

    const rows = [withoutDiscipline, withDiscipline];
    rows.sort(compareDrawingsRows);

    expect(rows[0].discipline?.canonical4).toBe('ARCH');
    expect(rows[1].discipline).toBeNull();
  });

  test('full heuristic ordering: GENR, SURV, CIVL, LAND, ARCH, STRU, MECH, PLUM, FIRE, ELEC, TECH, CTRL, UNKN', () => {
    const disciplines: Array<{ canonical4: string; order: number }> = [
      { canonical4: 'GENR', order: 10 },
      { canonical4: 'SURV', order: 20 },
      { canonical4: 'CIVL', order: 30 },
      { canonical4: 'LAND', order: 40 },
      { canonical4: 'ARCH', order: 50 },
      { canonical4: 'STRU', order: 60 },
      { canonical4: 'MECH', order: 70 },
      { canonical4: 'PLUM', order: 80 },
      { canonical4: 'FIRE', order: 90 },
      { canonical4: 'ELEC', order: 100 },
      { canonical4: 'TECH', order: 110 },
      { canonical4: 'CTRL', order: 120 },
      { canonical4: 'UNKN', order: 999 },
    ];

    const rows = disciplines.map((d, i) =>
      createRow(
        {
          canonical4: d.canonical4 as any,
          order: d.order,
          designator: 'X',
          displayName: 'Test',
          confidence: 0.95,
          basis: 'UDS',
        } as DrawingsDisciplineMeta,
        `${d.canonical4}-${i}`
      )
    );

    // Shuffle
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    shuffled.sort(compareDrawingsRows);

    // Verify order
    for (let i = 0; i < shuffled.length; i++) {
      expect(shuffled[i].discipline?.canonical4).toBe(disciplines[i].canonical4);
    }
  });
});
