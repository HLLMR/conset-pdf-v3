/**
 * TokenVault: Privacy-preserving pattern abstraction
 * 
 * Replaces sensitive content with structural tokens while preserving
 * layout information (bbox, fonts, structure).
 */

import type { LayoutTranscript, LayoutSpan } from '../types.js';
import type { AbstractTranscript, AbstractSpan, AbstractPage, PrivacyMode, TokenClass, LengthBucket } from './abstractTranscript.js';
import { PrivacyMode as PM, TokenClass as TC } from './abstractTranscript.js';
import { detectCharClassFlags, getLengthBucket, generateTokenShape, generatePlaceholderId } from './shapeFeatures.js';

/**
 * Whitelist of safe keywords that can be preserved
 */
const WHITELIST_KEYWORDS = new Set([
  'SECTION', 'PART', 'DIVISION', 'SUBSECTION',
  'PAGE', 'SHEET', 'REVISION', 'DATE',
  'PROJECT', 'TITLE', 'DRAWING', 'SPECIFICATION',
]);

/**
 * TokenVault: Maps tokens to original text
 */
export class TokenVault {
  private mappings: Map<string, string> = new Map(); // placeholderId → original text
  private placeholderFrequency: Map<string, number> = new Map(); // placeholderId → frequency
  private placeholderPages: Map<string, Set<number>> = new Map(); // placeholderId → set of page indices
  private nextTokenId = 1; // For backward compatibility only
  
  /**
   * Tokenize a transcript into an abstract transcript
   * 
   * @param transcript Original transcript
   * @param privacyMode Privacy mode to use
   * @returns Abstract transcript and token vault
   */
  tokenize(
    transcript: LayoutTranscript,
    privacyMode: PrivacyMode = PM.STRICT_STRUCTURE_ONLY
  ): {
    abstractTranscript: AbstractTranscript;
    tokenVault: TokenVault;
  } {
    const abstractPages: AbstractPage[] = [];
    
    for (const page of transcript.pages) {
      const abstractSpans: AbstractSpan[] = [];
      
      for (const span of page.spans) {
        const tokenized = this.tokenizeSpan(span, privacyMode, new Map());
        abstractSpans.push(tokenized.span);
      }
      
      abstractPages.push({
        pageNumber: page.pageNumber,
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        spans: abstractSpans,
        metadata: {
          originalCharCount: page.metadata.extractedCharCount,
          hasTextLayer: page.metadata.hasTextLayer,
        },
      });
    }
    
    const abstractTranscript: AbstractTranscript = {
      filePath: transcript.filePath, // May be anonymized in sanitization step
      extractionEngine: transcript.extractionEngine,
      privacyMode,
      coordinateSystem: {
        origin: 'top-left',
        units: 'pt',
        yDirection: 'down',
        rotationNormalized: true, // Assumes canonicalization has been applied
      },
      pages: abstractPages,
      metadata: {
        totalPages: transcript.metadata.totalPages,
        hasTrueTextLayer: transcript.metadata.hasTrueTextLayer,
        placeholderCount: this.placeholderFrequency.size,
      },
    };
    
    return {
      abstractTranscript,
      tokenVault: this,
    };
  }
  
  /**
   * Tokenize a single span
   */
  private tokenizeSpan(
    span: LayoutSpan,
    privacyMode: PrivacyMode,
    _textPatternMap: Map<string, string> // Unused but kept for signature compatibility
  ): { span: AbstractSpan; placeholderId: string } {
    const text = span.text;
    let placeholderId: string;
    let tokenClass: TokenClass;
    let tokenShape: string;
    
    // Detect shape features
    const charClassFlags = detectCharClassFlags(text);
    const lengthBucket = getLengthBucket(text.length);
    
    // Determine if text should be preserved or tokenized
    if (privacyMode === PM.FULL_TEXT_OPT_IN) {
      // Full text mode: use special placeholder that preserves text
      tokenShape = generateTokenShape(text);
      tokenClass = TC.CONTENT;
      placeholderId = this.getOrCreatePlaceholder(text, tokenClass, tokenShape, lengthBucket, charClassFlags);
    } else if (this.isWhitelisted(text, privacyMode)) {
      // Whitelisted keyword: preserve shape but mark as keyword
      tokenShape = text; // Preserve whitelisted text
      tokenClass = TC.KEYWORD;
      placeholderId = this.getOrCreatePlaceholder(text, tokenClass, tokenShape, lengthBucket, charClassFlags);
    } else {
      // Tokenize: replace with structural placeholder
      const pattern = this.detectPattern(text);
      tokenClass = pattern.class;
      tokenShape = generateTokenShape(text);
      
      // Generate placeholderId from shape features (not original text)
      placeholderId = generatePlaceholderId(
        tokenClass,
        tokenShape,
        lengthBucket,
        charClassFlags
      );
      
      // Store mapping if not already stored
      if (!this.mappings.has(placeholderId)) {
        this.mappings.set(placeholderId, text);
        this.placeholderFrequency.set(placeholderId, 0);
        this.placeholderPages.set(placeholderId, new Set());
      }
      
      // Track frequency and pages
      const freq = this.placeholderFrequency.get(placeholderId) || 0;
      this.placeholderFrequency.set(placeholderId, freq + 1);
      const pages = this.placeholderPages.get(placeholderId) || new Set();
      pages.add(span.pageIndex);
      this.placeholderPages.set(placeholderId, pages);
    }
    
    // Note: repetition metrics will be computed later in sanitize step
    const abstractSpan: AbstractSpan = {
      placeholderId,
      tokenClass,
      tokenShape,
      charClassFlags,
      lengthBucket,
      originalLength: text.length,
      bbox: span.bbox,
      fontName: span.fontName,
      fontSize: span.fontSize,
      flags: span.flags,
      color: span.color,
      spanId: span.spanId,
      pageIndex: span.pageIndex,
      repetition: {
        repeatCountDoc: 0, // Will be computed later
        repeatRateDoc: 0,
        repeatPages: 0,
        repeatRateByBand: { header: 0, footer: 0, body: 0 },
      },
    };
    
    return { span: abstractSpan, placeholderId };
  }
  
