/**
 * Paragraph normalization for spec extraction
 * 
 * Handles wrap join and hyphen repair for proper paragraph reconstruction.
 */

import type { TextItemWithPosition } from '../../utils/pdf.js';

/**
 * Normalize paragraphs by joining wrapped lines and repairing hyphens
 * 
 * @param lines Lines of text items (already grouped by Y coordinate)
 * @returns Normalized paragraph text
 */
export function normalizeParagraph(lines: Array<{ y: number; items: TextItemWithPosition[] }>): string {
  if (lines.length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.items.map(item => item.str.trim()).join(' ').trim();
    
    if (lineText.length === 0) {
      continue;
    }
    
    // Check if this line is a continuation of previous line (wrapped)
    if (i > 0) {
      const prevLine = lines[i - 1];
      const prevText = prevLine.items.map(item => item.str.trim()).join(' ').trim();
      
      // Check for hyphen at end of previous line
      const prevEndsWithHyphen = prevText.endsWith('-') || prevText.endsWith('—');
      
      // Check if previous line doesn't end with sentence-ending punctuation
      const prevEndsWithPunctuation = /[.!?:]$/.test(prevText);
      
      // Check if this line starts with lowercase (likely continuation)
      const startsWithLowercase = /^[a-z]/.test(lineText);
      
      // Join if:
      // 1. Previous line ends with hyphen (hyphen repair)
      // 2. Previous line doesn't end with punctuation AND this line starts with lowercase (wrap join)
      if (prevEndsWithHyphen) {
        // Hyphen repair: remove hyphen and join
        parts[parts.length - 1] = parts[parts.length - 1].replace(/[-—]$/, '');
        parts.push(lineText);
      } else if (!prevEndsWithPunctuation && startsWithLowercase) {
        // Wrap join: join with space
        parts.push(' ', lineText);
      } else {
        // New paragraph: add line break
        parts.push('\n', lineText);
      }
    } else {
      // First line
      parts.push(lineText);
    }
  }
  
  return parts.join('').trim();
}

/**
 * Repair hyphenated words that were split across lines
 * 
 * @param text Text with potential hyphen splits
 * @returns Text with hyphens repaired
 */
export function repairHyphens(text: string): string {
  // Pattern: word ending with hyphen followed by word on next line
  // Example: "one-\ntwo" -> "onetwo" (hyphen removed, words joined)
  return text.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2');
}

/**
 * Join wrapped lines into paragraphs
 * 
 * @param text Text with line breaks
 * @returns Text with wrapped lines joined
 */
export function joinWrappedLines(text: string): string {
  // Join lines that don't end with punctuation and are followed by lowercase
  return text.replace(/([^.!?:])\n([a-z])/g, '$1 $2');
}
