/**
 * Algorithmic parser for narrative PDFs
 * 
 * Deterministic parsing of narrative text into instruction sets.
 * No LLM usage - pure algorithmic pattern matching.
 */

import type {
  NarrativeTextDocument,
  NarrativeInstructionSet,
  DrawingInstruction,
  SpecInstruction,
  NarrativeParseIssue,
} from './types.js';
import { normalizeSheetId, normalizeSpecSectionId } from './normalize.js';

/**
 * Parse a narrative text document into an instruction set
 * 
 * @param doc - The extracted narrative text document
 * @returns Parsed instruction set with drawings, specs, and issues
 */
export function parseNarrativeAlgorithmic(
  doc: NarrativeTextDocument
): NarrativeInstructionSet {
  const drawings: DrawingInstruction[] = [];
  const specs: SpecInstruction[] = [];
  const issues: NarrativeParseIssue[] = [];
  
  // Find drawing and spec sections
  // More tolerant patterns to catch variations
  const drawingsSection = findSection(doc, /REVISIONS?\s+TO\s+DRAWINGS?/i);
  const specsSection = findSection(doc, /REVISIONS?\s+TO\s+(?:THE\s+)?(?:PROJECT\s+)?MANUAL/i) ||
                       findSection(doc, /REVISIONS?\s+TO\s+SPECIFICATIONS?/i);
  
  // Parse drawings if section found
  if (drawingsSection) {
    const { instructions, sectionIssues } = parseDrawingsSection(
      doc,
      drawingsSection.startPage,
      drawingsSection.endPage
    );
    drawings.push(...instructions);
    issues.push(...sectionIssues);
    
    // Add issue if heading exists but nothing extracted
    if (instructions.length === 0) {
      issues.push({
        severity: 'warn',
        code: 'NARR_NO_DRAWINGS_PARSED',
        message: 'Drawings section heading found but no drawing instructions extracted',
        evidence: {
          pageNumber: drawingsSection.startPage,
          rawText: doc.pages.find(p => p.pageNumber === drawingsSection.startPage)?.text.substring(0, 200) || '',
        },
      });
    }
  }
  
  // Parse specs if section found
  // Note: Spec sections can appear on later pages even after drawings section starts
  // So we need to parse the entire document for spec sections, not just until drawings section
  if (specsSection) {
    // Parse specs from the specs section start until the end of the document
    // This ensures we catch sections on page 2 that appear after drawings section starts
    const specsEndPage = doc.pages.length + 1; // Include all pages
    const { instructions, sectionIssues } = parseSpecsSection(
      doc,
      specsSection.startPage,
      specsEndPage
    );
    specs.push(...instructions);
    issues.push(...sectionIssues);
    
    // Add issue if heading exists but nothing extracted
    if (instructions.length === 0) {
      issues.push({
        severity: 'warn',
        code: 'NARR_NO_SPECS_PARSED',
        message: 'Specs section heading found but no spec instructions extracted',
        evidence: {
          pageNumber: specsSection.startPage,
          rawText: doc.pages.find(p => p.pageNumber === specsSection.startPage)?.text.substring(0, 200) || '',
        },
      });
    }
  }
  
  // Check for duplicate sheet IDs
  const sheetIdCounts = new Map<string, number>();
  for (const drawing of drawings) {
    const count = sheetIdCounts.get(drawing.sheetIdNormalized) || 0;
    sheetIdCounts.set(drawing.sheetIdNormalized, count + 1);
  }
  for (const [normalizedId, count] of sheetIdCounts.entries()) {
    if (count > 1) {
      issues.push({
        severity: 'warn',
        code: 'NARR_DUP_SHEET_ID',
        message: `Duplicate sheet ID found: ${normalizedId} (appears ${count} times)`,
      });
    }
  }
  
  // Check for duplicate section IDs
  const sectionIdCounts = new Map<string, number>();
  for (const spec of specs) {
    const count = sectionIdCounts.get(spec.sectionIdNormalized) || 0;
    sectionIdCounts.set(spec.sectionIdNormalized, count + 1);
  }
  for (const [normalizedId, count] of sectionIdCounts.entries()) {
    if (count > 1) {
      issues.push({
        severity: 'warn',
        code: 'NARR_DUP_SECTION_ID',
        message: `Duplicate section ID found: ${normalizedId} (appears ${count} times)`,
      });
    }
  }
  
  return {
    meta: {
      fileHash: doc.fileHash,
      pageCount: doc.pageCount,
      extractedAtIso: new Date().toISOString(),
    },
    drawings,
    specs,
    issues,
  };
}

