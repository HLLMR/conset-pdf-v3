/**
 * Narrative validation against inventory
 * 
 * Deterministic validation of narrative instructions against detected inventory.
 * Produces issues only - never modifies inventory or corrections.
 */

import type {
  NarrativeInstructionSet,
  NarrativeValidationReport,
  NarrativeIssue,
  CorrectionPatch,
} from './types.js';
import type { InventoryResult, InventoryRowBase } from '../workflows/types.js';
import { normalizeSheetId, normalizeSpecSectionId } from './normalize.js';

/**
 * Options for validation
 */
export interface ValidateNarrativeOptions {
  /** Maximum number of near matches to include per issue (default: 3) */
  maxNearMatches?: number;
  /** Similarity threshold for near matches (0..1, default: 0.75) */
  nearMatchThreshold?: number;
}

/**
 * Candidate match for near-match detection
 */
interface CandidateMatch {
  row: InventoryRowBase & { sheetIdNormalized?: string; sectionIdNormalized?: string; title?: string };
  score: number;
}

interface InventoryPartition {
  originalRows: InventoryRowWithContextIds[];
  addendumRows: InventoryRowWithContextIds[];
}

type InventoryRowWithContextIds = InventoryRowBase & {
  sheetIdNormalized?: string;
  sectionIdNormalized?: string;
  title?: string;
};

function getRowContextId(
  row: InventoryRowWithContextIds,
  docType?: 'drawings' | 'specs'
): string | undefined {
  if (docType === 'specs') return row.sectionIdNormalized;
  if (docType === 'drawings') return row.sheetIdNormalized;
  return row.sheetIdNormalized || row.sectionIdNormalized;
}

function partitionInventoryRowsByDocumentSequence(
  inventory: InventoryResult
): InventoryPartition {
  const originalRows: InventoryRowWithContextIds[] = [];
  const addendumRows: InventoryRowWithContextIds[] = [];

  let currentDocIndex = 0;
  let lastPageIndex = -1;

  for (const row of inventory.rows) {
    const rowWithId = row as InventoryRowWithContextIds;
    const pageIndex = Math.max(0, (row.page ?? 1) - 1);

    if (pageIndex < lastPageIndex) {
      currentDocIndex += 1;
    }
    lastPageIndex = pageIndex;

    if (currentDocIndex === 0) {
      originalRows.push(rowWithId);
    } else {
      addendumRows.push(rowWithId);
    }
  }

  if (addendumRows.length === 0) {
    return {
      originalRows,
      addendumRows: [...originalRows],
    };
  }

  return { originalRows, addendumRows };
}

/**
 * Compute normalized Levenshtein similarity (0..1)
 * Higher score = more similar
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1.0 - distance / maxLen;
}

/**
 * Build a correction patch for a row
 * 
 * Helper function to create a CorrectionPatch that suggests mapping
 * a narrative ID to an inventory row.
 * 
 * @internal - Used internally by validation logic
 */
export function buildCorrectionPatchForRow(
  type: 'sheet' | 'specSection',
  narrativeIdNormalized: string,
  narrativeIdRaw: string,
  rowId: string,
  rowNormalizedId: string,
  score: number,
  reason: string
): CorrectionPatch {
  return {
    type,
    narrativeIdNormalized,
    suggestedRowId: rowId,
    reason: `${reason} ${score.toFixed(2)}`,
    explanation: `Narrative references "${narrativeIdRaw}" (normalized: "${narrativeIdNormalized}"); detected "${rowNormalizedId}" (similarity ${score.toFixed(2)})`,
  };
}

/**
 * Find near matches for a normalized ID
 */
