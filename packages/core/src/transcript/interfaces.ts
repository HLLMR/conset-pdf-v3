/**
 * Transcript extractor interfaces
 * 
 * Defines the interface for PDF extraction backends that produce LayoutTranscript.
 */

import type { LayoutTranscript } from './types.js';

/**
 * Extraction engine information
 */
export interface EngineInfo {
  /** Engine name (e.g., "pymupdf", "pdfjs") */
  name: string;
  /** Engine version string */
  version: string;
  /** List of supported features */
  capabilities: string[];
}

/**
 * Options for transcript extraction
 */
export interface ExtractOptions {
  /** Optional page subset (0-based indices) */
  pages?: number[];
  /** Whether to include images */
  includeImages?: boolean;
  /** Whether to include vector lines */
  includeLines?: boolean;
  /** Minimum quality threshold to accept (0.0-1.0) */
  qualityThreshold?: number;
}

/**
 * Transcript extractor interface
 * 
 * All extraction backends (PyMuPDF, PDF.js, PDFium) implement this interface.
 */
export interface TranscriptExtractor {
  /**
   * Extract layout transcript from PDF
   * 
   * @param pdfPath Path to the PDF file
   * @param options Optional extraction options
   * @returns Layout transcript with spans, fonts, and layout information
   */
  extractTranscript(
    pdfPath: string,
    options?: ExtractOptions
  ): Promise<LayoutTranscript>;
  
  /**
   * Get information about the extraction engine
   * 
   * @returns Engine name, version, and capabilities
   */
  getEngineInfo(): EngineInfo;
  
  /**
   * Check if a feature is supported
   * 
   * @param feature Feature name (e.g., "tables", "lines", "images")
   * @returns Whether the feature is supported
   */
  supportsFeature(feature: string): boolean;
}
