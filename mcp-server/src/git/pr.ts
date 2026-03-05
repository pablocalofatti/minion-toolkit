import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface CreatePROptions {
  projectRoot: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
}

interface PRResult {
  url: string;
  number: number;
}

export async function createPullRequest(
  options: CreatePROptions
): Promise<PRResult> {
  const { projectRoot, branch, baseBranch, title, body } = options;

  // Push the branch first
  await execFileAsync("git", ["push", "-u", "origin", branch], {
    cwd: projectRoot,
  });

  // Create the PR via gh CLI
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "create",
      "--base",
      baseBranch,
      "--head",
      branch,
      "--title",
      title,
      "--body",
      body,
    ],
    { cwd: projectRoot }
  );

  const url = stdout.trim();
  const lastSegment = url.split("/").pop();
  const prNumber = lastSegment ? parseInt(lastSegment, 10) : 0;

  return { url, number: prNumber };
}
