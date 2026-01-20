/**
 * Repetition metrics computation for abstract transcripts
 * 
 * Computes repetition rates across document and by band.
 */

import type { AbstractSpan, BandDefinitions } from './abstractTranscript.js';

/**
 * Compute repetition metrics for all spans
 */
export function computeRepetitionMetrics(
  pages: Array<{ spans: AbstractSpan[]; pageIndex: number; height: number }>,
  _tokenVault: unknown, // Unused but kept for future use
  totalPages: number,
  bands?: BandDefinitions
): void {
  // Collect all placeholder IDs and their occurrences
  const placeholderStats = new Map<string, {
    count: number;
    pages: Set<number>;
    bandCounts: { header: number; footer: number; body: number };
  }>();
  
  for (const page of pages) {
    const pageHeight = page.height;
    const headerYMax = bands?.header.yMax ?? pageHeight * 0.15;
    const footerYMin = bands?.footer.yMin ?? pageHeight * 0.85;
    
    for (const span of page.spans) {
      const placeholderId = span.placeholderId;
      
      if (!placeholderStats.has(placeholderId)) {
        placeholderStats.set(placeholderId, {
          count: 0,
          pages: new Set(),
          bandCounts: { header: 0, footer: 0, body: 0 },
        });
      }
      
      const stats = placeholderStats.get(placeholderId)!;
      stats.count++;
      stats.pages.add(page.pageIndex);
      
      // Determine which band this span is in
      const [, y0, , y1] = span.bbox;
      const spanCenterY = (y0 + y1) / 2;
      
      if (spanCenterY < headerYMax) {
        stats.bandCounts.header++;
      } else if (spanCenterY > footerYMin) {
        stats.bandCounts.footer++;
      } else {
        stats.bandCounts.body++;
      }
    }
  }
  
  // Update repetition metrics for each span
  for (const page of pages) {
    for (const span of page.spans) {
      const placeholderId = span.placeholderId;
      const stats = placeholderStats.get(placeholderId)!;
      
      const repeatCountDoc = stats.count;
      const repeatPages = stats.pages.size;
      const repeatRateDoc = totalPages > 0 ? repeatPages / totalPages : 0;
      
      // Compute band rates (normalize by total occurrences)
      const totalOccurrences = repeatCountDoc;
      const repeatRateByBand = {
        header: totalOccurrences > 0 ? stats.bandCounts.header / totalOccurrences : 0,
        footer: totalOccurrences > 0 ? stats.bandCounts.footer / totalOccurrences : 0,
        body: totalOccurrences > 0 ? stats.bandCounts.body / totalOccurrences : 0,
      };
      
      span.repetition = {
        repeatCountDoc,
        repeatRateDoc,
        repeatPages,
        repeatRateByBand,
      };
    }
  }
}
