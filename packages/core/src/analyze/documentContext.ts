import * as fs from 'fs/promises';
import { PageContext } from './pageContext.js';
import type { TextItemWithPosition } from '../utils/pdf.js';
import type { TranscriptExtractor } from '../transcript/interfaces.js';
import type { LayoutTranscript } from '../transcript/types.js';
import { createTranscriptExtractor } from '../transcript/factory.js';

// Import pdfjs-dist
// Note: pdfjsLib is typed as 'any' because pdfjs-dist/legacy doesn't provide TypeScript definitions
// The legacy build exports a module with dynamic properties that can't be statically typed
let pdfjsLib: any = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    try {
      // Use legacy build for Node.js environments (pdfjs-dist 5.x requires this)
      const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Legacy build exports directly, no default export
      pdfjsLib = pdfjsModule;
      
      // Set up worker for Node.js - use node build which doesn't require worker
      // The legacy build for Node.js doesn't need worker configuration
      // We skip setting workerSrc as the legacy build handles this automatically
    } catch (error: any) {
      console.error('Failed to load pdfjs-dist:', error?.message);
      throw error;
    }
  }
  return pdfjsLib;
}

/**
 * DocumentContext: Manages document-level caching and page contexts
 * 
 * Responsibilities:
 * - Load PDF once (single load per document)
 * - Extract transcript once (using TranscriptExtractor)
 * - Cache bookmarks (extract once, still uses PDF.js temporarily)
 * - Create and cache PageContext instances
 * - Coordinate text extraction per page (once per page, from transcript)
 */
export class DocumentContext {
  private _pdfPath: string;
  private _pdfBytes: Uint8Array | null = null;
  private _pdfBuffer: Buffer | null = null; // Store original buffer for hashing
  // Note: _pdfjsDoc is typed as 'any' because PDF.js document instances don't have complete TypeScript definitions
  // The document API is accessed dynamically (getPage, getOutline, etc.)
  // TEMPORARY: Keep PDF.js document only for bookmarks until migrated
  private _pdfjsDoc: any = null; // pdfjs document instance (for bookmarks only)
  private _transcriptExtractor: TranscriptExtractor;
  private _layoutTranscript: LayoutTranscript | null = null;
  private _pageCount: number = 0;
  private _bookmarks: Array<{ title: string; pageIndex: number }> | null = null;
  private _bookmarksExtracted: boolean = false;
  private _pageContexts = new Map<number, PageContext>();
  private _textExtracted = new Set<number>(); // Track which pages have text extracted
  
  // Instrumentation: track PDF loads
  private static _loadCount = 0;
  private _loadId: number = 0;
  
  constructor(pdfPath: string, transcriptExtractor?: TranscriptExtractor) {
    this._pdfPath = pdfPath;
    this._transcriptExtractor = transcriptExtractor || createTranscriptExtractor();
  }
  
  /**
   * Get instrumentation: total PDF loads across all DocumentContext instances
   */
  static getLoadCount(): number {
    return DocumentContext._loadCount;
  }
  
  /**
   * Get instrumentation: this instance's load ID
   */
  getLoadId(): number {
    return this._loadId;
  }
  
  /**
   * Initialize document: extract transcript and load PDF bytes for bookmarks
   */
  async initialize(): Promise<void> {
    if (this._layoutTranscript) {
      // Already initialized
      return;
    }
    
    // Load PDF bytes once (for hashing and bookmarks)
    const buffer = await fs.readFile(this._pdfPath);
    this._pdfBuffer = buffer;
    this._pdfBytes = new Uint8Array(buffer);
    
    // Extract transcript once (primary source for text extraction)
    this._layoutTranscript = await this._transcriptExtractor.extractTranscript(this._pdfPath);
    this._pageCount = this._layoutTranscript.metadata.totalPages;
    
    // TEMPORARY: Load PDF.js document for bookmarks only
    // This will be removed once bookmarks are migrated to transcript-based extraction
    try {
      const pdfjs = await getPdfJs();
      if (pdfjs && pdfjs.getDocument) {
        const loadingTask = pdfjs.getDocument({ 
          data: this._pdfBytes,
          useSystemFonts: true,
          verbosity: 0
        });
        this._pdfjsDoc = await loadingTask.promise;
      }
    } catch (error) {
      // PDF.js not available - bookmarks will fail, but transcript extraction works
      console.warn('PDF.js not available for bookmarks extraction');
    }
    
    // Instrumentation: increment load counter
    DocumentContext._loadCount++;
    this._loadId = DocumentContext._loadCount;
  }
  
  get pageCount(): number {
    return this._pageCount;
  }
  
  get pdfPath(): string {
    return this._pdfPath;
  }
  
