/**
 * Structured prompt builder for ML compiler
 * 
 * Builds deterministic, size-bounded prompts with summaries instead of
 * dumping full JSON transcripts.
 */

import type { AbstractTranscript } from '../abstraction/abstractTranscript.js';
import { generateCandidates } from '../candidates.js';
import type { LayoutTranscript } from '../types.js';

/**
 * Summaries for compiler input
 */
export interface CompilerSummaries {
  /** Band summaries */
  bands: {
    header?: { yMin: number; yMax: number; confidence: number; evidence: string };
    footer?: { yMin: number; yMax: number; confidence: number; evidence: string };
    body?: { yMin: number; yMax: number };
  };
  /** Font cluster summary */
  fontClusters: Array<{
    fontSize: number;
    count: number;
    likelyHeading: boolean;
  }>;
  /** Heading candidate summary */
  headingCandidates: {
    total: number;
    perPageDistribution: number[];
    sample: Array<{
      placeholderId: string;
      pageIndex: number;
      fontSize: number;
      isBold: boolean;
    }>;
  };
  /** Table candidate summary */
  tableCandidates: {
    count: number;
    pageIndices: number[];
    yRanges: Array<{ pageIndex: number; yMin: number; yMax: number }>;
  };
}

/**
 * Build structured prompt for compiler
 */
export function buildCompilerPrompt(
  abstractTranscript: AbstractTranscript,
  originalTranscript: LayoutTranscript | null,
  maxBytes: number = 50000 // ~50KB default limit
): string {
  const sections: string[] = [];
  
  // Section 1: Objective
  sections.push('=== OBJECTIVE ===');
  sections.push('Analyze the abstract transcript below and propose a document extraction profile.');
  sections.push('The abstract transcript uses placeholders (PLACEHOLDER_XXX) instead of actual text to preserve privacy.');
  sections.push('Each placeholder has shape features (tokenShape, charClassFlags, lengthBucket) that indicate the original text pattern.');
  sections.push('');
  
  // Section 2: Coordinate System
  sections.push('=== COORDINATE SYSTEM ===');
  sections.push(JSON.stringify(abstractTranscript.coordinateSystem, null, 2));
  sections.push('');
  
  // Section 3: Band Summaries
  if (abstractTranscript.bands) {
    sections.push('=== BAND DEFINITIONS ===');
    sections.push(JSON.stringify(abstractTranscript.bands, null, 2));
    sections.push('');
  }
  
  // Section 4: Summaries (if original transcript available)
  if (originalTranscript) {
    const summaries = computeSummaries(abstractTranscript, originalTranscript);
    
    sections.push('=== FONT CLUSTER SUMMARY ===');
    sections.push(JSON.stringify(summaries.fontClusters.slice(0, 10), null, 2)); // Top 10
    sections.push('');
    
    sections.push('=== HEADING CANDIDATE SUMMARY ===');
    sections.push(JSON.stringify(summaries.headingCandidates, null, 2));
    sections.push('');
    
    sections.push('=== TABLE CANDIDATE SUMMARY ===');
    sections.push(JSON.stringify(summaries.tableCandidates, null, 2));
    sections.push('');
  }
  
  // Section 5: Sampling Metadata
  if (abstractTranscript.sampling) {
    sections.push('=== SAMPLING METADATA ===');
    sections.push(`Sampled ${abstractTranscript.sampling.sampledPages} of ${abstractTranscript.sampling.totalPages} pages`);
    sections.push(`Strategy: ${abstractTranscript.sampling.samplingStrategy}`);
    sections.push('');
  }
  
  // Section 6: Sample Pages (truncated to fit budget)
  sections.push('=== SAMPLE PAGES ===');
  const samplePages = abstractTranscript.pages.slice(0, 5); // First 5 pages
  const sampleData = samplePages.map(page => ({
    pageNumber: page.pageNumber,
    pageIndex: page.pageIndex,
    width: page.width,
    height: page.height,
    spanCount: page.spans.length,
    lineCount: page.lines?.length ?? 0,
    sampleSpans: page.spans.slice(0, 20).map(span => ({
      placeholderId: span.placeholderId,
      tokenClass: span.tokenClass,
      tokenShape: span.tokenShape,
      lengthBucket: span.lengthBucket,
      bbox: span.bbox,
      fontSize: span.fontSize,
      isBold: span.flags.isBold,
      repetition: {
        repeatCountDoc: span.repetition.repeatCountDoc,
        repeatRateDoc: span.repetition.repeatRateDoc,
        repeatPages: span.repetition.repeatPages,
      },
    })),
    sampleLines: page.lines?.slice(0, 10).map(line => ({
      lineId: line.lineId,
      lineIndexWithinPage: line.lineIndexWithinPage,
      readingOrderIndex: line.readingOrderIndex,
      placeholderCount: line.placeholders.length,
    })),
  }));
  
  const sampleJson = JSON.stringify(sampleData, null, 2);
  const currentSize = sections.join('\n').length + sampleJson.length;
  
  if (currentSize > maxBytes) {
    // Truncate sample data
    const truncatedSample = sampleData.map(page => ({
      ...page,
      sampleSpans: page.sampleSpans.slice(0, 10), // Reduce to 10 spans
      sampleLines: page.sampleLines?.slice(0, 5), // Reduce to 5 lines
    }));
    sections.push(JSON.stringify(truncatedSample, null, 2));
  } else {
    sections.push(sampleJson);
  }
  sections.push('');
  
  // Section 7: Output Schema Reminder
  sections.push('=== OUTPUT REQUIREMENTS ===');
  sections.push('Return ONLY a valid JSON profile object matching the SpecProfile/SheetTemplateProfile/EquipmentSubmittalProfile interface.');
  sections.push('No markdown, no code blocks, no explanations - just the JSON object.');
  
  const prompt = sections.join('\n');
  
  // Final size check
  if (prompt.length > maxBytes) {
    // Last resort: further truncate
    return buildCompilerPrompt(abstractTranscript, originalTranscript, maxBytes * 0.8);
  }
  
  return prompt;
}

