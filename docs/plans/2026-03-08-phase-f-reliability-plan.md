# Phase F: Reliability & Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add conflict prevention, smart context gathering, and cost tracking to minion-toolkit for improved reliability and quality visibility.

**Architecture:** All changes are prompt engineering in markdown files. Task 1 adds a new step to the orchestrator. Task 2 expands a blueprint step. Task 3 adds cost logic to orchestrator Steps 3, 7, and 8. No runtime code, no dependencies.

**Tech Stack:** Markdown prompt engineering (`commands/minion.md`, `skills/minion-blueprint/SKILL.md`, `README.md`)

---

### Task 1: Conflict Prevention — file overlap detection with smart split

Workers in the same wave that touch the same files cause merge conflicts when PRs merge sequentially. This was the #1 pain point in real runs. This change adds Step 1.6 (Conflict Analysis) after wave computation.

**Files:**
- Modify: `commands/minion.md` — add Step 1.6 between Step 1.5 (line 212) and Step 1.7 (line 214)
- Modify: `commands/minion.md:413` — add conflict warnings to Step 3 confirmation display
- Modify: `README.md:299` — add "Conflict prevention" to Key features list

**Step 1: Add Step 1.6 to commands/minion.md**

In `commands/minion.md`, find the line after Step 1.5 ends:

```
Store the computed waves, critical path, and wave count for the confirmation step.
```

After that line (line 212) and before `## Step 1.7: Discover Available Agents` (line 214), add:

```markdown

## Step 1.6: Conflict Analysis

Detect file-level overlap between tasks in the same wave to prevent merge conflicts.

1. **Build file-overlap matrix:** For each wave, compare the `Files:` field of every task pair in that wave. Two tasks overlap if they share any file path (exact match after trimming whitespace).

2. **If no tasks have `Files:` fields:** Skip conflict analysis entirely. Log: `[{HH:MM:SS}] Conflict analysis skipped — no tasks declare Files: fields`. Tasks without `Files:` fields cannot be analyzed for overlap.

3. **If overlaps found:** For each conflicting pair, log:
   ```
   [HH:MM:SS] ⚠ Conflict: Task {A} and Task {B} both modify {file1, file2, ...}
   ```
   Store the conflicts for the confirmation step (Step 3).

4. **Resolution options:** _(deferred to Step 3 confirmation — see below)_
```

**Step 2: Add conflict display + resolution to Step 3**

In `commands/minion.md`, find the Step 3 confirmation display. After the "Critical path" line (line 414) and before "Lint command" (line 415), add:

```markdown
- **Conflict warnings:** _(only shown when Step 1.6 found overlaps)_
  ```
  ⚠ File conflicts detected:
    - Task 1 (Add validation) ↔ Task 3 (Update models): src/models.ts, src/types.ts
    - Task 2 (Fix pagination) ↔ Task 4 (Add search): src/api/routes.ts
  ```
  After displaying conflicts, offer resolution options:
  1. **Auto-serialize** — inject a synthetic `Depends:` edge between the conflicting pair so they run in sequential waves. Recompute waves with the new dependency. This preserves parallelism for all non-conflicting tasks.
  2. **Proceed anyway** — user accepts merge conflict risk and will resolve manually
  3. **Abort** — stop the run so user can edit the task file

  If multiple conflicts exist, apply option 1 to all conflicting pairs (not one at a time). After auto-serializing, re-display the updated wave breakdown.

  In `--dry-run` mode, display conflict warnings but do not prompt for resolution (information only).
```

**Step 3: Add to README Key features**

In `README.md`, find the Key features list (around line 299). After the "Post-run report" line, add:

```markdown
- **Conflict prevention** — detects file overlap between parallel tasks and offers auto-serialization to prevent merge conflicts
```

