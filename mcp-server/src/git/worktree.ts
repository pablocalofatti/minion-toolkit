import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const WORKTREE_DIR = ".minion-worktrees";

export function getWorktreePath(
  projectRoot: string,
  branch: string
): string {
  return join(projectRoot, WORKTREE_DIR, branch.replace(/\//g, "-"));
}

export async function createWorktree(
  projectRoot: string,
  branch: string,
  baseBranch: string
): Promise<string> {
  const worktreePath = getWorktreePath(projectRoot, branch);

  await mkdir(join(projectRoot, WORKTREE_DIR), { recursive: true });

  await execFileAsync(
    "git",
    ["worktree", "add", "-b", branch, worktreePath, baseBranch],
    { cwd: projectRoot }
  );

  return worktreePath;
}

export async function removeWorktree(
  projectRoot: string,
  branch: string
): Promise<void> {
  const worktreePath = getWorktreePath(projectRoot, branch);

  try {
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], {
      cwd: projectRoot,
    });
  } catch {
    // Worktree may already be removed — clean up directory manually
    await rm(worktreePath, { recursive: true, force: true });
    await execFileAsync("git", ["worktree", "prune"], { cwd: projectRoot });
  }
}

export async function removeAllWorktrees(projectRoot: string): Promise<void> {
  const worktreeDir = join(projectRoot, WORKTREE_DIR);

  try {
    await rm(worktreeDir, { recursive: true, force: true });
    await execFileAsync("git", ["worktree", "prune"], { cwd: projectRoot });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown cleanup error";
    console.error(`removeAllWorktrees failed for ${projectRoot}: ${message}`);
  }
}
