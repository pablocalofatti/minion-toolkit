import { runCommand, log, logSuccess, logError } from "./utils.js";
import { install } from "./install.js";

export async function update(): Promise<void> {
  log("Updating Minion Toolkit...");

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