/**
 * Find a section in the document by heading pattern
 */
function findSection(
  doc: NarrativeTextDocument,
  headingPattern: RegExp
): { startPage: number; endPage: number } | null {
  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    if (headingPattern.test(page.text)) {
      // Section ends at next major section or end of document
      // endPage should be 1-based page number (exclusive), so if section goes to end, it's doc.pages.length + 1
      let endPage = doc.pages.length + 1; // 1-based, exclusive
      for (let j = i + 1; j < doc.pages.length; j++) {
        const nextPage = doc.pages[j];
        // Check if next major section starts
        // For specs section, we want to include all pages until drawings section (specs can appear on page 2 after drawings start)
        // For drawings section, end at document end
        if (headingPattern.source.includes('DRAWINGS')) {
          // Drawings section goes to end
          break;
        } else {
          // Specs section ends when drawings section starts
          if (/REVISIONS?\s+TO\s+DRAWINGS?/i.test(nextPage.text)) {
            endPage = j + 1; // Convert to 1-based page number
            break;
          }
        }
      }
      return { startPage: i + 1, endPage }; // 1-based page numbers (endPage is exclusive)
    }
  }
  return null;
}

/**
 * Parse drawings section
 */
function parseDrawingsSection(
  doc: NarrativeTextDocument,
  startPage: number,
  endPage: number
): {
  instructions: DrawingInstruction[];
  sectionIssues: NarrativeParseIssue[];
} {
  const instructions: DrawingInstruction[] = [];
  const sectionIssues: NarrativeParseIssue[] = [];
  
  // Determine change type based on heading - check all pages in section
  let changeType: "revised_reissued" | "unknown" = "unknown";
  // More flexible pattern to catch variations: "REVISED AND RE-ISSUED", "REVISED AND REISSUED", etc.
  // Also match "REVISED AND RE - ISSUED" (with spaces around dash)
  const revisedReissuedPattern = /REVISED\s+AND\s+RE\s*[-]\s*ISSUED/i;
  
  // Extract text from relevant pages
  const relevantPages = doc.pages.filter(
    p => p.pageNumber >= startPage && p.pageNumber < endPage
  );
  
  // Combine all page text to check for "REVISED AND RE-ISSUED" heading
  // Look for it as a standalone heading (not just in a sentence)
  const fullSectionText = relevantPages.map(p => p.text).join('\n');
  const lines = fullSectionText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Check if line is a heading (all caps, or starts with the pattern)
    if (revisedReissuedPattern.test(trimmed) && 
        (trimmed.toUpperCase() === trimmed || trimmed.match(/^REVISED\s+AND\s+RE\s*[-]\s*ISSUED/i))) {
      changeType = "revised_reissued";
      break;
    }
  }
  
  for (const page of relevantPages) {
    
    const lines = page.text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Pattern 1: "1. SHEET - G0.01 GENERAL DEPICTION OF WORK"
      // Pattern 2: "1. SHEET – G0.01 – GENERAL ..." (unicode dash)
      // Pattern 3: "1. SHEET - G0.01" with title on next line
      // Pattern 4: "G0.01 GENERAL ..." (no "SHEET" prefix, but starts with sheet ID pattern)
      
      let sheetIdRaw: string | null = null;
      let titleRaw: string | undefined = undefined;
      let rawLine = line;
      
      // Try pattern with "SHEET" keyword
      // Pattern: "1. SHEET - G0.01 GENERAL DEPICTION OF WORK"
      // Sheet ID patterns: G0.01, G1.11, M2.11A, E7.02, G1. 1 1 (with spaces)
      // Match: 1-3 letters + optional digits + dot/dash + digits (with optional spaces) + optional 0-3 letters
      // Then capture everything after as title
      const sheetPattern1 = /^\d+\.\s+SHEET\s*[-]\s*([A-Z]{1,3}[\d\s]*[.-][\d\s]+[A-Z]{0,3})\s+(.+)$/i;
      const match1 = line.match(sheetPattern1);
      
      if (match1) {
        sheetIdRaw = match1[1].trim();
        titleRaw = match1[2]?.trim();
        
        // If title not on same line, check next non-empty line
        if (!titleRaw && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.match(/^\d+\.\s+SHEET/i) && !nextLine.match(/^Formerly|^Note:/i)) {
            titleRaw = nextLine;
            rawLine = line + '\n' + nextLine;
          }
        }
      } else {
        // Try pattern without "SHEET" keyword: "G0.01 GENERAL ..." or "1. G0.01 ..."
        const sheetPattern2 = /^(?:\d+\.\s+)?([A-Z]{1,3}\d{0,2}[-.]\d{1,3}(?:[A-Z]{0,3})?)\s+(.+)$/i;
        const match2 = line.match(sheetPattern2);
        
        if (match2) {
          sheetIdRaw = match2[1].trim();
          titleRaw = match2[2].trim();
        }
      }
      
      if (sheetIdRaw) {
        // Normalize sheet ID
        const sheetIdNormalized = normalizeSheetId(sheetIdRaw);
        
        // Check for malformed sheet ID
        if (!sheetIdNormalized || sheetIdNormalized.length < 2) {
          sectionIssues.push({
            severity: 'warn',
            code: 'NARR_BAD_SHEET_ID',
            message: `Malformed sheet ID: "${sheetIdRaw}"`,
            evidence: {
              pageNumber: page.pageNumber,
              rawText: line,
            },
          });
          continue;
        }
        
        // Clean up title: strip leading dashes and extra whitespace, trim trailing whitespace
        if (titleRaw) {
          titleRaw = titleRaw.replace(/^[-–—]\s*/, '').trim();
        }
        
        // Capture notes: sub-lines beneath a numbered sheet item
        // Look for lines that are clearly associated with this sheet:
        // - Lines starting with "a.", "b.", etc. (lettered sub-items)
        // - Lines starting with "Formerly named"
        // - Lines starting with "Note:"
        // - Indented lines (starting with spaces) until next numbered item
        const notes: string[] = [];
        let noteLineIndex = i + 1;
        
        // Skip the title line if it was on the next line
        if (titleRaw && rawLine.includes('\n') && noteLineIndex < lines.length) {
          noteLineIndex++;
        }
        
        // Collect notes until we hit the next numbered item or end of page
        while (noteLineIndex < lines.length) {
          const noteLine = lines[noteLineIndex].trim();
          
          // Stop if we hit another numbered sheet item
          if (noteLine.match(/^\d+\.\s+SHEET/i) || noteLine.match(/^\d+\.\s+[A-Z]{1,3}\d/i)) {
            break;
          }
          
          // Stop if we hit a blank line followed by a numbered item (section break)
          if (noteLine.length === 0 && noteLineIndex + 1 < lines.length) {
            const nextLine = lines[noteLineIndex + 1].trim();
            if (nextLine.match(/^\d+\.\s+SHEET/i) || nextLine.match(/^\d+\.\s+[A-Z]{1,3}\d/i)) {
              break;
            }
          }
          
          // Capture note lines
          if (noteLine.match(/^[a-z]\.\s+/i) || // Lettered sub-items: "a. Formerly named..."
              noteLine.match(/^Formerly\s+named/i) ||
              noteLine.match(/^Note:/i) ||
              (noteLine.length > 0 && noteLine.match(/^\s+/))) { // Indented lines
            notes.push(noteLine);
            if (!rawLine.includes('\n')) {
              rawLine = line;
            }
            rawLine += '\n' + noteLine;
            noteLineIndex++;
          } else if (noteLine.length === 0) {
            // Empty line - continue to next
            noteLineIndex++;
          } else {
            // Non-note line - stop collecting
            break;
          }
        }
        
        instructions.push({
          kind: "sheetChange",
          changeType,
          sheetIdRaw,
          sheetIdNormalized,
          titleRaw,
          notes: notes.length > 0 ? notes : undefined,
          evidence: {
            pageNumber: page.pageNumber,
            rawLine: rawLine,
          },
          source: "algorithmic",
        });
      }
    }
  }
  
  return { instructions, sectionIssues };
}

