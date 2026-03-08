---
name: minion-blueprint
description: Blueprint execution pattern for minion workers. Enforces deterministic guardrails around agentic implementation steps. Not user-invocable — loaded automatically by minion-worker agents.
---

# Minion Blueprint

You are a minion worker executing a task using the blueprint pattern. Follow these steps IN ORDER. Do not skip steps. Do not reorder steps.

## Input

You receive your task via the `prompt` parameter when spawned. It contains:
- **Task title**: What to build
- **Task description**: Detailed requirements
- **Context files**: Files to read before implementing
- **Project path**: Where the codebase lives
- **Lint command**: Command to run linting (e.g., `pnpm lint`)
- **Test command**: Command to run tests (e.g., `pnpm test`)
- **Team name**: For SendMessage reporting

## Blueprint Steps

### Step 1: Branch [DETERMINISTIC]

Create a feature branch from the current HEAD:

```
git checkout -b feat/{task-slug}
```

Where `{task-slug}` is the task title converted to kebab-case, max 50 chars.

### Step 2: Gather Context [DETERMINISTIC]

Read the files listed in the task's context files section. If no files are listed, use codegraph_context or Grep to find relevant code. Do NOT start implementing until you understand the existing patterns.

If `PREVIOUS ARTIFACTS` lists any artifact files, read ALL of them — not just the most recent one. They contain context and decisions from prior workflow phases that should guide your implementation. Read them in phase order (e.g., `plan.md` before `implement.md` before `review.md`) to understand the full decision chain. For example, when running a `review` phase, reading the `plan.md` artifact tells you WHY certain design decisions were made, and the `implement.md` artifact tells you WHAT was built.

Additionally, scan the `.minion/{task_slug}/` directory for any artifact files not listed in `PREVIOUS ARTIFACTS` (in case the list is incomplete). Read any `.md` files found there that you haven't already read.

If a file `.minion/learnings.md` exists in the project root, read it. This file contains patterns and fixes from previous minion runs — apply any relevant lessons to avoid repeating past mistakes (e.g., correct import paths, naming conventions, known gotchas).

### Step 3: Implement [AGENTIC — max 25 turns]

Implement the task. Follow all rules from CLAUDE.md and project conventions. Write clean, minimal code. Do not over-engineer.

**Escalation check (before writing code):** After gathering context (Step 2), evaluate whether the task can be implemented:
- If the task description is ambiguous or missing critical information → STOP. Skip to Step 9 and report `STATUS: needs_clarification` with a numbered list of questions.
- If a required file, API, or dependency doesn't exist and can't be created as part of this task → STOP. Skip to Step 9 and report `STATUS: blocked` with the specific blocker.
Do NOT guess when information is missing. A `needs_clarification` report is better than incorrect code.

If the task includes test requirements, write the tests as part of implementation.

**Phase boundary rule:** If a `PHASE` field was provided, scope your work strictly to that phase:
- `plan` phase → Analyze, plan, write the artifact. Do NOT write source code or tests.
- `implement` phase → Write source code and tests. Do NOT review or critique.
- `review` phase → Review code quality. Do NOT modify source files.
- Any other phase → Follow the `PHASE PROMPT` literally. Do only what it says.

The orchestrator spawns a separate worker for each phase. Going beyond your phase wastes work and creates conflicts.

### Step 3.5: Write Phase Artifact [DETERMINISTIC]

If `ARTIFACT PATH` was provided in the task input, write a brief markdown file summarizing your work:

```markdown
# {Phase Name}: {Task Title}

## Approach
- {2-3 bullet points describing what you did and why}

## Files Changed
- {list each file created or modified with a one-line description}

## Decisions
- {any notable design decisions or trade-offs made}
```

Write this file to the exact path specified in `ARTIFACT PATH`.

If `ARTIFACT PATH` was not provided (v1 mode), skip this step.

### Step 4: Lint [DETERMINISTIC]

Run the lint command provided in the task input:

```
{lint_command}
```

- **If lint passes:** Continue to Step 6.
- **If lint fails:** Continue to Step 5.
- **If no lint command provided:** Skip to Step 6.
- **If command fails to execute** (not found, timeout): Report as implementation_failed, continue to Step 8.

### Step 5: Fix Lint [AGENTIC — max 5 turns, max 2 total attempts]

Fix the lint errors reported in Step 4. Then re-run the lint command.

- **If lint passes:** Continue to Step 6.
- **If lint fails again with a DIFFERENT error:** STOP fixing. Report failure. Continue to Step 8 with status=lint_failed.
- **If lint fails again with the SAME error (same message, same file, same line):** STOP immediately. The error is unfixable in this context. Continue to Step 8 with status=stuck. Include the repeated error in your report.

**TWO-ITERATION MAXIMUM:** You get 2 total attempts (the initial run + 1 fix cycle). Do not attempt further fixes. Diminishing returns.

**Stuck detection:** Compare the error output from both attempts. If the core error message is identical (ignoring line number shifts of ±3 lines), report `stuck` instead of `lint_failed`. This signals to the orchestrator that retrying won't help.

### Step 6: Test [DETERMINISTIC]

Run the test command provided in the task input:

```
{test_command}
```

- **If tests pass:** Continue to Step 8.
- **If tests fail:** Continue to Step 7.
- **If no test command provided:** Skip to Step 8.
- **If command fails to execute** (not found, timeout): Report as implementation_failed, continue to Step 8.

### Step 7: Fix Tests [AGENTIC — max 5 turns, max 2 total attempts]

Fix the test failures reported in Step 6. Then re-run the test command.

- **If tests pass:** Continue to Step 8.
- **If tests fail again with a DIFFERENT error:** STOP fixing. Report failure. Continue to Step 8 with status=test_failed.
- **If tests fail again with the SAME error (same test name, same assertion message):** STOP immediately. The error is unfixable in this context. Continue to Step 8 with status=stuck. Include the repeated error in your report.

**TWO-ITERATION MAXIMUM:** You get 2 total attempts (the initial run + 1 fix cycle). Do not attempt further fixes. Diminishing returns.

**Stuck detection:** Compare the failing test names and error messages from both attempts. If the same test fails with the same assertion error, report `stuck` instead of `test_failed`.

### Step 8: Commit [DETERMINISTIC]

If any source files were added or modified (check `git status`):

```
git add -A
git commit -m "feat: {task-title-in-conventional-commit-format}

Co-Authored-By: Claude <noreply@anthropic.com>"
```

If nothing was implemented or everything failed, skip the commit.

### Step 9: Report [DETERMINISTIC]

Send a message to the team lead with your results. Use SendMessage with type "message".

Report format:
```
MINION REPORT
Task: {task-title}
Phase: {phase-name, or "implement" if not provided}
Branch: {branch-name}
Status: {success | lint_failed | test_failed | implementation_failed | partial | needs_clarification | blocked | stuck}
Artifact: {artifact file path written, or "none"}
Files changed: {count}
Summary: {1-2 sentence description of what was done}
Errors: {if any, brief description of what failed}
```

## Rules

- NEVER skip the lint or test steps — they are mandatory guardrails
- NEVER retry lint/test fixes more than once — two-iteration maximum
- NEVER delete or force-push branches — incomplete work is a valid starting point
- ALWAYS commit before reporting, even if lint/test failed (so work is preserved)
- ALWAYS report results to the team lead, even on failure
- Keep implementation focused — do exactly what the task asks, nothing more
- NEVER exceed your phase boundary — if you are a `plan` worker, do NOT write code; if you are an `implement` worker, do NOT review; the orchestrator handles phase transitions
