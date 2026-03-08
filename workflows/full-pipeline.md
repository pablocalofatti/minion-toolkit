---
name: full-pipeline
description: Enterprise pipeline with review-fix cycle. Maximum quality guardrails.
version: 2.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

# Full Pipeline Workflow

## Phase: plan
- Prompt: "Create a detailed implementation plan. Identify architecture decisions, files to create/modify, edge cases, and test strategy: {task}"
- Role: researcher
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan
  - claude-code: /superpowers:brainstorming

## Phase: implement
- Prompt: "Implement following the plan from the previous phase. Write comprehensive tests: {task}"
- Role: tdd-developer
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement

## Phase: review
- Prompt: "Review the implementation for quality, correctness, test coverage, security, and adherence to coding standards: {task}"
- Role: code-reviewer
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
  - claude-code: /superpowers:requesting-code-review

## Phase: fix
- Prompt: "Address all review feedback from the previous phase. Fix every issue flagged, then re-run lint and tests: {task}"
- Artifact: .minion/{task_slug}/fix.md
- Agent: minion-worker
- Gate: artifact
- Cycle: review
- Max-cycles: 3
- Command:
  - canonical: minion:fix
