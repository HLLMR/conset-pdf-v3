/**
 * Bookmark tree building from various sources
 */

import type { BookmarkAnchorTree, BookmarkAnchor } from '../workflows/bookmarks/types.js';
import type { BookmarkNode, BookmarkTree, BookmarkDestination } from './types.js';
import { BOOKMARK_ISSUE_CODES } from './types.js';
import type { DocumentContext } from '../analyze/documentContext.js';
import type { BookmarkStyleOptions } from './profiles/types.js';
import { resolveBookmarkStyleOptions, getBookmarkProfile } from './profiles/index.js';
import { 
  findSectionHeadingPage, 
  findArticleHeadingPage
} from './headingResolver.js';

/**
 * Build bookmark tree from BookmarkAnchorTree (Specs Pipeline)
 * 
 * Applies profile shaping (filtering, normalization, sorting) to produce clean, navigable bookmarks.
 * 
 * @param bookmarkTree - BookmarkAnchorTree from Specs Pipeline
 * @param docContext - Document context for page resolution
 * @param pageCount - Total page count
 * @param styleOptions - Optional style options (profile, maxDepth, etc.)
 * @param context - Context for default profile selection (rebuild mode, etc.)
 * @param footerSectionIndex - Optional footer section index mapping section codes to first page (footer-first anchoring)
 */
