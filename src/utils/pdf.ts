import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';

// Import pdfjs-dist
let pdfjsLib: any = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    try {
      // Use legacy build for Node.js environments (pdfjs-dist 5.x requires this)
      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib = pdfjsModule;
      
      // Set up worker for Node.js - use node build which doesn't require worker
      // The legacy build for Node.js doesn't need worker configuration
      // We skip setting workerSrc as the legacy build handles this automatically
    } catch (error: any) {
      console.error('Failed to load pdfjs-dist:', error?.message);
      throw error;
    }
  }
  return pdfjsLib;
}

/**
 * Load a PDF document from a file path (for manipulation with pdf-lib)
 */
export async function loadPdf(path: string): Promise<PDFDocument> {
  const bytes = await fs.readFile(path);
  return PDFDocument.load(bytes);
}

/**
 * Save a PDF document to a file path
 */
export async function savePdf(doc: PDFDocument, path: string): Promise<void> {
  const bytes = await doc.save();
  await fs.writeFile(path, bytes);
}


/**
 * Get page count from a PDF file
 * 
 * LEGACY: This function loads PDFs directly and bypasses DocumentContext caching.
 * For merge-addenda, use DocumentContext.pageCount instead.
 * This is kept only as a fallback when DocumentContext is not available.
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      return 0;
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error) {
    return 0;
  }
}

/**
 * Copy pages from source to destination PDF
 */
export async function copyPages(
  sourceDoc: PDFDocument,
  destDoc: PDFDocument,
  pageIndexes: number[]
): Promise<void> {
  const pages = await destDoc.copyPages(sourceDoc, pageIndexes);
  pages.forEach((page) => {
    destDoc.addPage(page);
  });
}

/**
 * Text item with position information
 */
export interface TextItemWithPosition {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Page data with text items and positions
 */
export interface PageTextWithPositions {
  text: string;
  items: TextItemWithPosition[];
  pageWidth: number;
  pageHeight: number;
}

/**
 * Get page rotation and dimensions
 * 
 * LEGACY: This function loads PDFs directly and bypasses DocumentContext caching.
 * Used only in legacy fallback path of findSheetIdWithFullDetection.
 * For active merge-addenda path, use PageContext.getInfo() instead.
 */
export async function getPageInfo(
  pdfPath: string,
  pageIndex: number
): Promise<{
  rotation: number;
  width: number;
  height: number;
  isLandscape: boolean;
} | null> {
  try {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      return null;
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;
    
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      return null;
    }
    
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    
    return {
      rotation: page.rotate || 0,
      width: viewport.width,
      height: viewport.height,
      isLandscape: viewport.width > viewport.height,
    };
  } catch (error: any) {
    console.error('Error getting page info:', error?.message);
    return null;
  }
}

/**
 * Extract bookmarks from PDF
 * 
 * LEGACY: This function loads PDFs directly and bypasses DocumentContext caching.
 * Used only in legacy fallback path of findSheetIdWithFullDetection.
 * For active merge-addenda path, use DocumentContext.getBookmarks() instead.
 */