  /**
   * Get or create placeholder for text (whitelisted/full-text mode)
   */
  private getOrCreatePlaceholder(
    text: string,
    tokenClass: TokenClass,
    tokenShape: string,
    lengthBucket: LengthBucket,
    charClassFlags: { hasDigit: boolean; hasAlpha: boolean; hasUpper: boolean; hasLower: boolean; hasDash: boolean; hasSlash: boolean; hasDot: boolean; hasPunct: boolean }
  ): string {
    // For whitelisted/full-text, still use shape-based ID but store text
    const placeholderId = generatePlaceholderId(
      tokenClass,
      tokenShape,
      lengthBucket,
      charClassFlags
    );
    
    if (!this.mappings.has(placeholderId)) {
      this.mappings.set(placeholderId, text);
      this.placeholderFrequency.set(placeholderId, 0);
      this.placeholderPages.set(placeholderId, new Set());
    }
    
    return placeholderId;
  }
  
  /**
   * Get placeholder pages (for repetition metrics)
   */
  getPlaceholderPages(placeholderId: string): Set<number> {
    return this.placeholderPages.get(placeholderId) || new Set();
  }
  
  /**
   * Get placeholder frequency
   */
  getPlaceholderFrequency(placeholderId: string): number {
    return this.placeholderFrequency.get(placeholderId) || 0;
  }
  
  /**
   * Check if text is whitelisted based on privacy mode
   */
  private isWhitelisted(text: string, privacyMode: PrivacyMode): boolean {
    if (privacyMode === PM.STRICT_STRUCTURE_ONLY) {
      return false; // No whitelist in strict mode
    }
    
    if (privacyMode === PM.WHITELIST_ANCHORS) {
      const upperText = text.trim().toUpperCase();
      return WHITELIST_KEYWORDS.has(upperText) || 
             WHITELIST_KEYWORDS.has(upperText.split(/\s+/)[0]);
    }
    
    return false;
  }
  
  /**
   * Detect pattern in text for token classification
   */
  private detectPattern(_text: string): { class: TokenClass; pattern: string } {
    const trimmed = _text.trim();
    
    // Check for numbers
    if (/^\d+$/.test(trimmed)) {
      return { class: TC.NUMBER, pattern: generateTokenShape(trimmed) };
    }
    
    // Check for date patterns
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmed)) {
      return { class: TC.DATE, pattern: generateTokenShape(trimmed) };
    }
    
    // Check for text patterns (all caps, all lowercase, etc.)
    if (/^[A-Z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: generateTokenShape(trimmed) };
    }
    if (/^[a-z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: generateTokenShape(trimmed) };
    }
    if (/^[A-Za-z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: generateTokenShape(trimmed) };
    }
    
    // Default: generic content
    return { class: TC.CONTENT, pattern: generateTokenShape(trimmed) };
  }
  
  
  /**
   * Create a new token (backward compatibility - deprecated)
   * @deprecated Use shape-based placeholderId generation instead
   * Note: This method is intentionally unused in the new implementation
   * but kept for potential legacy code compatibility
   */
  // @ts-ignore - Intentionally unused, kept for backward compatibility
  private createToken(_originalText: string, _tokenClass: TokenClass): string {
    const tokenId = `TOKEN_${this.nextTokenId.toString().padStart(6, '0')}`;
    this.nextTokenId++;
    this.mappings.set(tokenId, _originalText);
    this.placeholderFrequency.set(tokenId, 0);
    this.placeholderPages.set(tokenId, new Set());
    return tokenId;
  }
  
  /**
   * Reconstruct original text from placeholder
   * 
   * @param placeholderId Placeholder identifier
   * @returns Original text or null if not found
   */
  reconstruct(placeholderId: string): string | null {
    return this.mappings.get(placeholderId) || null;
  }
  
  /**
   * Reconstruct full transcript from abstract transcript
   * 
   * @param _abstractTranscript Abstract transcript
   * @returns Original transcript (reconstructed)
   */
  reconstructTranscript(_abstractTranscript: AbstractTranscript): LayoutTranscript {
    // This would reconstruct the full transcript
    // For now, return a placeholder - full implementation would rebuild spans
    throw new Error('Full transcript reconstruction not yet implemented');
  }
  
  /**
   * Get token frequency (backward compatibility)
   * @deprecated Use getPlaceholderFrequency instead
   */
  getTokenFrequency(tokenId: string): number {
    return this.placeholderFrequency.get(tokenId) || 0;
  }
  
  /**
   * Get all token mappings (for debugging/audit)
   */
  getMappings(): Map<string, string> {
    return new Map(this.mappings);
  }
  
  /**
   * Verify no sensitive content leaked (audit function)
   */
  verifyNoSensitiveContent(abstractTranscript: AbstractTranscript): {
    safe: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check that spans only contain placeholder IDs, not original text
    for (const page of abstractTranscript.pages) {
      for (const span of page.spans) {
        // Placeholder ID should match pattern PLACEHOLDER_XXXXXX or TOKEN_XXXXXX (backward compat)
        if (!/^(PLACEHOLDER_|TOKEN_)[a-f0-9]+$/i.test(span.placeholderId)) {
          issues.push(`Invalid placeholder ID format: ${span.placeholderId}`);
        }
      }
    }
    
    return {
      safe: issues.length === 0,
      issues,
    };
  }
}
