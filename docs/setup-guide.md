# Minion Toolkit — Pipeline Setup Guide

This guide walks you through configuring a GitHub repository to use the full Minion automation pipeline: parallel AI workers, automated CI fixing, code review, and versioned releases.

---

## 1. Prerequisites

Before configuring the pipeline, ensure the following are in place:

- **GitHub repository** with `main` as the default branch.
- **Claude GitHub App** installed on your repository:
  ```
  https://github.com/apps/claude
  ```
  This app is required for Claude-powered workflows (`code-review.yml`, `auto-fix.yml`, `auto-review-fix.yml`) to authenticate and post comments/reviews.

- **`gh` CLI** authenticated locally (used by the `/minion` orchestrator to push branches and open PRs):
  ```bash
  gh auth login
  ```

- **pnpm** installed (the CI pipeline uses pnpm):
  ```bash
  npm install -g pnpm
  ```

---

## 2. Repository Secrets

Navigate to **Settings > Secrets and variables > Actions** and add the following secrets:

### `CLAUDE_CODE_OAUTH_TOKEN`

An OAuth token that authenticates Claude Code actions in your workflows.

**How to obtain:**
```bash
claude setup-token
```

Copy the token output and save it as the `CLAUDE_CODE_OAUTH_TOKEN` secret.

**Used by:** `code-review.yml`, `auto-fix.yml`, `auto-review-fix.yml`

---

### `RELEASE_TOKEN`

A GitHub fine-grained Personal Access Token (PAT) that allows the release workflow to push tags and commits directly to the protected `main` branch.

**How to create:**
1. Go to **GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens**
2. Click **Generate new token**
3. Set repository access to your target repo
4. Under **Permissions > Repository permissions**, set **Contents** to `Read and write`
5. Generate and copy the token

**Used by:** `release.yml` — to push version tags, create GitHub Releases, and open version-bump PRs.

> **Why not use `GITHUB_TOKEN`?** The default `GITHUB_TOKEN` cannot push tags to protected repos or create PRs with auto-merge. A fine-grained PAT authenticated as the repo owner provides the necessary permissions.

---

## 3. Repository Settings

### Pull Requests (Settings > General > Pull Requests)

Enable both of the following options:

- **Allow auto-merge** — Required for `gh pr merge --auto --squash` to work. Without this, the orchestrator cannot queue PRs for automatic merging after checks pass.
- **Automatically delete head branches** — Cleans up `minion/task-N-slug` branches after they are merged, keeping the repository tidy.

---

## 4. Branch Rulesets

Navigate to **Settings > Rules > Rulesets** and create a new branch ruleset for the `main` branch.

### Ruleset Configuration

- **Name:** `main-protection`
- **Enforcement:** Active
- **Target:** Branch `refs/heads/main`

### Bypass Actors

Add a bypass for the **Admin** repository role with mode **Pull requests only**. This allows admins to merge PRs that don't meet all requirements (useful for emergencies) but **blocks direct pushes to main** from everyone — including admins.

> **Why "Pull requests only"?** This ensures all changes to `main` flow through pull requests. The release workflow creates a PR for version bumps instead of pushing directly, so it works without admin bypass.

### Rules

**Pull Request:**
- Required approving review count: **1**
- Dismiss stale reviews on push: **enabled**
- The `code-review.yml` workflow automatically approves clean PRs using Claude, satisfying this requirement without manual intervention.

**Required Status Checks:**

Add the following checks (the names must match the workflow job IDs **exactly**):

| Check Name | Source Workflow |
|------------|-----------------|
| `ci`       | `ci.yml` (job: `ci`) |
| `pr-gate`  | `pr-gate.yml` (job: `pr-gate`) |

> **Important:** Check names are case-sensitive and must match the `jobs:` key in the workflow file, not the workflow `name:` field. Use `ci` (not `CI`) and `pr-gate` (not `PR Gate`).

---

## 5. GitHub Actions Workflows

All six workflow files live in `.github/workflows/`. Here is what each one does:

### `ci.yml` — Continuous Integration

Runs on every PR and every push to `main`. Executes three checks in sequence: TypeScript type checking (`pnpm run typecheck`), linting (`pnpm run lint`), and tests with coverage (`pnpm run test:coverage`). This is the hard gate — all other automation depends on this passing. The job is named `ci` and must be listed as a required status check in branch protection.

### `code-review.yml` — Claude Code Review

Triggered when a PR is opened, updated, or reopened, and also responds to `@claude` mentions in PR comments. Claude reads `CLAUDE.md` at the repo root for engineering standards, then reviews only the changed files in the diff. Critical and High severity violations block the PR with inline comments. If the code is clean, Claude approves the PR automatically, satisfying the 1-approval branch protection requirement.

### `auto-fix.yml` — Auto Fix CI

Triggers after the CI workflow completes with a failure on a PR branch. Claude reads the failed job logs, identifies the root cause (typecheck, lint, or test failures), edits the source files to fix the issue, runs `pnpm run check` to verify, and pushes a commit with the `fix(auto):` prefix. **Loop prevention:** if the most recent commit already starts with `fix(auto):`, the workflow skips to avoid infinite retry cycles.

### `auto-review-fix.yml` — Auto Fix Review

Triggers after the Claude Code Review workflow completes on a PR. Fetches all unreplied inline review comments, then addresses each one: reads the relevant file and line, applies the fix, replies to the comment thread with a `fix(review):` explanation, and pushes the updated code. **Loop limit:** stops after 2 fix cycles (counted by `fix(review):` commits in the branch history) to prevent runaway automation.

