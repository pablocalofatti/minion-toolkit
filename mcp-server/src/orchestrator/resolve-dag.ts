export interface InputTask {
  number: number;
  title: string;
  dependsOn: number[];
  skip: boolean;
}

export interface Wave {
  number: number;
  tasks: InputTask[];
  maxParallel: number;
}

export interface DAGResult {
  waves: Wave[];
  criticalPath: number[];
  hasCycle: boolean;
  cycleDetail?: string;
}

function filterActiveTasks(tasks: InputTask[]): InputTask[] {
  return tasks.filter((t) => !t.skip);
}

function buildInDegreeMap(
  activeTasks: InputTask[],
  activeNumbers: Set<number>
): Record<number, number> {
  const inDegree: Record<number, number> = {};
  for (const task of activeTasks) {
    inDegree[task.number] = 0;
  }
  for (const task of activeTasks) {
    for (const dep of task.dependsOn) {
      if (activeNumbers.has(dep)) {
        inDegree[task.number] += 1;
      }
    }
  }
  return inDegree;
}

function buildAdjacencyList(
  activeTasks: InputTask[],
  activeNumbers: Set<number>
): Record<number, number[]> {
  const adj: Record<number, number[]> = {};
  for (const task of activeTasks) {
    adj[task.number] = [];
  }
  for (const task of activeTasks) {
    for (const dep of task.dependsOn) {
      if (activeNumbers.has(dep)) {
        adj[dep].push(task.number);
      }
    }
  }
  return adj;
}

function computeCriticalPath(
  activeNumbers: Set<number>,
  processedOrder: number[],
  taskLookup: Record<number, InputTask>
): number[] {
  const longestPath: Record<number, number> = {};
  const predecessor: Record<number, number | undefined> = {};

  for (const num of processedOrder) {
    longestPath[num] = 1;
    predecessor[num] = undefined;
  }

  for (const num of processedOrder) {
    const task = taskLookup[num];
    for (const dep of task.dependsOn) {
      if (!activeNumbers.has(dep)) continue;
      const candidate = longestPath[dep] + 1;
      if (candidate > longestPath[num]) {
        longestPath[num] = candidate;
        predecessor[num] = dep;
      }
    }
  }

  let maxLen = 0;
  let endNode = processedOrder[0];
  for (const num of processedOrder) {
    if (longestPath[num] > maxLen) {
      maxLen = longestPath[num];
      endNode = num;
    }
  }

  const path: number[] = [];
  let current: number | undefined = endNode;
  while (current !== undefined) {
    path.unshift(current);
    current = predecessor[current];
  }

  return path;
}

export function resolveDAG(tasks: InputTask[]): DAGResult {
  const activeTasks = filterActiveTasks(tasks);

  if (activeTasks.length === 0) {
    return { waves: [], criticalPath: [], hasCycle: false };
  }

  const activeNumbers = new Set(activeTasks.map((t) => t.number));
  const taskLookup: Record<number, InputTask> = {};
  for (const t of activeTasks) {
    taskLookup[t.number] = t;
  }
  const inDegree = buildInDegreeMap(activeTasks, activeNumbers);
  const adj = buildAdjacencyList(activeTasks, activeNumbers);

  const waves: Wave[] = [];
  const processedOrder: number[] = [];
  const remaining = new Set(activeNumbers);

  let waveNumber = 1;
  while (remaining.size > 0) {
    const currentWave = [...remaining].filter(
      (num) => inDegree[num] === 0
    );

    if (currentWave.length === 0) {
      const cycleNodes = [...remaining].join(", ");
      return {
        waves,
        criticalPath: [],
        hasCycle: true,
        cycleDetail: `Cycle detected involving task(s): ${cycleNodes}`,
      };
    }

    const waveTasks = currentWave.map((num) => taskLookup[num]);

    waves.push({
      number: waveNumber,
      tasks: waveTasks,
      maxParallel: waveTasks.length,
    });

    for (const num of currentWave) {
      processedOrder.push(num);
      remaining.delete(num);
      for (const neighbor of adj[num]) {
        inDegree[neighbor] -= 1;
      }
    }

    waveNumber++;
  }

  const criticalPath = computeCriticalPath(
    activeNumbers,
    processedOrder,
    taskLookup
  );

  return { waves, criticalPath, hasCycle: false };
}
