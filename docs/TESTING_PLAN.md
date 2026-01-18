# Testing Plan

**Last verified**: 2026-01-17

## Overview

This document describes how we verify correctness and maintain architecture invariants in `conset-pdf`.

## Test Organization

**Current Structure**:
```
tests/
├── smoke/                    # Fast, CI-friendly invariant checks
│   ├── architecture-invariants.test.ts
│   └── core-behaviors.test.ts
├── narrative/                # Narrative processing tests
│   ├── normalize.test.ts
│   ├── parse-algorithmic.test.ts
│   └── text-extract.test.ts
├── workflows/                # Workflow engine tests
│   └── merge-narrative.test.ts
└── fixtures/                 # Test PDFs and data files
    └── narratives/
        └── Add3 Narrative.pdf
```

**Planned Structure** (not yet implemented):
- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - Integration tests for workflows
- `tests/e2e/` - End-to-end CLI tests

## Smoke Tests

**Purpose**: Fast, automated verification of architecture invariants

**Location**: `tests/smoke/`

### Architecture Invariant Tests

**File**: `tests/smoke/architecture-invariants.test.ts`

Verifies:
- Only `src/analyze/*` may call `getDocument()` (or `utils/pdf.ts` for legacy fallback)
- Only `src/analyze/*` may read PDF bytes via `fs.readFile()` (or `utils/pdf.ts` for legacy fallback)
- No path-based detection in active merge-addenda path
- Planner uses locator seam (not direct detection functions)

**Method**: Code search (no PDF parsing required)

### Core Behavior Tests

**File**: `tests/smoke/core-behaviors.test.ts`

Verifies:
- `DocumentContext` single-load instrumentation
- `PageContext` caching instrumentation
- Locators use `PageContext` (no direct PDF access)
- ROI locator with inline layout
- CompositeLocator fallback behavior
- SpecsSectionLocator uses PageContext

**Method**: Minimal synthetic PDFs + instrumentation checks

## Invariant Checks

**Script**: `scripts/verify-invariants.js`

**Command**: `npm run verify:invariants`

**Checks**:
1. `getDocument()` calls only in `src/analyze/*` or `utils/pdf.ts` (legacy)
2. `fs.readFile()` for PDFs only in `src/analyze/*` or `utils/pdf.ts` (legacy)
3. No path-based detection in active merge-addenda path
4. Planner uses locator seam correctly

**What Failures Mean**:
- **Violation found**: Architecture invariant has been broken. Fix the code to restore the invariant.
- **Script fails**: Check the output for specific file/line violations.

## Running Tests

```bash
# Run all tests
npm test

# Run smoke tests only (fast, CI-friendly)
npm run test:smoke

# Run full verification (build + smoke tests + invariant checks)
npm run verify

# Run invariant checks only
npm run verify:invariants
```

## Test Categories

### Smoke Tests (Implemented)

**Location**: `tests/smoke/`

**Status**: ✅ Implemented

**Coverage**:
- Architecture invariant verification
- Core behavior verification (DocumentContext, PageContext, locators)

### Narrative Tests (Implemented)

**Location**: `tests/narrative/`

**Status**: ✅ Implemented

**Coverage**:
- Text extraction from narrative PDFs
- Narrative parsing (algorithmic)
- Text normalization

### Workflow Tests (Implemented)

**Location**: `tests/workflows/`

**Status**: ✅ Implemented

**Coverage**:
- Merge workflow with narrative integration

### Unit Tests (Planned)

**Location**: `tests/unit/` (to be created)

**Status**: ⏳ Planned

**Planned Coverage**:
- Parser tests: ID parsing and normalization
- Layout tests: Profile loading and validation
- Locator tests: Detection strategies
- Analysis tests: Caching and context management

### Integration Tests (Planned)

**Location**: `tests/integration/` (to be created)

**Status**: ⏳ Planned

**Planned Coverage**:
- Merge-addenda: Replace, insert, multiple addenda
- Detect command: Preview functionality
- Split-set: Split operations
- Assemble-set: Reassembly operations

### End-to-End Tests (Planned)

**Location**: `tests/e2e/` (to be created)

**Status**: ⏳ Planned

**Planned Coverage**:
- CLI command validation
- Real-world scenarios
- Performance validation

## Architecture Invariants Verified

1. **Single-Load PDF Pipeline**: Only `src/analyze/*` loads PDFs or reads bytes
2. **PageContext Caching**: Expensive per-page operations run once per page
3. **Locator Seam**: Planner is decoupled from detection strategy
4. **No Path-Based Detection**: Active merge-addenda path uses DocumentContext/PageContext, not `(pdfPath, pageIndex)`

## Test Strategy

**Smoke Tests**:
- Use code search and instrumentation rather than full PDF parsing
- Fast execution (seconds, not minutes)
- CI-friendly (no large fixtures required)
- Fail meaningfully if invariants regress

**Core Behavior Tests**:
- Use minimal synthetic PDFs created with `pdf-lib`
- Verify caching and single-load behavior
- Test locator integration without full merge workflows

## Common Assertions

- Normalized IDs use dash format (`M1-01`, not `M1.01`)
- Confidence scores in valid range (0.0-1.0)
- Page order preserved correctly
- Inventory files generated correctly
- Reports contain expected data

## Coverage Goals

- **Smoke tests**: All architecture invariants verified
- **Unit tests**: 80%+ coverage of parser, layout, locator, analyze modules
- **Integration tests**: All major workflows covered
- **E2E tests**: All CLI commands validated

## Continuous Testing

### Pre-commit
- Run smoke tests
- Run fast integration tests

### Pre-release
- Run full test suite
- Run `npm run verify` (build + smoke tests + invariant checks)
- Validate against real-world PDFs

## Test Maintenance

### When to Update Tests
- New features added
- Bug fixes (add regression test)
- Architecture changes
- Performance optimizations

### Test Documentation
- Each test file should have header explaining what it tests
- Complex test scenarios should have inline comments
- Fixture files should have README explaining their purpose
