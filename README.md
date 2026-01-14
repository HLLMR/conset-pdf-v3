# conset-pdf

A CLI + library for building "latest-and-greatest" construction document sets by **replacing** updated sheets/sections from addenda and **inserting** new sheets/sections in the correct order, producing a final assembled PDF.

## What Problems Does It Solve?

Construction documents are updated via addenda. You need to:
1. Replace updated sheets/sections from addenda
2. Insert new sheets/sections in the correct order
3. Maintain the original document structure
4. Handle duplicate IDs, missing IDs, and ambiguous matches

## Installation

```bash
npm install conset-pdf
```

Or install globally:

```bash
npm install -g conset-pdf
```

## Requirements

- Node.js 18 or higher
- Vector/text PDFs with embedded text (no OCR support in v1)

## Quickstart

**1. Preview detection on sample pages:**
```bash
conset-pdf detect \
  --input Set.pdf \
  --layout layout.json \
  --pages 1,5,20 \
  --output-preview preview.json
```

**2. Adjust layout profile** (if needed) based on preview results.

**3. Merge addenda with layout:**
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf Addendum2.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json \
  --regenerate-bookmarks \
  --verbose
```

For detailed usage instructions, see [docs/QUICK_START.md](docs/QUICK_START.md).

## Documentation

- **[Quick Start Guide](docs/QUICK_START.md)** - Happy-path usage (ROI-first workflow)
- **[Architecture](docs/ARCHITECTURE.md)** - Deep technical design + invariants
- **[Output Structure](docs/OUTPUT_STRUCTURE.md)** - Files/folders produced by commands
- **[Testing Plan](docs/TESTING_PLAN.md)** - How we verify correctness + invariants
- **[Legacy Code](docs/LEGACY.md)** - What legacy code exists, why, and boundaries

## Limitations (v1)

- **No OCR**: Only works with vector/text PDFs with embedded text
- **Bookmark visibility**: pdf-lib has limited bookmark support; bookmarks may not be visible in all PDF viewers
- **Multi-page sheets**: Each page is treated as its own sheet (multi-page detection is optional)
- **No content editing**: Only page replacement/insertion, no text replacement or redaction

## License

MIT
