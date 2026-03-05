export interface MinionConfig {
  anthropicApiKey: string;
  model: string;
  maxWorkers: number;
  workerMaxTokens: number;
  workerMaxIterations: number;
  workerTimeoutMs: number;
}

export interface ParsedTask {
  number: number;
  title: string;
  description: string;
  files: string[];
  dependsOn: number[];
  skip: boolean;
}

export interface ProjectCommands {
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  install: string;
  lint: string | null;
  test: string | null;
  build: string | null;
  format: string | null;
}

export type WorkerState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkerStatus {
  taskNumber: number;
  taskTitle: string;
  state: WorkerState;
  branch: string;
  worktreePath: string;
  iteration: number;
  maxIterations: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

export interface WorkerResult {
  taskNumber: number;
  taskTitle: string;
  state: "completed" | "failed" | "cancelled";
  branch: string;
  filesChanged: string[];
  duration: number;
  iterations: number;
  error: string | null;
}

export interface MinionSession {
  id: string;
  projectRoot: string;
  baseBranch: string;
  tasks: ParsedTask[];
  commands: ProjectCommands;
  workers: Map<number, WorkerStatus>;
  results: Map<number, WorkerResult>;
  startedAt: number;
  abortController: AbortController;
}
