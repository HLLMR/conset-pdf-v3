/**
 * Transcript extractor factory
 * 
 * Creates extractors with fallback chain: pymupdf → pdfjs
 * Applies canonicalization to all extracted transcripts.
 */

import type { TranscriptExtractor } from './interfaces.js';
import { PyMuPDFExtractor } from './extractors/pymupdfExtractor.js';
import { PDFjsExtractor } from './extractors/pdfjsExtractor.js';
import { canonicalizeTranscript } from './canonicalize.js';

/**
 * Preferred extractor type
 */
export type PreferredExtractor = 'pymupdf' | 'pdfjs';

/**
 * Create a transcript extractor with fallback chain
 * 
 * Fallback order:
 * 1. Preferred extractor (if specified)
 * 2. PyMuPDF (if available)
 * 3. PDF.js (always available as final fallback)
 * 
 * All transcripts are automatically canonicalized before being returned.
 * 
 * @param preferred Optional preferred extractor type
 * @returns First available extractor in fallback chain
 */
export function createTranscriptExtractor(
  preferred?: PreferredExtractor
): TranscriptExtractor {
  // Try preferred extractor first
  if (preferred === 'pymupdf') {
    try {
      return new CanonicalizingExtractor(new PyMuPDFExtractor());
    } catch (error) {
      // Fall through to default chain
    }
  }
  
  if (preferred === 'pdfjs') {
    return new CanonicalizingExtractor(new PDFjsExtractor());
  }
  
  // Default fallback chain: try PyMuPDF first, then PDF.js
  try {
    return new CanonicalizingExtractor(new PyMuPDFExtractor());
  } catch (error) {
    // PyMuPDF not available, use PDF.js
    return new CanonicalizingExtractor(new PDFjsExtractor());
  }
}

/**
 * Wrapper extractor that applies canonicalization
 */
class CanonicalizingExtractor implements TranscriptExtractor {
  constructor(private extractor: TranscriptExtractor) {}
  
  async extractTranscript(pdfPath: string, options?: any) {
    const rawTranscript = await this.extractor.extractTranscript(pdfPath, options);
    return canonicalizeTranscript(rawTranscript);
  }
  
  getEngineInfo() {
    return this.extractor.getEngineInfo();
  }
  
  supportsFeature(feature: string) {
    return this.extractor.supportsFeature(feature);
  }
}

/**
 * Check if PyMuPDF extractor is available
 * 
 * @returns True if PyMuPDF can be used
 */
export async function isPyMuPDFAvailable(): Promise<boolean> {
  try {
    const extractor = new PyMuPDFExtractor();
    // Try to get engine info (this will fail if Python/PyMuPDF not available)
    extractor.getEngineInfo();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if PDF.js extractor is available
 * 
 * @returns True if PDF.js can be used
 */
export async function isPDFjsAvailable(): Promise<boolean> {
  try {
    const extractor = new PDFjsExtractor();
    extractor.getEngineInfo();
    return true;
  } catch {
    return false;
  }
}