export async function buildTreeFromBookmarkAnchorTree(
  bookmarkTree: BookmarkAnchorTree,
  docContext: DocumentContext,
  pageCount: number,
  styleOptions?: BookmarkStyleOptions,
  context?: { rebuild?: boolean; sectionStartStrategy?: 'footer' | 'heading' | 'hint' },
  footerSectionIndex?: { firstPageBySection: Record<string, number> }
): Promise<BookmarkTree> {
  const nodes = new Map<string, BookmarkNode>();
  
  // STEP 1: Identify all section IDs and determine their page boundaries
  // Deduplicate sections: use first occurrence of each section ID
  const sectionAnchorsMap = new Map<string, BookmarkAnchor>();
  for (const anchor of bookmarkTree.bookmarks) {
    if (anchor.level === 0 && (anchor.title.startsWith('SECTION ') || /^\d{2}\s+\d{2}\s+\d{2}/.test(anchor.anchor))) {
      if (!sectionAnchorsMap.has(anchor.anchor)) {
        sectionAnchorsMap.set(anchor.anchor, anchor);
      }
    }
  }
  const sectionAnchors = Array.from(sectionAnchorsMap.values());
  
  // STEP 2: Build section nodes with footer-first resolution
  const sectionNodes = new Map<string, BookmarkNode>();
  const sectionStartPages = new Map<string, number>(); // sectionCode -> resolved pageIndex
  const sectionResolutionMethods = new Map<string, 'footer' | 'heading' | 'hint' | 'invalid'>(); // Track how each was resolved
  
  // Determine section start strategy (default: footer-first when index provided)
  const sectionStartStrategy = context?.sectionStartStrategy || 
    (footerSectionIndex ? 'footer' : 'heading');
  
  for (const anchor of sectionAnchors) {
    let pageIndex = -1;
    let resolutionMethod: 'footer' | 'heading' | 'hint' | 'invalid' = 'invalid';
    
    // STEP 2a: Try footer-first anchoring if available and strategy allows
    if (sectionStartStrategy === 'footer' && footerSectionIndex) {
      // Try exact match first
      let footerPage = footerSectionIndex.firstPageBySection[anchor.anchor];
      
      // If not found, try with leading "01" (division prefix common in footers)
      if (footerPage === undefined) {
        const withDivision = `01 ${anchor.anchor}`;
        footerPage = footerSectionIndex.firstPageBySection[withDivision];
      }
      
      // If still not found, try without leading division if anchor has it
      if (footerPage === undefined && anchor.anchor.startsWith('01 ')) {
        const withoutDivision = anchor.anchor.substring(3).trim();
        footerPage = footerSectionIndex.firstPageBySection[withoutDivision];
      }
      
      if (footerPage !== undefined && footerPage >= 0 && footerPage < pageCount) {
        pageIndex = footerPage;
        resolutionMethod = 'footer';
      }
    }
    
    // STEP 2b: Fallback to heading-based search if footer not found
    if (pageIndex < 0 && (sectionStartStrategy === 'heading' || sectionStartStrategy === 'footer')) {
      // Resolve page using heading-based search (layout-aware, heading band only)
      pageIndex = await findSectionHeadingPage(
        docContext,
        anchor.anchor,
        pageCount,
        0,
        undefined
      );
      
      // Validate that findSectionHeadingPage returned a valid value
      if (pageIndex >= pageCount) {
        console.warn(`findSectionHeadingPage returned invalid pageIndex ${pageIndex} for section ${anchor.anchor} (pageCount=${pageCount}), resetting to -1`);
        pageIndex = -1;
      }
      
      if (pageIndex >= 0) {
        resolutionMethod = 'heading';
      }
    }
    
    // STEP 2c: Fallback to pageIndexHint if both footer and heading search failed
    if (pageIndex < 0 && anchor.pageIndexHint) {
      // pageIndexHint is 1-based, convert to 0-based and clamp
      const hintPage = anchor.pageIndexHint - 1;
      // Defensive: if hintPage is out of range, log and clamp
      if (hintPage >= pageCount || hintPage < 0) {
        console.warn(`pageIndexHint ${anchor.pageIndexHint} (0-based: ${hintPage}) for section ${anchor.anchor} is out of range (0-${pageCount - 1}), clamping`);
      }
      pageIndex = Math.max(0, Math.min(hintPage, pageCount - 1));
      resolutionMethod = 'hint';
    }
    
    // DO NOT silently guess - if still not found, mark as invalid
    const isValid = pageIndex >= 0 && pageIndex < pageCount;
    if (!isValid) {
      pageIndex = -1; // Mark as invalid
      resolutionMethod = 'invalid';
    }
    
    // Clamp to valid range if we have a value
    if (pageIndex >= 0) {
      pageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
    }
    
    const destination: BookmarkDestination = {
      pageIndex: pageIndex >= 0 ? pageIndex : 0, // Use 0 as placeholder for invalid, but mark invalid
      fitType: null,
      isValid,
      validationError: isValid ? undefined : `Section "${anchor.anchor}" could not be resolved to a valid page`,
    };
    
    const id = `bookmarkTree:${anchor.anchor}`;
    const node: BookmarkNode = {
      id,
      title: anchor.title.startsWith('SECTION ') ? anchor.title : `SECTION ${anchor.anchor}`,
      level: 0,
      destination,
      sourceAnchor: anchor.anchor,
      page: pageIndex >= 0 ? pageIndex + 1 : 0,
      status: isValid ? 'ok' : 'error',
      childIds: [],
      issues: isValid ? undefined : [BOOKMARK_ISSUE_CODES.BOOKMARK_ANCHOR_NOT_FOUND],
    };
    
    nodes.set(id, node);
    sectionNodes.set(anchor.anchor, node);
    sectionStartPages.set(anchor.anchor, pageIndex);
    sectionResolutionMethods.set(anchor.anchor, resolutionMethod);
  }
  
  // STEP 3: Compute section page ranges from sorted section start pages
  // Sort sections by their resolved page indices (invalid sections go to end)
  const sortedSectionEntries = Array.from(sectionStartPages.entries())
    .filter(([_, pageIndex]) => pageIndex >= 0) // Only valid sections
    .sort((a, b) => a[1] - b[1]); // Sort by page index
  
  const sectionRanges = new Map<string, { startPage: number; endPage: number }>();
  
  for (let i = 0; i < sortedSectionEntries.length; i++) {
    const [sectionCode, startPage] = sortedSectionEntries[i];
    const endPage = i < sortedSectionEntries.length - 1
      ? sortedSectionEntries[i + 1][1] - 1 // Next section start - 1
      : pageCount - 1; // Last section goes to end
    
    sectionRanges.set(sectionCode, { startPage, endPage });
  }
  
  // STEP 4: Build article nodes and assign to sections by page ranges
  for (const sectionAnchor of sectionAnchors) {
    const sectionNode = sectionNodes.get(sectionAnchor.anchor);
    if (!sectionNode) continue;
    
    // Get section page range (computed from sorted section start pages)
    const range = sectionRanges.get(sectionAnchor.anchor);
    if (!range) {
      // Section has invalid destination, skip articles
      continue;
    }
    
    // Process articles that belong to this section
    if (sectionAnchor.children && sectionAnchor.children.length > 0) {
      const childIds: string[] = [];
      
      for (const articleAnchor of sectionAnchor.children) {
        // Reject junk titles: article title MUST start with anchor + space
        const normalizedTitle = articleAnchor.title.trim().replace(/\s+/g, ' ');
        if (!normalizedTitle.startsWith(`${articleAnchor.anchor} `)) {
          // Junk title - skip this article
          continue;
        }
        
        // Resolve article page using heading-based search within section range
        let pageIndex = await findArticleHeadingPage(
          docContext,
          articleAnchor.anchor,
          pageCount,
          range.startPage,
          range.endPage
        );
        
        // Fallback to pageIndexHint if heading search failed
        if (pageIndex < 0 && articleAnchor.pageIndexHint) {
          const hintPage = articleAnchor.pageIndexHint - 1;
          // Only use hint if it's within section range
          if (hintPage >= range.startPage && hintPage <= range.endPage && hintPage >= 0 && hintPage < pageCount) {
            pageIndex = hintPage;
          }
        }
        
        // If still not found, skip this article (don't assign to wrong section)
        if (pageIndex < 0 || pageIndex < range.startPage || pageIndex > range.endPage) {
          continue; // Skip articles outside section range
        }
        
        // Clamp to valid range
        pageIndex = Math.max(0, Math.min(pageIndex, pageCount - 1));
        
        const destination: BookmarkDestination = {
          pageIndex,
          fitType: null,
          isValid: pageIndex >= 0 && pageIndex < pageCount,
        };
        
        const id = `bookmarkTree:${articleAnchor.anchor}`;
        
        const articleNode: BookmarkNode = {
          id,
          title: normalizedTitle, // Already normalized and validated above
          level: 1, // Articles are level 1 (children of sections)
          destination,
          sourceAnchor: articleAnchor.anchor,
          parentId: sectionNode.id,
          page: pageIndex + 1,
          status: destination.isValid ? 'ok' : 'error',
        };
        
        nodes.set(id, articleNode);
        childIds.push(id);
      }
      
      sectionNode.childIds = childIds;
    }
  }
  
  // STEP 5: Sort section roots by numeric order
  // Parse section IDs for numeric comparison: "23 05 53" -> [23, 5, 53]
  // This ensures: 01 23 31 < 23 02 00 < 23 05 00 < 23 05 48 < 23 05 53 < 23 07 00 < 23 09 00
  const parseSectionId = (id: string): number[] => {
    const parts = id.trim().split(/\s+/).map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
    // Pad to 3 components for consistent comparison
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3); // Take first 3 components only
  };
  
  const sortedRoots = Array.from(sectionNodes.values()).sort((a, b) => {
    const aParts = parseSectionId(a.sourceAnchor || '');
    const bParts = parseSectionId(b.sourceAnchor || '');
    
    // Compare component by component: [division, section, subsection]
    for (let i = 0; i < 3; i++) {
      if (aParts[i] < bParts[i]) return -1;
      if (aParts[i] > bParts[i]) return 1;
    }
    return 0;
  });
  
  // STEP 6: Sort articles within each section by numeric order
  for (const sectionNode of sortedRoots) {
    if (sectionNode.childIds && sectionNode.childIds.length > 0) {
      const children = sectionNode.childIds
        .map(id => nodes.get(id))
        .filter((child): child is BookmarkNode => child !== undefined)
        .sort((a, b) => {
          // Parse article anchors: "1.3" -> [1, 3], "1.10" -> [1, 10]
          // This ensures numeric ordering: 1.2, 1.3, ..., 1.10 (not lexicographic)
          const parseArticleAnchor = (anchor: string): number[] => {
            if (!anchor) return [];
            return anchor.split('.').map(p => {
              const num = parseInt(p, 10);
              return isNaN(num) ? 0 : num;
            });
          };
          
          const aParts = parseArticleAnchor(a.sourceAnchor || '');
          const bParts = parseArticleAnchor(b.sourceAnchor || '');
          
          // Compare component by component
          const maxLen = Math.max(aParts.length, bParts.length);
          for (let i = 0; i < maxLen; i++) {
            const aVal = aParts[i] || 0;
            const bVal = bParts[i] || 0;
            if (aVal < bVal) return -1;
            if (aVal > bVal) return 1;
          }
          return 0;
        });
      
      sectionNode.childIds = children.map(child => child.id);
    }
  }
  
  // Build initial tree
  let tree: BookmarkTree = {
    roots: sortedRoots,
    nodes,
    source: 'bookmarkTree',
  };
  
  // Resolve style options with defaults
  const resolvedOptions = resolveBookmarkStyleOptions(styleOptions, {
    rebuild: context?.rebuild,
    bookmarkTreeProvided: true,
  });
  
  // Apply profile shaping (filtering, title normalization)
  const profile = getBookmarkProfile(resolvedOptions.profile);
  tree = profile.shape(tree, resolvedOptions);
  
  return tree;
}

