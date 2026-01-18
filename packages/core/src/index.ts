import type { SheetLocator } from './locators/sheetLocator.js';

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
  locator?: SheetLocator; // SheetLocator instance (internal use, for advanced scenarios)
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
  notices?: string[]; // Informational notices (e.g., page 1 cover sheet detection)
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

// Export utilities
export { fileExists, writeJson } from './utils/fs.js';

// Export layout
export { loadLayoutProfile, createInlineLayout } from './layout/load.js';
export type * from './layout/types.js';

// Export locators
export { RoiSheetLocator } from './locators/roiSheetLocator.js';
export { LegacyTitleblockLocator } from './locators/legacyTitleblockLocator.js';
export { CompositeLocator } from './locators/compositeLocator.js';
export { SpecsSectionLocator } from './locators/specsSectionLocator.js';
export type { SheetLocator } from './locators/sheetLocator.js';

// Export analyze
export { DocumentContext } from './analyze/documentContext.js';
export type * from './analyze/pageContext.js';

// Export workflows (additive - new workflow engine)
export type * from './workflows/index.js';
export {
  createWorkflowRunner,
  createMergeWorkflowRunner,
} from './workflows/index.js';

// Export narrative processing
export * from './narrative/index.js';

// Export standards module
export * from './standards/index.js';