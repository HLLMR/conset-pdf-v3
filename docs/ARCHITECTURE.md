# Architecture

## Module Overview

```
packages/core/src/
├── analyze/           # PDF loading, text extraction, caching
├── core/             # Business logic (merge/split/assemble)
├── locators/         # Detection strategies (pluggable)
├── parser/           # ID parsing/normalization (pure)
├── layout/           # Layout profile system
└── utils/            # Utilities (bookmarks, PDF helpers)
```

### Analyze (`analyze/`)

**Purpose**: Single source of truth for PDF operations

- **`DocumentContext`**: Document-level state
  - Loads PDF once via `initialize()`
  - Caches PDF bytes and pdfjs document
  - Creates/manages `PageContext` instances
  - Coordinates text extraction (demand-driven)

- **`PageContext`**: Per-page caching
  - Page dimensions, rotation
  - Text items (extracted once, cached)
  - Plain text (derived)
  - ROI-filtered views (derived)

**Rule**: Only `analyze/` may load PDFs or create PDF.js documents.

### Core (`core/`)

**Purpose**: Business logic for operations

- **`mergeAddenda()`**: Merge addenda into original
- **`splitSet()`**: Split PDF into subsets
- **`assembleSet()`**: Assemble multiple PDFs
- **`planner.ts`**: Plans merge operations
- **`applyPlan.ts`**: Applies merge plan
- **`report.ts`**: Generates reports

### Locators (`locators/`)

**Purpose**: Pluggable detection strategies

- **`SheetLocator`**: Interface contract
- **`RoiSheetLocator`**: ROI-based detection
- **`LegacyTitleblockLocator`**: Auto-detected title block
- **`SpecsSectionLocator`**: Specs section detection
- **`CompositeLocator`**: ROI-first with fallback

**Rule**: Locators are pure (no IO). Consume cached `PageContext` only.

### Parser (`parser/`)

**Purpose**: Pure ID parsing/normalization

- **`normalize.ts`**: ID normalization (canonical dash format)
- **`drawingsSheetId.ts`**: Drawing sheet ID patterns
- **`specsSectionId.ts`**: Spec section ID patterns

**Rule**: Parsers are pure functions (no IO).

### Layout (`layout/`)

**Purpose**: User-defined ROI regions

- **`types.ts`**: Layout profile schema, ROI types
- **`load.ts`**: Load profiles from JSON or create inline

### Utils (`utils/`)

**Purpose**: Utilities

- **`bookmarks.ts`**: Bookmark generation
- **`bookmarkWriter.ts`**: Bookmark writing interface
- **`pdf.ts`**: PDF helpers (legacy fallback)
- **`fs.ts`**: File system helpers

## Intentional `any` Policy

**pdf.js/pdf-lib surfaces** use `any` intentionally:

- **pdf.js**: Types are incomplete/outdated
- **pdf-lib**: Types don't match runtime behavior
- **Strategy**: Use `any` at boundaries, type internally

**Example**:
```typescript
// Boundary: pdf.js types are incomplete
const page: any = await pdfDoc.getPage(pageIndex);

// Internal: Type what we extract
const viewport = page.getViewport({ scale: 1.0 });
const width: number = viewport.width;
```

## Architecture Invariants

### 1. Single-Load PDF Pipeline

Only `analyze/` may load PDFs. All operations go through `DocumentContext`.

### 2. PageContext Caching

Expensive per-page operations cached once per page.

### 3. Locator Seam

Planner uses `locator.locate()`, not direct detection.

### 4. ROI-First Detection

ROI-based detection is default, with explicit fallback tracking.

## Data Flow

### Merge Operation

```
1. Create locator (ROI or legacy)
2. For each PDF:
   a. Create DocumentContext
   b. Initialize (load once)
   c. For each page:
      - Get PageContext (cached)
      - Extract text if needed (demand-driven)
      - Run locator.locate(pageContext)
3. Build ID maps
4. Plan merge
5. Apply plan
6. Generate report
```

### Detection Flow

```
PageContext (cached text items)
  → Locator.locate()
    → Filter by ROI (if ROI locator)
    → Apply regex pattern
    → Calculate confidence
    → Return SheetLocationResult
```

## Performance

- **Text extraction**: First page ~100ms, subsequent ~2ms (cached)
- **ID detection**: ROI ~5ms, Legacy ~50ms
- **Merge planning**: ~10ms (in-memory)
- **PDF assembly**: ~5ms/page
