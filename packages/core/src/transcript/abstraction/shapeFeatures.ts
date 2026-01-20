/**
 * Shape feature detection for placeholder generation
 * 
 * Extracts abstract shape features from text without leaking content.
 */

import { createHash } from 'crypto';
import type { CharClassFlags, LengthBucket } from './abstractTranscript.js';

/**
 * Detect character class flags from text
 */
export function detectCharClassFlags(text: string): CharClassFlags {
  return {
    hasDigit: /\d/.test(text),
    hasAlpha: /[a-zA-Z]/.test(text),
    hasUpper: /[A-Z]/.test(text),
    hasLower: /[a-z]/.test(text),
    hasDash: /-/.test(text),
    hasSlash: /\//.test(text),
    hasDot: /\./.test(text),
    hasPunct: /[^\w\s]/.test(text),
  };
}

/**
 * Determine length bucket
 */
export function getLengthBucket(length: number): LengthBucket {
  if (length === 1) return '1';
  if (length <= 3) return '2-3';
  if (length <= 6) return '4-6';
  if (length <= 12) return '7-12';
  return '13+';
}

/**
 * Generate token shape pattern from text
 */
export function generateTokenShape(text: string): string {
  const trimmed = text.trim();
  
  // Numbers
  if (/^\d+$/.test(trimmed)) {
    return '9'.repeat(Math.min(trimmed.length, 10));
  }
  
  // Date patterns
  if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmed)) {
    return '99/99/9999';
  }
  
  // All caps
  if (/^[A-Z]+$/.test(trimmed)) {
    return 'A'.repeat(Math.min(trimmed.length, 10));
  }
  
  // All lowercase
  if (/^[a-z]+$/.test(trimmed)) {
    return 'a'.repeat(Math.min(trimmed.length, 10));
  }
  
  // Mixed case
  if (/^[A-Za-z]+$/.test(trimmed)) {
    // Preserve case pattern (first char determines)
    const firstUpper = /^[A-Z]/.test(trimmed);
    return (firstUpper ? 'A' : 'a') + 'a'.repeat(Math.min(trimmed.length - 1, 9));
  }
  
  // Patterns with dashes
  if (/^[A-Za-z0-9]+-[A-Za-z0-9]+/.test(trimmed)) {
    return 'AA-99';
  }
  
  // Patterns with slashes
  if (/^[A-Za-z0-9]+\/[A-Za-z0-9]+/.test(trimmed)) {
    return 'AA/99';
  }
  
  // Patterns with dots
  if (/^[A-Za-z0-9]+\.[A-Za-z0-9]+/.test(trimmed)) {
    return 'AA.99';
  }
  
  // Default: generic content
  return 'X'.repeat(Math.min(trimmed.length, 10));
}

/**
 * Generate stable placeholder ID from shape features
 * 
 * Uses hash of (tokenClass + tokenShape + lengthBucket + charClassFlags)
 * to ensure identical shapes get identical placeholderIds.
 */
export function generatePlaceholderId(
  tokenClass: string,
  tokenShape: string,
  lengthBucket: LengthBucket,
  charClassFlags: CharClassFlags
): string {
  // Create hash input from shape features only (no original text)
  const hashInput = JSON.stringify({
    class: tokenClass,
    shape: tokenShape,
    length: lengthBucket,
    flags: charClassFlags,
  });
  
  const hash = createHash('sha256').update(hashInput).digest('hex');
  // Use first 12 chars for readable ID
  return `PLACEHOLDER_${hash.substring(0, 12)}`;
}
