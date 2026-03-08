# Minion Toolkit v2 Evolution — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plans from this design.

**Goal:** Evolve minion-toolkit from v1.9 to v2.x with 9 improvements across 3 phases — quick wins, reliability/quality, and platform distribution.

**Current State:** v1.9.0 with workflow templates, cyclic workflows, progress output, phase hooks, resume capability, security workflow. Zero-code prompt engineering architecture + TypeScript MCP server with 100% test coverage.

---

## Overview

9 improvements grouped into 3 phases (Approach A — quick wins first):

| Phase | Items | Focus |
|-------|-------|-------|
| **E** | Cross-phase memory, `--dry-run`, health monitoring, post-run report | Quick wins (low effort, immediate value) |
| **F** | Conflict prevention, smart context gathering, cost tracking | Reliability & quality (medium effort) |
| **G** | MCP unification, npm package + CLI installer | Platform (high effort, ecosystem growth) |

All 9 items will be implemented — phases are execution order, not stopping points.

---

## Decisions Made

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | MCP unification approach | Keep both, optional delegation | Orchestrator calls MCP tools when available, falls back to prose. No risky rewrite. |
| 2 | Conflict prevention behavior | Smart split | Warn on overlap, offer to serialize just the conflicting pair. Preserves max parallelism. |
| 3 | npm package name | `minion-toolkit` | Matches GitHub repo, no org overhead. |
| 4 | Cross-phase memory | Use existing artifacts | Blueprint reads ALL prior artifacts, not just the latest. Zero new files. |
| 5 | Smart context gathering | Codegraph → grep fallback | Try codegraph first (semantic), fall back to grep. Max 5 queries. |
| 6 | Worker health monitoring | Iteration-based | Surface existing stuck/blocked statuses. No time-based monitoring (false positives). |
| 7 | Post-run report | `.minion/report.md` | Persistent markdown artifact. Fits existing artifact pattern. |
| 8 | Cost tracking | Pre-estimate + post-actual | Show in confirmation (Step 3) and post-run report. |
| 9 | CLI installer scope | Batteries-included | Auto-installs essential plugins, offers recommended, generates agents from project structure. |

### Cut Items (YAGNI)

- **Task Templates** — Workflows + agents + task descriptions cover the need. Templates add a confusing third axis.
- **Multi-Repo Support** — Run `/minion` separately per repo. Cross-repo coordination doesn't fit worktree model.
- **Plugin System** — Workflows + agents + hooks already provide sufficient extensibility.

---

## Phase E: Quick Wins

### E1: Cross-Phase Memory

**Problem:** Workers forget context between phases. Review phase doesn't know why plan phase made certain decisions.

**Solution:** Modify `skills/minion-blueprint/SKILL.md` Step 2 (Context) to explicitly read ALL artifacts in `.minion/{task_slug}/` — not just the immediately prior phase.

**Files:** `skills/minion-blueprint/SKILL.md` (~5 lines changed)

**Behavior:**
- If review phase runs, it sees both `plan.md` and `implement.md`
- If fix phase runs, it sees `plan.md`, `implement.md`, and `review.md`
- Workers understand the full decision chain across all prior phases

---

### E2: `--dry-run` Flag

**Problem:** No way to preview what `/minion` will do without actually spawning workers.

**Solution:** Add `--dry-run` flag to `commands/minion.md`. When present, orchestrator runs Steps 1–3 (parse, resolve, confirm) then prints the full execution plan and stops.

**Files:** `commands/minion.md` (~15 lines added)

**Output includes:**
- Task list with descriptions
- Wave breakdown (which tasks run in parallel)
- Agent assignments per task
- Workflow phases to execute
- Estimated cost (if available)
- Conflict warnings (once F1 is implemented)

---

### E3: Worker Health Monitoring

**Problem:** When workers get stuck, the progress dashboard shows `●` (in-progress) with no distinction from healthy work.

**Solution:** Surface the blueprint's existing stuck/blocked/needs_clarification statuses in the progress table with distinct symbols.

**Files:** `commands/minion.md` (~20 lines added)

