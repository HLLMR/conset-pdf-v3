/**
 * Debug utility: Dump per-page text items with bounding boxes by vertical regions
 * 
 * Regions:
 * - header band: top 0–12% of page height
 * - heading band: top 0–30% of page height
 * - body band: 12–88% of page height
 * - footer band: 88–100% of page height
 */

import type { DocumentContext } from '../../analyze/documentContext.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';

export interface PageRegionDump {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  regions: {
    header: RegionText;
    heading: RegionText;
    body: RegionText;
    footer: RegionText;
  };
}

export interface RegionText {
  items: Array<{
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  concatenatedText: string;
}

/**
 * Dump text regions for a single page
 */
export async function dumpPageRegions(
  docContext: DocumentContext,
  pageIndex: number
): Promise<PageRegionDump> {
  await docContext.extractTextForPage(pageIndex);
  const pageContext = await docContext.getPageContext(pageIndex);
  
  const pageWidth = pageContext.pageWidth;
  const pageHeight = pageContext.pageHeight;
  const textItems = pageContext.getTextItems();
  
  // Define region boundaries (top-left origin, y increases downward)
  // In PDF.js visual coordinates, y=0 is at top, y increases downward
  const headerTop = 0;
  const headerBottom = pageHeight * 0.12;
  const headingTop = 0;
  const headingBottom = pageHeight * 0.30;
  const bodyTop = pageHeight * 0.12;
  const bodyBottom = pageHeight * 0.88;
  const footerTop = pageHeight * 0.88;
  const footerBottom = pageHeight;
  
  // Filter items by region
  // Note: y coordinate is top of text item in visual space
  const headerItems: TextItemWithPosition[] = [];
  const headingItems: TextItemWithPosition[] = [];
  const bodyItems: TextItemWithPosition[] = [];
  const footerItems: TextItemWithPosition[] = [];
  
  for (const item of textItems) {
    const itemCenterY = item.y + item.height / 2;
    
    // Header: top 0-12%
    if (itemCenterY >= headerTop && itemCenterY < headerBottom) {
      headerItems.push(item);
    }
    
    // Heading: top 0-30% (includes header)
    if (itemCenterY >= headingTop && itemCenterY < headingBottom) {
      headingItems.push(item);
    }
    
    // Body: 12-88%
    if (itemCenterY >= bodyTop && itemCenterY < bodyBottom) {
      bodyItems.push(item);
    }
    
    // Footer: 88-100%
    if (itemCenterY >= footerTop && itemCenterY < footerBottom) {
      footerItems.push(item);
    }
  }
  
  // Sort items by reading order (top to bottom, left to right)
  const sortByReadingOrder = (a: TextItemWithPosition, b: TextItemWithPosition) => {
    // Primary: y coordinate (top to bottom)
    if (Math.abs(a.y - b.y) > 5) {
      return a.y - b.y;
    }
    // Secondary: x coordinate (left to right)
    return a.x - b.x;
  };
  
  headerItems.sort(sortByReadingOrder);
  headingItems.sort(sortByReadingOrder);
  bodyItems.sort(sortByReadingOrder);
  footerItems.sort(sortByReadingOrder);
  
  // Convert to output format
  const toRegionText = (items: TextItemWithPosition[]): RegionText => ({
    items: items.map(item => ({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })),
    concatenatedText: items.map(item => item.str).join(' '),
  });
  
  return {
    pageIndex,
    pageWidth,
    pageHeight,
    regions: {
      header: toRegionText(headerItems),
      heading: toRegionText(headingItems),
      body: toRegionText(bodyItems),
      footer: toRegionText(footerItems),
    },
  };
}

/**
 * Dump text regions for multiple pages
 */
export async function dumpPagesRegions(
  docContext: DocumentContext,
  pageIndexes: number[]
): Promise<PageRegionDump[]> {
  const results: PageRegionDump[] = [];
  for (const pageIndex of pageIndexes) {
    results.push(await dumpPageRegions(docContext, pageIndex));
  }
  return results;
}
