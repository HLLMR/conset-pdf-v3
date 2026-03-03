import type { ConsetDocType } from '../index.js';
import { naturalCompare } from '../utils/sort.js';
import { writeJson } from '../utils/fs.js';
import { DocumentContext } from '../analyze/documentContext.js';
import type { SheetLocator } from '../locators/sheetLocator.js';

export interface PageId {
  normalizedId: string;
  originalId: string;
  pageIndex: number; // 0-based
  confidence: number;
}

export interface IdPageMap {
  [normalizedId: string]: PageId[];
}

export interface MergePlan {
  pages: Array<{
    source: 'original' | 'addendum';
    sourceIndex: number; // 0-based page index in source
    sourceFile: string; // file path
    id?: string; // normalized ID if available
    title?: string; // sheet title if available (from inventory)
  }>;
  replaced: Array<{
    id: string;
    originalPageIndexes: number[];
    addendumPageIndexes: number[];
    addendumSource: string;
  }>;
  inserted: Array<{
    id: string;
    insertedAtIndex: number;
    pageCount: number;
    addendumSource: string;
  }>;
  unmatched: Array<{
    reason: 'no-id' | 'ambiguous' | 'unmatched';
    addendumSource: string;
    pageIndexes: number[];
  }>;
  parseWarnings: string[];
  parseNotices?: string[]; // Informational notices (e.g., page 1 cover sheet detection)
}

/**
 * Parse all pages of a PDF and extract IDs
 */
interface ParseResult {
  pageIds: PageId[];
  warnings: string[];
  notices?: string[];
  docContext?: DocumentContext; // DocumentContext for single-load access
  inventory?: Array<{
    pageIndex: number;
    sheetId?: string;
    sectionId?: string;
    sheetIdNormalized?: string;
    sectionIdNormalized?: string;
    title?: string;
    confidence?: number;
    source?: string;
    context?: string;
    warning?: string;
    _parseTimeMs?: number; // Internal timing, removed before writing
  }>;
  // Map from pageIndex to title for bookmark generation
  pageTitleMap?: Map<number, string>;
  // Path to cached inventory JSON file (if writeInventory=true)
  inventoryPath?: string;
}

