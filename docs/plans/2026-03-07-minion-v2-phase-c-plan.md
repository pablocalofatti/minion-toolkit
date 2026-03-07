# Progress Output & Phase Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time progress output and phase hooks to the minion orchestrator so users see what's happening and can run shell commands at phase boundaries.

**Architecture:** Two independent features in `commands/minion.md`: (1) progress output instructions in Step 7 that print a timestamped line + summary table after each worker report, (2) `Pre-hook` and `Post-hook` parsing in Step 1.3 and execution logic in Step 7 wrapping the worker spawn/report cycle.

**Tech Stack:** Markdown prompt engineering (commands/minion.md). No runtime code — all changes are in the Claude Code command file.

---

### Task 1: Add Pre-hook and Post-hook parsing to Step 1.3

**Files:**
- Modify: `commands/minion.md:96-104`

**Step 1: Add Pre-hook and Post-hook to the Parse Template section**

In `commands/minion.md`, find the "From each `## Phase:` section" block (lines 96-104). Add two new bullet points after the `Max-cycles` line (line 104):

```markdown
- **Pre-hook** — value after `- Pre-hook:` (shell command to run before this phase starts, or `null` if not set). Template variables `{task}`, `{task_slug}`, `{task_number}`, `{phase}` are resolved before execution.
- **Post-hook** — value after `- Post-hook:` (shell command to run after this phase completes successfully, or `null` if not set). Same template variables as Pre-hook.
```

The full block (lines 96-106 after edit) should read:

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
- **Pre-hook** — value after `- Pre-hook:` (shell command to run before this phase starts, or `null` if not set). Template variables `{task}`, `{task_slug}`, `{task_number}`, `{phase}` are resolved before execution.
- **Post-hook** — value after `- Post-hook:` (shell command to run after this phase completes successfully, or `null` if not set). Same template variables as Pre-hook.
```

**Step 2: Verify the edit**

Read `commands/minion.md` lines 96-108 and confirm both new bullet points are present and properly formatted after `Max-cycles`.

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add Pre-hook and Post-hook parsing to Step 1.3"
```

---

### Task 2: Add progress output instructions to Step 7

**Files:**
- Modify: `commands/minion.md:487-489`

**Step 1: Add progress output block**

In `commands/minion.md`, find the "For each worker report:" line (line 487). Insert a new section **between** lines 487-488 (after "For each worker report:" and before "1. Parse the structured report"). The new content goes after line 487 and before the current step 1:

Replace the current line 487:
```markdown
For each worker report:
```

With:
```markdown
For each worker report:

   **Progress output** — immediately after receiving a report, print:

   a. A timestamped progress line:
   ```
   [{HH:MM:SS}] Task {N} ({title}): {phase} -> {STATUS}
   ```

   b. If spawning the next phase, print:
   ```
   [{HH:MM:SS}] Task {N} ({title}): {next_phase} -> in_progress
   ```

   c. A compact summary table showing ALL tasks and their current phase status:
   ```
   +---------------------+------+-----------+--------+-----+
   | Task                | plan | implement | review | fix |
   +---------------------+------+-----------+--------+-----+
   | 1. Add validation   |  v   |    o      |   .    |  .  |
   | 2. Fix pagination   |  o   |    .      |   .    |  .  |
   | 3. Add tests        |  o   |    .      |   .    |  .  |
   +---------------------+------+-----------+--------+-----+
   ```

   **Status symbols:** `v` = completed, `o` = in_progress, `x` = failed, `>` = skipped, `.` = pending

   The table columns are the workflow phases (from Step 1.3). For the `default` workflow, show a single `implement` column. Print this table after EVERY state change — it gives the user a real-time dashboard.
```

**Step 2: Verify the edit**

Read `commands/minion.md` lines 487-515 (approximate) and confirm:
- The "For each worker report:" line is followed by the progress output block
- The timestamped line format uses `[{HH:MM:SS}]`
- The summary table uses the correct symbols (`v`, `o`, `x`, `>`, `.`)
- The original step 1 ("Parse the structured report") follows after the progress block

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add progress output to Step 7 watch loop"
```

---

### Task 3: Add pre-hook execution to Step 7

**Files:**
- Modify: `commands/minion.md` — the phase progression section (Cases A-D, approximately lines 510-560 after Task 2's insertions)

This task adds pre-hook execution before spawning workers. The orchestrator runs the pre-hook in the task's worktree directory before spawning the phase worker.

**Step 1: Add pre-hook execution instruction**

Find the section where workers are spawned for the next phase. There are three spawn points in Step 7:

1. **Case B** (line ~525 after Task 2) — spawning fix after review_failed
2. **Case C** (line ~535 after Task 2) — spawning re-review after fix (cycle back)
3. **Case D** (line ~540 after Task 2) — spawning next phase in normal progression

Add the following instruction block **immediately before** the phase progression check (before "4. **Phase progression check:**"). This makes it a new step 3.5:

```markdown
   3.5. **Pre-hook check (before spawning next phase):**

   This step applies every time the orchestrator is about to spawn a worker for a new phase (in Cases B, C, and D below). Before calling the `Agent` tool to spawn the worker:

   - Check if the target phase has a `Pre-hook` value (from Step 1.3)
   - If yes:
     - Resolve template variables in the hook command: replace `{task}` with the task title, `{task_slug}` with the slug, `{task_number}` with N, `{phase}` with the target phase name
     - Run the resolved command using the `Bash` tool in the task's worktree directory
     - **If the command exits with code 0:** Proceed to spawn the worker as normal
     - **If the command exits with non-zero code:**
       - Log: `[{HH:MM:SS}] Task {N} ({title}): {phase} pre-hook FAILED (exit code {code})`
       - Mark the phase as `failed` in `status.json`
       - Mark all remaining phases as `skipped`
       - Use `TaskUpdate` to mark the task as `completed`
       - Do NOT spawn the worker — skip to the next report
       - Print the progress table (from step above) showing the updated state
