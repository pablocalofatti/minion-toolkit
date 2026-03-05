import { describe, it, expect } from "vitest";
import { resolveDAG } from "../../src/orchestrator/resolve-dag.js";
import type { InputTask } from "../../src/orchestrator/resolve-dag.js";

function makeTask(
  number: number,
  dependsOn: number[] = [],
  skip = false
): InputTask {
  return { number, title: `Task ${number}`, dependsOn, skip };
}

describe("resolveDAG", () => {
  describe("empty and single task cases", () => {
    it("should return empty result for empty task list", () => {
      const result = resolveDAG([]);

      expect(result.waves).toHaveLength(0);
      expect(result.criticalPath).toHaveLength(0);
      expect(result.hasCycle).toBe(false);
    });

    it("should return single wave for a single task with no dependencies", () => {
      const result = resolveDAG([makeTask(1)]);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].number).toBe(1);
      expect(result.waves[0].tasks).toHaveLength(1);
      expect(result.waves[0].tasks[0].number).toBe(1);
      expect(result.waves[0].maxParallel).toBe(1);
      expect(result.criticalPath).toEqual([1]);
    });

    it("should return empty result when all tasks are skipped", () => {
      const tasks = [makeTask(1, [], true), makeTask(2, [], true)];

      const result = resolveDAG(tasks);

      expect(result.waves).toHaveLength(0);
      expect(result.criticalPath).toHaveLength(0);
      expect(result.hasCycle).toBe(false);
    });
  });

  describe("wave grouping", () => {
    it("should group independent tasks into a single wave", () => {
      const tasks = [makeTask(1), makeTask(2), makeTask(3)];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].tasks).toHaveLength(3);
      expect(result.waves[0].maxParallel).toBe(3);
    });

    it("should produce two waves for a simple linear chain", () => {
      const tasks = [makeTask(1), makeTask(2, [1])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(2);
      expect(result.waves[0].tasks.map((t) => t.number)).toEqual([1]);
      expect(result.waves[1].tasks.map((t) => t.number)).toEqual([2]);
    });

    it("should produce three waves for a three-step chain", () => {
      const tasks = [makeTask(1), makeTask(2, [1]), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks.map((t) => t.number)).toEqual([1]);
      expect(result.waves[1].tasks.map((t) => t.number)).toEqual([2]);
      expect(result.waves[2].tasks.map((t) => t.number)).toEqual([3]);
    });

    it("should group tasks at the same dependency level into the same wave", () => {
      const tasks = [makeTask(1), makeTask(2), makeTask(3, [1]), makeTask(4, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(2);
      expect(result.waves[0].tasks.map((t) => t.number).sort()).toEqual([1, 2]);
      expect(result.waves[1].tasks.map((t) => t.number).sort()).toEqual([3, 4]);
    });

    it("should handle diamond dependency (fan-out then fan-in)", () => {
      // 1 -> 2 -> 4
      // 1 -> 3 -> 4
      const tasks = [
        makeTask(1),
        makeTask(2, [1]),
        makeTask(3, [1]),
        makeTask(4, [2, 3]),
      ];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks.map((t) => t.number)).toEqual([1]);
      expect(result.waves[1].tasks.map((t) => t.number).sort()).toEqual([2, 3]);
      expect(result.waves[2].tasks.map((t) => t.number)).toEqual([4]);
    });

    it("should report maxParallel equal to tasks in wave", () => {
      const tasks = [makeTask(1), makeTask(2), makeTask(3)];

      const result = resolveDAG(tasks);

      expect(result.waves[0].maxParallel).toBe(3);
    });
  });

  describe("cycle detection", () => {
    it("should detect a direct self-dependency as a cycle", () => {
      const tasks = [makeTask(1, [1])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleDetail).toBeDefined();
      expect(result.cycleDetail).toContain("1");
    });

    it("should detect a two-node cycle", () => {
      const tasks = [makeTask(1, [2]), makeTask(2, [1])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleDetail).toBeDefined();
    });

    it("should detect a three-node cycle", () => {
      const tasks = [makeTask(1, [3]), makeTask(2, [1]), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(true);
      expect(result.cycleDetail).toBeDefined();
    });

    it("should not report hasCycle when cycle is in skipped tasks", () => {
      // Task 1 -> Task 2 -> Task 1 but both skipped; Task 3 is active
      const tasks = [
        makeTask(1, [2], true),
        makeTask(2, [1], true),
        makeTask(3),
      ];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].tasks[0].number).toBe(3);
    });

    it("should return waves processed before cycle is detected", () => {
      // Task 1 has no deps; Task 2 and 3 form a cycle
      const tasks = [makeTask(1), makeTask(2, [3]), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(true);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].tasks[0].number).toBe(1);
    });
  });

  describe("skip handling", () => {
    it("should exclude skipped tasks from waves", () => {
      const tasks = [makeTask(1), makeTask(2, [], true), makeTask(3)];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      const taskNumbers = result.waves[0].tasks.map((t) => t.number);
      expect(taskNumbers).not.toContain(2);
      expect(taskNumbers).toContain(1);
      expect(taskNumbers).toContain(3);
    });

    it("should ignore dependencies on skipped tasks", () => {
      // Task 2 depends on Task 1 (skipped) — Task 2 should still be in Wave 1
      const tasks = [makeTask(1, [], true), makeTask(2, [1])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      expect(result.waves[0].tasks[0].number).toBe(2);
    });

    it("should correctly resolve deps when only middle task is skipped", () => {
      // 1 -> 2 (skip) -> 3 — Task 3 depends on 2 which is skipped, so 3 has no active deps
      const tasks = [makeTask(1), makeTask(2, [1], true), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      const nums = result.waves[0].tasks.map((t) => t.number).sort();
      expect(nums).toEqual([1, 3]);
    });
  });

  describe("critical path", () => {
    it("should return the single task as critical path when there is one task", () => {
      const result = resolveDAG([makeTask(1)]);

      expect(result.criticalPath).toEqual([1]);
    });

    it("should return the full chain as critical path for a linear chain", () => {
      const tasks = [makeTask(1), makeTask(2, [1]), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.criticalPath).toEqual([1, 2, 3]);
    });

    it("should return the longer branch as critical path in a diamond", () => {
      // 1 -> 2 -> 4 (length 3)
      // 1 -> 3    (length 2 without 4)
      // 1 -> 3 -> 4 (length 3 — same as first branch)
      const tasks = [
        makeTask(1),
        makeTask(2, [1]),
        makeTask(3, [1]),
        makeTask(4, [2, 3]),
      ];

      const result = resolveDAG(tasks);

      expect(result.criticalPath).toHaveLength(3);
      expect(result.criticalPath[0]).toBe(1);
      expect(result.criticalPath[result.criticalPath.length - 1]).toBe(4);
    });

    it("should compute critical path through longest dependency chain", () => {
      // Two separate chains: 1->2->3 (length 3) and 4->5 (length 2)
      const tasks = [
        makeTask(1),
        makeTask(2, [1]),
        makeTask(3, [2]),
        makeTask(4),
        makeTask(5, [4]),
      ];

      const result = resolveDAG(tasks);

      expect(result.criticalPath).toEqual([1, 2, 3]);
    });

    it("should return empty critical path when cycle is detected", () => {
      const tasks = [makeTask(1, [2]), makeTask(2, [1])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(true);
      expect(result.criticalPath).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should handle tasks with dependencies out of declared order", () => {
      // Task 1 depends on Task 3 which depends on Task 2
      const tasks = [makeTask(1, [3]), makeTask(2), makeTask(3, [2])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(3);
      expect(result.waves[0].tasks[0].number).toBe(2);
      expect(result.waves[1].tasks[0].number).toBe(3);
      expect(result.waves[2].tasks[0].number).toBe(1);
    });

    it("should handle deep chains of 10 tasks", () => {
      const tasks: InputTask[] = [];
      for (let i = 1; i <= 10; i++) {
        tasks.push(makeTask(i, i > 1 ? [i - 1] : []));
      }

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(10);
      expect(result.criticalPath).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("should handle tasks where dependsOn references non-existent task numbers", () => {
      // Task 2 depends on Task 99 which doesn't exist — treat as no active dep
      const tasks = [makeTask(1), makeTask(2, [99])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(1);
      const nums = result.waves[0].tasks.map((t) => t.number).sort();
      expect(nums).toEqual([1, 2]);
    });

    it("should handle non-contiguous task numbers", () => {
      const tasks = [makeTask(5), makeTask(10, [5]), makeTask(20, [10])];

      const result = resolveDAG(tasks);

      expect(result.hasCycle).toBe(false);
      expect(result.waves).toHaveLength(3);
      expect(result.criticalPath).toEqual([5, 10, 20]);
    });

    it("should handle wave numbering starting at 1", () => {
      const tasks = [makeTask(1), makeTask(2, [1])];

      const result = resolveDAG(tasks);

      expect(result.waves[0].number).toBe(1);
      expect(result.waves[1].number).toBe(2);
    });
  });
});