async function parsePdfIds(
  pdfPath: string,
  type: ConsetDocType,
  locator: SheetLocator | null, // Must be provided (default locators created in command)
  verbose: boolean = false,
  writeInventory: boolean = false,
  inventoryOutputDir?: string
): Promise<ParseResult> {
  const pageIds: PageId[] = [];
  const warnings: string[] = [];
  const notices: string[] = [];
  const inventory: ParseResult['inventory'] = [];
  const parseStart = Date.now();

  let docContext: DocumentContext | undefined;
  
  if (type === 'drawings') {
    // Create document context for caching
    docContext = new DocumentContext(pdfPath);
    await docContext.initialize();
    
    // If locator supports setDocumentContext (LegacyTitleblockLocator or CompositeLocator), set it for single-load
    // Note: setDocumentContext is an optional method not in SheetLocator interface
    // Some locators (CompositeLocator) implement it for optimization
    // We check dynamically and cast to 'any' to call it
    if (locator && typeof (locator as any).setDocumentContext === 'function') {
      (locator as any).setDocumentContext(docContext);
    }
    
    const pageCount = docContext.pageCount;
    
    // Instrumentation: prove single-load
    const instrumentation = docContext.getInstrumentation();
    if (verbose) {
      console.log(`Parsing ${pageCount} pages for sheet IDs...`);
      console.log(`[Instrumentation] PDF loaded once (loadId: ${instrumentation.loadId}, total loads: ${instrumentation.totalLoads})`);
      if (locator) {
        console.log(`Using locator: ${locator.getName()}`);
      }
    }
    
    // Extract text for all pages in batches (cached)
    const allPageIndexes = Array.from({ length: pageCount }, (_, i) => i);
    await docContext.extractTextForPages(allPageIndexes);
    
    for (let i = 0; i < pageCount; i++) {
      const pageStart = Date.now();
      
      if (verbose && (i === 0 || (i + 1) % 10 === 0)) {
        console.log(`Processing page ${i + 1}/${pageCount}...`);
      }
      
      // Get page context (text already extracted and cached)
      const pageContext = await docContext.getPageContext(i);
      
      // Use locator (always provided - LegacyTitleblockLocator is default)
      if (!locator) {
        throw new Error('No locator provided. This should not happen - LegacyTitleblockLocator should be default.');
      }
      
      let parsed: { id: string; normalized: string; confidence: number; source: string; context?: string; warning?: string; title?: string } | null = null;
      let extractedTitle: string | undefined;
      
      const result = await locator.locate(pageContext);
      if (result.id && result.confidence >= 0.60) {
        const normalizedId = result.sheetIdNormalized || result.id;
        parsed = {
          id: result.id,
          normalized: normalizedId,
          confidence: result.confidence,
          source: result.method as any,
          context: result.context,
          warning: result.warnings.length > 0 ? result.warnings.join('; ') : undefined,
          title: result.title,
        };
        extractedTitle = result.title;
        // Add warnings (including multiple matches, etc.)
        warnings.push(...result.warnings.map(w => `Page ${i + 1}: ${w}`));
      } else if (result.id) {
        // Found ID but confidence too low
        warnings.push(`Page ${i + 1}: ROI found ID "${result.id}" but confidence ${result.confidence.toFixed(2)} below threshold (0.60). ${result.warnings.length > 0 ? result.warnings.join('; ') : ''}`);
      } else {
        // No ID found - add detailed failure reason
        // Page 1 ROI_EMPTY should be a notice (likely cover sheet), not a warning
        if (result.warnings.length > 0) {
          const isPage1 = i === 0;
          const isROIEmpty = result.warnings.some(w => w.includes('ROI_EMPTY') || w.includes('empty'));
          
          if (isPage1 && isROIEmpty) {
            // Convert to notice with updated wording
            // Extract ROI count from the warning message or use locator info
            const roiCountMatch = result.warnings[0]?.match(/All (\d+) ROI/);
            const roiCount = roiCountMatch ? roiCountMatch[1] : '1';
            
            const noticeMsg = result.warnings.map(w => {
              if (w.includes('ROI') && w.includes('empty')) {
                // Extract ROI number and failure reason
                const roiMatch = w.match(/ROI (\d+) empty: (.+?)(?:; All .+ failed: (.+))?/);
                if (roiMatch) {
                  const roiNum = roiMatch[1];
                  const failureReason = roiMatch[3] || 'ROI_EMPTY';
                  return `Page ${i + 1}: ROI ${roiNum} empty: No text found in ROI; All ${roiCount} ROI(s) failed: ROI ${roiNum}: ${failureReason}; Likely cover sheet: Review output to confirm`;
                }
                // Fallback if regex doesn't match
                return `Page ${i + 1}: ${w}; Likely cover sheet: Review output to confirm`;
              }
              return `Page ${i + 1}: ${w}`;
            }).join('; ');
            notices.push(noticeMsg);
          } else {
            warnings.push(`Page ${i + 1}: ${result.warnings.join('; ')}`);
          }
        } else {
          warnings.push(`Page ${i + 1}: No sheet ID found`);
        }
      }

      const pageTime = Date.now() - pageStart;
      
      // Add to inventory
      inventory.push({
        pageIndex: i,
        sheetId: parsed?.id,
        sheetIdNormalized: parsed?.normalized,
        title: extractedTitle || parsed?.title,
        confidence: parsed?.confidence,
        source: parsed?.source,
        context: parsed?.context,
        warning: parsed?.warning,
        _parseTimeMs: pageTime,
      });

      // Special handling for page 0 (cover page)
      // If page 0 has no ID or has low confidence from fallback (no title block detected),
      // treat it as a cover page and assign special ID for merge matching
      const isCoverPage = i === 0 && (
        !parsed || 
        (parsed.source.includes('fallback') && parsed.confidence < 0.75)
      );
      
      if (isCoverPage) {
        // Assign special cover page ID so it can be matched and replaced
        const coverPageId = 'COVER';
        const coverPageNormalized = 'COVER';
        
        if (verbose) {
          if (parsed) {
            console.log(`  [Cover Page] Page 1 detected ID "${parsed.id}" but treating as cover page (low confidence fallback detection)`);
          } else {
            console.log(`  [Cover Page] Page 1 has no sheet ID - treating as cover page`);
          }
        }
        
        // Add cover page to pageIds for merge matching
        pageIds.push({
          normalizedId: coverPageNormalized,
          originalId: coverPageId,
          pageIndex: i,
          confidence: 1.0, // High confidence for cover page detection
        });
        
        // Update inventory entry to reflect cover page
        const coverPageInventoryIndex = inventory.findIndex(inv => inv.pageIndex === i);
        if (coverPageInventoryIndex >= 0) {
          inventory[coverPageInventoryIndex].sheetId = coverPageId;
          inventory[coverPageInventoryIndex].sheetIdNormalized = coverPageNormalized;
          inventory[coverPageInventoryIndex].title = 'Cover Page';
          inventory[coverPageInventoryIndex].confidence = 1.0;
          inventory[coverPageInventoryIndex].source = 'cover-page';
          inventory[coverPageInventoryIndex].context = 'Cover page (no title block detected)';
        } else {
          // Create inventory entry if it doesn't exist
          inventory.push({
            pageIndex: i,
            sheetId: coverPageId,
            sheetIdNormalized: coverPageNormalized,
            title: 'Cover Page',
            confidence: 1.0,
            source: 'cover-page',
            context: 'Cover page (no title block detected)',
          });
        }
        // Note: pageTitleMap will be built from inventory at the end of parsePdfIds
      } else if (parsed) {
        // Check confidence thresholds
        if (parsed.confidence >= 0.60) {
          pageIds.push({
            normalizedId: parsed.normalized,
            originalId: parsed.id,
            pageIndex: i,
            confidence: parsed.confidence,
          });
          
          if (parsed.warning) {
            const contextInfo = parsed.context ? ` (${parsed.context})` : '';
            const warningMsg = `Page ${i + 1}: ${parsed.warning} for "${parsed.id}" (source: ${parsed.source})${contextInfo}`;
            warnings.push(warningMsg);
            if (verbose) {
              console.log(`  ⚠️  ${warningMsg}`);
            }
          } else if (verbose) {
            const contextInfo = parsed.context ? ` - ${parsed.context}` : '';
            console.log(`  ✓ Page ${i + 1}: Found "${parsed.id}" -> "${parsed.normalized}" (${parsed.source}, confidence: ${parsed.confidence.toFixed(2)})${contextInfo}`);
          }
        } else {
          // Below threshold - ambiguous
          const contextInfo = parsed.context ? ` (${parsed.context})` : '';
          const ambiguousMsg = `Page ${i + 1}: Ambiguous sheet ID "${parsed.id}" (confidence: ${parsed.confidence.toFixed(2)}, source: ${parsed.source})${contextInfo}`;
          if (verbose) {
            console.log(`  ✗ ${ambiguousMsg}`);
            console.log(`    → This ID was detected but confidence is too low. It will be ignored.`);
            console.log(`    → Source: ${parsed.source === 'bookmark' ? 'PDF bookmark' : parsed.source === 'title-block' ? 'title block text' : 'page text'}`);
            if (parsed.context) {
              console.log(`    → Context: ${parsed.context}`);
            }
          }
          warnings.push(ambiguousMsg);
        }
      } else {
        // No ID found (and not page 0)
        if (verbose && i > 0) {
          console.log(`  ✗ Page ${i + 1}: No sheet ID found`);
        }
      }
    }
    
    // Handle cover page: if first page has no ID, it's a cover page and stays at position 1
    // This is already handled by preserving original order in the working set
  } else {
    // Use DocumentContext for specs too (single-load)
    docContext = new DocumentContext(pdfPath);
    await docContext.initialize();
    
    // If locator is SpecsSectionLocator, set DocumentContext for single-load
    // Note: setDocumentContext is an optional method not in SheetLocator interface
    // Some locators (CompositeLocator) implement it for optimization
    // We check dynamically and cast to 'any' to call it
    if (locator && typeof (locator as any).setDocumentContext === 'function') {
      (locator as any).setDocumentContext(docContext);
    }
    
    const pageCount = docContext.pageCount;
    
    if (verbose) {
      console.log(`Parsing ${pageCount} pages for section IDs...`);
      if (locator) {
        console.log(`Using locator: ${locator.getName()}`);
      }
    }
    
    // Extract text for all pages using DocumentContext
    const allPageIndexes = Array.from({ length: pageCount }, (_, i) => i);
    await docContext.extractTextForPages(allPageIndexes);
    
    // Use locator (always provided - SpecsSectionLocator is default for specs)
    if (!locator) {
      throw new Error('No locator provided. This should not happen - SpecsSectionLocator should be default for specs type.');
    }
    
    for (let i = 0; i < pageCount; i++) {
      const pageStart = Date.now();
      
      if (verbose && (i === 0 || (i + 1) % 10 === 0)) {
        console.log(`Processing page ${i + 1}/${pageCount}...`);
      }
      
      // Get page context (text already extracted and cached)
      const pageContext = await docContext.getPageContext(i);
      
      // Use locator to detect section ID
      const result = await locator.locate(pageContext);
      
      const pageTime = Date.now() - pageStart;
      
      inventory.push({
        pageIndex: i,
        sectionId: result.id,
        sectionIdNormalized: result.sectionIdNormalized,
        confidence: result.confidence,
        _parseTimeMs: pageTime,
      });
      
      if (result.id && result.confidence >= 0.5) {
        const normalizedId = result.sectionIdNormalized || result.id;
        pageIds.push({
          normalizedId,
          originalId: result.id,
          pageIndex: i,
          confidence: result.confidence,
        });
        
        // Add warnings (including multiple matches, etc.)
        if (result.warnings.length > 0) {
          warnings.push(...result.warnings.map(w => `Page ${i + 1}: ${w}`));
        }
        
        if (verbose) {
          const contextInfo = result.context ? ` - ${result.context}` : '';
          console.log(`  ✓ Page ${i + 1}: Found "${result.id}" -> "${normalizedId}" (${result.method}, confidence: ${result.confidence.toFixed(2)})${contextInfo}`);
        }
      } else {
        // No ID found or confidence too low - add detailed failure reason
        if (result.warnings.length > 0) {
          warnings.push(`Page ${i + 1}: ${result.warnings.join('; ')}`);
        } else if (result.id) {
          warnings.push(`Page ${i + 1}: Found ID "${result.id}" but confidence ${result.confidence.toFixed(2)} below threshold (0.50)`);
        } else {
          warnings.push(`Page ${i + 1}: No section ID found`);
        }
        
        if (verbose && i > 0) {
          const failureReason = result.warnings.length > 0 ? ` (${result.warnings[0]})` : '';
          console.log(`  ✗ Page ${i + 1}: No section ID found${failureReason}`);
        }
      }
    }
  }

  const parseTime = Date.now() - parseStart;
  
  // Write inventory file if requested
  let inventoryPath: string | undefined;
  if (writeInventory) {
    // Determine inventory file path
    if (inventoryOutputDir) {
      // Use organized output directory
      const path = await import('path');
      const fs = await import('fs/promises');
      const baseName = path.basename(pdfPath, path.extname(pdfPath));
      // Ensure output directory exists
      await fs.mkdir(inventoryOutputDir, { recursive: true });
      inventoryPath = path.join(inventoryOutputDir, `${baseName}-inventory.json`);
    } else {
      // Default: next to source PDF
      inventoryPath = pdfPath.replace(/\.pdf$/i, '-inventory.json');
    }
    
    const inventoryData = {
      sourceFile: pdfPath,
      type,
      totalPages: docContext ? docContext.pageCount : inventory.length,
      parseTimeMs: parseTime,
      pagesWithIds: pageIds.length,
      pagesWithoutIds: inventory.length - pageIds.length,
      warnings: warnings.length,
      inventory: inventory.map(item => {
        const { _parseTimeMs, ...rest } = item;
        return rest;
      }),
      performance: {
        totalParseTimeMs: parseTime,
        averageTimePerPageMs: parseTime / inventory.length,
        slowestPages: inventory
          .filter(item => item._parseTimeMs)
          .sort((a, b) => (b._parseTimeMs || 0) - (a._parseTimeMs || 0))
          .slice(0, 10)
          .map(item => ({
            pageIndex: item.pageIndex,
            parseTimeMs: item._parseTimeMs,
          })),
      },
    };
    
    await writeJson(inventoryPath, inventoryData);
    if (verbose) {
      console.log(`\n📋 Inventory written to: ${inventoryPath}`);
    }
  }

  // Build page title map for bookmark generation
  const pageTitleMap = new Map<number, string>();
  for (const item of inventory) {
    if (item.title && item.pageIndex !== undefined) {
      pageTitleMap.set(item.pageIndex, item.title);
    }
  }
  
  return { pageIds, warnings, notices, docContext, inventory, pageTitleMap, inventoryPath };
}

