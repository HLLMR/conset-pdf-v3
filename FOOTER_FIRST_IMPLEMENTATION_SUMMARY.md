# Footer-First Section Anchoring Implementation Summary

## Overview

Implemented deterministic footer-first section anchoring for the `fix-bookmarks` workflow. This provides robust, reliable section bookmark destination resolution by extracting section codes from footer text rather than relying on unreliable `pageIndexHint` values or cross-reference-prone heading matching.

## Files Changed

### New Files

1. **`packages/core/src/text/bandSlicer.ts`**
   - ROI band utility for slicing text items into header/heading/body/footer bands
   - Standard bands: header (0-12%), heading (0-30%), body (12-88%), footer (88-100%)
   - `sliceBand()`: Filters items by normalized Y coordinates
   - `extractFooterText()`: Groups footer items into lines, normalizes whitespace
   - `getAllBands()`: Returns all bands for a page

2. **`packages/core/src/text/tests/bandSlicer.test.ts`**
   - Unit tests for band slicing with synthetic fixtures
   - Tests header, footer, body filtering
   - Tests footer text extraction and normalization

3. **`packages/core/src/bookmarks/tests/footerFirstRegression.test.ts`**
   - Real regression tests using `23_MECH_FULL.pdf` fixture
   - Tests section ordering, destination correctness, hierarchy, junk title rejection

### Modified Files

1. **`packages/core/src/specs/footerSectionMap.ts`**
   - Updated to use `bandSlicer` utilities (`sliceBand`, `extractFooterText`)
   - Simplified `extractFooterTextItems()` to use standard bands

2. **`packages/core/src/bookmarks/treeBuilder.ts`**
   - **Section Resolution**: Footer-first → heading → hint fallback chain
   - **Section Page Ranges**: Computed from sorted section start pages (not from `determineSectionBoundaries`)
   - **Article Hierarchy**: Articles assigned to sections by page range boundaries
   - **Junk Title Rejection**: Articles must have title starting with `${anchor} ` or are skipped
   - **Invalid Destination Handling**: Sections with invalid destinations marked as error, not silently guessed
   - **Numeric Sorting**: Improved section ID parsing (3-component tuple: [division, section, subsection])

3. **`packages/core/src/workflows/bookmarks/bookmarksWorkflow.ts`**
   - Integrated footer index building in execute phase
   - Added validation gate: fails on invalid section destinations unless `--allow-invalid-destinations`
   - Enhanced audit trail with footer index debug info and strategy

4. **`packages/core/src/workflows/bookmarks/types.ts`**
   - Added `sectionStartStrategy?: 'footer' | 'heading' | 'hint'` to options
   - Added `allowInvalidDestinations?: boolean` to execute options

5. **`packages/cli/src/commands/fixBookmarks.ts`**
   - Added `--section-start-strategy <strategy>` CLI flag
   - Added `--allow-invalid-destinations` CLI flag
   - Parses strategy and passes to workflow

6. **`docs/CLI.md`**
   - Documented `--section-start-strategy` flag
   - Documented `--allow-invalid-destinations` flag
   - Updated section start resolution documentation

7. **`docs/WORKFLOWS.md`**
   - Updated footer-first anchoring documentation

## Key Algorithms

### 1. ROI Band Slicing (`bandSlicer.ts`)

**Standard Bands:**
- Header: 0.00-0.12 (top 12%)
- Heading: 0.00-0.30 (top 30%)
- Body: 0.12-0.88 (middle 76%)
- Footer: 0.88-1.00 (bottom 12%)

**Implementation:**
- Filters `TextItemWithPosition` items by center Y coordinate
- Normalizes Y to page height (0 = top, 1 = bottom)
- Groups footer items into lines by Y proximity
- Joins lines with normalized whitespace

### 2. Footer Section Code Extraction (`footerSectionMap.ts`)

**Pattern:** `\b(\d{2})\s+(\d{2})\s+(\d{2})\b`
- Matches: "23 05 53", "01 23 31", "23 05 53 - Title", etc.
- Returns canonical form: "23 05 53" (single spaces)
- Handles format variations: double spaces, dashes, division prefixes

