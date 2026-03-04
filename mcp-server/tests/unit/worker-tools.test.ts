import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeWorkerTool,
  WORKER_TOOL_DEFINITIONS,
} from "../../src/worker/worker-tools.js";

describe("WORKER_TOOL_DEFINITIONS", () => {
  it("should define exactly 6 tools", () => {
    expect(WORKER_TOOL_DEFINITIONS).toHaveLength(6);
  });

  it("should include all expected tool names", () => {
    const names = WORKER_TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual([
      "read_file",
      "write_file",
      "edit_file",
      "run_command",
      "list_directory",
      "search_files",
    ]);
  });
});

describe("executeWorkerTool", () => {
  let worktreeRoot: string;

  beforeEach(async () => {
    worktreeRoot = await mkdtemp(join(tmpdir(), "worker-tools-test-"));
  });

  afterEach(async () => {
    await rm(worktreeRoot, { recursive: true, force: true });
  });

  // --- read_file ---

  describe("read_file", () => {
    it("should read a file within the worktree", async () => {
      await writeFile(join(worktreeRoot, "hello.txt"), "hello world", "utf-8");

      const result = await executeWorkerTool(worktreeRoot, "read_file", {
        path: "hello.txt",
      });

      expect(result).toBe("hello world");
    });

    it("should reject path traversal with ../", async () => {
      await expect(
        executeWorkerTool(worktreeRoot, "read_file", {
          path: "../../../etc/passwd",
        })
      ).rejects.toThrow("resolves outside the worktree");
    });

    it("should reject absolute paths outside worktree", async () => {
      await expect(
        executeWorkerTool(worktreeRoot, "read_file", {
          path: "/etc/passwd",
        })
      ).rejects.toThrow("resolves outside the worktree");
    });

    it("should truncate long file content", async () => {
      const longContent = "x".repeat(10_000);
      await writeFile(join(worktreeRoot, "big.txt"), longContent, "utf-8");

      const result = await executeWorkerTool(worktreeRoot, "read_file", {
        path: "big.txt",
      });

      expect(result.length).toBeLessThan(longContent.length);
      expect(result).toContain("truncated");
      expect(result).toContain("2000 chars omitted");
    });
  });

  // --- write_file ---

  describe("write_file", () => {
    it("should create directories and write content", async () => {
      const result = await executeWorkerTool(worktreeRoot, "write_file", {
        path: "deep/nested/file.txt",
        content: "nested content",
      });

      expect(result).toBe("File written: deep/nested/file.txt");

      const written = await readFile(
        join(worktreeRoot, "deep/nested/file.txt"),
        "utf-8"
      );
      expect(written).toBe("nested content");
    });

    it("should reject path traversal", async () => {
      await expect(
        executeWorkerTool(worktreeRoot, "write_file", {
          path: "../../escape.txt",
          content: "malicious",
        })
      ).rejects.toThrow("resolves outside the worktree");
    });
  });

  // --- edit_file ---

  describe("edit_file", () => {
    it("should replace an exact string match", async () => {
      await writeFile(
        join(worktreeRoot, "code.ts"),
        'const x = "old";\n',
        "utf-8"
      );

      const result = await executeWorkerTool(worktreeRoot, "edit_file", {
        path: "code.ts",
        old_string: '"old"',
        new_string: '"new"',
      });

      expect(result).toBe("File edited: code.ts");

      const content = await readFile(
        join(worktreeRoot, "code.ts"),
        "utf-8"
      );
      expect(content).toBe('const x = "new";\n');
    });

    it("should return error when old_string not found", async () => {
      await writeFile(
        join(worktreeRoot, "code.ts"),
        "const x = 1;\n",
        "utf-8"
      );

      const result = await executeWorkerTool(worktreeRoot, "edit_file", {
        path: "code.ts",
        old_string: "nonexistent string",
        new_string: "replacement",
      });

      expect(result).toContain("Error: old_string not found");
    });

    it("should return error when multiple matches found", async () => {
      await writeFile(
        join(worktreeRoot, "code.ts"),
        "foo\nfoo\nfoo\n",
        "utf-8"
      );

      const result = await executeWorkerTool(worktreeRoot, "edit_file", {
        path: "code.ts",
        old_string: "foo",
        new_string: "bar",
      });

      expect(result).toContain("Error: old_string found 3 times");
    });

    it("should reject path traversal", async () => {
      await expect(
        executeWorkerTool(worktreeRoot, "edit_file", {
          path: "../../../etc/passwd",
          old_string: "root",
          new_string: "hacked",
        })
      ).rejects.toThrow("resolves outside the worktree");
    });
  });

  // --- run_command ---

  describe("run_command", () => {
    it("should execute a command in the worktree cwd", async () => {
      const result = await executeWorkerTool(worktreeRoot, "run_command", {
        command: "pwd",
      });

      // macOS resolves /var → /private/var, so use toContain
      expect(result).toContain(worktreeRoot.replace("/private", ""));
    });

    it("should return error on command failure", async () => {
      const result = await executeWorkerTool(worktreeRoot, "run_command", {
        command: "exit 1",
      });

      expect(result).toContain("Command failed:");
    });

    it("should truncate long output", async () => {
      const result = await executeWorkerTool(worktreeRoot, "run_command", {
        command: 'python3 -c "print(\'x\' * 10000)"',
      });

      expect(result).toContain("truncated");
    });
  });

  // --- list_directory ---

  describe("list_directory", () => {
    it("should list files and directories", async () => {
      await writeFile(join(worktreeRoot, "file.txt"), "content", "utf-8");
      await mkdir(join(worktreeRoot, "subdir"));

      const result = await executeWorkerTool(
        worktreeRoot,
        "list_directory",
        {}
      );

      expect(result).toContain("file.txt");
      expect(result).toContain("subdir/");
    });

    it("should list a subdirectory when path provided", async () => {
      await mkdir(join(worktreeRoot, "src"));
      await writeFile(
        join(worktreeRoot, "src", "index.ts"),
        "export {}",
        "utf-8"
      );

      const result = await executeWorkerTool(
        worktreeRoot,
        "list_directory",
        { path: "src" }
      );

      expect(result).toContain("index.ts");
    });
  });

  // --- search_files ---

  describe("search_files", () => {
    it("should find pattern matches", async () => {
      await writeFile(
        join(worktreeRoot, "app.ts"),
        'const greeting = "hello";\n',
        "utf-8"
      );

      const result = await executeWorkerTool(worktreeRoot, "search_files", {
        pattern: "hello",
      });

      expect(result).toContain("hello");
      expect(result).toContain("app.ts");
    });

    it("should return 'No matches' when none found", async () => {
      await writeFile(
        join(worktreeRoot, "app.ts"),
        "const x = 1;\n",
        "utf-8"
      );

      const result = await executeWorkerTool(worktreeRoot, "search_files", {
        pattern: "nonexistent_pattern_xyz",
      });

      expect(result).toBe("No matches found.");
    });

    it("should filter by glob pattern", async () => {
      await writeFile(join(worktreeRoot, "app.ts"), "target\n", "utf-8");
      await writeFile(join(worktreeRoot, "data.json"), "target\n", "utf-8");

      const result = await executeWorkerTool(worktreeRoot, "search_files", {
        pattern: "target",
        glob: "*.ts",
      });

      expect(result).toContain("app.ts");
      expect(result).not.toContain("data.json");
    });
  });

  // --- fallback branches for missing input properties ---

  describe("missing input fallbacks", () => {
    it("should use empty path fallback for read_file when path is undefined", async () => {
      // input.path is undefined → ?? "" fires
      await expect(
        executeWorkerTool(worktreeRoot, "read_file", {})
      ).rejects.toThrow();
    });

    it("should use empty fallbacks for write_file when path and content are undefined", async () => {
      // input.path ?? "" and input.content ?? "" both fire
      await expect(
        executeWorkerTool(worktreeRoot, "write_file", {})
      ).rejects.toThrow();
    });

    it("should use empty fallbacks for edit_file when properties are undefined", async () => {
      // input.path ?? "", input.old_string ?? "", input.new_string ?? "" all fire
      await expect(
        executeWorkerTool(worktreeRoot, "edit_file", {})
      ).rejects.toThrow();
    });

    it("should use empty command fallback for run_command", async () => {
      // input.command ?? "" fires — bash -c "" returns no output
      const result = await executeWorkerTool(worktreeRoot, "run_command", {});
      expect(result).toBe("(no output)");
    });

    it("should use empty pattern fallback for search_files", async () => {
      // input.pattern ?? "" fires
      const result = await executeWorkerTool(worktreeRoot, "search_files", {});
      // grep with empty pattern either matches everything or errors
      expect(typeof result).toBe("string");
    });
  });

  // --- empty directory ---

  describe("list_directory edge cases", () => {
    it("should return '(empty directory)' for an empty directory", async () => {
      await mkdir(join(worktreeRoot, "empty"));

      const result = await executeWorkerTool(
        worktreeRoot,
        "list_directory",
        { path: "empty" }
      );

      expect(result).toBe("(empty directory)");
    });
  });

  // --- run_command with no output ---

  describe("run_command edge cases", () => {
    it("should return '(no output)' when command produces nothing", async () => {
      const result = await executeWorkerTool(worktreeRoot, "run_command", {
        command: "true",
      });

      expect(result).toBe("(no output)");
    });
  });

  // --- unknown tool ---

  describe("unknown tool", () => {
    it("should return error message for unknown tool name", async () => {
      const result = await executeWorkerTool(
        worktreeRoot,
        "nonexistent_tool",
        {}
      );

      expect(result).toBe("Unknown tool: nonexistent_tool");
    });
  });
});
