/**
 * Abstract transcript types
 * 
 * Defines the structure for privacy-preserving abstract transcripts
 * where sensitive content is replaced with structural tokens.
 */

// Abstract transcript types (no imports needed)

/**
 * Privacy mode for abstraction
 */
export enum PrivacyMode {
  /** No literal text except whitelist */
  STRICT_STRUCTURE_ONLY = 'STRICT_STRUCTURE_ONLY',
  /** Allow safe keywords (SECTION, PART, etc.) */
  WHITELIST_ANCHORS = 'WHITELIST_ANCHORS',
  /** Explicit user override - full text allowed */
  FULL_TEXT_OPT_IN = 'FULL_TEXT_OPT_IN',
}

/**
 * Token class for categorization
 */
export enum TokenClass {
  /** Structural keyword (SECTION, PART, etc.) */
  KEYWORD = 'KEYWORD',
  /** Number or numeric pattern */
  NUMBER = 'NUMBER',
  /** Text pattern (AAAA, etc.) */
  TEXT_PATTERN = 'TEXT_PATTERN',
  /** Date pattern */
  DATE = 'DATE',
  /** Generic content token */
  CONTENT = 'CONTENT',
}

/**
 * Character class flags for shape detection
 */
export interface CharClassFlags {
  hasDigit: boolean;
  hasAlpha: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDash: boolean;
  hasSlash: boolean;
  hasDot: boolean;
  hasPunct: boolean;
}

/**
 * Length bucket for text classification
 */
export type LengthBucket = '1' | '2-3' | '4-6' | '7-12' | '13+';

/**
 * Repetition metrics for a placeholder
 */
export interface RepetitionMetrics {
  /** Count across full document (or sampled pages) */
  repeatCountDoc: number;
  /** Rate (0..1) = repeatPages / totalPages */
  repeatRateDoc: number;
  /** Count of pages in which this placeholder appears */
  repeatPages: number;
  /** Repetition rate by band */
  repeatRateByBand: {
    header: number;
    footer: number;
    body: number;
  };
}

/**
 * Abstract span (text replaced with placeholder)
 */
export interface AbstractSpan {
  /** Placeholder identifier (hash-based, stable for identical shapes) */
  placeholderId: string;
  /** Token class */
  tokenClass: TokenClass;
  /** Shape pattern (e.g., "AAAA", "9999", "AA-999", "99/99/9999") */
  tokenShape: string;
  /** Character class flags */
  charClassFlags: CharClassFlags;
  /** Length bucket */
  lengthBucket: LengthBucket;
  /** Original text length (preserved for layout) */
  originalLength: number;
  /** Bounding box in PDF points, visual space: [x0, y0, x1, y1] */
  bbox: [x0: number, y0: number, x1: number, y1: number];
  /** Font name */
  fontName: string;
  /** Font size in points */
  fontSize: number;
  /** Font style flags */
  flags: {
    isBold?: boolean;
    isItalic?: boolean;
    isFixedPitch?: boolean;
  };
  /** Optional text color */
  color?: string;
  /** Unique span identifier within page */
  spanId: string;
  /** 0-based page index */
  pageIndex: number;
  /** Repetition metrics */
  repetition: RepetitionMetrics;
  /** Reference to line containing this span (if line grouping enabled) */
  lineId?: string;
}

/**
 * Abstract line (grouped spans)
 */
export interface AbstractLine {
  /** Line identifier */
  lineId: string;
  /** 0-based page index */
  pageIndex: number;
  /** Line bounding box */
  lineBbox: [x0: number, y0: number, x1: number, y1: number];
  /** Line index within page (top-to-bottom order) */
  lineIndexWithinPage: number;
  /** Reading order index (stable order value) */
  readingOrderIndex: number;
  /** Placeholders in this line */
  placeholders: AbstractSpan[];
}

/**
 * Abstract page (spans with placeholders instead of text)
 */
export interface AbstractPage {
  /** 1-based page number */
  pageNumber: number;
  /** 0-based page index */
  pageIndex: number;
  /** Page width in points */
  width: number;
  /** Page height in points */
  height: number;
  /** Abstract spans (text replaced with placeholders) */
  spans: AbstractSpan[];
  /** Abstract lines (grouped spans) */
  lines?: AbstractLine[];
  /** Page-level metadata */
  metadata: {
    /** Character count (from original) */
    originalCharCount: number;
    /** Whether this page has a text layer */
    hasTextLayer: boolean;
  };
}

/**
 * Coordinate system metadata
 */
export interface CoordinateSystem {
  /** Origin position */
  origin: 'top-left';
  /** Units */
  units: 'pt';
  /** Y direction */
  yDirection: 'down';
  /** Whether rotation is normalized */
  rotationNormalized: boolean;
}

/**
 * Band definitions
 */
export interface BandDefinitions {
  /** Header band Y range */
  header: { yMin: number; yMax: number };
  /** Footer band Y range */
  footer: { yMin: number; yMax: number };
  /** Body band Y range (derived) */
  body: { yMin: number; yMax: number };
}

/**
 * Sampling metadata
 */
export interface SamplingMetadata {
  /** Number of pages sampled */
  sampledPages: number;
  /** Total pages in document */
  totalPages: number;
  /** Sampling strategy description */
  samplingStrategy: string;
}

/**
 * Abstract transcript (privacy-preserving)
 */
export interface AbstractTranscript {
  /** Path to the source PDF file (may be anonymized) */
  filePath: string;
  /** Extraction engine identifier */
  extractionEngine: string;
  /** Privacy mode used */
  privacyMode: PrivacyMode;
  /** Coordinate system metadata */
  coordinateSystem: CoordinateSystem;
  /** Band definitions (if available) */
  bands?: BandDefinitions;
  /** Sampling metadata (if transcript is sampled) */
  sampling?: SamplingMetadata;
  /** Abstract pages */
  pages: AbstractPage[];
  /** Transcript-level metadata */
  metadata: {
    /** Total number of pages */
    totalPages: number;
    /** Whether the PDF has a true text layer */
    hasTrueTextLayer: boolean;
    /** Placeholder count (unique placeholders) */
    placeholderCount: number;
  };
}
