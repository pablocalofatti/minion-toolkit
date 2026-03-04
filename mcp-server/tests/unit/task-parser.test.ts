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
});
