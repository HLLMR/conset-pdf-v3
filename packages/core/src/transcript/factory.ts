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
    const pymupdfExtractor = new PyMuPDFExtractor();
    const pdfjsExtractor = new PDFjsExtractor();
    return new CanonicalizingExtractor(pymupdfExtractor, pdfjsExtractor);
  }
  
  if (preferred === 'pdfjs') {
    return new CanonicalizingExtractor(new PDFjsExtractor());
  }
  
  // Default fallback chain: try PyMuPDF first, then PDF.js
  // Create both extractors, with PDF.js as fallback
  const pymupdfExtractor = new PyMuPDFExtractor();
  const pdfjsExtractor = new PDFjsExtractor();
  return new CanonicalizingExtractor(pymupdfExtractor, pdfjsExtractor);
}

/**
 * Wrapper extractor that applies canonicalization and handles fallback
 */
class CanonicalizingExtractor implements TranscriptExtractor {
  constructor(
    private extractor: TranscriptExtractor,
    private fallback?: TranscriptExtractor
  ) {}
  
  async extractTranscript(pdfPath: string, options?: any) {
    try {
      const rawTranscript = await this.extractor.extractTranscript(pdfPath, options);
      return canonicalizeTranscript(rawTranscript);
    } catch (error: any) {
      // If this is a PyMuPDF availability/runtime error and we have a fallback, use it
      if (this.fallback && isPyMuPDFUnavailableError(error)) {
        const rawTranscript = await this.fallback.extractTranscript(pdfPath, options);
        return canonicalizeTranscript(rawTranscript);
      }
      throw error;
    }
  }
  
  getEngineInfo() {
    return this.extractor.getEngineInfo();
  }
  
  supportsFeature(feature: string) {
    return this.extractor.supportsFeature(feature);
  }
}

function isPyMuPDFUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';

  const normalized = message.toLowerCase();
  return (
    normalized.includes('pymupdf not installed') ||
    normalized.includes('python runtime not found') ||
    normalized.includes('required for transcript extraction')
  );
}

/**
 * Check if PyMuPDF extractor is available
 * 
 * **Advanced/Expert API**: Use this to check extractor availability before creating
 * a transcript extractor. For most use cases, use createTranscriptExtractor() which
 * automatically selects the best available extractor (PyMuPDF primary, PDF.js fallback).
 * 
 * This function is useful for advanced users who need to:
 * - Check capabilities before processing
 * - Implement custom extractor selection logic
 * - Provide user feedback about available extraction backends
 * 
 * @returns True if PyMuPDF can be used (Python 3.8+ and PyMuPDF installed)
 * @example
 * ```typescript
 * import { isPyMuPDFAvailable, createTranscriptExtractor } from '@conset-pdf/core';
 * const hasPyMuPDF = await isPyMuPDFAvailable();
 * if (hasPyMuPDF) {
 *   console.log('Using high-fidelity PyMuPDF extractor');
 * }
 * const extractor = createTranscriptExtractor();
 * ```
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
 * **Advanced/Expert API**: Use this to check extractor availability before creating
 * a transcript extractor. For most use cases, use createTranscriptExtractor() which
 * automatically selects the best available extractor (PyMuPDF primary, PDF.js fallback).
 * 
 * This function is useful for advanced users who need to:
 * - Check capabilities before processing
 * - Implement custom extractor selection logic
 * - Provide user feedback about available extraction backends
 * 
 * @returns True if PDF.js can be used (pdfjs-dist package available)
 * @example
 * ```typescript
 * import { isPDFjsAvailable, createTranscriptExtractor } from '@conset-pdf/core';
 * const hasPDFjs = await isPDFjsAvailable();
 * if (!hasPDFjs) {
 *   console.warn('PDF.js not available - extraction may fail');
 * }
 * const extractor = createTranscriptExtractor();
 * ```
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