/**
 * Compute summaries from abstract transcript and original
 */
function computeSummaries(
  abstractTranscript: AbstractTranscript,
  originalTranscript: LayoutTranscript
): CompilerSummaries {
  const candidates = generateCandidates(originalTranscript);
  
  // Font clusters
  const fontClusters = (candidates.fontSizeClusters || [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(cluster => ({
      fontSize: cluster.fontSize,
      count: cluster.count,
      likelyHeading: cluster.fontSize >= 12 && cluster.count < 100, // Heuristic
    }));
  
  // Heading candidates
  const headingCandidates = candidates.headingCandidates || [];
  const perPageDistribution = new Array(abstractTranscript.metadata.totalPages).fill(0);
  for (const heading of headingCandidates) {
    if (heading.pageIndex < perPageDistribution.length) {
      perPageDistribution[heading.pageIndex]++;
    }
  }
  
  // Find corresponding placeholder IDs for sample headings
  const sampleHeadings = headingCandidates.slice(0, 20).map(heading => {
    // Find matching placeholder in abstract transcript
    const page = abstractTranscript.pages.find(p => p.pageIndex === heading.pageIndex);
    const matchingSpan = page?.spans.find(s => s.spanId === heading.span.spanId);
    
    return {
      placeholderId: matchingSpan?.placeholderId || 'UNKNOWN',
      pageIndex: heading.pageIndex,
      fontSize: heading.span.fontSize,
      isBold: heading.span.flags.isBold || false,
    };
  });
  
  // Table candidates
  const tableCandidates = candidates.tableCandidates || [];
  const tableYRanges = tableCandidates.map(table => {
    const [, y0, , y1] = table.bbox;
    return {
      pageIndex: table.pageIndex,
      yMin: y0,
      yMax: y1,
    };
  });
  
  return {
    bands: {
      header: abstractTranscript.bands?.header ? {
        yMin: abstractTranscript.bands.header.yMin,
        yMax: abstractTranscript.bands.header.yMax,
        confidence: 0.8, // Default confidence
        evidence: 'Detected from candidate analysis',
      } : undefined,
      footer: abstractTranscript.bands?.footer ? {
        yMin: abstractTranscript.bands.footer.yMin,
        yMax: abstractTranscript.bands.footer.yMax,
        confidence: 0.8,
        evidence: 'Detected from candidate analysis',
      } : undefined,
      body: abstractTranscript.bands?.body,
    },
    fontClusters,
    headingCandidates: {
      total: headingCandidates.length,
      perPageDistribution,
      sample: sampleHeadings,
    },
    tableCandidates: {
      count: tableCandidates.length,
      pageIndices: [...new Set(tableCandidates.map(t => t.pageIndex))],
      yRanges: tableYRanges,
    },
  };
}
