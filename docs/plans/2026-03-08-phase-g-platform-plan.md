# Phase G: Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional MCP delegation to the orchestrator and create an npm CLI installer (`minion-toolkit`) for frictionless setup with bundled plugins, tools, and agent auto-generation.

**Architecture:** Task 1 is prompt engineering (markdown). Tasks 2–7 are TypeScript code creating a new `cli/` directory with a commander.js CLI. Task 8 modifies the release workflow to publish to npm.

**Tech Stack:** Markdown (`commands/minion.md`), TypeScript + commander.js (`cli/`), GitHub Actions (`.github/workflows/release.yml`)

---

### Task 1: MCP Optional Delegation — orchestrator calls MCP when available

Add optional MCP tool delegation to 4 steps in the orchestrator. When MCP tools are available, use them for structured parsing. When not, fall back to current prose logic.

**Files:**
- Modify: `commands/minion.md` — Steps 1, 1.5, 1.6, and 3

**Step 1: Add MCP delegation to Step 1 (Parse Tasks)**

In `commands/minion.md`, find Step 1 after the flag parsing section (after line 18). Before "Parse the file for tasks" (line 24), add:

```markdown
- **MCP delegation (optional):** If the `minion_start` MCP tool is available, you may call the MCP server's `parse_tasks` function to get structured JSON output instead of parsing markdown manually. This provides more reliable task extraction with validated fields. If the MCP tool is not available or fails, fall back to the prose parsing below.
```

**Step 2: Add MCP delegation to Step 1.5 (Resolve Dependencies)**

In `commands/minion.md`, find Step 1.5. After "compute execution waves:" (line 202), add before the numbered list:

```markdown
- **MCP delegation (optional):** If MCP tools are available, call `resolve_dag` with the parsed task list to get waves, critical path, and cycle detection as structured JSON. Fall back to prose topological sort if unavailable.
```

**Step 3: Add MCP delegation to Step 1.6 (Conflict Analysis)**

In `commands/minion.md`, find Step 1.6. After "Detect file-level overlap" (first line of Step 1.6), add:

```markdown
- **MCP delegation (optional):** If MCP tools are available, call `check_scope` with the task list and wave assignments to detect file overlaps. Fall back to prose matrix comparison if unavailable.
```

**Step 4: Add MCP delegation to Step 3 (Cost Estimate)**

In `commands/minion.md`, find the "Estimated cost" line in Step 3. Before the heuristic formula, add:

```markdown
  - **MCP delegation (optional):** If MCP `estimate_cost` tool is available, call it with task count, phase count, and model name for a more accurate per-model estimate. Fall back to heuristic below if unavailable.
```

**Step 5: Commit**

```bash
git add commands/minion.md
git commit -m "feat: add optional MCP delegation for task parsing, DAG, scope, and cost"
```

---

### Task 2: CLI Scaffold — package.json, tsconfig, entry point

Create the `cli/` directory with project scaffolding and a commander.js-based entry point.

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/index.ts`
- Create: `cli/src/utils.ts`

**Step 1: Create cli/package.json**

```json
{
  "name": "minion-toolkit",
  "version": "2.2.0",
  "description": "CLI installer for minion-toolkit — parallel AI worker orchestration for Claude Code",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "minion-toolkit": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "dist",
    "assets"
  ],
  "keywords": [
    "claude-code",
    "ai",
    "orchestration",
    "minion",
    "parallel-workers"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/pablocalofatti/minion-toolkit.git"
  }
}
```

**Step 2: Create cli/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

**Step 3: Create cli/src/utils.ts**

Shared utilities used across all commands.

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

export const CLAUDE_DIR = join(homedir(), ".claude");

export const ASSET_DIRS = {
  commands: join(CLAUDE_DIR, "commands"),
  agents: join(CLAUDE_DIR, "agents"),
  workflows: join(CLAUDE_DIR, "workflows"),
  skills: join(CLAUDE_DIR, "skills", "minion-blueprint"),
} as const;

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function runCommand(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

export function log(msg: string): void {
  console.log(msg);
}

export function logSuccess(msg: string): void {
  console.log(`✓ ${msg}`);
}

export function logWarn(msg: string): void {
  console.log(`⚠ ${msg}`);
}

export function logError(msg: string): void {
  console.error(`✗ ${msg}`);
}
```

