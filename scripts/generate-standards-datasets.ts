/**
 * Generate TypeScript datasets from UDS.xlsx
 * 
 * This script parses the UDS.xlsx file and generates TypeScript files
 * with properly typed standards data. Run with:
 * 
 *   npx tsx scripts/generate-standards-datasets.ts
 * 
 * Generated files:
 *   - packages/core/src/standards/datasets/disciplines.generated.ts
 *   - packages/core/src/standards/datasets/divisions.generated.ts
 *   - packages/core/src/standards/datasets/legacySections.generated.ts
 */

import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Type Definitions (matching UDS.xlsx structure)
// ============================================================================

interface DisciplineRow {
  disciplineID: string;
  discipline: string;
  disciplineEid: string;
  disciplineCODE: string;
  disciplineFull: string;
  disciplineDesc?: string;
}

interface DivisionRow {
  divisionID: string;
  divisionCODE: string;
  division: string;
  divisionDesc?: string;
}

interface LegacySectionRow {
  legacyDivID: string;
  sectionRange: string;
  sectionTitle: string;
  notes?: string;
  divisionID: string;          // Modern equivalent
  divisionCODE: string;        // Modern equivalent
}

// ============================================================================
// Main Generation Function
// ============================================================================

async function generateStandardsDatasets() {
  console.log('📊 Generating standards datasets from UDS.xlsx...\n');

  const udsPath = path.join(__dirname, '..', '..', '.reference', 'UDS.xlsx');
  
  if (!fs.existsSync(udsPath)) {
    throw new Error(`UDS.xlsx not found at: ${udsPath}`);
  }

  console.log(`Reading: ${udsPath}`);
  const workbook = XLSX.readFile(udsPath);
  
  // Parse each sheet
  const disciplinesData = parseSheet<DisciplineRow>(workbook, 'Disciplines');
  const divisionsData = parseSheet<DivisionRow>(workbook, 'Divisions');
  const legacyData = parseSheet<LegacySectionRow>(workbook, 'Divisions (pre-2004)');
  
  console.log(`\n✓ Parsed ${disciplinesData.length} disciplines`);
  console.log(`✓ Parsed ${divisionsData.length} divisions`);
  console.log(`✓ Parsed ${legacyData.length} legacy sections\n`);
  
  // Generate TypeScript files
  const outputDir = path.join(__dirname, '..', 'packages', 'core', 'src', 'standards', 'datasets');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  generateDisciplinesFile(disciplinesData, outputDir);
  generateDivisionsFile(divisionsData, outputDir);
  generateLegacySectionsFile(legacyData, outputDir);
  
  console.log('\n✅ Standards datasets generated successfully!');
  console.log(`📂 Output directory: ${outputDir}`);
}

// ============================================================================
// Sheet Parsing
// ============================================================================

function parseSheet<T>(workbook: XLSX.WorkBook, sheetName: string): T[] {
  const sheet = workbook.Sheets[sheetName];
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in UDS.xlsx`);
  }
  
  const data = XLSX.utils.sheet_to_json<T>(sheet, {
    defval: undefined, // Don't add empty strings for missing values
  });
  
  // Filter out completely empty rows
  return data.filter(row => {
    return Object.values(row as Record<string, unknown>).some(val => val !== undefined && val !== null && val !== '');
  });
}

// ============================================================================
// File Generation Functions
// ============================================================================

function generateDisciplinesFile(data: DisciplineRow[], outputDir: string) {
  // Validate data
  data.forEach((row, idx) => {
    if (!row.disciplineID || !row.discipline || !row.disciplineCODE) {
      throw new Error(`Invalid discipline row at index ${idx}: missing required fields`);
    }
  });

  // Add order property based on array index (preserves UDS.xlsx order)
  const dataWithOrder = data.map((row, idx) => ({
    ...row,
    order: (idx + 1) * 10, // 10, 20, 30, etc.
    udsStandard: true,
  }));

  const content = `/**
 * Generated from UDS.xlsx - Tab: "disciplines"
 * DO NOT EDIT MANUALLY - Regenerate using: npx tsx scripts/generate-standards-datasets.ts
 * 
 * Data order is preserved from source - this is the canonical sort order for drawings.
 * Generated on: ${new Date().toISOString()}
 */

import type { DisciplineEntry } from '../types.js';

export const DISCIPLINES: readonly DisciplineEntry[] = ${JSON.stringify(dataWithOrder, null, 2)} as const;

/**
 * Lookup map by disciplineID (single character)
 */
export const DISCIPLINES_BY_ID: Record<string, DisciplineEntry> = DISCIPLINES.reduce(
  (acc, d) => ({ ...acc, [d.disciplineID]: d }),
  {} as Record<string, DisciplineEntry>
);

/**
 * Lookup map by disciplineCODE (4-character)
 */
export const DISCIPLINES_BY_CODE: Record<string, DisciplineEntry> = DISCIPLINES.reduce(
  (acc, d) => ({ ...acc, [d.disciplineCODE]: d }),
  {} as Record<string, DisciplineEntry>
);

/**
 * Lookup map by disciplineEid (2-character extended)
 */
export const DISCIPLINES_BY_EID: Record<string, DisciplineEntry> = DISCIPLINES.reduce(
  (acc, d) => ({ ...acc, [d.disciplineEid]: d }),
  {} as Record<string, DisciplineEntry>
);
`;

  const filePath = path.join(outputDir, 'disciplines.generated.ts');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✓ Generated: disciplines.generated.ts (${data.length} entries)`);
}

