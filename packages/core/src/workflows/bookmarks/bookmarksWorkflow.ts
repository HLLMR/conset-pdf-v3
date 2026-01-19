/**
 * Bookmarks workflow implementation
 * 
 * Provides a Fix Bookmarks workflow that can read existing PDF outlines/bookmarks,
 * validate destinations, deterministically rebuild or repair bookmarks, and write
 * bookmarks that work reliably across multiple PDF viewers.
 */

import type {
  InventoryResult,
  ExecuteResult,
  CorrectionOverlay,
  InventoryRowBase,
} from '../types.js';
import type { WorkflowImpl } from '../engine.js';
import type {
  BookmarksAnalyzeInput,
  BookmarksExecuteInput,
} from './types.js';
import { DocumentContext } from '../../analyze/documentContext.js';
import { readBookmarks } from '../../bookmarks/reader.js';
import { buildTreeFromBookmarkAnchorTree, buildTreeFromInventory } from '../../bookmarks/treeBuilder.js';
import { createMergeWorkflowRunner } from '../merge/index.js';
import type { BookmarkTree } from '../../bookmarks/types.js';
import { BOOKMARK_ISSUE_CODES } from '../../bookmarks/types.js';
import { applyCorrections } from '../../bookmarks/corrections.js';
import { writeBookmarksViaSidecar } from '../../bookmarks/pikepdfBookmarkWriter.js';
import type { BookmarkEntry } from '../../utils/bookmarkWriter.js';
import { writeJson } from '../../utils/fs.js';

/**
 * Bookmarks workflow implementation
 */
export const bookmarksWorkflowImpl: WorkflowImpl<
  BookmarksAnalyzeInput,
  BookmarksAnalyzeInput,
  BookmarksExecuteInput