```

**Step 2: Verify the edit**

Read the section and confirm:
- Step 3.5 appears between step 3 (status.json update) and step 4 (phase progression check)
- The pre-hook runs before worker spawn, not after
- Template variable resolution is mentioned
- Failure behavior blocks the phase and skips remaining

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add pre-hook execution to Step 7"
```

---

### Task 4: Add post-hook execution to Step 7

**Files:**
- Modify: `commands/minion.md` — Step 7, between report parsing and phase progression

**Step 1: Add post-hook execution instruction**

Find step 3 in the "For each worker report:" section (the one that updates `status.json`). Add a new step 3.25 between steps 3 and 3.5:

```markdown
   3.25. **Post-hook check (after phase completes successfully):**

   After updating `status.json` (step 3) and before the pre-hook check (step 3.5):

   - Check if the **completed** phase has a `Post-hook` value (from Step 1.3)
   - If yes AND the worker's `STATUS` was `success` (or `review_failed` for cycle target phases — post-hook only runs on `success`):
     - Resolve template variables in the hook command: replace `{task}` with the task title, `{task_slug}` with the slug, `{task_number}` with N, `{phase}` with the completed phase name
     - Run the resolved command using the `Bash` tool in the task's worktree directory
     - **If the command exits with code 0:** Continue to step 3.5 and phase progression as normal
     - **If the command exits with non-zero code:**
       - Log: `[{HH:MM:SS}] Task {N} ({title}): {phase} post-hook FAILED (exit code {code})`
       - Override the phase status to `failed` in `status.json` (even though the worker succeeded)
       - Mark all remaining phases as `skipped`
       - Use `TaskUpdate` to mark the task as `completed`
       - Do NOT proceed to the next phase — skip to the next report
       - Print the progress table showing the updated state
```

**Step 2: Verify the edit**

Read the section and confirm:
- Step 3.25 appears after step 3 (status.json update) and before step 3.5 (pre-hook check)
- Post-hook only runs when STATUS is `success` (not on failures)
- Failure overrides the phase to `failed` despite worker success
- Template variables are resolved

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add post-hook execution to Step 7"
```

---

### Task 5: Add initial phase pre-hook to Step 6

**Files:**
- Modify: `commands/minion.md` — Step 6 (worker spawn section, approximately lines 420-465)

Tasks 3 and 4 handle hooks during phase progression (Steps 3.25 and 3.5 in the watch loop). But the **first phase** of each task is spawned in Step 6, not in Step 7's progression logic. We need to add pre-hook execution there too.

**Step 1: Add pre-hook check before initial worker spawn**

Find the line in Step 6 that says "Use `TaskUpdate` to mark each spawned task as `in_progress`" (approximately line 463). Add a pre-hook check block **before** the Agent tool spawn, after the prompt template but before the actual spawn instruction:

```markdown
**Pre-hook check (first phase):**

Before spawning the worker for the first phase of each task, check if that phase has a `Pre-hook` value:
- If yes: resolve template variables and run the command using `Bash` in the project directory (worktree is not yet created for the first spawn — run in the project root)
- If the command exits non-zero: mark the task as `failed` immediately using `TaskUpdate`, log the failure with `[{HH:MM:SS}] Task {N} ({title}): {phase} pre-hook FAILED`, print the progress table, and do NOT spawn the worker. Move to the next task in the queue.
- If the command exits with code 0: proceed to spawn the worker as normal.
```

**Step 2: Verify the edit**

Read Step 6 and confirm the pre-hook check appears before the Agent tool spawn instruction.

**Step 3: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add pre-hook check to Step 6 initial spawn"
```

---

### Task 6: Sync to ~/.claude/ and verify backwards compatibility

**Files:**
- Copy: `commands/minion.md` → `~/.claude/commands/minion.md`

**Step 1: Copy updated file**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
```

**Step 2: Verify other workflows are unchanged**

Read `workflows/default.md`, `workflows/tdd.md`, `workflows/quick.md` and confirm none of them have `Pre-hook` or `Post-hook` properties. They must be identical to their pre-Phase C versions.

**Step 3: Verify parsing section includes hooks**

Read `~/.claude/commands/minion.md` lines 96-108 and confirm `Pre-hook` and `Post-hook` appear in the Parse Template section.

**Step 4: Verify Step 7 has progress output and hook execution**

Read `~/.claude/commands/minion.md` Step 7 section and confirm:
- Progress output block appears (timestamped line + summary table)
- Step 3.25 (post-hook) and step 3.5 (pre-hook) are present
- Step 6 has the initial pre-hook check

**Step 5: No commit needed — this is a sync step**

---

### Summary

| Task | What | File | Section |
|------|------|------|---------|
| 1 | Parse Pre-hook/Post-hook | `commands/minion.md` | Step 1.3 (lines 96-104) |
| 2 | Progress output | `commands/minion.md` | Step 7 (line 487) |
| 3 | Pre-hook execution | `commands/minion.md` | Step 7 (new step 3.5) |
| 4 | Post-hook execution | `commands/minion.md` | Step 7 (new step 3.25) |
| 5 | Initial phase pre-hook | `commands/minion.md` | Step 6 (line ~463) |
| 6 | Sync + verify | Copy file | — |
