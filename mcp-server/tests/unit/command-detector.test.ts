import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { detectCommands } from "../../src/orchestrator/command-detector.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

const mockedAccess = vi.mocked(access);
const mockedReadFile = vi.mocked(readFile);

const PROJECT = "/fake/project";

describe("command-detector", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no lockfiles exist, no package.json
    mockedAccess.mockRejectedValue(new Error("ENOENT"));
    mockedReadFile.mockRejectedValue(new Error("ENOENT"));
  });

  describe("package manager detection", () => {
    it("should detect pnpm from pnpm-lock.yaml", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "pnpm-lock.yaml")) return undefined;
        throw new Error("ENOENT");
      });

      const commands = await detectCommands(PROJECT);

      expect(commands.packageManager).toBe("pnpm");
      expect(commands.install).toBe("pnpm install");
    });

    it("should detect yarn from yarn.lock", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "yarn.lock")) return undefined;
        throw new Error("ENOENT");
      });

      const commands = await detectCommands(PROJECT);

      expect(commands.packageManager).toBe("yarn");
      expect(commands.install).toBe("yarn install");
    });

    it("should detect bun from bun.lockb", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "bun.lockb")) return undefined;
        throw new Error("ENOENT");
      });

      const commands = await detectCommands(PROJECT);

      expect(commands.packageManager).toBe("bun");
      expect(commands.install).toBe("bun install");
    });

    it("should detect npm from package-lock.json", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "package-lock.json")) return undefined;
        throw new Error("ENOENT");
      });

      const commands = await detectCommands(PROJECT);

      expect(commands.packageManager).toBe("npm");
      expect(commands.install).toBe("npm install");
    });

    it("should fall back to npm when no lockfile exists", async () => {
      const commands = await detectCommands(PROJECT);

      expect(commands.packageManager).toBe("npm");
      expect(commands.install).toBe("npm install");
    });
  });

  describe("script detection", () => {
    it("should read scripts from package.json", async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          scripts: {
            lint: "eslint .",
            test: "vitest",
            build: "tsc",
            format: "prettier --write .",
          },
        })
      );

      const commands = await detectCommands(PROJECT);

      // Falls back to npm since no lockfile
      expect(commands.lint).toBe("npm run lint");
      expect(commands.test).toBe("npm run test");
      expect(commands.build).toBe("npm run build");
      expect(commands.format).toBe("npm run format");
    });

    it("should use correct run prefix for pnpm", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "pnpm-lock.yaml")) return undefined;
        throw new Error("ENOENT");
      });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ scripts: { lint: "eslint .", test: "vitest" } })
      );

      const commands = await detectCommands(PROJECT);

      expect(commands.lint).toBe("pnpm lint");
      expect(commands.test).toBe("pnpm test");
    });

    it("should use correct run prefix for yarn", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "yarn.lock")) return undefined;
        throw new Error("ENOENT");
      });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ scripts: { build: "tsc" } })
      );

      const commands = await detectCommands(PROJECT);

      expect(commands.build).toBe("yarn build");
    });

    it("should use correct run prefix for bun", async () => {
      mockedAccess.mockImplementation(async (path) => {
        if (path === join(PROJECT, "bun.lockb")) return undefined;
        throw new Error("ENOENT");
      });
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ scripts: { test: "vitest" } })
      );

      const commands = await detectCommands(PROJECT);

      expect(commands.test).toBe("bun test");
    });

    it("should handle missing package.json", async () => {
      const commands = await detectCommands(PROJECT);

      expect(commands.lint).toBeNull();
      expect(commands.test).toBeNull();
      expect(commands.build).toBeNull();
      expect(commands.format).toBeNull();
    });

    it("should handle package.json with no scripts field", async () => {
      mockedReadFile.mockResolvedValue(JSON.stringify({ name: "my-app" }));

      const commands = await detectCommands(PROJECT);

      expect(commands.lint).toBeNull();
      expect(commands.test).toBeNull();
      expect(commands.build).toBeNull();
      expect(commands.format).toBeNull();
    });

    it("should return null for scripts not present in package.json", async () => {
      mockedReadFile.mockResolvedValue(
        JSON.stringify({ scripts: { lint: "eslint ." } })
      );

      const commands = await detectCommands(PROJECT);

      expect(commands.lint).toBe("npm run lint");
      expect(commands.test).toBeNull();
      expect(commands.build).toBeNull();
      expect(commands.format).toBeNull();
    });
  });
});
