/**
 * Standards Registry - Single source of truth for all discipline/division standards
 * 
 * Provides unified API for looking up drawing disciplines, spec divisions,
 * legacy sections, and managing user customizations/aliases.
 */

import type {
  DisciplineEntry,
  DisciplineAlias,
  DivisionEntry,
  LegacySectionEntry,
  UserCustomizations,
} from './types.js';

import {
  DISCIPLINES,
} from './datasets/disciplines.generated.js';

import {
  DIVISIONS,
} from './datasets/divisions.generated.js';

import {
  LEGACY_SECTIONS_BY_DIV_ID,
  isInLegacyRange,
} from './datasets/legacySections.generated.js';

/**
 * Standards Registry Class
 * 
 * Manages all standards data with support for user customizations.
 * Singleton pattern - use exported `standardsRegistry` instance.
 */
class StandardsRegistry {
  private disciplines!: Map<string, DisciplineEntry>;
  private disciplinesByCode!: Map<string, DisciplineEntry>;
  private disciplinesByEid!: Map<string, DisciplineEntry>;
  private disciplineAliases!: Map<string, DisciplineAlias>;

  private divisions!: Map<string, DivisionEntry>;
  private divisionsByCode!: Map<string, DivisionEntry>;

  private legacySections!: Map<string, LegacySectionEntry[]>;

  constructor() {
    // Initialize with default data from generated datasets
    this.loadDefaults();
  }

  /**
   * Load default standards from generated datasets
   */
  private loadDefaults(): void {
    // Disciplines - for BY_ID map, only use base entries (disciplineEid ends with "_")
    this.disciplines = new Map(
      DISCIPLINES
        .filter(d => d.disciplineEid.endsWith('_'))
        .map(d => [d.disciplineID, d as DisciplineEntry])
    );
    this.disciplinesByCode = new Map(
      DISCIPLINES.map(d => [d.disciplineCODE, d as DisciplineEntry])
    );
    this.disciplinesByEid = new Map(
      DISCIPLINES.map(d => [d.disciplineEid, d as DisciplineEntry])
    );

    // Divisions
    this.divisions = new Map(
      DIVISIONS.map(d => [d.divisionID, d as DivisionEntry])
    );
    this.divisionsByCode = new Map(
      DIVISIONS.map(d => [d.divisionCODE, d as DivisionEntry])
    );

    // Legacy sections
    this.legacySections = new Map(
      Object.entries(LEGACY_SECTIONS_BY_DIV_ID).map(([id, sections]) => [
        id,
        sections as LegacySectionEntry[],
      ])
    );

    // Initialize aliases (will be populated from datasets or user customizations)
    this.disciplineAliases = new Map();
    this.loadDefaultAliases();
  }

  /**
   * Load default aliases (hardcoded common ones)
   */
  private loadDefaultAliases(): void {
    const defaultAliases: DisciplineAlias[] = [
      //NOTE: These map to ACTUAL codes in UDS.xlsx, not legacy hardcoded codes
      
      // Fire Protection aliases -> F discipline, FIRE base code
      { alias: 'FP', resolvesToDisciplineID: 'F', resolvesToDisciplineCODE: 'FIRE', displayName: 'Fire Protection', confidence: 0.95, isUserDefined: false },
      { alias: 'FA', resolvesToDisciplineID: 'F', resolvesToDisciplineCODE: 'FIRA', displayName: 'Fire Alarm', confidence: 0.95, isUserDefined: false },
      
      // Controls aliases -> M discipline MT subcode (Mechanical Controls/BAS)
      { alias: 'DDC', resolvesToDisciplineID: 'M', resolvesToDisciplineCODE: 'MTEC', displayName: 'Direct Digital Controls', confidence: 0.95, isUserDefined: false },
      { alias: 'ATC', resolvesToDisciplineID: 'M', resolvesToDisciplineCODE: 'MTEC', displayName: 'Automatic Temperature Control', confidence: 0.95, isUserDefined: false },
      
      // Technology aliases -> T discipline (need to check what T maps to)
      { alias: 'SEC', resolvesToDisciplineID: 'T', resolvesToDisciplineCODE: 'TELE', displayName: 'Security', confidence: 0.90, isUserDefined: false },
      { alias: 'AV', resolvesToDisciplineID: 'T', resolvesToDisciplineCODE: 'TELE', displayName: 'Audio/Video', confidence: 0.90, isUserDefined: false },
      { alias: 'IT', resolvesToDisciplineID: 'T', resolvesToDisciplineCODE: 'TELE', displayName: 'Information Technology', confidence: 0.90, isUserDefined: false },
    ];

    defaultAliases.forEach(alias => {
      this.disciplineAliases.set(alias.alias, alias);
    });
  }

