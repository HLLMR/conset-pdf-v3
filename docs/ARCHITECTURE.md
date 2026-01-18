# Architecture

**Last verified**: 2026-01-17

## Module Overview

```
packages/core/src/
├── analyze/           # PDF loading, text extraction, caching
├── core/             # Business logic (merge/split/assemble)
├── locators/         # Detection strategies (pluggable)
├── parser/           # ID parsing/normalization (pure)
├── layout/           # Layout profile system
├── workflows/        # Workflow engine (analyze/execute pattern)
│   ├── types.ts      # Core workflow types (InventoryResult, CorrectionOverlay, etc.)
│   ├── engine.ts     # WorkflowRunner factory
│   ├── merge/         # Merge workflow implementation
│   └── mappers/       # Mapping from legacy structures to workflow types
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

- **`mergeAddenda()`**: Merge addenda into original (legacy direct API)
- **`splitSet()`**: Split PDF into subsets
- **`assembleSet()`**: Assemble multiple PDFs
- **`planner.ts`**: Plans merge operations (supports `includeInventory: true` for workflow engine)
- **`applyPlan.ts`**: Applies merge plan
- **`report.ts`**: Generates reports

### Workflows (`workflows/`)

**Purpose**: Reusable workflow engine pattern (analyze/execute)

- **`types.ts`**: Core workflow types (`InventoryResult`, `CorrectionOverlay`, `ExecuteResult`, etc.)
- **`engine.ts`**: `WorkflowRunner` factory and `WorkflowImpl` interface
- **`merge/mergeWorkflow.ts`**: Merge workflow implementation
  - `analyze()`: Runs `planMerge(includeInventory: true)`, maps to `InventoryResult`
  - `applyCorrections()`: Re-analyzes and applies corrections overlay (ignored rows, ID overrides)
  - `execute()`: Runs `mergeAddenda()`, returns `ExecuteResult`
- **`mappers/merge.ts`**: Maps `ParseResult.inventory` → `InventoryRowBase[]`, `MergePlan` → `InventoryResult.summary`

**Rule**: Workflow engine is canonical for merge operations. CLI and GUI route through `createMergeWorkflowRunner()`.

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

## Workflow Engine API

### WorkflowImpl Interface

All workflows implement the `WorkflowImpl<IAnalyze, ICorrections, IExecute>` interface:

```typescript
interface WorkflowImpl<IAnalyze, ICorrections, IExecute> {
  /**
   * Analyze input and produce inventory result
   * Must NOT write output files - this is a dry-run operation
   */
  analyze(input: IAnalyze): Promise<InventoryResult>;