function findNearMatches(
  targetNormalizedId: string,
  candidates: InventoryRowWithContextIds[],
  threshold: number,
  maxResults: number,
  docType?: 'drawings' | 'specs'
): CandidateMatch[] {
  const matches: CandidateMatch[] = [];

  for (const candidate of candidates) {
    const candidateId = getRowContextId(candidate, docType);
    if (!candidateId) continue;

    const score = levenshteinSimilarity(targetNormalizedId, candidateId);
    if (score >= threshold) {
      matches.push({ row: candidate, score });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Return top N
  return matches.slice(0, maxResults);
}

/**
 * Create a hash string for change detection
 */
function createHash(obj: unknown): string {
  // Simple hash for change detection (not cryptographic)
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Extract all ID-like patterns from text
 * Matches patterns like: A-101, A101, DG1.1, G1.11, 230200, 23 02 00
 */
function extractIdsFromText(text: string): string[] {
  // Match sequences that look like sheet or spec IDs
  // More explicit patterns to handle variations:
  // - Letter(s) + numbers + optional (separator + numbers + optional letter)
  // - Examples: G1, G1.11, FA2.21A, DG1.1, E0.01, M3.02
  
  // Pattern 1: Sheet IDs with potential sub-numbers (e.g., G1.11, E2.21A, DG1.1)
  const sheetPattern = /[A-Z]{1,4}\d{1,2}(?:[\.\-]\d{1,2}[A-Z]?)?/gi;
  
  // Pattern 2: Spec section IDs like "00 01 10" or "23 82 23"
  const specPattern = /\d{2}\s\d{2}\s\d{2}/g;
  
  const normalized: string[] = [];
  
  // Try sheet ID pattern first
  let match;
  while ((match = sheetPattern.exec(text)) !== null) {
    const candidate = match[0];
    const asSheet = normalizeSheetId(candidate);
    if (asSheet) {
      normalized.push(asSheet);
    }
  }
  
  // Then try spec section pattern
  while ((match = specPattern.exec(text)) !== null) {
    const asSpec = normalizeSpecSectionId(match[0]);
    if (asSpec) {
      normalized.push(asSpec);
    }
  }
  
  return [...new Set(normalized)]; // Deduplicate
}

/**
 * Apply line-based set-membership matching
 * 
 * Hard logic for each line: Extract all IDs and classify against inventories:
 * - ONE ID: Single match (in one, not other) → pending for context
 * - ONE ID: Double match (in both) → Replace
 * - TWO IDs: One addendum + one original → Rename (addendum replaces original)
 * 
 * Returns high-confidence suggestions without fuzzy matching.
 */
function applyLineBasedMatching(
  narrative: NarrativeInstructionSet,
  inventory: InventoryResult
): CorrectionPatch[] {
  const suggestions: CorrectionPatch[] = [];

  // Build sets for quick lookup
  const { originalRows, addendumRows } = partitionInventoryRowsByDocumentSequence(inventory);
  const addendumIds = new Set<string>();
  const originalIds = new Set<string>();
  const originalIdMap = new Map<string, InventoryRowWithContextIds[]>();
  const addendumIdMap = new Map<string, InventoryRowWithContextIds[]>();
  const inventoryDocType = inventory.meta?.docType as 'drawings' | 'specs' | undefined;

  // Collect original IDs from original rows
  for (const row of originalRows) {
    const contextId = getRowContextId(row as InventoryRowWithContextIds, inventoryDocType);
    if (contextId) {
      originalIds.add(contextId);
      const existing = originalIdMap.get(contextId) || [];
      existing.push(row as InventoryRowWithContextIds);
      originalIdMap.set(contextId, existing);
    }
  }

  // Collect addendum IDs from addendum rows
  for (const row of addendumRows) {
    const contextId = getRowContextId(row as InventoryRowWithContextIds, inventoryDocType);
    if (contextId) {
      addendumIds.add(contextId);
      const existing = addendumIdMap.get(contextId) || [];
      existing.push(row as InventoryRowWithContextIds);
      addendumIdMap.set(contextId, existing);
    }
  }

  // Build list of all instructions with their metadata, in order
  interface InstructionLine {
    id: string;
    rawText: string;
    type: 'sheet' | 'spec';
    notes?: string[]; // Notes from narrative (e.g., "Formerly named...")
  }

  const instructions: InstructionLine[] = [];

  for (const drawing of narrative.drawings) {
    instructions.push({
      id: drawing.sheetIdNormalized,
      rawText: drawing.evidence.rawLine,
      type: 'sheet',
      notes: drawing.notes,
    });
  }

  for (const spec of narrative.specs) {
    instructions.push({
      id: spec.sectionIdNormalized,
      rawText: spec.evidence.rawBlock,
      type: 'spec',
    });
  }

  let pendingAddendumId: string | undefined;
  let pendingType: 'sheet' | 'spec' | undefined;
  let pendingAddendumRowId: string | undefined;

  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i];
    
    // Extract IDs from both the main text AND any notes
    let extractedIds = extractIdsFromText(instruction.rawText);
    
    // Also extract IDs from notes (e.g., "a. Formerly named DG1.1")
    if (instruction.notes) {
      for (const note of instruction.notes) {
        const noteIds = extractIdsFromText(note);
        extractedIds.push(...noteIds);
      }
    }
    
    // Deduplicate IDs
    extractedIds = [...new Set(extractedIds)];

    // Skip if no IDs found
    if (extractedIds.length === 0) {
      continue;
    }

    // === Case: ONE ID ===
    if (extractedIds.length === 1) {
      const id = extractedIds[0];
      const inAddendum = addendumIds.has(id);
      const inOriginal = originalIds.has(id);

      // Double match: exists in both inventories → Replace (just a revision)
      if (inAddendum && inOriginal) {
        // No suggestion needed - standard revision
        pendingAddendumId = undefined;
        pendingType = undefined;
        pendingAddendumRowId = undefined;
      }
      // Single match in addendum only → pending for next-line context
      else if (inAddendum && !inOriginal) {
        pendingAddendumId = id;
        pendingType = instruction.type;
        pendingAddendumRowId = addendumIdMap.get(id)?.[0]?.id;
      }
      // Single match in original only, with pending addendum → link them
      else if (!inAddendum && inOriginal && pendingAddendumId) {
        const origRow = originalIdMap.get(id)?.[0];
        const suggestedRowId = pendingAddendumRowId || origRow?.id;
        if (suggestedRowId) {
          suggestions.push({
            type: pendingType === 'sheet' ? 'sheet' : 'specSection',
            narrativeIdNormalized: pendingAddendumId,
            suggestedRowId,
            replacesIdNormalized: id,
            replacesRowId: origRow?.id,
            reason: 'context_match',
            explanation: `${pendingType} ID "${pendingAddendumId}" from previous line linked to original ID "${id}"`,
          });
        }
        pendingAddendumId = undefined;
        pendingType = undefined;
        pendingAddendumRowId = undefined;
      }
      // Single match in original only, no pending → just context
      else if (!inAddendum && inOriginal) {
        pendingAddendumId = undefined;
        pendingType = undefined;
        pendingAddendumRowId = undefined;
      }
      // No match in either → skip
      else {
        pendingAddendumId = undefined;
        pendingType = undefined;
        pendingAddendumRowId = undefined;
      }
    }

    // === Case: TWO IDs ===
    else if (extractedIds.length === 2) {
      const [id1, id2] = extractedIds;
      const id1InAddendum = addendumIds.has(id1);
      const id1InOriginal = originalIds.has(id1);
      const id2InAddendum = addendumIds.has(id2);
      const id2InOriginal = originalIds.has(id2);

      // Pattern: one addendum + one original → Rename
      if (
        (id1InAddendum && !id1InOriginal && !id2InAddendum && id2InOriginal) ||
        (!id1InAddendum && id1InOriginal && id2InAddendum && !id2InOriginal)
      ) {
        const addendumId = id1InAddendum ? id1 : id2;
        const originalId = id1InOriginal ? id1 : id2;
        const addendumRow = addendumIdMap.get(addendumId)?.[0];
        const origRow = originalIdMap.get(originalId)?.[0];
        const suggestedRowId = addendumRow?.id || origRow?.id;

        if (suggestedRowId) {
          suggestions.push({
            type: instruction.type === 'sheet' ? 'sheet' : 'specSection',
            narrativeIdNormalized: addendumId,
            suggestedRowId,
            replacesIdNormalized: originalId,
            replacesRowId: origRow?.id,
            reason: 'two_id_match',
            explanation: `Line contains addendum ID "${addendumId}" and original ID "${originalId}" → rename`,
          });
        }
      }

      pendingAddendumId = undefined;
      pendingType = undefined;
      pendingAddendumRowId = undefined;
    }

    // More than two IDs: too ambiguous, skip
    else {
      pendingAddendumId = undefined;
      pendingType = undefined;
      pendingAddendumRowId = undefined;
    }
  }

  return suggestions;
}

/**
 * Validate narrative instructions against inventory
 * 
 * @param narrative - Parsed narrative instruction set
 * @param inventory - Inventory result from merge workflow
 * @param opts - Optional validation options
 * @returns Validation report with issues
 */
export function validateNarrativeAgainstInventory(
  narrative: NarrativeInstructionSet,
  inventory: InventoryResult,
  opts?: ValidateNarrativeOptions
): NarrativeValidationReport {
  const maxNearMatches = opts?.maxNearMatches ?? 3;
  const nearMatchThreshold = opts?.nearMatchThreshold ?? 0.75;
  const issues: NarrativeIssue[] = [];
  const suggestedCorrections: CorrectionPatch[] = [];

  const partitioned = partitionInventoryRowsByDocumentSequence(inventory);

  // Step 1: Apply line-based hard logic matching
  // This uses set-membership logic to find high-confidence matches
  // without fuzzy matching
  const lineBasedSuggestions = applyLineBasedMatching(narrative, inventory);
  suggestedCorrections.push(...lineBasedSuggestions);

  // Track which narrative IDs were already resolved by line-based matching
  const resolvedByLineLogic = new Set<string>();
  for (const suggestion of lineBasedSuggestions) {
    resolvedByLineLogic.add(suggestion.narrativeIdNormalized);
  }

  // Build lookup maps from inventory rows
  // Separate by type: drawings (sheets) vs specs
  const sheetRows: InventoryRowWithContextIds[] = [];
  const specRows: InventoryRowWithContextIds[] = [];
  const exactMatchMap = new Map<string, InventoryRowWithContextIds[]>();

  // Determine docType from meta or infer from rows
  const docType = inventory.meta?.docType as 'drawings' | 'specs' | undefined;

  // Only validate narrative IDs against addendum rows.
  // Narrative lists changed/addendum items; original rows are used for replacement pairing.
  for (const row of partitioned.addendumRows) {
    const rowWithId = row as InventoryRowWithContextIds;
    const normalizedId = getRowContextId(rowWithId, docType);
    if (!normalizedId) continue;

    // Categorize by docType if available, otherwise by presence of discipline/specs fields
    const isSpec = docType === 'specs' || 'specs' in row;
    const isDrawing = docType === 'drawings' || 'discipline' in row;

    if (isSpec) {
      specRows.push(rowWithId);
    } else if (isDrawing) {
      sheetRows.push(rowWithId);
    } else {
      // If unclear, add to both (conservative)
      sheetRows.push(rowWithId);
      specRows.push(rowWithId);
    }

    // Build exact match map
    const existing = exactMatchMap.get(normalizedId) || [];
    existing.push(rowWithId);
    exactMatchMap.set(normalizedId, existing);
  }

  // Step 2: Validate drawing instructions (fall back to fuzzy matching if not resolved)
  for (const drawing of narrative.drawings) {
    const normalizedId = drawing.sheetIdNormalized;

    // Skip if already resolved by line-based logic
    if (resolvedByLineLogic.has(normalizedId)) {
      // Silent success - already have a suggestion
      continue;
    }

    const exactMatches = exactMatchMap.get(normalizedId) || [];

    if (exactMatches.length === 0) {
      // No exact match - try near matches
      const nearMatches = findNearMatches(normalizedId, sheetRows, nearMatchThreshold, maxNearMatches, 'drawings');

      if (nearMatches.length > 0) {
        // Near match found
        issues.push({
          severity: 'warn',
          code: 'NARR_SHEET_NEAR_MATCH',
          message: `Narrative references sheet "${drawing.sheetIdRaw}" (normalized: "${normalizedId}") which was not found exactly, but ${nearMatches.length} similar sheet(s) found in inventory`,
          ref: {
            type: 'sheet',
            idRaw: drawing.sheetIdRaw,
            idNormalized: normalizedId,
          },
          nearMatches: nearMatches.map(m => ({
            rowId: m.row.id,
            normalizedId: m.row.sheetIdNormalized!,
            title: (m.row as any).title,
            score: m.score,
            reason: 'id_similarity',
          })),
        });

        // Generate suggestion if exactly ONE near match (deterministic, low risk)
        if (nearMatches.length === 1) {
          const match = nearMatches[0];
          const patch = buildCorrectionPatchForRow(
            'sheet',
            normalizedId,
            drawing.sheetIdRaw,
            match.row.id,
            match.row.sheetIdNormalized!,
            match.score,
            'id_similarity'
          );
          suggestedCorrections.push(patch);
        }
        // If multiple near matches, do NOT suggest (too risky - requires human decision)
      } else {
        // No match at all
        issues.push({
          severity: 'warn',
          code: 'NARR_SHEET_NOT_FOUND',
          message: `Narrative references sheet "${drawing.sheetIdRaw}" (normalized: "${normalizedId}") which was not found in inventory`,
          ref: {
            type: 'sheet',
            idRaw: drawing.sheetIdRaw,
            idNormalized: normalizedId,
          },
        });
      }
    } else if (exactMatches.length > 1) {
      // Multiple exact matches (ambiguous)
      issues.push({
        severity: 'warn',
        code: 'NARR_SHEET_AMBIGUOUS_MATCH',
        message: `Narrative references sheet "${drawing.sheetIdRaw}" (normalized: "${normalizedId}") which matches ${exactMatches.length} rows in inventory`,
        ref: {
          type: 'sheet',
          idRaw: drawing.sheetIdRaw,
          idNormalized: normalizedId,
        },
        inventoryRowIds: exactMatches.map(r => r.id),
      });
    }
    // If exactly one match, no issue (silent success)
  }

  // Step 3: Validate spec instructions (fall back to fuzzy matching if not resolved)
  for (const spec of narrative.specs) {
    const normalizedId = spec.sectionIdNormalized;

    // Skip if already resolved by line-based logic
    if (resolvedByLineLogic.has(normalizedId)) {
      // Silent success - already have a suggestion
      continue;
    }

    const exactMatches = exactMatchMap.get(normalizedId) || [];

    if (exactMatches.length === 0) {
      // No exact match - try near matches
      const nearMatches = findNearMatches(normalizedId, specRows, nearMatchThreshold, maxNearMatches, 'specs');

      if (nearMatches.length > 0) {
        // Near match found
        issues.push({
          severity: 'warn',
          code: 'NARR_SPEC_NEAR_MATCH',
          message: `Narrative references spec section "${spec.sectionIdRaw}" (normalized: "${normalizedId}") which was not found exactly, but ${nearMatches.length} similar section(s) found in inventory`,
          ref: {
            type: 'specSection',
            idRaw: spec.sectionIdRaw,
            idNormalized: normalizedId,
          },
          nearMatches: nearMatches.map(m => ({
            rowId: m.row.id,
            normalizedId: m.row.sectionIdNormalized!,
            title: (m.row as any).title,
            score: m.score,
            reason: 'id_similarity',
          })),
        });

        // Generate suggestion if exactly ONE near match (deterministic, low risk)
        if (nearMatches.length === 1) {
          const match = nearMatches[0];
          const patch = buildCorrectionPatchForRow(
            'specSection',
            normalizedId,
            spec.sectionIdRaw,
            match.row.id,
            match.row.sectionIdNormalized!,
            match.score,
            'id_similarity'
          );
          suggestedCorrections.push(patch);
        }
        // If multiple near matches, do NOT suggest (too risky - requires human decision)
      } else {
        // No match at all
        issues.push({
          severity: 'warn',
          code: 'NARR_SPEC_NOT_FOUND',
          message: `Narrative references spec section "${spec.sectionIdRaw}" (normalized: "${normalizedId}") which was not found in inventory`,
          ref: {
            type: 'specSection',
            idRaw: spec.sectionIdRaw,
            idNormalized: normalizedId,
          },
        });
      }
    } else if (exactMatches.length > 1) {
      // Multiple exact matches (ambiguous)
      issues.push({
        severity: 'warn',
        code: 'NARR_SPEC_AMBIGUOUS_MATCH',
        message: `Narrative references spec section "${spec.sectionIdRaw}" (normalized: "${normalizedId}") which matches ${exactMatches.length} rows in inventory`,
        ref: {
          type: 'specSection',
          idRaw: spec.sectionIdRaw,
          idNormalized: normalizedId,
        },
        inventoryRowIds: exactMatches.map(r => r.id),
      });
    }
    // If exactly one match, no issue (silent success)
  }

  // Inventory-not-mentioned check (warn-only)
  // Identify changed rows in inventory (conservative: only if clearly flagged)
  // For now, we'll check rows that have status 'warning' or 'error' as a proxy for "changed"
  // In a full implementation, we'd check for explicit change flags from the merge workflow
  const changedRows = inventory.rows.filter(row => {
    // Conservative: only flag rows that are clearly problematic or have specific tags
    return row.status === 'warning' || row.status === 'error' || row.tags?.includes('replaced') || row.tags?.includes('inserted');
  });

  // Build set of all narrative-referenced normalized IDs
  const narrativeReferencedIds = new Set<string>();
  for (const drawing of narrative.drawings) {
    narrativeReferencedIds.add(drawing.sheetIdNormalized);
  }
  for (const spec of narrative.specs) {
    narrativeReferencedIds.add(spec.sectionIdNormalized);
  }

  // Check changed rows that aren't mentioned in narrative
  const unmentionedChangedRows: InventoryRowWithContextIds[] = [];
  for (const row of changedRows) {
    const rowWithId = row as InventoryRowWithContextIds;
    const normalizedId = getRowContextId(rowWithId, docType);
    if (!normalizedId) continue;

    if (!narrativeReferencedIds.has(normalizedId)) {
      unmentionedChangedRows.push(rowWithId);
    }
  }

  // Cap to reasonable number and emit summary
  const maxUnmentioned = 50;
  if (unmentionedChangedRows.length > 0) {
    const rowsToReport = unmentionedChangedRows.slice(0, maxUnmentioned);
    const remaining = unmentionedChangedRows.length - maxUnmentioned;

    issues.push({
      severity: 'warn',
      code: 'NARR_INVENTORY_NOT_MENTIONED',
      message: `${unmentionedChangedRows.length} changed inventory row(s) not referenced in narrative${remaining > 0 ? ` (showing first ${maxUnmentioned}, +${remaining} more)` : ''}`,
      inventoryRowIds: rowsToReport.map(r => r.id),
    });
  }

  // Create validation report
  const narrativeHash = createHash(narrative);
  const inventoryHash = createHash(inventory.rows);

  return {
    issues,
    suggestedCorrections: suggestedCorrections.length > 0 ? suggestedCorrections : undefined,
    meta: {
      comparedAtIso: new Date().toISOString(),
      narrativeHash,
      inventoryHash,
    },
  };
}
