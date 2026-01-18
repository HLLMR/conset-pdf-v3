/**
 * Normalize drawings discipline from sheet ID and title
 * 
 * Pure function - no IO, no side effects
 */

import {
  ALIAS_MAPPINGS,
  CIVIL_KEYWORDS,
  CONTROLS_KEYWORDS,
  titleContainsKeywords,
  UDS_DESIGNATORS,
} from './datasets/drawingsDesignators.js';
import { getDisciplineOrder } from './datasets/drawingsOrderHeuristic.js';
import type { DrawingsDisciplineMeta } from './types.js';

/**
 * Extract leading alpha prefix from normalized sheet ID
 * 
 * Examples:
 * - M1-01 -> M
 * - A-101 -> A
 * - FP-101 -> FP
 * - DDC-001 -> DDC
 * 
 * Returns null if:
 * - No normalizedId provided
 * - Looks like specs format (\d{2}\s\d{2}\s\d{2})
 */
export function extractDrawingsPrefix(normalizedId: string | null | undefined): string | null {
  if (!normalizedId) return null;

  // Check for specs format: \d{2}\s\d{2}\s\d{2}
  if (/^\d{2}\s\d{2}\s\d{2}/.test(normalizedId.trim())) {
    return null;
  }

  // Uppercase and trim
  const upper = normalizedId.trim().toUpperCase();

  // Extract leading alpha chunk up to first digit/dash
  const match = upper.match(/^([A-Z]+)/);
  if (!match) return null;

  return match[1];
}

/**
 * Normalize drawings discipline from sheet ID and optional title
 * 
 * @param input - Object with normalizedId and optional title
 * @returns DrawingsDisciplineMeta with classification results
 */
export function normalizeDrawingsDiscipline(input: {
  normalizedId?: string | null;
  title?: string | null;
}): DrawingsDisciplineMeta {
  const { normalizedId, title } = input;

  // If no normalizedId, return UNKN
  if (!normalizedId) {
    return {
      designator: null,
      canonical4: 'UNKN',
      displayName: 'Unknown',
      order: getDisciplineOrder('UNKN'),
      confidence: 0.0,
      basis: 'UNKNOWN',
      reason: 'No normalizedId provided',
    };
  }

  const prefix = extractDrawingsPrefix(normalizedId);
  if (!prefix) {
    return {
      designator: null,
      canonical4: 'UNKN',
      displayName: 'Unknown',
      order: getDisciplineOrder('UNKN'),
      confidence: 0.0,
      basis: 'UNKNOWN',
      reason: 'Could not extract prefix from normalizedId',
    };
  }

  // Check for multi-letter alias first
  const aliasMatch = ALIAS_MAPPINGS.find((a) => a.alias === prefix);
  if (aliasMatch) {
    return {
      designator: aliasMatch.designator,
      alias: prefix,
      canonical4: aliasMatch.canonical4,
      displayName: aliasMatch.displayName,
      order: getDisciplineOrder(aliasMatch.canonical4),
      confidence: aliasMatch.confidence,
      basis: aliasMatch.basis,
    };
  }

  // Check for single-letter UDS designator
  if (prefix.length === 1) {
    const udsMatch = UDS_DESIGNATORS[prefix];
    if (udsMatch) {
      // Special handling for 'C' (ambiguous: CIVL vs CTRL)
      if (prefix === 'C') {
        if (titleContainsKeywords(title, CONTROLS_KEYWORDS)) {
          return {
            designator: 'C',
            canonical4: 'CTRL',
            displayName: 'Controls',
            order: getDisciplineOrder('CTRL'),
            confidence: 0.85,
            basis: 'HEURISTIC',
            reason: 'C prefix with controls keywords in title',
          };
        } else if (titleContainsKeywords(title, CIVIL_KEYWORDS)) {
          return {
            designator: 'C',
            canonical4: 'CIVL',
            displayName: 'Civil',
            order: getDisciplineOrder('CIVL'),
            confidence: 0.85,
            basis: 'HEURISTIC',
            reason: 'C prefix with civil keywords in title',
          };
        } else {
          // Default to CIVL with medium confidence
          return {
            designator: 'C',
            canonical4: 'CIVL',
            displayName: 'Civil',
            order: getDisciplineOrder('CIVL'),
            confidence: 0.70,
            basis: 'HEURISTIC',
            reason: 'C prefix without disambiguating keywords, defaulting to Civil',
          };
        }
      }

      // Standard UDS single-letter match
      return {
        designator: prefix,
        canonical4: udsMatch.canonical4,
        displayName: udsMatch.displayName,
        order: getDisciplineOrder(udsMatch.canonical4),
        confidence: 0.95,
        basis: 'UDS',
      };
    }
  }

  // Check for two-letter prefix where first letter is UDS (e.g., AD)
  if (prefix.length === 2) {
    const firstLetter = prefix[0];
    const secondLetter = prefix[1];
    const udsMatch = UDS_DESIGNATORS[firstLetter];
    if (udsMatch) {
      // Treat as modifier (e.g., AD = Architectural with modifier D)
      return {
        designator: firstLetter,
        modifier: secondLetter,
        canonical4: udsMatch.canonical4,
        displayName: udsMatch.displayName,
        order: getDisciplineOrder(udsMatch.canonical4),
        confidence: 0.90,
        basis: 'UDS',
      };
    }
  }

  // Unknown prefix
  return {
    designator: null,
    alias: prefix,
    canonical4: 'UNKN',
    displayName: 'Unknown',
    order: getDisciplineOrder('UNKN'),
    confidence: 0.0,
    basis: 'UNKNOWN',
    reason: `Unknown prefix: ${prefix}`,
  };
}
