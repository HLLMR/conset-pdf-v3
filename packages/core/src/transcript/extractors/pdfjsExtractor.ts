/**
 * PDF.js extractor implementation (fallback)
 * 
 * Uses PDF.js for transcript extraction when PyMuPDF is unavailable.
 * Lower confidence scores due to reduced bbox accuracy compared to PyMuPDF.
 */

import * as fs from 'fs/promises';
import type { TranscriptExtractor, ExtractOptions, EngineInfo } from '../interfaces.js';
import type { LayoutTranscript, LayoutPage, LayoutSpan } from '../types.js';

// Import pdfjs-dist
let pdfjsLib: any = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    try {
      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjsLib = pdfjsModule;
    } catch (error: any) {
      console.error('Failed to load pdfjs-dist:', error?.message);
      throw error;
    }
  }
  return pdfjsLib;
}

/**
 * PDF.js extractor implementation (fallback)
 */
export class PDFjsExtractor implements TranscriptExtractor {
  async extractTranscript(
    pdfPath: string,
    options?: ExtractOptions
  ): Promise<LayoutTranscript> {
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('pdfjs-dist not available');
    }
    
    const buffer = await fs.readFile(pdfPath);
    const data = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ 
      data,
      useSystemFonts: true,
      verbosity: 0
    });
    const pdf = await loadingTask.promise;
    
    const pageIndices = options?.pages || Array.from({ length: pdf.numPages }, (_, i) => i);
    const pages: LayoutPage[] = [];
    let totalChars = 0;
    
    for (const pageIdx of pageIndices) {
      if (pageIdx < 0 || pageIdx >= pdf.numPages) {
        continue;
      }
      
      const page = await pdf.getPage(pageIdx + 1);
      const rotation = page.rotate || 0;
      
      // Get viewports
      const viewportUnrotated = page.getViewport({ scale: 1.0, rotation: 0 });
      const viewportRotated = page.getViewport({ scale: 1.0, rotation: rotation });
      const textContent = await page.getTextContent();
      
      const width = viewportRotated.width;
      const height = viewportRotated.height;
      
      const spans: LayoutSpan[] = [];
      let spanIdx = 0;
      
      for (const item of textContent.items) {
        if ('str' in item && item.str && 'transform' in item) {
          const transform = item.transform;
          
          // Convert from PDF coordinates (bottom-left origin) to visual (top-left origin)
          const unrotatedX = transform[4];
          const unrotatedY = viewportUnrotated.height - transform[5];
          
          // Transform to visual (rotated) coordinates
          let visualX: number;
          let visualY: number;
          
          if (rotation === 90) {
            visualX = viewportUnrotated.height - unrotatedY;
            visualY = unrotatedX;
          } else if (rotation === 270) {
            visualX = viewportUnrotated.height - unrotatedY;
            visualY = unrotatedX;
          } else if (rotation === 180) {
            visualX = viewportUnrotated.width - unrotatedX;
            visualY = viewportUnrotated.height - unrotatedY;
          } else {
            visualX = unrotatedX;
            visualY = unrotatedY;
          }
          
          const itemWidth = item.width || 0;
          const itemHeight = item.height || 0;
          
          // Extract font information
          const fontName = item.fontName || 'unknown';
          const fontSize = item.height || 12; // Use height as approximate font size
          
          // PDF.js doesn't provide font flags directly, so we infer from font name
          const isBold = fontName.toLowerCase().includes('bold');
          const isItalic = fontName.toLowerCase().includes('italic') || fontName.toLowerCase().includes('oblique');
          const isFixedPitch = fontName.toLowerCase().includes('mono') || fontName.toLowerCase().includes('courier');
          
          const spanId = `page${pageIdx}_span${spanIdx}`;
          
          spans.push({
            text: item.str,
            bbox: [
              visualX,
              visualY,
              visualX + itemWidth,
              visualY + itemHeight,
            ],
            fontName,
            fontSize,
            flags: {
              isBold,
              isItalic,
              isFixedPitch,
            },
            spanId,
            pageIndex: pageIdx,
          });
          
          totalChars += item.str.length;
          spanIdx++;
        }
      }
      
      pages.push({
        pageNumber: pageIdx + 1,
        pageIndex: pageIdx,
        width,
        height,
        rotation,
        spans,
        metadata: {
          extractedCharCount: totalChars,
          hasTextLayer: spans.length > 0,
          qualityScore: spans.length > 0 ? 0.7 : 0.0, // Lower confidence for PDF.js
        },
      });
    }
    
    // Get PDF.js version
    const version = pdfjsLib?.version || 'unknown';
    
    return {
      filePath: pdfPath,
      extractionEngine: `pdfjs-${version}`,
      extractionDate: new Date().toISOString(),
      pages,
      metadata: {
        totalPages: pdf.numPages,
        hasTrueTextLayer: totalChars > 0,
      },
    };
  }
  
  getEngineInfo(): EngineInfo {
    return {
      name: 'pdfjs',
      version: '5.4.530+', // Will be determined at runtime
      capabilities: ['text', 'bbox'], // Limited capabilities compared to PyMuPDF
    };
  }
  
  supportsFeature(feature: string): boolean {
    // PDF.js has limited feature support
    return ['text', 'bbox'].includes(feature);
  }
}
