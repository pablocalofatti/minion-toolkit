# Minion Toolkit

Parallel task orchestrator for Claude Code. Break your work into tasks, and Minion spawns isolated worker agents that build them concurrently in separate git worktrees — then reports results for review and merge.

## Installation

**Local testing:**
```bash
claude --plugin-dir ~/Desktop/side-proyects/minion-toolkit
```

**From a marketplace:**
```bash
# Add the marketplace (once)
/plugin marketplace add your-org/minion-toolkit

# Install the plugin
/plugin install minion-toolkit@minion-toolkit
```

## Usage

```
/minion-toolkit:minion tasks.md
```

The orchestrator will:
1. Parse your task file for actionable tasks
2. Auto-detect lint/test commands from `package.json`
3. Present a summary for your confirmation
4. Spawn parallel workers (up to 3 by default)
5. Each worker: branch → implement → lint → test → commit → report
6. Present a results table with branch names
7. Offer next actions: create PRs, review branches, retry failures, or finish

## Task File Format

```markdown
### Task 1: Add user validation
Implement email and password validation in the signup form.
Files: src/auth/validation.ts, src/auth/__tests__/validation.test.ts

### Task 2: Fix pagination bug
The pagination component skips page 2 when navigating forward.
Files: src/components/Pagination.tsx

### Task 3: Already done [DONE]
This task is skipped automatically.
```

Each task needs:
- A heading: `### Task N: Title`
- A description (one or more lines)
- Optional `Files:` line listing relevant source files

Tasks marked `[DONE]` or `[SKIP]` in the heading are ignored.

## Architecture

The plugin is a 3-file system:

```
/minion-toolkit:minion  (orchestrator command)
        │
        ├── Parses tasks, detects commands, creates team
        ├── Spawns N workers in parallel (isolated worktrees)
        └── Collects results, presents summary, offers next actions
              │
              ▼
      minion-worker  (agent, one per task)
        │
        └── Follows minion-blueprint skill steps:
              Branch → Context → Implement → Lint → Fix → Test → Fix → Commit → Report
```

| Component | Role |
|-----------|------|
| `commands/minion.md` | Orchestrator — parses tasks, manages workers, presents results |
| `agents/minion-worker.md` | Worker — implements a single task in an isolated worktree |
| `skills/minion-blueprint/SKILL.md` | Blueprint — deterministic step sequence with lint/test guardrails |

## Key Features

- **Parallel execution** — up to 5 concurrent workers (default: 3)
- **Worktree isolation** — each worker gets its own branch, no conflicts
- **Lint/test guardrails** — workers auto-run lint and tests with a 2-attempt fix limit
- **Auto-detection** — reads `package.json` to find lint/test/package-manager commands
- **Failure handling** — partial work is preserved on branches for manual pickup
- **PR creation** — one-click PR creation for successful branches via `gh`

## Examples

See `examples/sample-tasks.md` for a ready-to-use test file.

## License

MIT
