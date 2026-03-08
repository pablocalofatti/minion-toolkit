# Minion Toolkit

Parallel task orchestrator for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Break your work into tasks, and Minion spawns isolated worker agents that build them concurrently in separate git worktrees — then reports results for review and merge.

## Use Cases

**Multi-file feature implementation** — You have a feature spec with 3-5 independent tasks (new API endpoint, UI component, database migration, tests). Instead of implementing them sequentially, Minion runs them all in parallel and delivers separate branches ready for review.

**Codebase scaffolding** — Starting a new project or module? Define the files you need (router, service, repository, tests) as separate tasks. Minion generates them concurrently with consistent patterns.

**Bug batch fixing** — You've triaged 4 independent bugs from your issue tracker. Write them as tasks, and Minion fixes them in parallel on separate branches — each with its own PR.

**Refactoring campaigns** — Need to apply the same pattern across multiple modules (add error handling, migrate to a new API, update imports)? Each module becomes a task, and workers apply the changes in isolation.

**Test suite expansion** — You have 5 modules that need unit tests. Each module is a task. Workers write tests in parallel, each respecting existing patterns from CLAUDE.md.

## Prerequisites

| Requirement | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org/) | >= 20.0.0 | Runtime for the MCP server |
| [pnpm](https://pnpm.io/) | >= 9.0.0 | Package manager (used internally) |
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | Latest | The AI coding assistant that runs Minion |
| [Git](https://git-scm.com/) | >= 2.20 | Worktree isolation requires modern git |
| [GitHub CLI (`gh`)](https://cli.github.com/) | >= 2.0 | Optional — needed for PR creation feature |
| Anthropic API key | — | Set as `ANTHROPIC_API_KEY` env var |

**Quick check:**

```bash
node -v          # v20+ required
pnpm -v          # v9+ required
claude --version # Claude Code CLI installed
git --version    # v2.20+ for worktree support
gh auth status   # Optional: GitHub CLI authenticated
```

## Installation

### As a Claude Code plugin (recommended)

```bash
# Clone the repo
git clone https://github.com/pablocalofatti/minion-toolkit.git

# Load it as a local plugin
claude --plugin-dir /path/to/minion-toolkit
```

### MCP server setup

The toolkit includes an MCP server for programmatic orchestration via the [Model Context Protocol](https://modelcontextprotocol.io/).

```bash
cd minion-toolkit/mcp-server
pnpm install
pnpm run build
```

Add to your Claude Code MCP config (`~/.claude/mcp_servers.json`):

```json
{
  "minion-toolkit": {
    "command": "node",
    "args": ["/path/to/minion-toolkit/mcp-server/dist/index.js"],
    "env": {
      "ANTHROPIC_API_KEY": "your-key-here"
    }
  }
}
```

### Verify installation

```bash
# Start Claude Code with the plugin
claude --plugin-dir /path/to/minion-toolkit

# Run the minion command
/minion-toolkit:minion examples/sample-tasks.md
```

You should see the orchestrator parse 2 tasks, detect lint/test commands, and ask for confirmation before spawning workers.

## Usage

```
/minion-toolkit:minion <path-to-tasks-file>
```

The orchestrator will:

1. Parse your task file for actionable tasks
2. Auto-detect lint/test commands from `package.json`
3. Present a summary for your confirmation
4. Spawn parallel workers (up to 3 by default, max 5)
5. Each worker: branch → implement → lint → test → commit → report
6. Present a results table with branch names and status
7. Offer next actions: create PRs, review branches, retry failures, or finish

### Task file format

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

### Example output

```
| Task                  | Status  | Branch                          | Files |
|-----------------------|---------|---------------------------------|-------|
| Add user validation   | success | minion/task-1-add-user-valid... | 3     |
| Fix pagination bug    | success | minion/task-2-fix-pagination... | 1     |

Successful: 2/2
Branches ready for review: minion/task-1-..., minion/task-2-...
```

## Workflows

Workflows define the phase sequence for task execution. Use `--workflow` to select one:

| Workflow | Phases | Use Case |
|----------|--------|----------|
| `default` | implement → review | Lightweight — skip planning, just build and review |
| `tdd` | plan → implement → review | **Default** — plan first, then TDD, then review |
| `quick` | implement | Fast prototyping, no review |
| `full-pipeline` | plan → implement → review ⇄ fix | Maximum quality with review-fix cycle (up to 3 iterations) |
| `ci-checked` | implement → review | With CI hooks: tests after implement, lint before review |
| `secure` | plan → implement → security-review → review | Security audit before code review |

### Workflow Usage

```bash
# Default: TDD workflow (plan → implement → review)
/minion tasks.md

# Lightweight: skip planning (v1 behavior)
/minion --workflow default tasks.md

# Quick prototyping (implement only, no review)
/minion --workflow quick tasks.md
```

### Resuming Interrupted Runs

If a run is interrupted (context limit, crash, or manual abort), resume where you left off:

```bash
# Resume the last run — skips completed tasks, retries failures
/minion --resume tasks.md
```

The orchestrator reads `.minion/status.json` files from the previous run to determine which tasks completed, which failed, and which were interrupted mid-phase.

### Previewing a Run

Preview the execution plan without spawning workers:

```bash
# Dry run — shows tasks, waves, agents, workflow, estimated cost
/minion --dry-run tasks.md

# Combine with other flags
/minion --dry-run --workflow full-pipeline tasks.md
```

The orchestrator parses your task file, resolves dependencies, assigns agents, and displays the full plan — then stops. Use this to validate task files before committing to a run.

### Custom Workflows

Create `.md` files in `~/.claude/workflows/` or `{project}/.claude/workflows/`:

```markdown
---
name: my-workflow
description: My custom workflow
version: 1.0
default_agent: minion-worker
platforms:
  - claude-code
---

## Phase: plan
- Prompt: "Plan: {task}"
- Artifact: .minion/{task_slug}/plan.md
- Gate: artifact
- Command:
  - canonical: minion:plan

## Phase: implement
- Prompt: "Implement: {task}"
- Artifact: .minion/{task_slug}/implement.md
- Gate: artifact
- Command:
  - canonical: minion:implement
```

### Cyclic Workflows

The `full-pipeline` workflow includes a review-fix cycle: if review finds issues, fix runs and loops back to re-review (up to 3 iterations). Add cycles to custom workflows with `Cycle` and `Max-cycles`:

```markdown
## Phase: fix
- Prompt: "Address review feedback: {task}"
- Artifact: .minion/{task_slug}/fix.md
- Gate: artifact
- Cycle: review
- Max-cycles: 3
- Command:
  - canonical: minion:fix
```

### Phase Hooks

Run shell commands before or after any phase. Hooks block on failure (non-zero exit = phase fails):

```markdown
## Phase: review
- Prompt: "Review the implementation: {task}"
- Artifact: .minion/{task_slug}/review.md
- Pre-hook: pnpm lint --quiet
- Post-hook: echo "Review complete for {task_slug}"
- Command:
  - canonical: minion:review
```

Template variables available: `{task}`, `{task_slug}`, `{task_number}`, `{phase}`. For fire-and-forget hooks, append `|| true`.

### Cross-Platform Support

Workflow templates support Claude Code, OpenCode, and Codex. Commands use a canonical format that auto-translates per platform:

| Canonical | Claude Code | OpenCode | Codex |
|-----------|------------|----------|-------|
| `minion:plan` | `/minion:plan` | `/minion-plan` | `$minion-plan` |

Add platform-specific overrides when needed:

```markdown
- Command:
  - canonical: minion:plan
  - claude-code: /superpowers:brainstorming
  - opencode: @plan
```

## Architecture

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

| Component | File | Role |
|-----------|------|------|
| Orchestrator | `commands/minion.md` | Parses tasks, manages workers, presents results |
| Worker | `agents/minion-worker.md` | Implements a single task in an isolated worktree |
| Blueprint | `skills/minion-blueprint/SKILL.md` | Deterministic step sequence with lint/test guardrails |
| MCP Server | `mcp-server/` | Programmatic orchestration via Model Context Protocol |

### Key features

- **Parallel execution** — up to 5 concurrent workers (default: 3)
- **Worktree isolation** — each worker gets its own branch, no conflicts
- **Lint/test guardrails** — workers auto-run lint and tests with a 2-attempt fix limit
- **Auto-detection** — reads `package.json` to find lint/test/package-manager commands
- **Failure handling** — partial work is preserved on branches for manual pickup
- **PR creation** — one-click PR creation for successful branches via `gh`
- **Structured reporting** — workers report status, files changed, and errors in a parseable format
- **Real-time progress** — live dashboard with timestamped updates and summary table during execution
- **Phase hooks** — run shell commands before/after any workflow phase (lint, notify, validate)
- **Cyclic workflows** — review-fix loops with configurable iteration limits
- **Post-run report** — generates `.minion/report.md` with run metadata, per-task results, failure details, and learnings
- **Conflict prevention** — detects file overlap between parallel tasks and offers auto-serialization to prevent merge conflicts
- **Smart context gathering** — workers auto-discover related code via codegraph or grep before implementing (max 5 queries)
- **Cost tracking** — pre-run cost estimates and post-run approximate cost per task in the report

## CI/CD Pipeline

This repository includes a fully automated CI/CD pipeline:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **CI** | Push to main, PRs | Typecheck + lint + test with 100% coverage |
| **Code Review** | PRs opened/updated | Claude reviews changed files, approves or posts inline comments |
| **Auto-Fix CI** | CI failure on PR | Claude reads error logs, fixes code, commits, pushes |
| **Auto-Fix Review** | Review comments on PR | Claude addresses review feedback, replies, pushes |
| **PR Gate** | PRs opened/updated | Auto-passes for trusted authors; external PRs need owner approval |
| **Release** | Push to main | Auto-bumps version (semver), creates GitHub Release + changelog PR |

## Examples

See [`examples/sample-tasks.md`](examples/sample-tasks.md) for a ready-to-use test file.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and the PR process.

## License

MIT
