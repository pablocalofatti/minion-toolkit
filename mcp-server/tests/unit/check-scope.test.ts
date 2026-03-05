import { describe, it, expect } from "vitest";
import { checkScope, TaskResult, ScopedTask } from "../../src/orchestrator/check-scope.js";

const makeResult = (
  taskNumber: number,
  filesChanged: string[],
  taskTitle = `Task ${taskNumber}`
): TaskResult => ({ taskNumber, taskTitle, filesChanged });

const makeTask = (number: number, files: string[]): ScopedTask => ({
  number,
  files,
});

describe("checkScope", () => {
  it("should return no violations when all changed files are declared", () => {
    const results = [makeResult(1, ["src/index.ts", "src/utils.ts"])];
    const tasks = [makeTask(1, ["src/index.ts", "src/utils.ts"])];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(0);
    expect(cleanCount).toBe(1);
  });

  it("should detect out-of-scope files", () => {
    const results = [makeResult(1, ["src/index.ts", "src/extra.ts"])];
    const tasks = [makeTask(1, ["src/index.ts"])];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(1);
    expect(violations[0].outOfScopeFiles).toEqual(["src/extra.ts"]);
    expect(cleanCount).toBe(0);
  });

  it("should skip scope check for tasks with no declared files", () => {
    const results = [makeResult(1, ["anything.ts"])];
    const tasks = [makeTask(1, [])];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(0);
    expect(cleanCount).toBe(1);
  });

  it("should skip scope check for tasks not in tasks list", () => {
    const results = [makeResult(99, ["some/file.ts"])];
    const tasks = [makeTask(1, ["src/index.ts"])];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(0);
    expect(cleanCount).toBe(1);
  });

  it("should handle multiple tasks, some with violations", () => {
    const results = [
      makeResult(1, ["src/a.ts"]),
      makeResult(2, ["src/b.ts", "src/c.ts"]),
    ];
    const tasks = [
      makeTask(1, ["src/a.ts"]),
      makeTask(2, ["src/b.ts"]),
    ];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(1);
    expect(violations[0].taskNumber).toBe(2);
    expect(violations[0].outOfScopeFiles).toEqual(["src/c.ts"]);
    expect(cleanCount).toBe(1);
  });

  it("should return cleanCount = 0 and violations = [] for empty results", () => {
    const { violations, cleanCount } = checkScope([], []);
    expect(violations).toHaveLength(0);
    expect(cleanCount).toBe(0);
  });

  it("should include taskTitle in violations", () => {
    const results = [makeResult(1, ["src/unauthorized.ts"], "My Task")];
    const tasks = [makeTask(1, ["src/authorized.ts"])];
    const { violations } = checkScope(results, tasks);
    expect(violations[0].taskTitle).toBe("My Task");
  });

  it("should include all out-of-scope files in violation, not just the first", () => {
    const results = [makeResult(1, ["src/a.ts", "src/b.ts", "src/c.ts"])];
    const tasks = [makeTask(1, ["src/a.ts"])];
    const { violations } = checkScope(results, tasks);
    expect(violations[0].outOfScopeFiles).toEqual(["src/b.ts", "src/c.ts"]);
  });

  it("should count multiple clean tasks correctly", () => {
    const results = [
      makeResult(1, ["src/a.ts"]),
      makeResult(2, ["src/b.ts"]),
    ];
    const tasks = [
      makeTask(1, ["src/a.ts"]),
      makeTask(2, ["src/b.ts"]),
    ];
    const { cleanCount } = checkScope(results, tasks);
    expect(cleanCount).toBe(2);
  });

  it("should handle task that changed no files (all declared, none changed)", () => {
    const results = [makeResult(1, [])];
    const tasks = [makeTask(1, ["src/index.ts"])];
    const { violations, cleanCount } = checkScope(results, tasks);
    expect(violations).toHaveLength(0);
    expect(cleanCount).toBe(1);
  });
});
