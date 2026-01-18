# Roadmap

**Last updated**: 2026-01-17

**Recent Updates**:
- ✅ Narrative validation complete (Commits A4-A6)
- ✅ Standards module complete (UCS/CSI)
- ✅ GUI integration: Narrative validation UI, Set Order sorting, single addendum workflow

This document provides a comprehensive view of what's complete, what's in progress, and what remains to be implemented in the conset-pdf project.

## Overview

**Project Philosophy**: Boring, explicit, construction-grade features with incremental commits and CLI parity. Core-first development. No architectural "improvements" or refactors for cleanliness.

**Workflow Pattern**: All workflows follow the **analyze → applyCorrections → execute** pattern for consistency.

---

## ✅ Fully Complete

### Update Documents (Merge) Workflow

**Status**: ✅ **100% Complete** (Engine + CLI + GUI)

**What's Done**:
- Complete workflow engine implementation (`workflows/merge/mergeWorkflow.ts`)
- CLI command: `merge-addenda` with full options
- GUI wizard: 4-step Update Documents workflow
- **Drawings support**: ROI-based detection with layout profiles + legacy fallback
- **Specs support**: Text-based section ID detection (`SpecsSectionLocator`)
- Inventory analysis with corrections support
- All merge modes: `replace+insert`, `replace-only`, `append-only`
- Bookmark regeneration option
- Dry-run mode with JSON output
- Report generation

**Files**:
- `packages/core/src/workflows/merge/mergeWorkflow.ts`
- `packages/core/src/workflows/merge/types.ts`
- `packages/cli/src/commands/mergeAddenda.ts`
- `conset-pdf-gui/src/merge-wizard.js`

**Documentation**: Fully documented in `docs/WORKFLOWS.md`, `docs/CLI.md`, `docs/PUBLIC_API.md`

### Standards Module (UCS/CSI)

**Status**: ✅ **100% Complete**

**What's Done**:
- ✅ **Drawings Standards**: UDS-style discipline identification
  - `normalizeDrawingsDiscipline()` - Normalizes discipline from sheet ID and title
  - Discipline designator identification (G, C, L, A, I, S, M, P, E, F, T)
  - Multi-letter alias handling (FP, DDC, ATC, SEC, AV, IT, etc.)
  - Heuristic-based disambiguation (Controls vs Civil)
  - Discipline-based sorting with `compareDrawingsRows()`
- ✅ **Specs Standards**: CSI MasterFormat classification
  - `normalizeSpecsMasterformat()` - Normalizes MasterFormat from section ID
  - Division identification (00-49) with titles
  - Section classification (DD SS SS format)
  - MasterFormat-based sorting with `compareSpecsRows()`
- ✅ **Integration**: Standards metadata added to inventory rows
  - Drawings rows include optional `discipline` field
  - Specs rows include optional `specs` field
  - Integrated into merge workflow mapper
  - Non-breaking (optional fields only)

**Files**:
- `packages/core/src/standards/` (complete module)
- `packages/core/src/standards/normalizeDrawingsDiscipline.ts`
- `packages/core/src/standards/normalizeSpecsMasterformat.ts`
- `packages/core/src/standards/compare.ts`
- `packages/core/src/standards/datasets/` (designators, order heuristic, divisions)
- `packages/core/src/workflows/mappers/merge.ts` (integration)

**Documentation**: Fully documented in `docs/STANDARDS.md`

### Narrative PDF Processing

**Status**: ✅ **100% Complete** (Validation Implemented)

**What's Done**:
- ✅ Text extraction from narrative PDFs (`narrative/text-extract.ts`)
- ✅ Algorithmic parsing (`narrative/parse-algorithmic.ts`)
- ✅ **Deterministic validation against inventory** (`narrative/validate.ts`)
  - Compares narrative claims against detected inventory
  - Identifies discrepancies between narrative and detected changes
  - Generates `NarrativeIssue[]` with issue codes
  - Near-match suggestions using Levenshtein similarity
  - Suggested corrections (not auto-applied)
- ✅ Integration into merge workflow `analyze()`
  - Validation report included in `InventoryResult.narrativeValidation`

