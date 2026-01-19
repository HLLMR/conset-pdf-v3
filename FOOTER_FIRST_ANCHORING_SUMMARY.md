# Footer-First Section Anchoring Implementation Summary

## Overview

Implemented footer-first section anchoring for the `fix-bookmarks` workflow. This provides robust, deterministic section bookmark destination resolution by extracting section codes from footer text rather than relying on unreliable `pageIndexHint` values or cross-reference-prone heading matching.

## Files Changed

### Core Implementation

1. **`packages/core/src/text/pageRegions.ts`** (NEW)
   - Auto-detection of page regions (header, heading, body, footer) using text density analysis
   - Deterministic algorithm based on y-coordinate histograms
   - Returns normalized band ranges (0-1) with debug information

2. **`packages/core/src/text/tests/pageRegions.test.ts`** (NEW)
   - Unit tests for region detection with synthetic pages
   - Tests default regions, density-based detection, overlap prevention

3. **`packages/core/src/specs/footerSectionMap.ts`** (NEW)
   - Footer text normalization and section code parsing
   - Handles variants: "23 05 53", "23 05 53 - Title", "23 05 53—Title", etc.
   - Builds first-page index mapping section codes to their first occurrence

4. **`packages/core/src/specs/tests/footerSectionMap.test.ts`** (NEW)
   - Unit tests for text normalization, code parsing, footer extraction
   - Tests first-page mapping correctness

5. **`packages/core/src/specs/footerIndexBuilder.ts`** (NEW)
   - Fast sampling strategy: samples first N pages + evenly spaced for region detection
   - Full scan for footer index (all pages, but only processes footer items)
   - Integrates region detection with footer code extraction

6. **`packages/core/src/bookmarks/treeBuilder.ts`** (MODIFIED)
   - Added `footerSectionIndex` parameter to `buildTreeFromBookmarkAnchorTree`
   - Footer-first resolution: tries footer index, falls back to heading resolver, then `pageIndexHint`
   - Handles section code format mismatches (e.g., "01 23 07" in footer vs "23 07 00" in tree)
   - Improved numeric sorting: parses section IDs as 3-component tuples for correct ordering

7. **`packages/core/src/bookmarks/tests/footerAnchoring.test.ts`** (NEW)
   - Regression tests for footer-first anchoring
   - Tests section ordering, destination correctness, footer index mapping

8. **`packages/core/src/workflows/bookmarks/bookmarksWorkflow.ts`** (MODIFIED)
   - Integrated footer index building in execute phase (when `--rebuild` and `BookmarkAnchorTree` provided)
   - Defaults to `sectionStartStrategy: 'footer'` for specs documents
   - Adds footer index debug info to audit trail

9. **`packages/core/src/workflows/bookmarks/types.ts`** (MODIFIED)
   - Added `sectionStartStrategy?: 'footer' | 'heading' | 'hint'` to options

10. **`packages/core/src/bookmarks/sidecar/verify_outline_pages.py`** (MODIFIED)
    - Enhanced to include PDF path, file size, SHA-256 hash
    - Recursively walks full outline tree (not just root level)
    - Detects duplicate outline items using `objgen` and Python `id()`
    - Reports traversal count and warnings for duplicates

11. **`packages/core/src/bookmarks/sidecar/bookmark-writer.py`** (MODIFIED)
    - Fixed verification to recursively walk outline tree (not just `/Next` chain at root)
    - Properly counts all items including children

12. **`docs/WORKFLOWS.md`** (MODIFIED)
    - Documented footer-first anchoring as default for specs documents
    - Clarified page indexing (0-based internal, 1-based display)

13. **`docs/CLI.md`** (MODIFIED)
    - Documented footer-first section anchoring
    - Explained section start resolution strategies
    - Clarified page indexing conventions

## Key Algorithms

### 1. Region Detection (`detectPageRegions`)

**Algorithm:**
1. Build y-density histogram (100 bins, normalized 0-1)
2. Identify header band: top 0-12% with high density
3. Identify footer band: bottom 12% with high density
4. Refine boundaries based on density thresholds
5. Prevent header/footer overlap
6. Set heading band: top 0-30% (existing convention)
7. Set body band: middle region (header.max to footer.min)

**Deterministic:** No ML, pure density analysis with token pattern hints

### 2. Footer Section Code Parsing (`parseSectionCodes`)

**Pattern:** `\b(\d{2})\s+(\d{2})\s+(\d{2})\b`
- Matches: "23 05 53", "23  05  53", "23 05 53 - Title", "23 05 53—Title"
- Returns canonical form: "23 05 53" (single spaces)
- Handles normalization: collapse whitespace, normalize dashes

### 3. Footer Index Building (`buildFooterSectionIndexFast`)

