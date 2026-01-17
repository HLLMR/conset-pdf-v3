# conset-pdf

Core library and CLI for building "latest-and-greatest" construction document sets. Provides APIs for merging addenda, splitting sets, detecting sheet IDs, and assembling documents.

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

**Layout System**:
- Layout profiles with ROI definitions
- Profile loading and validation

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

## Examples

### CLI Usage

**Merge addenda**:
```bash
conset-pdf merge-addenda \
  --original Original.pdf \
  --addenda Addendum1.pdf Addendum2.pdf \
  --output Final.pdf \
  --type drawings \
  --layout layout.json
```

**Detect sheet IDs**:
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
│   │       └── utils/        # Utilities
│   └── cli/           # CLI tool (@conset-pdf/cli)
└── docs/              # Documentation
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - Module overview, invariants, data flow
- **[Public API](docs/PUBLIC_API.md)** - Stable API contracts
- **[Quick Start](docs/QUICK_START.md)** - Happy-path usage

## Related Projects

- **[conset-pdf-gui](https://github.com/HLLMR/conset-pdf-gui)** - Electron GUI (uses `@conset-pdf/core`)

## License

MIT