function generateDivisionsFile(data: DivisionRow[], outputDir: string) {
  // Validate data
  data.forEach((row, idx) => {
    if (!row.divisionID || !row.division || !row.divisionCODE) {
      throw new Error(`Invalid division row at index ${idx}: missing required fields`);
    }
  });

  // Canonicalize to 2-digit division IDs (Excel often strips leading zeros)
  // and add order property based on numeric divisionID.
  const dataWithOrder = data.map((row) => ({
    ...row,
    divisionID: String(row.divisionID).padStart(2, '0'),
    order: parseInt(String(row.divisionID), 10) || 999,
    mfVersion: '2018',
  }));

  const content = `/**
 * Generated from UDS.xlsx - Tab: "divisions"
 * DO NOT EDIT MANUALLY - Regenerate using: npx tsx scripts/generate-standards-datasets.ts
 * 
 * CSI MasterFormat 2018 divisions.
 * Generated on: ${new Date().toISOString()}
 */

import type { DivisionEntry } from '../types.js';

export const DIVISIONS: readonly DivisionEntry[] = ${JSON.stringify(dataWithOrder, null, 2)} as const;

/**
 * Lookup map by divisionID (2-digit)
 */
export const DIVISIONS_BY_ID: Record<string, DivisionEntry> = DIVISIONS.reduce(
  (acc, d) => ({ ...acc, [d.divisionID]: d }),
  {} as Record<string, DivisionEntry>
);

/**
 * Lookup map by divisionCODE (4-character)
 */
export const DIVISIONS_BY_CODE: Record<string, DivisionEntry> = DIVISIONS.reduce(
  (acc, d) => ({ ...acc, [d.divisionCODE]: d }),
  {} as Record<string, DivisionEntry>
);
`;

  const filePath = path.join(outputDir, 'divisions.generated.ts');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✓ Generated: divisions.generated.ts (${data.length} entries)`);
}

function generateLegacySectionsFile(data: LegacySectionRow[], outputDir: string) {
  // Validate data
  data.forEach((row, idx) => {
    if (!row.legacyDivID || !row.sectionTitle || !row.divisionID || !row.divisionCODE) {
      throw new Error(`Invalid legacy section row at index ${idx}: missing required fields`);
    }
  });

  // Canonicalize IDs to 2-digit format, add year property,
  // and rename notes to sectionNotes for consistency.
  const dataWithYear = data.map((row) => ({
    legacyDivID: String(row.legacyDivID).padStart(2, '0'),
    sectionRange: row.sectionRange,
    sectionTitle: row.sectionTitle,
    sectionNotes: row.notes,
    divisionID: String(row.divisionID).padStart(2, '0'),
    divisionCODE: row.divisionCODE,
    year: 'pre-2004',
  }));

  const content = `/**
 * Generated from UDS.xlsx - Tab: "divisions (pre-2004)"
 * DO NOT EDIT MANUALLY - Regenerate using: npx tsx scripts/generate-standards-datasets.ts
 * 
 * Legacy 5-digit spec code mappings (XXYYY format) from pre-2004 MasterFormat.
 * These auto-migrate to modern divisions for sort order and filename generation.
 * Generated on: ${new Date().toISOString()}
 */

import type { LegacySectionEntry } from '../types.js';

export const LEGACY_SECTIONS: readonly LegacySectionEntry[] = ${JSON.stringify(dataWithYear, null, 2)} as const;

/**
 * Lookup map by legacyDivID (2-character legacy division code)
 */
export const LEGACY_SECTIONS_BY_DIV_ID: Record<string, LegacySectionEntry[]> = LEGACY_SECTIONS.reduce(
  (acc, section) => {
    if (!acc[section.legacyDivID]) {
      acc[section.legacyDivID] = [];
    }
    acc[section.legacyDivID].push(section);
    return acc;
  },
  {} as Record<string, LegacySectionEntry[]>
);

/**
 * Check if a 5-digit code falls within a legacy section range
 */
export function isInLegacyRange(code: string, range: string): boolean {
  const codeNum = parseInt(code, 10);
  if (isNaN(codeNum)) return false;
  
  const [start, end] = range.split('-').map(s => parseInt(s.trim(), 10));
  if (isNaN(start)) return false;
  
  if (isNaN(end)) {
    // Single code range
    return codeNum === start;
  }
  
  return codeNum >= start && codeNum <= end;
}
`;

  const filePath = path.join(outputDir, 'legacySections.generated.ts');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✓ Generated: legacySections.generated.ts (${data.length} entries)`);
}

// ============================================================================
// Run
// ============================================================================

generateStandardsDatasets().catch(err => {
  console.error('❌ Error generating standards datasets:');
  console.error(err);
  process.exit(1);
});
