import { PDFDocument } from 'pdf-lib';
import { loadPdf, savePdf, copyPages } from '../utils/pdf.js';
import { writePdfWithPikepdf, type PikepdfWriteError } from '../utils/pikepdfWriter.js';
import type { MergePlan } from './planner.js';
import type { ConsetDocType } from '../index.js';
import { PdfLibBookmarkWriter } from '../utils/pdfLibBookmarkWriter.js';
import type { BookmarkEntry } from '../utils/bookmarkWriter.js';

interface ApplyPlanOptions {
  regenerateBookmarks?: boolean;
  type?: ConsetDocType;
  verbose?: boolean;
}

/**
 * Apply a merge plan to create the output PDF
 */
export async function applyMergePlan(
  plan: MergePlan,
  outputPath: string,
  options: ApplyPlanOptions = {}
): Promise<void> {
  const outputDoc = await PDFDocument.create();

  // Group pages by source file for efficient loading
  const sourceFiles = new Set(plan.pages.map((p) => p.sourceFile));
  const loadedDocs = new Map<string, PDFDocument>();

  // Load all source PDFs
  for (const sourceFile of sourceFiles) {
    const doc = await loadPdf(sourceFile);
    loadedDocs.set(sourceFile, doc);
  }

  // Process each page in the plan
  for (const page of plan.pages) {
    const sourceDoc = loadedDocs.get(page.sourceFile);
    if (!sourceDoc) {
      throw new Error(`Source PDF not loaded: ${page.sourceFile}`);
    }

    // Copy the page from source to output
    await copyPages(sourceDoc, outputDoc, [page.sourceIndex]);
  }

  // Generate bookmarks from inventory before saving (if requested)
  if (options.regenerateBookmarks && options.type) {
    if (options.verbose) {
      console.log('\n[Bookmarks] Generating bookmarks from detected inventory...');
    }
    
    // Build bookmark entries from plan pages (using detected IDs and titles)
    const bookmarks: BookmarkEntry[] = [];
    
    for (let i = 0; i < plan.pages.length; i++) {
      const page = plan.pages[i];
      
      // Only create bookmarks for pages with IDs
      if (page.id) {
        // Format: "SHEET_ID — Title" or just "SHEET_ID" if no title
        const bookmarkTitle = page.title 
          ? `${page.id} — ${page.title}`
          : page.id;
        
        bookmarks.push({
          title: bookmarkTitle,
          pageIndex: i, // 0-based index in output PDF
        });
        
        if (options.verbose && (i === 0 || (i + 1) % 20 === 0)) {
          console.log(`  Page ${i + 1}: "${bookmarkTitle}"`);
        }
      }
    }
    
    if (bookmarks.length > 0) {
      // Write bookmarks using BookmarkWriter interface
      const bookmarkWriter = new PdfLibBookmarkWriter();
      await bookmarkWriter.writeBookmarks(outputDoc, bookmarks, options.verbose || false);
      
      if (options.verbose) {
        console.log(`\n[Bookmarks] Generated ${bookmarks.length} bookmark(s) from inventory`);
      }
    } else {
      if (options.verbose) {
        console.log('  No bookmarks generated (no sheet IDs found in plan)');
      }
    }
  }

  // Save the output PDF (with bookmarks if generated)
  // Use pikepdf sidecar for deterministic output and cross-viewer compatibility
  try {
    await writePdfWithPikepdf(outputDoc, outputPath, {
      verbose: options.verbose || false,
      context: {
        operation: 'merge',
        docType: options.type,
      },
    });
  } catch (error: any) {
    // If pikepdf write fails, surface the error with full context
    const pikepdfError = error as PikepdfWriteError;
    const errorMsg = `Failed to write merged PDF via pikepdf: ${pikepdfError.message}`;
    const context = {
      ...pikepdfError.context,
      exitCode: pikepdfError.exitCode,
      stderr: pikepdfError.stderr,
    };
    
    // Create a new error with complete context
    const wrappedError = new Error(errorMsg);
    (wrappedError as any).context = context;
    throw wrappedError;
  }
}
