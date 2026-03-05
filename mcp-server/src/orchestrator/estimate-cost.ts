const MODEL_COSTS_PER_1K: Record<string, number> = {
  opus: 0.075,
  sonnet: 0.015,
  haiku: 0.005,
};

const BASE_TOKENS_PER_TASK = 4000;
const DESCRIPTION_TOKEN_MULTIPLIER = 2;
const ORCHESTRATOR_BASE_TOKENS = 3000;
const ORCHESTRATOR_TOKENS_PER_TASK = 500;

export interface TaskWave {
  tasks: Array<{ description: string }>;
}

export interface TaskCostEstimate {
  taskIndex: number;
  tokens: number;
  costUsd: number;
}

export interface CostEstimate {
  perTask: TaskCostEstimate[];
  orchestratorCostUsd: number;
  totalCostUsd: number;
}

function resolveModelKey(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("haiku")) return "haiku";
  return "sonnet";
}

function costForTokens(tokens: number, pricePerThousand: number): number {
  return (tokens / 1000) * pricePerThousand;
}

export function estimateCost(
  waves: TaskWave[],
  orchestratorModel: string,
  workerModel: string
): CostEstimate {
  const workerPrice = MODEL_COSTS_PER_1K[resolveModelKey(workerModel)] ?? MODEL_COSTS_PER_1K["sonnet"];
  const orchestratorPrice = MODEL_COSTS_PER_1K[resolveModelKey(orchestratorModel)] ?? MODEL_COSTS_PER_1K["sonnet"];

  const allTasks = waves.flatMap((w) => w.tasks);
  const taskCount = allTasks.length;

  const perTask: TaskCostEstimate[] = allTasks.map((task, index) => {
    const tokens = BASE_TOKENS_PER_TASK + task.description.length * DESCRIPTION_TOKEN_MULTIPLIER;
    return {
      taskIndex: index,
      tokens,
      costUsd: costForTokens(tokens, workerPrice),
    };
  });

  const orchestratorTokens = ORCHESTRATOR_BASE_TOKENS + ORCHESTRATOR_TOKENS_PER_TASK * taskCount;
  const orchestratorCostUsd = costForTokens(orchestratorTokens, orchestratorPrice);

  const totalCostUsd =
    perTask.reduce((sum, t) => sum + t.costUsd, 0) + orchestratorCostUsd;

  return { perTask, orchestratorCostUsd, totalCostUsd };
}
