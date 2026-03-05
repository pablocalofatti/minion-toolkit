import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, validateWorkerCount } from "../../src/config.js";

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
      maxWorkers: 3,
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

  it("should clamp MINION_MAX_WORKERS to minimum of 1", () => {
    process.env.MINION_MAX_WORKERS = "0";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(1);
  });

  it("should clamp MINION_MAX_WORKERS to minimum of 1 for negative values", () => {
    process.env.MINION_MAX_WORKERS = "-5";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(1);
  });

  it("should clamp MINION_MAX_WORKERS to maximum of 5", () => {
    process.env.MINION_MAX_WORKERS = "10";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(5);
  });

  it("should fall back to default when MINION_MAX_WORKERS is NaN", () => {
    process.env.MINION_MAX_WORKERS = "not-a-number";
    const config = loadConfig();
    expect(config.maxWorkers).toBe(3);
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

  it("should accept MINION_MAX_WORKERS at exact boundaries (1 and 5)", () => {
    process.env.MINION_MAX_WORKERS = "1";
    expect(loadConfig().maxWorkers).toBe(1);

    process.env.MINION_MAX_WORKERS = "5";
    expect(loadConfig().maxWorkers).toBe(5);
  });
});

describe("validateWorkerCount", () => {
  it("should return 3 for non-number input", () => {
    expect(validateWorkerCount("hello")).toBe(3);
    expect(validateWorkerCount(null)).toBe(3);
    expect(validateWorkerCount(undefined)).toBe(3);
  });

  it("should clamp to 1 for values below 1", () => {
    expect(validateWorkerCount(0)).toBe(1);
    expect(validateWorkerCount(-10)).toBe(1);
  });

  it("should clamp to 5 for values above 5", () => {
    expect(validateWorkerCount(10)).toBe(5);
    expect(validateWorkerCount(100)).toBe(5);
  });

  it("should return the value when within range", () => {
    expect(validateWorkerCount(3)).toBe(3);
    expect(validateWorkerCount(1)).toBe(1);
    expect(validateWorkerCount(5)).toBe(5);
  });
});
