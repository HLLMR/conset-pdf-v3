/**
 * Chrome removal for spec extraction
 * 
 * Removes header/footer bands using candidate detection.
 */

import type { LayoutTranscript } from '../../transcript/types.js';
import { generateCandidates } from '../../transcript/candidates.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';

/**
 * Remove chrome (header/footer) from text items
 * 
 * @param textItems Text items to filter
 * @param pageHeight Page height in points
 * @param transcript Transcript for candidate detection
 * @param pageIndex Page index
 * @returns Filtered text items (chrome removed)
 */
export function removeChrome(
  textItems: TextItemWithPosition[],
  pageHeight: number,
  transcript: LayoutTranscript,
  pageIndex: number
): TextItemWithPosition[] {
  const candidates = generateCandidates(transcript);
  const headerBands = candidates.headerBands || [];
  const footerBands = candidates.footerBands || [];
  
  // Define chrome regions (top 15% and bottom 15% by default)
  const headerThreshold = pageHeight * 0.15;
  const footerThreshold = pageHeight * 0.85;
  
  // Refine thresholds based on detected bands
  let actualHeaderThreshold = headerThreshold;
  let actualFooterThreshold = footerThreshold;
  
  // Find header band for this page
  for (const band of headerBands) {
    if (band.pageIndices.includes(pageIndex)) {
      actualHeaderThreshold = Math.max(actualHeaderThreshold, band.y + 20); // Add padding
    }
  }
  
  // Find footer band for this page
  for (const band of footerBands) {
    if (band.pageIndices.includes(pageIndex)) {
      actualFooterThreshold = Math.min(actualFooterThreshold, band.y - 20); // Add padding
    }
  }
  
  // Filter out items in chrome regions
  return textItems.filter(item => {
    const itemCenterY = item.y + (item.height / 2);
    return itemCenterY >= actualHeaderThreshold && itemCenterY <= actualFooterThreshold;
  });
}