/**
 * Build a map from normalized ID to list of pages
 */
function buildIdMap(pageIds: PageId[], verbose: boolean = false, sourceName: string = 'PDF'): IdPageMap {
  const map: IdPageMap = {};
  const duplicates: Array<{ id: string; pages: PageId[] }> = [];
  
  for (const pageId of pageIds) {
    if (!map[pageId.normalizedId]) {
      map[pageId.normalizedId] = [];
    }
    map[pageId.normalizedId].push(pageId);
  }
  
  // Check for duplicates
  for (const [normalizedId, pages] of Object.entries(map)) {
    if (pages.length > 1) {
      duplicates.push({ id: normalizedId, pages });
    }
  }
  
  if (duplicates.length > 0 && verbose) {
    console.log(`\n⚠️  [DUPLICATES] Found ${duplicates.length} duplicate ID(s) in ${sourceName}:`);
    for (const dup of duplicates) {
      const pageList = dup.pages.map(p => `page ${p.pageIndex + 1} (${p.originalId})`).join(', ');
      console.log(`  - ID "${dup.id}" appears on ${dup.pages.length} pages: ${pageList}`);
      console.log(`    → Will keep first occurrence (page ${dup.pages[0].pageIndex + 1}), others will be removed during merge`);
    }
  }
  
  return map;
}

