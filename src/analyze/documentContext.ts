import * as fs from 'fs/promises';
import { PageContext } from './pageContext.js';
import type { TextItemWithPosition } from '../utils/pdf.js';

// Import pdfjs-dist
let pdfjsLib: any = null;

async function getPdfJs() {
  if (!pdfjsLib) {
    try {
      // Use dynamic import for pdfjs-dist
      const pdfjsModule = await import('pdfjs-dist');
      pdfjsLib = pdfjsModule.default || pdfjsModule;
      
      // Set up worker for Node.js
      if (pdfjsLib.GlobalWorkerOptions) {
        // For Node.js, disable the worker - pdfjs-dist can work without it for text extraction
        // The worker is mainly needed for rendering, not text extraction
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      }
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
 * - Cache bookmarks (extract once)
 * - Create and cache PageContext instances
 * - Coordinate text extraction per page (once per page)
 */
export class DocumentContext {
  private _pdfPath: string;
  private _pdfBytes: Uint8Array | null = null;
  private _pdfjsDoc: any = null; // pdfjs document instance
  private _pageCount: number = 0;
  private _bookmarks: Array<{ title: string; pageIndex: number }> | null = null;
  private _bookmarksExtracted: boolean = false;
  private _pageContexts = new Map<number, PageContext>();
  private _textExtracted = new Set<number>(); // Track which pages have text extracted
  
  // Instrumentation: track PDF loads
  private static _loadCount = 0;
  private _loadId: number = 0;
  
  constructor(pdfPath: string) {
    this._pdfPath = pdfPath;
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
   * Initialize document: load PDF bytes and create pdfjs document (single load)
   */
  async initialize(): Promise<void> {
    if (this._pdfjsDoc) {
      // Already initialized
      return;
    }
    
    // Load PDF bytes once
    const buffer = await fs.readFile(this._pdfPath);
    this._pdfBytes = new Uint8Array(buffer);
    
    // Create pdfjs document once
    const pdfjs = await getPdfJs();
    if (!pdfjs || !pdfjs.getDocument) {
      throw new Error('pdfjs-dist not available');
    }
    
    // Instrumentation: increment load counter
    DocumentContext._loadCount++;
    this._loadId = DocumentContext._loadCount;
    
    const loadingTask = pdfjs.getDocument({ 
      data: this._pdfBytes,
      useSystemFonts: true,
      verbosity: 0
    });
    this._pdfjsDoc = await loadingTask.promise;
    this._pageCount = this._pdfjsDoc.numPages;
  }
  
  get pageCount(): number {
    return this._pageCount;
  }
  
  get pdfPath(): string {
    return this._pdfPath;
  }
  
  /**
   * Get the cached pdfjs document (must call initialize() first)
   */
  private _getPdfjsDoc(): any {
    if (!this._pdfjsDoc) {
      throw new Error('DocumentContext not initialized. Call initialize() first.');
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
    if (!this._pdfjsDoc) {
      await this.initialize();
    }
    
    const pdf = this._getPdfjsDoc();
    
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      throw new Error(`Page index ${pageIndex} out of range (0-${pdf.numPages - 1})`);
    }
    
    // Get page info from cached pdfjs document
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Create page context
    const context = new PageContext(
      pageIndex,
      viewport.width,
      viewport.height,
      page.rotate || 0
    );
    
    this._pageContexts.set(pageIndex, context);
    return context;
  }
  
  /**
   * Extract text for a page (cached - only extracts once)
   */
  async extractTextForPage(pageIndex: number): Promise<PageContext> {
    const context = await this.getPageContext(pageIndex);
    
    // If already extracted, return cached context
    if (this._textExtracted.has(pageIndex)) {
      return context;
    }
    
    // Ensure initialized
    if (!this._pdfjsDoc) {
      await this.initialize();
    }
    
    const pdf = this._getPdfjsDoc();
    
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      throw new Error(`Page index ${pageIndex} out of range (0-${pdf.numPages - 1})`);
    }
    
    // Extract text using cached pdfjs document
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    
    const items: TextItemWithPosition[] = [];
    
    for (const item of textContent.items) {
      if ('str' in item && item.str && 'transform' in item) {
        const transform = item.transform;
        // PDF coordinates: origin at bottom-left, y increases upward
        // Convert to top-left origin (y increases downward)
        const x = transform[4];
        const y = viewport.height - transform[5]; // Flip Y coordinate
        const width = item.width || 0;
        const height = item.height || 0;
        
        items.push({
          str: item.str,
          x,
          y,
          width,
          height,
        });
      }
    }
    
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
   * Get bookmarks (extracted once, cached)
   */
  async getBookmarks(): Promise<Array<{ title: string; pageIndex: number }>> {
    if (this._bookmarksExtracted) {
      return this._bookmarks || [];
    }
    
    // Ensure initialized
    if (!this._pdfjsDoc) {
      await this.initialize();
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