**Progress table symbols:**
```
✓  = completed
●  = in progress (healthy)
⚠  = stuck (same error after 2 fix attempts)
?  = needs_clarification (task ambiguous)
✗  = blocked (external dependency missing)
.  = not started
```

**Remediation:** When a worker reports `stuck` or `needs_clarification`, the orchestrator logs the details and offers:
- (a) Retry with more context
- (b) Skip task
- (c) Abort run

---

### E4: Post-Run Report

**Problem:** After a run, results are only in terminal output. No persistent artifact for review or sharing.

**Solution:** Generate `.minion/report.md` after collecting all results in Step 7.

**Files:** `commands/minion.md` (~30 lines added)

**Report contents:**
- Run metadata (workflow, started/finished, duration)
- Per-task summary (status, phase reached, files changed, branch name)
- Learnings captured during run
- Cost estimate vs actual (placeholder until F3 adds real tracking)
- Failed tasks with error details

---

## Phase F: Reliability & Quality

### F1: Conflict Prevention

**Problem:** When two parallel tasks touch the same files, PRs conflict after the first one merges. This was the #1 pain point in real runs.

**Solution:** Add Step 1.6 (Conflict Analysis) after wave computation. Analyze `Files:` fields for overlap between tasks in the same wave.

**Files:** `commands/minion.md` (~40 lines added)

**Behavior:**
1. Build file-overlap matrix from task `Files:` fields
2. If two tasks in the same wave share files, warn with details
3. Offer three options:
   - **Auto-serialize** — inject synthetic `Depends:` edge, recompute waves
   - **Proceed anyway** — user accepts merge conflict risk
   - **Abort** — fix task file first