  /**
   * Get PDF bytes for hashing/metadata operations
   * Returns the raw PDF bytes that were loaded during initialization
   */
  getPdfBytes(): Uint8Array {
    if (!this._pdfBytes || !this._pdfBuffer) {
      throw new Error('DocumentContext not initialized. Call initialize() first.');
    }
    // Return Uint8Array view of the buffer for consistency
    // Use the stored buffer to ensure we have the actual bytes
    return new Uint8Array(this._pdfBuffer);
  }
  
  /**
   * Get the cached pdfjs document (must call initialize() first)
   * TEMPORARY: Only used for bookmarks extraction
   */
  private _getPdfjsDoc(): any {
    if (!this._pdfjsDoc) {
      // PDF.js not available - bookmarks will fail
      throw new Error('PDF.js document not available for bookmarks extraction.');
    }
    return this._pdfjsDoc;
  }
  
  /**
   * Get or create PageContext for a page
   */
  async getPageContext(pageIndex: number): Promise<PageContext> {
    if (this._pageContexts.has(pageIndex)) {
      return this._pageContexts.get(pageIndex)!;
    }
    
    // Ensure initialized
    if (!this._layoutTranscript) {
      await this.initialize();
    }
    
    const transcript = this._getTranscript();
    
    if (pageIndex < 0 || pageIndex >= transcript.pages.length) {
      throw new Error(`Page index ${pageIndex} out of range (0-${transcript.pages.length - 1})`);
    }
    
    // Get page info from cached transcript
    const page = transcript.pages[pageIndex];
    
    // Create page context with visual dimensions from transcript
    // Transcript pages are already canonicalized (rotation normalized to 0)
    const context = new PageContext(
      pageIndex,
      page.width,   // Visual space (after canonicalization, rotation is 0)
      page.height,  // Visual space
      0             // Rotation is always 0 after canonicalization
    );
    
    this._pageContexts.set(pageIndex, context);
    return context;
  }
  
  /**
   * Get the cached transcript (must call initialize() first)
   */
  private _getTranscript(): LayoutTranscript {
    if (!this._layoutTranscript) {
      throw new Error('DocumentContext not initialized. Call initialize() first.');
    }
    return this._layoutTranscript;
  }
  
  /**
   * Extract text for a page (cached - only extracts once)
   * Uses transcript instead of PDF.js extraction
   */
  async extractTextForPage(pageIndex: number): Promise<PageContext> {
    const context = await this.getPageContext(pageIndex);
    
    // If already extracted, return cached context
    if (this._textExtracted.has(pageIndex)) {
      return context;
    }
    
    // Ensure initialized
    if (!this._layoutTranscript) {
      await this.initialize();
    }
    
    const transcript = this._getTranscript();
    
    if (pageIndex < 0 || pageIndex >= transcript.pages.length) {
      throw new Error(`Page index ${pageIndex} out of range (0-${transcript.pages.length - 1})`);
    }
    
    // Convert LayoutSpan[] to TextItemWithPosition[] from cached transcript
    const page = transcript.pages[pageIndex];
    const items: TextItemWithPosition[] = page.spans.map((span) => {
      const [x0, y0, x1, y1] = span.bbox;
      return {
        str: span.text,
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      };
    });
    
    context.setTextItems(items);
    this._textExtracted.add(pageIndex);
    
    return context;
  }
  
  /**
   * Extract text for multiple pages (batch operation)
   */
  async extractTextForPages(pageIndexes: number[]): Promise<Map<number, PageContext>> {
    const contexts = new Map<number, PageContext>();
    
    // Extract in parallel (but limit concurrency to avoid memory issues)
    const batchSize = 10;
    for (let i = 0; i < pageIndexes.length; i += batchSize) {
      const batch = pageIndexes.slice(i, i + batchSize);
      await Promise.all(batch.map(async (idx) => {
        const ctx = await this.extractTextForPage(idx);
        contexts.set(idx, ctx);
      }));
    }
    
    return contexts;
  }
  
  /**
   * Get visual text items for a page (for debug overlay)
   * Extracts text if not already extracted, then returns items in visual coordinate space
   * 
   * @param pageIndex 0-based page index
   * @returns Object with page info and text items
   */
  async getVisualTextItemsForPage(pageIndex: number): Promise<{
    pageNumber: number;
    pageWidth: number;
    pageHeight: number;
    items: Array<{ str: string; x: number; y: number; width: number; height: number }>;
  }> {
    const context = await this.extractTextForPage(pageIndex);
    const items = context.getVisualTextItems();
    
    return {
      pageNumber: pageIndex + 1, // Convert to 1-based for display
      pageWidth: context.pageWidth,
      pageHeight: context.pageHeight,
      items,
    };
  }
  