**Step 4: Create cli/src/index.ts**

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { install } from "./install.js";
import { uninstall } from "./uninstall.js";
import { update } from "./update.js";
import { agents } from "./agents.js";
import { doctor } from "./doctor.js";

const program = new Command();

program
  .name("minion-toolkit")
  .description(
    "CLI installer for minion-toolkit — parallel AI worker orchestration for Claude Code"
  )
  .version("2.2.0");

program
  .command("install")
  .description("Install minion-toolkit files, plugins, and tools")
  .action(install);

program
  .command("uninstall")
  .description("Remove all minion-toolkit files from ~/.claude/")
  .action(uninstall);

program
  .command("update")
  .description("Update minion-toolkit to the latest version")
  .action(update);

program
  .command("agents")
  .description("Auto-generate agent files from project structure")
  .option("-d, --dir <path>", "Project directory to scan", ".")
  .action(agents);

program
  .command("doctor")
  .description("Verify minion-toolkit installation health")
  .action(doctor);

program.parse();
```

**Step 5: Commit**

```bash
git add cli/
git commit -m "feat: scaffold CLI package with commander.js entry point"
```

---

### Task 3: Install Command — copy files + install plugins + tools

The main install command that copies core files, installs essential plugins/tools, and offers recommended plugins.

**Files:**
- Create: `cli/src/install.ts`
- Create: `cli/assets/` (copy all markdown files from repo root)

**Step 1: Copy asset files**

```bash
mkdir -p cli/assets/commands cli/assets/agents cli/assets/workflows cli/assets/skills/minion-blueprint
cp commands/minion.md cli/assets/commands/
cp agents/minion-worker.md cli/assets/agents/
cp agents/security-reviewer.md cli/assets/agents/
cp workflows/*.md cli/assets/workflows/
cp skills/minion-blueprint/SKILL.md cli/assets/skills/minion-blueprint/
```

**Step 2: Create cli/src/install.ts**

```typescript
import { cpSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  CLAUDE_DIR,
  ASSET_DIRS,
  ensureDir,
  runCommand,
  log,
  logSuccess,
  logWarn,
  logError,
} from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "assets");

interface PluginDef {
  name: string;
  type: "plugin" | "npm-global" | "mcp";
  installCmd: string[];
  essential: boolean;
}

const PLUGINS: PluginDef[] = [
  {
    name: "superpowers",
    type: "plugin",
    installCmd: ["claude", "plugin", "add", "superpowers"],
    essential: true,
  },
  {
    name: "code-review",
    type: "plugin",
    installCmd: ["claude", "plugin", "add", "code-review"],
    essential: true,
  },
  {
    name: "codegraph",
    type: "npm-global",
    installCmd: ["npm", "install", "-g", "@anthropic-ai/codegraph"],
    essential: true,
  },
  {
    name: "pr-review-toolkit",
    type: "plugin",
    installCmd: ["claude", "plugin", "add", "pr-review-toolkit"],
    essential: false,
  },
  {
    name: "context7",
    type: "plugin",
    installCmd: ["claude", "plugin", "add", "context7"],
    essential: false,
  },
  {
    name: "security-guidance",
    type: "plugin",
    installCmd: ["claude", "plugin", "add", "security-guidance"],
    essential: false,
  },
];

async function copyAssets(): Promise<void> {
  log("\n📦 Step 1: Copying core files to ~/.claude/...");

  for (const [key, dir] of Object.entries(ASSET_DIRS)) {
    ensureDir(dir);
  }

  const copies: Array<{ src: string; dest: string; label: string }> = [
    {
      src: join(ASSETS_DIR, "commands", "minion.md"),
      dest: join(ASSET_DIRS.commands, "minion.md"),
      label: "commands/minion.md",
    },
    {
      src: join(ASSETS_DIR, "agents", "minion-worker.md"),
      dest: join(ASSET_DIRS.agents, "minion-worker.md"),
      label: "agents/minion-worker.md",
    },
    {
      src: join(ASSETS_DIR, "agents", "security-reviewer.md"),
      dest: join(ASSET_DIRS.agents, "security-reviewer.md"),
      label: "agents/security-reviewer.md",
    },
    {
      src: join(ASSETS_DIR, "skills", "minion-blueprint", "SKILL.md"),
      dest: join(ASSET_DIRS.skills, "SKILL.md"),
      label: "skills/minion-blueprint/SKILL.md",
    },
  ];

  // Copy workflow files
  const workflowsDir = join(ASSETS_DIR, "workflows");
  if (existsSync(workflowsDir)) {
    const workflowDir = join(CLAUDE_DIR, "workflows");
    ensureDir(workflowDir);
    for (const file of readdirSync(workflowsDir)) {
      if (file.endsWith(".md")) {
        copies.push({
          src: join(workflowsDir, file),
          dest: join(workflowDir, file),
          label: `workflows/${file}`,
        });
      }
    }
  }

  for (const { src, dest, label } of copies) {
    if (existsSync(src)) {
      cpSync(src, dest);
      logSuccess(label);
    } else {
      logWarn(`${label} — asset not found, skipping`);
    }
  }
}

async function installPlugins(): Promise<void> {
  const essential = PLUGINS.filter((p) => p.essential);
  const recommended = PLUGINS.filter((p) => !p.essential);

  log("\n🔌 Step 2: Installing essential plugins and tools...");

  for (const plugin of essential) {
    log(`  Installing ${plugin.name}...`);
    const result = await runCommand(plugin.installCmd[0], plugin.installCmd.slice(1));
    if (result.exitCode === 0) {
      logSuccess(plugin.name);
    } else {
      logWarn(`${plugin.name} — install failed (${result.stderr || "unknown error"}). You can install manually later.`);
    }
  }

  log("\n🎯 Step 3: Recommended plugins (optional):");
  for (const plugin of recommended) {
    log(`  - ${plugin.name}`);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    "\nInstall recommended plugins? [y/N] "
  );
  rl.close();

  if (answer.toLowerCase() === "y") {
    for (const plugin of recommended) {
      log(`  Installing ${plugin.name}...`);
      const result = await runCommand(
        plugin.installCmd[0],
        plugin.installCmd.slice(1)
      );
      if (result.exitCode === 0) {
        logSuccess(plugin.name);
      } else {
        logWarn(`${plugin.name} — install failed. Install manually later.`);
      }
    }
  } else {
    log("  Skipped recommended plugins.");
  }
}

export async function install(): Promise<void> {
  log("🔧 Minion Toolkit Installer");
  log("═".repeat(40));

  await copyAssets();
  await installPlugins();

  log("\n✅ Installation complete!");
  log("\nNext steps:");
  log("  1. Run `minion-toolkit agents` to auto-generate project agents");
  log("  2. Run `minion-toolkit doctor` to verify installation");
  log("  3. Use `/minion tasks.md` in Claude Code to start orchestrating");
}
```

**Step 3: Commit**

```bash
git add cli/
git commit -m "feat: add install command with file copy and plugin installation"
```

---

### Task 4: Agent Auto-Generator — scan project + generate agents

Scans a project directory, detects frameworks/tools, and generates tailored agent `.md` files.

**Files:**
- Create: `cli/src/agents.ts`

**Step 1: Create cli/src/agents.ts**

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CLAUDE_DIR, ensureDir, log, logSuccess, logWarn } from "./utils.js";

interface DetectedStack {
  name: string;
  description: string;
  matchPatterns: string[];
  matchKeywords: string[];
}

const STACK_DETECTORS: Array<{
  name: string;
  description: string;
  dirs: string[];
  deps: string[];
  configs: string[];
  matchPatterns: string[];
  matchKeywords: string[];
}> = [
  {
    name: "frontend",
    description: "Frontend development with React/Next.js",
    dirs: ["components", "pages", "app", "src/components", "src/pages"],
    deps: ["react", "next", "vue", "svelte", "angular"],
    configs: ["tailwind.config.ts", "tailwind.config.js", "postcss.config.js"],
    matchPatterns: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"],
    matchKeywords: ["component", "page", "layout", "style", "css", "ui"],
  },
  {
    name: "backend",
    description: "Backend API development",
    dirs: ["services", "controllers", "routes", "api", "src/services", "src/controllers"],
    deps: ["express", "nestjs", "@nestjs/core", "fastify", "hono", "koa"],
    configs: [],
    matchPatterns: ["**/*.controller.ts", "**/*.service.ts", "**/*.route.ts"],
    matchKeywords: ["api", "endpoint", "service", "controller", "route", "middleware"],
  },
  {
    name: "database",
    description: "Database and data layer development",
    dirs: ["migrations", "seeds", "models", "entities", "src/entities"],
    deps: ["prisma", "@prisma/client", "typeorm", "drizzle-orm", "mongoose", "sequelize"],
    configs: ["prisma/schema.prisma"],
    matchPatterns: ["**/*.entity.ts", "**/*.model.ts", "**/migrations/**"],
    matchKeywords: ["database", "migration", "schema", "entity", "model", "query"],
  },
  {
    name: "infra",
    description: "Infrastructure and DevOps",
    dirs: [".github", "terraform", "k8s", "docker"],
    deps: [],
    configs: ["docker-compose.yml", "docker-compose.yaml", "Dockerfile", "terraform.tf"],
    matchPatterns: ["**/*.yml", "**/*.yaml", "**/Dockerfile*"],
    matchKeywords: ["deploy", "docker", "ci", "pipeline", "infrastructure"],
  },
];

