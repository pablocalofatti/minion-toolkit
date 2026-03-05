import Anthropic from "@anthropic-ai/sdk";
import { MinionConfig, MinionSession, WorkerStatus } from "../types.js";
import { buildBranchName } from "../git/branch.js";
import { createWorktree } from "../git/worktree.js";
import { buildSystemPrompt } from "../worker/worker-system-prompt.js";
import { runWorkerLoop } from "../worker/worker-loop.js";

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

export function startWorkers(
  session: MinionSession,
  config: MinionConfig
): void {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const semaphore = new Semaphore(config.maxWorkers);
  const signal = session.abortController.signal;

  // Initialize worker statuses
  for (const task of session.tasks) {
    const branch = buildBranchName(task.number, task.title);
    const status: WorkerStatus = {
      taskNumber: task.number,
      taskTitle: task.title,
      state: "queued",
      branch,
      worktreePath: "",
      iteration: 0,
      maxIterations: config.workerMaxIterations,
      startedAt: null,
      completedAt: null,
      error: null,
    };
    session.workers.set(task.number, status);
  }

  // Fire-and-forget: spawn all workers (semaphore controls concurrency)
  const workerPromises = session.tasks.map(async (task) => {
    const status = session.workers.get(task.number);
    /* c8 ignore start -- defensive guard: status is always set by the sync init loop above */
    if (!status) return;
    /* c8 ignore stop */

    await semaphore.acquire();

    if (signal.aborted) {
      status.state = "cancelled";
      semaphore.release();
      return;
    }

    try {
      status.state = "running";
      status.startedAt = Date.now();

      const worktreePath = await createWorktree(
        session.projectRoot,
        status.branch,
        session.baseBranch
      );
      status.worktreePath = worktreePath;

      const systemPrompt = buildSystemPrompt(
        task,
        session.commands,
        worktreePath
      );

      const result = await runWorkerLoop(
        client,
        config,
        systemPrompt,
        status,
        signal
      );

      // Collect changed files from git
      result.filesChanged = await getChangedFiles(worktreePath);

      session.results.set(task.number, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      status.state = "failed";
      status.error = message;
      status.completedAt = Date.now();

      session.results.set(task.number, {
        taskNumber: task.number,
        taskTitle: task.title,
        state: "failed",
        branch: status.branch,
        filesChanged: [],
        /* c8 ignore next -- startedAt is always set before any throwable code */
        duration: Date.now() - (status.startedAt ?? Date.now()),
        iterations: status.iteration,
        error: message,
      });
    } finally {
      semaphore.release();
    }
  });

  // Don't await — fire and forget. Results land in session.results.
  /* c8 ignore start -- Promise.allSettled never rejects */
  Promise.allSettled(workerPromises).catch(() => {});
  /* c8 ignore stop */
}

async function getChangedFiles(worktreePath: string): Promise<string[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", "HEAD~1"],
      { cwd: worktreePath }
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (err: unknown) {
    console.error(`getChangedFiles failed for ${worktreePath}: ${String(err)}`);
    return [];
  }
}
