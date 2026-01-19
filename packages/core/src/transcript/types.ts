/**
 * Core transcript data models
 * 
 * These types define the standardized layout transcript format that abstracts
 * away the underlying PDF extraction backend (PyMuPDF, PDF.js, etc.).
 */

/**
 * Complete layout transcript extracted from a PDF
 */
export interface LayoutTranscript {
  /** Path to the source PDF file */
  filePath: string;
  /** Extraction engine identifier (e.g., "pymupdf-1.24.1", "pdfjs-5.4.530") */
  extractionEngine: string;
  /** ISO timestamp of extraction */
  extractionDate: string;
  /** Pages in the transcript */
  pages: LayoutPage[];
  /** Transcript-level metadata */
  metadata: TranscriptMetadata;
}

/**
 * Transcript-level metadata
 */
export interface TranscriptMetadata {
  /** Total number of pages in the PDF */
  totalPages: number;
  /** Whether the PDF has a true text layer (not scanned) */
  hasTrueTextLayer: boolean;
  /** Deterministic content hash (excludes extractionDate) */
  contentHash?: string;
  /** Deterministic span structure hash (excludes extractionDate) */
  spanHash?: string;
}

/**
 * Single page in the transcript
 */
export interface LayoutPage {
  /** 1-based page number */
  pageNumber: number;
  /** 0-based page index */
  pageIndex: number;
  /** Page width in points (visual space after rotation) */
  width: number;
  /** Page height in points (visual space after rotation) */
  height: number;
  /** Page rotation (0, 90, 180, 270) - normalized to 0 after canonicalization */
  rotation: number;
  /** Text spans on this page */
  spans: LayoutSpan[];
  /** Optional images on this page */
  images?: LayoutImage[];
  /** Optional vector lines for table detection */
  lines?: LineSegment[];
  /** Page-level metadata */
  metadata: PageMetadata;
}

/**
 * Page-level metadata
 */
export interface PageMetadata {
  /** Character count extracted from this page */
  extractedCharCount: number;
  /** Whether this page has a text layer */
  hasTextLayer: boolean;
  /** Quality score (0.0-1.0) */
  qualityScore?: number;
}

/**
 * Text span with layout information
 */
export interface LayoutSpan {
  /** Raw text from PDF */
  text: string;
  /** Bounding box in PDF points, visual space: [x0, y0, x1, y1] */
  bbox: [x0: number, y0: number, x1: number, y1: number];
  /** Font name */
  fontName: string;
  /** Font size in points */
  fontSize: number;
  /** Font style flags */
  flags: {
    /** Bold text */
    isBold?: boolean;
    /** Italic text */
    isItalic?: boolean;
    /** Fixed-pitch/monospace font */
    isFixedPitch?: boolean;
  };
  /** Optional text color (hex format, e.g., "#000000") */
  color?: string;
  /** Unique span identifier within page */
  spanId: string;
  /** 0-based page index */
  pageIndex: number;
}

/**
 * Image on a page
 */
export interface LayoutImage {
  /** Image identifier */
  imageId: string;
  /** Bounding box: [x0, y0, x1, y1] */
  bbox: [x0: number, y0: number, x1: number, y1: number];
  /** Image width in points */
  width: number;
  /** Image height in points */
  height: number;
  /** 0-based page index */
  pageIndex: number;
}

/**
 * Vector line segment for table detection
 */
export interface LineSegment {
  /** Line identifier */
  lineId: string;
  /** Start point: [x, y] */
  start: [x: number, y: number];
  /** End point: [x, y] */
  end: [x: number, y: number];
  /** Line width in points */
  width?: number;
  /** Line color (hex format) */
  color?: string;
  /** 0-based page index */
  pageIndex: number;
}

/**
 * Quality metrics for transcript validation
 */
export interface QualityMetrics {
  /** Total character count extracted */
  extractedCharCount: number;
  /** Ratio of whitespace to total characters */
  whiteSpaceRatio: number;
  /** Count of replacement characters (U+FFFD) */
  replacementCharCount: number;
  /** Ordering sanity score (0.0-1.0) - measures if spans are in reading order */
  orderingSanityScore: number;
  /** Whether OCR is estimated to be needed */
  estimatedOCRNeeded: boolean;
  /** Overall confidence score (0.0-1.0) */
  confidenceScore: number;
}
