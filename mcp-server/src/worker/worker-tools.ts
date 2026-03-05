import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, relative, isAbsolute } from "node:path";

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_LENGTH = 8_000;

function safePath(worktreeRoot: string, filePath: string): string {
  const resolved = isAbsolute(filePath)
    ? resolve(filePath)
    : resolve(worktreeRoot, filePath);
  const rel = relative(worktreeRoot, resolved);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Path "${filePath}" resolves outside the worktree. All paths must be relative to the project root.`
    );
  }

  return resolved;
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return (
    output.slice(0, MAX_OUTPUT_LENGTH) +
    `\n... (truncated, ${output.length - MAX_OUTPUT_LENGTH} chars omitted)`
  );
}

// --- Tool definitions for the Anthropic API ---

export const WORKER_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Path must be relative to the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a file, creating directories as needed. Path must be relative to the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace an exact string in a file. old_string must match exactly (including whitespace). Path must be relative to the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative file path" },
        old_string: { type: "string", description: "Exact string to find" },
        new_string: { type: "string", description: "Replacement string" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "run_command",
    description:
      "Execute a shell command in the project root. Use for git, build tools, tests, etc. Timeout: 30s.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "list_directory",
    description:
      "List files and directories at a path. Path must be relative to the project root.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative directory path (default: '.')",
        },
      },
      required: [],
    },
  },
  {
    name: "search_files",
    description:
      "Search for a pattern in files using grep. Returns matching lines with file paths.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        glob: {
          type: "string",
          description: "File glob to filter (e.g. '*.ts'). Default: all files",
        },
      },
      required: ["pattern"],
    },
  },
];

// --- Tool execution ---

interface ToolInput {
  path?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  command?: string;
  pattern?: string;
  glob?: string;
}

export async function executeWorkerTool(
  worktreeRoot: string,
  toolName: string,
  input: ToolInput
): Promise<string> {
  switch (toolName) {
    case "read_file":
      return readFileTool(worktreeRoot, input.path ?? "");
    case "write_file":
      return writeFileTool(worktreeRoot, input.path ?? "", input.content ?? "");
    case "edit_file":
      return editFileTool(
        worktreeRoot,
        input.path ?? "",
        input.old_string ?? "",
        input.new_string ?? ""
      );
    case "run_command":
      return runCommandTool(worktreeRoot, input.command ?? "");
    case "list_directory":
      return listDirectoryTool(worktreeRoot, input.path ?? ".");
    case "search_files":
      return searchFilesTool(worktreeRoot, input.pattern ?? "", input.glob);
    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function readFileTool(
  worktreeRoot: string,
  path: string
): Promise<string> {
  const fullPath = safePath(worktreeRoot, path);
  const content = await readFile(fullPath, "utf-8");
  return truncateOutput(content);
}

async function writeFileTool(
  worktreeRoot: string,
  path: string,
  content: string
): Promise<string> {
  const fullPath = safePath(worktreeRoot, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, content, "utf-8");
  return `File written: ${path}`;
}

async function editFileTool(
  worktreeRoot: string,
  path: string,
  oldString: string,
  newString: string
): Promise<string> {
  const fullPath = safePath(worktreeRoot, path);
  const content = await readFile(fullPath, "utf-8");

  if (!content.includes(oldString)) {
    return `Error: old_string not found in ${path}. Make sure it matches exactly, including whitespace.`;
  }

  const occurrences = content.split(oldString).length - 1;
  if (occurrences > 1) {
    return `Error: old_string found ${occurrences} times in ${path}. Provide a more specific match.`;
  }

  const updated = content.replace(oldString, newString);
  await writeFile(fullPath, updated, "utf-8");
  return `File edited: ${path}`;
}

async function runCommandTool(
  worktreeRoot: string,
  command: string
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
      cwd: worktreeRoot,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const output = [stdout, stderr].filter(Boolean).join("\n");
    return truncateOutput(output || "(no output)");
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      message: string;
    };
    const output = [execErr.stdout, execErr.stderr, execErr.message]
      .filter(Boolean)
      .join("\n");
    return truncateOutput(`Command failed:\n${output}`);
  }
}

async function listDirectoryTool(
  worktreeRoot: string,
  path: string
): Promise<string> {
  const fullPath = safePath(worktreeRoot, path);
  const entries = await readdir(fullPath, { withFileTypes: true });

  const lines = entries.map((e) =>
    e.isDirectory() ? `${e.name}/` : e.name
  );
  return lines.join("\n") || "(empty directory)";
}

async function searchFilesTool(
  worktreeRoot: string,
  pattern: string,
  glob?: string
): Promise<string> {
  const args = ["-rn", "--color=never", "--max-count=50"];
  if (glob) {
    args.push("--include", glob);
  }
  args.push(pattern, ".");

  try {
    const { stdout } = await execFileAsync("grep", args, {
      cwd: worktreeRoot,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return truncateOutput(stdout);
  } catch {
    return "No matches found.";
  }
}
