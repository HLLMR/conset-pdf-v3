/**
 * Page region detection for specs documents
 * 
 * Auto-detects header, heading, body, and footer bands using text density analysis.
 * Deterministic algorithm based on y-coordinate histograms and token patterns.
 */

import type { TextItemWithPosition } from '../utils/pdf.js';

/**
 * Normalized page band (y coordinates 0-1, where 0 is top, 1 is bottom)
 */
export interface PageBand {
  name: 'header' | 'heading' | 'body' | 'footer';
  yMin: number; // Normalized (0-1)
  yMax: number; // Normalized (0-1)
}

/**
 * Detected page regions for a document
 */
export interface DetectedPageRegions {
  header: PageBand;
  heading: PageBand;
  body: PageBand;
  footer: PageBand;
  debug?: {
    samplePages: number;
    headerDensity?: number[];
    footerDensity?: number[];
    chosenHeaderRange?: { yMin: number; yMax: number };
    chosenFooterRange?: { yMin: number; yMax: number };
  };
}

/**
 * Text page with extracted items and dimensions
 */
export interface TextPage {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  items: TextItemWithPosition[];
}

/**
 * Detect page regions from sample pages using text density analysis
 * 
 * Algorithm:
 * 1. Build y-density histogram of text item coverage (normalized y)
 * 2. Identify top/bottom dense bands via:
 *    - Count of items per y-bin
 *    - Repetition of tokens (Page, dates, section codes, Project, etc.)
 * 3. Choose bands:
 *    - header: top ~0-12% refined by density
 *    - footer: bottom ~12% refined by density
 *    - heading: top ~0-30% (existing convention)
 *    - body: middle (header.max - footer.min)
 */
