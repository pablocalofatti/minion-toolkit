# Phase D Tier 2: Medium-Effort Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add resume capability for interrupted runs, change the default workflow to TDD, and create a security review workflow template.

**Architecture:** All changes are prompt engineering in markdown files. Task 1 adds a `--resume` flag that reads existing `status.json` files. Task 2 is a one-line default change plus README update. Task 3 creates a new workflow file and optionally a security reviewer agent. No runtime code, no dependencies.

**Tech Stack:** Markdown prompt engineering (commands/minion.md, workflows/, agents/, README.md)

**Note:** Task 7 from the original task file (dependency-aware scheduling) is already implemented — `commands/minion.md` already parses `Depends:` fields (line 37), has Step 1.5 for DAG/wave computation (lines 163-175), and executes waves sequentially in Step 6 (line 414). Skipped here.

---

### Task 1: Resume interrupted runs (`/minion --resume`)

When a run is interrupted (context limit, crash, user abort), the orchestrator should resume from where it left off instead of starting over.

**Files:**
- Modify: `commands/minion.md:15-17` (Step 1 — add `--resume` flag parsing)
- Modify: `commands/minion.md:144-161` (after Step 1.3 Artifact Directory Setup — add Step 1.4 Resume Detection)
- Modify: `commands/minion.md:354-390` (Step 3 — show resume info in confirmation)
- Modify: `commands/minion.md:410-474` (Step 6 — skip completed phases on resume)
- Modify: `README.md:88-101` (Usage section — document `--resume`)

**Step 1: Add `--resume` flag parsing to Step 1**

In `commands/minion.md`, find the flag parsing section (lines 15-17). After the `--platform` flag parsing (line 16), add:

```markdown
- **Parse resume flag:** Check if `$ARGUMENTS` contains `--resume`. If present, set `resume_mode = true` and remove `--resume` from arguments. Default: `resume_mode = false`.
```

**Step 2: Add Step 1.4 — Resume Detection**

In `commands/minion.md`, after Step 1.3's "Artifact Directory Setup" section (after line 161, before Step 1.5), add a new section:

```markdown
## Step 1.4: Resume Detection

**Skip this step entirely if `resume_mode` is `false`.**

If `resume_mode` is `true`:

1. Check for `.minion/run.json` in the project root. If not found, warn: "No previous run found — starting fresh." Set `resume_mode = false` and continue normally.

2. Read `.minion/run.json` and extract the previous run's `workflow`, `tasks`, and `started_at`.

3. For each task from Step 1, check for `.minion/{task_slug}/status.json`:
   - If `status.json` exists, read it and determine the task's current state:
     - If `current_phase` is `"completed"` → mark task as `[RESUMED-DONE]` (skip entirely)
     - If `current_phase` is `"failed"` → mark task as `[RESUMED-RETRY]` (restart from the failed phase)
     - If `current_phase` is a phase name (in-progress when interrupted) → mark as `[RESUMED-CONTINUE]` (restart from this phase)
   - If `status.json` does not exist → treat as a fresh task (not started yet)

4. Print resume summary:
   ```
   Resuming run from {started_at}

   Task resume status:
   - Task 1 (Add validation): DONE — skipping
   - Task 2 (Fix pagination): RETRY from review (failed)
   - Task 3 (Add search): CONTINUE from implement (interrupted)
   - Task 4 (Add tests): NOT STARTED
   ```

5. Store the resume state for each task. Step 6 will use this to skip completed tasks and start from the correct phase.
```

**Step 3: Update Step 3 confirmation to show resume info**

In `commands/minion.md`, find Step 3 (around line 354). After the "Tasks to run" display (line 363-369), add:

```markdown
- **Resume mode:** _(only shown when `resume_mode` is `true`)_
  - Previously completed: N tasks (will be skipped)
  - Retrying from failure: N tasks
  - Continuing interrupted: N tasks
  - Fresh (not started): N tasks
```

**Step 4: Update Step 6 to handle resume**

In `commands/minion.md`, find Step 6 (line 410). After "Execute waves sequentially" (line 414), add a paragraph before the per-task spawn logic:

