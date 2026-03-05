import { randomUUID } from "node:crypto";
import { MinionSession, ParsedTask, ProjectCommands } from "../types.js";

const SESSION_ID_LENGTH = 8;
const sessions = new Map<string, MinionSession>();

export function createSession(
  projectRoot: string,
  baseBranch: string,
  tasks: ParsedTask[],
  commands: ProjectCommands
): MinionSession {
  const session: MinionSession = {
    id: randomUUID().slice(0, SESSION_ID_LENGTH),
    projectRoot,
    baseBranch,
    tasks,
    commands,
    workers: new Map(),
    results: new Map(),
    startedAt: Date.now(),
    abortController: new AbortController(),
  };

  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): MinionSession | undefined {
  return sessions.get(id);
}

export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (session) {
    session.abortController.abort();
    return sessions.delete(id);
  }
  return false;
}

export function listSessions(): MinionSession[] {
  return Array.from(sessions.values());
}
