# Minion v2 Phase C: Progress Output & Phase Hooks

**Date:** 2026-03-07
**Status:** Approved
**Phase:** C (of 3)
**Depends on:** Phase B (cyclic workflows) — completed and tested

## Context

Phases A and B built declarative workflow templates with sequential phases and review-fix cycles. Two gaps remain:

1. **Visibility** — When /minion runs 3-5 workers across 4 phases, the orchestrator is silent until the final results table. There's no way to see progress in real-time.
2. **Extensibility** — Workflows can't trigger external actions (lint checks, notifications, scripts) at phase boundaries.

Phase C adds **progress output** (real-time status updates during the watch loop) and **phase hooks** (shell commands that run before/after phases).

---

## 1. Progress Output

### What Changes

The orchestrator's Step 7 watch loop currently waits for worker reports silently, then prints a final results table. We add formatted progress output on each state change.

### Output Format

Every time the orchestrator processes a worker report (Step 7), it prints:

1. A timestamped progress line
2. A compact summary table showing all tasks' current state

```
[14:32:01] Task 1 (Add validation): plan -> success
[14:32:01] Task 1 (Add validation): implement -> in_progress

+---------------------+------+-----------+--------+-----+
| Task                | plan | implement | review | fix |
+---------------------+------+-----------+--------+-----+
| 1. Add validation   |  v   |    o      |   .    |  .  |
| 2. Fix pagination   |  o   |    .      |   .    |  .  |
| 3. Add tests        |  o   |    .      |   .    |  .  |
+---------------------+------+-----------+--------+-----+
```

### Status Symbols

| Symbol | Meaning |
|--------|---------|
| `v` | completed (success) |
| `o` | in_progress |
| `x` | failed |
| `>` | skipped |
| `.` | pending |

### Where It Goes

New instructions in `commands/minion.md` Step 7, after processing each worker report and before the phase progression check.

---

## 2. Phase Hooks

### Template Format

Two new optional properties on any `## Phase:` section:

```markdown
## Phase: review
- Prompt: "Review the implementation: {task}"
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Pre-hook: pnpm lint --quiet
- Post-hook: echo "Review done for {task_slug}"
- Command:
  - canonical: minion:review
```

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `Pre-hook` | No | none | Shell command to run before spawning the worker for this phase |
| `Post-hook` | No | none | Shell command to run after the worker completes this phase successfully |

### Execution Model

- **Pre-hook** runs before the worker is spawned for that phase. If it exits non-zero, the phase is marked `failed` and the task follows normal failure logic (skip remaining phases).
- **Post-hook** runs after the worker completes the phase successfully. If it exits non-zero, the phase is marked `failed` despite the worker succeeding.
- Hooks run in the **task's worktree directory** (same working directory as the worker), so they have access to the task's branch and files.
- Template variables are available: `{task}`, `{task_slug}`, `{task_number}`, `{phase}`.

### Failure Behavior

Hooks block on failure (non-zero exit code). This is intentional — if you declared a hook, you want it to matter. For fire-and-forget commands, append `|| true`.

### Interaction with Cycles

In a review-fix cycle, hooks run on every cycle iteration:
- Review phase's pre-hook runs before each re-review
- Fix phase's hooks run on each fix iteration

### Parsing

Step 1.3 extracts `Pre-hook` and `Post-hook` the same way it extracts other phase properties. No special validation needed beyond ensuring the value is non-empty when present.

### Execution Location

Step 7 in the orchestrator:
- Pre-hook runs before spawning the worker (new sub-step before Agent tool call)
- Post-hook runs after processing the worker's report (new sub-step after status update, before phase progression)

---

## 3. Files Changed

| File | Change |
|------|--------|
| `commands/minion.md` | Step 1.3: parse `Pre-hook` and `Post-hook`. Step 7: add progress output on state change + hook execution logic. |
| `workflows/full-pipeline.md` | No hooks by default — users add hooks when needed. |
| `workflows/default.md`, `tdd.md`, `quick.md` | No changes. |
| `agents/minion-worker.md` | No changes. |
| `skills/minion-blueprint/SKILL.md` | No changes. |

### Backwards Compatibility

- Workflows without hooks behave exactly as today. Zero impact.
- Progress output is always printed — it's additive visibility, not a behavior change.

---

## 4. Testing Strategy

### Test 1: Progress output
Run `/minion --workflow tdd tasks.md` and verify progress lines and summary table print after each phase completion.

### Test 2: Pre-hook success
Create a workflow with `Pre-hook: echo "hook ran"` on the review phase. Verify it runs before review starts.

### Test 3: Pre-hook failure
Create a workflow with `Pre-hook: exit 1` on the review phase. Verify the phase is skipped and task fails.

### Test 4: Hook with template variables
Use `Post-hook: echo "{task_slug} {phase}"` and verify variables are resolved.

### Test 5: No hooks (backwards compat)
Run existing workflows (`default`, `tdd`, `quick`) and verify zero behavior change.