**Files**:
- `packages/core/src/narrative/text-extract.ts` ✅
- `packages/core/src/narrative/parse-algorithmic.ts` ✅
- `packages/core/src/narrative/normalize.ts` ✅
- `packages/core/src/narrative/validate.ts` ✅
- `packages/core/src/narrative/types.ts` ✅
- `packages/core/src/workflows/merge/mergeWorkflow.ts` ✅

**Documentation**: Architecture documented in `docs/ARCHITECTURE.md`

---

## ⚠️ Partially Complete

### Narrative PDF Processing

**Status**: ✅ **Phase 1 & 2 Complete** (Validation Implemented)

**What's Done**:
- ✅ Text extraction from narrative PDFs (`narrative/text-extract.ts`)
  - Uses `DocumentContext` (architecture-compliant)
  - Page-aware extraction with file hashing
- ✅ Algorithmic parsing (`narrative/parse-algorithmic.ts`)
  - Deterministic pattern matching (no LLM)
  - Extracts drawing and spec instructions
  - Normalizes sheet/spec IDs
  - Produces `NarrativeInstructionSet` with issues
- ✅ **Deterministic validation against inventory** (`narrative/validate.ts`)
  - Compares narrative claims against detected inventory
  - Identifies discrepancies between narrative and detected changes
  - Generates `NarrativeIssue[]` with issue codes
  - Near-match suggestions using Levenshtein similarity for typos/spacing variations
  - Suggested corrections (not auto-applied)
- ✅ Integration into merge workflow `analyze()`
  - Narrative PDF can be provided as optional input
  - Extracted, parsed, and validated during analyze
  - Included in `InventoryResult.narrative` and `InventoryResult.narrativeValidation` (advisory only, read-only)

**What's Optional**:
- ❌ **LLM-Assisted Extraction**: Optional LLM provider for better parsing (planned but not required)

**Files**:
- `packages/core/src/narrative/text-extract.ts` ✅
- `packages/core/src/narrative/parse-algorithmic.ts` ✅
- `packages/core/src/narrative/normalize.ts` ✅
- `packages/core/src/narrative/validate.ts` ✅
- `packages/core/src/narrative/types.ts` ✅
- `packages/core/src/workflows/merge/mergeWorkflow.ts` ✅ (full integration)

**Current Behavior**: Narrative is extracted, parsed, and validated against inventory. Validation issues are included in `InventoryResult.narrativeValidation` with issue codes, near-match suggestions, and suggested corrections. The validation is advisory only and does not modify detection results.

---

### Split Set Workflow

**Status**: ⚠️ **CLI Only (Legacy API), Workflow Engine Not Implemented**

**What's Done**:
- ✅ CLI command: `split-set` exists
- ✅ Legacy API: `splitSet()` function in `core/splitSet.ts`

**What's Missing**:
- ❌ Workflow engine implementation (analyze/execute pattern)
- ❌ GUI wizard (placeholder exists)
- ❌ Inventory analysis for split operations
- ❌ Corrections support
- ❌ Preview/preview mode

**Files**:
- `packages/cli/src/commands/splitSet.ts` ✅ (uses legacy API)
- `packages/core/src/core/splitSet.ts` ✅ (legacy implementation)
- `conset-pdf-gui/src/placeholder-wizard.js` ⚠️ (placeholder UI)

**Planned Implementation**: See "Future Work" section below.

---

### Assemble Set Workflow

**Status**: ⚠️ **CLI Only (Legacy API), Workflow Engine Not Implemented**

**What's Done**:
- ✅ CLI command: `assemble-set` exists
- ✅ Legacy API: `assembleSet()` function in `core/assembleSet.ts`

**What's Missing**:
- ❌ Workflow engine implementation (analyze/execute pattern)
- ❌ GUI wizard (placeholder exists)
- ❌ Inventory analysis for assembly operations
- ❌ Order validation
- ❌ Conflict detection

**Files**:
- `packages/cli/src/commands/assembleSet.ts` ✅ (uses legacy API)
- `packages/core/src/core/assembleSet.ts` ✅ (legacy implementation)
- `conset-pdf-gui/src/placeholder-wizard.js` ⚠️ (placeholder UI)

