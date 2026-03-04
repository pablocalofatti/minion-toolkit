import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { ProjectCommands } from "../types.js";

type PackageManager = ProjectCommands["packageManager"];

const LOCKFILE_MAP: Record<string, PackageManager> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
};

export async function detectCommands(
  projectRoot: string
): Promise<ProjectCommands> {
  const packageManager = await detectPackageManager(projectRoot);
  const run = packageManager === "npm" ? "npm run" : packageManager;

  const scripts = await readPackageScripts(projectRoot);

  return {
    packageManager,
    install: `${packageManager} install`,
    lint: scripts.has("lint") ? `${run} lint` : null,
    test: scripts.has("test") ? `${run} test` : null,
    build: scripts.has("build") ? `${run} build` : null,
    format: scripts.has("format") ? `${run} format` : null,
  };
}

async function detectPackageManager(
  projectRoot: string
): Promise<PackageManager> {
  for (const [lockfile, manager] of Object.entries(LOCKFILE_MAP)) {
    try {
      await access(join(projectRoot, lockfile));
      return manager;
    } catch {
      // Lockfile not found, try next
    }
  }
  return "npm";
}

async function readPackageScripts(
  projectRoot: string
): Promise<Set<string>> {
  try {
    const raw = await readFile(join(projectRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}