**Strategy:**
1. **Pass 1 (Sampling):** Sample first 30 pages + evenly spaced pages for region detection
2. **Pass 2 (Full Scan):** Extract all pages, filter to footer band items, parse section codes
3. **Mapping:** For each unique code, record first occurrence (minimum page index)

**Performance:** Samples for regions (~60 pages), full scan for codes (all pages, but DocumentContext caches text extraction)

### 4. Section Destination Resolution (in `treeBuilder.ts`)

**Priority Order:**
1. **Footer-First:** Look up section code in `footerSectionIndex.firstPageBySection`
   - Tries exact match, then with "01 " prefix, then without prefix
2. **Heading-Based:** Fallback to layout-aware heading resolver (heading band only)
3. **Hint-Based:** Last resort uses `pageIndexHint` (clamped to valid range)

### 5. Numeric Sorting

**Section IDs:** Parsed as 3-component tuples `[division, section, subsection]`
- Example: "23 05 53" → [23, 5, 53]
- Comparison: component-by-component numeric comparison
- Ensures: 23 05 48 < 23 05 53 < 23 07 00 < 23 09 00

**Article Anchors:** Parsed as dotted numbers `[major, minor, ...]`
- Example: "1.10" → [1, 10] (not [1, 1, 0])
- Ensures: 1.2 < 1.3 < 1.10 (not lexicographic)

## How to Run Proof Loop

### Build
```bash
cd f:\Projects\conset-pdf-ws\conset-pdf
npm run build
```

### Generate Specs-Patch Inventory
```bash
node packages/cli/dist/cli.js specs-patch \
  --input "..\.reference\LHHS\Specifications\23_MECH_FULL.pdf" \
  --dry-run \
  --json-output "tests\fixtures\diagnostics\specs-patch-inventory.json" \
  --verbose
```

### Extract Bookmark Tree
```bash
node tests\fixtures\diagnostics\extractBookmarkTree.mjs
```

### Dump Page Regions (Debug)
```bash
node tests\fixtures\diagnostics\dumpRegions.mjs
```

### Assert Headings
```bash
node tests\fixtures\diagnostics\assertHeadings.mjs
```

### Rebuild Bookmarks with Footer-First Anchoring
```bash
node packages/cli/dist/cli.js fix-bookmarks \
  --input "..\.reference\LHHS\Specifications\23_MECH_FULL.pdf" \
  --output "tests\fixtures\diagnostics\23_MECH_FULL.bookmarked.footerfirst.pdf" \
  --bookmark-tree "tests\fixtures\diagnostics\specs-bookmark-tree.json" \
  --rebuild \
  --bookmark-profile "specs-v1" \
  --json-output "tests\fixtures\diagnostics\fix-bookmarks-tree-footerfirst.json" \
  --report "tests\fixtures\diagnostics\fix-bookmarks-audit-footerfirst.json" \
  --verbose
```

### Verify Outline
```bash
python packages/core/dist/bookmarks/sidecar/verify_outline_pages.py \
  "tests\fixtures\diagnostics\23_MECH_FULL.bookmarked.footerfirst.pdf" \
  > "tests\fixtures\diagnostics\verify-outline-pages-footerfirst.txt"
```

### Check Ordering and Destinations
```bash
node tests\fixtures\diagnostics\checkBookmarkOrder.mjs
```

## Test Results

### Footer Index Detection
- ✅ Detected 14 unique section codes in footers
- ✅ Regions: header=0.05-0.12, footer=0.88-0.97
- ✅ Section codes include: "01 23 00", "01 23 05", "01 23 07", "23 05 48", etc.

### Section Resolution
- ✅ Footer-first anchoring finds sections in footer text
- ✅ Handles format mismatches (footer has "01 23 07", tree has "23 07 00")
- ✅ Falls back gracefully when footer mapping unavailable

### Ordering
- ✅ Sections sorted numerically by section code
- ✅ Articles sorted numerically within sections

### Known Issues
- ⚠️ Some articles still have invalid destinations (from incorrect `pageIndexHint` values)
- ⚠️ Article heading resolution needs improvement (separate from footer anchoring)

## Acceptance Criteria Status

✅ **Section bookmarks in correct numeric order** - Implemented and tested  
✅ **Section destinations from footer mapping** - Implemented with fallback chain  
✅ **No cross-reference false matches** - Footer extraction avoids body text  
✅ **All tests pass** - Unit tests and regression tests passing  
✅ **Deterministic behavior** - No LLM calls, pure algorithmic logic  
✅ **Page indexing consistent** - 0-based internal, 1-based display documented  

## Next Steps (Future Work)

1. Improve article heading resolution to prevent invalid destinations
2. Add validation/clamping for `pageIndexHint` fallback values
3. Consider adding CLI flag for `sectionStartStrategy` (currently internal default)
4. Optimize footer extraction further (currently extracts all text, could filter earlier)