**Planned Implementation**: See "Future Work" section below.

---

## ❌ Not Started

### Fix Bookmarks Workflow

**Status**: ❌ **Not Implemented** (Utilities exist, workflow not started)

**What Exists**:
- ✅ Bookmark writing utilities (`utils/pdfLibBookmarkWriter.ts`, `utils/bookmarkWriter.ts`)
- ✅ Bookmark regeneration option in merge workflow (uses existing bookmarks)

**What's Missing**:
- ❌ Workflow engine implementation
- ❌ CLI command
- ❌ GUI wizard (placeholder exists)
- ❌ Bookmark reading/analysis
- ❌ Bookmark validation (orphans, invalid destinations)
- ❌ Bookmark correction support

**Files**:
- `packages/core/src/utils/pdfLibBookmarkWriter.ts` ✅ (utility only)
- `packages/core/src/utils/bookmarkWriter.ts` ✅ (interface)
- `conset-pdf-gui/src/placeholder-wizard.js` ⚠️ (placeholder UI)

**Planned Implementation**: See "Future Work" section below.

---

## 📋 Future Work (Detailed Implementation Plan)

### Priority 1: Narrative Validation & Conflict Resolution

**Goal**: Make narrative PDF a high-credence advisory source that validates against inventory and surfaces issues/conflicts.

#### Commit A1 — Narrative Module Boundary (No Behavior Change)

**Status**: ✅ **Already Complete**

The narrative module already exists with stable types:
- `NarrativeExtraction` (as `NarrativeInstructionSet`)
- `NarrativeItem` (as `DrawingInstruction` / `SpecInstruction`)
- `NarrativeRef` (embedded in instructions)
- `NarrativeIssue` (as `NarrativeParseIssue`)

**Next**: Add validation types.

#### Commit A2 — Deterministic PDF-to-Text Extraction

**Status**: ✅ **Already Complete**

- `extractNarrativeTextFromPdf()` exists and works
- Uses `DocumentContext` (architecture-compliant)
- Page-aware with file hashing

**No work needed**.

#### Commit A3 — LLM-Assisted Extraction (Optional)

**Status**: ❌ **Not Started**

**Planned**:
- Create `NarrativeExtractorLLM` class
- Support LLM provider injection (CLI/GUI can pass API key/config)
- Offline fallback (if no LLM, return empty extraction with warning)
- Chunk narrative text (page-aware)
- Prompt LLM for strict JSON output per chunk
- Validate JSON with schema (zod or similar)
- Normalize IDs deterministically
- Merge duplicates
- Keep `rawText` for traceability

**Files to Create**:
- `packages/core/src/narrative/llm-extract.ts` (new)
- Update `narrative/index.ts` to export LLM extractor

**Note**: This is optional. Algorithmic parsing works for many cases.

#### Commit A4 — Deterministic Validation vs Inventory

**Status**: ✅ **Complete**

**Goal**: Compare narrative claims against detection inventory and generate issues.

**Implementation**:
- ✅ Created `validateNarrativeAgainstInventory()` function
- Input: `NarrativeInstructionSet` + `InventoryResult`
- Output: `NarrativeValidationReport` with:
  - `issues: NarrativeIssue[]`
  - `suggestedCorrections: CorrectionPatch[]` (optional, not applied)

**Matching Logic** (deterministic):
1. Normalize IDs:
   - Sheets: uppercase, trim, collapse spaces, normalize separators (`A-101` vs `A101` vs `A 101`)
   - Specs: normalize to `NN NN NN` (e.g., `230900` → `23 09 00`)
2. Exact match first on `row.normalizedId`
3. If no exact match:
   - Fuzzy candidates using Levenshtein edit distance / token similarity
   - Return top N candidates as `nearMatches`
4. Never auto-map; only suggest

**Issue Types**:
- `NARR_SHEET_NOT_FOUND`: Narrative references sheet not in inventory
- `NARR_NEAR_MATCH`: Close match found (typo candidate)
- `NARR_AMBIGUOUS_MATCH`: Multiple candidates
- `NARR_INVENTORY_NOT_MENTIONED`: Detected changes not referenced in narrative (warn only)