> = {
  /**
   * Analyze bookmarks input and produce inventory result
   * Must NOT write output files - this is a dry-run operation
   */
  async analyze(input: BookmarksAnalyzeInput): Promise<InventoryResult> {
    const { inputPdfPath, bookmarkTree: bookmarkAnchorTree, docType, profile } = input;
    
    // Load PDF via DocumentContext
    const docContext = new DocumentContext(inputPdfPath);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    let bookmarkTree: BookmarkTree;
    let sourceTree: typeof bookmarkAnchorTree;
    
    // Determine source of truth
    if (bookmarkAnchorTree) {
      // Preferred: BookmarkAnchorTree from Specs Pipeline
      // Note: analyze phase doesn't have rebuild flag, so we pass undefined
      bookmarkTree = await buildTreeFromBookmarkAnchorTree(
        bookmarkAnchorTree,
        docContext,
        pageCount,
        input.options?.style,
        { rebuild: false }
      );
      sourceTree = bookmarkAnchorTree;
    } else if (docType) {
      // Fallback: Build from inventory
      // Run merge workflow analyze to get inventory
      const mergeRunner = createMergeWorkflowRunner();
      const mergeInput = {
        docType,
        originalPdfPath: inputPdfPath,
        addendumPdfPaths: [],
        profile,
        options: {
          verbose: input.options?.verbose || false,
        },
      };
      const inventory = await mergeRunner.analyze(mergeInput);
      
      // Build bookmark tree from inventory
      bookmarkTree = buildTreeFromInventory(inventory.rows as any, pageCount);
    } else {
      // Last resort: Read existing bookmarks
      bookmarkTree = await readBookmarks(docContext, pageCount);
    }
    
    // Map bookmark tree to inventory rows
    const rows: InventoryRowBase[] = Array.from(bookmarkTree.nodes.values()).map(node => ({
      id: node.id,
      page: node.page,
      status: node.status,
      confidence: node.destination.isValid ? 1.0 : 0.0,
      notes: node.issues?.join(', '),
      tags: ['bookmark'],
      source: bookmarkTree.source,
    }));
    
    // Collect issues
    const issues = Array.from(bookmarkTree.nodes.values())
      .filter(node => node.issues && node.issues.length > 0)
      .map((node, index) => ({
        id: `issue-${node.id}-${index}`,
        severity: (node.status === 'error' ? 'error' : 'warning') as 'error' | 'warning',
        code: node.issues![0],
        message: node.destination.validationError || 'Bookmark validation failed',
        rowIds: [node.id],
      }));
    
    // Detect additional issues
    // Check for duplicate titles at same level
    const titleMap = new Map<string, string[]>();
    for (const node of bookmarkTree.nodes.values()) {
      const key = `${node.level}:${node.title}`;
      if (!titleMap.has(key)) {
        titleMap.set(key, []);
      }
      titleMap.get(key)!.push(node.id);
    }
    
    for (const [key, nodeIds] of titleMap.entries()) {
      if (nodeIds.length > 1) {
        issues.push({
          id: `issue-duplicate-${key}`,
          severity: 'warning',
          code: BOOKMARK_ISSUE_CODES.BOOKMARK_DUPLICATE_TITLE,
          message: `Multiple bookmarks with same title at level ${key.split(':')[0]}`,
          rowIds: nodeIds,
        });
      }
    }
    
    // Calculate summary
    const totalRows = rows.length;
    const rowsWithIds = rows.filter(r => r.id).length;
    const rowsWithoutIds = totalRows - rowsWithIds;
    const rowsOk = rows.filter(r => r.status === 'ok').length;
    const rowsWarning = rows.filter(r => r.status === 'warning').length;
    const rowsError = rows.filter(r => r.status === 'error').length;
    
    return {
      workflowId: 'fix-bookmarks',
      rows,
      issues,
      conflicts: [],
      summary: {
        totalRows,
        rowsWithIds,
        rowsWithoutIds,
        rowsOk,
        rowsWarning,
        rowsError,
        rowsConflict: 0,
        issuesCount: issues.length,
        conflictsCount: 0,
      },
      meta: {
        bookmarkTree,
        ...(sourceTree ? { sourceTree } : {}),
      },
    };
  },

  /**
   * Apply corrections overlay to inventory
   * Re-runs analyze() and applies corrections to the result
   */
  async applyCorrections(
    input: BookmarksAnalyzeInput,
    _inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult> {
    // Re-run analyze() for fresh state
    const freshInventory = await this.analyze(input);
    
    // Get bookmark tree from meta
    const bookmarkTree = freshInventory.meta?.bookmarkTree as BookmarkTree | undefined;
    if (!bookmarkTree) {
      return freshInventory;
    }
    
    // Load PDF to get page count
    const docContext = new DocumentContext(input.inputPdfPath);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Apply corrections
    const bookmarkCorrections = (corrections as any).bookmarkCorrections;
    if (bookmarkCorrections) {
      const correctedTree = applyCorrections(
        bookmarkTree,
        corrections as any,
        pageCount
      );
      
      // Rebuild inventory from corrected tree
      const rows: InventoryRowBase[] = Array.from(correctedTree.nodes.values()).map(node => ({
        id: node.id,
        page: node.page,
        status: node.status,
        confidence: node.destination.isValid ? 1.0 : 0.0,
        notes: node.issues?.join(', '),
        tags: ['bookmark'],
        source: correctedTree.source,
      }));
      
      // Recalculate summary
      const totalRows = rows.length;
      const rowsWithIds = rows.filter(r => r.id).length;
      const rowsWithoutIds = totalRows - rowsWithIds;
      const rowsOk = rows.filter(r => r.status === 'ok').length;
      const rowsWarning = rows.filter(r => r.status === 'warning').length;
      const rowsError = rows.filter(r => r.status === 'error').length;
      
      // Collect issues from corrected tree
      const issues = Array.from(correctedTree.nodes.values())
        .filter(node => node.issues && node.issues.length > 0)
        .map((node, index) => ({
          id: `issue-${node.id}-${index}`,
          severity: (node.status === 'error' ? 'error' : 'warning') as 'error' | 'warning',
          code: node.issues![0],
          message: node.destination.validationError || 'Bookmark validation failed',
          rowIds: [node.id],
        }));
      
      return {
        ...freshInventory,
        rows,
        issues,
        summary: {
          ...freshInventory.summary,
          totalRows,
          rowsWithIds,
          rowsWithoutIds,
          rowsOk,
          rowsWarning,
          rowsError,
          issuesCount: issues.length,
        },
        meta: {
          ...freshInventory.meta,
          bookmarkTree: correctedTree,
        },
      };
    }
    
    return freshInventory;
  },

  /**
   * Execute the workflow
   * Produces output files and returns execution result
   */
  async execute(input: BookmarksExecuteInput): Promise<ExecuteResult> {
    const {
      inputPdfPath,
      outputPdfPath,
      options = {},
      analyzed,
      corrections,
    } = input;
    
    const verbose = options.verbose || false;
    
    // Load PDF via DocumentContext
    const docContext = new DocumentContext(inputPdfPath);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Get bookmark tree (from analyzed or re-extract)
    let bookmarkTree: BookmarkTree;
    
    // Footer index and regions for audit trail (if built)
    let footerIndex: { firstPageBySection: Record<string, number>; occurrences: Record<string, number[]> } | undefined;
    let regions: any;
    
    // If rebuild mode and bookmarkTree provided, always re-shape with rebuild context
    if (options.rebuild && input.bookmarkTree) {
      // Rebuild mode: re-shape with rebuild context (defaults to specs-v1)
      // Build footer section index for footer-first anchoring
      const { buildFooterSectionIndexFast } = await import('../../specs/footerIndexBuilder.js');
      const sectionStartStrategy = input.options?.sectionStartStrategy || 'footer';
      
      if (sectionStartStrategy === 'footer') {
        try {
          const result = await buildFooterSectionIndexFast(docContext, pageCount, {
            sectionStartStrategy: 'footer',
            verbose,
          });
          footerIndex = result.footerIndex;
          regions = result.regions;
        } catch (error: any) {
          if (verbose) {
            console.warn(`  Failed to build footer index: ${error.message}, falling back to heading resolver`);
          }
        }
      }
      
      bookmarkTree = await buildTreeFromBookmarkAnchorTree(
        input.bookmarkTree,
        docContext,
        pageCount,
        input.options?.style,
        { rebuild: true, sectionStartStrategy },
        footerIndex
      );
    } else if (analyzed?.bookmarkTree) {
      // Use analyzed tree (already shaped, but not with rebuild context)
      bookmarkTree = analyzed.bookmarkTree as BookmarkTree;
    } else {
      // Re-run analyze to get bookmark tree (defaults to raw for safety)
      const analyzeInput: BookmarksAnalyzeInput = {
        inputPdfPath,
        bookmarkTree: input.bookmarkTree,
        docType: input.docType,
        profile: input.profile,
        options: {
          verbose,
          style: input.options?.style,
        },
      };
      const inventory = await this.analyze(analyzeInput);
      bookmarkTree = inventory.meta?.bookmarkTree as BookmarkTree;
      if (!bookmarkTree) {
        throw new Error('Failed to extract bookmark tree');
      }
    }
    
    // Apply corrections if provided
    if (corrections) {
      bookmarkTree = applyCorrections(bookmarkTree, corrections, pageCount);
    }
    
    // Convert bookmark tree to BookmarkEntry[] format with hierarchy preserved
    // IMPORTANT: pageIndex is 0-based (PDF internal convention)
    // This matches the convention used in treeBuilder.ts where pageIndexHint (1-based) is converted to 0-based
    // Build flat list in traversal order (roots, then their children) with level information
    // The sidecar writer will handle hierarchy via level and parent relationships
    function collectBookmarks(nodeId: string, level: number): Array<BookmarkEntry & { level: number }> {
      const node = bookmarkTree.nodes.get(nodeId);
      if (!node) {
        return [];
      }
      
      // Defensive: validate and clamp page index before using it
      let pageIndex = node.destination.pageIndex;
      if (pageIndex < 0 || pageIndex >= pageCount) {
        if (verbose) {
          console.warn(`  Skipping bookmark "${node.title}": pageIndex ${pageIndex} out of range (0-${pageCount - 1})`);
        }
        return [];
      }
      
      // Double-check isValid flag matches reality
      if (!node.destination.isValid) {
        if (verbose) {
          console.warn(`  Skipping bookmark "${node.title}": marked as invalid`);
        }
        return [];
      }
      
      const entries: Array<BookmarkEntry & { level: number }> = [{
        title: node.title,
        pageIndex, // Use validated/clamped pageIndex
        level, // Include level for sidecar writer
      }];
      
      // Add children recursively
      if (node.childIds && node.childIds.length > 0) {
        for (const childId of node.childIds) {
          entries.push(...collectBookmarks(childId, level + 1));
        }
      }
      
      return entries;
    }
    
    const bookmarks: BookmarkEntry[] = [];
    for (const root of bookmarkTree.roots) {
      bookmarks.push(...collectBookmarks(root.id, 0));
    }
    
    if (verbose && bookmarks.length > 0) {
      // Debug: log first few page indices to verify they're reasonable
      const samplePages = bookmarks.slice(0, 5).map(b => `${b.title}: pageIndex=${b.pageIndex}`).join(', ');
      console.log(`  Writing ${bookmarks.length} bookmark(s) with page indices (0-based): ${samplePages}${bookmarks.length > 5 ? '...' : ''}`);
    }
    
    // Normalize destinations to safe subset (already done in validator)
    // Write bookmarks using sidecar
    await writeBookmarksViaSidecar(
      inputPdfPath,
      outputPdfPath,
      bookmarks,
      verbose
    );
    
    // Re-read bookmarks after write (validate write succeeded)
    const outputDocContext = new DocumentContext(outputPdfPath);
    await outputDocContext.initialize();
    const writtenBookmarks = await readBookmarks(outputDocContext, outputDocContext.pageCount);
    
    // Structural validation: compare written vs read
    const writtenCount = bookmarks.length;
    const readCount = writtenBookmarks.nodes.size;
    const validationIssues: string[] = [];
    
    if (writtenCount !== readCount) {
      validationIssues.push(`Bookmark count mismatch: wrote ${writtenCount}, read ${readCount}`);
    }
    
    // Validate destinations post-write
    let destinationsValidated = 0;
    let destinationsInvalid = 0;
    let maxPageIndex = -1;
    
    for (const node of writtenBookmarks.nodes.values()) {
      if (node.destination.isValid) {
        destinationsValidated++;
        maxPageIndex = Math.max(maxPageIndex, node.destination.pageIndex);
      } else {
        destinationsInvalid++;
        validationIssues.push(`Bookmark "${node.title}" has invalid destination: ${node.destination.validationError || 'unknown error'}`);
      }
    }
    
    // Sanity check: at least one bookmark should point to a page > 0 (unless PDF only has 1 page)
    if (pageCount > 1 && maxPageIndex === 0) {
      validationIssues.push(`Warning: All bookmarks point to page 1 (0-indexed). This may indicate destination parsing issues.`);
    }
    
    // Critical: if destinations are invalid, this is a showstopper
    // Count invalid SECTION bookmarks separately (these are critical)
    let invalidSectionBookmarks = 0;
    for (const node of writtenBookmarks.nodes.values()) {
      if (!node.destination.isValid && node.level === 0 && node.title.startsWith('SECTION ')) {
        invalidSectionBookmarks++;
      }
    }
    
    // Validation gate: fail if invalid section destinations unless override flag
    const allowInvalidDestinations = input.options?.allowInvalidDestinations || false;
    
    if (destinationsInvalid > 0) {
      // Always report invalid destinations as warnings
      validationIssues.push(`ERROR: ${destinationsInvalid} bookmark(s) have invalid destinations. Navigation will not work in PDF viewers.`);
      if (invalidSectionBookmarks > 0) {
        validationIssues.push(`CRITICAL: ${invalidSectionBookmarks} SECTION bookmark(s) have invalid destinations. This indicates section resolution failed.`);
      }
    }
    
    // Add validation gate issue if sections are invalid and override not provided
    if (invalidSectionBookmarks > 0 && !allowInvalidDestinations) {
      validationIssues.push(`VALIDATION GATE: ${invalidSectionBookmarks} SECTION bookmark(s) have invalid destinations. Use --allow-invalid-destinations to override.`);
    }
    
    // Generate audit trail JSON
    const auditTrail: any = {
      inputPdfPath,
      outputPdfPath,
      bookmarksWritten: writtenCount,
      bookmarksRead: readCount,
      validationIssues,
      destinationsValidated,
      destinationsInvalid,
      bookmarkTree: {
        roots: Array.from(bookmarkTree.roots).map(root => ({
          id: root.id,
          title: root.title,
          level: root.level,
          page: root.page,
        })),
        nodes: Array.from(bookmarkTree.nodes.entries()).map(([id, node]) => ({
          id,
          title: node.title,
          level: node.level,
          page: node.page,
          destination: {
            pageIndex: node.destination.pageIndex,
            fitType: node.destination.fitType,
            isValid: node.destination.isValid,
          },
        })),
      },
      correctionsApplied: corrections?.bookmarkCorrections || {},
    };
    
    // Add footer index debug info if available
    if (regions) {
      const sectionStartStrategy = input.options?.sectionStartStrategy || (footerIndex ? 'footer' : 'heading');
      auditTrail.footerIndex = {
        strategy: sectionStartStrategy,
        regions: {
          header: { yMin: regions.header.yMin, yMax: regions.header.yMax },
          footer: { yMin: regions.footer.yMin, yMax: regions.footer.yMax },
        },
        sectionCount: footerIndex ? Object.keys(footerIndex.firstPageBySection).length : 0,
        sections: footerIndex ? Object.entries(footerIndex.firstPageBySection).map(([code, page]) => ({
          code,
          firstPage: page,
          occurrenceCount: footerIndex.occurrences[code]?.length || 0,
        })) : [],
      };
    }
    
    // Write audit trail JSON if requested
    if (options.reportPath) {
      await writeJson(options.reportPath, auditTrail);
    }
    
    // Write bookmark tree JSON if requested
    if (options.jsonOutputPath) {
      await writeJson(options.jsonOutputPath, {
        bookmarkTree: auditTrail.bookmarkTree,
      });
    }
    
    // Compute success: 
    // - Filter out validation gate issues if override is enabled
    // - Invalid section destinations fail unless override
    // - Other invalid destinations (articles) are warnings but don't fail the gate
    const gateIssues = validationIssues.filter(issue => issue.includes('VALIDATION GATE'));
    // Success if: no validation gate issues (or override enabled), and invalid section bookmarks allowed if override
    const success = (allowInvalidDestinations ? gateIssues.length === 0 : validationIssues.length === 0) &&
                   (invalidSectionBookmarks === 0 || allowInvalidDestinations);
    
    return {
      outputs: {
        outputPdfPath,
        ...(options.reportPath ? { reportPath: options.reportPath } : {}),
        ...(options.jsonOutputPath ? { bookmarkTreeJsonPath: options.jsonOutputPath } : {}),
      },
      summary: {
        success,
        bookmarksRead: readCount,
        bookmarksWritten: writtenCount,
        bookmarksDeleted: 0, // TODO: Track deletions
        bookmarksRenamed: 0, // TODO: Track renames
        bookmarksRetargeted: 0, // TODO: Track retargets
        issuesResolved: 0, // TODO: Track resolved issues
        issuesCreated: validationIssues.length,
        destinationsValidated,
        destinationsInvalid,
      },
      warnings: validationIssues.length > 0 ? validationIssues : undefined,
    };
  },
};
