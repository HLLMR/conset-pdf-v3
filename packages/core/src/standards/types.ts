/**
 * Standards module types for drawings discipline identification and specs MasterFormat
 * 
 * CANONICAL FIELD NAMES (from UDS.xlsx):
 * - Drawings: discipline*, sheet*
 * - Specs: division*, section*
 */

// ============================================================================
// NEW CANONICAL TYPES (from UDS.xlsx structure)
// ============================================================================

/**
 * Discipline entry from UDS.xlsx (drawings)
 * Fields match exactly to UDS.xlsx column names
 */
export interface DisciplineEntry {
  /** Single character level 1 code (G, A, M, etc.) */
  disciplineID: string;
  /** Common, spelled-out name (General, Architectural, Mechanical) */
  discipline: string;
  /** Extended 2-character code including level 2 (AD, FA, EP, EL) */
  disciplineEid: string;
  /** 4-character code for readability (GENL, MECH, ARCH, ELEC) */
  disciplineCODE: string;
  /** Fully spelled level 1 & 2 names (Architectural Demolition, etc.) */
  disciplineFull: string;
  /** Common keywords for fuzzy matching/lookup */
  disciplineDesc?: string;
  /** Sort order (preserved from UDS.xlsx row order) */
  order: number;
  /** Whether this is a UDS standard entry */
  udsStandard: boolean;
  /** User-defined alias (optional, for custom mappings) */
  userAlias?: string;
  /** Whether user has overridden this entry */
  userOverride?: boolean;
}

/**
 * Division entry from UDS.xlsx (specs, modern MasterFormat 2018)
 * Fields match exactly to UDS.xlsx column names
 */
export interface DivisionEntry {
  /** 2-character level 1 division code (22, 23, 25, 26) */
  divisionID: string;
  /** 4-character code for file renaming (PLUM, HVAC, CTRL, ELEC) */
  divisionCODE: string;
  /** Fully spelled out division name */
  division: string;
  /** Keywords for fuzzy matching */
  divisionDesc?: string;
  /** MasterFormat version */
  mfVersion: string;
  /** Sort order (numeric from divisionID) */
  order: number;
  /** User-overridden title */
  userTitle?: string;
  /** User-defined alias */
  userAlias?: string;
  /** Whether user has overridden this entry */
  userOverride?: boolean;
}

/**
 * Legacy section entry from UDS.xlsx (pre-2004, 5-digit format)
 * Fields match exactly to UDS.xlsx column names
 */
export interface LegacySectionEntry {
  /** 2-character level 1 division code used pre-2004 */
  legacyDivID: string;
  /** Starting and ending range of 5-digit legacy codes (XXYYY) */
  sectionRange: string;
  /** Standard fully spelled out name */
  sectionTitle: string;
  /** Keywords for fuzzy matching */
  sectionNotes?: string;
  /** Modern division ID this maps to */
  divisionID: string;
  /** Modern division CODE this maps to */
  divisionCODE: string;
  /** Year identifier */
  year: string;
}

/**
 * Discipline alias (multi-letter prefixes like FP, DDC, etc.)
 */
export interface DisciplineAlias {
  /** The alias string (FP, DDC, SEC) */
  alias: string;
  /** What disciplineID it resolves to */
  resolvesToDisciplineID: string | null;
  /** What disciplineCODE it resolves to */
  resolvesToDisciplineCODE: string;
  /** Display name for this alias */
  displayName: string;
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  /** Whether this is user-defined */
  isUserDefined: boolean;
}

/**
 * User customizations structure (stored in GUI userData as JSON)
 */
export interface UserCustomizations {
  version: string;
  disciplines?: {
    overrides?: Partial<DisciplineEntry>[];
    additions?: DisciplineEntry[];
    deletions?: string[]; // disciplineIDs to exclude
  };
  divisions?: {
    overrides?: Partial<DivisionEntry>[];
    additions?: DivisionEntry[];
    deletions?: string[]; // divisionIDs to exclude
  };
  aliases?: {
    disciplines?: DisciplineAlias[];
  };
}

// ============================================================================
// LEGACY TYPES (kept for backward compatibility - will be deprecated)
// ============================================================================

export type StandardsBasis = 'UDS' | 'ALIAS' | 'HEURISTIC' | 'UNKNOWN';

export type SpecsBasis = 'MASTERFORMAT' | 'MASTERFORMAT_LEGACY' | 'UNKNOWN';

export type DisciplineCanonical4 =
  | 'GENR'
  | 'SURV'
  | 'DEMO'
  | 'CIVL'
  | 'LAND'
  | 'ARCH'
  | 'INTR'
  | 'STRU'
  | 'MECH'
  | 'PLUM'
  | 'FIRP'
  | 'FIRA'
  | 'FIRE'
  | 'ELEC'
  | 'TECH'
  | 'CTRL'
  | 'VEND'
  | 'SPEC'
  | 'UNKN';

export interface DrawingsDisciplineMeta {
  /** UDS-style single letter designator, e.g. 'M' */
  designator: string | null;
  /** Optional modifier, e.g. 'D' in 'AD' */
  modifier?: string | null;
  /** Raw observed prefix, e.g. 'FP', 'DDC' */
  alias?: string | null;
  /** Canonical 4-letter discipline code */
  canonical4: DisciplineCanonical4;
  /** Human-readable display name */
  displayName: string;
  /** Sort order (lower = earlier) */
  order: number;
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  /** Basis for this classification */
  basis: StandardsBasis;
  /** Optional reason/explanation */
  reason?: string;
}

export interface SpecsMasterformatMeta {
  /** Full section ID, e.g. "23 09 00" */
  sectionId: string | null;
  /** Division code, e.g. "23" */
  division: string | null;
  /** Division title from dataset if present */
  divisionTitle: string | null;
  /** Sort order (numeric division order, fallback 999) */
  order: number;
  /** Confidence level (0.0 to 1.0) */
  confidence: number;
  /** Basis for this classification */
  basis: SpecsBasis;
  /** Optional reason/explanation */
  reason?: string;
}
