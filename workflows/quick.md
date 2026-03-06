---
name: quick
description: Fast prototyping — implement only, no review phase. Use for spikes and experiments.
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

# Quick Workflow

## Phase: implement
- Prompt: "Implement the following task quickly. Focus on working code, skip extensive tests: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: exit
- Command:
  - canonical: minion:implement