/**
 * Parse specs section
 */
function parseSpecsSection(
  doc: NarrativeTextDocument,
  startPage: number,
  endPage: number
): {
  instructions: SpecInstruction[];
  sectionIssues: NarrativeParseIssue[];
} {
  const instructions: SpecInstruction[] = [];
  const sectionIssues: NarrativeParseIssue[] = [];
  
  // Extract text from relevant pages
  // Note: startPage and endPage are 1-based page numbers
  const relevantPages = doc.pages.filter(
    p => p.pageNumber >= startPage && p.pageNumber < endPage
  );
  
  if (relevantPages.length === 0) {
    return { instructions: [], sectionIssues: [] };
  }
  
  const fullSectionText = relevantPages.map(p => p.text).join('\n');
  const lines = fullSectionText.split('\n');
  
  // More tolerant section header detection
  // Pattern 1: "SECTION 23 02 00 - TITLE" (with dash and title on same line)
  // Pattern 2: "SECTION 23 02 00" (no dash/title, title may be on next line)
  // Pattern 3: "SECTION 000110 - TITLE" (no spacing in number)
  // Pattern 4: "SECTION 23 02 00:" (with colon)
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Try to match section header patterns
    // Must start with "SECTION" (case insensitive) followed by digits
    // Pattern 1: "SECTION 23 02 00 - TITLE" or "SECTION 23 02 00:" (with dash/colon)
    // Pattern 2: "SECTION 23 02 00" (standalone, title may be on next line)
    // Pattern 3: "SECTION 000110" (no spaces in number)
    // Handle spacing variations like "00 31 2 1" (should normalize to "00 31 21")
    // More flexible: match any sequence of digits with spaces, then normalize
    // Pattern 1: Standard format "SECTION 23 02 00" or "SECTION 000110"
    let sectionMatch = line.match(/^SECTION\s+(\d{1,2}\s*\d{1,2}\s*\d{1,2}|\d{6})(?:\s*[-:]\s*(.*))?$/i);
    
    // Pattern 2: Flexible format with inconsistent spacing like "00 31 2 1"
    if (!sectionMatch) {
      // Match any sequence of digits separated by spaces (3-6 groups)
      const flexibleMatch = line.match(/^SECTION\s+((?:\d{1,2}\s*){3,6})(?:\s*[-:]\s*(.*))?$/i);
      if (flexibleMatch) {
        // Extract all digits and reformat as "NN NN NN"
        const digitsOnly = flexibleMatch[1].replace(/\s/g, '');
        if (digitsOnly.length === 6) {
          // Create a match array compatible with the rest of the code
          sectionMatch = [
            flexibleMatch[0], // Full match
            `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 4)} ${digitsOnly.slice(4, 6)}`, // Normalized ID
            flexibleMatch[2], // Title if present
          ];
        }
      }
    }
    
    // Pattern 3: If no match with dash/colon, try without (title on next line)
    if (!sectionMatch) {
      sectionMatch = line.match(/^SECTION\s+(\d{1,2}\s*\d{1,2}\s*\d{1,2}|\d{6})\s*$/i);
    }
    
    if (sectionMatch) {
      // Normalize section ID - handle spacing variations like "00 31 2 1" -> "00 31 21"
      let sectionIdRaw = sectionMatch[1].trim();
      // Collapse all spaces and ensure we have 6 digits, then reformat
      const digitsOnly = sectionIdRaw.replace(/\s/g, '');
      if (digitsOnly.length === 6) {
        // Reformat as "NN NN NN"
        sectionIdRaw = `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 4)} ${digitsOnly.slice(4, 6)}`;
      }
      
      let titleRaw = sectionMatch[2]?.trim();
      
      // If title not on same line, check next non-empty line
      if (!titleRaw && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // If next line looks like a title (not another section, not empty, not just numbers)
        if (nextLine && !nextLine.match(/^SECTION\s+\d/i) && !nextLine.match(/^\d+$/) && !nextLine.match(/^[A-Z]\.\s/)) {
          titleRaw = nextLine;
        }
      }
      
      // Normalize section ID
      const sectionIdNormalized = normalizeSpecSectionId(sectionIdRaw);
      
      // Check for malformed section ID
      if (!sectionIdNormalized || sectionIdNormalized.length !== 8) { // "NN NN NN" = 8 chars
        sectionIssues.push({
          severity: 'warn',
          code: 'NARR_BAD_SECTION_ID',
          message: `Malformed section ID: "${sectionIdRaw}"`,
          evidence: {
            pageNumber: findPageForLine(doc, i, startPage, endPage),
            rawText: line,
          },
        });
        continue;
      }
      
      // Find the section block (until next SECTION, drawings heading, or end)
      let sectionStart = i + 1; // Start after the header line
      let sectionEnd = lines.length;
      
      // Look for next section header or drawings section start
      for (let j = i + 1; j < lines.length; j++) {
        const checkLine = lines[j].trim();
        
        // Stop at next SECTION header
        if (checkLine.match(/^SECTION\s+\d/i)) {
          sectionEnd = j;
          break;
        }
        
        // Stop at drawings section heading
        if (isDrawingsSectionStart(checkLine)) {
          sectionEnd = j;
          break;
        }
        
        // Stop at end markers
        if (isEndMarker(checkLine)) {
          sectionEnd = j;
          break;
        }
      }
      
      // Extract section block (lines between header and next section)
      const sectionBlockLines = lines.slice(sectionStart, sectionEnd);
      const sectionBlock = sectionBlockLines.join('\n');
      
      // Build evidence including header line(s)
      const evidenceLines = titleRaw && !sectionMatch[2] 
        ? [line, lines[i + 1] || ''].filter(l => l.trim())
        : [line];
      const evidenceText = evidenceLines.join('\n') + '\n' + sectionBlock.substring(0, 200);
      
      // Parse actions within the section
      const actions = parseSectionActions(sectionBlock);
      
      // Find which page this section is on
      const pageNumber = findPageForLine(doc, i, startPage, endPage);
      
      instructions.push({
        kind: "specSectionChange",
        sectionIdRaw,
        sectionIdNormalized,
        titleRaw,
        actions,
        evidence: {
          pageNumber,
          rawBlock: evidenceText.substring(0, 500), // First 500 chars as evidence
        },
        source: "algorithmic",
      });
    }
  }
  
  return { instructions, sectionIssues };
}

