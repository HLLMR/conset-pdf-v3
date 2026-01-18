# CLI Documentation

**Last verified**: 2026-01-17

This document describes all CLI commands available in `@conset-pdf/cli`.

## Overview

The CLI routes through the same workflow engine as the GUI for consistency. All merge operations use `createMergeWorkflowRunner()` internally.

## Installation

```bash
npm install -g @conset-pdf/cli
```

Or use via npx:
```bash
npx @conset-pdf/cli <command>
```

## Commands

### merge-addenda

Merge an original PDF with one or more addendum PDFs. Replaces updated sheets and inserts new sheets.

**Purpose**: Update construction document sets by merging addenda in chronological order.

**Usage**:
```bash
conset-pdf merge-addenda \
  --original <path> \
  --addenda <paths...> \
  --output <path> \
  --type <type> \
  [options]
```

**Required Arguments**:
- `--original <path>`: Path to original PDF
- `--addenda <paths...>`: Paths to addendum PDFs (one or more, in chronological order)
- `--output <path>`: Path to output PDF (required but not used in `--dry-run` mode)
- `--type <type>`: Document type (`drawings` or `specs`)
  - **`drawings`**: Uses ROI-based detection with layout profiles (or legacy fallback)
  - **`specs`**: Uses text-based section ID detection (layout profiles not supported/ignored)

**Options**:
- `--report <path>`: Path to write JSON report
- `--mode <mode>`: Merge mode (`replace+insert`, `replace-only`, or `append-only`). Default: `replace+insert`
- `--strict`: Fail on pages without IDs (default: false)
- `--dry-run`: Plan merge without writing output PDF (outputs inventory JSON)
- `--json-output <path>`: Path to write dry-run inventory JSON (default: stdout if `--dry-run`)
- `--verbose`: Verbose output (default: false)
- `--bookmark`: Regenerate bookmarks from detected sheet numbers and titles (default: false)
- `--layout <path>`: Path to layout profile JSON
- `--sheet-id-roi <roi>`: Sheet ID ROI: `"x,y,width,height"` (normalized 0-1)
- `--sheet-title-roi <roi>`: Sheet title ROI: `"x,y,width,height"` (normalized 0-1)
- `--auto-layout`: Auto-detect layout and suggest profile (default: false)
- `--save-layout <path>`: Save auto-detected layout to file
- `--inventory-dir <path>`: Directory for inventory JSON files (default: next to source PDFs)
- `--narrative <path>`: Path to narrative PDF for advisory analysis (optional)

**Input Format**: PDF files (original + addenda)

**Output Format**:
- **Normal mode**: Output PDF file
- **Dry-run mode**: JSON inventory file (or stdout)

**Dry-Run Inventory JSON Shape**:
```json
{
  "workflowId": "merge",
  "rows": [
    {
      "id": "original-pdf:0:A-101",
      "page": 1,
      "status": "ok",
      "confidence": 0.95,
      "source": "roi",
      "normalizedId": "A-101",
      "notes": null,
      "tags": ["roi"]
    }
  ],
  "issues": [
    {
      "id": "issue-0",
      "severity": "warning",
      "code": "NO_ID",
      "message": "No sheet ID found on page 5",
      "rowIds": ["original-pdf:4:"]
    }
  ],
  "conflicts": [],
  "summary": {
    "totalRows": 50,
    "rowsWithIds": 48,
    "rowsWithoutIds": 2,
    "rowsOk": 48,
    "rowsWarning": 2,
    "rowsError": 0,
    "rowsConflict": 0,
    "issuesCount": 2,
    "conflictsCount": 0,
    "replaced": 10,
    "inserted": 5,
    "unmatched": 2
  },
  "meta": {
    "docType": "drawings",
    "originalPdfPath": "Original.pdf",
    "addendumPdfPaths": ["Addendum1.pdf"],
    "mode": "replace+insert",
    "strict": false
  }
}
```

**Examples**:

Basic merge (drawings):
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf Addendum2.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json
```

Basic merge (specs):
```bash
conset-pdf merge-addenda \
  --original Original-Specs.pdf \
  --addenda Addendum1-Specs.pdf \
  --output Final-Specs.pdf \
  --type specs
