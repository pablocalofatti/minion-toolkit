# Changelog

## [1.1.0] - 2026-03-05

### Added

- initial plugin release (`||749c9fa`)
- add MCP server for parallel AI worker orchestration (`||59e3a89`)
- add MCP server for parallel AI worker orchestration (#2) (`||119a930`)
- add CLAUDE.md engineering standards and upgrade code review (`||cac3226`)
- add auto-fix CI workflow (`||599bc4d`)
- add auto-review-fix workflow and add gh access to auto-fix (`||30eaadc`)
- add Minion Worker identity to auto-fix reply comments (`||cd40461`)
- add release workflow, changelog, and code reviewer approval (`||0236f5b`)

### Fixed

- add meaningful error handling to cleanup catches (`||b3e9d35`)
- use OAuth token instead of API key for code review action (`||ce4d163`)
- enable inline PR comments via claude_args allowedTools (`||a63a76e`)
- remove --model flag, use literal block for claude_args (`||82fa6f0`)
- prevent review loop with --max-turns and focused prompt (`||81b6134`)
- allow claude[bot] in code-review to enable review-after-fix cycle (`||60580f3`)
- bump auto-review-fix max-turns from 25 to 35 (`||8014265`)
- add allowed_bots to auto-fix and auto-review-fix workflows (`||d1f0716`)

### Other

- upgrade tsconfig to NodeNext and ES2023 (`||3c28ef6`)
- add 100% coverage test suite with lint and typecheck (`||d6a21e6`)
- enable full output for code review debugging (`||faab9b6`)

## [1.0.0] - 2026-03-04

### Added

- MCP server for parallel AI worker orchestration via Anthropic API
- CI workflow with typecheck, lint, and 100% test coverage
- Claude Code Review workflow for automated PR reviews
- Auto-fix CI workflow — Claude reads CI errors, fixes code, and pushes
- Auto-review-fix workflow — Claude addresses review comments, replies, and pushes
- Minion Worker identity (`🔧 Minion Worker`) for automated replies
- CLAUDE.md engineering standards