function detectStacks(projectDir: string): DetectedStack[] {
  const detected: DetectedStack[] = [];

  let deps: string[] = [];
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      deps = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ];
    } catch {
      // ignore parse errors
    }
  }

  for (const detector of STACK_DETECTORS) {
    const hasDir = detector.dirs.some((d) => existsSync(join(projectDir, d)));
    const hasDep = detector.deps.some((d) => deps.includes(d));
    const hasConfig = detector.configs.some((c) =>
      existsSync(join(projectDir, c))
    );

    if (hasDir || hasDep || hasConfig) {
      detected.push({
        name: detector.name,
        description: detector.description,
        matchPatterns: detector.matchPatterns,
        matchKeywords: detector.matchKeywords,
      });
    }
  }

  return detected;
}

function generateAgentMd(stack: DetectedStack, projectName: string): string {
  return `---
name: ${projectName}-${stack.name}
description: ${stack.description} for ${projectName}
model: sonnet
---

# ${projectName} ${stack.name.charAt(0).toUpperCase() + stack.name.slice(1)} Agent

Specialized agent for ${stack.description.toLowerCase()} in the ${projectName} project.

## Auto-Assignment Rules

This agent is automatically assigned to tasks matching:
- **File patterns:** ${stack.matchPatterns.join(", ")}
- **Keywords:** ${stack.matchKeywords.join(", ")}

## Guidelines

- Follow project conventions in CLAUDE.md
- Check existing patterns before creating new ones
- Write tests for all new functionality
- Keep changes focused on the task scope
`;
}

