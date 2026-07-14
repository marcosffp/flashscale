---
name: plan-feature
description: Use when the user wants to plan a new feature, task, or change before implementation — triggered by phrases like "Crie uma feature", "Quero planejar", "Preciso de um plano", "Vamos planejar" — produces a written plan in docs/plans/ without writing any code or making implementation decisions
---

# Feature Planning

## Overview

This skill produces a complete, language-agnostic feature plan by asking clarifying questions first. It never implements anything and never invents requirements — every assumption is confirmed with the user.

## Iron Rules

- **NEVER write code.** No pseudocode, no snippets, no examples.
- **NEVER invent requirements.** If unsure, ask.
- **ALWAYS create `docs/plans/` if it does not exist** before writing the plan file.
- **ALWAYS ask ALL questions before writing the plan.** Do not write the plan mid-conversation.

## Process

```dot
digraph plan_feature {
    rankdir=TB;
    "Receive feature context" [shape=doublecircle];
    "Enough context to ask good questions?" [shape=diamond];
    "Ask for more context" [shape=box];
    "Generate clarifying questions" [shape=box];
    "Present ALL questions at once" [shape=box];
    "Wait for user answers" [shape=box];
    "Any answer unclear or missing?" [shape=diamond];
    "Ask follow-up" [shape=box];
    "Write plan to docs/plans/<feature-name>.md" [shape=box];
    "Done" [shape=doublecircle];

    "Receive feature context" -> "Enough context to ask good questions?" ;
    "Enough context to ask good questions?" -> "Ask for more context" [label="no"];
    "Ask for more context" -> "Generate clarifying questions";
    "Enough context to ask good questions?" -> "Generate clarifying questions" [label="yes"];
    "Generate clarifying questions" -> "Present ALL questions at once";
    "Present ALL questions at once" -> "Wait for user answers";
    "Wait for user answers" -> "Any answer unclear or missing?";
    "Any answer unclear or missing?" -> "Ask follow-up" [label="yes"];
    "Ask follow-up" -> "Wait for user answers";
    "Any answer unclear or missing?" -> "Write plan to docs/plans/<feature-name>.md" [label="no"];
    "Write plan to docs/plans/<feature-name>.md" -> "Done";
}
```

## Clarifying Questions Guide

Group questions by category. Only ask what is genuinely unknown. Never ask something the user already answered.

**Scope**
- What problem does this feature solve?
- Who are the users/actors involved?
- What is explicitly OUT of scope?

**Behavior**
- What are the main user flows / happy paths?
- What are the known edge cases or failure scenarios?
- Are there any constraints (performance, security, compliance)?

**Integration**
- Does this touch existing functionality? Which parts?
- Are there external systems, APIs, or services involved?
- Are there dependencies this feature must wait for?

**Acceptance**
- How will we know this feature is done?
- Are there specific acceptance criteria or success metrics?

**Priority / Sequencing**
- Is there a preferred order for implementing the parts?
- Are there phases or milestones?

## Plan File Format

Save to `docs/plans/<kebab-case-feature-name>.md`.

```markdown
# Plan: <Feature Name>

## Problem
What problem this solves and why it matters.

## Goals
Bulleted list of what success looks like.

## Out of Scope
Explicit list of what is NOT included.

## Actors & Context
Who interacts with this feature and in what context.

## User Flows
Numbered steps for each main flow.

## Edge Cases & Failure Scenarios
How the system should behave in non-happy-path situations.

## Acceptance Criteria
Concrete, verifiable conditions for completion.

## Open Questions
Anything still unresolved that must be answered before implementation.

## Implementation Hints (optional)
High-level sequencing suggestions — no code, no tech stack assumptions.
```

## Implementation Approach

Every task produced by this plan **must** be implemented using TDD:

1. **RED** — Write a failing test that describes the behavior
2. **GREEN** — Write the minimal code to make the test pass
3. **REFACTOR** — Clean up without changing behavior

Include this expectation explicitly in the `Implementation Hints` section of every plan. Never assume TDD is implied — state it.

## What NOT to Include in the Plan

- Technology choices (language, framework, database)
- Code snippets or pseudocode
- Invented requirements not confirmed by the user
- Implementation details below the "what needs to happen" level
