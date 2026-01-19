/**
 * SpecSectionizer: Walk pages, call SpecFooterIndexer, and emit SpecSectionRun[]
 * 
 * New-run conditions:
 * - sectionId changes OR
 * - pageInSection resets to 1
 * 
 * Repair pass:
 * - If missing sectionId on page i, infer from i-1/i+1 if equal
 * - If conflict, mark needsCorrection and emit an audit record
 */

import type { TextItemWithPosition } from '../../utils/pdf.js';
import { parseFooter, type FooterParse, type FooterIndexerOptions } from './specFooterIndexer.js';

/**
 * Page assignment within a section run
 */
export interface PageAssignment {
  /** Page index (0-based) */
  pageIndex: number;
  /** Page number within section */
  pageInSection: number | null;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Whether this page needs correction */
  needsCorrection: boolean;
  /** Evidence string from footer parse */
  evidence: string;
}

/**
 * Section run: consecutive pages belonging to the same section
 */
export interface SpecSectionRun {
  /** Normalized section ID like "23 00 00" */
  sectionId: string;
  /** Start page index (0-based, inclusive) */
  startPageIndex: number;
  /** End page index (0-based, inclusive) */
  endPageIndex: number;
  /** Per-page assignments */
  pages: PageAssignment[];
  /** Whether this run needs correction */
  needsCorrection: boolean;
}

/**
 * Audit record for ambiguous or problematic pages
 */
export interface SectionAuditRecord {
  /** Page index (0-based) */
  pageIndex: number;
  /** Issue type */
  issue: 'missing_section' | 'conflicting_section' | 'missing_page_number' | 'page_number_reset';
  /** Description of the issue */
  description: string;
  /** Evidence strings */
  evidence: {
    current?: string;
    previous?: string;
    next?: string;
  };
  /** Suggested correction (if applicable) */
  suggestedCorrection?: {
    sectionId?: string;
    pageInSection?: number;
  };
}

/**
 * Sectionization result
 */
export interface SectionizationResult {
  /** Section runs */
  runs: SpecSectionRun[];
  /** Audit records for ambiguous pages */
  auditRecords: SectionAuditRecord[];
  /** Per-page section assignments (for quick lookup) */
  pageAssignments: Map<number, { sectionId: string; pageInSection: number | null }>;
}

/**
 * Options for sectionization
 */
