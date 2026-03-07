---
name: secure
description: Security-first pipeline — plan, implement, security audit, then code review.
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

## Phase: plan
- Prompt: "Analyze the task and create a brief implementation plan. Identify files to create/modify, approach, and test strategy. Consider security implications: {task}"
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan

## Phase: implement
- Prompt: "Implement the following task with TDD. Write failing tests first, then minimal implementation. Follow all project conventions from CLAUDE.md: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement

## Phase: security-review
- Prompt: "Perform a security audit of the implementation for task: {task}. Check for injection, credential exposure, unsafe input handling, missing validation, and OWASP Top 10 vulnerabilities. Only report security issues — skip code style and architecture feedback."
- Artifact: .minion/{task_slug}/security-review.md
- Agent: security-reviewer
- Gate: artifact
- Command:
  - canonical: minion:security-review

## Phase: review
- Prompt: "Review the implementation for quality, correctness, test coverage, and adherence to coding standards. A security review has already been completed — focus on code quality only: {task}"
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