export async function extractBookmarks(pdfPath: string): Promise<Array<{
  title: string;
  pageIndex: number; // 0-based
}>> {
  try {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      return [];
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;
    
    const bookmarks: Array<{ title: string; pageIndex: number }> = [];
    
    // Try to get outline/bookmarks - pdfjs-dist may expose this differently
    // Check multiple possible properties/methods
    let outline: any = null;
    
    if (pdf.outline) {
      outline = pdf.outline;
    } else if (pdf.getOutline) {
      // Some versions expose getOutline() method
      try {
        outline = await pdf.getOutline();
      } catch (e) {
        // Ignore
      }
    } else if ((pdf as any)._pdfInfo?.outline) {
      outline = (pdf as any)._pdfInfo.outline;
    }
    
    if (!outline) {
      // Try accessing through catalog
      try {
        const catalog = await pdf.catalog;
        if (catalog && (catalog as any).getOutlines) {
          outline = await (catalog as any).getOutlines();
        } else if (catalog && (catalog as any).outlines) {
          outline = (catalog as any).outlines;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    if (outline) {
      const extractOutline = async (items: any[], parentPageIndex: number = 0): Promise<void> => {
        for (const item of items) {
          let currentPageIndex = parentPageIndex;
          
          // Get title - could be a string or need to be resolved
          let title: string | null = null;
          if (typeof item.title === 'string') {
            title = item.title;
          } else if (item.title && typeof item.title === 'object') {
            // Might be a PDF string object that needs decoding
            try {
              if (item.title.str !== undefined) {
                title = item.title.str;
              } else if (item.title.toString) {
                title = item.title.toString();
              }
            } catch (e) {
              // Ignore
            }
          }
          
          if (title) {
            // Get destination page
            let dest: any = null;
            if (item.dest) {
              dest = item.dest;
            } else if (item.destRef) {
              // Might need to resolve reference
              try {
                dest = await pdf.getDestination(item.destRef);
              } catch (e) {
                // Ignore
              }
            }
            
            if (dest) {
              // dest can be a string (named destination) or array
              if (Array.isArray(dest)) {
                const destRef = dest[0];
                if (destRef && typeof destRef === 'object' && destRef.num !== undefined) {
                  currentPageIndex = destRef.num - 1; // Convert to 0-based
                } else if (typeof destRef === 'number') {
                  currentPageIndex = destRef - 1;
                }
              } else if (typeof dest === 'string') {
                // Named destination - try to resolve
                try {
                  const resolvedDest = await pdf.getDestination(dest);
                  if (resolvedDest && Array.isArray(resolvedDest)) {
                    const pageRef = resolvedDest[0];
                    if (pageRef && typeof pageRef === 'object' && pageRef.num !== undefined) {
                      currentPageIndex = pageRef.num - 1;
                    }
                  }
                } catch (e) {
                  // Ignore
                }
              }
            } else if (item.url) {
              // External link, skip
              continue;
            }
            
            bookmarks.push({
              title,
              pageIndex: currentPageIndex,
            });
          }
          
          // Recursively process children
          if (item.items && item.items.length > 0) {
            await extractOutline(item.items, currentPageIndex);
          }
        }
      };
      
      await extractOutline(Array.isArray(outline) ? outline : [outline]);
    }
    
    return bookmarks;
  } catch (error: any) {
    // Silently fail - bookmarks are optional
    return [];
  }
}

/**
 * Extract text from a page with position information
 * 
 * LEGACY: This function loads PDFs directly and bypasses DocumentContext caching.
 * Used only in legacy fallback paths (findSheetIdWithFullDetection, bookmarks.ts).
 * For active merge-addenda path, use PageContext.getTextItems() instead.
 */
export async function extractPageTextWithPositions(
  pdfPath: string,
  pageIndex: number
): Promise<PageTextWithPositions | null> {
  try {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      return null;
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ 
      data,
      useSystemFonts: true,
      verbosity: 0
    });
    const pdf = await loadingTask.promise;
    
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      return null;
    }
    
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    
    const items: TextItemWithPosition[] = [];
    
    for (const item of textContent.items) {
      if ('str' in item && item.str && 'transform' in item) {
        const transform = item.transform;
        // PDF coordinates: origin at bottom-left, y increases upward
        // Convert to top-left origin (y increases downward)
        const x = transform[4];
        const y = viewport.height - transform[5]; // Flip Y coordinate
        const width = item.width || 0;
        const height = item.height || 0;
        
        items.push({
          str: item.str,
          x,
          y,
          width,
          height,
        });
      }
    }
    
    const text = items.map(item => item.str).join(' ');
    
    return {
      text,
      items,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    };
  } catch (error: any) {
    console.error('Error extracting text with positions:', error?.message);
    return null;
  }
}

/**
 * Title block bounds
 */
export interface TitleBlockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  detectedBy: 'lines' | 'text-cluster' | 'default';
}

/**
 * Extract line segments from PDF page
 * 
 * LEGACY: This function loads PDFs directly and bypasses DocumentContext caching.
 * Used only in legacy fallback path of autoDetectTitleBlock.
 * When using DocumentContext, line extraction is skipped (text clustering used instead).
 */