export async function agents(options: { dir: string }): Promise<void> {
  const projectDir = join(process.cwd(), options.dir);
  const projectName = basename(projectDir);

  log("🔍 Scanning project structure...");
  log(`  Directory: ${projectDir}`);

  const stacks = detectStacks(projectDir);

  if (stacks.length === 0) {
    logWarn("No recognizable project structure detected.");
    log("  You can create agents manually in ~/.claude/agents/");
    return;
  }

  log(`\n  Detected stacks: ${stacks.map((s) => s.name).join(", ")}`);

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    "\nOptions:\n  1. Auto-generate agents\n  2. Skip (I'll provide my own)\n\nChoice [1/2]: "
  );
  rl.close();

  if (answer !== "1") {
    log("  Skipped agent generation.");
    return;
  }

  const agentsDir = join(CLAUDE_DIR, "agents");
  ensureDir(agentsDir);

  for (const stack of stacks) {
    const filename = `${projectName}-${stack.name}.md`;
    const filepath = join(agentsDir, filename);
    const content = generateAgentMd(stack, projectName);

    writeFileSync(filepath, content);
    logSuccess(`${filename} — ${stack.description}`);
  }

  log(`\n  Generated ${stacks.length} agent(s) in ~/.claude/agents/`);
}
```

**Step 2: Commit**

```bash
git add cli/src/agents.ts
git commit -m "feat: add agent auto-generator with project structure scanning"
```

---

### Task 5: Doctor, Uninstall, and Update Commands

The remaining three CLI commands: health check, clean removal, and self-update.

**Files:**
- Create: `cli/src/doctor.ts`
- Create: `cli/src/uninstall.ts`
- Create: `cli/src/update.ts`

**Step 1: Create cli/src/doctor.ts**

```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_DIR, runCommand, log, logSuccess, logWarn, logError } from "./utils.js";

