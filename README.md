# conset-pdf

Core library and CLI for building "latest-and-greatest" construction document sets. A construction-focused PDF workflow tool that provides APIs for merging addenda, splitting sets, detecting sheet IDs, and assembling documents.

## Current Status (2026-01-17)

**✅ Fully Implemented:**
- Merge workflow (Update Documents) - Complete workflow engine implementation
  - **Drawings**: ROI-based detection with layout profiles (or legacy fallback)
  - **Specs**: Text-based section ID detection
- **Standards Module (UCS/CSI)** - Complete implementation
  - **Drawings**: UDS-style discipline identification and sorting
  - **Specs**: CSI MasterFormat classification and sorting
  - Integrated into merge workflow inventory mapping
- **Narrative PDF Processing** - Complete implementation
  - Text extraction and algorithmic parsing
  - **Deterministic validation** against inventory
  - Issue detection with near-match suggestions
  - Suggested corrections (advisory only)
- CLI commands for all operations
- ROI-based sheet detection with layout profiles (drawings)
- Legacy detection fallback (drawings)
- Inventory analysis with corrections support

**⚠️ Partially Implemented:**
- Split/Assemble/Bookmark workflows - CLI commands exist, workflow engine not yet implemented

**📚 Documentation:**
- Complete API documentation
- Comprehensive CLI usage guide
- Workflow engine architecture documented
- Extension guide for adding new workflows

## Repo Scope

This repository contains:
- **Core library** (`@conset-pdf/core`): Publishable npm package with PDF processing APIs
- **CLI tool** (`@conset-pdf/cli`): Command-line interface for all workflows

Both CLI and GUI applications route through the same workflow engine for consistency.

## What Core Provides

**Merge APIs**:
- `mergeAddenda()` - Replace updated sheets from addenda, insert new sheets
- `assembleSet()` - Assemble multiple PDFs into a single set

**Split APIs**:
- `splitSet()` - Split PDF into discipline-specific subsets

**Detection APIs**:
- `DocumentContext` - PDF loading and text extraction
- `RoiSheetLocator` - ROI-based sheet ID detection
- `LegacyTitleblockLocator` - Auto-detected title block detection
- `CompositeLocator` - ROI-first with legacy fallback
- `SpecsSectionLocator` - Specs section ID detection

**Layout System**:
- Layout profiles with ROI definitions
- Profile loading and validation

**Narrative Processing**:
- `extractNarrativeTextFromPdf()` - Extract text from narrative PDFs
- `parseNarrativeAlgorithmic()` - Parse narrative instructions
- `validateNarrativeAgainstInventory()` - Validate narrative against inventory (advisory only)

**Standards (UCS/CSI)**:
- `normalizeDrawingsDiscipline()` - UDS-style discipline identification
- `normalizeSpecsMasterformat()` - CSI MasterFormat classification
- `compareDrawingsRows()` - Discipline-based sorting comparator
- `compareSpecsRows()` - MasterFormat-based sorting comparator

**Workflow Engine**:
- `createMergeWorkflowRunner()` - Merge workflow with analyze/execute pattern
- `createWorkflowRunner()` - Generic workflow runner factory
- `InventoryResult` - Standardized inventory analysis result
- `CorrectionOverlay` - User corrections (ignore rows, override IDs)
- Workflow types: `merge`, `split`, `assemble`, `bookmark` (only `merge` is currently implemented)

## Install

```bash
npm install @conset-pdf/core
```

## Build

```bash
npm install
npm run build          # Build all packages
npm run build:core     # Build core only
npm run build:cli      # Build CLI only
```

## Test

```bash
npm test               # Run all tests
npm run test:smoke     # Smoke tests
npm run verify:invariants  # Architecture invariants
```

## Quick-Start Examples

### CLI Usage

**Merge addenda** (most common):
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf Addendum2.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json
```

**Dry-run inventory analysis** (preview before merging):
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --type drawings \
  --dry-run \
  --json-output inventory.json
```

**Detect sheet IDs** (test layout profile):
```bash
conset-pdf detect \
  --input Set.pdf \
  --layout layout.json \
  --pages 1,5,20 \
  --output-preview preview.json
```

**Split set**:
```bash
conset-pdf split-set \
  --input Set.pdf \
  --output-dir ./output \
  --type drawings
```

**Assemble set**:
```bash
conset-pdf assemble-set \
  --input-dir ./subsets \
  --output Final.pdf \
  --type drawings
```

### API Usage

```typescript
import { mergeAddenda, DocumentContext, RoiSheetLocator } from '@conset-pdf/core';
import { loadLayoutProfile } from '@conset-pdf/core';

// Load layout profile
const layout = await loadLayoutProfile('layout.json');

// Create locator
const locator = new RoiSheetLocator(layout);

// Merge addenda
const report = await mergeAddenda({
  originalPdfPath: 'Original.pdf',
  addendumPdfPaths: ['Addendum1.pdf', 'Addendum2.pdf'],
  outputPdfPath: 'Final.pdf',
  type: 'drawings',
  locator,
  mode: 'replace+insert',
  regenerateBookmarks: true,
});

console.log(`Merged ${report.stats.finalPagesPlanned} pages`);
```

