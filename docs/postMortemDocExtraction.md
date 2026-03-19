## Plan: Prototype Codebase Extraction & Post-Mortem Documentation

Create a structured library of post-mortem documents capturing the architecture, workflows, lessons, and edge cases from the two prototype repos. This library will serve as a reference for refining and executing the V4 plan.

---

**Steps**

### Phase 1: Discovery & Inventory
1. Inventory both prototype repos: list all major modules, scripts, workflows, and test cases.
2. Identify key features, architectural decisions, and technical limitations.
3. Catalog all user-facing workflows, CLI commands, and UI flows.

### Phase 2: Documentation Extraction
4. Extract and summarize:
   - Core architecture (file structure, main modules, data flow)
   - Key algorithms (region detection, parsing, extraction logic)
   - Error handling and edge cases
   - Testing approach and coverage
   - Deployment and user feedback
5. Document all major bugs, limitations, and workarounds encountered.

### Phase 3: Post-Mortem Analysis
6. Write post-mortem docs for:
   - Architecture overview (with diagrams)
   - Workflow breakdowns (step-by-step, with screenshots if possible)
   - Lessons learned (what worked, what failed, why)
   - Edge case catalog (inputs, outputs, failure modes)
   - User feedback summary (pain points, feature requests)
   - Technical debt and refactor plans (summarize existing plan files)
7. Annotate code snippets and configs to illustrate key points.

### Phase 4: Reference Library Assembly
8. Organize docs into a reference library:
   - /docs/prototype-postmortem/
   - Clear index and cross-references to V4 plan sections
9. Link relevant prototype docs to V4 plan phases (e.g., region detection, chrome extraction, workflow design).

### Phase 5: Verification & Integration
10. Review docs for completeness and clarity.
11. Validate that all critical lessons and edge cases are captured.
12. Integrate references into V4 plan and roadmap for future development.

---

**Relevant files**
- Prototype repo source files (modules, scripts, tests)
- Existing plan files: automatedRoiRefactorPlan.md, largeFileRefactorPlan.md
- New docs: /docs/prototype-postmortem/ (architecture, workflows, lessons, edge cases, user feedback)

---

**Verification**
1. Ensure all major prototype features, workflows, and bugs are documented.
2. Confirm post-mortem docs are cross-referenced in the V4 plan.
3. Validate completeness by reviewing with stakeholders or against real user feedback.

---

**Decisions**
- Scope includes all prototype code, workflows, and user feedback.
- Excludes implementation of new features; focus is on documentation and analysis.
- Reference library will be used to inform V4 plan modifications and development.

---

**Further Considerations**
1. Recommend capturing screenshots and sample inputs/outputs for workflow docs.
2. Consider including a summary table mapping prototype features to V4 plan phases.
3. Optionally, record interviews or notes from users for richer feedback documentation.

Let me know if you want a more granular breakdown or templates for each doc type!
