# Cyclic Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add review-fix cycle support to minion workflow templates so review phases can loop back through fix phases until issues are resolved.

**Architecture:** Inline `Cycle` and `Max-cycles` properties on workflow phase sections. The orchestrator's Step 7 phase progression check gains cycle-aware logic: cycle target phases (review) exit the loop on `success`, cycling phases (fix) reset the pointer back. Artifacts are versioned with a suffix on each iteration.

**Tech Stack:** Markdown prompt engineering (commands/minion.md, workflows/*.md). No runtime code — all changes are in Claude Code command/workflow files.

---

### Task 1: Add Cycle and Max-cycles parsing to Step 1.3

**Files:**
- Modify: `commands/minion.md:96-104`

**Step 1: Add Cycle and Max-cycles to the Parse Template section**

In `commands/minion.md`, find the "From each `## Phase:` section" block (line 96-104). Add two new bullet points after the `Command` line:

```markdown
- **Cycle** — value after `- Cycle:` (phase name to jump back to after this phase completes successfully, or `null` if not set)
- **Max-cycles** — value after `- Max-cycles:` (integer, defaults to `3` if `Cycle` is set, ignored if `Cycle` is not set)
```

The block should read:
```markdown
**From each `## Phase:` section (in document order):**
- **Phase name** — text after `## Phase:` (e.g., `plan`, `implement`, `review`)
- **Prompt** — value after `- Prompt:` (template string, may contain `{task}`, `{task_slug}`, `{task_number}`)
- **Artifact** — value after `- Artifact:` (file path, may contain `{task_slug}`)
- **Agent** — value after `- Agent:` (agent name, defaults to `default_agent` if not specified)
- **Gate** — value after `- Gate:` (`artifact` or `exit`, defaults to `artifact`)
- **Command** — nested block under `- Command:` with `canonical:` and optional platform overrides (e.g., `claude-code:`, `opencode:`, `codex:`)
- **Cycle** — value after `- Cycle:` (phase name to jump back to after this phase completes successfully, or `null` if not set)
- **Max-cycles** — value after `- Max-cycles:` (integer, defaults to `3` if `Cycle` is set, ignored if `Cycle` is not set)
```

**Step 2: Verify the edit**

Read `commands/minion.md` lines 96-106 and confirm both new bullet points are present and properly formatted.

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add Cycle and Max-cycles parsing to Step 1.3"
```

---

### Task 2: Add cycle validation rules to Step 1.3

**Files:**
- Modify: `commands/minion.md:125-134`

**Step 1: Add cycle-specific validation rules**

In the `### Validate` section (line 125-134), add three new validation rules after the existing ones (after "All phases have a `Prompt` value" line):

```markdown
- Cycle target must exist and precede the declaring phase — error: "Cycle target '{name}' must appear before phase '{current}' in document order"
- Only one phase may declare `Cycle` per workflow — error: "Only one cycle per workflow is supported. Phases '{first}' and '{second}' both declare Cycle"
- `Max-cycles` without `Cycle` — warning: "Max-cycles ignored on phase '{name}' — no Cycle target defined"
```

**Step 2: Verify the edit**

Read `commands/minion.md` lines 125-140 and confirm three new validation rules appear after the existing five.

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add cycle validation rules to Step 1.3"
```

---

### Task 3: Add CYCLE fields to Step 6 worker prompt

**Files:**
- Modify: `commands/minion.md:433-437`

**Step 1: Add CYCLE and CYCLE INSTRUCTION fields**

In the Step 6 worker prompt template (lines 422-452), add two new fields after the `PREVIOUS ARTIFACTS` line (line 437) and before the `IMPORTANT` line (line 439):

```markdown
CYCLE: {cycle_target} → {current_phase} (iteration {cycle_count + 1} of {max_cycles}) — omit if phase has no Cycle or is not a cycle target
CYCLE INSTRUCTION: Report STATUS: success if no issues found (exits the cycle). Report STATUS: review_failed if issues remain (triggers another fix iteration). — omit if not inside a cycle
```

**Step 2: Add `review_failed` to the STATUS enum in the report format**

In the report format (line 444), add `review_failed` to the STATUS options:

Change:
```
STATUS: {success | partial | lint_failed | test_failed | implementation_failed}
```
To:
```
STATUS: {success | partial | lint_failed | test_failed | implementation_failed | review_failed}
```

Do this in **both** report format blocks — the one in Step 6 (line 444) and the one in Step 7 (line 470).

**Step 3: Verify the edit**

Read `commands/minion.md` lines 433-455 and confirm:
- `CYCLE` and `CYCLE INSTRUCTION` fields appear after `PREVIOUS ARTIFACTS`
- `review_failed` is in the STATUS enum

**Step 4: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add CYCLE and CYCLE INSTRUCTION to Step 6 worker prompt"
```

---

### Task 4: Rewrite Step 7 phase progression with cycle support

**Files:**
- Modify: `commands/minion.md:487-509`

This is the core change. Replace the current phase progression check (lines 487-509) with cycle-aware logic.

**Step 1: Replace the phase progression check**

Find the current `4. **Phase progression check:**` block (lines 487-509) and replace it entirely with:

```markdown
4. **Phase progression check:**
   - Look up the task's workflow phases (ordered list from Step 1.3)
   - Determine if the completed phase is involved in a cycle:
     - **Is it a cycle target?** (i.e., another phase's `Cycle` property points to this phase name)
     - **Does it have a `Cycle` property?** (i.e., it declares `Cycle: {target}`)

   **Case A — Cycle target phase completed with `success` (e.g., review passes):**
   - EXIT CYCLE. The review found no issues.
   - Skip the cycling phase (fix) entirely — do not spawn it.
   - Advance to whatever phase comes **after** the cycling phase in document order.
   - If no phase comes after the cycling phase → task is fully complete.

   **Case B — Cycle target phase completed with non-`success` status (e.g., review_failed):**
   - Continue normally to the next phase (the cycling phase, e.g., fix).
   - Spawn the fix worker as usual (same logic as current "next phase exists AND status is success" path — treat `review_failed` as a valid "proceed to fix" signal, NOT as a task failure).

   **Case C — Cycling phase completed (e.g., fix completes with `success`):**
   - Read the task's `cycle_count` from `status.json` (default `0`).
   - **If `cycle_count < max_cycles`:**
     - Increment `cycle_count` in `status.json`.
     - CYCLE BACK: Reset the phase pointer to the cycle target phase (review).
     - Update the artifact path for the target phase with version suffix: `review-{cycle_count + 1}.md` (e.g., `review-2.md` for the second iteration). First iteration has no suffix.
     - Spawn a new worker for the cycle target phase with the versioned artifact path and accumulated `PREVIOUS ARTIFACTS`.
   - **If `cycle_count >= max_cycles`:**
     - MAX REACHED. Log a warning: "Max cycles ({max_cycles}) reached for task {N}. Continuing despite unresolved issues."
     - Advance to whatever phase comes **after** the cycling phase in document order (or complete the task).

   **Case D — Normal phase (not involved in any cycle):**
   - **If next phase exists AND status is `success`:**
     - Update `status.json`: set next phase to `in_progress`
     - Resolve the next phase's agent (from workflow template)
     - Spawn a new worker for the next phase using the `Agent` tool:
       - `subagent_type`: the next phase's agent
       - `name`: `"worker-{task_number}-{phase_name}"` (e.g., `worker-1-review`)
       - `team_name`: the team name from Step 4
       - `isolation`: `"worktree"` (reuse the same worktree/branch)
       - `run_in_background`: `true`
     - The prompt includes all fields from Step 6 plus:
       - `PHASE`: the next phase name
       - `PHASE PROMPT`: the next phase's resolved prompt
       - `ARTIFACT PATH`: the next phase's artifact path
       - `PREVIOUS ARTIFACTS`: comma-separated list of all completed phase artifacts so far
   - **If next phase exists AND status is NOT `success`:**
     - Task is done (failed). Mark remaining phases as `skipped` in `status.json`
     - Use `TaskUpdate` to mark the task as `completed`
   - **If no next phase (or workflow is `default`):**
     - Task is fully complete. Use `TaskUpdate` to mark the task as `completed`
     - If there are queued tasks remaining, spawn the next worker (go back to Step 6 logic)
```

**Step 2: Verify the edit**

Read `commands/minion.md` lines 487-545 (approximate) and confirm:
- Four cases (A, B, C, D) are present
- Case A: cycle target + success = exit cycle, skip fix
- Case B: cycle target + non-success = continue to fix (NOT fail the task)
- Case C: cycling phase + under max = cycle back with versioned artifact; over max = continue with warning
- Case D: unchanged normal progression

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: cycle-aware phase progression in Step 7"
```

---

### Task 5: Add cycle_count to status.json schema

**Files:**
- Modify: `commands/minion.md:517-541`

**Step 1: Add cycle_count to the status.json schema**

In the `### Writing status.json` section (lines 517-541), add `cycle_count` to the phase object schema. Find the phase JSON block:

```json
"{phase_name}": {
  "status": "completed | in_progress | pending | skipped",
  "agent": "{agent_name}",
  "artifact": "{artifact_path or null}",
  "started_at": "{ISO timestamp or null}",
  "completed_at": "{ISO timestamp or null}"
}
```

Add `cycle_count` after `artifact`:

```json
"{phase_name}": {
  "status": "completed | in_progress | pending | skipped",
  "agent": "{agent_name}",
  "artifact": "{artifact_path or null}",
  "cycle_count": "{integer, only present on cycle target phases, default 0}",
  "started_at": "{ISO timestamp or null}",
  "completed_at": "{ISO timestamp or null}"
}
```

**Step 2: Add a note about cycle_count initialization**

After the existing note on line 541 ("Initialize `status.json` when the first phase starts..."), add:

```markdown
For cycle target phases, initialize `cycle_count` to `0`. Increment it each time the cycle resets (Case C in Step 7). Non-cycle phases do not have a `cycle_count` field.
```

**Step 3: Verify the edit**

Read `commands/minion.md` lines 520-545 and confirm `cycle_count` appears in the schema and the initialization note is present.

**Step 4: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add cycle_count to status.json schema"
```

---

### Task 6: Update full-pipeline.md with Cycle property

**Files:**
- Modify: `workflows/full-pipeline.md:40-47`

**Step 1: Add Cycle and Max-cycles to the fix phase**

In `workflows/full-pipeline.md`, find the `## Phase: fix` section (line 40). Add `Cycle` and `Max-cycles` properties after the `Gate` line:

The fix phase should become:

```markdown
## Phase: fix
- Prompt: "Address all review feedback from the previous phase. Fix every issue flagged, then re-run lint and tests: {task}"
- Artifact: .minion/{task_slug}/fix.md
- Agent: minion-worker
- Gate: artifact
- Cycle: review
- Max-cycles: 3
- Command:
  - canonical: minion:fix
```

**Step 2: Update the version in frontmatter**

Change `version: 1.0` to `version: 2.0` in the YAML frontmatter (line 4).

**Step 3: Update the description in frontmatter**

Change the description to include "review-fix cycle":
```yaml
description: Enterprise pipeline with review-fix cycle. Maximum quality guardrails.
```

**Step 4: Verify the edit**

Read `workflows/full-pipeline.md` in full and confirm:
- Version is `2.0`
- Description mentions "review-fix cycle"
- Fix phase has `Cycle: review` and `Max-cycles: 3`

**Step 5: Commit**

```bash
git add workflows/full-pipeline.md
git commit -m "feat: add review-fix cycle to full-pipeline workflow"
```

---

### Task 7: Sync to ~/.claude/ and verify backwards compatibility

**Files:**
- Copy: `commands/minion.md` → `~/.claude/commands/minion.md`
- Copy: `workflows/full-pipeline.md` → `~/.claude/workflows/full-pipeline.md`

**Step 1: Copy updated files**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
cp workflows/full-pipeline.md ~/.claude/workflows/full-pipeline.md
```

**Step 2: Verify other workflows are unchanged**

Read `workflows/default.md`, `workflows/tdd.md`, `workflows/quick.md` and confirm none of them have `Cycle` or `Max-cycles` properties. They must be identical to their pre-Phase B versions.

**Step 3: Verify parsing section includes Cycle**

Read `~/.claude/commands/minion.md` lines 96-106 and confirm `Cycle` and `Max-cycles` appear in the Parse Template section.

**Step 4: Verify Step 7 has all four cases**

Read `~/.claude/commands/minion.md` lines 487-545 and confirm Cases A, B, C, D are present.

**Step 5: No commit needed — this is a sync step**

---

### Summary

| Task | What | File | Lines |
|------|------|------|-------|
| 1 | Parse Cycle/Max-cycles | `commands/minion.md` | 96-104 |
| 2 | Validate cycle rules | `commands/minion.md` | 125-134 |
| 3 | Add CYCLE to worker prompt | `commands/minion.md` | 433-452 |
| 4 | Rewrite Step 7 progression | `commands/minion.md` | 487-509 |
| 5 | Add cycle_count to status.json | `commands/minion.md` | 517-541 |
| 6 | Update full-pipeline.md | `workflows/full-pipeline.md` | 1-47 |
| 7 | Sync to ~/.claude/ + verify | Copy files | — |