export interface SectionizerOptions extends FooterIndexerOptions {
  /** Enable repair pass (default: true) */
  enableRepair?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Sectionize pages by parsing footers
 * 
 * @param pages - Array of page data with text items
 * @param options - Sectionization options
 * @returns SectionizationResult with runs, audit records, and page assignments
 */
export function sectionizePages(
  pages: Array<{
    pageIndex: number;
    items: TextItemWithPosition[];
    pageHeight: number;
  }>,
  options: SectionizerOptions = {}
): SectionizationResult {
  const { enableRepair = true, verbose = false, ...footerOptions } = options;
  
  // PASS 1: Parse all footers
  const footerParses: FooterParse[] = [];
  for (const page of pages) {
    const parse = parseFooter(page.items, page.pageHeight, footerOptions);
    footerParses.push(parse);
    
    if (verbose) {
      console.log(`Page ${page.pageIndex}: sectionId=${parse.sectionId}, pageInSection=${parse.pageInSection}, confidence=${parse.confidence}`);
    }
  }
  
  // PASS 2: Repair missing sectionIds (if enabled)
  if (enableRepair) {
    repairMissingSectionIds(footerParses, verbose);
  }
  
  // PASS 3: Build section runs
  const runs: SpecSectionRun[] = [];
  const auditRecords: SectionAuditRecord[] = [];
  const pageAssignments = new Map<number, { sectionId: string; pageInSection: number | null }>();
  
  let currentRun: SpecSectionRun | null = null;
  
  for (let i = 0; i < pages.length; i++) {
    const parse = footerParses[i];
    const pageIndex = pages[i].pageIndex;
    
    // Determine if we need a new run
    const needsNewRun = shouldStartNewRun(currentRun, parse, i);
    
    if (needsNewRun) {
      // Finalize previous run
      if (currentRun) {
        currentRun.endPageIndex = i - 1;
        runs.push(currentRun);
      }
      
      // Start new run
      if (parse.sectionId) {
        currentRun = {
          sectionId: parse.sectionId,
          startPageIndex: i,
          endPageIndex: i, // Will be updated
          pages: [],
          needsCorrection: false,
        };
      } else {
        // No sectionId available - create orphan run
        currentRun = null;
        auditRecords.push({
          pageIndex,
          issue: 'missing_section',
          description: `Page ${pageIndex} has no section ID and cannot be assigned to a section`,
          evidence: {
            current: parse.evidence,
          },
        });
        continue;
      }
    }
    
    // Add page to current run
    if (currentRun) {
      const needsCorrection = parse.confidence === 'low' || 
                             (parse.sectionId !== currentRun.sectionId && parse.sectionId !== null);
      
      if (needsCorrection && parse.sectionId !== currentRun.sectionId) {
        auditRecords.push({
          pageIndex,
          issue: 'conflicting_section',
          description: `Page ${pageIndex} has section ID ${parse.sectionId} but is in run for ${currentRun.sectionId}`,
          evidence: {
            current: parse.evidence,
          },
          suggestedCorrection: {
            sectionId: currentRun.sectionId,
          },
        });
        currentRun.needsCorrection = true;
      }
      
      if (parse.pageInSection === null && i > 0) {
        // Check if page number reset (should be 1 at start of section)
        const prevParse = footerParses[i - 1];
        if (prevParse && prevParse.pageInSection !== null && prevParse.pageInSection! > 1) {
          auditRecords.push({
            pageIndex,
            issue: 'page_number_reset',
            description: `Page ${pageIndex} missing page number, but previous page was ${prevParse.pageInSection}`,
            evidence: {
              current: parse.evidence,
              previous: prevParse.evidence,
            },
            suggestedCorrection: {
              pageInSection: (prevParse.pageInSection || 0) + 1,
            },
          });
        } else {
          auditRecords.push({
            pageIndex,
            issue: 'missing_page_number',
            description: `Page ${pageIndex} missing page number within section`,
            evidence: {
              current: parse.evidence,
            },
          });
        }
      }
      
      const assignment: PageAssignment = {
        pageIndex,
        pageInSection: parse.pageInSection,
        confidence: parse.confidence,
        needsCorrection,
        evidence: parse.evidence,
      };
      
      currentRun.pages.push(assignment);
      pageAssignments.set(pageIndex, {
        sectionId: currentRun.sectionId,
        pageInSection: parse.pageInSection,
      });
    }
  }
  
  // Finalize last run
  if (currentRun) {
    currentRun.endPageIndex = pages.length - 1;
    runs.push(currentRun);
  }
  
  return {
    runs,
    auditRecords,
    pageAssignments,
  };
}

/**
 * Determine if a new run should be started
 */
function shouldStartNewRun(
  currentRun: SpecSectionRun | null,
  parse: FooterParse,
  _pageIndex: number
): boolean {
  // No current run - start one if we have a sectionId
  if (!currentRun) {
    return parse.sectionId !== null;
  }
  
  // Section ID changed
  if (parse.sectionId && parse.sectionId !== currentRun.sectionId) {
    return true;
  }
  
  // Page number reset to 1 (new section start)
  if (parse.pageInSection === 1 && currentRun.pages.length > 0) {
    const lastPage = currentRun.pages[currentRun.pages.length - 1];
    if (lastPage.pageInSection !== null && lastPage.pageInSection! > 1) {
      return true;
    }
  }
  
  return false;
}

/**
 * Repair pass: infer missing sectionIds from neighbors
 */
function repairMissingSectionIds(parses: FooterParse[], verbose: boolean): void {
  for (let i = 0; i < parses.length; i++) {
    if (parses[i].sectionId === null) {
      // Try to infer from neighbors
      const prevSectionId = i > 0 ? parses[i - 1].sectionId : null;
      const nextSectionId = i < parses.length - 1 ? parses[i + 1].sectionId : null;
      
      if (prevSectionId && nextSectionId && prevSectionId === nextSectionId) {
        // Both neighbors have same sectionId - use it
        parses[i].sectionId = prevSectionId;
        parses[i].confidence = 'medium'; // Lower confidence for inferred
        if (verbose) {
          console.log(`Repaired page ${i}: inferred sectionId=${prevSectionId} from neighbors`);
        }
      } else if (prevSectionId) {
        // Only previous has sectionId - use it (more likely continuation)
        parses[i].sectionId = prevSectionId;
        parses[i].confidence = 'medium';
        if (verbose) {
          console.log(`Repaired page ${i}: inferred sectionId=${prevSectionId} from previous page`);
        }
      } else if (nextSectionId) {
        // Only next has sectionId - use it
        parses[i].sectionId = nextSectionId;
        parses[i].confidence = 'medium';
        if (verbose) {
          console.log(`Repaired page ${i}: inferred sectionId=${nextSectionId} from next page`);
        }
      }
    }
  }
}
