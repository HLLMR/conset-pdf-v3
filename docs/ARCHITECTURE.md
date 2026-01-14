# Architecture

## High-Level System Overview

`conset-pdf` uses a layered architecture with strict boundaries to ensure single-load PDF processing, efficient caching, and pluggable detection strategies.

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
│  (commands/mergeAddenda.ts, detect.ts, splitSet.ts, etc.)   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Logic Layer                        │
│  (core/planner.ts, mergeAddenda.ts, applyPlan.ts)           │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│  Locator Layer   │          │  Analysis Layer   │
│ (locators/*.ts)  │          │ (analyze/*.ts)    │
└──────────────────┘          └──────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│  Parser Layer    │          │  Layout System   │
│ (parser/*.ts)    │          │ (layout/*.ts)    │
└──────────────────┘          └──────────────────┘
```

## Architecture Invariants

These invariants **must** remain true. They are verified by automated tests and checks.

### 1. Single-Load PDF Pipeline

**Invariant**: Only `src/analyze/*` may load PDFs, read bytes, or create PDF.js documents.

**Enforcement**:
- `DocumentContext` is the single source of truth for PDF loading
- All PDF operations go through `DocumentContext` or `PageContext`
- Legacy functions in `src/utils/pdf.ts` are quarantined and only used as fallbacks

**Verification**: Automated checks ensure no `getDocument()` or `fs.readFile()` calls outside `src/analyze/*` (except legacy fallback in `utils/pdf.ts`).

### 2. PageContext Caching

**Invariant**: Expensive per-page operations run once per page and are cached.

**Enforcement**:
- `PageContext` memoizes: `getInfo()`, `getText()`, `getTextItems()`, `getTextItemsInROI()`
- `DocumentContext.getPageContext()` returns the same instance for the same page index
- All locators consume cached `PageContext` data (no direct PDF access)

**Verification**: Instrumentation counters track cache hits/misses.

### 3. Locator Seam

**Invariant**: Planner is decoupled from detection strategy. It uses locator results only.

**Enforcement**:
- `SheetLocator` interface defines the contract
- Planner calls `locator.locate(pageContext)` and uses the result
- No direct calls to detection functions from planner

**Verification**: Automated checks ensure planner uses `locator.locate()`, not direct detection functions.

### 4. ROI-First Detection + Fallback Tracking

**Invariant**: ROI-based detection is the default strategy, with explicit fallback tracking.

**Enforcement**:
- `CompositeLocator` tries ROI first, falls back to legacy
- Fallback decisions are tracked and reported in warnings
- ROI failures are clearly attributed (empty ROI, no pattern match, etc.)

**Verification**: Reports include ROI failure reasons and legacy fallback usage.

## Key Components

### Analysis Layer (`src/analyze/`)

**Purpose**: Single source of truth for PDF extraction and caching

- **`DocumentContext`**: Manages document-level state
  - Loads PDF once via `initialize()`
  - Caches PDF bytes and pdfjs document instance
  - Creates and manages `PageContext` instances (one per page)
  - Coordinates text extraction per page (extracted once, cached)

- **`PageContext`**: Caches per-page expensive operations
  - Page dimensions, rotation (`getInfo()`)
  - Text items (full page, extracted once) (`getTextItems()`)
  - Plain text (derived from text items) (`getText()`)
  - ROI-filtered text views (derived from cached items) (`getTextItemsInROI()`)
  - Instrumentation counters for cache verification

**Rule**: All page-level PDF operations go through `PageContext`. No direct PDF.js calls for text extraction outside this layer.

### Locator Layer (`src/locators/`)

**Purpose**: Pluggable sheet ID/title detection strategies

- **`SheetLocator` Interface**: Contract for detection strategies
  - `locate(pageContext: PageContext): Promise<SheetLocationResult>`
  - `getName(): string`

- **`RoiSheetLocator`**: Uses layout profile with ROI regions
  - Filters cached text items by ROI bounds
  - Applies regex pattern matching
  - Calculates confidence scores
  - Provides detailed failure warnings

- **`LegacyTitleblockLocator`**: Uses auto-detected title block (cached)
  - Consumes `DocumentContext` for single-load compliance
  - Uses cached `PageContext` text items
  - Falls back to legacy path only when `DocumentContext` not available

- **`SpecsSectionLocator`**: Detects specs section IDs
  - Consumes `PageContext` only
  - Pure text processing (no PDF access)

- **`CompositeLocator`**: Tries ROI first, falls back to legacy
  - Tracks fallback decisions
  - Reports warnings when fallback is used

**Design**: Locators are pure (no IO). They consume cached `PageContext` data only.

### Core Logic (`src/core/`)

**Purpose**: Business logic for merge, split, and assemble operations

- **`planner.ts`**: Plans merge operations
  - Uses locators to detect sheet IDs
  - Handles duplicate detection (highest confidence wins)
  - Generates merge plan with page ordering

- **`applyPlan.ts`**: Applies merge plan to create output PDF
  - Uses inventory data for bookmark regeneration (no re-detection)
  - Copies pages in planned order

- **`splitSet.ts`**: Splits PDFs into subsets
  - Uses `DocumentContext` for single-load compliance
  - Uses `PageContext` for all text extraction

- **`report.ts`**: Generates merge reports
  - Uses `DocumentContext.pageCount` when available (single-load compliance)
  - Analyzes ROI failures and legacy fallback usage

### Parser Layer (`src/parser/`)

**Purpose**: Pure functions for ID parsing and normalization

- **`normalize.ts`**: ID normalization to canonical form
  - All delimiters (`.`, `_`, spaces) normalize to dash
  - Canonical form: `M1-01`, `E2-101A`

- **`drawingsSheetId.ts`**: Drawing sheet ID patterns
- **`specsSectionId.ts`**: Spec section ID patterns

**Rule**: Parsers are pure functions (no IO). They work with cached data only.

### Layout System (`src/layout/`)

**Purpose**: User-defined regions for extraction

- **`types.ts`**: Layout profile schema, ROI types, validation
- **`load.ts`**: Load profiles from JSON or create inline from CLI flags

## Data Flow

### Merge-Addenda Command Flow

```
1. CLI creates locator (ROI or legacy)
2. For each input PDF:
   a. Create DocumentContext
   b. Initialize (load PDF once)
   c. For each page:
      - Get PageContext (cached per page index)
      - Extract text if not cached (demand-driven)
      - Run locator.locate(pageContext)
      - Collect inventory data
3. Build ID maps (normalized IDs → pages)
4. Plan merge (replacements + insertions)
5. Apply plan (copy pages, regenerate bookmarks from inventory)
6. Generate reports
```

### Bookmark Regeneration

**When**: `--regenerate-bookmarks` flag is set

**Process**:
1. After merge completes, use inventory data from merge (no re-detection)
2. For each page in merge plan:
   - Get sheet ID + title from inventory (already computed)
   - Create bookmark entry: `{title: "SHEET_ID — Title", pageIndex: N}`
3. Use `BookmarkWriter` interface to write bookmarks
4. Write to PDF before saving (no reload)

**Key Points**:
- **No re-detection**: Uses inventory data already computed during merge
- **Deterministic**: Bookmarks reflect detected inventory, not existing bookmarks
- **pdf-lib limitation**: `pdf-lib` has limited bookmark support. Bookmarks may not always be visible in all PDF viewers.

## Performance Characteristics

**Text Extraction**:
- First page: ~100ms (full extraction)
- Subsequent pages: ~2ms (cached lookup)

**ID Detection** (per page):
- ROI-based: ~5ms (filter cached text, regex)
- Legacy: ~50ms (title block detection cached, text filtering)

**Merge Planning**:
- ID parsing: Variable (depends on pages processed, demand-driven extraction)
- Planning: ~10ms (in-memory operations)

**PDF Assembly**:
- Page copying: ~5ms/page
- Bookmark generation: ~50ms/page (if enabled)

## Key Design Principles

1. **Single Source of Truth**: All PDF operations go through `DocumentContext`/`PageContext`
2. **Demand-Driven Caching**: Expensive operations cached per page when first accessed
3. **Pluggable Detection**: `SheetLocator` interface allows different strategies
4. **Pure Parsers**: Parsers are pure functions (no IO), work with cached data
5. **Fail-Safe**: CompositeLocator provides fallback when ROI fails
6. **User Control**: Layout profiles give users control over extraction regions
7. **Consistent Normalization**: All IDs normalized to canonical dash format (`M1-01`) throughout the system
8. **Smart Duplicate Resolution**: Keep highest confidence occurrence; if tied, keep earliest

## Normalized ID Format

- **Canonical form**: Dash-separated (`M1-01`, `E2-101A`)
- All input formats normalize to dash: `M1.01` → `M1-01`, `M1 01` → `M1-01`
- Consistent throughout: parsing, storage, matching, reports

## Duplicate Resolution

When same normalized ID appears on multiple pages:
1. Sort by confidence (descending)
2. If confidence tied: sort by page index (ascending)
3. Keep first in sorted list
4. Log all occurrences for debugging

This ensures highest-confidence detection is kept, avoiding false positives from cover/index pages.