4. Tasks without `Files:` field are skipped (can't predict scope)
5. In `--dry-run` mode, just show conflicts without prompting

---

### F2: Smart Context Gathering

**Problem:** Workers get task descriptions but no codebase context. They hallucinate import paths, miss existing patterns, and duplicate code.

**Solution:** Expand blueprint Step 2 (Context) into two sub-steps.

**Files:** `skills/minion-blueprint/SKILL.md` (~15 lines added)

**Step 2a: Read context files** (existing behavior)
- Read declared files, prior artifacts, `learnings.md`

**Step 2b: Gather related code** (new)
- If codegraph tools available: query `codegraph_context` and `codegraph_search` for symbols mentioned in task description
- If codegraph not available: use `grep` to search for key terms (function names, types, imports)
- Cap at 5 queries max — prevents rabbit-holing
- Priority: codegraph (semantic, instant) → grep (text-based, broader)

---

### F3: Cost Tracking

**Problem:** No visibility into how much a run costs. Users can't budget or compare workflow efficiency.

**Solution:** Add cost estimation to Step 3 (pre-run) and actual tracking to Step 7 + post-run report.

**Files:** `commands/minion.md` (~25 lines added)

**Pre-run (Step 3):**
- If MCP `estimate_cost` tool available, use it
- Otherwise, heuristic: `base_tokens × phases × tasks × model_rate`
- Show in confirmation summary

**Post-run (Step 7 + report):**
- Map worker iterations to approximate tokens: `iterations × avg_tokens_per_iteration × model_rate`
- Include in `.minion/report.md`:

```markdown
## Cost Summary
| Task | Estimated | Actual (approx) | Phases |
|------|-----------|-----------------|--------|
| 1    | $0.12     | $0.09           | 3/3    |
| 2    | $0.12     | $0.15           | 3/3    |
| Total| $0.24     | $0.24           |        |
```

---

## Phase G: Platform

### G1: MCP Server Unification

**Problem:** The MCP server has tested TypeScript (100% coverage) for task parsing, DAG resolution, and cost estimation. The prompt orchestrator reimplements all of this in ~650 lines of prose. Dual maintenance burden, and prose parsing can misparse edge cases.

**Solution:** Add optional MCP delegation to the orchestrator. When MCP tools are available, use them. When not, fall back to current prose logic.

**Files:** `commands/minion.md` (~30 lines modified across 4 steps)

**Delegation points:**

| Step | Current (prose) | With MCP (if available) |
|------|----------------|------------------------|
| Step 1: Parse tasks | Read markdown, extract `### Task N:` | Call `parse_tasks` → structured JSON |
| Step 1.5: DAG/waves | Topological sort in prose | Call `resolve_dag` → waves + critical path |
| Step 1.6: Conflict analysis | File overlap matrix (from F1) | Call `check_scope` → file overlap detection |
| Step 3: Cost estimate | Heuristic (from F3) | Call `estimate_cost` → per-model pricing |

**Key principle:** Additive, not a rewrite. The prose fallback stays intact. Users without MCP server get identical behavior.

---

### G2: npm Package + CLI Installer

**Problem:** Installing minion-toolkit requires manually copying files and configuring plugins. High friction for new users.

**Solution:** Create `cli/` directory with a Node.js CLI that handles the full installation flow.

**Package:** `minion-toolkit` on npm

**Commands:**
```bash
npx minion-toolkit install     # Full installation flow
npx minion-toolkit uninstall   # Clean removal
npx minion-toolkit update      # Pull latest, re-sync files
npx minion-toolkit agents      # Re-run agent generator
npx minion-toolkit doctor      # Verify installation health
```

#### Install Flow

```
1. Copy core files to ~/.claude/
   ├── commands/minion.md
   ├── agents/minion-worker.md, security-reviewer.md
   ├── workflows/*.md (all 6)
   └── skills/minion-blueprint/SKILL.md

2. Auto-install essential plugins + tools:
   ├── superpowers (claude plugin add)
   ├── codegraph (npm install -g + MCP config + hooks)
   ├── speckit (claude plugin add or npm install)
   └── code-review (claude plugin add)

3. Offer recommended plugins:
   ├── pr-review-toolkit
   ├── context7
   └── security-guidance

4. Agent setup:
   ├── Scan project structure (dirs, deps, frameworks)
   ├── Offer: [1] Auto-generate  [2] Provide own  [3] Skip
   └── If auto-generate: create tailored agent .md files
       based on detected file extensions, paths, keywords

5. Doctor check:
   ├── Verify all files exist in ~/.claude/
   ├── Verify plugins installed
   ├── Verify codegraph MCP configured
   └── Print success summary
```

#### Agent Auto-Generator

Scans project for:
- **Directory patterns:** `components/`, `pages/` → frontend agent; `services/`, `controllers/` → backend agent
- **Dependencies:** `react`, `next` → frontend; `express`, `nestjs` → backend; `prisma`, `typeorm` → database
- **Config files:** `tailwind.config.*` → frontend with Tailwind; `docker-compose.*` → infra agent

Generates agent `.md` files with correct frontmatter (name, description, model) and auto-assignment rules matching the orchestrator's Step 1.7 discovery.

#### Release Pipeline Integration

Modify `.github/workflows/release.yml`:
- After creating GitHub Release, run `npm publish` from `cli/` directory
- Version stays in sync via shared version in `mcp-server/package.json`
- Requires `NPM_TOKEN` secret in GitHub repo settings

#### Package Structure

```
cli/
├── package.json          # name: "minion-toolkit", bin: "minion-toolkit"
├── src/
│   ├── index.ts          # CLI entry (commander.js)
│   ├── install.ts        # Install command
│   ├── uninstall.ts      # Clean removal
│   ├── update.ts         # Update from npm
│   ├── agents.ts         # Agent generator
│   └── doctor.ts         # Health check
├── assets/               # Bundled markdown files
│   ├── commands/
│   ├── agents/
│   ├── workflows/
│   └── skills/
└── tsconfig.json
```

---

## Summary

| Phase | Items | Effort | Files Modified |
|-------|-------|--------|----------------|
| **E** | E1 cross-phase memory, E2 dry-run, E3 health monitoring, E4 post-run report | Low | `SKILL.md`, `minion.md` |
| **F** | F1 conflict prevention, F2 smart context, F3 cost tracking | Medium | `minion.md`, `SKILL.md` |
| **G** | G1 MCP unification, G2 npm CLI installer | High | `minion.md`, new `cli/`, `release.yml` |

**Version plan:**
- Phase E → v2.0.0 (new major — signals the evolution)
- Phase F → v2.1.0
- Phase G → v2.2.0

---

*Design approved 2026-03-08. Ready for implementation planning.*