/**
 * Plan the merge operation
 * 
 * @param includeInventory - If true, returns both plan and combined inventory from all PDFs
 * @param replacementOverrides - Optional map of addendum pages to target original IDs they should replace
 *                               Key format: "addendumIndex:pageIndex" (e.g., "0:5" for first addendum page 5)
 *                               Value: original normalized ID to replace (e.g., "M-101" or "23-05-00")
 * @returns MergePlan (and optionally inventory when includeInventory=true)
 */
export async function planMerge(
  originalPath: string,
  addendumPaths: string[],
  type: ConsetDocType,
  mode: 'replace+insert' | 'replace-only' | 'append-only',
  strict: boolean,
  locator: SheetLocator | null,
  verbose: boolean = false,
  writeInventory: boolean = false,
  inventoryOutputDir?: string,
  includeInventory: boolean = false,
  replacementOverrides?: Map<string, string>
): Promise<
  | (MergePlan & { originalDocContext?: DocumentContext; inventoryPath?: string })
  | (MergePlan & { originalDocContext?: DocumentContext; inventory: ParseResult['inventory']; inventoryPath?: string })
> {
  const parseStart = Date.now();

  // Parse original PDF
  const originalResult = await parsePdfIds(originalPath, type, locator, verbose, writeInventory, inventoryOutputDir);
  const originalPageIds = originalResult.pageIds;
  const parseWarnings = originalResult.warnings;
  const parseNotices = originalResult.notices || [];
  const originalDocContext = originalResult.docContext;
  
  // Build ID map and detect duplicates with detailed logging
  const originalIdMap = buildIdMap(originalPageIds, verbose, 'original PDF');
  
  // Detailed duplicate analysis
  const duplicateGroups: Array<{ id: string; pages: PageId[] }> = [];
  for (const [normalizedId, pages] of Object.entries(originalIdMap)) {
    if (pages.length > 1) {
      duplicateGroups.push({ id: normalizedId, pages });
    }
  }
  
  if (duplicateGroups.length > 0) {
    if (verbose) {
      console.log(`\n🔍 [DUPLICATE ANALYSIS] Found ${duplicateGroups.length} ID(s) with multiple pages:`);
      for (const dup of duplicateGroups) {
        console.log(`\n  ID "${dup.id}" (normalized from "${dup.pages[0].originalId}"):`);
        for (const page of dup.pages) {
          console.log(`    - Page ${page.pageIndex + 1}: originalId="${page.originalId}", confidence=${page.confidence.toFixed(2)}`);
        }
        console.log(`    → Will keep first occurrence (page ${dup.pages[0].pageIndex + 1})`);
      }
    }
  }
  
  if (verbose) {
    const originalTotalPages = originalDocContext ? originalDocContext.pageCount : originalPageIds.length;
    console.log(`\nFound ${originalPageIds.length} pages with IDs out of ${originalTotalPages} total pages`);
    if (parseWarnings.length > 0) {
      console.log(`\nWarnings during parsing:`);
      parseWarnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }
  }

  // Build working set: list of pages with their IDs and titles
  interface WorkingPage {
    id: string | null; // normalized ID, or null if unmatched
    title: string | undefined; // sheet title if available
    source: 'original' | 'addendum';
    sourceIndex: number;
    sourceFile: string;
  }

  // Build working set preserving original page order
  // Create a map of pageIndex -> pageId for quick lookup
  const pageIdMap = new Map<number, string>();
  for (const pid of originalPageIds) {
    pageIdMap.set(pid.pageIndex, pid.normalizedId);
  }
  
  // Create a map of pageIndex -> title from inventory
  const originalPageTitleMap = originalResult.pageTitleMap || new Map<number, string>();

  const workingSet: WorkingPage[] = [];
  const originalTotalPages = originalDocContext ? originalDocContext.pageCount : originalPageIds.length;
  
  // Add all pages in original order
  // Note: If first page has no ID, it's treated as a cover page and stays at position 1
  for (let i = 0; i < originalTotalPages; i++) {
    workingSet.push({
      id: pageIdMap.get(i) || null,
      title: originalPageTitleMap.get(i),
      source: 'original' as const,
      sourceIndex: i,
      sourceFile: originalPath,
    });
  }
  
  // Note: Cover page handling - if first page has no ID, it stays at position 1
  // This is already handled by preserving original order above

  const replaced: MergePlan['replaced'] = [];
  const inserted: MergePlan['inserted'] = [];
  const unmatched: MergePlan['unmatched'] = [];

  // Collect inventory if requested
  const combinedInventory: ParseResult['inventory'] = includeInventory
    ? [...(originalResult.inventory || [])]
    : undefined;

  // Process each addendum in order
  for (let addendumIndex = 0; addendumIndex < addendumPaths.length; addendumIndex++) {
    const addendumPath = addendumPaths[addendumIndex];
    if (verbose) {
      console.log(`\nProcessing addendum ${addendumIndex}: ${addendumPath}`);
    }
    const addendumResult = await parsePdfIds(addendumPath, type, locator, verbose, writeInventory, inventoryOutputDir);
    const addendumPageIds = addendumResult.pageIds;
    parseWarnings.push(...addendumResult.warnings);
    parseNotices.push(...(addendumResult.notices || []));
    const addendumIdMap = buildIdMap(addendumPageIds, verbose, `addendum: ${addendumPath}`);
    const addendumDocContext = addendumResult.docContext;
    const addendumTotalPages = addendumDocContext ? addendumDocContext.pageCount : addendumPageIds.length;
    
    // Collect inventory if requested
    if (includeInventory && addendumResult.inventory) {
      combinedInventory!.push(...addendumResult.inventory);
    }
    
    // Create a map of pageIndex -> title from inventory
    const addendumPageTitleMap = addendumResult.pageTitleMap || new Map<number, string>();
    
    if (verbose) {
      console.log(`\nFound ${addendumPageIds.length} pages with IDs out of ${addendumTotalPages} total pages`);
      if (addendumResult.warnings.length > 0) {
        console.log(`Warnings:`);
        addendumResult.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
      }
    }

    // Track which addendum pages we've processed
    const processedPages = new Set<number>();

    // Process pages with IDs
    for (const [normalizedId, pageIds] of Object.entries(addendumIdMap)) {
      const addendumPages = pageIds.map((pid) => pid.pageIndex);
      addendumPages.forEach((idx) => processedPages.add(idx));

      // Check for replacement override for this addendum page
      // If user manually specified which original item this should replace, use that instead
      let searchId = normalizedId;
      let hasOverride = false;
      
      if (replacementOverrides && addendumPages.length > 0) {
        // Check if any of these pages has a replacement override
        // Use the first page's override if multiple pages have same ID
        const overrideKey = `${addendumIndex}:${addendumPages[0]}`;
        const overrideTarget = replacementOverrides.get(overrideKey);
        if (overrideTarget) {
          searchId = overrideTarget;
          hasOverride = true;
          if (verbose) {
            console.log(`  [OVERRIDE] Addendum page ${addendumPages[0] + 1} (ID "${normalizedId}") will replace original ID "${overrideTarget}"`);
          }
        }
      }

      // Find existing pages with this ID in working set (using override target if specified)
      const existingIndexes = workingSet
        .map((wp, idx) => (wp.id === searchId ? idx : -1))
        .filter((idx) => idx !== -1);

      if (existingIndexes.length > 0 && mode !== 'append-only') {
        // Replace existing pages
        const originalPageIndexes = existingIndexes
          .map((idx) => workingSet[idx])
          .filter((wp) => wp.source === 'original')
          .map((wp) => wp.sourceIndex);

        if (originalPageIndexes.length > 0) {
          if (verbose) {
            const existingPages = existingIndexes.map(idx => {
              const wp = workingSet[idx];
              return `position ${idx + 1} (${wp.source} page ${wp.sourceIndex + 1})`;
            }).join(', ');
            const addendumPageList = addendumPages.map(p => `page ${p + 1}`).join(', ');
            const replacementLabel = hasOverride ? `[MANUAL OVERRIDE] Addendum "${normalizedId}"` : `ID "${normalizedId}"`;
            console.log(`\n  [REPLACEMENT] ${replacementLabel}:`);
            console.log(`    Found ${existingIndexes.length} existing page(s) at: ${existingPages}`);
            console.log(`    Replacing with ${addendumPages.length} addendum page(s): ${addendumPageList}`);
            if (existingIndexes.length > 1) {
              console.log(`    ⚠️  WARNING: Multiple pages with same ID will be removed!`);
            }
          }
          
          replaced.push({
            id: normalizedId,
            originalPageIndexes,
            addendumPageIndexes: addendumPages,
            addendumSource: addendumPath,
          });

          // Remove old pages and insert new ones at the same position
          const insertIndex = existingIndexes[0];
          // Remove existing pages
          for (let i = existingIndexes.length - 1; i >= 0; i--) {
            workingSet.splice(existingIndexes[i], 1);
          }
          // Insert new pages at the position
          for (let i = 0; i < addendumPages.length; i++) {
            workingSet.splice(insertIndex + i, 0, {
              id: normalizedId,
              title: addendumPageTitleMap.get(addendumPages[i]),
              source: 'addendum' as const,
              sourceIndex: addendumPages[i],
              sourceFile: addendumPath,
            });
          }
        }
      } else if (mode === 'replace+insert' || mode === 'append-only') {
        // Insert new pages in correct position based on natural sort
        let insertIndex = workingSet.length;

        // Find insertion point using natural sort
        // Look for the first page with an ID that comes after this one
        for (let i = 0; i < workingSet.length; i++) {
          const wp = workingSet[i];
          if (wp.id !== null && naturalCompare(normalizedId, wp.id) < 0) {
            insertIndex = i;
            break;
          }
        }
        
        // If we didn't find a position, check if we should insert before pages without IDs
        // (pages with IDs should come before pages without IDs)
        if (insertIndex === workingSet.length) {
          // Find the first page without an ID and insert before it
          for (let i = 0; i < workingSet.length; i++) {
            if (workingSet[i].id === null) {
              insertIndex = i;
              break;
            }
          }
        }

        inserted.push({
          id: normalizedId,
          insertedAtIndex: insertIndex,
          pageCount: addendumPages.length,
          addendumSource: addendumPath,
        });

        // Insert pages
        for (let i = 0; i < addendumPages.length; i++) {
          workingSet.splice(insertIndex + i, 0, {
            id: normalizedId,
            title: addendumPageTitleMap.get(addendumPages[i]),
            source: 'addendum' as const,
            sourceIndex: addendumPages[i],
            sourceFile: addendumPath,
          });
        }
      } else {
        // replace-only mode: unmatched new IDs
        unmatched.push({
          reason: 'unmatched',
          addendumSource: addendumPath,
          pageIndexes: addendumPages,
        });
      }
    }

    // Process pages without IDs
    const unmatchedPages: number[] = [];
    for (let i = 0; i < addendumTotalPages; i++) {
      if (!processedPages.has(i)) {
        unmatchedPages.push(i);
      }
    }

    if (unmatchedPages.length > 0) {
      if (strict) {
        throw new Error(
          `Strict mode: Found ${unmatchedPages.length} pages without IDs in ${addendumPath}`
        );
      }

      if (mode === 'append-only') {
        // Append unmatched pages
        for (const pageIndex of unmatchedPages) {
          workingSet.push({
            id: null,
            title: addendumPageTitleMap.get(pageIndex),
            source: 'addendum' as const,
            sourceIndex: pageIndex,
            sourceFile: addendumPath,
          });
        }
      } else {
        unmatched.push({
          reason: 'no-id',
          addendumSource: addendumPath,
          pageIndexes: unmatchedPages,
        });
      }
    }
  }

  const parseTime = Date.now() - parseStart;
  
  if (verbose) {
    console.log(`\n⏱️  Parse time: ${parseTime}ms (${(parseTime / 1000).toFixed(2)}s)`);
  }

  const result: MergePlan & { originalDocContext?: DocumentContext; inventory?: ParseResult['inventory']; inventoryPath?: string } = {
    pages: workingSet.map((wp) => ({
      source: wp.source,
      sourceIndex: wp.sourceIndex,
      sourceFile: wp.sourceFile,
      id: wp.id || undefined,
      title: wp.title,
    })),
    replaced,
    inserted,
    unmatched,
    parseWarnings, // Include warnings in plan
    parseNotices: parseNotices.length > 0 ? parseNotices : undefined, // Include notices in plan
  };
  
  // Attach DocumentContext for use in report generation (avoids re-loading PDF)
  if (originalDocContext) {
    (result as any).originalDocContext = originalDocContext;
  }
  
  // Attach inventory if requested
  if (includeInventory) {
    result.inventory = combinedInventory;
  }
  
  // Attach inventory path from original PDF parsing
  if (originalResult.inventoryPath) {
    (result as any).inventoryPath = originalResult.inventoryPath;
  }
  
  return result;
}
