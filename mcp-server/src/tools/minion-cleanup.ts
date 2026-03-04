import {
  getSession,
  deleteSession,
} from "../orchestrator/session-store.js";
import { removeWorktree, removeAllWorktrees } from "../git/worktree.js";

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
  } catch {
    // Best-effort
  }

  // Remove branches if requested
  if (input.remove_branches) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    for (const worker of session.workers.values()) {
      try {
        await execFileAsync(
          "git",
          ["branch", "-D", worker.branch],
          { cwd: session.projectRoot }
        );
        cleaned.push(`  Deleted branch: ${worker.branch}`);
      } catch {
        // Branch may not exist
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
