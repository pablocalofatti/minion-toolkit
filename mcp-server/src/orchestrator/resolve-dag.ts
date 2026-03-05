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
): Map<number, number> {
  const inDegree = new Map<number, number>();
  for (const task of activeTasks) {
    if (!inDegree.has(task.number)) {
      inDegree.set(task.number, 0);
    }
    for (const dep of task.dependsOn) {
      if (activeNumbers.has(dep)) {
        inDegree.set(task.number, (inDegree.get(task.number) ?? 0) + 1);
      }
    }
  }
  return inDegree;
}

function buildAdjacencyList(
  activeTasks: InputTask[],
  activeNumbers: Set<number>
): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const task of activeTasks) {
    if (!adj.has(task.number)) {
      adj.set(task.number, []);
    }
    for (const dep of task.dependsOn) {
      if (activeNumbers.has(dep)) {
        const list = adj.get(dep) ?? [];
        list.push(task.number);
        adj.set(dep, list);
      }
    }
  }
  return adj;
}

function computeCriticalPath(
  activeTasks: InputTask[],
  activeNumbers: Set<number>,
  processedOrder: number[],
  taskMap: Map<number, InputTask>
): number[] {
  const longestPath = new Map<number, number>();
  const predecessor = new Map<number, number | null>();

  for (const num of processedOrder) {
    longestPath.set(num, 1);
    predecessor.set(num, null);
  }

  for (const num of processedOrder) {
    const task = taskMap.get(num);
    if (!task) continue;
    for (const dep of task.dependsOn) {
      if (!activeNumbers.has(dep)) continue;
      const depLen = longestPath.get(dep) ?? 0;
      const candidate = depLen + 1;
      if (candidate > (longestPath.get(num) ?? 1)) {
        longestPath.set(num, candidate);
        predecessor.set(num, dep);
      }
    }
  }

  let maxLen = 0;
  let endNode = -1;
  for (const [num, len] of longestPath.entries()) {
    if (len > maxLen) {
      maxLen = len;
      endNode = num;
    }
  }

  if (endNode === -1) return [];

  const path: number[] = [];
  let current: number | null = endNode;
  while (current !== null) {
    path.unshift(current);
    current = predecessor.get(current) ?? null;
  }

  return path;
}

export function resolveDAG(tasks: InputTask[]): DAGResult {
  const activeTasks = filterActiveTasks(tasks);

  if (activeTasks.length === 0) {
    return { waves: [], criticalPath: [], hasCycle: false };
  }

  const activeNumbers = new Set(activeTasks.map((t) => t.number));
  const taskMap = new Map(activeTasks.map((t) => [t.number, t]));
  const inDegree = buildInDegreeMap(activeTasks, activeNumbers);
  const adj = buildAdjacencyList(activeTasks, activeNumbers);

  const waves: Wave[] = [];
  const processedOrder: number[] = [];
  const remaining = new Set(activeNumbers);

  let waveNumber = 1;
  while (remaining.size > 0) {
    const currentWave = [...remaining].filter(
      (num) => (inDegree.get(num) ?? 0) === 0
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

    const waveTasks = currentWave.map((num) => {
      const task = taskMap.get(num);
      if (!task) throw new Error(`Task ${num} not found in map`);
      return task;
    });

    waves.push({
      number: waveNumber,
      tasks: waveTasks,
      maxParallel: waveTasks.length,
    });

    for (const num of currentWave) {
      processedOrder.push(num);
      remaining.delete(num);
      for (const neighbor of adj.get(num) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) - 1);
      }
    }

    waveNumber++;
  }

  const criticalPath = computeCriticalPath(
    activeTasks,
    activeNumbers,
    processedOrder,
    taskMap
  );

  return { waves, criticalPath, hasCycle: false };
}