/**
 * Build a bookmark node from BookmarkAnchor (legacy function, kept for compatibility)
 * 
 * NOTE: This function is now primarily used for non-section/article bookmarks.
 * Section and article nodes are built in buildTreeFromBookmarkAnchorTree() with
 * proper heading-based resolution and hierarchy.
 * 
 * This function is still used by some code paths, so we keep it but it's not
 * the primary path for section/article resolution.
 */
export async function buildNodeFromAnchor(
  anchor: BookmarkAnchor,
  docContext: DocumentContext,
  pageCount: number,
  nodes: Map<string, BookmarkNode>,
  source: string,
  parentId?: string
): Promise<BookmarkNode | null> {
  // Resolve page index
  // STRATEGY: Use pageIndexHint as starting point, then refine with anchor search
  // This is more efficient than searching all pages, and pageIndexHint is usually
  // close to the correct page even if not exact
  
  let pageIndex = -1;
  
  // Try to find anchor in PDF text (most reliable method)
  // This searches the entire PDF but uses scoring to prefer heading-like matches
  pageIndex = await findAnchorInPdf(anchor.anchor, docContext, pageCount, 0);
  
  // If anchor search failed, use pageIndexHint as fallback
  if (pageIndex < 0) {
    if (anchor.pageIndexHint) {
      // pageIndexHint is 1-based, convert to 0-based
      const hintPageIndex = anchor.pageIndexHint - 1;
      // Validate hint is in range
      if (hintPageIndex >= 0 && hintPageIndex < pageCount) {
        pageIndex = hintPageIndex;
      }
    }
  }
  
  // Final fallback: default to first page (better than skipping)
  if (pageIndex < 0) {
    pageIndex = 0;
  }
  
  // CRITICAL: Clamp pageIndex to valid range to prevent out-of-bounds errors
  // This ensures we never write invalid destinations even if anchor search or hint is wrong
  // Clamp to [0, pageCount - 1]
  if (pageIndex < 0) {
    pageIndex = 0;
  }
  if (pageIndex >= pageCount) {
    // If pageIndex is out of range, try anchor search from beginning as fallback
    const foundPage = await findAnchorInPdf(anchor.anchor, docContext, pageCount, 0);
    if (foundPage >= 0 && foundPage < pageCount) {
      pageIndex = foundPage;
    } else {
      // Last resort: clamp to last valid page (better than out-of-bounds)
      pageIndex = Math.max(0, pageCount - 1);
    }
  }
  
  // Final validation: pageIndex must be in valid range
  // This is a safety check - should never fail after clamping above
  if (pageIndex < 0 || pageIndex >= pageCount) {
    // This should never happen, but if it does, default to page 0
    pageIndex = 0;
  }
  
  // Create destination
  const destination: BookmarkDestination = {
    pageIndex,
    fitType: null, // Default (top of page)
    isValid: pageIndex >= 0 && pageIndex < pageCount,
    validationError: pageIndex >= 0 && pageIndex < pageCount
      ? undefined
      : `Page index ${pageIndex} out of range (0-${pageCount - 1})`,
  };
  
  // Create stable ID using anchor
  const id = `${source}:${anchor.anchor}`;
  
  // Create node
  const node: BookmarkNode = {
    id,
    title: anchor.title,
    level: anchor.level,
    destination,
    sourceAnchor: anchor.anchor,
    parentId,
    page: pageIndex + 1, // 1-based for display
    status: destination.isValid ? 'ok' : 'error',
    issues: destination.isValid ? undefined : [BOOKMARK_ISSUE_CODES.BOOKMARK_ANCHOR_NOT_FOUND],
  };
  
  nodes.set(id, node);
  
  // Process children
  if (anchor.children && anchor.children.length > 0) {
    const childIds: string[] = [];
    for (const childAnchor of anchor.children) {
      const childNode = await buildNodeFromAnchor(
        childAnchor,
        docContext,
        pageCount,
        nodes,
        source,
        id
      );
      if (childNode) {
        childIds.push(childNode.id);
      }
    }
    node.childIds = childIds;
  }
  
  return node;
}

