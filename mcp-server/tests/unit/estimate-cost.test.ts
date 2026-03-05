import { describe, it, expect } from "vitest";
import { estimateCost, TaskWave } from "../../src/orchestrator/estimate-cost.js";

describe("estimateCost", () => {
  const singleWave: TaskWave[] = [
    { tasks: [{ description: "Set up project structure" }] },
  ];

  it("should return one cost estimate per task", () => {
    const result = estimateCost(singleWave, "claude-sonnet-4-6", "claude-sonnet-4-6");
    expect(result.perTask).toHaveLength(1);
  });

  it("should compute task tokens as base + description.length * 2", () => {
    const description = "hello"; // length = 5
    const result = estimateCost(
      [{ tasks: [{ description }] }],
      "claude-sonnet-4-6",
      "claude-sonnet-4-6"
    );
    expect(result.perTask[0].tokens).toBe(4000 + 5 * 2);
  });

  it("should compute orchestrator tokens as 3000 + 500 * taskCount", () => {
    const waves: TaskWave[] = [
      { tasks: [{ description: "a" }, { description: "b" }] },
    ];
    // taskCount = 2, orchestrator tokens = 3000 + 500 * 2 = 4000
    const pricePerThousand = 0.015; // sonnet
    const result = estimateCost(waves, "claude-sonnet-4-6", "claude-sonnet-4-6");
    const expectedOrchestratorCost = (4000 / 1000) * pricePerThousand;
    expect(result.orchestratorCostUsd).toBeCloseTo(expectedOrchestratorCost);
  });

  it("should use opus pricing (0.075/1K) for opus model", () => {
    const description = ""; // tokens = 4000
    const result = estimateCost(
      [{ tasks: [{ description }] }],
      "claude-sonnet-4-6",
      "claude-opus-4-6"
    );
    const expectedCost = (4000 / 1000) * 0.075;
    expect(result.perTask[0].costUsd).toBeCloseTo(expectedCost);
  });

  it("should use sonnet pricing (0.015/1K) for sonnet model", () => {
    const description = ""; // tokens = 4000
    const result = estimateCost(
      [{ tasks: [{ description }] }],
      "claude-opus-4-6",
      "claude-sonnet-4-6"
    );
    const expectedCost = (4000 / 1000) * 0.015;
    expect(result.perTask[0].costUsd).toBeCloseTo(expectedCost);
  });

  it("should use haiku pricing (0.005/1K) for haiku model", () => {
    const description = ""; // tokens = 4000
    const result = estimateCost(
      [{ tasks: [{ description }] }],
      "claude-opus-4-6",
      "claude-haiku-4-5"
    );
    const expectedCost = (4000 / 1000) * 0.005;
    expect(result.perTask[0].costUsd).toBeCloseTo(expectedCost);
  });

  it("should default to sonnet pricing for unknown model", () => {
    const description = ""; // tokens = 4000
    const result = estimateCost(
      [{ tasks: [{ description }] }],
      "unknown-model",
      "unknown-model"
    );
    const expectedWorkerCost = (4000 / 1000) * 0.015;
    expect(result.perTask[0].costUsd).toBeCloseTo(expectedWorkerCost);
  });

  it("should include orchestratorCostUsd using orchestrator model pricing", () => {
    const result = estimateCost(
      [{ tasks: [{ description: "" }] }],
      "claude-opus-4-6",
      "claude-sonnet-4-6"
    );
    // orchestrator tokens = 3000 + 500*1 = 3500, price = 0.075
    const expectedOrchestratorCost = (3500 / 1000) * 0.075;
    expect(result.orchestratorCostUsd).toBeCloseTo(expectedOrchestratorCost);
  });

  it("should compute totalCostUsd as sum of task costs + orchestrator cost", () => {
    const result = estimateCost(
      [{ tasks: [{ description: "" }, { description: "" }] }],
      "claude-sonnet-4-6",
      "claude-sonnet-4-6"
    );
    const sum = result.perTask.reduce((acc, t) => acc + t.costUsd, 0) + result.orchestratorCostUsd;
    expect(result.totalCostUsd).toBeCloseTo(sum);
  });

  it("should handle multiple waves by flattening tasks", () => {
    const waves: TaskWave[] = [
      { tasks: [{ description: "task A" }] },
      { tasks: [{ description: "task B" }, { description: "task C" }] },
    ];
    const result = estimateCost(waves, "claude-sonnet-4-6", "claude-sonnet-4-6");
    expect(result.perTask).toHaveLength(3);
  });

  it("should assign sequential taskIndex values across waves", () => {
    const waves: TaskWave[] = [
      { tasks: [{ description: "a" }] },
      { tasks: [{ description: "b" }] },
    ];
    const result = estimateCost(waves, "claude-sonnet-4-6", "claude-sonnet-4-6");
    expect(result.perTask[0].taskIndex).toBe(0);
    expect(result.perTask[1].taskIndex).toBe(1);
  });

  it("should handle empty waves array", () => {
    const result = estimateCost([], "claude-sonnet-4-6", "claude-sonnet-4-6");
    expect(result.perTask).toHaveLength(0);
    // orchestrator cost = (3000 + 500*0) / 1000 * 0.015
    const expectedOrchestratorCost = (3000 / 1000) * 0.015;
    expect(result.orchestratorCostUsd).toBeCloseTo(expectedOrchestratorCost);
    expect(result.totalCostUsd).toBeCloseTo(expectedOrchestratorCost);
  });

  it("should handle empty tasks array within a wave", () => {
    const result = estimateCost([{ tasks: [] }], "claude-sonnet-4-6", "claude-sonnet-4-6");
    expect(result.perTask).toHaveLength(0);
  });
});
