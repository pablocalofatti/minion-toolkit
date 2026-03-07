# Minion v2 Phase B: Cyclic Workflows

**Date:** 2026-03-07
**Status:** Approved
**Phase:** B (of 3)
**Depends on:** Phase A (workflow templates + artifact-based status) — completed and tested

## Context

Phase A added declarative workflow templates with sequential phases (plan -> implement -> review). Every phase runs exactly once. In practice, code review is iterative: review finds issues -> fix addresses them -> re-review verifies. The current system can't express this — `full-pipeline.md` runs plan -> implement -> review -> fix linearly, with no way to re-review after the fix.

Phase B adds **cyclic workflows** — a phase can declare a `Cycle` property that jumps back to a prior phase, creating a bounded review-fix loop.

---

## 1. Workflow Template Format Changes

Two new optional properties on any `## Phase:` section:

```markdown
## Phase: fix
- Prompt: "Address all review feedback: {task}"
- Artifact: .minion/{task_slug}/fix.md
- Agent: minion-worker
- Gate: artifact
- Cycle: review
- Max-cycles: 3
- Command:
  - canonical: minion:fix
```

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `Cycle` | No | none | Phase name to jump back to after this phase completes successfully. Creates a review-fix loop. |
| `Max-cycles` | No | `3` | Maximum times the cycle repeats. After exhaustion, continue to next phase with a warning. |

### Rules

- `Cycle` must reference a phase that appears **before** the current phase in document order (no forward jumps)
- Only one `Cycle` declaration per workflow (no nested cycle complexity)
- The cycle target phase (e.g., review) reports `STATUS: success` to exit the loop — any non-success status triggers the next iteration through the cycling phase (e.g., fix)

### Updated full-pipeline.md

```markdown
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
- Prompt: "Create implementation plan: {task}"
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan
  - claude-code: /superpowers:brainstorming

## Phase: implement
- Prompt: "Implement following the plan: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement

## Phase: review
- Prompt: "Review for quality, correctness, test coverage: {task}"
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
  - claude-code: /superpowers:requesting-code-review

## Phase: fix
- Prompt: "Address all review feedback from the previous phase: {task}"
- Artifact: .minion/{task_slug}/fix.md
- Agent: minion-worker
- Gate: artifact
- Cycle: review
- Max-cycles: 3
- Command:
  - canonical: minion:fix
```

---

## 2. Orchestrator Changes

### Step 1.3: Parse Template (additions)

When parsing each `## Phase:` section, also extract:
- **Cycle** — value after `- Cycle:` (phase name, or `null`)
- **Max-cycles** — value after `- Max-cycles:` (integer, defaults to `3` if `Cycle` is set)

New validation rules:
- If `Cycle` references a phase not yet defined -> error: "Cycle target '{name}' must appear before phase '{current}'"
- If more than one phase declares `Cycle` -> error: "Only one cycle per workflow is supported"
- If `Max-cycles` is set without `Cycle` -> warning: "Max-cycles ignored — no Cycle target defined"

### Step 7: Phase Progression Check (modified)

Current logic:
```
if next_phase exists AND status == success -> advance to next phase
if next_phase exists AND status != success -> fail task, skip remaining
if no next_phase -> task complete
```

New logic with cycle support:
```
1. Is the completed phase a CYCLE TARGET? (does another phase's Cycle point here?)
   - YES and status == success -> EXIT CYCLE. Skip the cycling phase.
     Advance past the cycling phase to whatever comes after it (or complete).
   - YES and status != success -> continue to the cycling phase (fix) as normal.

2. Does the completed phase have a Cycle property?
   - YES and cycle_count < max_cycles -> CYCLE BACK.
     Reset pointer to Cycle target phase. Increment cycle_count.
   - YES and cycle_count >= max_cycles -> MAX REACHED.
     Log warning: "Max cycles ({N}) reached for {phase}. Continuing despite unresolved issues."
     Advance to next phase after this one (or complete).

3. Normal progression (no cycle involved):
   - next phase exists AND status == success -> advance
   - next phase exists AND status != success -> fail task
   - no next phase -> task complete
```

