/**
 * Normalize specs MasterFormat from section ID
 * 
 * Pure function - no IO, no side effects
 */

import { MASTERFORMAT_DIVISIONS } from './datasets/masterformatDivisions.js';
import type { SpecsMasterformatMeta } from './types.js';

/**
 * Extract section ID from normalized ID if it matches MasterFormat pattern
 * 
 * Pattern: ^\d{2}\s\d{2}\s\d{2}$
 * 
 * @param normalizedId - Normalized section ID
 * @returns Section ID in format "DD SS SS" or null
 */
export function extractSpecSectionId(normalizedId: string | null | undefined): string | null {
  if (!normalizedId) return null;

  const trimmed = normalizedId.trim();
  
  // Match MasterFormat pattern: DD SS SS (two digits, space, two digits, space, two digits)
  if (/^\d{2}\s\d{2}\s\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Normalize specs MasterFormat from section ID
 * 
 * @param input - Object with normalizedId
 * @returns SpecsMasterformatMeta with classification results
 */
export function normalizeSpecsMasterformat(input: {
  normalizedId?: string | null;
}): SpecsMasterformatMeta {
  const { normalizedId } = input;

  const sectionId = extractSpecSectionId(normalizedId);

  // If no sectionId, return UNKNOWN meta
  if (!sectionId) {
    return {
      sectionId: null,
      division: null,
      divisionTitle: null,
      order: 999,
      confidence: 0.2,
      basis: 'UNKNOWN',
      reason: 'no-spec-section-id',
    };
  }

  // Extract division (first 2 characters)
  const division = sectionId.substring(0, 2);

  // Lookup division title from dataset
  const divisionMeta = MASTERFORMAT_DIVISIONS[division];

  // Calculate order: parseInt(division, 10) if numeric else 999
  const order = /^\d{2}$/.test(division) ? parseInt(division, 10) : 999;

  // If division title exists, high confidence
  if (divisionMeta) {
    return {
      sectionId,
      division,
      divisionTitle: divisionMeta.title,
      order,
      confidence: 1.0,
      basis: 'MASTERFORMAT',
    };
  }

  // Division not in dataset, medium confidence
  return {
    sectionId,
    division,
    divisionTitle: null,
    order,
    confidence: 0.7,
    basis: 'MASTERFORMAT',
    reason: 'unknown-division',
  };
}