```markdown
**Resume handling:** When `resume_mode` is `true`, apply these rules before spawning each task:
- `[RESUMED-DONE]` tasks: Skip entirely — do not spawn a worker. Use `TaskUpdate` to mark as `completed` immediately. Log: `[{HH:MM:SS}] Task {N} ({title}): skipped (completed in previous run)`
- `[RESUMED-RETRY]` tasks: Spawn the worker starting from the **failed phase** (not the first phase). Set `PHASE` to the failed phase name. Include all `PREVIOUS ARTIFACTS` from phases that completed before the failure. The worker's existing worktree branch should still exist — reuse it.
- `[RESUMED-CONTINUE]` tasks: Same as RETRY — spawn from the interrupted phase. The in-progress phase had no result, so treat it as if it hasn't started.
- Fresh tasks (no status.json): Spawn normally from the first phase.

**Worktree reuse on resume:** When resuming, check if the task's branch (`minion/task-{N}-{slug}`) already exists locally. If yes, reuse the existing worktree instead of creating a new one. If the branch exists but the worktree directory is gone (cleaned up), recreate the worktree from the existing branch: `git worktree add {path} {branch-name}` (without `-b`).
```

**Step 5: Update README usage section**

In `README.md`, find the Usage section (around line 88). After the workflow usage examples (line 159), add:

```markdown
### Resuming Interrupted Runs

If a run is interrupted (context limit, crash, or manual abort), resume where you left off:

```bash
# Resume the last run — skips completed tasks, retries failures
/minion --resume tasks.md
```

The orchestrator reads `.minion/status.json` files from the previous run to determine which tasks completed, which failed, and which were interrupted mid-phase.
```

**Step 6: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: add --resume flag for interrupted run recovery"
```

---

### Task 2: Make TDD the default workflow

The `default` workflow (implement → review) skips planning. TDD produces better code because workers think before coding.

**Files:**
- Modify: `commands/minion.md:17` (Step 1 — change default workflow name)
- Modify: `README.md:142` (Workflow table — mark tdd as default)
- Modify: `README.md:150-158` (Workflow usage examples — update default behavior)

**Step 1: Change the default workflow in Step 1**

In `commands/minion.md`, find line 17:

```markdown
- If no `--workflow` flag, set workflow name to `default`.
```

Change to:

```markdown
- If no `--workflow` flag, set workflow name to `tdd`.
```

**Step 2: Update README workflow table**

In `README.md`, find the workflow table (line 140-146). Change:

```markdown
| `default` | implement → review | Standard development (v1 behavior) |
| `tdd` | plan → implement → review | Test-driven development |
```

To:

```markdown
| `default` | implement → review | Lightweight — skip planning, just build and review |
| `tdd` | plan → implement → review | **Default** — plan first, then TDD, then review |
```

**Step 3: Update README usage examples**

In `README.md`, find the workflow usage section (lines 148-159). Change:

```markdown
```bash
# Use TDD workflow
/minion --workflow tdd tasks.md

# Default workflow (same as v1)
/minion tasks.md

# Quick prototyping
/minion --workflow quick tasks.md
```
```

To:

```markdown
```bash
# Default: TDD workflow (plan → implement → review)
/minion tasks.md

# Lightweight: skip planning (v1 behavior)
/minion --workflow default tasks.md

# Quick prototyping (implement only, no review)
/minion --workflow quick tasks.md
```
```

**Step 4: Commit**

```bash
git add commands/minion.md README.md
git commit -m "feat: make TDD the default workflow"
```

---

### Task 3: Security review workflow

Create a workflow with a dedicated security review phase that checks for common vulnerabilities before the standard code review.

**Files:**
- Create: `workflows/secure.md`
- Create: `agents/security-reviewer.md`
- Modify: `README.md:140-146` (Workflow table — add secure workflow)

**Step 1: Create the security reviewer agent**

Create `agents/security-reviewer.md`:

```markdown
---
name: security-reviewer
description: Security-focused code reviewer — checks for injection, credential exposure, unsafe input handling, and OWASP Top 10 vulnerabilities.
model: claude-opus-4-6
---

# Security Reviewer

You are a security-focused code reviewer. Your job is to audit code changes for security vulnerabilities, not general code quality.

## What to Check

### Critical (must fix)
1. **Injection** — SQL injection, command injection, XSS, template injection
2. **Credential exposure** — hardcoded secrets, API keys, passwords in code or config
3. **Authentication bypass** — missing auth checks, broken access control
4. **Unsafe deserialization** — untrusted data deserialized without validation

