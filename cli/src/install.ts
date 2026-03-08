import { cpSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  CLAUDE_DIR,
  ASSET_DIRS,
  SEPARATOR_WIDTH,
  ensureDir,
  runCommand,
  log,
  logSuccess,
  logWarn,
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

interface CopyEntry {
  src: string;
  dest: string;
  label: string;
}

function buildCopiesList(): CopyEntry[] {
  const copies: CopyEntry[] = [
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

  return copies;
}

function copyAssets(): void {
  log("\nStep 1: Copying core files to ~/.claude/...");

  for (const dir of Object.values(ASSET_DIRS)) {
    ensureDir(dir);
  }

  for (const { src, dest, label } of buildCopiesList()) {
    if (existsSync(src)) {
      cpSync(src, dest);
      logSuccess(label);
    } else {
      logWarn(`${label} — asset not found, skipping`);
    }
  }
}

async function installPluginList(plugins: PluginDef[]): Promise<void> {
  for (const plugin of plugins) {
    log(`  Installing ${plugin.name}...`);
    const result = await runCommand(
      plugin.installCmd[0],
      plugin.installCmd.slice(1)
    );
    if (result.exitCode === 0) {
      logSuccess(plugin.name);
    } else {
      logWarn(
        `${plugin.name} — install failed (${result.stderr || "unknown error"}). You can install manually later.`
      );
    }
  }
}

async function installPlugins(): Promise<void> {
  const essential = PLUGINS.filter((p) => p.essential);
  const recommended = PLUGINS.filter((p) => !p.essential);

  log("\nStep 2: Installing essential plugins and tools...");
  await installPluginList(essential);

  log("\nStep 3: Recommended plugins (optional):");
  for (const plugin of recommended) {
    log(`  - ${plugin.name}`);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question("\nInstall recommended plugins? [y/N] ");
  rl.close();

  if (answer.toLowerCase() === "y") {
    await installPluginList(recommended);
  } else {
    log("  Skipped recommended plugins.");
  }
}

export async function install(): Promise<void> {
  log("Minion Toolkit Installer");
  log("=".repeat(SEPARATOR_WIDTH));

  copyAssets();
  await installPlugins();

  log("\nInstallation complete!");
  log("\nNext steps:");
  log("  1. Run `minion-toolkit agents` to auto-generate project agents");
  log("  2. Run `minion-toolkit doctor` to verify installation");
  log("  3. Use `/minion tasks.md` in Claude Code to start orchestrating");
}
