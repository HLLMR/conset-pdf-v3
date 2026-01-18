/**
 * Comparison functions for drawings and specs rows
 */

import { naturalCompare } from '../utils/sort.js';
import type { DrawingsDisciplineMeta, SpecsMasterformatMeta } from './types.js';

/**
 * Comparator for drawings rows
 * 
 * Primary: discipline order (lower = earlier)
 * Secondary: natural sort by normalizedId
 * Tertiary: stable tie break by source then page (or row.id)
 */
export function compareDrawingsRows(
  a: {
    discipline?: DrawingsDisciplineMeta | null;
    normalizedId?: string | null;
    source?: string | null;
    page?: number | null;
    id?: string;
  },
  b: {
    discipline?: DrawingsDisciplineMeta | null;
    normalizedId?: string | null;
    source?: string | null;
    page?: number | null;
    id?: string;
  }
): number {
  // Primary: discipline order
  const orderA = a.discipline?.order ?? 999;
  const orderB = b.discipline?.order ?? 999;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  // Secondary: natural sort by normalizedId
  const idA = a.normalizedId ?? '';
  const idB = b.normalizedId ?? '';
  if (idA !== idB) {
    return naturalCompare(idA, idB);
  }

  // Tertiary: stable tie break by source then page
  const sourceA = a.source ?? '';
  const sourceB = b.source ?? '';
  const sourceCmp = sourceA.localeCompare(sourceB);
  if (sourceCmp !== 0) {
    return sourceCmp;
  }

  const pageA = a.page ?? 0;
  const pageB = b.page ?? 0;
  if (pageA !== pageB) {
    return pageA - pageB;
  }

  // Final tie break: row.id
  const finalIdA = a.id ?? '';
  const finalIdB = b.id ?? '';
  return finalIdA.localeCompare(finalIdB);
}

/**
 * Parse section ID into numeric tuple
 * 
 * @param sectionId - Section ID in format "DD SS SS" or null
 * @returns Tuple [division, section, subsection] or null
 */
function parseSectionTuple(sectionId: string | null | undefined): [number, number, number] | null {
  if (!sectionId) return null;

  // Match pattern: DD SS SS
  const match = sectionId.match(/^(\d{2})\s(\d{2})\s(\d{2})$/);
  if (!match) return null;

  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
  ];
}

/**
 * Compare two section tuples element-wise
 * 
 * @param tupleA - First tuple or null (treated as large)
 * @param tupleB - Second tuple or null (treated as large)
 * @returns Comparison result
 */
function compareSectionTuples(
  tupleA: [number, number, number] | null,
  tupleB: [number, number, number] | null
): number {
  // Treat null as large value
  if (tupleA === null && tupleB === null) return 0;
  if (tupleA === null) return 1;
  if (tupleB === null) return -1;

  // Compare element-wise
  for (let i = 0; i < 3; i++) {
    if (tupleA[i] !== tupleB[i]) {
      return tupleA[i] - tupleB[i];
    }
  }

  return 0;
}

/**
 * Comparator for specs rows
 * 
 * Primary: division order (lower = earlier)
 * Secondary: section tuple comparison (division, section, subsection)
 * Tertiary: stable tie break by source, then page, then row.id
 */
export function compareSpecsRows(
  a: {
    specs?: SpecsMasterformatMeta | null;
    source?: string | null;
    page?: number | null;
    id?: string;
  },
  b: {
    specs?: SpecsMasterformatMeta | null;
    source?: string | null;
    page?: number | null;
    id?: string;
  }
): number {
  // Primary: division order
  const orderA = a.specs?.order ?? 999;
  const orderB = b.specs?.order ?? 999;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  // Secondary: compare section tuple numerically
  const tupleA = parseSectionTuple(a.specs?.sectionId ?? null);
  const tupleB = parseSectionTuple(b.specs?.sectionId ?? null);
  const tupleCmp = compareSectionTuples(tupleA, tupleB);
  if (tupleCmp !== 0) {
    return tupleCmp;
  }

  // Tertiary: stable tie break by source then page
  const sourceA = a.source ?? '';
  const sourceB = b.source ?? '';
  const sourceCmp = sourceA.localeCompare(sourceB);
  if (sourceCmp !== 0) {
    return sourceCmp;
  }

  const pageA = a.page ?? 0;
  const pageB = b.page ?? 0;
  if (pageA !== pageB) {
    return pageA - pageB;
  }

  // Final tie break: row.id
  const finalIdA = a.id ?? '';
  const finalIdB = b.id ?? '';
  return finalIdA.localeCompare(finalIdB);
}
