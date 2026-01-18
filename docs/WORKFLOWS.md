# Workflows Documentation

**Last verified**: 2026-01-17

This document describes all workflows implemented in the conset-pdf core library, their domain meaning, inputs, outputs, and current implementation status.

## Workflow Overview

All workflows follow the **analyze → applyCorrections → execute** pattern:

1. **Analyze**: Dry-run inventory analysis (no file writes)
2. **Apply Corrections**: User edits applied to inventory
3. **Execute**: Produces output files

## Update Documents (Merge)

**Domain Meaning**: Merge addenda into an original construction document set. Replace updated sheets from addenda and insert new sheets in the correct sequence. This is the primary workflow for keeping construction documents up-to-date as addenda are issued.

**Status**: ✅ **Implemented** (workflow engine + CLI + GUI)

### Inputs

**Analyze Input** (`MergeAnalyzeInput`):
```typescript
{
  docType: 'drawings' | 'specs';
  originalPdfPath: string;
  addendumPdfPaths: string[];
  profile?: LayoutProfile;  // Optional layout profile for ROI detection
  options?: {
    mode?: 'replace+insert' | 'replace-only' | 'append-only';
    strict?: boolean;
    verbose?: boolean;
    inventoryOutputDir?: string;
  };
  narrativePdfPath?: string;  // Optional narrative PDF for advisory analysis
}
```

**Execute Input** (`MergeExecuteInput`):
```typescript
{
  docType: 'drawings' | 'specs';
  originalPdfPath: string;
  addendumPdfPaths: string[];
  outputPdfPath: string;
  profile?: LayoutProfile;
  options?: {
    mode?: 'replace+insert' | 'replace-only' | 'append-only';
    strict?: boolean;
    verbose?: boolean;
    reportPath?: string;
    regenerateBookmarks?: boolean;
    inventoryOutputDir?: string;
  };
  analyzed?: { plan?: MergePlan };  // Optional plan from analyze (not used in Phase 1)
  corrections?: CorrectionOverlay;   // Optional corrections (not applied in Phase 1)
}
```

### Analyze Outputs

**Inventory Result** (`InventoryResult`):
- **Rows**: One row per page from all PDFs (original + addenda)
  - `id`: Stable identifier (format: `${source}:${pageIndex}:${idPart}`)
  - `normalizedId`: Detected/overridden sheet ID (e.g., "A-101")
  - `page`: Page number (1-based)
  - `status`: `'ok'`, `'warning'`, `'error'`, or `'conflict'`
  - `confidence`: Detection confidence (0.0 to 1.0)
  - `source`: Detection source (`'roi'`, `'legacy'`, etc.)
  - `action`: Planned action (`'replace'`, `'insert'`, `'keep'`, etc.)

- **Issues**: Detection problems
  - `NO_ID`: Page has no detected sheet ID
  - `LOW_CONFIDENCE`: Detection confidence below threshold
  - `DUPLICATE`: Multiple pages with same ID
  - `UNMATCHED`: Pages that couldn't be matched
  - `ROI_DETECTION_FAILURE`: ROI-based detection failed
  - `LEGACY_FALLBACK`: Fell back to legacy detection

- **Conflicts**: Currently empty (narrative vs detection conflicts not implemented)

- **Summary**: Statistics
  - `totalRows`: Total pages analyzed
  - `rowsWithIds`: Pages with detected IDs
  - `rowsWithoutIds`: Pages without IDs
  - `rowsOk`: Pages with no issues
  - `rowsWarning`: Pages with warnings
  - `rowsError`: Pages with errors
  - `replaced`: Number of sheets to be replaced
  - `inserted`: Number of new sheets to be inserted
  - `unmatched`: Number of unmatched pages

- **Meta**: Workflow metadata
  - `docType`: Document type
  - `originalPdfPath`: Original PDF path
  - `addendumPdfPaths`: Addendum PDF paths
  - `mode`: Merge mode
  - `strict`: Strict mode flag

- **Narrative**: Optional narrative instruction set (advisory only, read-only)

### Corrections Supported

1. **Ignore Rows**: Exclude pages from merge
   - Key: `ignoredRowIds: string[]` (array of stable `row.id` values)
   - Effect: Rows remain visible but excluded from summary counts
   - Use case: Skip pages that shouldn't be merged

