# Prototype Post-Mortem Library

This directory is the execution workspace for the prototype extraction plan in `docs/postMortemDocExtraction.md`.

## Purpose

Capture architecture, workflow, algorithmic, and operational lessons from the v3 prototype repos and translate them into implementable guidance for V4 Rust development.

## Execution Order

1. Phase 1 - Inventory
2. Phase 2 - Algorithmic IP
3. Phase 3 - ADRs
4. Phase 4 - Contracts
5. Phase 5 - Gaps and limitations
6. Phase 6 - Lessons and write-up
7. Phase 7 - Rust handoff
8. Phase 8 - Verification
9. Phase 9 - Ops and documentation drift

## Required Admin Files

- `00-admin/phase-manifest.md`
- `00-admin/open-questions-and-risks.md`
- `00-admin/source-of-truth.md`

## Required Folder Layout

- `00-admin/`
- `01-inventory/`
- `02-algorithms/`
- `03-adrs/`
- `04-contracts/`
- `05-gaps-and-limitations/`
- `06-lessons/`
- `07-rust-handoff/`
- `08-verification/`
- `09-ops-and-drift/`

## Naming Rules

- Phase summary: `phase-XX-summary.md`
- Topic docs: `phase-XX-<topic-kebab>.md`
- Data snapshots: `phase-XX-<artifact>.json`

## Handoff Rule

Each phase agent must read previous phase summary and update `00-admin/phase-manifest.md` before exit.
