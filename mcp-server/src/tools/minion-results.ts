import { getSession } from "../orchestrator/session-store.js";

const MS_PER_SECOND = 1000;

interface ResultsInput {
  session_id: string;
}

export function minionResults(input: ResultsInput): string {
  const session = getSession(input.session_id);
  if (!session) {
    return `Session not found: ${input.session_id}`;
  }

  const allDone = Array.from(session.workers.values()).every(
    (w) =>
      w.state === "completed" ||
      w.state === "failed" ||
      w.state === "cancelled"
  );

  if (!allDone) {
    return `Session ${session.id} is still in progress. Use minion_status() to check.`;
  }

  const results = Array.from(session.results.values()).sort(
    (a, b) => a.taskNumber - b.taskNumber
  );

  const rows = results.map((r) => {
    const status = r.state === "completed" ? "SUCCESS" : r.state.toUpperCase();
    const duration = `${Math.round(r.duration / MS_PER_SECOND)}s`;
    const files =
      r.filesChanged.length > 0
        ? r.filesChanged.join(", ")
        : "(none detected)";

    return [
      `--- Task ${r.taskNumber}: ${r.taskTitle} ---`,
      `  Status: ${status}`,
      `  Branch: ${r.branch}`,
      `  Duration: ${duration} (${r.iterations} iterations)`,
      `  Files changed: ${files}`,
      r.error ? `  Error: ${r.error}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const succeeded = results.filter((r) => r.state === "completed").length;
  const failed = results.filter((r) => r.state === "failed").length;

  const successBranches = results
    .filter((r) => r.state === "completed")
    .map((r) => r.branch);

  return [
    `Session ${session.id} — Results`,
    `${succeeded} succeeded, ${failed} failed`,
    ``,
    ...rows,
    ``,
    successBranches.length > 0
      ? `Successful branches:\n${successBranches.map((b) => `  - ${b}`).join("\n")}\n\nUse minion_create_prs("${session.id}") to create pull requests.`
      : "No successful branches to create PRs for.",
    ``,
    `Use minion_cleanup("${session.id}") to remove worktrees.`,
  ].join("\n");
}
