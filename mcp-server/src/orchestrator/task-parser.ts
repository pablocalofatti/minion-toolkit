import { ParsedTask } from "../types.js";

const TASK_HEADING_RE = /^###\s+Task\s+(\d+):\s*(.+)$/;
const FILES_LINE_RE = /^\*\*Files?:\*\*\s*(.+)$/;

export function parseTasks(markdown: string): ParsedTask[] {
  const lines = markdown.split("\n");
  const tasks: ParsedTask[] = [];
  let current: ParsedTask | null = null;
  const descriptionLines: string[] = [];

  function flushCurrent(): void {
    if (current) {
      current.description = descriptionLines.join("\n").trim();
      tasks.push(current);
      descriptionLines.length = 0;
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(TASK_HEADING_RE);
    if (headingMatch) {
      flushCurrent();
      current = {
        number: parseInt(headingMatch[1], 10),
        title: headingMatch[2].trim(),
        description: "",
        files: [],
      };
      continue;
    }

    if (!current) continue;

    const filesMatch = line.match(FILES_LINE_RE);
    if (filesMatch) {
      current.files = filesMatch[1]
        .split(",")
        .map((f) => f.replace(/`/g, "").trim())
        .filter(Boolean);
      continue;
    }

    descriptionLines.push(line);
  }

  flushCurrent();

  if (tasks.length === 0) {
    throw new Error(
      "No tasks found. Expected markdown with ### Task N: headings."
    );
  }

  return tasks;
}