2. **Override IDs**: Correct detected sheet IDs
   - Key: `overrides[rowId].fields.normalizedId: string`
   - Effect: Updates `row.normalizedId` (stable `row.id` unchanged)
   - Use case: Fix incorrect detections

**Example CorrectionOverlay**:
```json
{
  "ignoredRowIds": ["original-pdf:4:", "addendum1-pdf:10:A-999"],
  "overrides": {
    "original-pdf:5:": {
      "fields": {
        "normalizedId": "A-102"
      }
    }
  }
}
```

### Execute Outputs

**Execute Result** (`ExecuteResult`):
- **Outputs**: File paths
  - `outputPdfPath`: Path to merged PDF
  - `drawings` or `specs`: Type-specific key (same path)

- **Summary**: Execution statistics
  - `success`: `true`
  - `replaced`: Number of sheets replaced
  - `inserted`: Number of sheets inserted
  - `unmatched`: Number of unmatched pages
  - `finalPages`: Final page count
  - `parseTimeMs`: Time spent on detection/parsing
  - `mergeTimeMs`: Time spent on PDF assembly

- **Warnings**: Array of warning messages (if any)

### Implementation Details

- **Workflow Runner**: `createMergeWorkflowRunner()`
- **Implementation**: `workflows/merge/mergeWorkflow.ts`
- **CLI Command**: `merge-addenda`
- **GUI Wizard**: Update Documents (4-step wizard)

### Merge Modes

- **`replace+insert`** (default): Replace updated sheets and insert new sheets in correct sequence
- **`replace-only`**: Only replace existing sheets, don't insert new ones
- **`append-only`**: Append all addendum pages to end, don't replace

---

## Split Set

**Domain Meaning**: Split a construction document set into discipline-specific subsets. For drawings, split by discipline prefix (M, E, P, etc.). For specs, split by division or section.

**Status**: ⚠️ **Placeholder** (CLI command exists, workflow engine not implemented)

### Current Implementation

- **CLI Command**: `split-set` (uses legacy `splitSet()` API)
- **Workflow Engine**: Not implemented
- **GUI**: Not implemented

### Planned Inputs

- Input PDF path
- Output directory
- Document type (`drawings` or `specs`)
- Grouping method (`prefix`, `section`, `division`)
- Prefixes (for drawings)
- Custom regex pattern (optional)

### Planned Outputs

- Multiple PDF files (one per subset)
- Table of contents JSON (optional)

---

## Assemble Set

**Domain Meaning**: Reassemble multiple PDF subsets into a single ordered document set. Combines outputs from split-set or other sources into a final construction document set.

**Status**: ⚠️ **Placeholder** (CLI command exists, workflow engine not implemented)

### Current Implementation

- **CLI Command**: `assemble-set` (uses legacy `assembleSet()` API)
- **Workflow Engine**: Not implemented
- **GUI**: Not implemented

### Planned Inputs

- Input directory (containing PDF files)
- Output PDF path
- Document type (`drawings` or `specs`)
- Order JSON file (optional, specifies assembly order)

### Planned Outputs

- Single assembled PDF file

---

## Fix Bookmarks

**Domain Meaning**: Regenerate PDF bookmarks from detected sheet IDs and titles. Useful when bookmarks are missing or incorrect in source PDFs.

**Status**: ⚠️ **Placeholder** (workflow engine not implemented)

### Current Implementation

- **CLI Command**: Not implemented
- **Workflow Engine**: Not implemented
- **GUI**: Not implemented

### Planned Inputs

- Input PDF path
- Output PDF path
- Layout profile (for detection)
- Document type (`drawings` or `specs`)

### Planned Outputs

- PDF with regenerated bookmarks

---

## Workflow Comparison

| Workflow | Engine | CLI | GUI | Status |
|----------|--------|-----|-----|--------|
| Update Documents (merge) | ✅ | ✅ | ✅ | Fully implemented |
| Split Set | ❌ | ✅ | ❌ | CLI only (legacy API) |
| Assemble Set | ❌ | ✅ | ❌ | CLI only (legacy API) |
| Fix Bookmarks | ❌ | ❌ | ❌ | Not implemented |

---

## Adding New Workflows

See [ARCHITECTURE.md](ARCHITECTURE.md#extension-guide-adding-a-new-workflow) for a guide on adding new workflows without breaking invariants.
