import { ParsedTask } from "../types.js";

const TASK_HEADING_RE = /^###\s+Task\s+(\d+):\s*(.+)$/;
const FILES_LINE_RE = /^\*\*Files?:\*\*\s*(.+)$/;
const DEPENDS_LINE_RE = /^\*\*Depends:\*\*\s*(.+)$|^Depends:\s*(.+)$/;
const TASK_REF_PATTERN = /Task\s+(\d+)/gi;
const SKIP_MARKERS = ["[DONE]", "[SKIP]"];

function extractSkipAndTitle(rawTitle: string): {
  title: string;
  skip: boolean;
} {
  const upperTitle = rawTitle.toUpperCase();
  const skip = SKIP_MARKERS.some((marker) => upperTitle.includes(marker));
  const title = rawTitle
    .replace(/\[DONE\]/gi, "")
    .replace(/\[SKIP\]/gi, "")
    .trim();
  return { title, skip };
}

function parseDependsLine(value: string): number[] {
  const deps: number[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TASK_REF_PATTERN.source, "gi");
  while ((match = re.exec(value)) !== null) {
    deps.push(parseInt(match[1], 10));
  }
  return deps;
}

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
      const { title, skip } = extractSkipAndTitle(headingMatch[2]);
      current = {
        number: parseInt(headingMatch[1], 10),
        title,
        description: "",
        files: [],
        dependsOn: [],
        skip,
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

    const dependsMatch = line.match(DEPENDS_LINE_RE);
    if (dependsMatch) {
      const value = dependsMatch[1] ?? dependsMatch[2];
      current.dependsOn = parseDependsLine(value);
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
