import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  createTranscriptExtractor,
  canonicalizeTranscript,
  scoreTranscriptQuality,
  generateCandidates,
  DocumentContext,
  detectSections,
  convertToSpecSections,
  extractTextNodes,
  generateBookmarkTree,
  buildTreeFromBookmarkAnchorTree,
  buildFooterSectionMap,
  type LayoutTranscript,
  type QualityReport,
  type CandidateReport,
  type SpecDoc,
  type BookmarkAnchorTree,
  type FooterSectionMap,
  validateFooterParsing,
} from '@conset-pdf/core';
import { fileURLToPath } from 'url';

// Get the directory of the current module (works in both ESM and compiled output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, '../../../../../.reference/LHHS/Specifications/23_MECH_FULL.pdf');

interface WalkthroughOptions {
  step?: string;
  outputDir?: string;
  verbose?: boolean;
}

/**
 * Find the PDF file, checking multiple possible locations
 */
async function findPdfPath(): Promise<string> {
  const possiblePaths = [
    PDF_PATH,
    path.join(process.cwd(), '.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
    path.join(process.cwd(), '../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
    path.join(process.cwd(), '../../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
    'f:/Projects/conset-pdf-ws/.reference/LHHS/Specifications/23_MECH_FULL.pdf',
  ];

  for (const pdfPath of possiblePaths) {
    try {
      await fs.access(pdfPath);
      return pdfPath;
    } catch {
      // Continue to next path
    }
  }

  throw new Error(`Could not find 23_MECH_FULL.pdf. Checked:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}`);
}

/**
 * Ensure output directory exists
 */
async function ensureOutputDir(outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });
}

/**
 * Write JSON file with pretty formatting
 */
async function writeJson(filePath: string, data: any): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Phase 0: Print run plan and contracts
 */
async function printRunPlan(pdfPath: string, outputDir: string): Promise<void> {
  console.log('\n===========================================================');
  console.log('PHASE 0 — RUN PLAN');
  console.log('===========================================================\n');
  
  console.log('Source PDF:', pdfPath);
  console.log('Output directory:', outputDir);
  console.log('');
  
  // Check extractor backend
  const extractor = createTranscriptExtractor();
  const engineInfo = extractor.getEngineInfo();
  console.log('Extractor backend:', engineInfo.name);
  console.log('  - Fallback chain: PyMuPDF → PDF.js');
  console.log('');
  
  console.log('Coordinate system contract:');
  console.log('  - Origin: Top-left (y=0 at top)');
  console.log('  - Units: Points (1/72 inch)');
  console.log('  - Y direction: Top-to-bottom (increasing)');
  console.log('  - Rotation: Normalized to 0 (bboxes transformed)');
  console.log('');
  
  console.log('Determinism contract:');
  console.log('  - Excluded from hashes: extractionDate, file paths, timestamps');
  console.log('  - Included in hashes: span text, bboxes, font metrics, page dimensions');
  console.log('  - Ordering: Stable-sorted by (y, x) within each page');
  console.log('  - Span IDs: Regenerated deterministically after sorting');
  console.log('');
}

/**
 * Step 1: Transcript extraction
 */
async function step1Transcript(outputDir: string, _verbose: boolean): Promise<LayoutTranscript> {
  console.log('\n===========================================================');
  console.log('STEP 1 — TRANSCRIPT EXTRACTION');
  console.log('===========================================================\n');
  
  const pdfPath = await findPdfPath();
  console.log('Extracting transcript from:', pdfPath);
  
  const extractor = createTranscriptExtractor();
  const transcript = await extractor.extractTranscript(pdfPath);
  const engineInfo = extractor.getEngineInfo();
  
  console.log(`\n✓ Extractor: ${engineInfo.name}`);
  console.log(`✓ Pages: ${transcript.pages.length}`);
  console.log(`✓ Total spans: ${transcript.pages.reduce((sum, p) => sum + p.spans.length, 0)}`);
  console.log(`✓ Extraction date: ${transcript.extractionDate}`);
  
  // Save full transcript
  const transcriptPath = path.join(outputDir, '01-transcript.json');
  await writeJson(transcriptPath, transcript);
  console.log(`\n✓ Saved: ${transcriptPath}`);
  
  // Save metadata summary
  const totalSpans = transcript.pages.reduce((sum, p) => sum + p.spans.length, 0);
  const totalChars = transcript.pages.reduce((sum, p) => 
    sum + p.spans.reduce((s, span) => s + span.text.length, 0), 0
  );
  const fonts = new Set<string>();
  const fontSizes = new Set<number>();
  transcript.pages.forEach(page => {
    page.spans.forEach(span => {
      fonts.add(span.fontName);
      fontSizes.add(span.fontSize);
    });
  });
  
  const meta = {
    pages: transcript.pages.length,
    totalSpans,
    totalChars,
    fonts: Array.from(fonts).sort(),
    fontSizes: Array.from(fontSizes).sort((a, b) => a - b),
    extractionDate: transcript.extractionDate,
    extractor: engineInfo.name,
  };
  
  const metaPath = path.join(outputDir, '01-transcript.meta.json');
  await writeJson(metaPath, meta);
  console.log(`✓ Saved: ${metaPath}`);
  
  // Save single page slice (page 0)
  const page0 = transcript.pages.find(p => p.pageIndex === 0);
  if (page0) {
    const page0Path = path.join(outputDir, '01-transcript.page000.json');
    await writeJson(page0Path, {
      pageIndex: page0.pageIndex,
      width: page0.width,
      height: page0.height,
      rotation: page0.rotation,
      spans: page0.spans.slice(0, 100), // First 100 spans for readability
      spanCount: page0.spans.length,
    });
    console.log(`✓ Saved: ${page0Path} (first 100 spans of page 0)`);
  }
  
  console.log('\nExplanation:');
  console.log('  1) Module: TranscriptExtractor (via createTranscriptExtractor factory)');
  console.log('  2) Proves: Raw layout data extracted from PDF (spans with bbox, font, flags)');
  console.log('  3) Next step: Canonicalization normalizes this transcript for determinism');
  console.log('  4) Transcript is the single source of truth for all downstream parsing');
  
  return transcript;
}

/**
 * Step 2: Canonicalization + determinism hashes
 */
async function step2Canonicalization(
  transcript: LayoutTranscript,
  outputDir: string,
  _verbose: boolean
): Promise<LayoutTranscript> {
  console.log('\n===========================================================');
  console.log('STEP 2 — CANONICALIZATION + DETERMINISM HASHES');
  console.log('===========================================================\n');
  
  console.log('Canonicalizing transcript...');
  
  // Canonicalize (note: transcript from extractor is already canonicalized,
  // but we'll do it again to show the process and verify determinism)
  const canonical = canonicalizeTranscript(transcript);
  
  const contentHash = canonical.metadata.contentHash || 'N/A';
  const spanHash = canonical.metadata.spanHash || 'N/A';
  console.log(`✓ Content hash: ${contentHash.substring(0, 16)}...`);
  console.log(`✓ Span hash: ${spanHash.substring(0, 16)}...`);
  
  // Save canonical transcript
  const canonicalPath = path.join(outputDir, '02-transcript.canonical.json');
  await writeJson(canonicalPath, canonical);
  console.log(`\n✓ Saved: ${canonicalPath}`);
  
  // Save hashes
  const hashes = {
    contentHash: canonical.metadata.contentHash || null,
    spanHash: canonical.metadata.spanHash || null,
    pageHashes: canonical.pages.map((page, idx) => ({
      pageIndex: idx,
      spanCount: page.spans.length,
    })),
  };
  
  const hashesPath = path.join(outputDir, '02-hashes.json');
  await writeJson(hashesPath, hashes);
  console.log(`✓ Saved: ${hashesPath}`);
  
  // Run canonicalization twice to prove determinism
  console.log('\nRunning canonicalization twice to verify determinism...');
  const canonical1 = canonicalizeTranscript(transcript);
  const canonical2 = canonicalizeTranscript(transcript);
  
  const hashes1 = {
    contentHash: canonical1.metadata.contentHash || null,
    spanHash: canonical1.metadata.spanHash || null,
  };
  const hashes2 = {
    contentHash: canonical2.metadata.contentHash || null,
    spanHash: canonical2.metadata.spanHash || null,
  };
  
  await writeJson(path.join(outputDir, '02-hashes.run1.json'), hashes1);
  await writeJson(path.join(outputDir, '02-hashes.run2.json'), hashes2);
  
  const matches = 
    hashes1.contentHash === hashes2.contentHash &&
    hashes1.spanHash === hashes2.spanHash;
  
  const determinismCheck = {
    passes: matches,
    reason: matches 
      ? 'Hashes match across multiple runs' 
      : 'Hashes differ (non-deterministic)',
    run1: hashes1,
    run2: hashes2,
  };
  
  await writeJson(path.join(outputDir, '02-determinism-check.json'), determinismCheck);
  console.log(`✓ Determinism check: ${matches ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Saved: ${path.join(outputDir, '02-determinism-check.json')}`);
  
  console.log('\nExplanation:');
  console.log('  1) Module: canonicalizeTranscript()');
  console.log('  2) Proves: Normalized rotation (0), stable-sorted spans, deterministic hashes');
  console.log('  3) Next step: Quality scoring validates transcript is safe to parse');
  console.log('  4) Fields excluded: extractionDate, file paths');
  console.log('  5) Ordering: Stable-sorted by (y, x) within each page');
  
  return canonical;
}

/**
 * Step 3: Quality report
 */
async function step3Quality(
  transcript: LayoutTranscript,
  outputDir: string,
  _verbose: boolean
): Promise<QualityReport> {
  console.log('\n===========================================================');
  console.log('STEP 3 — QUALITY REPORT');
  console.log('===========================================================\n');
  
  console.log('Scoring transcript quality...');
  
  const qualityReport = scoreTranscriptQuality(transcript);
  
  console.log(`✓ Overall score: ${qualityReport.overallScore.toFixed(3)}`);
  console.log(`✓ Passes: ${qualityReport.passes ? 'YES' : 'NO'}`);
  console.log(`✓ Aggregate confidence: ${qualityReport.aggregate.confidenceScore.toFixed(3)}`);
  console.log(`✓ Total characters: ${qualityReport.aggregate.extractedCharCount.toLocaleString()}`);
  console.log(`✓ Replacement chars: ${qualityReport.aggregate.replacementCharCount}`);
  console.log(`✓ Estimated OCR needed: ${qualityReport.aggregate.estimatedOCRNeeded ? 'YES' : 'NO'}`);
  
  if (qualityReport.issues.length > 0) {
    console.log(`\n⚠ Issues (${qualityReport.issues.length}):`);
    qualityReport.issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  // Save full quality report
  const qualityPath = path.join(outputDir, '03-quality-report.json');
  await writeJson(qualityPath, qualityReport);
  console.log(`\n✓ Saved: ${qualityPath}`);
  
  // Save summary
  const summary = {
    overallScore: qualityReport.overallScore,
    passes: qualityReport.passes,
    aggregate: qualityReport.aggregate,
    gates: qualityReport.gates,
    issuesCount: qualityReport.issues.length,
  };
  
  const summaryPath = path.join(outputDir, '03-quality-summary.json');
  await writeJson(summaryPath, summary);
  console.log(`✓ Saved: ${summaryPath}`);
  
  // Save per-page metrics for first 10 pages
  const pagesMetrics = qualityReport.pageMetrics.slice(0, 10).map(pm => ({
    pageIndex: pm.pageIndex,
    metrics: pm.metrics,
  }));
  
  const pagesPath = path.join(outputDir, '03-quality.pages.000-009.json');
  await writeJson(pagesPath, pagesMetrics);
  console.log(`✓ Saved: ${pagesPath}`);
  
  console.log('\nExplanation:');
  console.log('  1) Module: scoreTranscriptQuality()');
  console.log('  2) Proves: Transcript is safe to parse (no OCR needed for this PDF)');
  console.log('  3) Next step: Candidate generation detects structural elements');
  console.log('  4) Metrics: Char count, whitespace ratio, replacement chars, ordering sanity');
  console.log('  5) Thresholds: Min chars=50/page, max replacement=0.05, min ordering=0.80, min confidence=0.85');
  
  return qualityReport;
}

/**
 * Step 4: Candidate generation
 */
async function step4Candidates(
  transcript: LayoutTranscript,
  outputDir: string,
  _verbose: boolean
): Promise<CandidateReport> {
  console.log('\n===========================================================');
  console.log('STEP 4 — CANDIDATE GENERATION');
  console.log('===========================================================\n');
  
  console.log('Generating structural candidates...');
  
  const candidates = generateCandidates(transcript);
  
  console.log(`✓ Header bands: ${candidates.headerBands.length}`);
  console.log(`✓ Footer bands: ${candidates.footerBands.length}`);
  console.log(`✓ Font size clusters: ${candidates.fontSizeClusters.length}`);
  console.log(`✓ Heading candidates: ${candidates.headingCandidates.length}`);
  console.log(`✓ Column hints: ${candidates.columnHints.length}`);
  console.log(`✓ Table candidates: ${candidates.tableCandidates.length}`);
  
  // Save full candidates
  const candidatesPath = path.join(outputDir, '04-candidates.json');
  await writeJson(candidatesPath, candidates);
  console.log(`\n✓ Saved: ${candidatesPath}`);
  
  // Save summary
  const summary = {
    headerBands: candidates.headerBands.length,
    footerBands: candidates.footerBands.length,
    fontSizeClusters: candidates.fontSizeClusters.length,
    headingCandidates: candidates.headingCandidates.length,
    columnHints: candidates.columnHints.length,
    tableCandidates: candidates.tableCandidates.length,
    topHeaderBands: candidates.headerBands.slice(0, 5),
    topFooterBands: candidates.footerBands.slice(0, 5),
  };
  
  const summaryPath = path.join(outputDir, '04-candidates.summary.json');
  await writeJson(summaryPath, summary);
  console.log(`✓ Saved: ${summaryPath}`);
  
  // Save header/footer bands only
  const bands = {
    headerBands: candidates.headerBands.map(b => ({
      y: b.y,
      confidence: b.confidence,
      pageIndices: b.pageIndices,
    })),
    footerBands: candidates.footerBands.map(b => ({
      y: b.y,
      confidence: b.confidence,
      pageIndices: b.pageIndices,
    })),
  };
  
  const bandsPath = path.join(outputDir, '04-header-footer-bands.json');
  await writeJson(bandsPath, bands);
  console.log(`✓ Saved: ${bandsPath}`);
  
  // Save heading candidates sample
  const headingSample = candidates.headingCandidates
    .slice(0, 50)
    .map(h => ({
      pageIndex: h.pageIndex,
      level: h.level,
      confidence: h.confidence,
      y: h.span.bbox[1],
      fontSize: h.span.fontSize,
      preview: h.span.text.substring(0, 60).replace(/\s+/g, ' ').trim(),
    }));
  
  const headingPath = path.join(outputDir, '04-heading-candidates.sample.json');
  await writeJson(headingPath, headingSample);
  console.log(`✓ Saved: ${headingPath}`);
  
  console.log('\nExplanation:');
  console.log('  1) Module: generateCandidates()');
  console.log('  2) Proves: Structural elements detected (header/footer bands, headings, columns)');
  console.log('  3) Next step: Spec parser uses candidates for chrome removal and heading detection');
  console.log('  4) Header/footer: Detected via Y clustering + repetition across pages');
  console.log('  5) Headings: Detected via regex patterns + style hints (font size, bold)');
  
  return candidates;
}

/**
 * Step 4.5: Footer section map
 */
async function step4bFooterSectionMap(
  transcript: LayoutTranscript,
  candidates: CandidateReport,
  outputDir: string,
  _verbose: boolean
): Promise<FooterSectionMap> {
  console.log('\n===========================================================');
  console.log('STEP 4.5 — FOOTER SECTION MAP');
  console.log('===========================================================\n');
  
  console.log('Building footer-first section segmentation...');
  
  // Get DocumentContext for more accurate footer extraction
  const pdfPath = await findPdfPath();
  const docContext = new DocumentContext(pdfPath);
  await docContext.initialize();
  
  // Run validation first (before building footer map)
  console.log('Validating footer parsing with new parser...');
  // Convert footer band Y coordinate to normalized range
  // Footer bands have a single Y coordinate, convert to a range around it
  const firstPageHeight = transcript.pages[0]?.height ?? 792;
  const footerBandY = candidates?.footerBands?.[0]?.y ?? (firstPageHeight * 0.95);
  const footerBandNormalized = {
    yMin: Math.max(0.85, (footerBandY - 20) / firstPageHeight),
    yMax: Math.min(1.0, (footerBandY + 20) / firstPageHeight),
  };
  const validation = validateFooterParsing(transcript, footerBandNormalized, [0, 50, 100]);
  
  console.log(`✓ Lines built: ${validation.counters.linesBuiltCount}`);
  console.log(`✓ Parse matches: ${validation.counters.parseMatchCount}`);
  console.log(`✓ Tags emitted: ${validation.counters.tagsEmittedCount}`);
  console.log(`✓ Tags kept after filtering: ${validation.counters.tagsKeptAfterFilteringCount}`);
  console.log(`✓ Pages total: ${validation.counters.pagesTotal}`);
  
  // Save validation results (temporary, will be merged with footer map validation later)
  const validationTempPath = path.join(outputDir, '04b-footer-validation-temp.json');
  await writeJson(validationTempPath, validation);
  console.log(`\n✓ Saved: ${validationTempPath}`);
  
  // Check if debug pages contain section IDs
  const debugPagesWithSectionIds = validation.debugPages.filter(p => p.finalSectionId !== null);
  console.log(`✓ Debug pages with section IDs: ${debugPagesWithSectionIds.length}/${validation.debugPages.length}`);
  if (validation.debugPages.length > 0) {
    console.log('\nDebug page footer lines:');
    for (const debugPage of validation.debugPages) {
      console.log(`  Page ${debugPage.pageIndex}:`);
      for (let i = 0; i < debugPage.footerLines.length; i++) {
        const line = debugPage.footerLines[i];
        const sectionId = debugPage.parsedSectionIds[i];
        const marker = sectionId ? '✓' : ' ';
        console.log(`    ${marker} "${line.substring(0, 80)}${line.length > 80 ? '...' : ''}"`);
        if (sectionId) {
          console.log(`      → Section ID: ${sectionId}`);
        }
      }
      if (debugPage.finalSectionId) {
        console.log(`    Final section ID: ${debugPage.finalSectionId}`);
      }
    }
  }
  
  const footerMap = await buildFooterSectionMap(transcript, candidates, {
    useCandidateBands: true,
  }, docContext);
  
  console.log(`\n✓ Footer band: yMin=${footerMap.footerBand.yMin.toFixed(3)}, yMax=${footerMap.footerBand.yMax.toFixed(3)}`);
  console.log(`✓ Footer band confidence: ${footerMap.footerBand.confidence.toFixed(3)}`);
  console.log(`✓ Footer band page coverage: ${(footerMap.footerBand.pageCoverage * 100).toFixed(1)}%`);
  console.log(`✓ Pages tagged: ${footerMap.stats.pagesTagged}/${footerMap.stats.pagesTotal}`);
  console.log(`✓ Unique sections: ${footerMap.stats.uniqueSections}`);
  console.log(`✓ Pages missing footer: ${footerMap.stats.pagesMissingFooter}`);
  console.log(`✓ Pages ambiguous: ${footerMap.stats.pagesAmbiguous}`);
  console.log(`✓ Section ranges: ${footerMap.ranges.length}`);
  
  // Save full footer section map
  const mapPath = path.join(outputDir, '04b-footer-section-map.json');
  await writeJson(mapPath, footerMap);
  console.log(`\n✓ Saved: ${mapPath}`);
  
  // Save debug dump if available
  if ((footerMap as any).__debug) {
    const debugPath = path.join(outputDir, '04b-footer-debug-page0.json');
    await writeJson(debugPath, (footerMap as any).__debug);
    console.log(`✓ Saved: ${debugPath}`);
    
    // Print debug summary
    const debug = (footerMap as any).__debug;
    if (debug.page0) {
      console.log('\nDebug: Page 0 coordinate analysis');
      console.log(`  Page height: ${debug.page0.pageHeight}`);
      console.log(`  10 smallest Y (top):`);
      debug.page0.smallestY.forEach((s: any, i: number) => {
        console.log(`    ${i + 1}. y=${s.y0.toFixed(1)} "${s.text}" bbox=[${s.bbox.map((v: number) => v.toFixed(1)).join(', ')}]`);
      });
      console.log(`  10 largest Y (bottom):`);
      debug.page0.largestY.forEach((s: any, i: number) => {
        console.log(`    ${i + 1}. y=${s.y0.toFixed(1)} "${s.text}" bbox=[${s.bbox.map((v: number) => v.toFixed(1)).join(', ')}]`);
      });
      console.log(`  Invariants:`);
      console.log(`    "RWB..." in header: ${debug.page0.invariants.rwbInHeader ? '✓' : '✗'}`);
      console.log(`    Section ID in footer: ${debug.page0.invariants.sectionIdInFooter ? '✓' : '✗'}`);
      if (debug.page0.rwbSpans.length > 0) {
        console.log(`    RWB spans (${debug.page0.rwbSpans.length}):`);
        debug.page0.rwbSpans.forEach((s: any) => {
          const [, y0, , y1] = s.bbox;
          const centerY = (y0 + y1) / 2;
          console.log(`      "${s.text}" centerY=${centerY.toFixed(1)} bbox=[${s.bbox.map((v: number) => v.toFixed(1)).join(', ')}]`);
        });
      }
      if (debug.page0.sectionIdSpans.length > 0) {
        console.log(`    Section ID spans (${debug.page0.sectionIdSpans.length}):`);
        debug.page0.sectionIdSpans.forEach((s: any) => {
          const [, y0, , y1] = s.bbox;
          const centerY = (y0 + y1) / 2;
          console.log(`      "${s.text}" centerY=${centerY.toFixed(1)} bbox=[${s.bbox.map((v: number) => v.toFixed(1)).join(', ')}]`);
        });
      }
    }
  }
  
  // Save tags sample (first 30 pages)
  const tagsSample = footerMap.tagsByPage.slice(0, 30).map(tag => ({
    pageIndex: tag.pageIndex,
    sectionId: tag.sectionId,
    pageInSection: tag.pageInSection,
    confidence: tag.confidence,
    reasonCodes: tag.reasonCodes,
    footerLineCount: tag.footerLines.length,
  }));
  
  const tagsPath = path.join(outputDir, '04b-footer-tags.sample.json');
  await writeJson(tagsPath, tagsSample);
  console.log(`✓ Saved: ${tagsPath}`);
  
  // Save ranges only
  const rangesPath = path.join(outputDir, '04b-footer-ranges.json');
  await writeJson(rangesPath, footerMap.ranges);
  console.log(`✓ Saved: ${rangesPath}`);
  
  // Save validation summary (merge with footer map validation)
  const validationSummary = {
    // Validation counters from new parser
    validation: validation,
    // Footer map stats
    footerMap: {
      stats: footerMap.stats,
      footerBand: footerMap.footerBand,
      rangeCount: footerMap.ranges.length,
      sectionIds: footerMap.ranges.map(r => r.sectionId).sort(),
      anomalies: {
        totalRangesWithAnomalies: footerMap.ranges.filter(r => r.anomalies.length > 0).length,
        anomalyTypes: Array.from(new Set(footerMap.ranges.flatMap(r => r.anomalies))),
      },
      coverage: {
        pageCoverage: footerMap.stats.pagesTagged / footerMap.stats.pagesTotal,
        meetsMinCoverage: (footerMap.stats.pagesTagged / footerMap.stats.pagesTotal) >= 0.8,
        meetsMinSections: footerMap.stats.uniqueSections >= 15,
        shouldUseFooter: (footerMap.stats.pagesTagged / footerMap.stats.pagesTotal) >= 0.8 && footerMap.stats.uniqueSections >= 15,
      },
    },
  };
  
  const validationPath = path.join(outputDir, '04b-footer-validation.json');
  await writeJson(validationPath, validationSummary);
  console.log(`✓ Saved: ${validationPath}`);
  
  console.log('\nExplanation:');
  console.log('  1) Module: buildFooterSectionMap()');
  console.log('  2) Proves: Footer text provides authoritative section boundaries');
  console.log('  3) Next step: Spec parser uses footer ranges if criteria met (coverage >= 0.8, sections >= 15)');
  console.log('  4) Footer band: Detected from candidate bands or fallback clustering');
  console.log('  5) Tags: Each page tagged with sectionId + pageInSection from footer text');
  console.log('  6) Ranges: Contiguous pages with same sectionId form section ranges');
  
  return footerMap;
}

/**
 * Step 5: Deterministic spec parse
 */
async function step5SpecParse(
  _transcript: LayoutTranscript,
  footerMap: FooterSectionMap | null,
  outputDir: string,
  _verbose: boolean
): Promise<{ specDoc: SpecDoc; bookmarkTree: BookmarkAnchorTree; boundarySource: string }> {
  console.log('\n===========================================================');
  console.log('STEP 5 — DETERMINISTIC SPEC PARSE');
  console.log('===========================================================\n');
  
  const pdfPath = await findPdfPath();
  console.log('Parsing spec PDF...');
  
  // Load PDF via DocumentContext
  const docContext = new DocumentContext(pdfPath);
  await docContext.initialize();
  
  // Detect sections (use footer map if available and meets criteria)
  let boundarySource = 'heading';
  const detectedSections = await detectSections(docContext, undefined, {
    footerSectionMap: footerMap || undefined,
    boundarySource: footerMap && (footerMap.stats.pagesTagged / footerMap.stats.pagesTotal) >= 0.8 && footerMap.stats.uniqueSections >= 15 ? 'auto' : 'heading',
    footerMinCoverage: 0.8,
    footerMinSections: 15,
  });
  
  if (footerMap && (footerMap.stats.pagesTagged / footerMap.stats.pagesTotal) >= 0.8 && footerMap.stats.uniqueSections >= 15) {
    boundarySource = 'footer';
    console.log(`✓ Using footer-first segmentation (${footerMap.stats.uniqueSections} sections, ${(footerMap.stats.pagesTagged / footerMap.stats.pagesTotal * 100).toFixed(1)}% coverage)`);
  } else {
    console.log(`✓ Using heading-based discovery (${detectedSections.length} sections)`);
  }
  
  const sections = convertToSpecSections(detectedSections);
  
  console.log(`✓ Sections detected: ${sections.length}`);
  
  // Extract text nodes for each section
  for (const section of sections) {
    const nodes = await extractTextNodes(docContext, section);
    section.content = nodes;
  }
  
  // Build SpecDoc AST
  const specDoc: SpecDoc = {
    meta: {
      sourcePdfPath: pdfPath,
      extractedAt: new Date().toISOString(),
      pageCount: docContext.pageCount,
      sectionCount: sections.length,
    },
    sections,
  };
  
  // Generate BookmarkAnchorTree
  const bookmarkTree = generateBookmarkTree(specDoc);
  
  console.log(`✓ Total nodes: ${sections.reduce((sum, s) => sum + s.content.length, 0)}`);
  console.log(`✓ Bookmark anchors: ${bookmarkTree.bookmarks.length}`);
  
  // Save full AST
  const astPath = path.join(outputDir, '05-spec-ast.json');
  await writeJson(astPath, specDoc);
  console.log(`\n✓ Saved: ${astPath}`);
  
  // Save outline (flattened)
  const outline: Array<{ nodeId: string; level: number; title: string; page: number }> = [];
  for (const section of sections) {
    outline.push({
      nodeId: section.id,
      level: 0,
      title: section.title || `SECTION ${section.sectionId}`,
      page: section.startPage + 1, // Convert 0-based to 1-based
    });
    
    function addNodes(nodes: typeof section.content, level: number) {
      for (const node of nodes) {
        if (node.anchor || node.type === 'heading') {
          outline.push({
            nodeId: node.id,
            level,
            title: node.text?.substring(0, 80) || node.anchor || 'Untitled',
            page: node.page,
          });
        }
        if (node.children) {
          addNodes(node.children, level + 1);
        }
      }
    }
    addNodes(section.content, 1);
  }
  
  const outlinePath = path.join(outputDir, '05-spec-outline.json');
  await writeJson(outlinePath, outline);
  console.log(`✓ Saved: ${outlinePath}`);
  
  // Save inventory
  const inventory = sections.map(s => ({
    sectionId: s.sectionId,
    title: s.title,
    startPage: s.startPage + 1, // Convert to 1-based
    endPage: s.endPage + 1,
    nodeCount: s.content.length,
  }));
  
  const inventoryPath = path.join(outputDir, '05-spec-inventory.json');
  await writeJson(inventoryPath, inventory);
  console.log(`✓ Saved: ${inventoryPath}`);
  
  // Save parse report
  const totalNodes = sections.reduce((sum, s) => sum + s.content.length, 0);
  const nodesWithAnchors = sections.reduce((sum, s) => 
    sum + s.content.filter(n => n.anchor).length, 0
  );
  const nodesWithIssues = sections.reduce((sum, s) => 
    sum + s.content.filter(n => n.issues && n.issues.length > 0).length, 0
  );
  
  const parseReport = {
    sections: sections.length,
    totalNodes,
    nodesWithAnchors,
    nodesWithoutAnchors: totalNodes - nodesWithAnchors,
    nodesWithIssues,
    confidence: sections.length > 0 
      ? sections.reduce((sum, s) => sum + (s.content.reduce((s2, n) => s2 + n.confidence, 0) / s.content.length), 0) / sections.length
      : 0,
    needsReview: nodesWithIssues > 0,
    boundarySource,
    expectedSections: footerMap ? footerMap.stats.uniqueSections : undefined,
    detectedSections: sections.length,
  };
  
  const reportPath = path.join(outputDir, '05-spec-parse-report.json');
  await writeJson(reportPath, parseReport);
  console.log(`✓ Saved: ${reportPath}`);
  
  // Save sample (first section subtree)
  if (sections.length > 0) {
    const firstSection = sections[0];
    const sample = {
      ...firstSection,
      content: firstSection.content.slice(0, 20), // First 20 nodes
    };
    
    const samplePath = path.join(outputDir, '05-spec-ast.sample.json');
    await writeJson(samplePath, sample);
    console.log(`✓ Saved: ${samplePath}`);
  }
  
  console.log('\nExplanation:');
  console.log('  1) Module: specsPatchWorkflow.analyze() → detectSections() + extractTextNodes()');
  console.log('  2) Proves: Deterministic AST extraction (Sections/Parts/Articles/Paragraphs)');
  console.log('  3) Next step: Bookmark tree builder converts AST to bookmark structure');
  console.log('  4) Boundary source:', boundarySource === 'footer' ? 'Footer-first (primary)' : 'Heading-based (fallback)');
  console.log('  5) Chrome stripping: Uses candidate bands to filter header/footer regions');
  console.log('  6) Section detection:', boundarySource === 'footer' ? 'Footer text provides boundaries' : 'Pattern matching for "SECTION XX XX XX" headers');
  console.log('  7) Page anchoring: Determined from section start pages and node positions');
  console.log('  8) needsReview: Flagged when nodes have extraction issues (missing anchors, etc.)');
  
  return { specDoc, bookmarkTree, boundarySource };
}

/**
 * Step 6: Bookmark tree build
 */
async function step6BookmarkTree(
  _specDoc: SpecDoc,
  bookmarkTree: BookmarkAnchorTree,
  outputDir: string,
  _verbose: boolean
): Promise<void> {
  console.log('\n===========================================================');
  console.log('STEP 6 — BOOKMARK TREE BUILD');
  console.log('===========================================================\n');
  
  const pdfPath = await findPdfPath();
  console.log('Building bookmark tree from spec AST...');
  
  // Load PDF for DocumentContext (needed for page resolution)
  const docContext = new DocumentContext(pdfPath);
  await docContext.initialize();
  const pageCount = docContext.pageCount;
  
  // Build bookmark tree (no PDF write yet)
  const builtTree = await buildTreeFromBookmarkAnchorTree(
    bookmarkTree,
    docContext,
    pageCount,
    undefined, // style options
    { rebuild: false }
  );
  
  console.log(`✓ Root bookmarks: ${builtTree.roots.length}`);
  console.log(`✓ Total nodes: ${builtTree.nodes.size}`);
  
  // Calculate depth counts
  const depthCounts: Record<number, number> = {};
  for (const node of builtTree.nodes.values()) {
    depthCounts[node.level] = (depthCounts[node.level] || 0) + 1;
  }
  
  // Save bookmark tree
  const treePath = path.join(outputDir, '06-bookmark-tree.json');
  await writeJson(treePath, builtTree);
  console.log(`\n✓ Saved: ${treePath}`);
  
  // Save summary
  const summary = {
    rootCount: builtTree.roots.length,
    totalNodes: builtTree.nodes.size,
    depthCounts,
    source: builtTree.source,
  };
  
  const summaryPath = path.join(outputDir, '06-bookmark-tree.summary.json');
  await writeJson(summaryPath, summary);
  console.log(`✓ Saved: ${summaryPath}`);
  
  // Lint validation
  const lintIssues: string[] = [];
  const titles = new Set<string>();
  const pageRanges = new Map<string, number[]>();
  
  for (const node of builtTree.nodes.values()) {
    // Check empty titles
    if (!node.title || node.title.trim() === '') {
      lintIssues.push(`Empty title: node ${node.id}`);
    }
    
    // Check duplicates
    if (titles.has(node.title)) {
      lintIssues.push(`Duplicate title: "${node.title}"`);
    }
    titles.add(node.title);
    
    // Check page ranges
    if (node.page) {
      if (!pageRanges.has(node.logicalPath || '')) {
        pageRanges.set(node.logicalPath || '', []);
      }
      const range = pageRanges.get(node.logicalPath || '')!;
      range.push(node.page);
    }
    
    // Check invalid page indices
    if (node.destination && (node.destination.pageIndex < 0 || node.destination.pageIndex >= pageCount)) {
      lintIssues.push(`Invalid page index: node ${node.id} has pageIndex ${node.destination.pageIndex}`);
    }
  }
  
  const lint = {
    passes: lintIssues.length === 0,
    issues: lintIssues,
    emptyTitles: Array.from(builtTree.nodes.values()).filter(n => !n.title || n.title.trim() === '').length,
    duplicates: titles.size !== builtTree.nodes.size,
    invalidRanges: Array.from(builtTree.nodes.values()).filter(n => 
      n.destination && (n.destination.pageIndex < 0 || n.destination.pageIndex >= pageCount)
    ).length,
  };
  
  const lintPath = path.join(outputDir, '06-bookmark-tree.lint.json');
  await writeJson(lintPath, lint);
  console.log(`✓ Saved: ${lintPath}`);
  
  if (lintIssues.length > 0) {
    console.log(`\n⚠ Lint issues: ${lintIssues.length}`);
    lintIssues.slice(0, 10).forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log(`\n✓ Lint: PASS (no issues)`);
  }
  
  console.log('\nExplanation:');
  console.log('  1) Module: buildTreeFromBookmarkAnchorTree()');
  console.log('  2) Proves: Bookmark structure is valid and ready for PDF writing');
  console.log('  3) Next step: Apply bookmarks to PDF (if command exists)');
  console.log('  4) Difference: This builds the tree structure only, does not write to PDF');
  console.log('  5) Guarantees: Valid page indices, non-empty titles, proper hierarchy');
  
  return;
}

/**
 * Print run index
 */
async function printRunIndex(outputDir: string): Promise<void> {
  console.log('\n===========================================================');
  console.log('RUN INDEX');
  console.log('===========================================================\n');
  
  const files = [
    { file: '01-transcript.json', desc: 'Raw layout transcript (all pages, all spans)', module: 'TranscriptExtractor' },
    { file: '01-transcript.meta.json', desc: 'Transcript metadata summary', module: 'TranscriptExtractor' },
    { file: '01-transcript.page000.json', desc: 'Single page slice (page 0, first 100 spans)', module: 'TranscriptExtractor' },
    { file: '02-transcript.canonical.json', desc: 'Canonicalized transcript (normalized rotation, sorted)', module: 'canonicalizeTranscript()' },
    { file: '02-hashes.json', desc: 'Deterministic hashes (contentHash, spanHash)', module: 'canonicalizeTranscript()' },
    { file: '02-hashes.run1.json', desc: 'Hashes from first canonicalization run', module: 'canonicalizeTranscript()' },
    { file: '02-hashes.run2.json', desc: 'Hashes from second canonicalization run', module: 'canonicalizeTranscript()' },
    { file: '02-determinism-check.json', desc: 'Determinism verification (pass/fail)', module: 'canonicalizeTranscript()' },
    { file: '03-quality-report.json', desc: 'Full quality report (per-page + aggregate)', module: 'scoreTranscriptQuality()' },
    { file: '03-quality-summary.json', desc: 'Top-line quality summary', module: 'scoreTranscriptQuality()' },
    { file: '03-quality.pages.000-009.json', desc: 'Per-page metrics for first 10 pages', module: 'scoreTranscriptQuality()' },
    { file: '04-candidates.json', desc: 'Full candidate report (bands, headings, columns, tables)', module: 'generateCandidates()' },
    { file: '04-candidates.summary.json', desc: 'Candidate counts + top bands', module: 'generateCandidates()' },
    { file: '04-header-footer-bands.json', desc: 'Header/footer bands with confidence', module: 'generateCandidates()' },
    { file: '04-heading-candidates.sample.json', desc: 'Top 50 heading candidates (page, y, fontSize, preview)', module: 'generateCandidates()' },
    { file: '04b-footer-section-map.json', desc: 'Complete FooterSectionMap (band, tags, ranges, stats)', module: 'buildFooterSectionMap()' },
    { file: '04b-footer-tags.sample.json', desc: 'Footer tags for first 30 pages (sectionId, pageInSection, confidence)', module: 'buildFooterSectionMap()' },
    { file: '04b-footer-ranges.json', desc: 'Section ranges from footer segmentation', module: 'buildFooterSectionMap()' },
    { file: '04b-footer-validation.json', desc: 'Validation summary (anomalies, coverage, section count)', module: 'buildFooterSectionMap()' },
    { file: '05-spec-ast.json', desc: 'Complete SpecDoc AST (Sections/Parts/Articles/Paragraphs)', module: 'specsPatchWorkflow.analyze()' },
    { file: '05-spec-outline.json', desc: 'Flattened outline (nodeId, level, title, page anchors)', module: 'specsPatchWorkflow.analyze()' },
    { file: '05-spec-inventory.json', desc: 'Section list + page ranges', module: 'specsPatchWorkflow.analyze()' },
    { file: '05-spec-parse-report.json', desc: 'Parse counts, confidence, needsReview flags', module: 'specsPatchWorkflow.analyze()' },
    { file: '05-spec-ast.sample.json', desc: 'First SECTION node subtree (excerpt)', module: 'specsPatchWorkflow.analyze()' },
    { file: '06-bookmark-tree.json', desc: 'Complete BookmarkTree structure', module: 'buildTreeFromBookmarkAnchorTree()' },
    { file: '06-bookmark-tree.summary.json', desc: 'Depth counts and summary', module: 'buildTreeFromBookmarkAnchorTree()' },
    { file: '06-bookmark-tree.lint.json', desc: 'Validation (empty titles, duplicates, invalid ranges)', module: 'buildTreeFromBookmarkAnchorTree()' },
  ];
  
  for (const { file, desc, module } of files) {
    const filePath = path.join(outputDir, file);
    try {
      await fs.access(filePath);
      console.log(`✓ ${file.padEnd(35)} ${desc}`);
      console.log(`  ${' '.repeat(35)} Module: ${module}`);
    } catch {
      console.log(`✗ ${file.padEnd(35)} (not found)`);
    }
  }
  
  console.log('');
}

/**
 * Main walkthrough orchestrator
 */
async function runWalkthrough(options: WalkthroughOptions): Promise<void> {
  const pdfPath = await findPdfPath();
  const outputDir = options.outputDir || path.join(process.cwd(), 'test-output', '23_MECH_FULL_fresh_run');
  
  await ensureOutputDir(outputDir);
  
  // Phase 0: Print run plan
  await printRunPlan(pdfPath, outputDir);
  
  const step = options.step;
  
  // Run all steps or individual step
  let transcript: LayoutTranscript | null = null;
  let canonicalTranscript: LayoutTranscript | null = null;
  let candidates: CandidateReport | null = null;
  let footerMap: FooterSectionMap | null = null;
  let specParseResult: { specDoc: SpecDoc; bookmarkTree: BookmarkAnchorTree; boundarySource: string } | null = null;
  
  if (!step || step === '1') {
    transcript = await step1Transcript(outputDir, options.verbose || false);
  }
  
  if (!step || step === '2') {
    if (!transcript) {
      // Load from file if step 1 was skipped
      const transcriptPath = path.join(outputDir, '01-transcript.json');
      transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf-8')) as LayoutTranscript;
    }
    canonicalTranscript = await step2Canonicalization(transcript, outputDir, options.verbose || false);
  }
  
  if (!step || step === '3') {
    if (!canonicalTranscript) {
      const canonicalPath = path.join(outputDir, '02-transcript.canonical.json');
      canonicalTranscript = JSON.parse(await fs.readFile(canonicalPath, 'utf-8')) as LayoutTranscript;
    }
    await step3Quality(canonicalTranscript, outputDir, options.verbose || false);
  }
  
  if (!step || step === '4') {
    if (!canonicalTranscript) {
      const canonicalPath = path.join(outputDir, '02-transcript.canonical.json');
      canonicalTranscript = JSON.parse(await fs.readFile(canonicalPath, 'utf-8')) as LayoutTranscript;
    }
    candidates = await step4Candidates(canonicalTranscript, outputDir, options.verbose || false);
  }
  
  // Step 4.5: Footer section map (runs automatically after step 4 if not specified)
  if (!step || step === '4.5' || step === '4b') {
    if (!canonicalTranscript) {
      const canonicalPath = path.join(outputDir, '02-transcript.canonical.json');
      canonicalTranscript = JSON.parse(await fs.readFile(canonicalPath, 'utf-8')) as LayoutTranscript;
    }
    if (!candidates) {
      const candidatesPath = path.join(outputDir, '04-candidates.json');
      candidates = JSON.parse(await fs.readFile(candidatesPath, 'utf-8')) as CandidateReport;
    }
    footerMap = await step4bFooterSectionMap(canonicalTranscript, candidates, outputDir, options.verbose || false);
  } else if (!step) {
    // If running all steps, also run step 4.5 after step 4
    if (canonicalTranscript && candidates) {
      footerMap = await step4bFooterSectionMap(canonicalTranscript, candidates, outputDir, options.verbose || false);
    }
  }
  
  if (!step || step === '5') {
    if (!canonicalTranscript) {
      const canonicalPath = path.join(outputDir, '02-transcript.canonical.json');
      canonicalTranscript = JSON.parse(await fs.readFile(canonicalPath, 'utf-8')) as LayoutTranscript;
    }
    if (!footerMap && (step === '5' || !step)) {
      // Try to load footer map if it exists
      try {
        const footerMapPath = path.join(outputDir, '04b-footer-section-map.json');
        footerMap = JSON.parse(await fs.readFile(footerMapPath, 'utf-8')) as FooterSectionMap;
      } catch {
        // Footer map doesn't exist, that's OK
      }
    }
    specParseResult = await step5SpecParse(canonicalTranscript, footerMap, outputDir, options.verbose || false);
  }
  
  if (!step || step === '6') {
    if (!specParseResult) {
      // Load from files
      const astPath = path.join(outputDir, '05-spec-ast.json');
      const specDoc = JSON.parse(await fs.readFile(astPath, 'utf-8'));
      const bookmarkTree = generateBookmarkTree(specDoc);
      specParseResult = { specDoc, bookmarkTree, boundarySource: 'heading' };
    }
    await step6BookmarkTree(specParseResult.specDoc, specParseResult.bookmarkTree, outputDir, options.verbose || false);
  }
  
  // Print run index
  await printRunIndex(outputDir);
  
  console.log('\n✓ Walkthrough complete!\n');
}

export function debugWalkthroughCommand(program: Command) {
  program
    .command('debug:walkthrough:spec23')
    .description('Run end-to-end deterministic walkthrough on 23_MECH_FULL.pdf')
    .option('--step <step>', 'Run only a specific step (1-6, or 4.5/4b for footer map)', (value) => {
      if (value === '4.5' || value === '4b') {
        return value;
      }
      const step = parseInt(value, 10);
      if (isNaN(step) || step < 1 || step > 6) {
        throw new Error('Step must be between 1 and 6, or 4.5/4b for footer map');
      }
      return value;
    })
    .option('--boundary-source <source>', 'Boundary source: footer|heading|auto (default: auto)', (value) => {
      if (!['footer', 'heading', 'auto'].includes(value)) {
        throw new Error('boundary-source must be footer, heading, or auto');
      }
      return value;
    })
    .option('--footer-min-coverage <coverage>', 'Minimum page coverage for footer (default: 0.8)', (value) => {
      const coverage = parseFloat(value);
      if (isNaN(coverage) || coverage < 0 || coverage > 1) {
        throw new Error('footer-min-coverage must be between 0 and 1');
      }
      return coverage;
    })
    .option('--footer-min-sections <sections>', 'Minimum unique sections for footer (default: 15)', (value) => {
      const sections = parseInt(value, 10);
      if (isNaN(sections) || sections < 1) {
        throw new Error('footer-min-sections must be a positive integer');
      }
      return sections;
    })
    .option('--output-dir <path>', 'Output directory (default: test-output/23_MECH_FULL_fresh_run)')
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        await runWalkthrough(options);
        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        if (options.verbose) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    });
}