### `pr-gate.yml` — PR Gate

Runs on every PR open/update and every review submission. Automatically passes PRs authored by trusted accounts (the repo owner, `claude[bot]`, `github-actions[bot]`). Blocks PRs from external contributors until the repo owner explicitly approves the PR. This protects `main` from unauthorized merges while allowing the automation pipeline to flow freely for internal work.

> **Note:** The trusted author list in `pr-gate.yml` is hardcoded. If you fork or reuse this workflow, update the `OWNER` constant on line 23 to your own GitHub username.

### `release.yml` — Automated Release

Triggers on every push to `main` (excluding release commits themselves). Reads all conventional commits since the last git tag to determine the semver bump: `feat:` → minor, `fix:` → patch, breaking changes (`!:`) → major. Creates a git tag and a GitHub Release with a grouped changelog. Then opens a PR to update `mcp-server/package.json` version and `CHANGELOG.md`, with auto-merge enabled. The version-bump PR uses the `chore(release):` prefix so it doesn't re-trigger the release workflow when merged. Skips if no version-bumping commits are found.

---

## 6. The Full Pipeline Flow

Here is the end-to-end sequence from task file to GitHub Release:

1. **`/minion tasks.md`** — The orchestrator parses task descriptions and spawns parallel worker agents, each on an isolated git worktree.
2. **Workers implement** — Each worker builds its feature on a dedicated branch (`minion/task-N-slug`), following the minion-blueprint pattern: branch → implement → lint → test → commit.
3. **Orchestrator pushes and opens PRs** — Workers push their branches and the orchestrator runs `gh pr create --auto-merge` to queue each PR for merging once checks pass.
4. **CI runs** — `ci.yml` executes typecheck, lint, and test:coverage on the PR branch.
5. **Auto Fix CI** — If CI fails, `auto-fix.yml` reads the error logs, applies a targeted fix, and pushes `fix(auto): <description>`.
6. **Claude Code Review** — `code-review.yml` reviews the PR diff against `CLAUDE.md` standards. Approves if clean; posts inline blocking comments if not.
7. **Auto Fix Review** — If review comments exist, `auto-review-fix.yml` addresses each one and pushes `fix(review): address code review feedback`.
8. **Auto-merge** — Once all required checks (`ci`, `pr-gate`) pass and the PR is approved (by Claude or manually), GitHub auto-merges the PR via squash.
9. **Release** — On merge to `main`, `release.yml` determines the semver bump, creates a git tag and GitHub Release, then opens a version-bump PR for `CHANGELOG.md` and `package.json` that auto-merges.

---

## 7. Verification Checklist

Use this checklist to confirm the pipeline is fully configured before running `/minion`:

- [ ] Claude GitHub App installed on the repository
- [ ] `CLAUDE_CODE_OAUTH_TOKEN` secret configured
- [ ] `RELEASE_TOKEN` secret configured (fine-grained PAT, Contents: read/write)
- [ ] "Allow auto-merge" enabled in Settings > General > Pull Requests
- [ ] "Automatically delete head branches" enabled in Settings > General > Pull Requests
- [ ] Ruleset `main-protection` on `main` requires `ci` status check (exact job name)
- [ ] Ruleset `main-protection` on `main` requires `pr-gate` status check (exact job name)
- [ ] Ruleset `main-protection` on `main` requires at least 1 PR approval
- [ ] Admin bypass mode set to **"Pull requests only"** (not "Always")
- [ ] All 6 workflow files present in `.github/workflows/`
- [ ] Test: create a branch, push a commit, open a PR — verify CI and Claude Code Review both trigger

---

## 8. Troubleshooting

### "Auto-merge is not enabled for this repository"

**Fix:** Go to Settings > General > Pull Requests and enable **Allow auto-merge**. This option must be enabled at the repository level before `gh pr merge --auto` can be used.

---

### "Required status check not found" when setting up branch protection

**Fix:** The check name must match the **job ID** in the workflow file exactly. Open `.github/workflows/ci.yml` and confirm the job key is `ci:` (lowercase). Similarly, `pr-gate.yml` uses `pr-gate:`. These are the strings to enter in the branch protection settings — not the workflow display names.

---

### "RELEASE_TOKEN push rejected" / "refusing to allow a GitHub App to create or update workflow"

**Fix:** Verify two things:
1. The PAT has **Contents: read/write** permission (not read-only).
2. The branch protection rule does **not** have "Include administrators" checked. When this is enabled, even a PAT authenticated as the owner is blocked.

---

### "Code review workflow never approves the PR"

**Fix:** Check two things:
1. Open **Actions** on the PR and inspect the `Claude Code Review` run. Look for authentication errors in the step output.
2. Verify that `CLAUDE_CODE_OAUTH_TOKEN` is valid — re-run `claude setup-token` and update the secret if it has expired.

---

### "Auto Fix CI loops infinitely"

This should not happen — `auto-fix.yml` checks whether the last commit message starts with `fix(auto):` and skips if it does. If you observe repeated runs, verify that the loop check step is not being bypassed. Check the workflow run logs for the `Check if latest commit is already an auto-fix` step output.

---

### "PR Gate blocks the Minion Worker PRs"

**Fix:** The `pr-gate.yml` trusted authors list includes `claude[bot]` and `github-actions[bot]`. If PRs from the orchestrator are being blocked, check the actual PR author shown in GitHub and ensure it matches one of the trusted entries. If you customized `pr-gate.yml`, make sure your bot accounts are listed.