## High-Level Architecture

### Workflow Engine Pattern

All workflows follow the **analyze → applyCorrections → execute** pattern:

1. **Analyze**: Dry-run inventory analysis (no file writes)
   - Detects sheet IDs from all input PDFs
   - Builds inventory of all pages with detected IDs
   - Identifies issues (missing IDs, duplicates, conflicts)
   - Returns `InventoryResult` for review

2. **Apply Corrections**: User edits applied to inventory
   - Ignore rows (visible but excluded from counts)
   - Override IDs (update `normalizedId`, stable `row.id` unchanged)
   - Returns corrected `InventoryResult`

3. **Execute**: Produces output files
   - Applies merge/split/assemble plan
   - Writes output PDFs
   - Returns `ExecuteResult` with file paths and statistics

### Inventory Model

- **Stable `row.id`**: Unique identifier per row (format: `${source}:${pageIndex}:${idPart}`)
  - Never changes when corrections are applied
  - Used as key for corrections overlay
  
- **`normalizedId`**: Detected/overridden sheet ID
  - Updated when user overrides ID
  - Used for matching and planning

- **Corrections keyed by `row.id`**: 
  - `ignoredRowIds`: Array of stable row IDs to ignore
  - `overrides[rowId].fields.normalizedId`: Override detected ID

- **Ignored rows**: Remain visible in inventory but excluded from summary counts

## Project Structure

```
conset-pdf/
├── packages/
│   ├── core/          # Core library (@conset-pdf/core)
│   │   └── src/
│   │       ├── analyze/      # PDF loading, text extraction
│   │       ├── core/         # Merge/split/assemble logic
│   │       ├── locators/     # Detection strategies
│   │       ├── parser/       # ID parsing/normalization
│   │       ├── layout/       # Layout profile system
│   │       ├── narrative/   # Narrative PDF processing
│   │       ├── workflows/    # Workflow engine (analyze/execute pattern)
│   │       └── utils/        # Utilities
│   └── cli/           # CLI tool (@conset-pdf/cli)
└── docs/              # Documentation
```

**Monorepo Structure**: This is an npm workspaces monorepo. Root-level commands (`npm install`, `npm run build`, `npm test`) are the authoritative workflows. Individual package scripts exist but are not the primary entry point.

## Workflows Implemented

| Workflow | Status | Description |
|----------|--------|-------------|
| **Update Documents** (merge) | ✅ Implemented | Merge addenda into original set, replace updated sheets, insert new sheets |
| Split Set | ⚠️ Placeholder | Split PDF into discipline-specific subsets (CLI command exists, workflow engine not implemented) |
| Assemble Set | ⚠️ Placeholder | Reassemble subsets into final ordered set (CLI command exists, workflow engine not implemented) |
| Fix Bookmarks | ⚠️ Placeholder | Regenerate bookmarks from detected sheet IDs (workflow engine not implemented) |

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - Module overview, invariants, data flow, extension guide
- **[Public API](docs/PUBLIC_API.md)** - Stable API contracts
- **[CLI](docs/CLI.md)** - All CLI commands, arguments, options, examples
- **[Workflows](docs/WORKFLOWS.md)** - Workflow details, inputs, outputs, implementation status
- **[Standards](docs/STANDARDS.md)** - UCS/CSI standards module (discipline & MasterFormat)
- **[Quick Start](docs/QUICK_START.md)** - Happy-path usage

## Quick Onboarding for New Developers

1. **Start Here**: Read [QUICK_START.md](docs/QUICK_START.md) for a hands-on walkthrough
2. **Understand Architecture**: Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) for module structure and invariants
3. **API Reference**: See [PUBLIC_API.md](docs/PUBLIC_API.md) for stable API contracts
4. **CLI Usage**: See [CLI.md](docs/CLI.md) for all CLI commands and examples
5. **Workflows**: See [WORKFLOWS.md](docs/WORKFLOWS.md) for workflow details and implementation status

**Key Concepts:**
- **Workflow Engine**: All operations follow analyze → applyCorrections → execute pattern
- **Inventory Model**: Stable `row.id` for corrections, `normalizedId` for matching
- **Single-Load Pipeline**: Only `DocumentContext` loads PDFs (architecture invariant)
- **ROI-First Detection**: ROI-based detection with legacy fallback

## Related Projects

- **[conset-pdf-gui](https://github.com/HLLMR/conset-pdf-gui)** - Electron GUI (uses `@conset-pdf/core`)

## License

MIT