const REQUIRED_FILES = [
  { path: join(CLAUDE_DIR, "commands", "minion.md"), label: "Orchestrator (commands/minion.md)" },
  { path: join(CLAUDE_DIR, "agents", "minion-worker.md"), label: "Worker agent (agents/minion-worker.md)" },
  { path: join(CLAUDE_DIR, "skills", "minion-blueprint", "SKILL.md"), label: "Blueprint skill (skills/minion-blueprint/SKILL.md)" },
];

const REQUIRED_PLUGINS = ["superpowers", "code-review"];

export async function doctor(): Promise<void> {
  log("🩺 Minion Toolkit Health Check");
  log("═".repeat(40));

  let issues = 0;

  // Check core files
  log("\n📁 Core files:");
  for (const file of REQUIRED_FILES) {
    if (existsSync(file.path)) {
      logSuccess(file.label);
    } else {
      logError(`${file.label} — MISSING`);
      issues++;
    }
  }

  // Check workflows directory
  const workflowDir = join(CLAUDE_DIR, "workflows");
  if (existsSync(workflowDir)) {
    logSuccess("Workflow templates (workflows/)");
  } else {
    logWarn("Workflow templates — not found (optional)");
  }

  // Check plugins
  log("\n🔌 Plugins:");
  const { stdout: pluginList } = await runCommand("claude", ["plugin", "list"]);
  for (const plugin of REQUIRED_PLUGINS) {
    if (pluginList.includes(plugin)) {
      logSuccess(plugin);
    } else {
      logWarn(`${plugin} — not installed (run: claude plugin add ${plugin})`);
      issues++;
    }
  }

  // Check codegraph
  log("\n🔧 Tools:");
  const { exitCode: cgCode } = await runCommand("codegraph", ["--version"]);
  if (cgCode === 0) {
    logSuccess("codegraph");
  } else {
    logWarn("codegraph — not installed (run: npm install -g @anthropic-ai/codegraph)");
    issues++;
  }

  // Summary
  log("\n" + "═".repeat(40));
  if (issues === 0) {
    logSuccess("All checks passed! Minion Toolkit is ready.");
  } else {
    logWarn(`${issues} issue(s) found. Run \`minion-toolkit install\` to fix.`);
  }
}
```

**Step 2: Create cli/src/uninstall.ts**

```typescript
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CLAUDE_DIR, log, logSuccess, logWarn } from "./utils.js";

const FILES_TO_REMOVE = [
  join(CLAUDE_DIR, "commands", "minion.md"),
  join(CLAUDE_DIR, "agents", "minion-worker.md"),
  join(CLAUDE_DIR, "agents", "security-reviewer.md"),
  join(CLAUDE_DIR, "skills", "minion-blueprint"),
];

