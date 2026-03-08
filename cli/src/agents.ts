import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CLAUDE_DIR, ensureDir, log, logSuccess, logWarn } from "./utils.js";

interface DetectedStack {
  name: string;
  description: string;
  matchPatterns: string[];
  matchKeywords: string[];
}

const STACK_DETECTORS: Array<{
  name: string;
  description: string;
  dirs: string[];
  deps: string[];
  configs: string[];
  matchPatterns: string[];
  matchKeywords: string[];
}> = [
  {
    name: "frontend",
    description: "Frontend development with React/Next.js",
    dirs: ["components", "pages", "app", "src/components", "src/pages"],
    deps: ["react", "next", "vue", "svelte", "angular"],
    configs: ["tailwind.config.ts", "tailwind.config.js", "postcss.config.js"],
    matchPatterns: ["**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte"],
    matchKeywords: ["component", "page", "layout", "style", "css", "ui"],
  },
  {
    name: "backend",
    description: "Backend API development",
    dirs: [
      "services",
      "controllers",
      "routes",
      "api",
      "src/services",
      "src/controllers",
    ],
    deps: ["express", "nestjs", "@nestjs/core", "fastify", "hono", "koa"],
    configs: [],
    matchPatterns: [
      "**/*.controller.ts",
      "**/*.service.ts",
      "**/*.route.ts",
    ],
    matchKeywords: [
      "api",
      "endpoint",
      "service",
      "controller",
      "route",
      "middleware",
    ],
  },
  {
    name: "database",
    description: "Database and data layer development",
    dirs: ["migrations", "seeds", "models", "entities", "src/entities"],
    deps: [
      "prisma",
      "@prisma/client",
      "typeorm",
      "drizzle-orm",
      "mongoose",
      "sequelize",
    ],
    configs: ["prisma/schema.prisma"],
    matchPatterns: ["**/*.entity.ts", "**/*.model.ts", "**/migrations/**"],
    matchKeywords: [
      "database",
      "migration",
      "schema",
      "entity",
      "model",
      "query",
    ],
  },
  {
    name: "infra",
    description: "Infrastructure and DevOps",
    dirs: [".github", "terraform", "k8s", "docker"],
    deps: [],
    configs: [
      "docker-compose.yml",
      "docker-compose.yaml",
      "Dockerfile",
      "terraform.tf",
    ],
    matchPatterns: ["**/*.yml", "**/*.yaml", "**/Dockerfile*"],
    matchKeywords: ["deploy", "docker", "ci", "pipeline", "infrastructure"],
  },
];

function detectStacks(projectDir: string): DetectedStack[] {
  const detected: DetectedStack[] = [];

  let deps: string[] = [];
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      deps = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ];
    } catch {
      // ignore parse errors
    }
  }

  for (const detector of STACK_DETECTORS) {
    const hasDir = detector.dirs.some((d) => existsSync(join(projectDir, d)));
    const hasDep = detector.deps.some((d) => deps.includes(d));
    const hasConfig = detector.configs.some((c) =>
      existsSync(join(projectDir, c))
    );

    if (hasDir || hasDep || hasConfig) {
      detected.push({
        name: detector.name,
        description: detector.description,
        matchPatterns: detector.matchPatterns,
        matchKeywords: detector.matchKeywords,
      });
    }
  }

  return detected;
}

function generateAgentMd(stack: DetectedStack, projectName: string): string {
  return `---
name: ${projectName}-${stack.name}
description: ${stack.description} for ${projectName}
model: sonnet
---

# ${projectName} ${stack.name.charAt(0).toUpperCase() + stack.name.slice(1)} Agent

Specialized agent for ${stack.description.toLowerCase()} in the ${projectName} project.

## Auto-Assignment Rules

This agent is automatically assigned to tasks matching:
- **File patterns:** ${stack.matchPatterns.join(", ")}
- **Keywords:** ${stack.matchKeywords.join(", ")}

## Guidelines

- Follow project conventions in CLAUDE.md
- Check existing patterns before creating new ones
- Write tests for all new functionality
- Keep changes focused on the task scope
`;
}

export async function agents(options: { dir: string }): Promise<void> {
  const projectDir = join(process.cwd(), options.dir);
  const projectName = basename(projectDir);

  log("Scanning project structure...");
  log(`  Directory: ${projectDir}`);

  const stacks = detectStacks(projectDir);

  if (stacks.length === 0) {
    logWarn("No recognizable project structure detected.");
    log("  You can create agents manually in ~/.claude/agents/");
    return;
  }

  log(`\n  Detected stacks: ${stacks.map((s) => s.name).join(", ")}`);

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    "\nOptions:\n  1. Auto-generate agents\n  2. Skip (I'll provide my own)\n\nChoice [1/2]: "
  );
  rl.close();

  if (answer !== "1") {
    log("  Skipped agent generation.");
    return;
  }

  const agentsDir = join(CLAUDE_DIR, "agents");
  ensureDir(agentsDir);

  for (const stack of stacks) {
    const filename = `${projectName}-${stack.name}.md`;
    const filepath = join(agentsDir, filename);
    const content = generateAgentMd(stack, projectName);

    writeFileSync(filepath, content);
    logSuccess(`${filename} — ${stack.description}`);
  }

  log(`\n  Generated ${stacks.length} agent(s) in ~/.claude/agents/`);
}
