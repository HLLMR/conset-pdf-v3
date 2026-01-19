/**
 * TokenVault: Privacy-preserving pattern abstraction
 * 
 * Replaces sensitive content with structural tokens while preserving
 * layout information (bbox, fonts, structure).
 */

import type { LayoutTranscript, LayoutSpan } from '../types.js';
import type { AbstractTranscript, AbstractSpan, AbstractPage, PrivacyMode, TokenClass } from './abstractTranscript.js';
import { PrivacyMode as PM, TokenClass as TC } from './abstractTranscript.js';

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
  private mappings: Map<string, string> = new Map(); // tokenId → original text
  private tokenFrequency: Map<string, number> = new Map(); // tokenId → frequency
  private nextTokenId = 1;
  
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
    let totalTokens = 0;
    
    // Track token patterns for repetition signals
    const textPatternMap = new Map<string, string>(); // text → tokenId
    
    for (const page of transcript.pages) {
      const abstractSpans: AbstractSpan[] = [];
      
      for (const span of page.spans) {
        const tokenized = this.tokenizeSpan(span, privacyMode, textPatternMap);
        abstractSpans.push(tokenized.span);
        totalTokens = Math.max(totalTokens, this.nextTokenId - 1);
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
      pages: abstractPages,
      metadata: {
        totalPages: transcript.metadata.totalPages,
        hasTrueTextLayer: transcript.metadata.hasTrueTextLayer,
        tokenCount: totalTokens,
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
    textPatternMap: Map<string, string>
  ): { span: AbstractSpan; tokenId: string } {
    const text = span.text;
    let tokenId: string;
    let tokenClass: TokenClass;
    
    // Determine if text should be preserved or tokenized
    if (privacyMode === PM.FULL_TEXT_OPT_IN) {
      // Full text mode: use special token that preserves text
      tokenId = this.getOrCreateToken(text, text);
      tokenClass = TC.CONTENT;
    } else if (this.isWhitelisted(text, privacyMode)) {
      // Whitelisted keyword: preserve
      tokenId = this.getOrCreateToken(text, text);
      tokenClass = TC.KEYWORD;
    } else {
      // Tokenize: replace with structural token
      const pattern = this.detectPattern(text);
      tokenClass = pattern.class;
      
      // Check if we've seen this pattern before
      if (textPatternMap.has(text)) {
        tokenId = textPatternMap.get(text)!;
        // Increment frequency
        const freq = this.tokenFrequency.get(tokenId) || 0;
        this.tokenFrequency.set(tokenId, freq + 1);
      } else {
        tokenId = this.createToken(text, tokenClass);
        textPatternMap.set(text, tokenId);
        this.tokenFrequency.set(tokenId, 1);
      }
    }
    
    const abstractSpan: AbstractSpan = {
      tokenId,
      tokenClass,
      originalLength: text.length,
      bbox: span.bbox,
      fontName: span.fontName,
      fontSize: span.fontSize,
      flags: span.flags,
      color: span.color,
      spanId: span.spanId,
      pageIndex: span.pageIndex,
      repetitionCount: this.tokenFrequency.get(tokenId),
    };
    
    return { span: abstractSpan, tokenId };
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
      return { class: TC.NUMBER, pattern: '9999' };
    }
    
    // Check for date patterns
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmed)) {
      return { class: TC.DATE, pattern: 'MM/DD/YYYY' };
    }
    
    // Check for text patterns (all caps, all lowercase, etc.)
    if (/^[A-Z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: 'AAAA' };
    }
    if (/^[a-z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: 'aaaa' };
    }
    if (/^[A-Za-z]+$/.test(trimmed)) {
      return { class: TC.TEXT_PATTERN, pattern: 'AaAa' };
    }
    
    // Default: generic content
    return { class: TC.CONTENT, pattern: 'XXXX' };
  }
  
  /**
   * Get or create a token for text
   */
  private getOrCreateToken(_text: string, originalText: string): string {
    // Check if we already have a token for this exact text
    for (const [tokenId, mappedText] of this.mappings.entries()) {
      if (mappedText === originalText) {
        return tokenId;
      }
    }
    
    // Create new token
    return this.createToken(originalText, TC.CONTENT);
  }
  
  /**
   * Create a new token
   */
  private createToken(originalText: string, _tokenClass: TokenClass): string {
    const tokenId = `TOKEN_${this.nextTokenId.toString().padStart(6, '0')}`;
    this.nextTokenId++;
    this.mappings.set(tokenId, originalText);
    return tokenId;
  }
  
  /**
   * Reconstruct original text from token
   * 
   * @param tokenId Token identifier
   * @returns Original text or null if not found
   */
  reconstruct(tokenId: string): string | null {
    return this.mappings.get(tokenId) || null;
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
   * Get token frequency
   */
  getTokenFrequency(tokenId: string): number {
    return this.tokenFrequency.get(tokenId) || 0;
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
    
    // Check that spans only contain token IDs, not original text
    for (const page of abstractTranscript.pages) {
      for (const span of page.spans) {
        // Token ID should match pattern TOKEN_XXXXXX
        if (!/^TOKEN_\d+$/.test(span.tokenId)) {
          issues.push(`Invalid token ID format: ${span.tokenId}`);
        }
      }
    }
    
    return {
      safe: issues.length === 0,
      issues,
    };
  }
}
