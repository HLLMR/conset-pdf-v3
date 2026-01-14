import type { PDFDocument } from 'pdf-lib';
import type { BookmarkWriter, BookmarkEntry } from './bookmarkWriter.js';

/**
 * PdfLibBookmarkWriter - Implementation using pdf-lib
 * 
 * Note: pdf-lib has limited bookmark support. This implementation uses
 * direct PDF dictionary manipulation which may not work perfectly in all PDF viewers.
 * The backend can be swapped for a different implementation if needed.
 */
export class PdfLibBookmarkWriter implements BookmarkWriter {
  async writeBookmarks(
    pdfDoc: PDFDocument,
    bookmarks: BookmarkEntry[],
    verbose: boolean = false
  ): Promise<void> {
    if (bookmarks.length === 0) {
      if (verbose) {
        console.log('  No bookmarks to create');
      }
      return;
    }

    // Remove existing bookmarks by clearing the outline
    try {
      const catalog = pdfDoc.catalog;
      if (catalog && (catalog as any).dict) {
        (catalog as any).dict.delete('Outlines');
      }
    } catch (e) {
      // Ignore if outlines don't exist
    }

    try {
      const { PDFDict, PDFName, PDFString, PDFArray } = await import('pdf-lib');
      
      // Create outline items as a simple linked list (forward only to avoid circular refs)
      const outlineItemRefs: any[] = [];
      
      for (let i = 0; i < bookmarks.length; i++) {
        const bookmark = bookmarks[i];
        try {
          const page = pdfDoc.getPage(bookmark.pageIndex);
          const pageRef = page.ref;
          
          // Create outline item dictionary
          const outlineItem = PDFDict.withContext(pdfDoc.context);
          outlineItem.set(PDFName.of('Title'), PDFString.of(bookmark.title));
          
          // Create destination
          const destArray = PDFArray.withContext(pdfDoc.context);
          destArray.push(pageRef);
          destArray.push(PDFName.of('XYZ'));
          destArray.push(pdfDoc.context.obj(null));
          destArray.push(pdfDoc.context.obj(null));
          destArray.push(pdfDoc.context.obj(null));
          
          outlineItem.set(PDFName.of('Dest'), destArray);
          
          outlineItemRefs.push(outlineItem);
        } catch (error: any) {
          // Always log bookmark creation errors - they indicate a problem
          console.error(`  ⚠️  Failed to create bookmark for page ${bookmark.pageIndex + 1}: ${error?.message}`);
          if (verbose && error?.stack) {
            console.error(`  Stack: ${error.stack}`);
          }
        }
      }
      
      if (outlineItemRefs.length === 0) {
        return;
      }
      
      // Link items (forward only)
      for (let i = 0; i < outlineItemRefs.length - 1; i++) {
        outlineItemRefs[i].set(PDFName.of('Next'), outlineItemRefs[i + 1]);
      }
      
      // Create outline dictionary
      const outlineDict = PDFDict.withContext(pdfDoc.context);
      outlineDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
      outlineDict.set(PDFName.of('First'), outlineItemRefs[0]);
      outlineDict.set(PDFName.of('Last'), outlineItemRefs[outlineItemRefs.length - 1]);
      outlineDict.set(PDFName.of('Count'), pdfDoc.context.obj(outlineItemRefs.length));
      
      // Add to catalog - use direct dict access
      const catalog = pdfDoc.catalog as any;
      const catalogDict = catalog?.dict || catalog;
      if (catalogDict) {
        catalogDict.set(PDFName.of('Outlines'), outlineDict);
      }
      
      if (verbose) {
        console.log(`\n[Bookmarks] Generated ${bookmarks.length} bookmark(s)`);
        console.log(`  Note: Bookmarks created. If not visible, pdf-lib bookmark support may be limited.`);
      }
    } catch (error: any) {
      // Always log bookmark errors - they indicate a problem
      console.error(`  ⚠️  Failed to create bookmarks: ${error?.message}`);
      if (verbose && error?.stack) {
        console.error(`  Stack: ${error.stack}`);
      }
      console.error(`  Note: pdf-lib has limited bookmark support. Consider using a PDF tool to add bookmarks manually.`);
      // Don't throw - bookmarks are optional
    }
  }
}
