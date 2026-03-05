import { describe, it, expect } from "vitest";
import {
  integrationReport,
  ReportResult,
  ReportViolation,
} from "../../src/orchestrator/integration-report.js";

const makeResult = (
  taskNumber: number,
  state: ReportResult["state"] = "completed",
  filesChanged: string[] = [],
  branch = `feat/task-${taskNumber}`,
  taskTitle = `Task ${taskNumber}`
): ReportResult => ({ taskNumber, taskTitle, state, branch, filesChanged });

const makeViolation = (
  taskNumber: number,
  outOfScopeFiles: string[],
  taskTitle = `Task ${taskNumber}`
): ReportViolation => ({ taskNumber, taskTitle, outOfScopeFiles });

describe("integrationReport", () => {
  it("should return a markdown string and stats object", () => {
    const { markdown, stats } = integrationReport([makeResult(1)], []);
    expect(typeof markdown).toBe("string");
    expect(typeof stats).toBe("object");
  });

  it("should include the table header in the markdown", () => {
    const { markdown } = integrationReport([makeResult(1)], []);
    expect(markdown).toContain("| Task | Status | Branch | Files | Scope |");
    expect(markdown).toContain("|------|--------|--------|-------|-------|");
  });

  it("should count total tasks in stats", () => {
    const results = [makeResult(1), makeResult(2), makeResult(3)];
    const { stats } = integrationReport(results, []);
    expect(stats.total).toBe(3);
  });

  it("should count successful (completed) tasks", () => {
    const results = [makeResult(1, "completed"), makeResult(2, "failed")];
    const { stats } = integrationReport(results, []);
    expect(stats.successful).toBe(1);
  });

  it("should count failed and cancelled tasks together", () => {
    const results = [
      makeResult(1, "failed"),
      makeResult(2, "cancelled"),
      makeResult(3, "completed"),
    ];
    const { stats } = integrationReport(results, []);
    expect(stats.failed).toBe(2);
  });

  it("should count scope violations from violations array", () => {
    const results = [makeResult(1), makeResult(2)];
    const violations = [makeViolation(1, ["src/bad.ts"])];
    const { stats } = integrationReport(results, violations);
    expect(stats.scopeViolations).toBe(1);
  });

  it("should mark violated task row with out-of-scope count", () => {
    const results = [makeResult(1, "completed", ["src/a.ts", "src/b.ts"])];
    const violations = [makeViolation(1, ["src/b.ts"])];
    const { markdown } = integrationReport(results, violations);
    expect(markdown).toContain("WARN: 1 out-of-scope");
  });

  it("should mark clean task row with 'clean'", () => {
    const results = [makeResult(1, "completed", ["src/a.ts"])];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("clean");
  });

  it("should show '(none)' for tasks with no changed files", () => {
    const results = [makeResult(1, "completed", [])];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("(none)");
  });

  it("should include branch name in the table row", () => {
    const results = [makeResult(1, "completed", [], "feat/my-branch")];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("feat/my-branch");
  });

  it("should include a scope warnings section when violations exist", () => {
    const results = [makeResult(1)];
    const violations = [makeViolation(1, ["src/unauthorized.ts"])];
    const { markdown } = integrationReport(results, violations);
    expect(markdown).toContain("## Scope Warnings");
    expect(markdown).toContain("`src/unauthorized.ts`");
  });

  it("should NOT include scope warnings section when no violations", () => {
    const results = [makeResult(1)];
    const { markdown } = integrationReport(results, []);
    expect(markdown).not.toContain("## Scope Warnings");
  });

  it("should include task title in violations warning section", () => {
    const results = [makeResult(1, "completed", [], "feat/task-1", "My Feature")];
    const violations = [makeViolation(1, ["bad.ts"], "My Feature")];
    const { markdown } = integrationReport(results, violations);
    expect(markdown).toContain("My Feature");
  });

  it("should return zero stats for empty results", () => {
    const { stats } = integrationReport([], []);
    expect(stats.total).toBe(0);
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.scopeViolations).toBe(0);
  });

  it("should show 'success' status for completed tasks", () => {
    const results = [makeResult(1, "completed")];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("success");
  });

  it("should show 'FAILED' status for failed tasks", () => {
    const results = [makeResult(1, "failed")];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("FAILED");
  });

  it("should show 'CANCELLED' status for cancelled tasks", () => {
    const results = [makeResult(1, "cancelled")];
    const { markdown } = integrationReport(results, []);
    expect(markdown).toContain("CANCELLED");
  });

  it("should list multiple out-of-scope files in warnings", () => {
    const results = [makeResult(1)];
    const violations = [makeViolation(1, ["src/a.ts", "src/b.ts"])];
    const { markdown } = integrationReport(results, violations);
    expect(markdown).toContain("`src/a.ts`");
    expect(markdown).toContain("`src/b.ts`");
  });

  it("should handle multiple results and violations correctly", () => {
    const results = [
      makeResult(1, "completed"),
      makeResult(2, "failed"),
      makeResult(3, "completed"),
    ];
    const violations = [
      makeViolation(1, ["extra.ts"]),
      makeViolation(3, ["other.ts"]),
    ];
    const { stats } = integrationReport(results, violations);
    expect(stats.total).toBe(3);
    expect(stats.successful).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.scopeViolations).toBe(2);
  });
});
