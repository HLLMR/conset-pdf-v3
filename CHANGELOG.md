# Changelog

All notable changes to conset-pdf will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-14

### Added
- Initial release of conset-pdf core library and CLI
- Core library package (`@conset-pdf/core`)
- CLI package (`@conset-pdf/cli`)
- ROI-based sheet detection with layout profiles
- Legacy title block detection as fallback
- Merge-addenda command for combining PDFs
- Split-set command for dividing PDFs into subsets
- Assemble-set command for combining split PDFs
- Detect command for previewing detection results
- Bookmark regeneration support
- Comprehensive test suite and architecture invariant checks

### Changed
- **Repository Structure**: Separated GUI into independent repository ([conset-pdf-gui](https://github.com/HLLMR/conset-pdf-gui))
- **Dependencies**: Updated pdfjs-dist from 3.11.174 to 5.4.530 for security and Node.js compatibility
- **Node.js Compatibility**: Updated to use pdfjs-dist legacy build for Node.js environments

### Security
- Updated pdfjs-dist to 5.4.530 (fixes high severity vulnerability: arbitrary JavaScript execution)

### Technical
- Monorepo structure with npm workspaces
- TypeScript for type safety
- Architecture invariants enforced via automated checks
- Single-load PDF processing pipeline
- PageContext caching for performance
- Pluggable locator system for detection strategies

## [Unreleased]

### Planned
- Enhanced error handling and reporting
- Performance optimizations for large PDFs
- Additional locator strategies
- Improved bookmark support
- Multi-page sheet detection