  // ============================================================================
  // User Customizations
  // ============================================================================

  /**
   * Import user customizations from GUI (JSON format)
   * Merges user overrides/additions with defaults
   */
  importUserCustomizations(userData: UserCustomizations): void {
    const nextDisciplines = new Map(this.disciplines);
    const nextDisciplinesByCode = new Map(this.disciplinesByCode);
    const nextDisciplinesByEid = new Map(this.disciplinesByEid);

    const nextDivisions = new Map(this.divisions);
    const nextDivisionsByCode = new Map(this.divisionsByCode);

    // Discipline overrides
    if (userData.disciplines?.overrides) {
      userData.disciplines.overrides.forEach((override) => {
        const keyByCode = override.disciplineCODE ? nextDisciplinesByCode.get(override.disciplineCODE) : null;
        const keyByID = override.disciplineID ? nextDisciplines.get(override.disciplineID) : null;
        const target = keyByCode || keyByID;
        if (!target) return;

        const merged: DisciplineEntry = {
          ...target,
          ...override,
          disciplineID: target.disciplineID,
          disciplineCODE: target.disciplineCODE,
          disciplineEid: target.disciplineEid,
          userOverride: true,
        } as DisciplineEntry;

        nextDisciplines.set(merged.disciplineID, merged);
        nextDisciplinesByCode.set(merged.disciplineCODE, merged);
        nextDisciplinesByEid.set(merged.disciplineEid, merged);
      });
    }

    // Discipline additions
    if (userData.disciplines?.additions) {
      userData.disciplines.additions.forEach((entry) => {
        const normalized: DisciplineEntry = {
          ...entry,
          disciplineID: entry.disciplineID.toUpperCase(),
          disciplineCODE: entry.disciplineCODE.toUpperCase(),
          disciplineEid: entry.disciplineEid.toUpperCase(),
          udsStandard: entry.udsStandard ?? false,
          userOverride: true,
        };

        nextDisciplines.set(normalized.disciplineID, normalized);
        nextDisciplinesByCode.set(normalized.disciplineCODE, normalized);
        nextDisciplinesByEid.set(normalized.disciplineEid, normalized);
      });
    }

    // Discipline deletions (by disciplineID)
    if (userData.disciplines?.deletions) {
      userData.disciplines.deletions.forEach((disciplineID) => {
        const normalizedID = disciplineID.toUpperCase();
        const entry = nextDisciplines.get(normalizedID);
        if (!entry) return;

        nextDisciplines.delete(normalizedID);
        nextDisciplinesByCode.delete(entry.disciplineCODE);
        nextDisciplinesByEid.delete(entry.disciplineEid);
      });
    }

    // Division overrides
    if (userData.divisions?.overrides) {
      userData.divisions.overrides.forEach((override) => {
        const keyByID = override.divisionID ? nextDivisions.get(override.divisionID) : null;
        const keyByCode = override.divisionCODE ? nextDivisionsByCode.get(override.divisionCODE) : null;
        const target = keyByID || keyByCode;
        if (!target) return;

        const merged: DivisionEntry = {
          ...target,
          ...override,
          divisionID: target.divisionID,
          divisionCODE: target.divisionCODE,
          userOverride: true,
        } as DivisionEntry;

        nextDivisions.set(merged.divisionID, merged);
        nextDivisionsByCode.set(merged.divisionCODE, merged);
      });
    }

    // Division additions
    if (userData.divisions?.additions) {
      userData.divisions.additions.forEach((entry) => {
        const normalized: DivisionEntry = {
          ...entry,
          divisionID: entry.divisionID.padStart(2, '0'),
          divisionCODE: entry.divisionCODE.toUpperCase(),
          userOverride: true,
        };

        nextDivisions.set(normalized.divisionID, normalized);
        nextDivisionsByCode.set(normalized.divisionCODE, normalized);
      });
    }

    // Division deletions (by divisionID)
    if (userData.divisions?.deletions) {
      userData.divisions.deletions.forEach((divisionID) => {
        const normalizedID = divisionID.padStart(2, '0');
        const entry = nextDivisions.get(normalizedID);
        if (!entry) return;

        nextDivisions.delete(normalizedID);
        nextDivisionsByCode.delete(entry.divisionCODE);
      });
    }

    this.disciplines = nextDisciplines;
    this.disciplinesByCode = nextDisciplinesByCode;
    this.disciplinesByEid = nextDisciplinesByEid;
    this.divisions = nextDivisions;
    this.divisionsByCode = nextDivisionsByCode;

    // Add user-defined aliases
    if (userData.aliases?.disciplines) {
      userData.aliases.disciplines.forEach(alias => {
        this.disciplineAliases.set(alias.alias.toUpperCase(), {
          ...alias,
          alias: alias.alias.toUpperCase(),
          resolvesToDisciplineCODE: alias.resolvesToDisciplineCODE.toUpperCase(),
          isUserDefined: true,
        });
      });
    }
  }