export async function uninstall(): Promise<void> {
  log("🗑️  Minion Toolkit Uninstaller");
  log("═".repeat(40));
  log("\nThis will remove:");
  for (const file of FILES_TO_REMOVE) {
    log(`  - ${file.replace(CLAUDE_DIR, "~/.claude")}`);
  }
  log("  - ~/.claude/workflows/ (all workflow files)");

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question("\nProceed? [y/N] ");
  rl.close();

  if (answer.toLowerCase() !== "y") {
    log("  Cancelled.");
    return;
  }

  for (const file of FILES_TO_REMOVE) {
    if (existsSync(file)) {
      rmSync(file, { recursive: true, force: true });
      logSuccess(`Removed ${file.replace(CLAUDE_DIR, "~/.claude")}`);
    }
  }

  const workflowDir = join(CLAUDE_DIR, "workflows");
  if (existsSync(workflowDir)) {
    rmSync(workflowDir, { recursive: true, force: true });
    logSuccess("Removed ~/.claude/workflows/");
  }

  log("\n✅ Uninstall complete.");
  log("  Plugins (superpowers, code-review, etc.) were NOT removed.");
  log("  Remove them manually with: claude plugin remove <name>");
}
```

**Step 3: Create cli/src/update.ts**

```typescript
import { runCommand, log, logSuccess, logError } from "./utils.js";
import { install } from "./install.js";

export async function update(): Promise<void> {
  log("🔄 Updating Minion Toolkit...");

  const result = await runCommand("npm", [
    "install",
    "-g",
    "minion-toolkit@latest",
  ]);

  if (result.exitCode !== 0) {
    logError(`Update failed: ${result.stderr}`);
    return;
  }

  logSuccess("Package updated to latest version");
  log("\nRe-syncing files...");
  await install();
}
```

**Step 4: Commit**

```bash
git add cli/src/doctor.ts cli/src/uninstall.ts cli/src/update.ts
git commit -m "feat: add doctor, uninstall, and update CLI commands"
```

---

### Task 6: Build + verify CLI compiles

Install dependencies, build the CLI, and verify it runs.

**Files:**
- Generate: `cli/pnpm-lock.yaml` (via pnpm install)
- Generate: `cli/dist/` (via tsc build)

**Step 1: Install and build**

```bash
cd cli
pnpm install
pnpm run build
```

**Step 2: Verify entry point**

```bash
node dist/index.js --help
```

Expected output should show the 5 commands: install, uninstall, update, agents, doctor.

**Step 3: Fix any TypeScript errors**

If the build fails, fix the errors and rebuild.

**Step 4: Add dist to .gitignore**

Create `cli/.gitignore`:
```
dist/
node_modules/
```

**Step 5: Commit**

```bash
git add cli/
git commit -m "feat: build CLI and verify compilation"
```

---

### Task 7: Release Pipeline Integration — npm publish

Modify the release workflow to publish the CLI package to npm after creating a GitHub Release.

**Files:**
- Modify: `.github/workflows/release.yml` — add npm publish step

**Step 1: Add npm publish to release workflow**

In `.github/workflows/release.yml`, find the GitHub Release creation step. After it, add a new step:

```yaml
      - name: Publish CLI to npm
        if: steps.bump.outputs.new_version != ''
        working-directory: cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          # Sync version from mcp-server/package.json
          VERSION=$(node -p "require('../mcp-server/package.json').version")
          node -e "
            const pkg = require('./package.json');
            pkg.version = '$VERSION';
            require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
          "

          # Build and publish
          pnpm install --frozen-lockfile
          pnpm run build
          npm publish --access public || echo "Publish failed — NPM_TOKEN may not be configured"
```

Also add a setup step for npm authentication. Find the "Setup Node.js" step and modify it:

```yaml
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: "https://registry.npmjs.org"
```

**Step 2: Add note to README about NPM_TOKEN**

In `README.md`, find the CI/CD Pipeline section. After the table of workflows, add:

```markdown
**npm Publishing:** The release workflow also publishes the `minion-toolkit` CLI to npm. Requires `NPM_TOKEN` secret in repository settings. If not configured, the publish step is skipped gracefully.
```

**Step 3: Commit**

```bash
git add .github/workflows/release.yml README.md
git commit -m "feat: add npm publish to release workflow for CLI distribution"
```

---

### Task 8: README — Installation section + update docs

Update the README to document the new `npx minion-toolkit install` flow as the primary installation method.

**Files:**
- Modify: `README.md` — add Installation section, update Quick Start

**Step 1: Add Installation section to README**

In `README.md`, find the "## Quick Start" section. Before it, add:

```markdown
## Installation

