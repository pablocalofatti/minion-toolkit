import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getSession,
  deleteSession,
} from "../orchestrator/session-store.js";
import { removeWorktree, removeAllWorktrees } from "../git/worktree.js";

const execFileAsync = promisify(execFile);

interface CleanupInput {
  session_id: string;
  remove_branches?: boolean;
}

export async function minionCleanup(input: CleanupInput): Promise<string> {
  const session = getSession(input.session_id);
  if (!session) {
    return `Session not found: ${input.session_id}`;
  }

  // Abort any running workers
  session.abortController.abort();

  const cleaned: string[] = [];
  const errors: string[] = [];

  // Remove individual worktrees
  for (const worker of session.workers.values()) {
    if (worker.worktreePath) {
      try {
        await removeWorktree(session.projectRoot, worker.branch);
        cleaned.push(`  Removed worktree: ${worker.branch}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push(`  Failed to remove ${worker.branch}: ${message}`);
      }
    }
  }

  // Clean up orphaned worktrees
  try {
    await removeAllWorktrees(session.projectRoot);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    errors.push(`  Failed to prune orphaned worktrees: ${message}`);
  }

  // Remove branches if requested
  if (input.remove_branches) {
    for (const worker of session.workers.values()) {
      try {
        await execFileAsync(
          "git",
          ["branch", "-D", worker.branch],
          { cwd: session.projectRoot }
        );
        cleaned.push(`  Deleted branch: ${worker.branch}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (!message.includes("not found")) {
          errors.push(`  Failed to delete branch ${worker.branch}: ${message}`);
        }
      }
    }
  }

  // Delete session
  deleteSession(input.session_id);

  return [
    `Session ${input.session_id} cleaned up.`,
    ...(cleaned.length > 0 ? ["", "Cleaned:", ...cleaned] : []),
    ...(errors.length > 0 ? ["", "Errors:", ...errors] : []),
  ].join("\n");
}