### 3. Footer Index Building (`footerIndexBuilder.ts`)

**Strategy:**
1. **Pass 1 (Sampling):** Sample first 30 pages + evenly spaced pages for region detection
2. **Pass 2 (Full Scan):** Extract all pages, filter to footer band, parse section codes
3. **Mapping:** For each unique code, record first occurrence (minimum page index)

**Performance:** Samples for regions (~60 pages), full scan for codes (all pages, but DocumentContext caches text extraction)

### 4. Section Destination Resolution (in `treeBuilder.ts`)

**Priority Order:**
1. **Footer-First:** Look up section code in `footerSectionIndex.firstPageBySection`
   - Tries exact match, then with "01 " prefix, then without prefix
2. **Heading-Based:** Fallback to layout-aware heading resolver (heading band only)
3. **Hint-Based:** Last resort uses `pageIndexHint` (clamped to valid range)
4. **Invalid:** If all fail, mark as invalid (don't silently guess)

### 5. Section Page Range Computation

**Algorithm:**
1. Sort sections by resolved page indices (invalid sections excluded)
2. For each section i:
   - `startPage = resolvedPageIndex[i]`
   - `endPage = resolvedPageIndex[i+1] - 1` (or `pageCount - 1` for last section)
3. Articles assigned to section if `article.pageIndex` within `[startPage, endPage]`

### 6. Junk Title Rejection

**Rule:** Article title MUST start with `${anchor} ` (anchor + space)
- Example: Anchor "1.3" requires title starting with "1.3 "
- Rejects: "required in the other Sections..." (body text fragment)
- Rejects: "1.7" (measurement, not heading)

### 7. Numeric Sorting

**Section IDs:** Parsed as 3-component tuples `[division, section, subsection]`
- Example: "23 05 53" → [23, 5, 53]
- Comparison: component-by-component numeric comparison
- Ensures: 23 05 48 < 23 05 53 < 23 07 00 < 23 09 00

**Article Anchors:** Parsed as dotted numbers `[major, minor, ...]`
- Example: "1.10" → [1, 10] (not [1, 1, 0])
- Ensures: 1.2 < 1.3 < 1.10 (not lexicographic)

## CLI Usage

### Basic Usage (Footer-First, Default)

```bash
node packages/cli/dist/cli.js fix-bookmarks \
  --input "..\.reference\LHHS\Specifications\23_MECH_FULL.pdf" \
  --output "output.pdf" \
  --bookmark-tree "specs-bookmark-tree.json" \
  --rebuild \
  --bookmark-profile "specs-v1" \
  --json-output "fix-bookmarks-tree.json" \
  --report "fix-bookmarks-audit.json" \
  --verbose
```

### Override Strategy

```bash
# Use heading-only resolver
node packages/cli/dist/cli.js fix-bookmarks \
  --input "input.pdf" \
  --output "output.pdf" \
  --bookmark-tree "tree.json" \
  --rebuild \
  --section-start-strategy "heading-only"

# Use hint-only (least reliable)
node packages/cli/dist/cli.js fix-bookmarks \
  --input "input.pdf" \
  --output "output.pdf" \
  --bookmark-tree "tree.json" \
  --rebuild \
  --section-start-strategy "hint-only"
```

### Allow Invalid Destinations (Override Validation Gate)

```bash
node packages/cli/dist/cli.js fix-bookmarks \
  --input "input.pdf" \
  --output "output.pdf" \
  --bookmark-tree "tree.json" \
  --rebuild \
  --allow-invalid-destinations
```

## End-to-End Proof Loop Commands

### Step 1: Build
```bash
cd f:\Projects\conset-pdf-ws\conset-pdf
npm run build
```

### Step 2: Generate Specs-Patch Inventory
```bash
node packages/cli/dist/cli.js specs-patch \
  --input "..\.reference\LHHS\Specifications\23_MECH_FULL.pdf" \
  --dry-run \
  --json-output "tests\fixtures\diagnostics\specs-patch-inventory.json" \
  --verbose
```

### Step 3: Extract Bookmark Tree
```bash
node tests\fixtures\diagnostics\extractBookmarkTree.mjs
```

### Step 4: Rebuild Bookmarks with Footer-First Anchoring
```bash
node packages/cli/dist/cli.js fix-bookmarks \
  --input "..\.reference\LHHS\Specifications\23_MECH_FULL.pdf" \
  --output "tests\fixtures\diagnostics\23_MECH_FULL.bookmarked.footerfirst.pdf" \
  --bookmark-tree "tests\fixtures\diagnostics\specs-bookmark-tree.json" \
  --rebuild \
  --bookmark-profile "specs-v1" \
  --section-start-strategy "footer-first" \
  --json-output "tests\fixtures\diagnostics\fix-bookmarks-tree-footerfirst.json" \
  --report "tests\fixtures\diagnostics\fix-bookmarks-audit-footerfirst.json" \
  --verbose
```

### Step 5: Verify Outline
```bash
python packages/core/dist/bookmarks/sidecar/verify_outline_pages.py \
  "tests\fixtures\diagnostics\23_MECH_FULL.bookmarked.footerfirst.pdf" \
  > "tests\fixtures\diagnostics\verify-outline-pages-footerfirst.txt"
```

### Step 6: Check Ordering and Destinations
```bash
node tests\fixtures\diagnostics\checkBookmarkOrder.mjs
```

## Test Results

### Unit Tests
- ✅ `bandSlicer.test.ts`: 6 tests passed
- ✅ `pageRegions.test.ts`: 4 tests passed
- ✅ `footerSectionMap.test.ts`: 13 tests passed

### Regression Tests
- ✅ `footerFirstRegression.test.ts`: 5 tests passed
  - Section ordering correctness
  - Section destination correctness (footer-first)
  - Hierarchy correctness (articles nested under correct section)
  - Zero junk titles (article titles must start with anchor)
  - Specific sections resolve correctly (23 02 00, 23 07 00)

## Acceptance Criteria Status

✅ **Deterministic section start page resolver using footer-only extraction** - Implemented  
✅ **Layout band system (ROI bands)** - Implemented (`bandSlicer.ts`)  
✅ **TreeBuilder rebuilt** - Implemented:
  - ✅ Section destinations from footer-first map
  - ✅ Numeric sorting by section tuple
  - ✅ Hierarchy: articles assigned to sections by page ranges
  - ✅ Junk title rejection  
✅ **CLI flags + docs** - Implemented:
  - ✅ `--section-start-strategy` flag
  - ✅ `--allow-invalid-destinations` flag
  - ✅ Documentation updated  
✅ **Regression tests** - Implemented:
  - ✅ Section ordering correctness
  - ✅ Section destination correctness
  - ✅ Hierarchy correctness
  - ✅ Zero junk titles  
✅ **Validation gates** - Implemented:
  - ✅ Fails on invalid section destinations unless override flag
  - ✅ Enhanced verifier with PDF metadata and duplicate detection  
✅ **Python scripts copied to dist** - Already working (verified in `dist/bookmarks/sidecar/`)

## Key Improvements

1. **Footer-First Anchoring**: Most reliable method for specs documents with repeating footer lines
2. **Layout-Aware Extraction**: Uses ROI bands to avoid cross-reference false matches
3. **Deterministic Sorting**: Numeric tuple comparison ensures correct section order
4. **Robust Hierarchy**: Articles assigned to sections by computed page ranges
5. **Junk Title Rejection**: Prevents body text fragments from becoming bookmarks
6. **Validation Gates**: Fails fast on invalid destinations unless explicitly overridden
7. **Comprehensive Audit Trail**: Includes footer index, strategy, resolution methods

## Known Limitations

- Some articles may still have invalid destinations if `pageIndexHint` is incorrect and heading resolver fails
- Footer index requires section codes to appear in footer text (may not work for all PDF formats)
- Article heading resolution within section ranges could be improved further

## Next Steps (Future Work)

1. Improve article heading resolution to prevent invalid destinations
2. Add validation/clamping for `pageIndexHint` fallback values
3. Consider adding section code format normalization (handle more variants)
4. Optimize footer extraction further (currently extracts all text, could filter earlier)
