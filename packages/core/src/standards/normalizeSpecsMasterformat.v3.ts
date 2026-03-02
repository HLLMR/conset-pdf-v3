/**
 * Normalize specs MasterFormat from section ID (v3)
 * 
 * Pure function using StandardsRegistry for lookups
 * Supports both modern (6-digit) and legacy (5-digit pre-2004) formats
 */

import { standardsRegistry } from './registry.js';
import type { SpecsMasterformatMeta, DivisionEntry, LegacySectionEntry } from './types.js';

/**
 * Extract section ID from normalized ID if it matches MasterFormat pattern
 * 
 * Modern Pattern: ^\d{2}\s\d{2}\s\d{2}$ (e.g., "01 11 00")
 * Legacy Pattern: ^\d{5}$ (e.g., "01530")
 * 
 * @param normalizedId - Normalized section ID
 * @returns Object with sectionId and format, or null
 */
export function extractSpecSectionId(normalizedId: string | null | undefined): {
  sectionId: string;
  format: 'MODERN' | 'LEGACY';
} | null {
  if (!normalizedId) return null;

  const trimmed = normalizedId.trim();
  
  // Check modern format first: DD SS SS (6 digits with spaces)
  if (/^\d{2}\s\d{2}\s\d{2}$/.test(trimmed)) {
    return { sectionId: trimmed, format: 'MODERN' };
  }

  // Check legacy format: DDDDD (5 digits no spaces)
  if (/^\d{5}$/.test(trimmed)) {
    return { sectionId: trimmed, format: 'LEGACY' };
  }

  return null;
}

/**
 * Convert DivisionEntry to SpecsMasterformatMeta
 */
function divisionEntryToMeta(
  entry: DivisionEntry,
  sectionId: string,
  basis: 'MASTERFORMAT' | 'MASTERFORMAT_LEGACY',
  confidence: number = 1.0,
  reason?: string
): SpecsMasterformatMeta {
  return {
    sectionId,
    divisionID: entry.divisionID,
    division: entry.division,
    order: entry.order,
    confidence,
    basis,
    reason,
  };
}

/**
 * Convert LegacySectionEntry to SpecsMasterformatMeta
 */
function legacyEntryToMeta(
  entry: LegacySectionEntry,
  sectionId: string,
  confidence: number = 0.9,
  reason?: string
): SpecsMasterformatMeta {
  // Derive order from modern divisionID (if numeric)
  const order = /^\d{2}$/.test(entry.divisionID) 
    ? parseInt(entry.divisionID, 10) 
    : 999;

  return {
    sectionId,
    divisionID: entry.legacyDivID,
    division: entry.sectionTitle,
    order,
    confidence,
    basis: 'MASTERFORMAT_LEGACY',
    reason,
  };
}

/**
 * Normalize specs MasterFormat from section ID
 * 
 * Supports modern 6-digit format (DD SS SS) and legacy 5-digit format (DDDDD)
 * Auto-migrates legacy codes to modern divisions when possible
 * 
 * @param input - Object with normalizedId
 * @returns SpecsMasterformatMeta with classification results
 */
export function normalizeSpecsMasterformat(input: {
  normalizedId?: string | null;
}): SpecsMasterformatMeta {
  const { normalizedId } = input;

  const extracted = extractSpecSectionId(normalizedId);

  // If no sectionId, return UNKNOWN meta
  if (!extracted) {
    return {
      sectionId: null,
      divisionID: null,
      division: null,
      order: 999,
      confidence: 0.2,
      basis: 'UNKNOWN',
      reason: 'no-spec-section-id',
    };
  }

  const { sectionId, format } = extracted;

  // Handle modern format
  if (format === 'MODERN') {
    // Extract division (first 2 characters)
    const divisionId = sectionId.substring(0, 2);

    // Lookup division from registry
    const divisionEntry = standardsRegistry.getDivisionByID(divisionId);

    if (divisionEntry) {
      return divisionEntryToMeta(divisionEntry, sectionId, 'MASTERFORMAT', 1.0);
    }

    // Division not in dataset, medium confidence
    return {
      sectionId,
      divisionID: divisionId,
      division: null,
      order: parseInt(divisionId, 10),
      confidence: 0.7,
      basis: 'MASTERFORMAT',
      reason: 'unknown-division',
    };
  }

  // Handle legacy format (5-digit pre-2004)
  if (format === 'LEGACY') {
    // Look up legacy entry by 5-digit code
    const legacyEntry = standardsRegistry.findLegacySectionByCode(sectionId);
    
    if (legacyEntry) {
      // Try to resolve to modern division
      const modernDivision = standardsRegistry.getDivisionByID(legacyEntry.divisionID);
      
      if (modernDivision) {
        return divisionEntryToMeta(
          modernDivision,
          sectionId,
          'MASTERFORMAT_LEGACY',
          0.95,
          `Legacy code ${sectionId} (${legacyEntry.sectionTitle}) resolved to modern division ${modernDivision.divisionCODE}`
        );
      }

      // Modern division not found, use legacy entry directly
      return legacyEntryToMeta(
        legacyEntry,
        sectionId,
        0.90,
        'Legacy 5-digit code (pre-2004 format)'
      );
    }

    // Unknown legacy code
    const division = sectionId.substring(0, 2);
    return {
      sectionId,
      divisionID: division,
      division: null,
      order: parseInt(division, 10),
      confidence: 0.6,
      basis: 'MASTERFORMAT_LEGACY',
      reason: 'unknown-legacy-code',
    };
  }

  // Should never reach here
  return {
    sectionId: null,
    divisionID: null,
    division: null,
    order: 999,
    confidence: 0.0,
    basis: 'UNKNOWN',
    reason: 'unexpected-format',
  };
}