/**
 * Find anchor in PDF text (search for anchor string)
 * 
 * Searches for the anchor pattern in PDF text. For numeric anchors like "1.4",
 * looks for the pattern at the start of a line or after whitespace, followed by
 * uppercase text (heading pattern) to avoid false matches in body text.
 * 
 * Uses a scoring system: prefers matches that look like headings (anchor followed
 * by uppercase text) over matches in body text.
 */
async function findAnchorInPdf(
  anchor: string,
  docContext: DocumentContext,
  pageCount: number,
  startFromPage: number = 0
): Promise<number> {
  // Normalize anchor for searching
  const searchAnchor = anchor.trim();
  
  // For numeric anchors (e.g., "1.4", "2.3"), use more specific pattern
  const numericAnchorPattern = /^(\d+\.\d+)/;
  const numericMatch = searchAnchor.match(numericAnchorPattern);
  
  let bestMatch = -1;
  let bestScore = 0;
  
  // Search each page for the anchor string
  // If startFromPage > 0, only search from that page (for windowed search)
  const searchStart = startFromPage;
  const searchEnd = pageCount;
  
  for (let pageIndex = searchStart; pageIndex < searchEnd; pageIndex++) {
    try {
      const pageContext = await docContext.getPageContext(pageIndex);
      await docContext.extractTextForPage(pageIndex);
      const text = pageContext.getText();
      
      if (numericMatch) {
        // For numeric anchors, look for pattern followed by uppercase text (heading pattern)
        const numericPart = numericMatch[1];
        // Pattern 1: Anchor at start of line, followed by space and uppercase text (strong heading match)
        // Example: "1.4 SUBMITTALS" or "1.4   SUBMITTALS"
        const strongHeadingPattern = new RegExp(`^\\s*${numericPart.replace('.', '\\.')}\\s+[A-Z][A-Z\\s]{3,}`, 'im');
        if (strongHeadingPattern.test(text)) {
          const score = 100; // Very high score for start-of-line matches
          if (score > bestScore) {
            bestScore = score;
            bestMatch = pageIndex;
          }
        }
        // Pattern 2: Anchor after whitespace, followed by uppercase text (moderate heading match)
        const moderateHeadingPattern = new RegExp(`(^|\\s)${numericPart.replace('.', '\\.')}\\s+[A-Z][A-Z\\s]{3,}`, 'i');
        const match = text.match(moderateHeadingPattern);
        if (match) {
          // Score: higher for matches at start of line, or with more uppercase text after
          const score = match[0].length + (match[1] === '' ? 10 : 0); // Bonus for start of line
          if (score > bestScore) {
            bestScore = score;
            bestMatch = pageIndex;
          }
        }
        // Fallback: simple includes check (lowest priority, only if no heading match found)
        if (bestMatch < 0 && text.includes(numericPart)) {
          bestMatch = pageIndex;
          bestScore = 1;
        }
      } else {
        // For non-numeric anchors (e.g., "23 02 00"), look for "SECTION 23 02 00" pattern
        const sectionPattern = new RegExp(`SECTION\\s+${searchAnchor.replace(/\s+/g, '\\s+')}`, 'i');
        if (sectionPattern.test(text)) {
          return pageIndex; // Strong match for section headers
        }
        // Fallback: simple includes
        if (text.includes(searchAnchor)) {
          if (bestMatch < 0) {
            bestMatch = pageIndex;
          }
        }
      }
    } catch (e) {
      // Skip page if error
      continue;
    }
  }
  
  return bestMatch; // Returns -1 if not found
}

