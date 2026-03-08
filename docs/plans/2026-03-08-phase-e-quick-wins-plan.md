# Phase E: Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cross-phase memory, `--dry-run` flag, worker health monitoring improvements, and post-run report generation to minion-toolkit.

**Architecture:** All changes are prompt engineering in markdown files. Task 1 modifies the blueprint to read all prior artifacts. Tasks 2–4 modify the orchestrator to add a flag, improve status surfacing, and generate a report file. No runtime code, no dependencies.

**Tech Stack:** Markdown prompt engineering (`skills/minion-blueprint/SKILL.md`, `commands/minion.md`, `README.md`)

---

### Task 1: Cross-Phase Memory — Blueprint reads all prior artifacts

Workers currently read "previous artifacts" but only the most recent one. This change makes Step 2 explicitly read ALL artifacts from prior phases.

**Files:**
- Modify: `skills/minion-blueprint/SKILL.md:33-39` (Step 2: Gather Context)

**Step 1: Modify Step 2 in the blueprint**

In `skills/minion-blueprint/SKILL.md`, find lines 36-38 (the `PREVIOUS ARTIFACTS` paragraph):

```markdown
If `PREVIOUS ARTIFACTS` lists any artifact files, read them first — they contain context and decisions from prior workflow phases that should guide your implementation.
```

Replace with:

```markdown
If `PREVIOUS ARTIFACTS` lists any artifact files, read ALL of them — not just the most recent one. They contain context and decisions from prior workflow phases that should guide your implementation. Read them in phase order (e.g., `plan.md` before `implement.md` before `review.md`) to understand the full decision chain. For example, when running a `review` phase, reading the `plan.md` artifact tells you WHY certain design decisions were made, and the `implement.md` artifact tells you WHAT was built.

Additionally, scan the `.minion/{task_slug}/` directory for any artifact files not listed in `PREVIOUS ARTIFACTS` (in case the list is incomplete). Read any `.md` files found there that you haven't already read.
```

**Step 2: Commit**

```bash
git add skills/minion-blueprint/SKILL.md
git commit -m "feat: cross-phase memory — blueprint reads all prior artifacts"
```

---

### Task 2: `--dry-run` flag

Allow users to preview the full execution plan without spawning workers. The orchestrator runs Steps 1–3 then stops.

**Files:**
- Modify: `commands/minion.md:15-17` (Step 1 — add `--dry-run` flag parsing)
- Modify: `commands/minion.md:390-431` (Step 3 — add dry-run exit after confirmation display)
- Modify: `README.md:149-160` (Workflow Usage — add `--dry-run` example)

**Step 1: Add `--dry-run` flag parsing to Step 1**

In `commands/minion.md`, find the flag parsing section (lines 15-17). After the `--resume` flag parsing (line 17), add:

```markdown
- **Parse dry-run flag:** Check if `$ARGUMENTS` contains `--dry-run`. If present, set `dry_run = true` and remove `--dry-run` from arguments. Default: `dry_run = false`.
```

**Step 2: Add dry-run exit to Step 3**

In `commands/minion.md`, find Step 3 (line 390). After the confirmation display but BEFORE the "Ask the user with options" section (line 419), add:

```markdown
- **Dry-run exit:** _(only when `dry_run` is `true`)_
  After displaying the full summary above, print:
  ```
  [DRY RUN] Preview complete — no workers spawned.
  ```
  Then STOP. Do not ask for confirmation, do not create teams, do not spawn workers. The purpose of `--dry-run` is to let users validate their task file, workflow, wave computation, and agent assignments before committing to a run.
```

**Step 3: Add `--dry-run` to README**

In `README.md`, find the Workflow Usage section (lines 149-160). After the existing examples (line 160), add:

```markdown

### Previewing a Run

Preview the execution plan without spawning workers:

```bash
# Dry run — shows tasks, waves, agents, workflow, estimated cost
/minion --dry-run tasks.md