**Step 4: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: add conflict prevention with file overlap detection and auto-serialize"
```

---

### Task 2: Smart Context Gathering — codegraph + grep fallback

Workers currently only read declared context files. They miss existing patterns, import paths, and related code. This change adds Step 2b to the blueprint for automated context gathering.

**Files:**
- Modify: `skills/minion-blueprint/SKILL.md:35` — expand Step 2 with a new sub-step 2b
- Modify: `README.md:299` — add "Smart context gathering" to Key features list

**Step 1: Add Step 2b to the blueprint**

In `skills/minion-blueprint/SKILL.md`, find the end of Step 2 (after the paragraph about scanning `.minion/{task_slug}/` directory, around line 39). After the learnings paragraph (line 41) and before `### Step 3: Implement` (line 43), add:

```markdown

**Step 2b: Gather related code** [DETERMINISTIC — max 5 queries]

After reading declared files and artifacts, proactively gather related code to avoid hallucinating import paths or missing existing patterns:

1. **Extract key terms** from the task description: function names, type names, module names, file paths mentioned but not in the context files list.

2. **If codegraph tools are available** (check if `codegraph_search` tool exists):
   - Use `codegraph_search` for each key term (up to 3 queries)
   - Use `codegraph_context` with the task description (1 query)
   - Read the source of any highly relevant results with `codegraph_node`
   - Priority: semantic search finds related code even with different naming

3. **If codegraph is NOT available:**
   - Use `Grep` to search for key terms in the project (up to 5 queries)
   - Focus on: import/export statements, type definitions, function signatures
   - Limit search scope to `src/`, `lib/`, `app/` directories to avoid noise

4. **Cap:** Maximum 5 total queries across codegraph and grep combined. Do not rabbit-hole. The goal is to understand existing patterns, not to map the entire codebase.

5. **What to look for:**
   - Existing functions/types you might reuse (don't reinvent)
   - Import paths and module structure (use correct paths)
   - Naming conventions (match existing style)
   - Test patterns (if writing tests, match existing test style)
```

**Step 2: Add to README Key features**

In `README.md`, after the "Conflict prevention" line added in Task 1, add:

```markdown
- **Smart context gathering** — workers auto-discover related code via codegraph or grep before implementing (max 5 queries)
```

**Step 3: Commit**

```bash
git add skills/minion-blueprint/SKILL.md README.md
git commit -m "feat: add smart context gathering with codegraph and grep fallback"
```

---

### Task 3: Cost Tracking — pre-estimate and post-actual

No visibility into run costs. This adds a heuristic cost estimate to Step 3 (pre-run) and approximate actual cost to Step 7 monitoring and the post-run report.

**Files:**
- Modify: `commands/minion.md:417` — add cost estimate to Step 3 confirmation display
- Modify: `commands/minion.md:720-742` — add iteration tracking to status.json schema
- Modify: `commands/minion.md:792-838` — add Cost Summary section to post-run report template
- Modify: `README.md:299` — add "Cost tracking" to Key features list

**Step 1: Add cost estimate to Step 3 confirmation**

In `commands/minion.md`, find the Step 3 confirmation display. After "Max parallel workers" (line 417) and before "Bootstrap" (line 418), add:

```markdown
- **Estimated cost:** Compute a rough cost estimate using this heuristic:
  - Per task: `phases × avg_iterations_per_phase × avg_tokens_per_iteration × model_rate`
  - Defaults: `avg_iterations_per_phase = 8`, `avg_tokens_per_iteration = 4000`, `model_rate = $3/$15 per 1M input/output tokens` (Sonnet pricing)
  - Total: sum across all tasks
  - Display as: `Estimated cost: ~${total} (based on {task_count} tasks × {phase_count} phases at Sonnet rates)`
  - This is a rough heuristic — actual cost depends on task complexity, fix cycles, and model used
```

**Step 2: Add iteration tracking to status.json**

In `commands/minion.md`, find the `status.json` schema (around line 724). Inside the phase object (after `"completed_at"`), add a new field:

```json
      "iterations": "{integer, number of agent turns/messages in this phase, default 0}"
```

And add an instruction after the schema:

```markdown
When updating a phase to `completed`, set `iterations` to the approximate number of agent turns consumed during that phase. This is used for post-run cost estimation. If the exact count is not available, estimate based on the worker's report (e.g., a `success` with no lint/test fixes ≈ 10 iterations, with 1 fix cycle ≈ 15, with 2 fix cycles ≈ 20).
```

**Step 3: Add Cost Summary to post-run report**

In `commands/minion.md`, find the post-run report template. After the `## Learnings` section (line 832) and before the closing ``````, add:

```markdown

## Cost Summary
- **Model:** Sonnet (default) — adjust rates if workers used a different model
- **Rate:** $3/1M input tokens, $15/1M output tokens

| # | Task | Phases | Iterations | Est. Tokens | Est. Cost |
|---|------|--------|------------|-------------|-----------|
| 1 | {title} | {completed}/{total} | {sum of iterations across phases} | {iterations × 4000} | ~${cost} |
| 2 | {title} | {completed}/{total} | {sum of iterations across phases} | {iterations × 4000} | ~${cost} |
| **Total** | | | {total_iterations} | {total_tokens} | **~${total_cost}** |

_Cost estimates are approximate. Actual costs depend on prompt length, response length, and model used. Token estimate uses 4000 tokens/iteration average._
```

**Step 4: Add to README Key features**

In `README.md`, after the "Smart context gathering" line added in Task 2, add:

```markdown
- **Cost tracking** — pre-run cost estimates and post-run approximate cost per task in the report
```

**Step 5: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: add cost tracking with pre-run estimates and post-run actuals"
```

---

### Task 4: Update CHANGELOG and version

**Files:**
- Modify: `CHANGELOG.md` — add v2.1.0 entry
- Modify: `mcp-server/package.json` — bump version to 2.1.0

**Step 1: Add CHANGELOG entry**

In `CHANGELOG.md`, add at the top (after line 1 `# Changelog`):

```markdown

## [2.1.0] - 2026-03-08

### Added
- Conflict prevention — file overlap detection between parallel tasks with auto-serialize option
- Smart context gathering — workers auto-discover related code via codegraph or grep before implementing
- Cost tracking — pre-run cost estimates and post-run approximate cost per task in report

### Changed
- Blueprint Step 2 now includes Step 2b for automated context gathering (max 5 queries)
- Status.json schema expanded with `iterations` field for cost tracking
```

**Step 2: Bump version in package.json**

In `mcp-server/package.json`, change:

```json
  "version": "2.0.0",
```

To:

```json
  "version": "2.1.0",
```

**Step 3: Commit**

```bash
git add CHANGELOG.md mcp-server/package.json
git commit -m "chore: bump version to v2.1.0 and update changelog"
```

---

### Task 5: Sync to ~/.claude/ and verify

**Files:**
- Copy: all modified files to `~/.claude/`

**Step 1: Sync files**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
cp skills/minion-blueprint/SKILL.md ~/.claude/skills/minion-blueprint/SKILL.md
```

**Step 2: Verify key changes**

Read `~/.claude/commands/minion.md` and confirm:
- Step 1.6 exists with "Conflict Analysis" heading
- Step 3 has "Conflict warnings" and resolution options
- Step 3 has "Estimated cost" line
- Post-run report has "Cost Summary" section

Read `~/.claude/skills/minion-blueprint/SKILL.md` and confirm:
- Step 2b exists with "Gather related code" heading
- Max 5 queries cap is mentioned

**Step 3: No commit needed — sync step only**

---

### Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Conflict prevention | `minion.md`, `README.md` | `feat: add conflict prevention...` |
| 2 | Smart context gathering | `SKILL.md`, `README.md` | `feat: add smart context gathering...` |
| 3 | Cost tracking | `minion.md`, `README.md` | `feat: add cost tracking...` |
| 4 | Version + changelog | `CHANGELOG.md`, `package.json` | `chore: bump version to v2.1.0...` |
| 5 | Sync + verify | Copy files | — |
