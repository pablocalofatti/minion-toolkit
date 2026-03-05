import { MinionConfig } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6-20250514";
const DEFAULT_MAX_WORKERS = 3;
const MIN_WORKERS = 1;
const MAX_WORKERS = 5;
const DEFAULT_WORKER_MAX_TOKENS = 16384;
const DEFAULT_WORKER_MAX_ITERATIONS = 40;
const DEFAULT_WORKER_TIMEOUT_MS = 900_000; // 15 minutes

export function loadConfig(): MinionConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required. " +
        "Set it in your MCP server configuration."
    );
  }

  const rawMaxWorkers = parseInt(
    process.env.MINION_MAX_WORKERS ?? String(DEFAULT_MAX_WORKERS),
    10
  );
  const maxWorkers = Math.min(
    MAX_WORKERS,
    Math.max(MIN_WORKERS, isNaN(rawMaxWorkers) ? DEFAULT_MAX_WORKERS : rawMaxWorkers)
  );

  return {
    anthropicApiKey: apiKey,
    model: process.env.MINION_MODEL ?? DEFAULT_MODEL,
    maxWorkers,
    workerMaxTokens: parseIntEnv(
      "MINION_WORKER_MAX_TOKENS",
      DEFAULT_WORKER_MAX_TOKENS
    ),
    workerMaxIterations: parseIntEnv(
      "MINION_WORKER_MAX_ITERATIONS",
      DEFAULT_WORKER_MAX_ITERATIONS
    ),
    workerTimeoutMs: parseIntEnv(
      "MINION_WORKER_TIMEOUT_MS",
      DEFAULT_WORKER_TIMEOUT_MS
    ),
  };
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export const HIGH_ITERATION_THRESHOLD = 100;
export const MID_ITERATION_THRESHOLD = 50;
export const TIMEOUT_30_MIN_MS = 1_800_000;
export const TIMEOUT_15_MIN_MS = 900_000;
export const TIMEOUT_5_MIN_MS = 300_000;

export function getWorkerTimeout(iterations: number): number {
  if (iterations <= 0) {
    throw new Error(`iterations must be positive, got ${iterations}`);
  }
  if (iterations > HIGH_ITERATION_THRESHOLD) {
    return TIMEOUT_30_MIN_MS;
  }
  if (iterations > MID_ITERATION_THRESHOLD) {
    return TIMEOUT_15_MIN_MS;
  }
  return TIMEOUT_5_MIN_MS;
}
