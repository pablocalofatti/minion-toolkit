---
name: ci-checked
description: Implementation workflow with CI hooks — runs lint before review and tests after implement
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

## Phase: implement
- Prompt: "Implement the following task: {task}. Follow all project conventions from CLAUDE.md. Write clean, minimal code."
- Artifact: .minion/{task_slug}/implement.md
- Gate: artifact
- Post-hook: pnpm test --passWithNoTests 2>&1 | tee .minion/ci-test.log; exit ${PIPESTATUS[0]}
- Command:
  - canonical: minion:implement

## Phase: review
- Prompt: "Review the implementation for task: {task}. Check for correctness, edge cases, code quality, and adherence to CLAUDE.md standards. Be specific about any issues found."
- Artifact: .minion/{task_slug}/review.md
- Gate: artifact
- Pre-hook: pnpm lint --quiet 2>&1 | tee .minion/ci-lint.log; lint_rc=${PIPESTATUS[0]}; if [ $lint_rc -ne 0 ]; then grep -q "Missing script" .minion/ci-lint.log && echo "No lint configured" || exit $lint_rc; fi
- Command:
  - canonical: minion:review