**Files Created**:
- ✅ `packages/core/src/narrative/validate.ts`
- ✅ Updated `narrative/types.ts` with `NarrativeValidationReport`, `NarrativeIssue`

#### Commit A5 — Integrate Validation into Merge Workflow `analyze()`

**Status**: ✅ **Complete**

**Goal**: `analyze()` returns narrative issues when narrative PDF exists.

**Implementation**:
- ✅ In `mergeWorkflow.ts` `analyze()`:
  - After inventory detection
  - If narrative provided:
    - Extract narrative → validate vs inventory
    - Append validation report into analyze output (do not alter detection)
- ✅ Extended `InventoryResult` to include:
  - `narrativeValidation?: NarrativeValidationReport`

**Files Modified**:
- ✅ `packages/core/src/workflows/merge/mergeWorkflow.ts`
- ✅ `packages/core/src/workflows/types.ts` (added `narrativeValidation` to `InventoryResult`)

**CLI**: Dry-run JSON includes narrative validation report.

#### Commit A6 — Narrative-Derived Suggested Corrections (Optional)

**Status**: ✅ **Complete**

**Goal**: Provide suggestions in the same correction model style.

**Implementation**:
- ✅ If narrative says sheet `A1.2` replaced, but inventory has `A1.3` replaced:
  - Suggests: "Did you mean A1.2? Or is A1.3 actually A1.2?"
- ✅ If narrative references `A101` but inventory has `A-101`:
  - Suggests normalization correction mapping

**Output**: `suggestedCorrections` in `NarrativeValidationReport` (separate from user-provided corrections).

**Files Modified**:
- ✅ `packages/core/src/narrative/validate.ts` (suggestion logic implemented)

#### Commit A7 — CLI: Narrative Options

**Status**: ❌ **Not Started**

**Planned Flags**:
- `--narrative <path>` (already exists in merge-addenda)
- `--narrative-mode <off|extract|validate>` (default: validate if narrative given)
- `--llm-provider ...` / `--api-key ...` (if LLM extraction implemented)

**Files to Modify**:
- `packages/cli/src/commands/mergeAddenda.ts`

---

### Priority 2: Fix Bookmarks Workflow

**Goal**: Regenerate PDF bookmarks from detected sheet IDs and titles.

#### Commit C1 — Scaffold Fix Bookmarks Workflow

**Status**: ❌ **Not Started**

**Implementation**:
- Create `workflows/bookmark/bookmarkWorkflow.ts`
- Implement `WorkflowImpl` interface:
  - `analyze(input)`: Read existing bookmarks, validate destinations
  - `applyCorrections()`: Support rename, reorder, delete/add nodes, update destinations
  - `execute()`: Write changes

**Input Types**:
```typescript
interface BookmarkAnalyzeInput {
  pdfPath: string;
  docType: 'drawings' | 'specs';
  profile?: LayoutProfile;  // For detection if bookmarks missing
}

interface BookmarkExecuteInput {
  pdfPath: string;
  outputPdfPath: string;
  corrections?: CorrectionOverlay;  // Bookmark-specific corrections
}
```

**Inventory Model**:
- Bookmark tree with stable IDs (same idea: stable uid per node)
- Each node: `id`, `title`, `pageIndex`, `parentId`, `children[]`

**Files to Create**:
- `packages/core/src/workflows/bookmark/bookmarkWorkflow.ts`
- `packages/core/src/workflows/bookmark/types.ts`
- `packages/core/src/workflows/bookmark/index.ts`

#### Commit C2 — Read Bookmarks + Validate Destinations

**Status**: ❌ **Not Started**

**Implementation**:
- Use PDF.js or pdf-lib to read existing outline/bookmarks
- Validate destinations (page targets)
- Detect issues:
  - Orphan bookmarks (invalid destinations)
  - Duplicates
  - Weird ordering
  - Missing top-level entries

**Files to Create/Modify**:
- `packages/core/src/utils/bookmarkReader.ts` (new)
- `packages/core/src/workflows/bookmark/bookmarkWorkflow.ts` (analyze implementation)

#### Commit C3 — Write Bookmarks

**Status**: ⚠️ **Partial** (utilities exist)

