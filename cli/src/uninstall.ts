import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CLAUDE_DIR, SEPARATOR_WIDTH, log, logSuccess } from "./utils.js";

const FILES_TO_REMOVE = [
  join(CLAUDE_DIR, "commands", "minion.md"),
  join(CLAUDE_DIR, "agents", "minion-worker.md"),
  join(CLAUDE_DIR, "agents", "security-reviewer.md"),
  join(CLAUDE_DIR, "skills", "minion-blueprint"),
];

export async function uninstall(): Promise<void> {
  log("Minion Toolkit Uninstaller");
  log("=".repeat(SEPARATOR_WIDTH));
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

  log("\nUninstall complete.");
  log("  Plugins (superpowers, code-review, etc.) were NOT removed.");
  log("  Remove them manually with: claude plugin remove <name>");
}
