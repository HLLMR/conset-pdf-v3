/**
 * Build footer section index with fast sampling strategy
 * 
 * Implements 2-pass approach:
 * 1. Detect regions using samples (first N pages + evenly spaced)
 * 2. Scan all pages BUT only extract footer-band items (cheap)
 */

import type { DocumentContext } from '../analyze/documentContext.js';
import type { TextPage } from '../text/pageRegions.js';
import { detectPageRegions } from '../text/pageRegions.js';
import { buildFooterSectionIndex, extractFooterTextItems } from './footerSectionMap.js';
import type { DetectedPageRegions } from '../text/pageRegions.js';

/**
 * Options for footer index building
 */
export interface FooterIndexOptions {
  /** Strategy for section start resolution */
  sectionStartStrategy?: 'footer' | 'heading' | 'hint';
  /** Number of sample pages for region detection (default: 30) */
  sampleCount?: number;
  /** Whether to extract only footer items for full scan (default: true for performance) */
  footerOnlyExtraction?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Extract text page with optional footer-only filtering
 */
async function extractTextPage(
  docContext: DocumentContext,
  pageIndex: number,
  regions?: DetectedPageRegions,
  footerOnly: boolean = false
): Promise<TextPage> {
  await docContext.extractTextForPage(pageIndex);
  const pageContext = await docContext.getPageContext(pageIndex);
  
  let items = pageContext.getTextItems();
  
  // If footer-only and regions provided, filter to footer band
  if (footerOnly && regions) {
    items = extractFooterTextItems(
      {
        pageIndex,
        pageWidth: pageContext.pageWidth,
        pageHeight: pageContext.pageHeight,
        items,
      },
      regions
    );
  }
  
  return {
    pageIndex,
    pageWidth: pageContext.pageWidth,
    pageHeight: pageContext.pageHeight,
    items,
  };
}

/**
 * Build footer section index with fast sampling
 * 
 * Strategy:
 * 1. Sample first N pages (default 30) for region detection
 * 2. Detect regions from samples
 * 3. Full scan: extract all pages but only process footer items
 */
export async function buildFooterSectionIndexFast(
  docContext: DocumentContext,
  pageCount: number,
  options: FooterIndexOptions = {}
): Promise<{
  footerIndex: { firstPageBySection: Record<string, number>; occurrences: Record<string, number[]> };
  regions: DetectedPageRegions;
}> {
  const {
    sampleCount = 30,
    verbose = false,
  } = options;
  
  if (verbose) {
    console.log(`  Building footer section index (pageCount=${pageCount}, sampleCount=${sampleCount})...`);
  }
  
  // PASS 1: Sample pages for region detection
  const samplePages: TextPage[] = [];
  const sampleIndices = new Set<number>();
  
  // Sample first N pages
  for (let i = 0; i < Math.min(sampleCount, pageCount); i++) {
    sampleIndices.add(i);
  }
  
  // Sample evenly spaced pages from remaining
  if (pageCount > sampleCount) {
    const remaining = pageCount - sampleCount;
    const step = Math.max(1, Math.floor(remaining / sampleCount));
    for (let i = sampleCount; i < pageCount; i += step) {
      sampleIndices.add(i);
    }
  }
  
  const sortedSamples = Array.from(sampleIndices).sort((a, b) => a - b);
  
  if (verbose) {
    console.log(`  Sampling ${sortedSamples.length} pages for region detection...`);
  }
  
  for (const pageIndex of sortedSamples) {
    samplePages.push(await extractTextPage(docContext, pageIndex));
  }
  
  // Detect regions from samples
  const regions = detectPageRegions(samplePages);
  
  if (verbose) {
    console.log(`  Detected regions: header=${regions.header.yMin.toFixed(2)}-${regions.header.yMax.toFixed(2)}, footer=${regions.footer.yMin.toFixed(2)}-${regions.footer.yMax.toFixed(2)}`);
  }
  
  // PASS 2: Full scan for footer index
  // Note: We extract all text items per page (DocumentContext caches them),
  // but buildFooterSectionIndex will filter to footer band items internally
  if (verbose) {
    console.log(`  Scanning all ${pageCount} pages for footer section codes...`);
  }
  
  const allPages: TextPage[] = [];
  for (let i = 0; i < pageCount; i++) {
    // Extract full page (items are cached by DocumentContext)
    const page = await extractTextPage(docContext, i);
    allPages.push(page);
    
    if (verbose && (i + 1) % 50 === 0) {
      console.log(`    Processed ${i + 1}/${pageCount} pages...`);
    }
  }
  
  // Build footer index
  const footerIndex = buildFooterSectionIndex(allPages, regions);
  
  if (verbose) {
    const sectionCount = Object.keys(footerIndex.firstPageBySection).length;
    console.log(`  Found ${sectionCount} unique section codes in footers`);
  }
  
  return {
    footerIndex,
    regions,
  };
}
