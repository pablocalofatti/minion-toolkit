import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/worker/worker-system-prompt.js";
import { ParsedTask, ProjectCommands } from "../../src/types.js";

function makeTask(overrides: Partial<ParsedTask> = {}): ParsedTask {
  return {
    number: 1,
    title: "Add user auth",
    description: "Implement JWT-based authentication",
    files: [],
    ...overrides,
  };
}

function makeCommands(overrides: Partial<ProjectCommands> = {}): ProjectCommands {
  return {
    packageManager: "npm",
    install: "npm install",
    lint: "npm run lint",
    test: "npm run test",
    build: "npm run build",
    format: "npm run format",
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("should contain task number and title", () => {
    const prompt = buildSystemPrompt(
      makeTask({ number: 3, title: "Fix login bug" }),
      makeCommands(),
      "/tmp/wt"
    );

    expect(prompt).toContain("Task 3: Fix login bug");
  });

  it("should contain the task description", () => {
    const prompt = buildSystemPrompt(
      makeTask({ description: "Refactor the database layer" }),
      makeCommands(),
      "/tmp/wt"
    );

    expect(prompt).toContain("Refactor the database layer");
  });

  it("should include file list when files are provided", () => {
    const prompt = buildSystemPrompt(
      makeTask({ files: ["src/auth.ts", "src/middleware.ts"] }),
      makeCommands(),
      "/tmp/wt"
    );

    expect(prompt).toContain("## Target Files");
    expect(prompt).toContain("`src/auth.ts`");
    expect(prompt).toContain("`src/middleware.ts`");
  });

  it("should not include file section when files array is empty", () => {
    const prompt = buildSystemPrompt(
      makeTask({ files: [] }),
      makeCommands(),
      "/tmp/wt"
    );

    expect(prompt).not.toContain("## Target Files");
  });

  it("should contain the package manager name", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands({ packageManager: "pnpm" }),
      "/tmp/wt"
    );

    expect(prompt).toContain("**Package manager:** pnpm");
  });

  it("should contain lint/test/build commands when available", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands({
        lint: "eslint .",
        test: "vitest run",
        build: "tsc",
      }),
      "/tmp/wt"
    );

    expect(prompt).toContain("**Lint:** `eslint .`");
    expect(prompt).toContain("**Test:** `vitest run`");
    expect(prompt).toContain("**Build:** `tsc`");
  });

  it("should show 'No lint/test/build commands detected' when all are null", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands({
        lint: null,
        test: null,
        build: null,
        format: null,
      }),
      "/tmp/wt"
    );

    expect(prompt).toContain("No lint/test/build commands detected");
  });

  it("should contain the worktree path", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands(),
      "/home/user/.worktrees/task-1"
    );

    expect(prompt).toContain("/home/user/.worktrees/task-1");
  });

  it("should contain all blueprint steps", () => {
    const prompt = buildSystemPrompt(makeTask(), makeCommands(), "/tmp/wt");

    expect(prompt).toContain("### Step 1: Explore");
    expect(prompt).toContain("### Step 2: Plan");
    expect(prompt).toContain("### Step 3: Implement");
    expect(prompt).toContain("### Step 4: Verify");
    expect(prompt).toContain("### Step 5: Commit");
  });

  it("should include format command when available", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands({ format: "prettier --write ." }),
      "/tmp/wt"
    );

    expect(prompt).toContain("**Format:** `prettier --write .`");
  });

  it("should show verification section with available commands", () => {
    const prompt = buildSystemPrompt(
      makeTask(),
      makeCommands({
        lint: "eslint .",
        test: null,
        build: "tsc",
      }),
      "/tmp/wt"
    );

    expect(prompt).toContain("Run lint: `eslint .`");
    expect(prompt).toContain("No test command available");
    expect(prompt).toContain("Run build: `tsc`");
  });
});