  /**
   * Reset to defaults (clear all user customizations)
   */
  resetToDefaults(): void {
    this.loadDefaults();
  }

  // ============================================================================
  // Discipline Lookups (Drawings)
  // ============================================================================

  /**
   * Get discipline by single-character ID (G, A, M, etc.)
   */
  getDisciplineByID(id: string): DisciplineEntry | null {
    return this.disciplines.get(id.toUpperCase()) || null;
  }

  /**
   * Get discipline by 4-character CODE (GENL, MECH, ARCH, etc.)
   */
  getDisciplineByCode(code: string): DisciplineEntry | null {
    return this.disciplinesByCode.get(code.toUpperCase()) || null;
  }

  /**
   * Get discipline by 2-character extended ID (AD, FA, EP, etc.)
   */
  getDisciplineByEid(eid: string): DisciplineEntry | null {
    return this.disciplinesByEid.get(eid.toUpperCase()) || null;
  }

  /**
   * Get discipline by alias (FP, DDC, SEC, etc.)
   */
  getDisciplineByAlias(alias: string): DisciplineEntry | null {
    const aliasEntry = this.disciplineAliases.get(alias.toUpperCase());
    if (!aliasEntry) return null;

    // Always resolve via CODE (more specific than ID)
    return this.getDisciplineByCode(aliasEntry.resolvesToDisciplineCODE);
  }

  /**
   * Get all disciplines in order
   */
  getAllDisciplines(): DisciplineEntry[] {
    return Array.from(this.disciplines.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Get all discipline aliases
   */
  getDisciplineAliases(): DisciplineAlias[] {
    return Array.from(this.disciplineAliases.values());
  }

  /**
   * Add a discipline alias
   */
  addDisciplineAlias(alias: DisciplineAlias): void {
    this.disciplineAliases.set(alias.alias.toUpperCase(), alias);
  }

  /**
   * Remove a discipline alias
   */
  removeDisciplineAlias(alias: string): void {
    this.disciplineAliases.delete(alias.toUpperCase());
  }

  // ============================================================================
  // Division Lookups (Specs - Modern)
  // ============================================================================

  /**
   * Get division by 2-digit ID (22, 23, 26, etc.)
   */
  getDivisionByID(id: string): DivisionEntry | null {
    return this.divisions.get(id) || null;
  }

  /**
   * Get division by 4-character CODE (PLUM, HVAC, ELEC, etc.)
   */
  getDivisionByCode(code: string): DivisionEntry | null {
    return this.divisionsByCode.get(code.toUpperCase()) || null;
  }

  /**
   * Get all divisions in order
   */
  getAllDivisions(): DivisionEntry[] {
    return Array.from(this.divisions.values()).sort((a, b) => a.order - b.order);
  }

  // ============================================================================
  // Legacy Section Lookups (Specs - Pre-2004)
  // ============================================================================

  /**
   * Get legacy sections by 2-digit legacy division ID
   */
  getLegacySectionsByDivID(legacyId: string): LegacySectionEntry[] {
    return this.legacySections.get(legacyId) || [];
  }

  /**
   * Get all legacy sections in stable order
   */
  getAllLegacySections(): LegacySectionEntry[] {
    return Array.from(this.legacySections.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, sections]) => sections);
  }

