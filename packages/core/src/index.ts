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
  replacementOverrides?: Map<string, string>; // optional: map of "addendumIndex:pageIndex" -> original ID to replace
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
export { RoiSpecsSectionLocator } from './locators/roiSpecsSectionLocator.js';
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
  createSpecsPatchWorkflowRunner,
  createBookmarksWorkflowRunner,
} from './workflows/index.js';

// Explicitly re-export workflow types for better TypeScript compatibility
export type {
  InventoryResult,
  CorrectionOverlay,
  ExecuteResult,
  MergeAnalyzeInput,
  MergeExecuteInput,
  SpecsPatchAnalyzeInput,
  SpecsPatchExecuteInput,
  BookmarksAnalyzeInput,
  BookmarksExecuteInput,
} from './workflows/index.js';

// Export narrative processing
export * from './narrative/index.js';

// Export standards module
export * from './standards/index.js';

// Export bookmark profiles
export type {
  BookmarkProfileId,
  BookmarkStyleOptions,
  ResolvedBookmarkStyleOptions,
} from './bookmarks/profiles/types.js';

// Export spec inventory (footer-first sectionization)
export * from './specs/inventory/index.js';

// Export footer section map
export * from './specs/footerSectionMap.js';
export { validateFooterParsing } from './specs/footerValidation.js';
export type { FooterValidationResult, FooterValidationCounters, FooterDebugOutput } from './specs/footerValidation.js';
export { parseFooterSectionId } from './specs/footerSectionIdParser.js';

// Export spec extraction functions
export { detectSections, convertToSpecSections } from './specs/extract/sectionDetector.js';
export { extractTextNodes } from './specs/extract/textExtractor.js';
export { generateBookmarkTree } from './specs/extract/bookmarkTreeGenerator.js';
export { buildTreeFromBookmarkAnchorTree } from './bookmarks/treeBuilder.js';
export type { SpecDoc, SpecSection, SpecNode, BookmarkAnchorTree, BookmarkAnchor } from './specs/ast/types.js';

// Export text utilities
export { detectPageRegions } from './text/pageRegions.js';
export type { TextPage, DetectedPageRegions } from './text/pageRegions.js';
export type { TextItemWithPosition } from './utils/pdf.js';

// Export feature flags and deprecation utilities
export { 
  getFeatureFlag, 
  setFeatureFlag, 
  resetFeatureFlags,
  isLegacyLocatorEnabled,
} from './config/featureFlags.js';
export { 
  logDeprecation, 
  logLegacyLocatorUsage,
  logPdfAstDeprecation,
} from './utils/deprecation.js';

// Export transcript system
export type * from './transcript/types.js';
export type * from './transcript/interfaces.js';
export { createTranscriptExtractor } from './transcript/factory.js';
export { isPyMuPDFAvailable, isPDFjsAvailable } from './transcript/factory.js';
export { PyMuPDFExtractor } from './transcript/extractors/pymupdfExtractor.js';
export { PDFjsExtractor } from './transcript/extractors/pdfjsExtractor.js';
export { canonicalizeTranscript } from './transcript/canonicalize.js';
export { scoreTranscriptQuality } from './transcript/quality.js';
export type { QualityReport } from './transcript/quality.js';
export { generateCandidates } from './transcript/candidates.js';
export type { CandidateReport } from './transcript/candidates.js';

// Export profile system
export type * from './transcript/profiles/types.js';
export { ProfileRegistry } from './transcript/profiles/registry.js';
export { validateProfile } from './transcript/profiles/validation.js';
export type { ProfileValidation } from './transcript/profiles/validation.js';

// Export abstraction (privacy layer)
export { TokenVault } from './transcript/abstraction/tokenVault.js';
export { sanitizeTranscript, preserveTokenShape } from './transcript/abstraction/sanitize.js';
export { groupSpansIntoLines } from './transcript/abstraction/lineGrouping.js';
export { computeRepetitionMetrics } from './transcript/abstraction/repetitionMetrics.js';
export { detectCharClassFlags, getLengthBucket, generateTokenShape, generatePlaceholderId } from './transcript/abstraction/shapeFeatures.js';
export { buildCompilerPrompt } from './transcript/ml/promptBuilder.js';
export type { CompilerSummaries } from './transcript/ml/promptBuilder.js';
export { PrivacyMode, TokenClass } from './transcript/abstraction/abstractTranscript.js';
export type * from './transcript/abstraction/abstractTranscript.js';

// Export schedule extraction
export { extractSchedules, exportScheduleToCSV, exportScheduleToJSON } from './transcript/schedules/extractor.js';
export type * from './transcript/schedules/types.js';

// Export submittal parser
export { parseSubmittal, extractPacketFields, extractPacketTables } from './submittals/extract/submittalParser.js';
export type * from './submittals/types.js';

// Export ML Ruleset Compiler
export type * from './transcript/ml/types.js';
export type { RulesetCompiler } from './transcript/ml/rulesetCompiler.js';
export { APIRulesetCompiler, createAPIRulesetCompiler } from './transcript/ml/apiCompiler.js';