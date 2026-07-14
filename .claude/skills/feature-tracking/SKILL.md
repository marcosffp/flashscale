---
name: feature-tracking
description: Use to track a feature from idea to done without GitHub — triggered by phrases like "track this feature", "create a feature card", "open a feature", "abrir uma feature", "registrar tarefa". Writes local markdown tracking files under docs/features/ and updates the local board. Never touches GitHub issues, PRs, or any Kanban integration.
---

# Feature Tracking (local only)

## Overview

This project does not use GitHub issues, GitHub Projects, or any `gh` CLI workflow for planning or tracking. Every feature — from first description to the last step — is tracked as plain markdown files in `docs/features/`. This skill is the local replacement for a GitHub-based Kanban: same discipline (nothing starts without a written breakdown), zero external dependency.

No feature implementation starts without its tracking file existing under `docs/features/` and its steps entered in `docs/features/BOARD.md`.

## Iron Rules

- **Never call `gh issue create`, `gh project item-add`, or any GitHub API.** If the user asks for GitHub issues specifically, confirm that's really what they want — the default for this project is local tracking.
- **Never invent technical decisions.** Raise them as open questions; only record a decision once the user confirms it.
- **Always show the draft to the user before writing the file.**
- **Always update `docs/features/BOARD.md`** whenever a feature file is created or a step's status changes.
- **Read [[system-architecture]] before drafting steps** so steps reflect the project's real module layout and conventions.

## File Layout

```
docs/features/
  BOARD.md                     # single table, one row per feature, status column
  <feature-slug>.md            # one file per feature: description, steps, acceptance criteria
```

## Step 1 — Draft the Feature File

**Title:** `# Feature: <Feature Name>`

**Template (`docs/features/<feature-slug>.md`):**

```markdown
# Feature: <Feature Name>

## Description
<What is this feature? What does it do? Be concrete.>

## Motivation
<Why now? What problem does it solve? What's the impact?>

## Acceptance Criteria
- [ ] <concrete, testable, end-to-end criterion>
- [ ] <concrete, testable criterion>

## Technical Decisions
<Relevant implementation decisions confirmed by the user — libraries, approach, trade-offs. Leave empty if none yet; never invent.>

## Open Questions
- **[DECISION]** <architectural question that needs an answer before steps are finalized>

## Steps

| Step | Title | Touches | Depends on | Status |
|------|-------|---------|------------|--------|
| S1   | <title> | gateway / api / orchestrator / dashboard / k8s | — | todo |
| S2   | <title> | ... | S1 | todo |

### S1 — <title>

**What needs to be done:**
- <concrete technical task>
- <concrete technical task>

**TDD note:** <what the first failing test should assert>

**Test Cases (QA)**

Scenario: <name>
- Given <precondition>
- When <action>
- Then <expected result>

Error scenario: <name>
- Given <precondition>
- When <invalid action or failure>
- Then <expected error behavior>

### S2 — <title>
...
```

Repeat the `### S<n>` block for every row in the Steps table. Each step must be independently completable and carry its own test cases.

## Step 2 — Update the Board

**`docs/features/BOARD.md`** is the single local Kanban. One row per feature, kept in sync by hand as work proceeds:

```markdown
# Feature Board

| Feature | File | Status | Notes |
|---------|------|--------|-------|
| <Feature Name> | [<feature-slug>.md](./<feature-slug>.md) | backlog | |
```

Status values: `backlog`, `in-progress`, `done`. When a step's status changes inside a feature file, update that step's row in the Steps table (`todo` → `in-progress` → `done`); update the feature's row in `BOARD.md` only when it moves as a whole (e.g. all steps done → `done`).

Create `docs/features/BOARD.md` if it doesn't exist yet, with the header row above.

## Rules

- **Mandatory fields:** description, motivation, acceptance criteria, and at least one test case per step. Never leave them empty.
- **Steps declare dependencies explicitly** via the `Depends on` column.
- **`Touches` tags reflect the actual service(s) affected** (`gateway`, `api`, `orchestrator`, `dashboard`, `k8s`) — this is the local equivalent of the `[BE]`/`[FE]` prefixes in a multi-repo GitHub setup, but this project is a single repo so no prefix/repo split is needed.
- **No code in the feature file** beyond what a `TDD note` or scenario requires — this is a tracking document, not an implementation.
- **Confirm the breakdown with the user before writing steps** — same as [[plan-feature]] and [[breakdown-feature]], never present unconfirmed steps as final.

## Flow

1. Read [[system-architecture]] to ground steps in the project's real structure.
2. Gather context from the user — description, motivation, acceptance criteria, anything undecided.
3. Draft the feature file content and show it to the user before writing.
4. Once confirmed, write `docs/features/<feature-slug>.md`.
5. Add or update the feature's row in `docs/features/BOARD.md`.
6. Confirm the file paths with the user.

## Updating an Existing Feature

When a step is completed or a decision is made after the file already exists: edit the relevant step's `Status` cell, tick the acceptance criteria checkboxes as they're verified, and fill in `Technical Decisions`/resolve `Open Questions` — don't create a duplicate file for the same feature.
