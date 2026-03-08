import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CLAUDE_DIR,
  SEPARATOR_WIDTH,
  runCommand,
  log,
  logSuccess,
  logWarn,
  logError,
} from "./utils.js";

const REQUIRED_FILES = [
  {
    path: join(CLAUDE_DIR, "commands", "minion.md"),
    label: "Orchestrator (commands/minion.md)",
  },
  {
    path: join(CLAUDE_DIR, "agents", "minion-worker.md"),
    label: "Worker agent (agents/minion-worker.md)",
  },
  {
    path: join(CLAUDE_DIR, "skills", "minion-blueprint", "SKILL.md"),
    label: "Blueprint skill (skills/minion-blueprint/SKILL.md)",
  },
];

const REQUIRED_PLUGINS = ["superpowers", "code-review"];

export async function doctor(): Promise<void> {
  log("Minion Toolkit Health Check");
  log("=".repeat(SEPARATOR_WIDTH));

  let issues = 0;

  // Check core files
  log("\nCore files:");
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
  log("\nPlugins:");
  const { stdout: pluginList } = await runCommand("claude", [
    "plugin",
    "list",
  ]);
  for (const plugin of REQUIRED_PLUGINS) {
    if (pluginList.includes(plugin)) {
      logSuccess(plugin);
    } else {
      logWarn(
        `${plugin} — not installed (run: claude plugin add ${plugin})`
      );
      issues++;
    }
  }

  // Check codegraph
  log("\nTools:");
  const { exitCode: cgCode } = await runCommand("codegraph", ["--version"]);
  if (cgCode === 0) {
    logSuccess("codegraph");
  } else {
    logWarn(
      "codegraph — not installed (run: npm install -g @anthropic-ai/codegraph)"
    );
    issues++;
  }

  // Summary
  log("\n" + "=".repeat(40));
  if (issues === 0) {
    logSuccess("All checks passed! Minion Toolkit is ready.");
  } else {
    logWarn(
      `${issues} issue(s) found. Run \`minion-toolkit install\` to fix.`
    );
  }
}
