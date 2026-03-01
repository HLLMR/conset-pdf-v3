/**
 * Heuristic ordering table for drawings disciplines
 * 
 * This is explicitly labeled as a heuristic - pragmatic ordering based on
 * typical construction document organization.
 */

import type { DisciplineCanonical4 } from '../types.js';

/**
 * Order values for each canonical discipline
 * Lower numbers = earlier in sort order
 */
export const DISCIPLINE_ORDER: Record<DisciplineCanonical4, number> = {
  GENR: 10, // Cover/General first
  SURV: 20, // Survey/Existing/Demo
  DEMO: 25,
  CIVL: 30, // Civil
  LAND: 40, // Landscape
  ARCH: 50, // Architectural
  INTR: 55, // Interiors (if separate)
  STRU: 60, // Structural
  MECH: 70, // Mechanical
  PLUM: 80, // Plumbing
  FIRP: 75, // Fire Protection (typically sprinkler / plumbing-adjacent)
  ELEC: 90, // Electrical
  FIRA: 95, // Fire Alarm (electrical-adjacent)
  FIRE: 100, // Legacy Fire (fallback/back-compat)
  TECH: 110, // Technology / Low voltage
  CTRL: 120, // Controls
  VEND: 130, // Vendor/deferred
  SPEC: 140, // Specifications (if applicable)
  UNKN: 999, // Unknown last
};

/**
 * Get order value for a discipline, with fallback for unknown
 */
export function getDisciplineOrder(canonical4: DisciplineCanonical4): number {
  return DISCIPLINE_ORDER[canonical4] ?? 999;
}
