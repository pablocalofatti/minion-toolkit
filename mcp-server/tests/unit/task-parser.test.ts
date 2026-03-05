import { describe, it, expect } from "vitest";
import { parseTasks } from "../../src/orchestrator/task-parser.js";

describe("parseTasks", () => {
  it("should parse a single task with title and description", () => {
    const md = `### Task 1: Set up project
Install dependencies and configure TypeScript.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].number).toBe(1);
    expect(tasks[0].title).toBe("Set up project");
    expect(tasks[0].description).toBe(
      "Install dependencies and configure TypeScript."
    );
    expect(tasks[0].files).toEqual([]);
  });

  it("should parse multiple tasks", () => {
    const md = `### Task 1: First task
Description one.

### Task 2: Second task
Description two.

### Task 3: Third task
Description three.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].number).toBe(1);
    expect(tasks[0].title).toBe("First task");
    expect(tasks[1].number).toBe(2);
    expect(tasks[1].title).toBe("Second task");
    expect(tasks[2].number).toBe(3);
    expect(tasks[2].title).toBe("Third task");
  });

  it("should parse tasks with **Files:** lines", () => {
    const md = `### Task 1: Add components
Create the UI components.
**Files:** \`src/App.tsx\`, \`src/Button.tsx\``;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].files).toEqual(["src/App.tsx", "src/Button.tsx"]);
  });

  it("should parse tasks with **File:** (singular) lines", () => {
    const md = `### Task 1: Add component
Create the UI component.
**File:** \`src/App.tsx\``;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].files).toEqual(["src/App.tsx"]);
  });

  it("should handle tasks with no description", () => {
    const md = `### Task 1: Empty task
### Task 2: Another task
Some description.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].description).toBe("");
    expect(tasks[1].description).toBe("Some description.");
  });

  it("should throw on empty markdown", () => {
    expect(() => parseTasks("")).toThrow(
      "No tasks found. Expected markdown with ### Task N: headings."
    );
  });

  it("should throw on markdown with no ### Task headings", () => {
    const md = `# Not a task
Some random content.

## Also not a task
More content.`;

    expect(() => parseTasks(md)).toThrow(
      "No tasks found. Expected markdown with ### Task N: headings."
    );
  });

  it("should handle multi-line descriptions", () => {
    const md = `### Task 1: Complex task
Line one of the description.
Line two of the description.

A paragraph break.

Line after the break.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe(
      "Line one of the description.\nLine two of the description.\n\nA paragraph break.\n\nLine after the break."
    );
  });

  it("should handle consecutive tasks with no blank lines between them", () => {
    const md = `### Task 1: First
Description first.
### Task 2: Second
Description second.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe("First");
    expect(tasks[0].description).toBe("Description first.");
    expect(tasks[1].title).toBe("Second");
    expect(tasks[1].description).toBe("Description second.");
  });

  it("should ignore lines before the first task heading", () => {
    const md = `# Project Plan
Some intro text.

### Task 1: Only task
The real description.`;

    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("The real description.");
  });

  it("should strip backticks from file names", () => {
    const md = `### Task 1: Files test
**Files:** \`src/index.ts\`, \`src/utils.ts\``;

    const tasks = parseTasks(md);
    expect(tasks[0].files).toEqual(["src/index.ts", "src/utils.ts"]);
  });

  it("should filter out empty file entries from trailing commas", () => {
    const md = `### Task 1: Trailing comma
**Files:** \`src/a.ts\`, \`src/b.ts\`,`;

    const tasks = parseTasks(md);
    expect(tasks[0].files).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("should trim whitespace from task titles", () => {
    const md = `### Task 1:   Spaced title
Description.`;

    const tasks = parseTasks(md);
    expect(tasks[0].title).toBe("Spaced title");
  });

  it("should parse high task numbers correctly", () => {
    const md = `### Task 99: Large number task
Description.`;

    const tasks = parseTasks(md);
    expect(tasks[0].number).toBe(99);
  });

  it("should include description lines that look like regular text after Files line", () => {
    const md = `### Task 1: Mixed content
First line.
**Files:** \`src/a.ts\`
More description after files.`;

    const tasks = parseTasks(md);
    expect(tasks[0].files).toEqual(["src/a.ts"]);
    expect(tasks[0].description).toBe(
      "First line.\nMore description after files."
    );
  });

  // Backward compatibility — no Depends line returns empty dependsOn array
  it("should return empty dependsOn when no Depends line is present", () => {
    const md = `### Task 1: No deps
Just a plain task.`;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([]);
  });

  it("should return skip: false when no DONE or SKIP marker is present", () => {
    const md = `### Task 1: Normal task
Description.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(false);
  });

  // Depends: parsing
  it("should parse a single dependency from a Depends: line", () => {
    const md = `### Task 2: Dependent task
Description.
Depends: Task 1`;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([1]);
  });

  it("should parse multiple dependencies from a Depends: line", () => {
    const md = `### Task 3: Multi-dep task
Description.
Depends: Task 1, Task 2`;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([1, 2]);
  });

  it("should parse dependencies using bold **Depends:** format", () => {
    const md = `### Task 3: Bold depends
Description.
**Depends:** Task 1, Task 2`;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([1, 2]);
  });

  it("should handle extra whitespace in Depends: line", () => {
    const md = `### Task 3: Whitespace test
Description.
Depends:   Task 1 ,   Task 2  `;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([1, 2]);
  });

  it("should not include Depends: line in description", () => {
    const md = `### Task 2: With dep
Main description.
Depends: Task 1`;

    const tasks = parseTasks(md);
    expect(tasks[0].description).toBe("Main description.");
    expect(tasks[0].dependsOn).toEqual([1]);
  });

  // [DONE] marker
  it("should set skip: true when [DONE] marker appears in heading", () => {
    const md = `### Task 1: [DONE] Set up project
Already done.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Set up project");
  });

  it("should set skip: true when [DONE] marker appears at the end of heading", () => {
    const md = `### Task 1: Set up project [DONE]
Already done.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Set up project");
  });

  // [SKIP] marker
  it("should set skip: true when [SKIP] marker appears in heading", () => {
    const md = `### Task 2: [SKIP] Optional feature
Not needed anymore.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Optional feature");
  });

  it("should set skip: true when [SKIP] marker appears at the end of heading", () => {
    const md = `### Task 2: Optional feature [SKIP]
Not needed anymore.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Optional feature");
  });

  it("should strip [DONE]/[SKIP] markers from the title", () => {
    const md = `### Task 1: [DONE] Build the thing [SKIP]
Desc.`;

    const tasks = parseTasks(md);
    expect(tasks[0].title).toBe("Build the thing");
    expect(tasks[0].skip).toBe(true);
  });

  // Case insensitivity
  it("should detect [done] and [skip] markers case-insensitively", () => {
    const md = `### Task 1: [done] Some task
Desc.`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Some task");
  });

  // Combined: task with Depends and skip marker
  it("should parse both Depends and DONE marker on the same task", () => {
    const md = `### Task 3: [DONE] Final step
All done here.
Depends: Task 1, Task 2`;

    const tasks = parseTasks(md);
    expect(tasks[0].skip).toBe(true);
    expect(tasks[0].title).toBe("Final step");
    expect(tasks[0].dependsOn).toEqual([1, 2]);
    expect(tasks[0].description).toBe("All done here.");
  });

  // Mixed tasks: some with deps, some without
  it("should correctly assign dependsOn to only the tasks that have a Depends: line", () => {
    const md = `### Task 1: Foundation
No deps here.

### Task 2: Build on top
Needs the foundation.
Depends: Task 1

### Task 3: Independent
Stands alone.`;

    const tasks = parseTasks(md);
    expect(tasks[0].dependsOn).toEqual([]);
    expect(tasks[1].dependsOn).toEqual([1]);
    expect(tasks[2].dependsOn).toEqual([]);
  });
});
