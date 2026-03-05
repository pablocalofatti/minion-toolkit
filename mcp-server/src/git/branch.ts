const BRANCH_PREFIX = "minion";
const MAX_SLUG_LENGTH = 40;

export function buildBranchName(taskNumber: number, taskTitle: string): string {
  const slug = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");

  return `${BRANCH_PREFIX}/task-${taskNumber}-${slug}`;
}
