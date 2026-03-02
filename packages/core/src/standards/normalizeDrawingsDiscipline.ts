/**
 * Normalize drawings discipline from sheet ID and title (v3)
 * 
 * Pure function using StandardsRegistry for lookups
 */

import { standardsRegistry } from './registry.js';
import type { DrawingsDisciplineMeta, DisciplineEntry } from './types.js';

// Keywords for disambiguating 'C' prefix (CIVL vs CTRL)
const CONTROLS_KEYWORDS = [
  'CONTROL',
  'DDC',
  'BAS',
  'SEQUENCE',
  'POINT',
  'DIAGRAM',
  'TEMPERATURE CONTROL',
  'CONTROLS',
];

const CIVIL_KEYWORDS = [
  'SITE',
  'GRADING',
  'DRAINAGE',
  'UTILITY',
  'ROAD',
  'PAVING',
  'EROSION',
  'SURVEY',
];

function titleContainsKeywords(title: string | null | undefined, keywords: string[]): boolean {
  if (!title) return false;
  const upperTitle = title.toUpperCase();
  return keywords.some((keyword) => upperTitle.includes(keyword));
}

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
 * Convert DisciplineEntry to DrawingsDisciplineMeta (legacy format)
 */
function disciplineEntryToMeta(
  entry: DisciplineEntry,
  basis: 'UDS' | 'ALIAS' | 'HEURISTIC',
  confidence: number,
  designator?: string | null,
  modifier?: string | null,
  alias?: string | null,
  reason?: string
): DrawingsDisciplineMeta {
  return {
    designator: designator ?? entry.disciplineID,
    disciplineID: entry.disciplineID,
    disciplineEid: entry.disciplineEid,
    discipline: entry.discipline,
    modifier: modifier ?? undefined,
    alias: alias ?? undefined,
    canonical4: entry.disciplineCODE as any, // Map disciplineCODE to legacy canonical4
    displayName: entry.discipline,
    order: entry.order,
    confidence,
    basis,
    reason,
  };
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
      disciplineID: null,
      disciplineEid: null,
      discipline: null,
      canonical4: 'UNKN',
      displayName: 'Unknown',
      order: 999,
      confidence: 0.0,
      basis: 'UNKNOWN',
      reason: 'No normalizedId provided',
    };
  }

  const prefix = extractDrawingsPrefix(normalizedId);
  if (!prefix) {
    return {
      designator: null,
      disciplineID: null,
      disciplineEid: null,
      discipline: null,
      canonical4: 'UNKN',
      displayName: 'Unknown',
      order: 999,
      confidence: 0.0,
      basis: 'UNKNOWN',
      reason: 'Could not extract prefix from normalizedId',
    };
  }

  // Check for alias FIRST (before any other logic)
  // This handles both multi-letter (FP, DDC, ATC) and two-letter aliases (FA)
  const aliasEntry = standardsRegistry.getDisciplineByAlias(prefix);
  if (aliasEntry) {
    const aliases = standardsRegistry.getDisciplineAliases();
    const matchingAlias = aliases.find(a => a.alias === prefix);
    
    // Create meta with alias displayName, not discipline displayName
    return {
      designator: matchingAlias?.resolvesToDisciplineID ?? null,
      disciplineID: aliasEntry.disciplineID,
      disciplineEid: aliasEntry.disciplineEid,
      discipline: aliasEntry.discipline,
      alias: prefix,
      canonical4: aliasEntry.disciplineCODE as any,
      displayName: matchingAlias?.displayName ?? aliasEntry.discipline,
      order: aliasEntry.order,
      confidence: matchingAlias?.confidence ?? 0.9,
      basis: 'ALIAS',
    };
  }

  // Check for single-letter UDS designator
  if (prefix.length === 1) {
    const disciplineEntry = standardsRegistry.getDisciplineByID(prefix);
    if (disciplineEntry) {
      // Special handling for 'C' (ambiguous: CIVL vs Controls)
      if (prefix === 'C') {
        if (titleContainsKeywords(title, CONTROLS_KEYWORDS)) {
          const mtecEntry = standardsRegistry.getDisciplineByCode('MTEC');
          if (mtecEntry) {
            return disciplineEntryToMeta(
              mtecEntry,
              'HEURISTIC',
              0.85,
              'C',
              undefined,
              undefined,
              'C prefix with controls keywords in title'
            );
          }
        } else if (titleContainsKeywords(title, CIVIL_KEYWORDS)) {
          const civlEntry = standardsRegistry.getDisciplineByCode('CIVL');
          if (civlEntry) {
            return disciplineEntryToMeta(
              civlEntry,
              'HEURISTIC',
              0.85,
              'C',
              undefined,
              undefined,
              'C prefix with civil keywords in title'
            );
          }
        } else {
          // Default to CIVL with medium confidence
          const civlEntry = standardsRegistry.getDisciplineByCode('CIVL');
          if (civlEntry) {
            return disciplineEntryToMeta(
              civlEntry,
              'HEURISTIC',
              0.70,
              'C',
              undefined,
              undefined,
              'C prefix without disambiguating keywords, defaulting to Civil'
            );
          }
        }
      }

      // Standard UDS single-letter match
      return disciplineEntryToMeta(disciplineEntry, 'UDS', 0.95, prefix);
    }
  }

  // Check for two-letter prefix - treat as base discipline + modifier
  // (NOT EID lookup, as most sheets use modifier notation, not extended IDs)
  if (prefix.length === 2) {
    const firstLetter = prefix[0];
    const secondLetter = prefix[1];
    const disciplineEntry = standardsRegistry.getDisciplineByID(firstLetter);
    if (disciplineEntry) {
      return disciplineEntryToMeta(
        disciplineEntry,
        'UDS',
        0.90,
        firstLetter,
        secondLetter
      );
    }
  }

  // Unknown prefix
  return {
    designator: null,
    disciplineID: null,
    disciplineEid: null,
    discipline: null,
    alias: prefix,
    canonical4: 'UNKN',
    displayName: 'Unknown',
    order: 999,
    confidence: 0.0,
    basis: 'UNKNOWN',
    reason: `Unknown prefix: ${prefix}`,
  };
}