export function detectPageRegions(pages: TextPage[]): DetectedPageRegions {
  if (pages.length === 0) {
    // Default fallback regions
    return {
      header: { name: 'header', yMin: 0, yMax: 0.12 },
      heading: { name: 'heading', yMin: 0, yMax: 0.30 },
      body: { name: 'body', yMin: 0.12, yMax: 0.88 },
      footer: { name: 'footer', yMin: 0.88, yMax: 1.0 },
      debug: { samplePages: 0 },
    };
  }

  // Use first page dimensions as reference (assume consistent page size)
  const referencePage = pages[0];
  const pageHeight = referencePage.pageHeight;

  // Build y-density histogram
  // Normalize y coordinates: 0 = top, 1 = bottom
  // In PDF.js visual coordinates, y=0 is top, y increases downward
  const binCount = 100; // 100 bins for 0-1 range
  const density = new Array(binCount).fill(0);
  const tokenCounts = new Map<string, number>(); // Track common tokens per bin

  // Common footer/header tokens to look for
  const headerFooterTokens = [
    'page', 'project', 'date', 'section', 'specification',
    /\d{2}\s+\d{2}\s+\d{2}/, // Section code pattern
    /\d{1,2}\/\d{1,2}\/\d{4}/, // Date pattern
  ];

  for (const page of pages) {
    for (const item of page.items) {
      // Normalize y: item.y is top of item, item.y + item.height is bottom
      // In visual coordinates, y=0 is top
      const itemTop = item.y / pageHeight;
      const itemBottom = (item.y + item.height) / pageHeight;
      
      // Clamp to [0, 1]
      const normalizedTop = Math.max(0, Math.min(1, itemTop));
      const normalizedBottom = Math.max(0, Math.min(1, itemBottom));
      
      // Add to density bins
      const startBin = Math.floor(normalizedTop * binCount);
      const endBin = Math.ceil(normalizedBottom * binCount);
      
      for (let bin = startBin; bin < endBin && bin < binCount; bin++) {
        density[bin]++;
        
        // Check for header/footer tokens
        const itemText = item.str.toLowerCase().trim();
        for (const token of headerFooterTokens) {
          if (typeof token === 'string') {
            if (itemText.includes(token)) {
              const key = `${bin}:${token}`;
              tokenCounts.set(key, (tokenCounts.get(key) || 0) + 1);
            }
          } else if (token instanceof RegExp) {
            if (token.test(item.str)) {
              const key = `${bin}:regex`;
              tokenCounts.set(key, (tokenCounts.get(key) || 0) + 1);
            }
          }
        }
      }
    }
  }

  // Find header band: top 0-12% with high density
  const headerCandidateTop = 0;
  const headerCandidateBottom = 0.12;
  const headerStartBin = Math.floor(headerCandidateTop * binCount);
  const headerEndBin = Math.ceil(headerCandidateBottom * binCount);
  
  // Calculate average density in header region
  let headerDensitySum = 0;
  for (let bin = headerStartBin; bin < headerEndBin && bin < binCount; bin++) {
    headerDensitySum += density[bin];
  }
  const headerAvgDensity = headerDensitySum / (headerEndBin - headerStartBin);
  
  // Refine header range: find actual top boundary
  // Look for first bin with significant density
  let headerActualTop = headerCandidateTop;
  for (let bin = 0; bin < headerEndBin; bin++) {
    if (density[bin] > headerAvgDensity * 0.3) {
      headerActualTop = bin / binCount;
      break;
    }
  }
  
  // Refine header bottom: find where density drops
  let headerActualBottom = headerCandidateBottom;
  for (let bin = headerEndBin - 1; bin >= headerStartBin; bin--) {
    if (density[bin] > headerAvgDensity * 0.5) {
      headerActualBottom = (bin + 1) / binCount;
      break;
    }
  }
  
  // Find footer band: bottom 12% with high density
  const footerCandidateTop = 0.88;
  const footerCandidateBottom = 1.0;
  const footerStartBin = Math.floor(footerCandidateTop * binCount);
  const footerEndBin = binCount;
  
  // Calculate average density in footer region
  let footerDensitySum = 0;
  for (let bin = footerStartBin; bin < footerEndBin; bin++) {
    footerDensitySum += density[bin];
  }
  const footerAvgDensity = footerDensitySum / (footerEndBin - footerStartBin);
  
  // Refine footer range: find actual bottom boundary
  let footerActualBottom = footerCandidateBottom;
  for (let bin = footerEndBin - 1; bin >= footerStartBin; bin--) {
    if (density[bin] > footerAvgDensity * 0.3) {
      footerActualBottom = (bin + 1) / binCount;
      break;
    }
  }
  
  // Refine footer top: find where density starts
  let footerActualTop = footerCandidateTop;
  for (let bin = footerStartBin; bin < footerEndBin; bin++) {
    if (density[bin] > footerAvgDensity * 0.5) {
      footerActualTop = bin / binCount;
      break;
    }
  }
  
  // Ensure header doesn't overlap footer
  if (headerActualBottom > footerActualTop) {
    // Adjust: prefer footer if conflict
    headerActualBottom = Math.min(headerActualBottom, footerActualTop - 0.01);
  }
  
  // Body is the middle region
  const bodyTop = Math.max(headerActualBottom, 0.12);
  const bodyBottom = Math.min(footerActualTop, 0.88);
  
  return {
    header: {
      name: 'header',
      yMin: headerActualTop,
      yMax: headerActualBottom,
    },
    heading: {
      name: 'heading',
      yMin: 0,
      yMax: 0.30, // Existing convention
    },
    body: {
      name: 'body',
      yMin: bodyTop,
      yMax: bodyBottom,
    },
    footer: {
      name: 'footer',
      yMin: footerActualTop,
      yMax: footerActualBottom,
    },
    debug: {
      samplePages: pages.length,
      headerDensity: density.slice(headerStartBin, headerEndBin),
      footerDensity: density.slice(footerStartBin, footerEndBin),
      chosenHeaderRange: { yMin: headerActualTop, yMax: headerActualBottom },
      chosenFooterRange: { yMin: footerActualTop, yMax: footerActualBottom },
    },
  };
}
