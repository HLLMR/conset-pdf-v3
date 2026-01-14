import type { PDFDocument } from 'pdf-lib';

/**
 * Bookmark entry for a page
 */
export interface BookmarkEntry {
  title: string;
  pageIndex: number; // 0-based page index in output PDF
}

/**
 * Interface for writing bookmarks to a PDF
 * This allows swapping bookmark backends (pdf-lib, pdfjs, etc.) without changing callers
 */
export interface BookmarkWriter {
  /**
   * Write bookmarks to a PDF document
   * @param pdfDoc - The PDF document to write bookmarks to
   * @param bookmarks - Array of bookmark entries (title + page index)
   * @param verbose - Verbose logging
   */
  writeBookmarks(
    pdfDoc: PDFDocument,
    bookmarks: BookmarkEntry[],
    verbose?: boolean
  ): Promise<void>;
}
