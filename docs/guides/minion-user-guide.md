# Minion Orchestrator User Guide

The `/minion` command parallelizes coding tasks by spawning worker agents in isolated git worktrees. Each worker implements one task on its own branch, following a strict lint-test-commit cycle. The orchestrator coordinates everything: parsing tasks, spawning workers, creating PRs, and monitoring the CI pipeline.

## Quick Start

1. Write a tasks file (e.g., `tasks.md`):

   ```markdown
   ### Task 1: Add user validation
   Validate user input before saving to database.
   **Files:** src/users/users.service.ts, src/users/users.dto.ts

   ### Task 2: Build user profile page
   Create a React component for displaying user profiles.
   **Files:** src/components/UserProfile.tsx
   ```

2. Run the command:

   ```
   /minion tasks.md
   ```

3. Review the confirmation summary and approve.

4. Workers execute in parallel. The orchestrator creates PRs, monitors CI, and spawns fix workers if issues are found.

## Task File Format

Each task is a markdown section with a `### Task N:` heading:

```markdown
### Task 1: Short descriptive title
Description of what to implement. Can span multiple lines.
**Files:** src/path/to/file.ts, src/path/to/other.ts
**Depends:** Task 2
**Agent:** my-backend-agent
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| Title | Yes | Text after `### Task N:` — describes what to build |
| Description | Yes | Everything under the heading until the next task |
| **Files:** | Recommended | Comma-separated file paths the task will touch |
| **Depends:** | Optional | Task numbers this task depends on (e.g., `Task 1, Task 3`) |
| **Agent:** | Optional | Which agent to use for this task (must match an installed agent's `name`) |
| `[DONE]` / `[SKIP]` | Optional | Marker in the heading to skip the task |

### Dependencies and Waves

Tasks with dependencies execute in waves. Independent tasks run in parallel:

```markdown
### Task 1: Set up database schema
**Files:** src/db/schema.ts

### Task 2: Create API endpoints
**Depends:** Task 1
**Files:** src/api/routes.ts

### Task 3: Build frontend components
**Files:** src/components/Dashboard.tsx
```

This produces:
- **Wave 1:** Task 1 and Task 3 (parallel — no dependency between them)
- **Wave 2:** Task 2 (waits for Task 1)

## Team-Aware Agent Assignment

The orchestrator can assign specialized agents to tasks instead of using the generic `minion-worker`. This means a frontend specialist handles React tasks while a backend specialist handles API tasks.

### How It Works

1. **Discovery** — The orchestrator scans for agent definitions in:
   - `{project}/.claude/agents/*.md` (project-level, higher priority)
   - `~/.claude/agents/*.md` (global)

2. **Assignment** — Each task gets an agent via one of three methods:
   - **Explicit:** Add `**Agent:** my-backend-agent` in the task definition
   - **Auto-detected:** Based on file extensions, paths, and description keywords
   - **Fallback:** `minion-worker` if no match is found

3. **Confirmation** — The orchestrator shows resolved assignments before spawning:
   ```
   Available agents: my-backend-agent (sonnet), my-frontend-agent (sonnet)

   1. Add validation endpoint       -> my-backend-agent
   2. Build profile component        -> my-frontend-agent (auto-detected)
   3. Update config files            -> minion-worker (default)
   ```
   You can reassign agents in the "Adjust" step before approving.

### Auto-Detection Rules

When no `Agent:` field is specified, the orchestrator matches tasks to agents by checking file extensions, paths, and description keywords against each agent's `description` field:

| Signal | Looks for agent with... |
|--------|------------------------|
| `.tsx`, `.jsx`, `.css` files | "frontend" or "React" or "Next.js" in description |
| `.service.ts`, `.controller.ts`, `.dto.ts` files | "backend" or "NestJS" or "API" in description |
| Files under `components/`, `pages/`, `hooks/` | "frontend" or "React" in description |
| Files under `services/`, `controllers/`, `migrations/` | "backend" or "NestJS" in description |
| Keywords in task: "component", "UI", "form", "widget" | "frontend" or "React" in description |
| Keywords in task: "endpoint", "API", "database", "migration" | "backend" or "NestJS" in description |
| No match | Uses `minion-worker` (generic) |

### No Agents? No Problem

If you have no custom agents defined (or only `minion-worker`), the command works exactly as before — all tasks use `minion-worker`. Zero configuration required.

### Creating Your Own Agents

Add a `.md` file to `~/.claude/agents/` or `{project}/.claude/agents/`:

```markdown
---
name: my-backend-agent
description: Use for backend tasks with NestJS, TypeORM, and PostgreSQL. Specializes in API design and service architecture.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

# My Backend Agent

Instructions for the agent — what it knows, how it should review code, patterns to follow...
```

The `description` field is what auto-detection uses for keyword matching. Be descriptive about the domain, frameworks, and file types this agent handles. The `name` field is what you reference in `**Agent:** my-backend-agent` in task files.

### Fix Workers Use the Same Agent

When the pipeline watch loop detects CI failures or review comments on a PR, it spawns a fix worker using the **same agent** that built the original code. A backend specialist fixes backend CI failures; a frontend specialist fixes frontend review comments.

## Pipeline Lifecycle

```
/minion tasks.md
    |
    v
Parse tasks -> Discover agents -> Detect commands -> Confirm
    |
    v
Spawn workers (parallel, in worktrees)
    |
    v
Collect results -> Create PRs -> Enable auto-merge
    |
    v
Watch pipeline (CI + code review)
    |                |
    v                v
  Pass -> Merge    Fail -> Spawn fix worker (same agent)
                           |
                           v
                         Re-watch (max 2 fix cycles)
```

## Options

During the confirmation step, you can adjust:

- **Max parallel workers** — 1 to 5 (default: min of task count and 3)
- **Lint command** — override auto-detected command
- **Test command** — override auto-detected command
- **Remove tasks** — exclude specific tasks from the run
- **Reassign agents** — change which agent handles specific tasks

## Tips

- **Start small** — try 2-3 tasks first to validate your setup
- **Define interface contracts** — for parallel tasks that produce files used by other tasks, describe the expected interfaces in the task description
- **Use dependencies** — if Task 2 needs Task 1's output, declare `**Depends:** Task 1`
- **Explicit agents for critical tasks** — use auto-detection for obvious cases, but set `**Agent:**` explicitly when domain expertise matters most
- **Check the confirmation** — always review agent assignments before approving
- **Agent descriptions matter** — the more descriptive your agent's `description` field, the better auto-detection works
