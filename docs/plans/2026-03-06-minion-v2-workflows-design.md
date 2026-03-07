# Minion v2 Design: Workflow Templates + Artifact-Based Status

**Date:** 2026-03-06
**Status:** Approved
**Phase:** A (of 3)
**Inspired by:** [agtx](https://github.com/fynnfluegge/agtx) — terminal kanban for multi-agent coding workflows

## Context

The minion toolkit today is a single-phase orchestrator: parse tasks, spawn parallel workers, collect results, create PRs, watch pipeline. Every task goes through the same flow regardless of what kind of work it is.

agtx introduced two concepts worth adopting:
1. **Declarative workflow templates** — reusable phase sequences (plan → implement → review) defined as config files
2. **Artifact-based phase gating** — each phase writes a file that signals completion and provides context to the next phase

This design adds both to the minion toolkit while keeping full backwards compatibility and making the template format platform-agnostic (Claude Code, OpenCode, Codex).

## Phase A Scope

- Workflow template format (`.md` with YAML frontmatter)
- Artifact directory and status system (`.minion/`)
- Platform detection and command translation engine
- Changes to orchestrator, worker, and blueprint
- 4 built-in workflow templates
- 6 test scenarios

Out of scope for Phase A (deferred to Phase B/C):
- Phase-level agent assignment with cyclic workflows
- TUI dashboard
- Workflow hooks

---

## 1. Workflow Template Format

### Location

- Global: `~/.claude/workflows/`
- Project-level (overrides global): `{project}/.claude/workflows/`

### File Format

Markdown with YAML frontmatter. Consistent with agents, commands, and skills in Claude Code.

```markdown
---
name: tdd
description: Test-driven development pipeline with code review
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

# TDD Workflow

## Phase: plan
- Prompt: "Analyze the task and create a brief implementation plan: {task}"
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan
  - claude-code: /superpowers:brainstorming
  - opencode: @plan
  - codex: $minion-plan

## Phase: implement
- Prompt: "Implement with TDD — write tests first, then implementation: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement
  - claude-code: /superpowers:test-driven-development

## Phase: review
- Prompt: "Review the implementation for quality, correctness, and test coverage: {task}"
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
  - claude-code: /superpowers:requesting-code-review
  - opencode: @code-reviewer
```

### Template Variables

| Variable | Replaced With |
|----------|--------------|
| `{task}` | Task title + full description |
| `{task_slug}` | Kebab-case task name (max 40 chars) |
| `{task_number}` | Task number from task file |

### Phase Properties

| Property | Required | Description |
|----------|----------|-------------|
| `Prompt` | Yes | Template string sent to the worker for this phase |
| `Artifact` | Yes | File path where the worker writes its phase summary |
| `Agent` | No | Agent to use (defaults to workflow's `default_agent`) |
| `Gate` | No | How completion is detected: `artifact` (default) or `exit` |
| `Command` | No | Canonical + platform-specific command mappings |

### Built-in Workflows

| Workflow | Phases | Use Case |
|----------|--------|----------|
| `default.md` | implement → review | Current behavior, backwards-compatible |
| `tdd.md` | plan → implement (TDD) → review | Test-driven development |
| `quick.md` | implement | Fast prototyping, no review |
| `full-pipeline.md` | plan → implement → review → fix | Enterprise with auto-fix cycle |

---

## 2. Artifact-Based Status System

### Directory Structure

```
.minion/                            # Git-ignored, project root
├── run.json                        # Overall run metadata
├── task-1-add-validation/          # Per-task directory
│   ├── status.json                 # Machine-readable task state
│   ├── plan.md                     # Phase artifact (written by worker)
│   ├── implement.md                # Phase artifact
│   └── review.md                   # Phase artifact
└── task-2-fix-pagination/
    ├── status.json
    └── implement.md
```

### status.json (per-task)

```json
{
  "task_number": 1,
  "task_title": "Add validation",
  "workflow": "tdd",
  "current_phase": "implement",
  "phases": {
    "plan": {
      "status": "completed",
      "agent": "minion-worker",
      "artifact": ".minion/task-1-add-validation/plan.md",
      "started_at": "2026-03-06T14:30:00Z",
      "completed_at": "2026-03-06T14:32:15Z"
    },
    "implement": {
      "status": "in_progress",
      "agent": "minion-worker",
      "artifact": ".minion/task-1-add-validation/implement.md",
      "started_at": "2026-03-06T14:32:16Z",
      "completed_at": null
    },
    "review": {
      "status": "pending",
      "agent": "code-quality",
      "artifact": null,
      "started_at": null,
      "completed_at": null
    }
  },
  "branch": "minion/task-1-add-validation",
  "platform": "claude-code"
}
```

### run.json (per-run)

```json
{
  "run_id": "minion-1709734200",
  "workflow": "tdd",
  "platform": "claude-code",
  "started_at": "2026-03-06T14:30:00Z",
  "tasks": [1, 2, 3],
  "waves": [[1, 2], [3]],
  "max_parallel": 3
}
```

### Phase Gating Flow

1. Worker finishes a phase -> writes the artifact file (e.g., `plan.md`)
2. Worker updates `status.json` -> marks phase `completed`, next phase `in_progress`
3. Orchestrator polls `status.json` (or receives `SendMessage`) -> detects phase transition
4. Orchestrator spawns next phase's agent (could be a different agent)

### Phase Artifact Content

Each artifact is a brief markdown summary the worker writes after completing its phase:

```markdown
# Plan: Add validation

## Approach
- Add task file schema validation using JSON parsing
- Validate workflow template structure before spawning workers

## Files to create/modify
- commands/minion.md (modify — add validation step)
- workflows/default.md (new — default workflow template)

## Test strategy
- Test with malformed task files (missing fields, bad YAML)
- Test with valid workflow + valid tasks (happy path)
```

This gives the next phase's agent context about what was decided/done.

### Backwards Compatibility

| Scenario | Behavior |
|----------|----------|
| No `--workflow` flag | Uses `default.md` workflow — identical to current v1 |
| No `.minion/` directory | Created automatically on first run |
| Worker doesn't write artifact | Falls back to SendMessage report (current behavior) |
| Platform without artifact support | Uses `Gate: exit` instead of `Gate: artifact` |

---

## 3. Platform Detection & Translation

### Detection Rules (first match wins)

1. Explicit flag: `/minion --platform opencode` -> "opencode"
2. Environment variable: `$MINION_PLATFORM` -> value
3. Directory presence:
   - Running inside Claude Code session -> "claude-code"
   - `~/.config/opencode/` exists -> "opencode"
   - `~/.codex/` exists -> "codex"
4. Fallback -> "claude-code"

### Platform Comparison

| Property | Claude Code | OpenCode | Codex |
|----------|------------|----------|-------|
| Command prefix | `/` | `/` | `$` |
| Namespace separator | `:` | `-` | `-` |
| Agent directory | `~/.claude/agents/` | `~/.config/opencode/agents/` | `.codex/skills/` |
| Agent file format | `{name}.md` | `{name}.md` | `{name}/SKILL.md` |
| Config file | `CLAUDE.md` | `opencode.json` | `AGENTS.md` |
| Worktree isolation | Yes | No | No |
| Parallel workers | Yes | No (sequential) | No (sequential) |

### Auto-Translation Rules

```
translate(canonical, platform):
  parts = canonical.split(":")

  claude-code: "/" + parts.join(":")     # minion:plan -> /minion:plan
  opencode:    "/" + parts.join("-")     # minion:plan -> /minion-plan
  codex:       "$" + parts.join("-")    # minion:plan -> $minion-plan
```

### Command Resolution Order

1. Explicit platform override in workflow template -> use it
2. Platform-specific entry under `Command:` block -> use it
3. Canonical command -> auto-translate

---

## 4. Changes to Existing Files

### New Files

| File | Purpose |
|------|---------|
| `workflows/default.md` | Default workflow (implement -> review) |
| `workflows/tdd.md` | TDD workflow (plan -> implement -> review) |
| `workflows/quick.md` | Quick workflow (implement only) |
| `workflows/full-pipeline.md` | Full pipeline (plan -> implement -> review -> fix) |
| `docs/examples/sample-workflow-tasks.md` | Example task file with --workflow usage |

### Modified: commands/minion.md

**Step 1 (Parse Tasks):** Add `--workflow {name}` flag parsing. Resolve workflow from project-level then global `workflows/` directory. Default to `default.md`.

**New Step 1.3 (Resolve Workflow):**
- Read workflow template, extract phases, per-phase config
- Detect platform, resolve commands via translation
- Validate: agents exist, no duplicate phases, at least one phase, valid artifact placeholders
- Create `.minion/` directory, add to `.gitignore`

**Step 3 (Confirm):** Show workflow name and phase sequence in confirmation display.

**Step 6 (Spawn Workers):** Add `PHASE`, `PHASE PROMPT`, `ARTIFACT PATH` fields to worker prompt.

**Step 7 (Monitor):** On worker completion:
1. Parse report including `PHASE` field
2. Update `status.json`
3. If next phase exists -> spawn next phase's agent with accumulated context
4. If no next phase -> task fully complete, proceed to PR

**Worker report format:** Add `PHASE` and `ARTIFACT` fields.

### Modified: agents/minion-worker.md

Add instruction: after completing work, write a brief markdown summary to the `ARTIFACT PATH` provided in the prompt. Update `status.json` to mark phase complete.

### Modified: skills/minion-blueprint/SKILL.md

Add **Step 2.5: Write Phase Artifact** between Implement and Lint. Worker writes artifact file summarizing what was done, approach taken, and files modified.

---

## 5. Testing Strategy

### Test 1: Workflow template parsing
Run with intentionally malformed workflow files. Expect clean error messages for: missing phases, unknown agents, missing canonical commands.

### Test 2: Default workflow backwards compatibility
Run `/minion docs/examples/sample-minion-tasks.md` without `--workflow` flag. Behavior must be identical to current v1.

### Test 3: TDD workflow end-to-end
Run `/minion --workflow tdd docs/examples/sample-workflow-tasks.md`. Verify 3-phase progression: plan -> implement -> review, with artifacts written at each phase.

### Test 4: Quick workflow (single phase)
Run `/minion --workflow quick tasks.md`. Only implement phase, PRs created directly after.

### Test 5: Platform translation validation
Verify auto-translation of canonical commands to all three platform formats. No actual cross-platform execution needed.

### Test 6: Multi-wave + multi-phase
Task with dependencies, each using multi-phase workflow. Verify waves execute sequentially and phases progress correctly within each wave.

### Sample Test File

```markdown
# Sample Tasks for Workflow Testing

Use with: `/minion --workflow tdd docs/examples/sample-workflow-tasks.md`

### Task 1: Add a greeting utility
Create `src/utils/greet.ts` with a `greet(name: string): string` function
that returns "Hello, {name}!". Add tests in `src/utils/__tests__/greet.test.ts`.

Files: src/utils/greet.ts, src/utils/__tests__/greet.test.ts

### Task 2: Add a farewell utility
Create `src/utils/farewell.ts` with a `farewell(name: string): string` function
that returns "Goodbye, {name}!". Add tests in `src/utils/__tests__/farewell.test.ts`.
Depends: Task 1

Files: src/utils/farewell.ts, src/utils/__tests__/farewell.test.ts
```

---

## 6. Future Phases

### Phase B: Phase-level agent assignment + Cyclic workflows
- Different agents per phase (already supported in template format)
- `cycles` field for iterative refinement (plan -> implement -> review -> repeat)
- Runtime cycle counter and phase reset logic

### Phase C: TUI Dashboard + Workflow hooks
- Lightweight terminal status view (kanban-style columns)
- `[hooks]` section in workflow templates for lifecycle events (start, merge, conflict)