export async function extractPageLines(
  pdfPath: string,
  pageIndex: number
): Promise<Array<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHorizontal: boolean;
  isVertical: boolean;
  length: number;
}>> {
  try {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      return [];
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;
    
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      return [];
    }
    
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Get operator list (content stream)
    const ops = await page.getOperatorList();
    const lines: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isHorizontal: boolean;
      isVertical: boolean;
      length: number;
    }> = [];
    
    // Parse operators to find line drawing operations
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;
    let inPath = false;
    
    // PDF operators: m (moveTo), l (lineTo), S (stroke), s (close and stroke)
    const OPS = pdfjs.OPS || {};
    
    for (let i = 0; i < ops.fnArray.length; i++) {
      const op = ops.fnArray[i];
      const args = ops.argsArray[i];
      
      if (op === OPS.moveTo || op === 13) { // m operator
        currentX = args[0];
        currentY = viewport.height - args[1]; // Convert Y coordinate
        startX = currentX;
        startY = currentY;
        inPath = true;
      } else if (op === OPS.lineTo || op === 14) { // l operator
        const x2 = args[0];
        const y2 = viewport.height - args[1];
        
        const dx = x2 - currentX;
        const dy = y2 - currentY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const isHorizontal = Math.abs(dy) < 2; // Within 2 point tolerance
        const isVertical = Math.abs(dx) < 2;
        
        if (length > 10) { // Ignore very short lines
          lines.push({
            x1: currentX,
            y1: currentY,
            x2,
            y2,
            isHorizontal,
            isVertical,
            length,
          });
        }
        
        currentX = x2;
        currentY = y2;
      } else if (op === OPS.stroke || op === OPS.closeStroke || op === 15 || op === 16) {
        // Stroke operation - close path if needed
        if (inPath && (currentX !== startX || currentY !== startY)) {
          const dx = startX - currentX;
          const dy = startY - currentY;
          const length = Math.sqrt(dx * dx + dy * dy);
          const isHorizontal = Math.abs(dy) < 2;
          const isVertical = Math.abs(dx) < 2;
          
          if (length > 10) {
            lines.push({
              x1: currentX,
              y1: currentY,
              x2: startX,
              y2: startY,
              isHorizontal,
              isVertical,
              length,
            });
          }
        }
        inPath = false;
      }
    }
    
    return lines;
  } catch (error: any) {
    // Line extraction is optional, don't fail if it doesn't work
    return [];
  }
}

/**
 * Detect title block by text clustering around "SHEET" keyword
 */
function detectTitleBlockByTextCluster(
  pageData: PageTextWithPositions,
  verbose: boolean = false
): TitleBlockBounds | null {
  const { items, pageWidth, pageHeight } = pageData;
  
  // Find "SHEET" keyword
  const sheetItems = items.filter(item => 
    item.str.toUpperCase().includes('SHEET')
  );
  
  if (verbose) {
    console.log(`  [Title Block] Found ${sheetItems.length} "SHEET" keyword(s)`);
  }
  
  if (sheetItems.length === 0) {
    return null;
  }
  
  // Find text items near "SHEET" keyword
  const searchRadius = 300; // points
  const nearbyItems: TextItemWithPosition[] = [];
  
  for (const sheetItem of sheetItems) {
    if (verbose) {
      console.log(`  [Title Block] "SHEET" at (${sheetItem.x.toFixed(1)}, ${sheetItem.y.toFixed(1)})`);
    }
    
    for (const item of items) {
      const dx = Math.abs(item.x - sheetItem.x);
      const dy = Math.abs(item.y - sheetItem.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < searchRadius) {
        nearbyItems.push(item);
      }
    }
  }
  
  if (nearbyItems.length === 0) {
    return null;
  }
  
  // Calculate bounding box of title block text
  const xs = nearbyItems.map(item => item.x);
  const ys = nearbyItems.map(item => item.y);
  const widths = nearbyItems.map(item => item.width);
  const heights = nearbyItems.map(item => item.height);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs.map((x, i) => x + widths[i]));
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys.map((y, i) => y + heights[i]));
  
  // Add padding around detected region
  const padding = 20;
  
  const bounds: TitleBlockBounds = {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(pageWidth - (minX - padding), maxX - minX + padding * 2),
    height: Math.min(pageHeight - (minY - padding), maxY - minY + padding * 2),
    confidence: 0.7,
    detectedBy: 'text-cluster',
  };
  
  if (verbose) {
    console.log(`  [Title Block] Detected by text clustering: x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, w=${bounds.width.toFixed(1)}, h=${bounds.height.toFixed(1)}`);
  }
  
  return bounds;
}