Key detail: The cycle exit happens at the **target phase** (review), not the cycling phase (fix). When review reports `STATUS: success`, it means "no issues" -> skip fix entirely.

### Step 6: Worker Prompt (additions)

New fields when inside a cycle:
```
CYCLE: review -> fix (iteration 2 of 3)
CYCLE INSTRUCTION: Report STATUS: success if no issues found (exits the cycle).
Report STATUS: review_failed if issues remain (triggers another fix iteration).
```

---

## 3. Artifact Naming in Cycles

When a phase runs multiple times, artifacts are versioned:

- First iteration: `review.md`, `fix.md` (no suffix, backwards-compatible)
- Second iteration: `review-2.md`, `fix-2.md`
- Third iteration: `review-3.md`, `fix-3.md`

The worker prompt's `ARTIFACT PATH` is updated each cycle. `PREVIOUS ARTIFACTS` accumulates all prior versions.

Example after 2 cycles:
```
.minion/task-1-add-validation/
├── plan.md
├── implement.md
├── review.md           <- cycle 1 review (found issues)
├── fix.md              <- cycle 1 fix
├── review-2.md         <- cycle 2 review (all clear -> exit)
└── status.json
```

---

## 4. status.json Changes

Add `cycle_count` to the cycle target phase:

```json
{
  "task_number": "1",
  "task_title": "Add validation",
  "workflow": "full-pipeline",
  "current_phase": "review",
  "phases": {
    "plan": { "status": "completed", "agent": "minion-worker", "artifact": ".minion/task-1/plan.md", "started_at": "...", "completed_at": "..." },
    "implement": { "status": "completed", "agent": "minion-worker", "artifact": ".minion/task-1/implement.md", "started_at": "...", "completed_at": "..." },
    "review": { "status": "in_progress", "agent": "code-quality", "artifact": ".minion/task-1/review-2.md", "cycle_count": 2, "started_at": "...", "completed_at": null },
    "fix": { "status": "completed", "agent": "minion-worker", "artifact": ".minion/task-1/fix.md", "started_at": "...", "completed_at": "..." }
  },
  "branch": "minion/task-1-add-validation",
  "platform": "claude-code"
}
```

---

## 5. Files Changed

| File | Change |
|------|--------|
| `commands/minion.md` | Step 1.3: parse `Cycle` and `Max-cycles`, new validations. Step 7: cycle-aware progression. Step 6: `CYCLE` and `CYCLE INSTRUCTION` prompt fields. |
| `workflows/full-pipeline.md` | Add `Cycle: review` and `Max-cycles: 3` to fix phase. |
| No changes | `agents/minion-worker.md`, `skills/minion-blueprint/SKILL.md`, `workflows/default.md`, `workflows/tdd.md`, `workflows/quick.md` |

### Backwards Compatibility

Workflows without `Cycle:` behave exactly as today. Zero impact on existing workflows.

---

## 6. Testing Strategy

### Test 1: Cycle exit on first review (no cycling)
Use `full-pipeline.md` with `Cycle: review`. If review passes on first try, fix phase is skipped. Task completes with plan -> implement -> review only.

### Test 2: Cycle iteration (review fails, fix runs, re-review passes)
Task with imperfect code. Review flags issues -> fix addresses them -> re-review passes. Verifies core cycle loop. Check artifact versioning (`review.md`, `fix.md`, `review-2.md`).

### Test 3: Max cycles exhaustion
Set `Max-cycles: 1`. After 1 cycle (review -> fix -> review still fails), task continues with warning. Verifies safety cap and "continue anyway" behavior.

### What to verify
- `status.json` has correct `cycle_count`
- Artifact files versioned correctly
- `PREVIOUS ARTIFACTS` accumulates across cycles
- Worker prompt includes `CYCLE` and `CYCLE INSTRUCTION`
- Warning logged when max cycles exhausted
- No impact on workflows without cycles (`default.md`, `tdd.md`, `quick.md`)
