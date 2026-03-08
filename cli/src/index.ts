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