  /**
   * Find legacy section by 5-digit code (XXYYY format)
   * Returns the section entry that contains this code in its range
   */
  findLegacySectionByCode(code: string): LegacySectionEntry | null {
    // Extract legacy division ID (first 2 digits)
    const legacyDivID = code.substring(0, 2);
    const sections = this.getLegacySectionsByDivID(legacyDivID);

    // Find section whose range contains this code
    for (const section of sections) {
      if (isInLegacyRange(code, section.sectionRange)) {
        return section;
      }
    }

    return null;
  }

  /**
   * Detect section format: modern (XX YY ZZ), legacy (XXYYY), or invalid
   */
  detectSectionFormat(code: string): 'modern-6digit' | 'legacy-5digit' | 'invalid' {
    if (!code) return 'invalid';

    const trimmed = code.trim();

    // Modern format: DD SS SS (with spaces)
    if (/^\d{2}\s\d{2}\s\d{2}$/.test(trimmed)) {
      return 'modern-6digit';
    }

    // Legacy format: DDSSS (5 digits, no spaces)
    if (/^\d{5}$/.test(trimmed)) {
      return 'legacy-5digit';
    }

    return 'invalid';
  }

  // ============================================================================
  // Resolution & Validation
  // ============================================================================

  /**
   * Resolve discipline from any code format (ID, EID, CODE, or alias)
   * Returns the canonical discipline entry
   */
  resolveDiscipline(code: string): DisciplineEntry | null {
    if (!code) return null;

    const upper = code.toUpperCase();

    // Try single-char ID
    let result = this.getDisciplineByID(upper);
    if (result) return result;

    // Try 2-char EID
    result = this.getDisciplineByEid(upper);
    if (result) return result;

    // Try 4-char CODE
    result = this.getDisciplineByCode(upper);
    if (result) return result;

    // Try alias
    result = this.getDisciplineByAlias(upper);
    if (result) return result;

    return null;
  }

  /**
   * Resolve division from code, with optional auto-migration for legacy codes
   */
  resolveDivision(code: string, autoMigrateLegacy: boolean = true): DivisionEntry | null {
    if (!code) return null;

    const format = this.detectSectionFormat(code);

    if (format === 'modern-6digit') {
      // Extract division ID (first 2 chars)
      const divisionID = code.substring(0, 2);
      return this.getDivisionByID(divisionID);
    } else if (format === 'legacy-5digit' && autoMigrateLegacy) {
      // Find legacy section and migrate to modern
      const legacySection = this.findLegacySectionByCode(code);
      if (legacySection) {
        return this.getDivisionByID(legacySection.divisionID);
      }
    }

    return null;
  }

  /**
   * Validate discipline code
   */
  validateDisciplineCode(code: string): {
    valid: boolean;
    entry?: DisciplineEntry;
    reason?: string;
  } {
    const entry = this.resolveDiscipline(code);
    if (entry) {
      return { valid: true, entry };
    }
    return { valid: false, reason: 'Unknown discipline code' };
  }

  /**
   * Validate division code
   */
  validateDivisionCode(code: string): {
    valid: boolean;
    entry?: DivisionEntry;
    format?: 'modern-6digit' | 'legacy-5digit';
    reason?: string;
  } {
    const format = this.detectSectionFormat(code);
    if (format === 'invalid') {
      return { valid: false, reason: 'Invalid section code format' };
    }

    const entry = this.resolveDivision(code, true);
    if (entry) {
      return { valid: true, entry, format };
    }

    return { valid: false, format, reason: 'Unknown division code' };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of StandardsRegistry
 * Use this throughout the application
 */
export const standardsRegistry = new StandardsRegistry();

/**
 * Re-export for direct access if needed
 */
export { StandardsRegistry };
