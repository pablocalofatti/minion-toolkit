---
name: tdd
description: Test-driven development pipeline — plan first, implement with TDD, then code review.
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

# TDD Workflow

## Phase: plan
- Prompt: "Analyze the task and create a brief implementation plan. Identify files to create/modify, approach, and test strategy: {task}"
- Role: researcher
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan
  - claude-code: /superpowers:brainstorming
  - opencode: @plan
  - codex: $minion-plan

## Phase: implement
- Prompt: "Implement with TDD — write failing tests first, then minimal implementation to make them pass. Follow the plan from the previous phase: {task}"
- Role: tdd-developer
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement
  - claude-code: /superpowers:test-driven-development

## Phase: review
- Prompt: "Review the implementation for quality, correctness, test coverage, and adherence to coding standards: {task}"
- Role: code-reviewer
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
  - claude-code: /superpowers:requesting-code-review
  - opencode: @code-reviewer