/**
 * Build bookmark tree from inventory (drawings/specs fallback)
 */
export function buildTreeFromInventory(
  inventoryRows: Array<{
    id: string;
    page?: number;
    normalizedId?: string;
    sheetId?: string;
    sectionId?: string;
    title?: string;
    [key: string]: unknown;
  } | { id: string; page?: number; [key: string]: unknown }>,
  pageCount: number
): BookmarkTree {
  const nodes = new Map<string, BookmarkNode>();
  const roots: BookmarkNode[] = [];
  
  for (const row of inventoryRows) {
    // Only create bookmarks for rows with IDs
    const normalizedId = (row as any).normalizedId;
    const sheetId = (row as any).sheetId;
    const sectionId = (row as any).sectionId;
    
    if (!normalizedId && !sheetId && !sectionId) {
      continue;
    }
    
    // Use normalizedId, sheetId, or sectionId as logical path
    const logicalPath = normalizedId || sheetId || sectionId || '';
    const page = row.page || 1;
    const pageIndex = page - 1; // Convert 1-based to 0-based
    
    // Validate page index
    if (pageIndex < 0 || pageIndex >= pageCount) {
      continue; // Skip invalid pages
    }
    
    // Create stable ID using logical path
    const id = `inventory:${logicalPath}`;
    
    // Create destination
    const destination: BookmarkDestination = {
      pageIndex,
      fitType: null, // Default (top of page)
      isValid: true,
    };
    
    // Create bookmark title
    const title = (row as any).title || logicalPath;
    
    // Create node
    const node: BookmarkNode = {
      id,
      title,
      level: 0, // Flat hierarchy for inventory-based bookmarks
      destination,
      logicalPath,
      page,
      status: 'ok',
    };
    
    nodes.set(id, node);
    roots.push(node);
  }
  
  return {
    roots,
    nodes,
    source: 'inventory',
  };
}