  /**
   * Apply corrections overlay to inventory
   * Returns modified inventory with corrections applied
   */
  applyCorrections(
    input: ICorrections,
    inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult>;

  /**
   * Execute the workflow
   * Produces output files and returns execution result
   */
  execute(input: IExecute): Promise<ExecuteResult>;
}
```

### WorkflowRunner Factory

```typescript
// Create a workflow runner from an implementation
const runner = createWorkflowRunner('merge', mergeWorkflowImpl);

// Or use the merge-specific factory
const mergeRunner = createMergeWorkflowRunner();
```

### WorkflowRunner Interface

```typescript
interface WorkflowRunner<IAnalyze, ICorrections, IExecute> {
  analyze: (input: IAnalyze) => Promise<InventoryResult>;
  applyCorrections: (
    input: ICorrections,
    inventory: InventoryResult,
    corrections: CorrectionOverlay
  ) => Promise<InventoryResult>;
  execute: (input: IExecute) => Promise<ExecuteResult>;
}
```

## Inventory Schema

### InventoryResult

```typescript
interface InventoryResult {
  /** Workflow identifier ('merge', 'split', 'assemble', 'bookmark') */
  workflowId: WorkflowId;
  /** Optional lane identifier (for multi-lane workflows) */
  laneId?: string;
  /** Inventory rows (one per page/sheet) */
  rows: InventoryRowBase[];
  /** Issues detected during analysis */
  issues: Issue[];
  /** Conflicts detected (e.g., narrative vs detection) */
  conflicts: Conflict[];
  /** Summary statistics */
  summary: {
    totalRows: number;
    rowsWithIds: number;
    rowsWithoutIds: number;
    rowsOk: number;
    rowsWarning: number;
    rowsError: number;
    rowsConflict: number;
    issuesCount: number;
    conflictsCount: number;
    // Workflow-specific fields (e.g., replaced, inserted, unmatched for merge)
    [key: string]: number | string | undefined;
  };
  /** Optional metadata */
  meta?: Record<string, unknown>;
  /** Optional narrative instruction set (advisory only, read-only) */
  narrative?: NarrativeInstructionSet;
}
```

### InventoryRowBase

```typescript
interface InventoryRowBase {
  /** Unique row identifier (stable, never changes with corrections) */
  id: string;
  /** Optional lane identifier for multi-lane workflows */
  laneId?: string;
  /** Source file or origin */
  source?: string;
  /** Page number (1-based) or page index (0-based) */
  page?: number;
  /** Status of this row */
  status: RowStatus; // 'ok' | 'warning' | 'error' | 'conflict'
  /** Confidence level (0.0 to 1.0) */
  confidence: Confidence;
  /** Action to be taken (e.g., 'replace', 'insert', 'skip') */
  action?: string;
  /** Additional notes */
  notes?: string;
  /** Tags for categorization */
  tags?: string[];
  // Workflow-specific extensions (e.g., normalizedId for merge)
}
```

**Invariants**:
- `row.id` is stable: format `${source}:${pageIndex}:${idPart}`, never changes when corrections applied
- `row.normalizedId` (merge-specific): detected/overridden sheet ID, updated by corrections
- Rows are keyed by `row.id` in corrections overlay

### Issue

```typescript
interface Issue {
  /** Unique issue identifier */
  id: string;
  /** Severity level */
  severity: Severity; // 'error' | 'warning' | 'info'
  /** Issue code (e.g., 'NO_ID', 'LOW_CONFIDENCE', 'DUPLICATE') */
  code: string;
  /** Human-readable message */
  message: string;
  /** Row IDs affected by this issue */
  rowIds: string[];
  /** Optional lane identifier */
  laneId?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}
```

### Conflict

```typescript
interface Conflict {
  /** Unique conflict identifier */
  id: string;
  /** Conflict code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Row IDs involved in conflict */
  rowIds: string[];
  /** Optional lane identifier */
  laneId?: string;
  /** Narrative instruction (if applicable) */
  narrative?: unknown;
  /** Detected value (if applicable) */
  detected?: unknown;
  /** Suggested resolutions */
  suggestions?: unknown[];
}
```

## Corrections Model

### CorrectionOverlay

```typescript
interface CorrectionOverlay {
  /** Optional lane identifier */
  laneId?: string;
  /** Row IDs to ignore (visible but excluded from counts) */
  ignoredRowIds?: string[];
  /** Page numbers to ignore (alternative to ignoredRowIds) */
  ignoredPages?: number[];
  /** Overrides per row ID (keyed by stable row.id) */
  overrides: {
    [rowId: string]: {
      /** Action override (not implemented in Phase 1) */
      action?: string;
      /** Field overrides */
      fields?: Record<string, unknown>;
      /** Conflict resolution choice (not implemented in Phase 1) */
      resolvedConflictChoice?: 'narrative' | 'detected' | 'manual';
    };
  };
  /** Notes */
  notes?: string;
}
```

### Correction Application Rules

1. **Ignored rows**:
   - Rows remain visible in inventory (not filtered out)
   - Status set to `'ok'` and tag `'ignored'` added
   - Excluded from summary counts (`rowsOk`, `rowsWithIds`, etc.)
   - Issues/conflicts affecting only ignored rows are filtered out

2. **ID overrides**:
   - Keyed by stable `row.id` (not `normalizedId`)
   - Updates `row.normalizedId` field (stable `row.id` unchanged)
   - Used for matching and planning in execute phase

3. **Re-analysis**:
   - `applyCorrections()` re-runs `analyze()` first to get fresh state
   - Then applies corrections overlay to the fresh inventory
   - Ensures corrections are applied to current analysis results

## Logging/Error Conventions

### Logging Levels

- **Verbose mode** (`verbose: true`): Detailed progress, timing, warnings
- **Normal mode**: Errors and summary only

### Error Handling

- **File I/O errors**: Exit code 4 (file not found, permission denied)
- **Validation errors**: Exit code 2 (invalid arguments, mode, etc.)
- **Strict mode violations**: Exit code 3 (unmatched pages in strict mode)
- **Success**: Exit code 0

### Error Messages

- Construction-first language: "Sheet ID", "Addendum", "Spec Section"
- Include context: file paths, page numbers, detected values
- Actionable: suggest fixes when possible

## Extension Guide: Adding a New Workflow

To add a new workflow without breaking invariants:

### 1. Define Input Types

```typescript
// workflows/myworkflow/types.ts
export interface MyWorkflowAnalyzeInput {
  // Workflow-specific input fields
}

export interface MyWorkflowExecuteInput {
  // Workflow-specific input fields
}
```

### 2. Implement WorkflowImpl

```typescript
// workflows/myworkflow/myWorkflow.ts
import type { WorkflowImpl, InventoryResult, ExecuteResult, CorrectionOverlay } from '../types.js';
import type { MyWorkflowAnalyzeInput, MyWorkflowExecuteInput } from './types.js';

export const myWorkflowImpl: WorkflowImpl<
  MyWorkflowAnalyzeInput,
  MyWorkflowAnalyzeInput, // Usually same as analyze
  MyWorkflowExecuteInput
> = {
  async analyze(input: MyWorkflowAnalyzeInput): Promise<InventoryResult> {
    // 1. Load PDFs via DocumentContext (single load per PDF)
    // 2. Detect IDs using locators (pure, no IO)
    // 3. Build inventory rows with stable row.id
    // 4. Identify issues and conflicts
    // 5. Return InventoryResult (no file writes)
  },

  async applyCorrections(
    input: MyWorkflowAnalyzeInput,
    _inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult> {
    // 1. Re-run analyze() for fresh state
    // 2. Apply ignoredRowIds (mark as ignored, exclude from counts)
    // 3. Apply overrides (update fields, preserve stable row.id)
    // 4. Filter issues/conflicts affecting only ignored rows
    // 5. Recalculate summary
    // 6. Return corrected InventoryResult
  },

  async execute(input: MyWorkflowExecuteInput): Promise<ExecuteResult> {
    // 1. Use corrected inventory if provided
    // 2. Execute workflow (write output files)
    // 3. Return ExecuteResult with output paths and statistics
  },
};
```

### 3. Create Factory Function

```typescript
// workflows/myworkflow/index.ts
import { createWorkflowRunner } from '../engine.js';
import { myWorkflowImpl } from './myWorkflow.js';

export function createMyWorkflowRunner() {
  return createWorkflowRunner('myworkflow', myWorkflowImpl);
}
```

### 4. Export from Core

```typescript
// packages/core/src/index.ts
export { createMyWorkflowRunner } from './workflows/myworkflow/index.js';
export type * from './workflows/myworkflow/types.js';
```

### 5. Add CLI Command (Optional)

```typescript
// packages/cli/src/commands/myworkflow.ts
import { createMyWorkflowRunner } from '@conset-pdf/core';

export function myWorkflowCommand(program: Command) {
  program
    .command('my-workflow')
    .description('Description of workflow')
    // ... options
    .action(async (options) => {
      const runner = createMyWorkflowRunner();
      if (options.dryRun) {
        const inventory = await runner.analyze({ /* ... */ });
        // Output inventory JSON
      } else {
        const result = await runner.execute({ /* ... */ });
        // Print summary
      }
    });
}
```

### Invariants to Maintain

1. **Single-load PDF pipeline**: Use `DocumentContext`, never load PDFs directly
2. **Stable row.id**: Format `${source}:${pageIndex}:${idPart}`, never changes
3. **Pure locators**: No IO, consume `PageContext` only
4. **Analyze is dry-run**: Never write files in `analyze()`
5. **Corrections keyed by row.id**: Use stable ID, not normalizedId
6. **Ignored rows visible**: Don't filter, mark with tag and exclude from counts
