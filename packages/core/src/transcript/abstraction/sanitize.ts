/**
 * Sanitization for compiler
 * 
 * Provides deterministic pseudonymization and sampling strategies
 * for privacy-preserving transcript processing.
 */

import { createHmac } from 'crypto';
import type { LayoutTranscript, LayoutPage, LayoutSpan } from '../types.js';
import type { AbstractTranscript } from './abstractTranscript.js';
import { TokenVault } from './tokenVault.js';
import { PrivacyMode } from './abstractTranscript.js';
import { generateCandidates } from '../candidates.js';

/**
 * Sanitization options
 */
export interface SanitizeOptions {
  /** Privacy mode */
  privacyMode?: PrivacyMode;
  /** Local salt for deterministic pseudonymization */
  salt?: string;
  /** Sampling strategy */
  sampling?: {
    /** Include header/footer bands */
    includeChromeBands?: boolean;
    /** Include headings */
    includeHeadings?: boolean;
    /** Include tables */
    includeTables?: boolean;
    /** Maximum pages to sample (0 = all pages) */
    maxPages?: number;
  };
}

/**
 * Sanitize a transcript for compiler use
 * 
 * @param transcript Original transcript
 * @param options Sanitization options
 * @returns Sanitized abstract transcript and token vault
 */
export function sanitizeTranscript(
  transcript: LayoutTranscript,
  options: SanitizeOptions = {}
): {
  abstractTranscript: AbstractTranscript;
  tokenVault: TokenVault;
} {
  const privacyMode = options.privacyMode || PrivacyMode.STRICT_STRUCTURE_ONLY;
  const salt = options.salt || 'default-salt';
  
  // Apply sampling if specified
  let transcriptToTokenize = transcript;
  if (options.sampling) {
    transcriptToTokenize = applySampling(transcript, options.sampling);
  }
  
  // Anonymize file path
  const anonymizedPath = pseudonymizePath(transcript.filePath, salt);
  
  // Create anonymized transcript for tokenization
  const anonymizedTranscript: LayoutTranscript = {
    ...transcriptToTokenize,
    filePath: anonymizedPath,
  };
  
  // Tokenize
  const tokenVault = new TokenVault();
  const { abstractTranscript } = tokenVault.tokenize(anonymizedTranscript, privacyMode);
  
  return {
    abstractTranscript,
    tokenVault,
  };
}

/**
 * Apply sampling strategy to transcript
 */
function applySampling(
  transcript: LayoutTranscript,
  sampling: NonNullable<SanitizeOptions['sampling']>
): LayoutTranscript {
  const candidates = generateCandidates(transcript);
  const sampledPages: LayoutPage[] = [];
  
  // Determine which pages to include
  const pagesToInclude = new Set<number>();
  
  if (sampling.maxPages && sampling.maxPages > 0) {
    // Sample evenly across document
    const step = Math.max(1, Math.floor(transcript.pages.length / sampling.maxPages));
    for (let i = 0; i < transcript.pages.length; i += step) {
      pagesToInclude.add(i);
    }
  } else {
    // Include all pages
    transcript.pages.forEach((_, idx) => pagesToInclude.add(idx));
  }
  
  // Filter spans based on sampling strategy
  for (const page of transcript.pages) {
    if (!pagesToInclude.has(page.pageIndex)) {
      continue;
    }
    
    const filteredSpans: LayoutSpan[] = [];
    
    for (const span of page.spans) {
      let include = false;
      
      // Check if span is in chrome bands (header/footer)
      if (sampling.includeChromeBands) {
        const headerBands = candidates.headerBands || [];
        const footerBands = candidates.footerBands || [];
        const [, y0, , y1] = span.bbox;
        const spanCenterY = (y0 + y1) / 2;
        
        for (const band of headerBands) {
          if (Math.abs(spanCenterY - band.y) < 20) {
            include = true;
            break;
          }
        }
        if (!include) {
          for (const band of footerBands) {
            if (Math.abs(spanCenterY - band.y) < 20) {
              include = true;
              break;
            }
          }
        }
      }
      
      // Check if span is a heading
      if (!include && sampling.includeHeadings) {
        const headingCandidates = candidates.headingCandidates || [];
        for (const heading of headingCandidates) {
          if (heading.span.spanId === span.spanId) {
            include = true;
            break;
          }
        }
      }
      
      // Check if span is in a table
      if (!include && sampling.includeTables) {
        const tableCandidates = candidates.tableCandidates || [];
        for (const table of tableCandidates) {
          if (table.pageIndex === page.pageIndex) {
            const [x0, y0, x1, y1] = span.bbox;
            const [tx0, ty0, tx1, ty1] = table.bbox;
            if (x0 >= tx0 && x1 <= tx1 && y0 >= ty0 && y1 <= ty1) {
              include = true;
              break;
            }
          }
        }
      }
      
      if (include) {
        filteredSpans.push(span);
      }
    }
    
    sampledPages.push({
      ...page,
      spans: filteredSpans,
    });
  }
  
  return {
    ...transcript,
    pages: sampledPages,
  };
}

/**
 * Pseudonymize file path using HMAC
 */
function pseudonymizePath(filePath: string, salt: string): string {
  const hmac = createHmac('sha256', salt);
  hmac.update(filePath);
  const hash = hmac.digest('hex').substring(0, 16);
  return `anonymized_${hash}.pdf`;
}

/**
 * Preserve token shape (AAAA, 9999, etc.) in abstract transcript
 * 
 * This ensures that structural patterns are preserved even when
 * content is tokenized.
 */
export function preserveTokenShape(
  text: string,
  tokenClass: string
): string {
  switch (tokenClass) {
    case 'NUMBER':
      return '9999';
    case 'TEXT_PATTERN':
      if (/^[A-Z]+$/.test(text)) {
        return 'AAAA';
      } else if (/^[a-z]+$/.test(text)) {
        return 'aaaa';
      } else {
        return 'AaAa';
      }
    case 'DATE':
      return 'MM/DD/YYYY';
    default:
      return 'XXXX';
  }
}
