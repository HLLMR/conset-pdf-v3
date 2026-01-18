/**
 * Standards module types for drawings discipline identification and specs MasterFormat
 */

export type StandardsBasis = 'UDS' | 'ALIAS' | 'HEURISTIC' | 'UNKNOWN';

export type SpecsBasis = 'MASTERFORMAT' | 'UNKNOWN';

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
