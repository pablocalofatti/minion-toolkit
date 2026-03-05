# Contributing to Minion Toolkit

Thanks for your interest in contributing! This document covers the rules, setup, and workflow for getting your changes merged.

## Prerequisites

Before contributing, make sure you have:

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (never use npm or yarn in this project)
- **Git** >= 2.20
- **GitHub CLI** (`gh`) authenticated with your account

## Getting Started

```bash
# Fork and clone
gh repo fork pablocalofatti/minion-toolkit --clone
cd minion-toolkit

# Install MCP server dependencies
cd mcp-server
pnpm install

# Run the full quality check
pnpm run check
```

`pnpm run check` runs typecheck + lint + tests with coverage. This is the same check CI runs — if it passes locally, it will pass in CI.

## Development Workflow

### 1. Create a branch

Use conventional branch names:

```
feat/add-retry-logic
fix/worker-timeout-handling
chore/update-dependencies
refactor/simplify-task-parser
test/add-orchestrator-tests
docs/improve-readme
```

### 2. Make your changes

Follow the coding standards in [CLAUDE.md](CLAUDE.md). The key rules:

**TypeScript (non-negotiable):**
- No `any` — use `unknown`, generics, or proper types
- No magic numbers/strings — extract to named constants
- No non-null assertions (`!`) — handle nullability explicitly
- Prefer `const` over `let`, never use `var`
- Async/await over `.then()` chains
- Functions under 40 lines, max 3 parameters

**Testing:**
- Test behavior, not implementation
- Descriptive names: `"should return 404 when user not found"`, not `"test error"`
- Arrange-Act-Assert pattern in every test
- No test interdependence — each test runs in isolation
- Maintain 100% test coverage

**General:**
- No commented-out code — delete it, git remembers
- No `console.log` in production code
- No empty catch blocks
- Early returns with guard clauses
- Meaningful names: `getUserById` not `getData`

### 3. Validate locally

```bash
cd mcp-server

# Run the full check suite (same as CI)
pnpm run check

# Or run individually:
pnpm run typecheck    # TypeScript compilation check
pnpm run lint         # ESLint
pnpm run test:coverage # Vitest with coverage
```

All three must pass before opening a PR. CI will reject PRs that fail any of these checks.

### 4. Commit with conventional commits

Every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add worker retry mechanism
fix: handle timeout in orchestrator cleanup
chore: update vitest to v4.1
refactor: extract task parser into separate module
test: add coverage for edge cases in config loader
docs: add prerequisites section to README
```

**Scope is optional but encouraged:**

```
feat(worker): add retry on lint failure
fix(orchestrator): prevent duplicate task spawning
```

**Breaking changes** use `!` before the colon:

```
feat!: change task file format to YAML
```

These prefixes drive automated versioning:
- `feat:` → minor version bump (1.x.0)
- `fix:` → patch version bump (1.0.x)
- `feat!:` or `fix!:` → major version bump (x.0.0)

### 5. Open a pull request

```bash
git push -u origin feat/your-feature
gh pr create --base main
```

**PR title** should also follow conventional commit format (since we squash-merge).

**PR description** should include:
- What the change does and why
- How to test it
- Any trade-offs or decisions worth noting

## PR Review Process

Every PR goes through an automated pipeline before merge:

### Automated checks (required to pass)

1. **CI** — Typecheck, lint, and tests with 100% coverage
2. **PR Gate** — Verifies author trust level (see below)
3. **Code Review** — Claude reviews the diff for correctness, security, TypeScript standards, architecture, and code smells

### Code reviewer approval

The Claude code reviewer will either:
- **Approve** the PR if no issues are found
- **Post inline comments** describing issues, why they matter, and how to fix them

If issues are found, the **Auto-Fix Review** workflow will attempt to address the comments automatically. If auto-fix succeeds, CI re-runs. If it fails, you'll need to address the feedback manually.

### PR Gate: trust levels

| Author | Requirements |
|--------|-------------|
| Repository owner (`@pablocalofatti`) | CI + code review approval |
| `claude[bot]`, `github-actions[bot]` | CI + code review approval (trusted bots) |
| External contributors | CI + code review approval + **owner approval** |

External contributors need explicit approval from `@pablocalofatti` before their PR can be merged. This is enforced by the PR Gate workflow.

### Branch protection

The `main` branch is protected with:
- Required status checks: CI and PR Gate must pass
- Required reviews: at least 1 approval
- Squash merging is the default merge strategy

## What Not to Do

- **Don't modify CI config files** (`ci.yml`, `vitest.config.ts`, `eslint.config.js`, `tsconfig.json`) without discussion first
- **Don't install new dependencies** without opening an issue to discuss the need
- **Don't suppress errors** with `@ts-ignore`, `eslint-disable`, `.skip()`, or empty catch blocks
- **Don't force-push to shared branches** — force-push is only acceptable on your own feature branch
- **Don't commit secrets** — `.env` files, API keys, tokens, or credentials must never be committed

## Project Structure

```
minion-toolkit/
├── commands/
│   └── minion.md              # Orchestrator command (parses tasks, spawns workers)
├── agents/
│   └── minion-worker.md       # Worker agent (implements a single task)
├── skills/
│   └── minion-blueprint/
│       └── SKILL.md           # Blueprint pattern (Branch → Implement → Lint → Test → Commit)
├── mcp-server/                # MCP server for programmatic orchestration
│   ├── src/
│   │   ├── index.ts           # Server entry point, tool registration
│   │   ├── config.ts          # Environment config loader
│   │   ├── types.ts           # Shared type definitions
│   │   ├── tools/             # MCP tool implementations
│   │   ├── orchestrator/      # Task parsing and worker management
│   │   ├── worker/            # Worker execution logic
│   │   └── git/               # Git operations (worktree, branch, commit)
│   └── tests/                 # Test suite (100% coverage required)
├── examples/
│   └── sample-tasks.md        # Sample task file for testing
├── .github/workflows/         # CI/CD pipeline (6 workflows)
├── CLAUDE.md                  # Engineering standards (enforced by code review)
├── CHANGELOG.md               # Auto-generated changelog
└── README.md
```

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Releases are automated — when commits land on `main`, the release workflow:

1. Reads conventional commit prefixes since the last tag
2. Determines the version bump (major/minor/patch)
3. Creates a git tag and GitHub Release with auto-generated notes
4. Opens a PR to update `CHANGELOG.md` and `package.json` version

You don't need to manually bump versions or update the changelog.

## Getting Help

- Open an issue for bugs, feature requests, or questions
- Tag `@pablocalofatti` for urgent issues
- Read [CLAUDE.md](CLAUDE.md) for the full engineering standards reference
