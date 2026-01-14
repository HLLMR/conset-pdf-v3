# conset-pdf

A CLI and library for building "latest-and-greatest" construction document sets by **replacing** updated sheets/sections from addenda and **inserting** new sheets/sections in the correct order, producing a final assembled PDF.

This repository contains the **core library** (`@conset-pdf/core`) and **CLI** (`@conset-pdf/cli`) packages. For the graphical user interface, see the separate [conset-pdf-gui](https://github.com/HLLMR/conset-pdf-gui) repository.

## What Problems Does It Solve?

Construction documents are updated via addenda. You need to:
1. Replace updated sheets/sections from addenda
2. Insert new sheets/sections in the correct order
3. Maintain the original document structure
4. Handle duplicate IDs, missing IDs, and ambiguous matches

## Installation

### Core Library

```bash
npm install @conset-pdf/core
```

### CLI Tool

```bash
npm install -g @conset-pdf/cli
```

Or install locally:

```bash
npm install @conset-pdf/cli
```

### Development Setup

This repository uses npm workspaces. To set up for development:

```bash
git clone https://github.com/HLLMR/conset-pdf.git
cd conset-pdf
npm install
npm run build
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

## Project Structure

This repository is organized as a monorepo with the following packages:

- **`packages/core`** - Core library (`@conset-pdf/core`)
  - PDF processing, detection, merging logic
  - Can be used as a library in other projects
  - Exports: `mergeAddenda`, `splitSet`, `assembleSet`, locators, layout system

- **`packages/cli`** - Command-line interface (`@conset-pdf/cli`)
  - CLI commands: `merge-addenda`, `detect`, `split-set`, `assemble-set`
  - Depends on `@conset-pdf/core`

The root `src/` directory contains shared source code used by tests and legacy compatibility.

## Related Projects

- **[conset-pdf-gui](https://github.com/HLLMR/conset-pdf-gui)** - Electron-based graphical user interface
  - Provides a wizard-style UI for PDF merge operations
  - Uses `@conset-pdf/core` as a dependency
  - Separate repository for GUI-specific code

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

## Dependencies

- **pdfjs-dist** (^5.4.530) - PDF text extraction and rendering
  - Uses legacy build for Node.js compatibility
  - See [pdfjs-dist documentation](https://github.com/mozilla/pdf.js) for details

- **pdf-lib** (^1.17.1) - PDF manipulation and assembly

## Development

### Building

```bash
# Build both packages
npm run build

# Build core only
npm run build:core

# Build CLI only
npm run build:cli
```

### Testing

```bash
# Run all tests
npm test

# Run smoke tests
npm run test:smoke

# Verify architecture invariants
npm run verify:invariants
```

### Verification

```bash
# Full verification (build + test + invariants)
npm run verify
```

## License

MIT
