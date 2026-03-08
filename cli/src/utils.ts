import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

export const CLAUDE_DIR = join(homedir(), ".claude");

export const ASSET_DIRS = {
  commands: join(CLAUDE_DIR, "commands"),
  agents: join(CLAUDE_DIR, "agents"),
  workflows: join(CLAUDE_DIR, "workflows"),
  skills: join(CLAUDE_DIR, "skills", "minion-blueprint"),
} as const;

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function runCommand(
  cmd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? "").trim(),
      exitCode: err.code ?? 1,
    };
  }
}

export function log(msg: string): void {
  console.log(msg);
}

export function logSuccess(msg: string): void {
  console.log(`✓ ${msg}`);
}

export function logWarn(msg: string): void {
  console.log(`⚠ ${msg}`);
}

export function logError(msg: string): void {
  console.error(`✗ ${msg}`);
}
