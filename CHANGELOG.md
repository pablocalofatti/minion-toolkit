# Changelog

## [2.3.0] - 2026-03-08

### Added
- **Stall detection** — detects when review-fix cycles make no progress (git SHA comparison) and exits early instead of looping endlessly
- **Smart workflow auto-selection** — heuristic-based workflow choice replaces hardcoded `tdd` default (security keywords → `secure`, simple single task → `quick`, complex/TDD → `tdd`, fallback → `default`)
- **Intent capture** — Step 0 asks "What's the goal?" and "What does success look like?" on first run, saves to `.minion/intent.md` for review phases to reference
- **Pre-built domain agents** — 5 domain-specific agents with scored auto-detection via `matches` field: backend-architect, frontend-architect, devops-engineer, data-engineer, tech-writer
- **Role overlays** — phase-specific behavioral overlays that shape HOW workers approach tasks: researcher (plan), tdd-developer (implement), code-reviewer (review), security-auditor (security-review), performance-reviewer
- **Layered prompt composition** — worker prompts now compose `base worker + domain persona (WHAT) + role overlay (HOW) + task context` for richer specialization
- **Role field in workflow templates** — `tdd`, `full-pipeline`, and `secure` workflows now specify `- Role:` per phase for automatic overlay loading
- **Scored agent matching** — replaces hardcoded auto-detection rules with point-based scoring (extension=3pts, path=2pts, keyword=1pt) reading from agent YAML frontmatter
- **Intent alignment in post-run report** — report includes goal, success criteria, and alignment assessment

### Changed
- Default workflow is now heuristic-based (`null` → auto-select) instead of hardcoded `tdd`
- Agent auto-detection uses `matches` field from YAML frontmatter instead of hardcoded extension rules

## [2.1.0] - 2026-03-08

### Added
- Conflict prevention — file overlap detection between parallel tasks with auto-serialize option
- Smart context gathering — workers auto-discover related code via codegraph or grep before implementing
- Cost tracking — pre-run cost estimates and post-run approximate cost per task in report

### Changed
- Blueprint Step 2 now includes Step 2b for automated context gathering (max 5 queries)
- Status.json schema expanded with `iterations` field for cost tracking

## [2.0.0] - 2026-03-08

### Added
- Cross-phase memory — blueprint reads ALL prior artifacts for full decision chain context
- `--dry-run` flag — preview execution plan (tasks, waves, agents, cost) without spawning workers
- Worker remediation prompts — interactive options when workers report `stuck`, `blocked`, or `needs_clarification`
- Post-run report — generates `.minion/report.md` with run metadata, task results, and failure details

### Changed
- Blueprint Step 2 now scans `.minion/{task_slug}/` for all artifact files, not just those listed in `PREVIOUS ARTIFACTS`

## [1.9.0] - 2026-03-07

### Added
- `--resume` flag for interrupted run recovery — skips completed tasks, retries failures, continues interrupted phases
- Security review workflow (`secure`) with dedicated `security-reviewer` agent (OWASP Top 10)
- `agents/security-reviewer.md` — security-focused code reviewer (injection, credentials, auth bypass, SSRF)

### Changed
- Default workflow changed from `default` to `tdd` (plan → implement → review)
- Resume detection includes JSON error handling, workflow mismatch detection, and task list validation

## [1.8.1] - 2026-03-07