/**
 * Auto-detect title block boundaries using multiple strategies
 * 
 * @param docContextOrPath - DocumentContext (preferred, single-load) or pdfPath string (legacy)
 * @param pageIndex - 0-based page index
 * @param verbose - Verbose logging
 */
export async function autoDetectTitleBlock(
  docContextOrPath: any, // DocumentContext | string
  pageIndex: number,
  verbose: boolean = false
): Promise<TitleBlockBounds> {
  // Support both DocumentContext (new) and pdfPath string (legacy)
  const isDocumentContext = docContextOrPath && typeof docContextOrPath.getPageContext === 'function';
  const docContext = isDocumentContext ? docContextOrPath : null;
  const pdfPath = isDocumentContext ? null : docContextOrPath as string;
  
  let pageData: PageTextWithPositions | null = null;
  let pageContext: any = null;
  
  if (docContext) {
    // Use DocumentContext (single-load path)
    await docContext.extractTextForPage(pageIndex);
    pageContext = await docContext.getPageContext(pageIndex);
    const textItems = pageContext.getTextItems();
    const pageText = pageContext.getText();
    pageData = {
      text: pageText,
      items: textItems,
      pageWidth: pageContext.pageWidth,
      pageHeight: pageContext.pageHeight,
    };
  } else {
    // Legacy path - load PDF
    pageData = await extractPageTextWithPositions(pdfPath!, pageIndex);
    if (!pageData) {
      // Default fallback
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        confidence: 0.3,
        detectedBy: 'default',
      };
    }
  }
  
  const { pageWidth, pageHeight } = pageData;
  const marginThreshold = Math.min(pageWidth, pageHeight) * 0.1; // 10% margin
  
  if (verbose) {
    console.log(`  [Title Block] Page ${pageIndex + 1}: ${pageWidth.toFixed(1)} x ${pageHeight.toFixed(1)} points`);
  }
  
  // Try line-based detection first
  try {
    // Note: extractPageLines still loads PDF - this is a limitation for now
    // Line extraction requires operator list parsing which isn't cached yet
    // For single-load compliance, we skip line detection when using DocumentContext
    // and rely on text clustering instead
    let lines: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isHorizontal: boolean;
      isVertical: boolean;
      length: number;
    }> = [];
    
    if (!docContext) {
      // Legacy path - extract lines (loads PDF)
      lines = await extractPageLines(pdfPath!, pageIndex);
    }
    // When using DocumentContext, skip line extraction to avoid PDF load
    // Text clustering will be used instead
    
    if (verbose) {
      console.log(`  [Title Block] Extracted ${lines.length} line segments`);
    }
    
    // Group lines by orientation
    const verticalLines = lines.filter(l => l.isVertical);
    const horizontalLines = lines.filter(l => l.isHorizontal);
    
    if (verbose) {
      console.log(`  [Title Block] Vertical: ${verticalLines.length}, Horizontal: ${horizontalLines.length}`);
    }
    
    // Find vertical lines near right edge
    const rightEdgeLines = verticalLines.filter(line => {
      const avgX = (line.x1 + line.x2) / 2;
      const distanceFromRight = pageWidth - avgX;
      return distanceFromRight <= marginThreshold && line.length > pageHeight * 0.3; // At least 30% of page height
    });
    
    // Find horizontal lines near bottom edge
    const bottomEdgeLines = horizontalLines.filter(line => {
      const avgY = (line.y1 + line.y2) / 2;
      const distanceFromBottom = pageHeight - avgY;
      return distanceFromBottom <= marginThreshold && line.length > pageWidth * 0.3; // At least 30% of page width
    });
    
    if (verbose) {
      console.log(`  [Title Block] Right edge lines: ${rightEdgeLines.length}, Bottom edge lines: ${bottomEdgeLines.length}`);
    }
    
    // Find parallel line groups (2-3 lines close together)
    const findParallelGroups = (lines: typeof verticalLines, threshold: number = 5) => {
      const groups: Array<{ lines: typeof lines; avgPos: number }> = [];
      
      for (const line of lines) {
        const pos = (line.x1 + line.x2) / 2;
        let foundGroup = false;
        
        for (const group of groups) {
          if (Math.abs(pos - group.avgPos) < threshold) {
            group.lines.push(line);
            group.avgPos = (group.avgPos * (group.lines.length - 1) + pos) / group.lines.length;
            foundGroup = true;
            break;
          }
        }
        
        if (!foundGroup) {
          groups.push({ lines: [line], avgPos: pos });
        }
      }
      
      return groups.filter(g => g.lines.length >= 2);
    };
    
    const rightEdgeGroups = findParallelGroups(rightEdgeLines);
    const bottomEdgeGroups = findParallelGroups(bottomEdgeLines);
    
    if (verbose) {
      console.log(`  [Title Block] Right edge groups: ${rightEdgeGroups.length}, Bottom edge groups: ${bottomEdgeGroups.length}`);
    }
    
    // If we found border lines, calculate title block bounds
    if (rightEdgeGroups.length > 0 || bottomEdgeGroups.length > 0) {
      // Find the rightmost vertical line group
      const rightmostGroup = rightEdgeGroups.sort((a, b) => b.avgPos - a.avgPos)[0];
      const titleBlockRight = rightmostGroup ? rightmostGroup.avgPos : pageWidth;
      
      // Find the bottommost horizontal line group
      const bottommostGroup = bottomEdgeGroups.sort((a, b) => {
        const aY = (a.lines[0].y1 + a.lines[0].y2) / 2;
        const bY = (b.lines[0].y1 + b.lines[0].y2) / 2;
        return aY - bY;
      })[0];
      const titleBlockBottom = bottommostGroup 
        ? (bottommostGroup.lines[0].y1 + bottommostGroup.lines[0].y2) / 2
        : pageHeight;
      
      // Estimate title block dimensions
      const estimatedWidth = pageWidth * 0.2;
      const estimatedHeight = pageHeight * 0.15;
      
      const bounds: TitleBlockBounds = {
        x: titleBlockRight - estimatedWidth,
        y: titleBlockBottom - estimatedHeight,
        width: estimatedWidth,
        height: estimatedHeight,
        confidence: 0.9,
        detectedBy: 'lines',
      };
      
      if (verbose) {
        console.log(`  [Title Block] Detected by lines: x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, w=${bounds.width.toFixed(1)}, h=${bounds.height.toFixed(1)}`);
      }
      
      return bounds;
    }
  } catch (error: any) {
    if (verbose) {
      console.log(`  [Title Block] Line detection failed: ${error?.message}`);
    }
  }
  
  // Fallback to text clustering
  const textBasedBounds = detectTitleBlockByTextCluster(pageData, verbose);
  if (textBasedBounds) {
    return textBasedBounds;
  }
  
  // Final fallback: intelligent default
  const isLandscape = pageWidth > pageHeight;
  const bounds: TitleBlockBounds = {
    x: isLandscape ? pageWidth * 0.75 : pageWidth * 0.7,
    y: pageHeight * 0.8,
    width: isLandscape ? pageWidth * 0.25 : pageWidth * 0.3,
    height: pageHeight * 0.2,
    confidence: 0.5,
    detectedBy: 'default',
  };
  
  if (verbose) {
    console.log(`  [Title Block] Using default bounds: x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, w=${bounds.width.toFixed(1)}, h=${bounds.height.toFixed(1)}`);
  }
  
  return bounds;
}