# Combine with other flags
/minion --dry-run --workflow full-pipeline tasks.md
```

The orchestrator parses your task file, resolves dependencies, assigns agents, and displays the full plan — then stops. Use this to validate task files before committing to a run.
```

**Step 4: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: add --dry-run flag for execution plan preview"
```

---

### Task 3: Worker Health Monitoring — surface stuck/blocked in progress table

The progress table already has symbols for `!` (stuck/blocked) and `?` (needs_clarification), and Step 7 already handles these statuses. This task adds active remediation options when these statuses are detected.

**Files:**
- Modify: `commands/minion.md:576-592` (Step 7 — add remediation prompts after stuck/blocked/needs_clarification detection)

**Step 1: Add remediation for `needs_clarification` status**

In `commands/minion.md`, find the `needs_clarification` handling in Step 7 (around line 576-584). The current text ends with "Skip to the next report — do NOT proceed to phase progression". After that paragraph, add:

```markdown
   - **Remediation prompt:** After printing the progress table, use `AskUserQuestion` to present the worker's questions and offer options:
     ```
     Task {N} ({title}) needs clarification:
     {questions from the ERRORS field}

     Options:
     1. Answer questions (I'll provide context and retry this task)
     2. Skip this task (mark as skipped, continue with others)
     3. Abort the entire run
     ```
     If the user answers (option 1): store the answers as additional context. When all other tasks in the current wave complete, re-spawn this task with the original prompt plus the user's answers appended as "CLARIFICATION: {answers}". Reset its status to `in_progress`.
     If the user skips (option 2): mark the task as `skipped` via `TaskUpdate`, log `[{HH:MM:SS}] Task {N} ({title}): skipped by user`.
     If the user aborts (option 3): cancel all running workers, skip to Step 8 with current results.
```

**Step 2: Add remediation for `stuck` status**

In `commands/minion.md`, find the `stuck` handling in Step 7 (around line 585-592). The current text ends with "Skip to the next report". After that paragraph, add:

```markdown
   - **Remediation prompt:** After printing the progress table, use `AskUserQuestion` to present the stuck error and offer options:
     ```
     Task {N} ({title}) is stuck:
     {error details from the ERRORS field}

     Options:
     1. Retry with more context (I'll provide hints)
     2. Skip this task
     3. Abort the entire run
     ```
     If the user retries (option 1): ask for hints, then re-spawn the task from the failed phase with the original prompt plus "HINT FROM USER: {hints}" appended. Reset attempt counter.
     If the user skips (option 2): mark as `skipped`, log it.
     If the user aborts (option 3): cancel all running workers, skip to Step 8.
```

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add remediation prompts for stuck and unclear workers"
```

---

### Task 4: Post-Run Report — generate `.minion/report.md`

After all workers complete, generate a persistent markdown report file with run metadata, per-task results, and failure details.

**Files:**
- Modify: `commands/minion.md:718-755` (Step 8 — add report generation after summary table)

**Step 1: Add report generation to Step 8**

In `commands/minion.md`, find Step 8 (line 718). After the "Write Learnings" section (ends around line 755), add a new subsection:

```markdown
### Write Post-Run Report

After writing learnings, generate a comprehensive run report at `.minion/report.md`:

````markdown
# Minion Run Report

## Run Metadata
- **Date:** {YYYY-MM-DD HH:MM}
- **Workflow:** {workflow_name} ({phase list with arrows})
- **Duration:** {total elapsed time from first worker spawn to last report}
- **Tasks:** {total} total, {succeeded} succeeded, {failed} failed, {skipped} skipped

## Task Results

| # | Task | Status | Branch | Phases | Files Changed |
|---|------|--------|--------|--------|---------------|
| 1 | {title} | {status} | {branch} | {phases completed}/{total phases} | {count} |
| 2 | {title} | {status} | {branch} | {phases completed}/{total phases} | {count} |

## Successful Tasks

{For each successful task:}
### Task {N}: {title}
- **Branch:** `{branch-name}`
- **Files changed:** {comma-separated list}
- **Summary:** {summary from worker report}

## Failed Tasks

{For each failed task:}
### Task {N}: {title}
- **Branch:** `{branch-name}` (preserved for manual fix)
- **Phase failed:** {phase name}
- **Status:** {status}
- **Error:** {error details from worker report}

## Skipped Tasks

{For each skipped task — DONE/SKIP/user-skipped:}
- Task {N}: {title} — {reason}

## Learnings

{Copy of the learnings entry written above, or "No new learnings — all tasks succeeded cleanly."}
````

Rules:
- Overwrite any existing `.minion/report.md` — each run creates a fresh report
- If `.minion/` directory doesn't exist, this is an error (it should have been created in Step 1.3)
- The report should be self-contained — a user reading only this file should understand what happened
```

**Step 2: Update README to mention the report**

In `README.md`, find the Architecture section (around line 250). In the "Key features" subsection (line 273), add a bullet point:

```markdown
- **Post-run report** — generates `.minion/report.md` with run metadata, per-task results, failure details, and learnings
```

**Step 3: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: generate post-run report at .minion/report.md"
```

---

### Task 5: Update CHANGELOG and version

**Files:**
- Modify: `CHANGELOG.md` (add v2.0.0 entry)
- Modify: `mcp-server/package.json` (bump version to 2.0.0)

**Step 1: Add CHANGELOG entry**

In `CHANGELOG.md`, add at the top (after line 1 `# Changelog`):

```markdown

## [2.0.0] - 2026-03-08

### Added
- Cross-phase memory — blueprint reads ALL prior artifacts for full decision chain context
- `--dry-run` flag — preview execution plan (tasks, waves, agents, cost) without spawning workers
- Worker remediation prompts — interactive options when workers report `stuck`, `blocked`, or `needs_clarification`
- Post-run report — generates `.minion/report.md` with run metadata, task results, and failure details

### Changed
- Blueprint Step 2 now scans `.minion/{task_slug}/` for all artifact files, not just those listed in `PREVIOUS ARTIFACTS`
```

**Step 2: Bump version in package.json**

In `mcp-server/package.json`, change line 3:

```json
  "version": "1.9.0",
```

To:

```json
  "version": "2.0.0",
```

**Step 3: Commit**

```bash
git add CHANGELOG.md mcp-server/package.json
git commit -m "chore: bump version to v2.0.0 and update changelog"
```

---

### Task 6: Sync to ~/.claude/ and verify

**Files:**
- Copy: all modified files to `~/.claude/`

**Step 1: Sync files**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
cp skills/minion-blueprint/SKILL.md ~/.claude/skills/minion-blueprint/SKILL.md
```

**Step 2: Verify key changes**

Read `~/.claude/skills/minion-blueprint/SKILL.md` and confirm:
- Step 2 mentions reading ALL artifacts and scanning the `.minion/{task_slug}/` directory

Read `~/.claude/commands/minion.md` and confirm:
- Step 1 parses `--dry-run` flag
- Step 3 has dry-run exit logic
- Step 7 has remediation prompts for `needs_clarification` and `stuck`
- Step 8 has "Write Post-Run Report" subsection

**Step 3: No commit needed — sync step only**

---

### Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Cross-phase memory | `SKILL.md` | `feat: cross-phase memory...` |
| 2 | `--dry-run` flag | `minion.md`, `README.md` | `feat: add --dry-run flag...` |
| 3 | Worker health monitoring | `minion.md` | `feat: add remediation prompts...` |
| 4 | Post-run report | `minion.md`, `README.md` | `feat: generate post-run report...` |
| 5 | Version + changelog | `CHANGELOG.md`, `package.json` | `chore: bump version to v2.0.0...` |
| 6 | Sync + verify | Copy files | — |