  /**
   * Get bookmarks (extracted once, cached)
   * TEMPORARY: Still uses PDF.js until bookmarks are migrated to transcript-based extraction
   */
  async getBookmarks(): Promise<Array<{ title: string; pageIndex: number }>> {
    if (this._bookmarksExtracted) {
      return this._bookmarks || [];
    }
    
    // Ensure initialized (this will load PDF.js for bookmarks)
    if (!this._pdfjsDoc) {
      await this.initialize();
    }
    
    // If PDF.js is not available, return empty bookmarks
    if (!this._pdfjsDoc) {
      this._bookmarks = [];
      this._bookmarksExtracted = true;
      return [];
    }
    
    const pdf = this._getPdfjsDoc();
    
    // Extract bookmarks from cached pdfjs document
    const bookmarks: Array<{ title: string; pageIndex: number }> = [];
    
    // Try to get outline/bookmarks - pdfjs-dist may expose this differently
    let outline: any = null;
    
    if (pdf.outline) {
      outline = pdf.outline;
    } else if (pdf.getOutline) {
      try {
        outline = await pdf.getOutline();
      } catch (e) {
        // Ignore
      }
    } else if ((pdf as any)._pdfInfo?.outline) {
      outline = (pdf as any)._pdfInfo.outline;
    }
    
    if (!outline) {
      // Try accessing through catalog
      try {
        const catalog = await pdf.catalog;
        if (catalog && (catalog as any).getOutlines) {
          outline = await (catalog as any).getOutlines();
        } else if (catalog && (catalog as any).outlines) {
          outline = (catalog as any).outlines;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    if (outline) {
      const extractOutline = async (items: any[], parentPageIndex: number = 0): Promise<void> => {
        for (const item of items) {
          let currentPageIndex = parentPageIndex;
          
          // Get title
          let title: string | null = null;
          if (typeof item.title === 'string') {
            title = item.title;
          } else if (item.title && typeof item.title === 'object') {
            try {
              if (item.title.str !== undefined) {
                title = item.title.str;
              } else if (item.title.toString) {
                title = item.title.toString();
              }
            } catch (e) {
              // Ignore
            }
          }
          
          if (title) {
            // Get destination page
            let dest: any = null;
            if (item.dest) {
              dest = item.dest;
            } else if (item.destRef) {
              try {
                dest = await pdf.getDestination(item.destRef);
              } catch (e) {
                // Ignore
              }
            }
            
            if (dest) {
              if (Array.isArray(dest)) {
                const destRef = dest[0];
                if (destRef && typeof destRef === 'object' && destRef.num !== undefined) {
                  currentPageIndex = destRef.num - 1; // Convert to 0-based
                } else if (typeof destRef === 'number') {
                  currentPageIndex = destRef - 1;
                }
              } else if (typeof dest === 'string') {
                try {
                  const resolvedDest = await pdf.getDestination(dest);
                  if (resolvedDest && Array.isArray(resolvedDest)) {
                    const pageRef = resolvedDest[0];
                    if (pageRef && typeof pageRef === 'object' && pageRef.num !== undefined) {
                      currentPageIndex = pageRef.num - 1;
                    }
                  }
                } catch (e) {
                  // Ignore
                }
              }
            } else if (item.url) {
              // External link, skip
              continue;
            }
            
            bookmarks.push({
              title,
              pageIndex: currentPageIndex,
            });
          }
          
          // Recursively process children
          if (item.items && item.items.length > 0) {
            await extractOutline(item.items, currentPageIndex);
          }
        }
      };
      
      await extractOutline(Array.isArray(outline) ? outline : [outline]);
    }
    
    this._bookmarks = bookmarks;
    this._bookmarksExtracted = true;
    return this._bookmarks;
  }
  
  /**
   * Get bookmarks for a specific page
   */
  async getBookmarksForPage(pageIndex: number): Promise<Array<{ title: string; pageIndex: number }>> {
    const allBookmarks = await this.getBookmarks();
    return allBookmarks.filter(b => b.pageIndex === pageIndex);
  }
  
  /**
   * Clear all caches (for testing/debugging)
   * Note: This does NOT clear the pdfjs document or bytes - they remain loaded
   */
  clearCache(): void {
    this._pageContexts.clear();
    this._textExtracted.clear();
    this._bookmarks = null;
    this._bookmarksExtracted = false;
  }
  
  /**
   * Get instrumentation info
   */
  getInstrumentation(): {
    loadId: number;
    totalLoads: number;
    pageCount: number;
    cachedPages: number;
    textExtractedPages: number;
  } {
    return {
      loadId: this._loadId,
      totalLoads: DocumentContext._loadCount,
      pageCount: this._pageCount,
      cachedPages: this._pageContexts.size,
      textExtractedPages: this._textExtracted.size,
    };
  }
}
