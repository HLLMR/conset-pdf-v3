# Output Structure

This document describes the exact output files and folders produced by `conset-pdf` commands.

## Recommended Structure

```
project-root/
├── layouts/                    # Layout profiles (shared across projects)
│   ├── layout-template.json
│   └── project-xyz-layout.json
│
├── conset-output/              # All conset-pdf output files
│   ├── inventories/            # Master inventory index files
│   │   ├── original-inventory.json
│   │   ├── addendum1-inventory.json
│   │   └── addendum2-inventory.json
│   │
│   ├── previews/              # Detect command preview outputs
│   │   ├── original-preview.json
│   │   └── layout-test-preview.json
│   │
│   ├── reports/               # Merge operation reports
│   │   ├── merge-2025-01-15-report.json
│   │   └── merge-add4-report.json
│   │
│   └── merged/                # Final merged PDFs
│       ├── IFC+Add4.pdf
│       └── Final-Set.pdf
│
└── source-pdfs/               # Your source PDFs (optional organization)
    ├── original/
    │   └── IFC Set_FULL_2025-10-01.pdf
    └── addenda/
        └── Add4 Set_FULL_2025-10-20.pdf
```

## File Naming Conventions

### Inventory Files
- Pattern: `{source-filename}-inventory.json`
- Location: `conset-output/inventories/` (or next to source PDF)
- Contains: Detected sheet IDs, titles, confidence scores, parse times

### Preview Files
- Pattern: `{description}-preview.json`
- Location: `conset-output/previews/`
- Contains: Detection results from `detect` command

### Report Files
- Pattern: `merge-{description}-report.json` or `merge-{date}-report.json`
- Location: `conset-output/reports/`
- Contains: Merge operation summary, replacements, insertions

### Merged PDFs
- Pattern: User-defined (e.g., `IFC+Add4.pdf`, `Final-Set.pdf`)
- Location: `conset-output/merged/` (or user-specified)
- Contains: Final assembled PDF

## Usage Examples

### Using Organized Output Structure

```bash
# Create output directories (one-time setup)
mkdir -p conset-output/{inventories,previews,reports,merged}

# Test detection with preview output
conset-pdf detect \
  --input source-pdfs/original/IFC\ Set_FULL_2025-10-01.pdf \
  --layout layouts/project-layout.json \
  --pages 1,5,10,20 \
  --output-preview conset-output/previews/original-preview.json

# Run merge with organized outputs
conset-pdf merge-addenda \
  --original source-pdfs/original/IFC\ Set_FULL_2025-10-01.pdf \
  --addenda source-pdfs/addenda/Add4\ Set_FULL_2025-10-20.pdf \
  --output conset-output/merged/IFC+Add4.pdf \
  --type drawings \
  --layout layouts/project-layout.json \
  --report conset-output/reports/merge-add4-report.json \
  --verbose
```

### Inventory Files

Inventory files are automatically generated for each input PDF during merge operations. They contain:

- **Source file path**
- **Document type** (drawings/specs)
- **Total pages**
- **Parse statistics** (time, success rate)
- **Per-page inventory**:
  - Sheet ID (raw and normalized)
  - Title
  - Confidence score
  - Detection method/source
  - Warnings

**Example inventory file:**
```json
{
  "sourceFile": "IFC Set_FULL_2025-10-01.pdf",
  "type": "drawings",
  "totalPages": 120,
  "parseTimeMs": 1250,
  "pagesWithIds": 119,
  "pagesWithoutIds": 1,
  "warnings": 2,
  "inventory": [
    {
      "pageIndex": 0,
      "sheetId": null,
      "normalizedId": null,
      "title": null,
      "confidence": null,
      "source": null
    },
    {
      "pageIndex": 1,
      "sheetId": "M1-01",
      "normalizedId": "M1-01",
      "title": "Floor Plan - First Floor",
      "confidence": 0.95,
      "source": "ROI-1"
    }
  ],
  "performance": {
    "totalParseTimeMs": 1250,
    "averageTimePerPageMs": 10.4,
    "slowestPages": [...]
  }
}
```

## Benefits of Organized Structure

1. **Separation of concerns**: Outputs don't clutter source directories
2. **Easy cleanup**: Delete `conset-output/` to remove all generated files
3. **Version control**: Can gitignore `conset-output/` while keeping layouts
4. **Multi-project**: Each project can have its own `conset-output/` directory
5. **Master index**: All inventories in one place for analysis

## Git Integration

Recommended `.gitignore` entries:

```
# conset-pdf outputs
conset-output/
*.inventory.json
*-preview.json
*-report.json
```

Keep in version control:
- `layouts/` directory (layout profiles)
- Source PDFs (if desired)
- Configuration files

## Alternative: Next to Source Files

If you prefer outputs next to source files:

```bash
# Inventory files written next to PDFs
source-pdfs/
├── original/
│   ├── IFC Set_FULL_2025-10-01.pdf
│   └── IFC Set_FULL_2025-10-01-inventory.json  # Auto-generated
```

This is the default behavior. Use `--output-dir` (future feature) to organize outputs.
