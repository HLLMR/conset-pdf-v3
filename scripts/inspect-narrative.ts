/**
 * DELETION CANDIDATE: Dev-only inspection script
 * 
 * Status: Development tool, not part of production build
 * Evidence:
 *   - Not imported by any production code
 *   - Not referenced in package.json scripts
 *   - Manual inspection tool only
 * 
 * Action: Mark for deletion - useful for development but not needed in production
 * TODO: Remove after confirming no manual usage
 * Tracking: Cleanup pass 2026-01-17
 * 
 * Original purpose: Manual validation of narrative parsing output
 * Usage: npx tsx scripts/inspect-narrative.ts
 */

import {
  extractNarrativeTextFromPdf,
  parseNarrativeAlgorithmic,
  type NarrativeInstructionSet,
} from '../packages/core/src/narrative/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to narrative fixture - check .reference first (project root), then test fixtures
const referencePath = join(__dirname, '..', '..', '.reference', 'Add3 Narrative.pdf');
const testFixturePath = join(
  __dirname,
  '..',
  'tests',
  'fixtures',
  'narratives',
  'Add3 Narrative.pdf'
);
const narrativeFixturePath = existsSync(referencePath) ? referencePath : testFixturePath;

async function main() {
  console.log('='.repeat(80));
  console.log('NARRATIVE PARSER INSPECTION (DEV-ONLY)');
  console.log('='.repeat(80));
  console.log();

  // Check if fixture exists
  if (!existsSync(narrativeFixturePath)) {
    console.error(`Error: Narrative fixture not found at: ${narrativeFixturePath}`);
    process.exit(1);
  }

  console.log(`Loading narrative PDF: ${narrativeFixturePath}`);
  console.log();

  try {
    // Step 1: Extract text
    console.log('Step 1: Extracting text from PDF...');
    const narrativeDoc = await extractNarrativeTextFromPdf(narrativeFixturePath);
    console.log(`  ✓ Extracted ${narrativeDoc.pageCount} pages`);
    console.log(`  ✓ File hash: ${narrativeDoc.fileHash.substring(0, 16)}...`);
    console.log(`  ✓ Total text length: ${narrativeDoc.fullText.length} characters`);
    console.log();

    // Step 2: Parse
    console.log('Step 2: Parsing narrative text...');
    const instructionSet: NarrativeInstructionSet = parseNarrativeAlgorithmic(narrativeDoc);
    console.log(`  ✓ Parsing complete`);
    console.log();

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Drawing instructions: ${instructionSet.drawings.length}`);
    console.log(`Spec instructions: ${instructionSet.specs.length}`);
    console.log(`Parser issues: ${instructionSet.issues.length}`);
    console.log();

    // Detailed output
    console.log('='.repeat(80));
    console.log('DETAILED OUTPUT (JSON)');
    console.log('='.repeat(80));
    console.log();

    // Format JSON with stable key order
    const output = {
      meta: instructionSet.meta,
      drawings: instructionSet.drawings.map(d => ({
        sheetIdRaw: d.sheetIdRaw,
        sheetIdNormalized: d.sheetIdNormalized,
        titleRaw: d.titleRaw,
        notes: d.notes,
        changeType: d.changeType,
        evidence: {
          pageNumber: d.evidence.pageNumber,
          rawLine: d.evidence.rawLine,
        },
      })),
      specs: instructionSet.specs.map(s => ({
        sectionIdRaw: s.sectionIdRaw,
        sectionIdNormalized: s.sectionIdNormalized,
        titleRaw: s.titleRaw,
        actions: s.actions.map(a => ({
          verb: a.verb,
          targetRaw: a.targetRaw,
          rawText: a.rawText,
        })),
        evidence: {
          pageNumber: s.evidence.pageNumber,
          rawBlock: s.evidence.rawBlock.substring(0, 200) + '...', // Truncate for readability
        },
      })),
      issues: instructionSet.issues.map(i => ({
        severity: i.severity,
        code: i.code,
        message: i.message,
        evidence: i.evidence,
      })),
    };

    const jsonOutput = JSON.stringify(output, null, 2);
    console.log(jsonOutput);
    console.log();

    // Write JSON to file in .reference folder (project root, same location as input PDF)
    const referenceDir = join(__dirname, '..', '..', '.reference');
    const outputPath = join(referenceDir, 'Add3 Narrative - parser-output.json');
    
    try {
      // Ensure .reference directory exists
      if (!existsSync(referenceDir)) {
        mkdirSync(referenceDir, { recursive: true });
      }
      writeFileSync(outputPath, jsonOutput, 'utf-8');
      console.log('='.repeat(80));
      console.log(`JSON output written to: ${outputPath}`);
      console.log('='.repeat(80));
    } catch (error: any) {
      console.error(`\nError writing JSON file: ${error?.message || error}`);
    }

    console.log('='.repeat(80));
    console.log('Inspection complete.');
    console.log('='.repeat(80));
  } catch (error: any) {
    console.error('Error:', error?.message || error);
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
