/**
 * Dataset for drawings discipline designators
 * 
 * Models UDS-style one-letter designators as first-class, with multi-letter aliases
 * and keyword hints for ambiguous cases.
 */

import type { DisciplineCanonical4, StandardsBasis } from '../types.js';

/**
 * UDS-style single letter designators and their canonical mappings
 */
export const UDS_DESIGNATORS: Record<
  string,
  {
    canonical4: DisciplineCanonical4;
    displayName: string;
  }
> = {
  G: { canonical4: 'GENR', displayName: 'General' },
  C: { canonical4: 'CIVL', displayName: 'Civil' }, // Ambiguous - may be CTRL
  D: { canonical4: 'DEMO', displayName: 'Demolition' },
  L: { canonical4: 'LAND', displayName: 'Landscape' },
  A: { canonical4: 'ARCH', displayName: 'Architectural' },
  I: { canonical4: 'INTR', displayName: 'Interiors' },
  S: { canonical4: 'STRU', displayName: 'Structural' },
  M: { canonical4: 'MECH', displayName: 'Mechanical' },
  P: { canonical4: 'PLUM', displayName: 'Plumbing' },
  E: { canonical4: 'ELEC', displayName: 'Electrical' },
  F: { canonical4: 'FIRP', displayName: 'Fire Protection' },
  T: { canonical4: 'TECH', displayName: 'Technology' },
};

/**
 * Multi-letter aliases and their canonical mappings
 */
export const ALIAS_MAPPINGS: Array<{
  alias: string;
  canonical4: DisciplineCanonical4;
  displayName: string;
  designator: string | null; // UDS designator if applicable (e.g., FP -> F)
  confidence: number;
  basis: StandardsBasis;
}> = [
  // Fire Protection aliases
  { alias: 'FP', canonical4: 'FIRP', displayName: 'Fire Protection', designator: 'F', confidence: 0.95, basis: 'ALIAS' },
  { alias: 'FA', canonical4: 'FIRA', displayName: 'Fire Alarm', designator: 'F', confidence: 0.95, basis: 'ALIAS' },
  
  // Controls aliases
  { alias: 'DDC', canonical4: 'CTRL', displayName: 'Direct Digital Controls', designator: null, confidence: 0.95, basis: 'ALIAS' },
  { alias: 'ATC', canonical4: 'CTRL', displayName: 'Automatic Temperature Control', designator: null, confidence: 0.95, basis: 'ALIAS' },
  
  // Technology aliases
  { alias: 'SEC', canonical4: 'TECH', displayName: 'Security', designator: null, confidence: 0.90, basis: 'ALIAS' },
  { alias: 'AV', canonical4: 'TECH', displayName: 'Audio/Video', designator: null, confidence: 0.90, basis: 'ALIAS' },
  { alias: 'IT', canonical4: 'TECH', displayName: 'Information Technology', designator: null, confidence: 0.90, basis: 'ALIAS' },
  
  // Survey/Existing/Demo aliases
  { alias: 'SV', canonical4: 'SURV', displayName: 'Survey', designator: null, confidence: 0.85, basis: 'ALIAS' },
  { alias: 'EX', canonical4: 'UNKN', displayName: 'Existing', designator: null, confidence: 0.80, basis: 'ALIAS' },
  { alias: 'DM', canonical4: 'DEMO', displayName: 'Demolition', designator: null, confidence: 0.85, basis: 'ALIAS' },
];

/**
 * Keyword hints for disambiguating 'C' prefix
 */
export const CONTROLS_KEYWORDS = [
  'CONTROL',
  'DDC',
  'BAS',
  'SEQUENCE',
  'POINT',
  'DIAGRAM',
  'TEMPERATURE CONTROL',
  'CONTROLS',
];

export const CIVIL_KEYWORDS = [
  'SITE',
  'GRADING',
  'DRAINAGE',
  'UTILITY',
  'ROAD',
  'PAVING',
  'EROSION',
  'SURVEY',
];

/**
 * Check if title contains any of the given keywords (case-insensitive)
 */
export function titleContainsKeywords(title: string | null | undefined, keywords: string[]): boolean {
  if (!title) return false;
  const upperTitle = title.toUpperCase();
  return keywords.some((keyword) => upperTitle.includes(keyword));
}
