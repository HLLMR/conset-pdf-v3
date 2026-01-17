# Public API

## Stable API Guarantees

**Stable** (backward compatible):
- `mergeAddenda()` - Options and return type
- `splitSet()` - Options and return type
- `assembleSet()` - Options and return type
- `DocumentContext` - Public methods
- `PageContext` - Public methods
- `SheetLocator` interface
- Layout profile schema

**Experimental** (may change):
- Internal planner/applyPlan functions
- Report structure details (fields may be added)
- Locator implementations (use interface, not concrete classes)

## MergeAddendaOptions

```typescript
interface MergeAddendaOptions {
  originalPdfPath: string;              // Required: Original PDF path
  addendumPdfPaths: string[];          // Required: Array of addendum PDF paths
  outputPdfPath?: string;               // Optional: Output path (required if !dryRun)
  type: ConsetDocType;                  // Required: 'drawings' | 'specs'
  mode?: 'replace+insert' | 'replace-only' | 'append-only';  // Default: 'replace+insert'
  strict?: boolean;                      // Default: false
  dryRun?: boolean;                      // Default: false
  verbose?: boolean;                     // Default: false
  reportPath?: string;                   // Optional: Path to write JSON report
  regenerateBookmarks?: boolean;         // Default: false
  inventoryOutputDir?: string;          // Optional: Directory for inventory JSON files
  locator?: SheetLocator;                // Optional: Custom locator instance
  patterns?: {
    drawingsSheetId?: string;           // Optional: Custom regex pattern
    specsSectionId?: string;             // Optional: Custom regex pattern
  };
}
```

### Locator Typed

**Recommended**: Provide `locator` option for ROI-based detection:

```typescript
import { RoiSheetLocator, loadLayoutProfile } from '@conset-pdf/core';

const layout = await loadLayoutProfile('layout.json');
const locator = new RoiSheetLocator(layout);

await mergeAddenda({
  // ... other options
  locator,
});
```

**Fallback**: If no locator provided, uses `LegacyTitleblockLocator` (auto-detected title block).

## Execution Order

**Fast + Safe** execution order:

1. **Parse** (detection phase):
   - Load original PDF once
   - Extract text per page (demand-driven, cached)
   - Detect sheet IDs using locator
   - Build ID maps

2. **Plan** (planning phase):
   - Match addendum pages to original pages
   - Generate merge plan (replacements + insertions)
   - Handle duplicates (highest confidence wins)

3. **Apply** (assembly phase):
   - Copy pages in planned order
   - Regenerate bookmarks (if requested)
   - Write output PDF

**Performance**: Text extraction cached per page. First page ~100ms, subsequent ~2ms.

## Return Types

### MergeReport

```typescript
interface MergeReport {
  kind: ConsetDocType;
  originalPath: string;
  addendumPaths: string[];
  outputPath?: string;
  
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
  
  appendedUnmatched: Array<{
    reason: 'no-id' | 'ambiguous' | 'unmatched';
    addendumSource: string;
    pageIndexes: number[];
  }>;
  
  warnings: string[];
  notices?: string[];
  stats: {
    originalPages: number;
    finalPagesPlanned: number;
    parseTimeMs: number;
    mergeTimeMs: number;
  };
}
```

## DocumentContext API

**Stable methods**:

```typescript
class DocumentContext {
  constructor(pdfPath: string);
  
  // Initialization
  async initialize(): Promise<void>;
  
  // Page access
  get pageCount(): number;
  async getPageContext(pageIndex: number): Promise<PageContext>;
  
  // Text extraction (demand-driven)
  async extractTextForPages(pageIndexes: number[]): Promise<void>;
}
```

## PageContext API

**Stable methods**:

```typescript
class PageContext {
  // Page info (cached)
  get pageWidth(): number;
  get pageHeight(): number;
  get rotation(): number;
  
  // Text access (cached)
  async getText(): Promise<string>;
  async getTextItems(): Promise<TextItem[]>;
  async getTextItemsInROI(roi: NormalizedROI): Promise<TextItem[]>;
}
```

## SheetLocator Interface

**Stable contract**:

```typescript
interface SheetLocator {
  locate(pageContext: PageContext): Promise<SheetLocationResult>;
  getName(): string;
}
```

**Implementations** (use interface, not concrete):
- `RoiSheetLocator` - ROI-based detection
- `LegacyTitleblockLocator` - Auto-detected title block
- `CompositeLocator` - ROI-first with fallback

## Layout Profile Schema

**Stable schema**:

```typescript
interface LayoutProfile {
  name: string;
  version: string;
  source?: 'auto-detected' | 'manual' | 'user-defined';
  
  sheetId: {
    rois: NormalizedROI[];
    regex?: string;
    anchorKeywords?: string[];
  };
  
  sheetTitle?: {
    rois: NormalizedROI[];
    maxLength?: number;
  };
}
```

## Error Handling

**Throws**:
- File not found
- Invalid PDF format
- Invalid layout profile
- Missing required options

**Returns warnings** (in report):
- ROI detection failures
- Duplicate IDs
- Unmatched pages
- Legacy fallback usage
