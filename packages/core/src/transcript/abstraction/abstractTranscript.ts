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
 * Abstract span (text replaced with token)
 */
export interface AbstractSpan {
  /** Token identifier (e.g., "TOKEN_001") */
  tokenId: string;
  /** Token class */
  tokenClass: TokenClass;
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
  /** Repetition signal (how many times this token pattern appears) */
  repetitionCount?: number;
}

/**
 * Abstract page (spans with tokens instead of text)
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
  /** Abstract spans (text replaced with tokens) */
  spans: AbstractSpan[];
  /** Page-level metadata */
  metadata: {
    /** Character count (from original) */
    originalCharCount: number;
    /** Whether this page has a text layer */
    hasTextLayer: boolean;
  };
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
  /** Abstract pages */
  pages: AbstractPage[];
  /** Transcript-level metadata */
  metadata: {
    /** Total number of pages */
    totalPages: number;
    /** Whether the PDF has a true text layer */
    hasTrueTextLayer: boolean;
    /** Token count (unique tokens) */
    tokenCount: number;
  };
}
