---
name: default
description: Standard implementation with PR-based code review. Matches v1 behavior.
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

# Default Workflow

## Phase: implement
- Prompt: "Implement the following task: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: exit
- Command:
  - canonical: minion:implement

## Phase: review
- Prompt: "Review via PR pipeline — CI checks + code review"
- Artifact: .minion/{task_slug}/review.md
- Agent: minion-worker
- Gate: exit
- Command:
  - canonical: minion:review