/**
 * Check if a line indicates the start of a drawings section
 */
function isDrawingsSectionStart(line: string): boolean {
  const trimmed = line.trim();
  // Check for drawings section headings
  if (/REVISIONS?\s+TO\s+DRAWINGS?/i.test(trimmed)) {
    return true;
  }
  // Check for "REVISED AND RE-ISSUED" heading
  if (/REVISED\s+AND\s+RE\s*[-]\s*ISSUED/i.test(trimmed)) {
    return true;
  }
  // Check for "ISSUED NEW" or "ISSUED FOR THE FIRST TIME"
  if (/ISSUED\s+(?:NEW|FOR\s+THE\s+FIRST\s+TIME)/i.test(trimmed)) {
    return true;
  }
  // Check for drawings list pattern: numbered items starting with "SHEET" or sheet ID pattern
  if (/^\d+\.\s*(SHEET\b|[A-Z]{1,3}\d)/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Check if a line is an end marker
 */
function isEndMarker(line: string): boolean {
  const trimmed = line.trim();
  // Check for "END OF" patterns
  if (/^END\s+OF/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Find which page a line index corresponds to
 */
function findPageForLine(
  doc: NarrativeTextDocument,
  lineIndex: number,
  startPage: number,
  endPage: number
): number {
  let currentLine = 0;
  for (const page of doc.pages) {
    if (page.pageNumber >= startPage && page.pageNumber < endPage) {
      const pageLines = page.text.split('\n').length;
      if (currentLine + pageLines > lineIndex) {
        return page.pageNumber;
      }
      currentLine += pageLines;
    }
  }
  return startPage; // Fallback
}

/**
 * Check if a line is header/footer noise that should be filtered from spec actions
 */
function isHeaderFooterNoise(line: string): boolean {
  const trimmed = line.trim();
  
  // Page footers: "Page 1 of 3"
  if (/^Page\s+\d+\s+of\s+\d+/i.test(trimmed)) {
    return true;
  }
  
  // Addendum identifiers: "ADDENDUM 3"
  if (/^ADDENDUM\s+\d+/i.test(trimmed)) {
    return true;
  }
  
  // Project metadata: "Project No." or "RWB Project No"
  if (/Project\s+No\.?/i.test(trimmed) || /RWB\s+Project\s+No/i.test(trimmed)) {
    return true;
  }
  
  // Firm name: "RWB Consulting Engineers"
  if (/RWB\s+Consulting\s+Engineers/i.test(trimmed)) {
    return true;
  }
  
  // Empty or near-empty lines (after normalization)
  if (trimmed.length === 0 || trimmed.length < 3) {
    return true;
  }
  
  return false;
}

/**
 * Parse actions within a spec section block
 */
function parseSectionActions(block: string): Array<{
  verb: "add" | "revise" | "delete" | "replace" | "unknown";
  targetRaw?: string;
  rawText: string;
}> {
  const actions: Array<{
    verb: "add" | "revise" | "delete" | "replace" | "unknown";
    targetRaw?: string;
    rawText: string;
  }> = [];
  
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  for (const line of lines) {
    // Skip section headers, empty lines, etc.
    if (line.match(/^SECTION\s+\d/i) || line.length === 0) {
      continue;
    }
    
    // Stop processing if we hit a drawings section start or end marker
    if (isDrawingsSectionStart(line) || isEndMarker(line)) {
      break;
    }
    
    // Filter header/footer noise
    if (isHeaderFooterNoise(line)) {
      continue;
    }
    
    // Classify verb based on text patterns (case-insensitive, order-sensitive: specific beats general)
    const lowerLine = line.toLowerCase();
    let verb: "add" | "revise" | "delete" | "replace" | "unknown" = "unknown";
    
    // Order matters: more specific patterns first
    
    // DELETE: starts with "Delete" OR contains word boundary "Delete"
    // Handle numbered items like "1. Delete ..." or "Delete ..."
    if (lowerLine.match(/^(?:\d+\.\s*)?delete\s+/) || /\bdelete\b/.test(lowerLine)) {
      verb = "delete";
    }
    // ADD: starts with "Add " (with optional number prefix) OR contains "has been added"
    // Handle numbered items like "2. Add Paragraph ..." or "Add ..."
    else if (lowerLine.match(/^(?:\d+\.\s*)?add\s+/) || lowerLine.includes("has been added")) {
      verb = "add";
    }
    // INSERT: starts with "Insert" (with optional number prefix) OR contains word boundary "Insert" (treated as add)
    // Handle numbered items like "1. Insert a new Paragraph ..." or "Insert ..."
    else if (lowerLine.match(/^(?:\d+\.\s*)?insert\s+/) || /\binsert\b/.test(lowerLine)) {
      verb = "add"; // Insert is treated as add (consistent choice)
    }
    // REPLACE: contains word boundary "Replace"
    else if (/\breplace\b/.test(lowerLine) || lowerLine.match(/^replace\s+/)) {
      verb = "replace";
    }
    // ADJUST: contains word boundary "Adjust" (treated as revise)
    else if (/\badjust\b/.test(lowerLine)) {
      verb = "revise";
    }
    // REVISE/REVISED: contains "revise", "revised", "reissued", "re - issued", "not reissued"
    else if (
      /\brevise\b/.test(lowerLine) || 
      /\brevised\b/.test(lowerLine) || 
      lowerLine.includes("has been revised") ||
      /\bre\s*[-]\s*issued\b/.test(lowerLine) ||
      /\breissued\b/.test(lowerLine) ||
      /\bnot\s+reissued\b/.test(lowerLine)
    ) {
      verb = "revise";
    }
    
    // Try to extract target (e.g., "Add the following: ..." -> target might be in next lines)
    let targetRaw: string | undefined;
    if (verb !== "unknown") {
      // Simple extraction - look for patterns like "Add: X" or "Revise X to read:"
      const targetMatch = line.match(/:\s*(.+)$/);
      if (targetMatch) {
        targetRaw = targetMatch[1];
      }
    }
    
    actions.push({
      verb,
      targetRaw,
      rawText: line,
    });
  }
  
  return actions;
}