**What Exists**:
- `PdfLibBookmarkWriter` class
- `BookmarkWriter` interface

**What's Needed**:
- Integration into workflow `execute()`
- Generate bookmarks from detected sheet IDs if missing
- Apply corrections (rename, reorder, etc.)

**Files to Modify**:
- `packages/core/src/workflows/bookmark/bookmarkWorkflow.ts` (execute implementation)

#### Commit C4 — CLI Command

**Status**: ❌ **Not Started**

**Command**: `conset-pdf fix-bookmarks`

**Options**:
- `--input <path>`: Input PDF
- `--output <path>`: Output PDF
- `--type <drawings|specs>`: Document type
- `--layout <path>`: Layout profile (for detection if bookmarks missing)
- `--dry-run`: Preview only

**Files to Create**:
- `packages/cli/src/commands/fixBookmarks.ts`

---

### Priority 3: Extract Documents (Split) Workflow

**Goal**: Domain-correct slicing of construction documents.

#### Commit D1 — Scaffold Extract Documents Workflow

**Status**: ❌ **Not Started**

**Implementation**:
- Create `workflows/split/splitWorkflow.ts`
- Implement `WorkflowImpl` interface
- Inventory lists extractable units:
  - Drawings: sheets/ranges
  - Specs: divisions/sections (23 09 00 style)
- Preview support: counts + target filenames + page ranges

**Input Types**:
```typescript
interface SplitAnalyzeInput {
  pdfPath: string;
  docType: 'drawings' | 'specs';
  grouping: 'prefix' | 'section' | 'division' | 'custom';
  prefixes?: string[];  // For drawings
  customPattern?: string;  // Regex
  profile?: LayoutProfile;  // For detection
}

interface SplitExecuteInput {
  pdfPath: string;
  outputDir: string;
  docType: 'drawings' | 'specs';
  grouping: 'prefix' | 'section' | 'division' | 'custom';
  // ... other options
  corrections?: CorrectionOverlay;
}
```

**Files to Create**:
- `packages/core/src/workflows/split/splitWorkflow.ts`
- `packages/core/src/workflows/split/types.ts`
- `packages/core/src/workflows/split/index.ts`

#### Commit D2 — Drawing Extraction by Sheet Boundaries

**Status**: ❌ **Not Started**

**Implementation**:
- Reuse detection logic from merge workflow
- Group pages by detected sheet ID prefix (M, E, P, etc.)
- Generate subset PDFs per group
- Support custom grouping patterns

**Files to Modify**:
- `packages/core/src/workflows/split/splitWorkflow.ts`

#### Commit D3 — Specs Extraction by Section Heuristics

**Status**: ❌ **Not Started**

**Implementation**:
- Detect section headers (deterministic heuristics)
- Group pages by section
- Allow manual correction via corrections overlay

**Files to Modify**:
- `packages/core/src/workflows/split/splitWorkflow.ts`

#### Commit D4 — Update CLI to Use Workflow Engine

**Status**: ❌ **Not Started**

**Current**: `split-set` uses legacy `splitSet()` API

**Planned**: Route through `createSplitWorkflowRunner()`

**Files to Modify**:
- `packages/cli/src/commands/splitSet.ts`

---

### Priority 4: Build Package (Assemble) Workflow

**Goal**: Reassemble multiple PDF subsets into a single ordered document set.

#### Commit E1 — Scaffold Build Package Workflow

**Status**: ❌ **Not Started**

**Implementation**:
- Create `workflows/assemble/assembleWorkflow.ts`
- Input: ordered list of docs
- Analyze: validates order, detects conflicts, suggests bookmarks integration
- Execute: merges into single output package

**Input Types**:
```typescript
interface AssembleAnalyzeInput {
  inputDir: string;
  docType: 'drawings' | 'specs';
  orderFile?: string;  // JSON file specifying order
  profile?: LayoutProfile;  // For validation
}

interface AssembleExecuteInput {
  inputDir: string;
  outputPdfPath: string;
  docType: 'drawings' | 'specs';
  orderFile?: string;
  corrections?: CorrectionOverlay;
}
```

