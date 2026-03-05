export interface TaskResult {
  taskNumber: number;
  taskTitle: string;
  filesChanged: string[];
}

export interface ScopedTask {
  number: number;
  files: string[];
}

export interface ScopeViolation {
  taskNumber: number;
  taskTitle: string;
  outOfScopeFiles: string[];
}

export interface ScopeCheckResult {
  violations: ScopeViolation[];
  cleanCount: number;
}

export function checkScope(
  results: TaskResult[],
  tasks: ScopedTask[]
): ScopeCheckResult {
  const taskScopeMap = new Map<number, string[]>();
  for (const task of tasks) {
    taskScopeMap.set(task.number, task.files);
  }

  const violations: ScopeViolation[] = [];
  let cleanCount = 0;

  for (const result of results) {
    const declaredFiles = taskScopeMap.get(result.taskNumber);

    if (!declaredFiles || declaredFiles.length === 0) {
      cleanCount++;
      continue;
    }

    const outOfScopeFiles = result.filesChanged.filter(
      (file) => !declaredFiles.includes(file)
    );

    if (outOfScopeFiles.length > 0) {
      violations.push({
        taskNumber: result.taskNumber,
        taskTitle: result.taskTitle,
        outOfScopeFiles,
      });
    } else {
      cleanCount++;
    }
  }

  return { violations, cleanCount };
}
