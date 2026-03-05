import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadConfig,
  validateWorkerCount,
  DEFAULT_MAX_WORKERS,
  MIN_WORKERS,
  MAX_WORKERS,
} from "../../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a clean env with only the required key
    process.env = { ...originalEnv };
    // Remove all MINION_ keys to avoid leaking between tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MINION_")) {
        delete process.env[key];
      }
    }
    process.env.ANTHROPIC_API_KEY = "test-api-key-123";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw when ANTHROPIC_API_KEY is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow(
      "ANTHROPIC_API_KEY environment variable is required"
    );
  });

  it("should return default values when only ANTHROPIC_API_KEY is set", () => {
    const config = loadConfig();
    expect(config).toEqual({
      anthropicApiKey: "test-api-key-123",
      model: "claude-sonnet-4-6-20250514",
      maxWorkers: DEFAULT_MAX_WORKERS,
      workerMaxTokens: 16384,
      workerMaxIterations: 40,
      workerTimeoutMs: 900_000,
    });
  });

  it("should use custom MINION_MODEL when set", () => {
    process.env.MINION_MODEL = "claude-opus-4-6-20250514";
    const config = loadConfig();
    expect(config.model).toBe("claude-opus-4-6-20250514");
  });

  it("should use custom MINION_MAX_WORKERS when set", () => {
    process.env.MINION_MAX_WORKERS = "4";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(4);
  });

  it("should clamp MINION_MAX_WORKERS to minimum of MIN_WORKERS", () => {
    process.env.MINION_MAX_WORKERS = "0";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(MIN_WORKERS);
  });

  it("should clamp MINION_MAX_WORKERS to minimum of MIN_WORKERS for negative values", () => {
    process.env.MINION_MAX_WORKERS = "-5";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(MIN_WORKERS);
  });

  it("should clamp MINION_MAX_WORKERS to maximum of MAX_WORKERS", () => {
    process.env.MINION_MAX_WORKERS = "10";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(MAX_WORKERS);
  });

  it("should fall back to DEFAULT_MAX_WORKERS when MINION_MAX_WORKERS is NaN", () => {
    process.env.MINION_MAX_WORKERS = "not-a-number";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(DEFAULT_MAX_WORKERS);
  });

  it("should use custom MINION_WORKER_MAX_TOKENS when set", () => {
    process.env.MINION_WORKER_MAX_TOKENS = "8192";
    const config = loadConfig();
    expect(config.workerMaxTokens).toBe(8192);
  });

  it("should use custom MINION_WORKER_MAX_ITERATIONS when set", () => {
    process.env.MINION_WORKER_MAX_ITERATIONS = "20";
    const config = loadConfig();
    expect(config.workerMaxIterations).toBe(20);
  });

  it("should use custom MINION_WORKER_TIMEOUT_MS when set", () => {
    process.env.MINION_WORKER_TIMEOUT_MS = "600000";
    const config = loadConfig();
    expect(config.workerTimeoutMs).toBe(600_000);
  });

  it("should fall back to default when MINION_WORKER_MAX_TOKENS is NaN", () => {
    process.env.MINION_WORKER_MAX_TOKENS = "abc";
    const config = loadConfig();
    expect(config.workerMaxTokens).toBe(16384);
  });

  it("should fall back to default when MINION_WORKER_MAX_ITERATIONS is NaN", () => {
    process.env.MINION_WORKER_MAX_ITERATIONS = "xyz";
    const config = loadConfig();
    expect(config.workerMaxIterations).toBe(40);
  });

  it("should fall back to default when MINION_WORKER_TIMEOUT_MS is NaN", () => {
    process.env.MINION_WORKER_TIMEOUT_MS = "invalid";
    const config = loadConfig();
    expect(config.workerTimeoutMs).toBe(900_000);
  });

  it("should fall back to default when env var is an empty string", () => {
    process.env.MINION_WORKER_MAX_TOKENS = "";
    process.env.MINION_WORKER_MAX_ITERATIONS = "";
    process.env.MINION_WORKER_TIMEOUT_MS = "";
    const config = loadConfig();
    expect(config.workerMaxTokens).toBe(16384);
    expect(config.workerMaxIterations).toBe(40);
    expect(config.workerTimeoutMs).toBe(900_000);
  });

  it("should use all custom values when every env var is set", () => {
    process.env.MINION_MODEL = "custom-model";
    process.env.MINION_MAX_WORKERS = "2";
    process.env.MINION_WORKER_MAX_TOKENS = "4096";
    process.env.MINION_WORKER_MAX_ITERATIONS = "10";
    process.env.MINION_WORKER_TIMEOUT_MS = "300000";

    const config = loadConfig();
    expect(config).toEqual({
      anthropicApiKey: "test-api-key-123",
      model: "custom-model",
      maxWorkers: 2,
      workerMaxTokens: 4096,
      workerMaxIterations: 10,
      workerTimeoutMs: 300_000,
    });
  });

  it("should accept MINION_MAX_WORKERS at exact boundaries (MIN_WORKERS and MAX_WORKERS)", () => {
    process.env.MINION_MAX_WORKERS = String(MIN_WORKERS);
    expect(loadConfig().maxWorkers).toBe(MIN_WORKERS);

    process.env.MINION_MAX_WORKERS = String(MAX_WORKERS);
    expect(loadConfig().maxWorkers).toBe(MAX_WORKERS);
  });
});

describe("validateWorkerCount", () => {
  it("should return DEFAULT_MAX_WORKERS for non-number input", () => {
    expect(validateWorkerCount("hello")).toBe(DEFAULT_MAX_WORKERS);
    expect(validateWorkerCount(null)).toBe(DEFAULT_MAX_WORKERS);
    expect(validateWorkerCount(undefined)).toBe(DEFAULT_MAX_WORKERS);
  });

  it("should return DEFAULT_MAX_WORKERS for NaN", () => {
    expect(validateWorkerCount(NaN)).toBe(DEFAULT_MAX_WORKERS);
  });

  it("should return DEFAULT_MAX_WORKERS for non-finite numbers", () => {
    expect(validateWorkerCount(Infinity)).toBe(DEFAULT_MAX_WORKERS);
    expect(validateWorkerCount(-Infinity)).toBe(DEFAULT_MAX_WORKERS);
  });

  it("should clamp to MIN_WORKERS for values below MIN_WORKERS", () => {
    expect(validateWorkerCount(0)).toBe(MIN_WORKERS);
    expect(validateWorkerCount(-10)).toBe(MIN_WORKERS);
  });

  it("should clamp to MAX_WORKERS for values above MAX_WORKERS", () => {
    expect(validateWorkerCount(10)).toBe(MAX_WORKERS);
    expect(validateWorkerCount(100)).toBe(MAX_WORKERS);
  });

  it("should return the value when within range", () => {
    expect(validateWorkerCount(DEFAULT_MAX_WORKERS)).toBe(DEFAULT_MAX_WORKERS);
    expect(validateWorkerCount(MIN_WORKERS)).toBe(MIN_WORKERS);
    expect(validateWorkerCount(MAX_WORKERS)).toBe(MAX_WORKERS);
  });

  it("should floor float values", () => {
    expect(validateWorkerCount(2.7)).toBe(2);
    expect(validateWorkerCount(1.9)).toBe(1);
    expect(validateWorkerCount(4.1)).toBe(4);
  });

  it("should clamp floored float values to range", () => {
    expect(validateWorkerCount(0.9)).toBe(MIN_WORKERS);
    expect(validateWorkerCount(5.8)).toBe(MAX_WORKERS);
  });
});
