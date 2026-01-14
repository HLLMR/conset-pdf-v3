export type ConsetDocType = 'drawings' | 'specs';

export interface MergeAddendaOptions {
  originalPdfPath: string;
  addendumPdfPaths: string[];
  outputPdfPath?: string; // optional when dryRun=true
  type: ConsetDocType;
  mode?: 'replace+insert' | 'replace-only' | 'append-only';
  strict?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  reportPath?: string; // optional
  regenerateBookmarks?: boolean; // regenerate bookmarks from detected sheet numbers and titles
  inventoryOutputDir?: string; // optional: directory for inventory JSON files
  locator?: any; // SheetLocator instance (internal use)
  patterns?: {
    drawingsSheetId?: string; // regex string
    specsSectionId?: string; // regex string
  };
}

export interface MergeReport {
  kind: ConsetDocType;
  originalPath: string;
  addendumPaths: string[];
  outputPath?: string;

  replaced: Array<{
    id: string;
    originalPageIndexes: number[]; // 0-based
    addendumPageIndexes: number[]; // 0-based within that addendum PDF
    addendumSource: string; // filename/path
  }>;

  inserted: Array<{
    id: string;
    insertedAtIndex: number; // 0-based in final sequence
    pageCount: number;
    addendumSource: string;
  }>;

  appendedUnmatched: Array<{
    reason: 'no-id' | 'ambiguous' | 'unmatched';
    addendumSource: string;
    pageIndexes: number[];
  }>;

  warnings: string[];
  stats: {
    originalPages: number;
    finalPagesPlanned: number;
    parseTimeMs: number;
    mergeTimeMs: number;
  };
}

export interface SplitSetOptions {
  inputPdfPath: string;
  outputDir: string;
  type: ConsetDocType;
  groupBy?: 'prefix' | 'section' | 'division';
  prefixes?: string[];
  tocJsonPath?: string;
  pattern?: string; // optional override regex
  verbose?: boolean;
}

export interface SplitEntry {
  key: string; // e.g. "M" or "23 09 00" or "23"
  title?: string; // optional (spec header inferred)
  startPage: number; // 1-based
  endPage: number; // inclusive, 1-based
  fileName: string; // output filename
}

export interface AssembleSetOptions {
  inputDir: string;
  outputPdfPath: string;
  type: ConsetDocType;
  orderJsonPath?: string;
  verbose?: boolean;
}

// Export main functions
export { mergeAddenda } from './core/mergeAddenda.js';
export { splitSet } from './core/splitSet.js';
export { assembleSet } from './core/assembleSet.js';
