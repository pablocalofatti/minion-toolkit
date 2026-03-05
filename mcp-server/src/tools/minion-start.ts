import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MinionConfig } from "../types.js";
import { parseTasks } from "../orchestrator/task-parser.js";
import { detectCommands } from "../orchestrator/command-detector.js";
import { createSession } from "../orchestrator/session-store.js";
import { startWorkers } from "../orchestrator/worker-pool.js";

const execFileAsync = promisify(execFile);

interface StartInput {
  tasks_markdown: string;
  project_root?: string;
}

export async function minionStart(
  input: StartInput,
  config: MinionConfig
): Promise<string> {
  const projectRoot = input.project_root ?? process.cwd();

  // Parse tasks from markdown
  const tasks = parseTasks(input.tasks_markdown);

  // Detect project commands
  const commands = await detectCommands(projectRoot);

  // Get current branch as base
  const { stdout: baseBranch } = await execFileAsync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: projectRoot }
  );

  // Create session
  const session = createSession(
    projectRoot,
    baseBranch.trim(),
    tasks,
    commands
  );

  // Start workers (fire-and-forget)
  startWorkers(session, config);

  const taskList = tasks
    .map((t) => `  ${t.number}. ${t.title}`)
    .join("\n");

  return [
    `Session started: ${session.id}`,
    `Base branch: ${session.baseBranch}`,
    `Package manager: ${commands.packageManager}`,
    `Workers: ${tasks.length} tasks, max ${config.maxWorkers} concurrent`,
    ``,
    `Tasks:`,
    taskList,
    ``,
    `Use minion_status("${session.id}") to check progress.`,
  ].join("\n");
}