```

**Note**: Specs merging uses text-based section ID detection and does not require (or support) layout profiles. The `--layout` option is ignored for specs type.

Dry-run inventory analysis:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --type drawings \
  --dry-run \
  --json-output inventory.json
```

With inline ROI:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --output Final.pdf \
  --type drawings \
  --sheet-id-roi "0.1,0.05,0.3,0.05" \
  --sheet-title-roi "0.1,0.1,0.6,0.05"
```

With narrative PDF (advisory):
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json \
  --narrative Narrative.pdf
```

**Exit Codes**:
- `0`: Success
- `2`: Invalid arguments or validation error
- `3`: Strict mode violation (unmatched pages)
- `4`: File I/O error (file not found, permission denied)

---

### detect

Preview sheet ID/title extraction using layout profile. Tests detection on specified pages.

**Purpose**: Test layout profile configuration and verify sheet ID detection accuracy.

**Usage**:
```bash
conset-pdf detect \
  --input <path> \
  [options]
```

**Required Arguments**:
- `--input <path>`: Path to input PDF

**Options**:
- `--layout <path>`: Path to layout profile JSON
- `--sheet-id-roi <roi>`: Sheet ID ROI: `"x,y,width,height"` (normalized 0-1)
- `--sheet-title-roi <roi>`: Sheet title ROI: `"x,y,width,height"` (normalized 0-1)
- `--pages <pages>`: Comma-separated page numbers (1-based). Default: `1,5,10`
- `--type <type>`: Document type (`drawings` or `specs`). Default: `drawings`
- `--output-preview <path>`: Path to write preview JSON
- `--preview-dir <path>`: Directory for preview JSON (auto-generates filename)
- `--verbose`: Verbose output (default: false)

**Input Format**: PDF file

**Output Format**: JSON preview file (or console summary)

**Preview JSON Shape**:
```json
{
  "profile": "layout.json",
  "locator": "RoiSheetLocator",
  "pages": [
    {
      "pageIndex": 0,
      "pageNumber": 1,
      "sheetId": {
        "found": true,
        "value": "A-101",
        "normalized": "A-101",
        "confidence": 0.95,
        "method": "roi"
      },
      "sheetTitle": {
        "found": true,
        "value": "Floor Plan - First Floor"
      },
      "warnings": [],
      "context": "Additional context from detection"
    },
    {
      "pageIndex": 1,
      "pageNumber": 2,
      "sheetId": {
        "found": false,
        "error": "No sheet ID found",
        "failureReason": "ROI_EMPTY",
        "method": "roi"
      },
      "sheetTitle": {
        "found": false,
        "error": "No title found"
      },
      "warnings": ["ROI region is empty"]
    }
  ],
  "summary": {
    "totalPages": 2,
    "pagesWithId": 1,
    "pagesWithTitle": 1,
    "successRate": 0.5
  }
}
```

**Failure Reasons** (when `sheetId.found: false`):
- `ROI_EMPTY`: ROI region contains no text
- `ROI_LOW_TEXT_DENSITY`: ROI region has insufficient text
- `ROI_NO_PATTERN_MATCH`: No pattern match found in ROI
- `ROI_PREFIX_REJECTED`: Prefix validation failed
- `ROI_MULTIPLE_MATCHES`: Multiple matches found (ambiguous)
- `ROI_FAILED`: General ROI detection failure
- `LEGACY_FALLBACK`: Fell back to legacy detection
- `NO_MATCH`: No match found (no warnings)

**Examples**:

Test layout profile:
```bash
conset-pdf detect \
  --input Set.pdf \
  --layout layout.json \
  --pages 1,5,20 \
  --output-preview preview.json
```

Test with inline ROI:
```bash
conset-pdf detect \
  --input Set.pdf \
  --sheet-id-roi "0.1,0.05,0.3,0.05" \
  --pages 1,5,10 \
  --verbose
```

**Exit Codes**:
- `0`: Success
- `2`: Invalid arguments or validation error
- `4`: File I/O error

---

### split-set

Split a PDF set into discipline-specific subsets.

**Purpose**: Divide a construction document set into separate PDFs by discipline (e.g., M, E, P for mechanical, electrical, plumbing).

