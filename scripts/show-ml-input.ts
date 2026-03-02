#!/usr/bin/env node
/**
 * DEV TOOL: ML Input Inspector
 * 
 * Status: Development/debugging tool (not part of build pipeline)
 * Purpose: Shows what the abstract transcript looks like for ML engine input
 * Usage: npx tsx scripts/show-ml-input.ts <pdf-path>
 * 
 * This script is intentionally kept for manual development workflows.
 * It is not imported by production code or referenced in package.json scripts.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  sanitizeTranscript,
  PrivacyMode,
} from '@conset-pdf/core';
import type { LayoutTranscript } from '@conset-pdf/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node show-ml-input.ts <transcript-json-path>');
    process.exit(1);
  }

  const transcriptPath = path.resolve(args[0]);
  const outputDir = path.dirname(transcriptPath);
  const baseName = path.basename(transcriptPath, '.json');
  
  console.log(`\n📄 Loading transcript: ${transcriptPath}\n`);

  // Load the transcript
  const transcriptJson = await fs.readFile(transcriptPath, 'utf-8');
  const transcript = JSON.parse(transcriptJson) as LayoutTranscript;

  console.log(`Original transcript:`);
  console.log(`  - Pages: ${transcript.pages.length}`);
  console.log(`  - Total spans: ${transcript.pages.reduce((sum, p) => sum + p.spans.length, 0)}`);
  console.log(`  - Sample text from first page: "${transcript.pages[0]?.spans[0]?.text?.substring(0, 100)}..."`);

  // Sanitize with different privacy modes
  console.log(`\n🔒 Creating abstract transcripts...\n`);

  // STRICT_STRUCTURE_ONLY (default)
  const strict = sanitizeTranscript(transcript, {
    privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
    sampling: {
      includeChromeBands: true,
      includeHeadings: true,
      includeTables: true,
      maxPages: 5, // Sample first 5 pages for demonstration
    },
  });

  console.log(`Privacy Mode: STRICT_STRUCTURE_ONLY`);
  console.log(`  - Abstract pages: ${strict.abstractTranscript.pages.length}`);
  console.log(`  - Total tokens: ${strict.abstractTranscript.metadata.tokenCount}`);
  console.log(`  - Sample abstract span:`, JSON.stringify(strict.abstractTranscript.pages[0]?.spans[0], null, 2));

  // Save abstract transcript
  const abstractPath = path.join(outputDir, `${baseName}-abstract-strict.json`);
  await fs.writeFile(abstractPath, JSON.stringify(strict.abstractTranscript, null, 2));
  console.log(`  ✓ Saved: ${abstractPath}`);

  // Show what would be sent in the prompt (first page only, truncated)
  const sampleAbstract = {
    ...strict.abstractTranscript,
    pages: strict.abstractTranscript.pages.slice(0, 1).map(page => ({
      ...page,
      spans: page.spans.slice(0, 20), // First 20 spans only
    })),
  };

  const promptExamplePath = path.join(outputDir, `${baseName}-ml-prompt-example.json`);
  await fs.writeFile(promptExamplePath, JSON.stringify(sampleAbstract, null, 2));
  console.log(`  ✓ Saved prompt example (first page, 20 spans): ${promptExamplePath}`);

  // Show token vault sample (if available)
  // Note: TokenVault mappings are private for security, but we can show a few examples
  console.log(`  - Token vault contains ${strict.abstractTranscript.metadata.tokenCount} unique tokens`);

  // WHITELIST_ANCHORS mode
  const whitelist = sanitizeTranscript(transcript, {
    privacyMode: PrivacyMode.WHITELIST_ANCHORS,
    sampling: {
      includeChromeBands: true,
      includeHeadings: true,
      maxPages: 5,
    },
  });

  console.log(`\nPrivacy Mode: WHITELIST_ANCHORS`);
  console.log(`  - Abstract pages: ${whitelist.abstractTranscript.pages.length}`);
  console.log(`  - Total tokens: ${whitelist.abstractTranscript.metadata.tokenCount}`);
  
  // Find a span with a keyword token
  const keywordSpan = whitelist.abstractTranscript.pages[0]?.spans.find(
    s => s.tokenClass === 'KEYWORD'
  );
  if (keywordSpan) {
    console.log(`  - Sample keyword span:`, JSON.stringify(keywordSpan, null, 2));
  }

  const whitelistPath = path.join(outputDir, `${baseName}-abstract-whitelist.json`);
  await fs.writeFile(whitelistPath, JSON.stringify(whitelist.abstractTranscript, null, 2));
  console.log(`  ✓ Saved: ${whitelistPath}`);

  // Show comparison
  console.log(`\n📊 Comparison:`);
  console.log(`  Original transcript: ${JSON.stringify(transcript, null, 2).length} bytes`);
  console.log(`  Abstract (strict): ${JSON.stringify(strict.abstractTranscript, null, 2).length} bytes`);
  console.log(`  Abstract (whitelist): ${JSON.stringify(whitelist.abstractTranscript, null, 2).length} bytes`);

  console.log(`\n✅ All abstract transcripts saved to: ${outputDir}\n`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