### High (should fix)
5. **Missing input validation** — user input used without sanitization
6. **Path traversal** — file paths constructed from user input without normalization
7. **SSRF** — server-side requests to user-controlled URLs
8. **Sensitive data in logs** — PII, tokens, or credentials logged

### Medium (recommend)
9. **Missing rate limiting** on public endpoints
10. **Overly permissive CORS** configuration
11. **Missing security headers** (CSP, HSTS, X-Frame-Options)
12. **Weak cryptography** — MD5/SHA1 for security purposes, short keys

## Review Format

For each issue found, report:
- **Severity:** Critical / High / Medium
- **File:** exact path and line
- **Issue:** what's wrong
- **Fix:** how to fix it

If no security issues found, state: "No security vulnerabilities detected."

## What NOT to Check

Do not comment on:
- Code style or naming conventions
- Performance optimizations
- Test quality
- Architecture decisions

These are handled by the standard code review phase.
```

**Step 2: Create the secure workflow**

Create `workflows/secure.md`:

```markdown
---
name: secure
description: Security-first pipeline — plan, implement, security audit, then code review.
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
  - opencode
  - codex
---

## Phase: plan
- Prompt: "Analyze the task and create a brief implementation plan. Identify files to create/modify, approach, and test strategy. Consider security implications: {task}"
- Artifact: .minion/{task_slug}/plan.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:plan

## Phase: implement
- Prompt: "Implement the following task with TDD. Write failing tests first, then minimal implementation. Follow all project conventions from CLAUDE.md: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Agent: minion-worker
- Gate: artifact
- Command:
  - canonical: minion:implement

## Phase: security-review
- Prompt: "Perform a security audit of the implementation for task: {task}. Check for injection, credential exposure, unsafe input handling, missing validation, and OWASP Top 10 vulnerabilities. Only report security issues — skip code style and architecture feedback."
- Artifact: .minion/{task_slug}/security-review.md
- Agent: security-reviewer
- Gate: artifact
- Command:
  - canonical: minion:security-review

## Phase: review
- Prompt: "Review the implementation for quality, correctness, test coverage, and adherence to coding standards. A security review has already been completed — focus on code quality only: {task}"
- Artifact: .minion/{task_slug}/review.md
- Agent: code-quality
- Gate: artifact
- Command:
  - canonical: minion:review
```

**Step 3: Add secure workflow to README table**

In `README.md`, find the workflow table (around line 140-146). After the `ci-checked` row, add:

```markdown
| `secure` | plan → implement → security-review → review | Security audit before code review |
```

**Step 4: Commit**

```bash
git add workflows/secure.md agents/security-reviewer.md README.md
git commit -m "feat: add secure workflow with dedicated security review phase"
```

---

### Task 4: Sync to ~/.claude/ and verify

**Files:**
- Copy: all modified files to `~/.claude/`

**Step 1: Sync files**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
cp workflows/*.md ~/.claude/workflows/
cp agents/security-reviewer.md ~/.claude/agents/security-reviewer.md
```

**Step 2: Verify key changes**

Read `~/.claude/commands/minion.md` and confirm:
- Step 1 parses `--resume` flag
- Step 1.4 exists with resume detection logic
- Default workflow is `tdd` (not `default`)
- Step 3 shows resume info when applicable
- Step 6 handles `[RESUMED-DONE]`, `[RESUMED-RETRY]`, `[RESUMED-CONTINUE]`

Read `~/.claude/workflows/secure.md` and confirm:
- 4 phases: plan → implement → security-review → review
- security-review uses `security-reviewer` agent
- review uses `code-quality` agent

Read `~/.claude/agents/security-reviewer.md` and confirm:
- Focused on OWASP Top 10
- Does NOT check code style or architecture

**Step 3: No commit needed — sync step only**

---

### Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | Resume interrupted runs | `commands/minion.md`, `README.md` | `feat: add --resume flag...` |
| 2 | TDD as default workflow | `commands/minion.md`, `README.md` | `feat: make TDD the default workflow` |
| 3 | Security review workflow | `workflows/secure.md`, `agents/security-reviewer.md`, `README.md` | `feat: add secure workflow...` |
| 4 | Sync + verify | Copy files | — |

**Skipped:** Task 7 (dependency-aware scheduling) — already implemented in commands/minion.md (Step 1 parsing + Step 1.5 wave computation + Step 6 wave execution).