### Automatic (recommended)

```bash
npx minion-toolkit install
```

This will:
1. Copy orchestrator, worker, blueprint, and workflow files to `~/.claude/`
2. Install essential plugins (superpowers, code-review) and tools (codegraph)
3. Offer optional recommended plugins (pr-review-toolkit, context7, security-guidance)

### Other Commands

```bash
npx minion-toolkit agents     # Auto-generate agents from project structure
npx minion-toolkit doctor     # Verify installation health
npx minion-toolkit update     # Update to latest version
npx minion-toolkit uninstall  # Clean removal
```

### Manual

Copy the files from this repository to `~/.claude/` manually. See [Architecture](#architecture) for the file layout.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add installation section with npx minion-toolkit install"
```

---

### Task 9: Update CHANGELOG and version

**Files:**
- Modify: `CHANGELOG.md` — add v2.2.0 entry
- Modify: `mcp-server/package.json` — bump version to 2.2.0

**Step 1: Add CHANGELOG entry**

In `CHANGELOG.md`, add at the top (after line 1 `# Changelog`):

```markdown

## [2.2.0] - 2026-03-08

### Added
- Optional MCP delegation — orchestrator uses MCP tools for parsing, DAG, scope check, and cost when available
- CLI installer (`npx minion-toolkit install`) — copies files, installs plugins/tools, offers recommended plugins
- Agent auto-generator (`npx minion-toolkit agents`) — scans project structure and generates tailored agent files
- Doctor command (`npx minion-toolkit doctor`) — verifies installation health
- Uninstall and update commands for clean lifecycle management
- npm publish in release workflow for CLI distribution

### Changed
- README restructured with Installation section as primary entry point
```

**Step 2: Bump version in mcp-server/package.json**

Change version to `"2.2.0"`.

**Step 3: Commit**

```bash
git add CHANGELOG.md mcp-server/package.json
git commit -m "chore: bump version to v2.2.0 and update changelog"
```

---

### Task 10: Sync to ~/.claude/ and verify

**Step 1: Sync files**

```bash
cp commands/minion.md ~/.claude/commands/minion.md
cp skills/minion-blueprint/SKILL.md ~/.claude/skills/minion-blueprint/SKILL.md
```

**Step 2: Verify**

- MCP delegation mentions in `~/.claude/commands/minion.md` (grep for "MCP delegation")
- CLI builds and shows help (`cd cli && node dist/index.js --help`)

---

### Summary

| Task | What | Files | Commit |
|------|------|-------|--------|
| 1 | MCP optional delegation | `minion.md` | `feat: add optional MCP delegation...` |
| 2 | CLI scaffold | `cli/package.json`, `cli/src/index.ts`, `cli/src/utils.ts` | `feat: scaffold CLI package...` |
| 3 | Install command | `cli/src/install.ts`, `cli/assets/` | `feat: add install command...` |
| 4 | Agent auto-generator | `cli/src/agents.ts` | `feat: add agent auto-generator...` |
| 5 | Doctor + uninstall + update | `cli/src/doctor.ts`, `cli/src/uninstall.ts`, `cli/src/update.ts` | `feat: add doctor, uninstall, update...` |
| 6 | Build + verify | `cli/dist/`, `cli/.gitignore` | `feat: build CLI and verify...` |
| 7 | Release pipeline | `.github/workflows/release.yml`, `README.md` | `feat: add npm publish...` |
| 8 | README installation docs | `README.md` | `docs: add installation section...` |
| 9 | Version + changelog | `CHANGELOG.md`, `package.json` | `chore: bump version to v2.2.0...` |
| 10 | Sync + verify | Copy files | — |