**Files to Create**:
- `packages/core/src/workflows/assemble/assembleWorkflow.ts`
- `packages/core/src/workflows/assemble/types.ts`
- `packages/core/src/workflows/assemble/index.ts`

#### Commit E2 — Order Validation

**Status**: ❌ **Not Started**

**Implementation**:
- Validate that input PDFs can be assembled in specified order
- Detect conflicts (duplicate sheet IDs, missing sequences)
- Generate inventory with issues

**Files to Modify**:
- `packages/core/src/workflows/assemble/assembleWorkflow.ts`

#### Commit E3 — Assembly Execution

**Status**: ❌ **Not Started**

**Implementation**:
- Merge PDFs in specified order
- Apply corrections (reorder, skip, etc.)
- Generate output PDF

**Files to Modify**:
- `packages/core/src/workflows/assemble/assembleWorkflow.ts`

#### Commit E4 — Update CLI to Use Workflow Engine

**Status**: ❌ **Not Started**

**Current**: `assemble-set` uses legacy `assembleSet()` API

**Planned**: Route through `createAssembleWorkflowRunner()`

**Files to Modify**:
- `packages/cli/src/commands/assembleSet.ts`

---

## GUI Work (conset-pdf-gui)

### ✅ Complete

- Update Documents wizard (4-step workflow)
- Profile management with ROI selection
- IPC architecture
- Quick-start drawers

### ⚠️ Placeholder UI Exists

- Extract Documents (Split) wizard
- Build Package (Assemble) wizard
- Fix Bookmarks wizard

**Files**: `conset-pdf-gui/src/placeholder-wizard.js`

### ❌ Not Started

- Narrative validation UI (display issues in Step 3)
- "Apply suggestion" buttons for narrative corrections
- Split/Assemble/Bookmark wizard implementations

**Planned**: After core workflows are implemented, add GUI wizards following the same pattern as Update Documents.

---

## Implementation Principles

### Guardrails

1. **No changing the stable workflow pattern**: All workflows follow analyze → applyCorrections → execute
2. **Narrative is additive**: Narrative validation adds to analyze results, doesn't replace detection
3. **No smart auto-corrections**: Suggestions only, never auto-applied
4. **Stable IDs**: All outputs explicitly keyed and versionable (stable codes, stable IDs)
5. **Incremental commits**: One concern per commit, green build/tests
6. **CLI parity**: All workflows must have CLI commands
7. **Core-first**: Implement in core library first, then CLI, then GUI

### Architecture Invariants

- Only `DocumentContext` loads PDFs
- Locators are pure (no IO)
- Parsers are pure functions
- Workflow engine is canonical (CLI and GUI route through it)

---

## Summary Table

| Feature | Core Engine | CLI | GUI | Status |
|---------|-------------|-----|-----|--------|
| **Update Documents (Merge)** | ✅ | ✅ | ✅ | Complete |
| **Standards (UCS/CSI)** | ✅ | ✅ | ✅ | Complete |
| **Narrative Extraction** | ✅ | ✅ | ⚠️ | Complete (GUI integration pending) |
| **Narrative Validation** | ✅ | ✅ | ⚠️ | Complete (GUI integration pending) |
| **Fix Bookmarks** | ❌ | ❌ | ⚠️ | Not started |
| **Extract Documents (Split)** | ❌ | ⚠️ | ⚠️ | CLI only (legacy) |
| **Build Package (Assemble)** | ❌ | ⚠️ | ⚠️ | CLI only (legacy) |

**Legend**:
- ✅ Complete
- ⚠️ Partial/Placeholder
- ❌ Not started

---

## Next Steps (Recommended Order)

1. **Fix Bookmarks** (Priority 1, Commits C1-C4)
   - Utilities already exist
   - Straightforward workflow implementation
   - High user value

2. **Extract Documents** (Priority 2, Commits D1-D4)
   - Reuse detection logic from merge
   - Domain-correct slicing

3. **Build Package** (Priority 3, Commits E1-E4)
   - Completes the split/assemble cycle
   - Lower priority than others

4. **GUI Integration** (After core workflows)
   - Narrative validation UI (validation complete, UI display pending)
   - Split/Assemble/Bookmark wizards

---

**Last Updated**: 2026-01-17
