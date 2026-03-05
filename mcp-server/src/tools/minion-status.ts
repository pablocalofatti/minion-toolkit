import { getSession } from "../orchestrator/session-store.js";
import { WorkerState } from "../types.js";

const MS_PER_SECOND = 1000;

interface StatusInput {
  session_id: string;
}

export function minionStatus(input: StatusInput): string {
  const session = getSession(input.session_id);
  if (!session) {
    return `Session not found: ${input.session_id}`;
  }

  const stateEmoji: Record<WorkerState, string> = {
    queued: "[QUEUED]",
    running: "[RUNNING]",
    completed: "[DONE]",
    failed: "[FAILED]",
    cancelled: "[CANCELLED]",
  };

  const elapsed = Math.round((Date.now() - session.startedAt) / MS_PER_SECOND);

  const rows = Array.from(session.workers.values())
    .sort((a, b) => a.taskNumber - b.taskNumber)
    .map((w) => {
      const status = stateEmoji[w.state];
      const iter =
        w.state === "running"
          ? ` (iteration ${w.iteration}/${w.maxIterations})`
          : "";
      const err = w.error ? ` - ${w.error}` : "";
      return `  ${status} Task ${w.taskNumber}: ${w.taskTitle}${iter}${err}`;
    });

  const counts = Array.from(session.workers.values()).reduce(
    (acc, w) => {
      acc[w.state] = (acc[w.state] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const summary = Object.entries(counts)
    .map(([state, count]) => `${count} ${state}`)
    .join(", ");

  const allDone = Array.from(session.workers.values()).every(
    (w) => w.state === "completed" || w.state === "failed" || w.state === "cancelled"
  );

  return [
    `Session: ${session.id} (${elapsed}s elapsed)`,
    `Status: ${allDone ? "FINISHED" : "IN PROGRESS"} — ${summary}`,
    ``,
    ...rows,
    ``,
    allDone
      ? `All workers finished. Use minion_results("${session.id}") for details.`
      : `Poll again with minion_status("${session.id}").`,
  ].join("\n");
}