### Fixed
- enforce Opus model and add anti-hallucination guardrail (#28) (`648befb`)

### Other
- v1.8.0 — update changelog and version (#27) (`c4636a3`)

## [1.8.0] - 2026-03-07

### Added
- Phase D Tier 1 — Worker Intelligence (#26) (`0f2fc57`)

### Other
- v1.7.0 — update changelog and version (#25) (`8980c6f`)

## [1.7.0] - 2026-03-07

### Added
- Phase C — progress output and phase hooks (#24) (`03919f6`)

### Other
- v1.6.0 — update changelog and version (#23) (`f7a1835`)

## [1.6.0] - 2026-03-07

### Added
- Phase B — cyclic workflows (review-fix loop) (#21) (`d9b0f26`)

### Other
- v1.5.1 — update changelog and version (#22) (`49d805c`)

## [1.5.1] - 2026-03-07

### Fixed
- tighten phase boundary enforcement in worker and blueprint (#20) (`d59185e`)

### Other
- v1.5.0 — update changelog and version (#19) (`8cf84a3`)

## [1.5.0] - 2026-03-07

### Added
- add workflow templates and artifact-based status (v2 Phase A) (#18) (`2a1ad20`)

### Other
- v1.4.0 — update changelog and version (#17) (`7ad1aff`)

## [1.4.0] - 2026-03-06

### Added
- add team-aware agent discovery and assignment (#16) (`a1f5e3f`)

### Other
- v1.3.2 — update changelog and version (#15) (`f68f995`)

## [1.3.2] - 2026-03-06

### Fixed
- add pipeline watch loop, conflict recovery, and git hardening (#14) (`707ec76`)

### Other
- v1.3.1 — update changelog and version (#13) (`6866c42`)

## [1.3.1] - 2026-03-06

### Fixed
- block direct pushes to main, release uses PR for version bumps (#12) (`a28abfa`)

### Other
- v1.3.0 — update changelog and version (`d2ce4ed`)

## [1.3.0] - 2026-03-05

### Added
- v2 pipeline completion — strict mode, auto-PR, setup guide (#11) (`0986ea3`)

### Other
- v1.2.5 — update changelog and version (`e4cdd3d`)

## [1.2.5] - 2026-03-05

### Fixed
- pass RELEASE_TOKEN to checkout step for git credential auth (`71da889`)

### Other
- trigger release workflow with updated RELEASE_TOKEN (`0bda158`)

## [1.2.4] - 2026-03-05

### Fixed

- use RELEASE_TOKEN PAT for release bookkeeping push to main (`7c06b63`)

## [1.2.3] - 2026-03-05

### Fixed

- revert release bookkeeping to PR approach with admin merge note (`e68c110`)

### Other

- v1.2.2 — update changelog and version (`455912b`)
- add use cases, prerequisites, and contributing guidelines (`3ee9e8d`)

## [1.2.2] - 2026-03-05

### Fixed

- push release bookkeeping directly to main instead of creating PR (`ca5ea57`)

### Other

- v1.2.0 (#8) (`0c61aa9`)
- v1.2.1 — update changelog and version (`a3f1adf`)

## [1.2.1] - 2026-03-05

### Fixed

- use h3 headings in release notes and add github-actions[bot] to trusted authors (`66a7e60`)

## [1.2.0] - 2026-03-05

### Added
- add PR gate for external contributor approval (`36d4479`)

### Fixed
- use tab delimiter in release changelog generation (`5943ed2`)
- restructure release workflow to work with branch protection (`7655692`)

## [1.1.0] - 2026-03-05

### Added

- initial plugin release (`749c9fa`)
- add MCP server for parallel AI worker orchestration (`59e3a89`)
- add MCP server for parallel AI worker orchestration (#2) (`119a930`)
- add CLAUDE.md engineering standards and upgrade code review (`cac3226`)
- add auto-fix CI workflow (`599bc4d`)
- add auto-review-fix workflow and add gh access to auto-fix (`30eaadc`)
- add Minion Worker identity to auto-fix reply comments (`cd40461`)
- add release workflow, changelog, and code reviewer approval (`0236f5b`)

### Fixed

- add meaningful error handling to cleanup catches (`b3e9d35`)
- use OAuth token instead of API key for code review action (`ce4d163`)
- enable inline PR comments via claude_args allowedTools (`a63a76e`)
- remove --model flag, use literal block for claude_args (`82fa6f0`)
- prevent review loop with --max-turns and focused prompt (`81b6134`)
- allow claude[bot] in code-review to enable review-after-fix cycle (`60580f3`)
- bump auto-review-fix max-turns from 25 to 35 (`8014265`)
- add allowed_bots to auto-fix and auto-review-fix workflows (`d1f0716`)

### Other

- upgrade tsconfig to NodeNext and ES2023 (`3c28ef6`)
- add 100% coverage test suite with lint and typecheck (`d6a21e6`)
- enable full output for code review debugging (`faab9b6`)

## [1.0.0] - 2026-03-04

### Added

- MCP server for parallel AI worker orchestration via Anthropic API
- CI workflow with typecheck, lint, and 100% test coverage
- Claude Code Review workflow for automated PR reviews
- Auto-fix CI workflow — Claude reads CI errors, fixes code, and pushes
- Auto-review-fix workflow — Claude addresses review comments, replies, and pushes
- Minion Worker identity (`🔧 Minion Worker`) for automated replies
- CLAUDE.md engineering standards
