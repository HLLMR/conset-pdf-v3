# Source of Truth Decisions

Record conflicts between docs and code, then mark the canonical source used by post-mortem extraction.

## Decision Log

| ID | Topic | Conflicting Sources | Canonical Source Chosen | Rationale | Date |
|---|---|---|---|---|---|
| SOT-001 | Workflow status drift | `docs/CLI.md`, `README.md`, `ROADMAP.md` | Code + tests first, then `ROADMAP.md` | Some docs have stale command status claims. | 2026-03-19 |

## Rules

1. Prefer executable truth in code and tests over prose docs.
2. If code and tests disagree, record as P0 risk in `open-questions-and-risks.md`.
3. Every major conflict must have a log entry before phase close.