**Usage**:
```bash
conset-pdf split-set \
  --input <path> \
  --output-dir <path> \
  --type <type> \
  [options]
```

**Required Arguments**:
- `--input <path>`: Path to input PDF
- `--output-dir <path>`: Path to output directory
- `--type <type>`: Document type (`drawings` or `specs`)

**Options**:
- `--group-by <method>`: Grouping method (`prefix`, `section`, or `division`)
- `--prefixes <prefixes...>`: Allowed prefixes for drawings (e.g., `M E P`)
- `--toc-json <path>`: Path to write table of contents JSON
- `--pattern <regex>`: Custom regex pattern for ID detection
- `--verbose`: Verbose output (default: false)

**Input Format**: PDF file

**Output Format**: Multiple PDF files in output directory, one per subset

**Examples**:

Split by prefix:
```bash
conset-pdf split-set \
  --input Set.pdf \
  --output-dir ./output \
  --type drawings \
  --group-by prefix \
  --prefixes M E P
```

Split specs by division:
```bash
conset-pdf split-set \
  --input Specs.pdf \
  --output-dir ./output \
  --type specs \
  --group-by division \
  --toc-json toc.json
```

**Exit Codes**:
- `0`: Success
- `2`: Invalid arguments or validation error
- `4`: File I/O error

**Note**: This command uses the legacy `splitSet()` API. Workflow engine implementation is not yet available.

---

### assemble-set

Reassemble subsets into a final ordered set.

**Purpose**: Combine multiple PDF subsets (from split-set or other sources) into a single ordered document set.

**Usage**:
```bash
conset-pdf assemble-set \
  --input-dir <path> \
  --output <path> \
  --type <type> \
  [options]
```

**Required Arguments**:
- `--input-dir <path>`: Path to input directory containing PDFs
- `--output <path>`: Path to output PDF
- `--type <type>`: Document type (`drawings` or `specs`)

**Options**:
- `--order-json <path>`: Path to JSON file specifying assembly order
- `--verbose`: Verbose output (default: false)

**Input Format**: Directory containing PDF files

**Output Format**: Single assembled PDF file

**Examples**:

Assemble from directory:
```bash
conset-pdf assemble-set \
  --input-dir ./subsets \
  --output Final.pdf \
  --type drawings
```

With custom order:
```bash
conset-pdf assemble-set \
  --input-dir ./subsets \
  --output Final.pdf \
  --type drawings \
  --order-json order.json
```

**Exit Codes**:
- `0`: Success
- `2`: Invalid arguments or validation error
- `4`: File I/O error

**Note**: This command uses the legacy `assembleSet()` API. Workflow engine implementation is not yet available.

---

## Common Patterns

### Using Layout Profiles

Layout profiles define ROI regions for sheet ID and title detection. Create a profile JSON:

```json
{
  "name": "Standard Title Block",
  "version": "1.0",
  "sheetId": {
    "rois": [
      {
        "x": 0.1,
        "y": 0.05,
        "width": 0.3,
        "height": 0.05
      }
    ]
  },
  "sheetTitle": {
    "rois": [
      {
        "x": 0.1,
        "y": 0.1,
        "width": 0.6,
        "height": 0.05
      }
    ]
  }
}
```

Use with `--layout` option:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json
```

### Dry-Run Workflow

1. Run dry-run to analyze inventory:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --type drawings \
  --dry-run \
  --json-output inventory.json
```

2. Review `inventory.json` for issues and conflicts

3. Run actual merge:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json
```

### Testing Detection

Before merging, test detection accuracy:
```bash
conset-pdf detect \
  --input Original.pdf \
  --layout layout.json \
  --pages 1,5,10,15,20 \
  --output-preview preview.json
```

Review `preview.json` to verify sheet IDs are detected correctly.

---

## Integration with Workflow Engine

The CLI routes through the same workflow engine as the GUI:

- **`merge-addenda`** (with `--dry-run`): Uses `runner.analyze()`
- **`merge-addenda`** (normal): Uses `runner.execute()`
- Other commands: Use legacy APIs directly (workflow engine not yet implemented)

This ensures consistency between CLI and GUI behavior.
