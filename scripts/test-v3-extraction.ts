#!/usr/bin/env node
/**
 * DELETION CANDIDATE: Dev-only test script
 * 
 * Status: Development tool, not part of production build
 * Evidence:
 *   - Not imported by any production code
 *   - Not referenced in package.json scripts
 *   - Manual testing tool only
 * 
 * Action: Mark for deletion - useful for development but not needed in production
 * TODO: Remove after confirming no manual usage
 * Tracking: Cleanup pass 2026-01-17
 * 
 * Original purpose: Test script for V3 PDF Extraction Architecture
 * Processes a PDF through the full extraction pipeline and saves outputs at each step
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  createTranscriptExtractor,
  scoreTranscriptQuality,
  generateCandidates,
} from '@conset-pdf/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node test-v3-extraction.ts <pdf-path>');
    process.exit(1);
  }

  const pdfPath = path.resolve(args[0]);
  const pdfName = path.basename(pdfPath, '.pdf');
  
  // Create output directory
  const outputDir = path.join(__dirname, '..', 'test-output', pdfName);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\n📄 Processing: ${pdfPath}`);
  console.log(`📁 Output directory: ${outputDir}\n`);

  // Step 1: Extract transcript
  console.log('Step 1: Extracting transcript...');
  const extractor = createTranscriptExtractor();
  const transcript = await extractor.extractTranscript(pdfPath);
  
  const engineInfo = extractor.getEngineInfo();
  console.log(`  ✓ Engine: ${engineInfo.name}`);
  console.log(`  ✓ Pages: ${transcript.pages.length}`);
  console.log(`  ✓ Extraction date: ${transcript.extractionDate}`);
  
  // Save raw transcript (already canonicalized by factory)
  const transcriptPath = path.join(outputDir, '01-transcript.json');
  await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
  console.log(`  ✓ Saved: ${transcriptPath}`);

  // Step 2: Quality scoring
  console.log('\nStep 2: Scoring transcript quality...');
  const qualityReport = scoreTranscriptQuality(transcript);
  
  console.log(`  ✓ Overall passes: ${qualityReport.passes}`);
  console.log(`  ✓ Aggregate confidence: ${qualityReport.aggregate.confidenceScore.toFixed(3)}`);
  console.log(`  ✓ Total characters: ${qualityReport.aggregate.extractedCharCount}`);
  const pageReports = qualityReport.pageReports || [];
  console.log(`  ✓ Pages passing: ${pageReports.filter(r => r.passes).length}/${pageReports.length}`);
  
  const qualityPath = path.join(outputDir, '02-quality-report.json');
  await fs.writeFile(qualityPath, JSON.stringify(qualityReport, null, 2));
  console.log(`  ✓ Saved: ${qualityPath}`);

  // Step 3: Candidate generation
  console.log('\nStep 3: Generating structural candidates...');
  const candidates = generateCandidates(transcript);
  
  console.log(`  ✓ Header bands: ${candidates.headerBands.length}`);
  console.log(`  ✓ Footer bands: ${candidates.footerBands.length}`);
  console.log(`  ✓ Heading candidates: ${candidates.headingCandidates.length}`);
  console.log(`  ✓ Table candidates: ${candidates.tableCandidates.length}`);
  console.log(`  ✓ Font size clusters: ${candidates.fontSizeClusters.length}`);
  
  const candidatesPath = path.join(outputDir, '03-candidates.json');
  await fs.writeFile(candidatesPath, JSON.stringify(candidates, null, 2));
  console.log(`  ✓ Saved: ${candidatesPath}`);

  // Step 4: Summary statistics
  console.log('\nStep 4: Generating summary statistics...');
  const summary = {
    file: pdfPath,
    engine: engineInfo.name,
    extractionDate: transcript.extractionDate,
    pages: transcript.pages.length,
    totalSpans: transcript.pages.reduce((sum, p) => sum + p.spans.length, 0),
    totalChars: qualityReport.aggregate.extractedCharCount,
    quality: {
      passes: qualityReport.passes,
      confidenceScore: qualityReport.aggregate.confidenceScore,
      pagesPassing: (qualityReport.pageReports || []).filter(r => r.passes).length,
      pagesTotal: (qualityReport.pageReports || []).length,
    },
    candidates: {
      headerBands: candidates.headerBands.length,
      footerBands: candidates.footerBands.length,
      headingCandidates: candidates.headingCandidates.length,
      tableCandidates: candidates.tableCandidates.length,
      fontSizeClusters: candidates.fontSizeClusters.length,
    },
    hashes: {
      contentHash: transcript.contentHash,
      spanHash: transcript.spanHash,
    },
  };

  const summaryPath = path.join(outputDir, '00-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`  ✓ Saved: ${summaryPath}`);

  // Step 5: Sample page data (first page spans, limited)
  console.log('\nStep 5: Extracting sample page data...');
  if (transcript.pages.length > 0) {
    const firstPage = transcript.pages[0];
    const samplePage = {
      pageNumber: firstPage.pageNumber,
      pageIndex: firstPage.pageIndex,
      width: firstPage.width,
      height: firstPage.height,
      spanCount: firstPage.spans.length,
      sampleSpans: firstPage.spans.slice(0, 50).map(s => ({
        spanId: s.spanId,
        text: s.text.substring(0, 100), // Truncate long text
        bbox: s.bbox,
        fontSize: s.fontSize,
        fontName: s.fontName,
      })),
    };

    const samplePath = path.join(outputDir, '04-sample-page.json');
    await fs.writeFile(samplePath, JSON.stringify(samplePage, null, 2));
    console.log(`  ✓ Saved: ${samplePath} (first 50 spans from page 1)`);
  }

  console.log(`\n✅ Processing complete! All outputs saved to: ${outputDir}\n`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
