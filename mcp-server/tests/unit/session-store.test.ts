import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("node:crypto", () => {
  let counter = 0;
  return {
    randomUUID: vi.fn(() => {
      counter++;
      return `${String(counter).padStart(8, "0")}-0000-0000-0000-000000000000`;
    }),
  };
});

import {
  createSession,
  getSession,
  deleteSession,
  listSessions,
} from "../../src/orchestrator/session-store.js";
import type { ParsedTask, ProjectCommands } from "../../src/types.js";

const STUB_TASKS: ParsedTask[] = [
  { number: 1, title: "Setup auth", description: "Add auth module", files: ["src/auth.ts"] },
];

const STUB_COMMANDS: ProjectCommands = {
  packageManager: "npm",
  install: "npm install",
  lint: "npm run lint",
  test: "npm run test",
  build: "npm run build",
  format: null,
};

describe("session-store", () => {
  beforeEach(() => {
    // Clean up all sessions between tests
    for (const s of listSessions()) {
      deleteSession(s.id);
    }
  });

  it("should create and retrieve a session", () => {
    const session = createSession("/project", "main", STUB_TASKS, STUB_COMMANDS);

    expect(session.id).toHaveLength(8);
    expect(session.projectRoot).toBe("/project");
    expect(session.baseBranch).toBe("main");
    expect(session.tasks).toBe(STUB_TASKS);
    expect(session.commands).toBe(STUB_COMMANDS);
    expect(session.workers).toBeInstanceOf(Map);
    expect(session.results).toBeInstanceOf(Map);
    expect(session.startedAt).toBeTypeOf("number");
    expect(session.abortController).toBeInstanceOf(AbortController);

    const retrieved = getSession(session.id);
    expect(retrieved).toBe(session);
  });

  it("should return undefined for non-existent session", () => {
    expect(getSession("does-not-exist")).toBeUndefined();
  });

  it("should delete a session and abort its controller", () => {
    const session = createSession("/project", "main", STUB_TASKS, STUB_COMMANDS);
    const abortSpy = vi.spyOn(session.abortController, "abort");

    const deleted = deleteSession(session.id);

    expect(deleted).toBe(true);
    expect(abortSpy).toHaveBeenCalledOnce();
    expect(getSession(session.id)).toBeUndefined();
  });

  it("should return false when deleting non-existent session", () => {
    expect(deleteSession("no-such-id")).toBe(false);
  });

  it("should list all sessions", () => {
    const s1 = createSession("/a", "main", STUB_TASKS, STUB_COMMANDS);
    const s2 = createSession("/b", "develop", STUB_TASKS, STUB_COMMANDS);

    const all = listSessions();

    expect(all).toHaveLength(2);
    expect(all).toContain(s1);
    expect(all).toContain(s2);
  });

  it("should generate unique session IDs", () => {
    const s1 = createSession("/x", "main", STUB_TASKS, STUB_COMMANDS);
    const s2 = createSession("/y", "main", STUB_TASKS, STUB_COMMANDS);

    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toHaveLength(8);
    expect(s2.id).toHaveLength(8);
  });

  it("should isolate multiple sessions", () => {
    const s1 = createSession("/x", "main", STUB_TASKS, STUB_COMMANDS);
    const s2 = createSession("/y", "develop", STUB_TASKS, STUB_COMMANDS);

    expect(s1.id).not.toBe(s2.id);
    expect(getSession(s1.id)).toBe(s1);
    expect(getSession(s2.id)).toBe(s2);

    deleteSession(s1.id);
    expect(getSession(s1.id)).toBeUndefined();
    expect(getSession(s2.id)).toBe(s2);
  });
});
