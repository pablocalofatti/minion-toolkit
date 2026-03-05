export interface ReportResult {
  taskNumber: number;
  taskTitle: string;
  state: "completed" | "failed" | "cancelled";
  branch: string;
  filesChanged: string[];
}

export interface ReportViolation {
  taskNumber: number;
  taskTitle: string;
  outOfScopeFiles: string[];
}

export interface IntegrationStats {
  total: number;
  successful: number;
  failed: number;
  scopeViolations: number;
}

export interface IntegrationReportOutput {
  markdown: string;
  stats: IntegrationStats;
}

const STATUS_ICON: Record<ReportResult["state"], string> = {
  completed: "success",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

function buildViolationMap(
  violations: ReportViolation[]
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const v of violations) {
    map.set(v.taskNumber, v.outOfScopeFiles);
  }
  return map;
}

function buildTableRow(
  result: ReportResult,
  outOfScopeFiles: string[] | undefined
): string {
  const scopeCell =
    outOfScopeFiles && outOfScopeFiles.length > 0
      ? `WARN: ${outOfScopeFiles.length} out-of-scope`
      : "clean";

  const filesCell = result.filesChanged.length > 0
    ? result.filesChanged.join(", ")
    : "(none)";

  return `| Task ${result.taskNumber}: ${result.taskTitle} | ${STATUS_ICON[result.state]} | ${result.branch} | ${filesCell} | ${scopeCell} |`;
}

function buildWarningsSection(violations: ReportViolation[]): string {
  if (violations.length === 0) return "";

  const lines = ["\n## Scope Warnings\n"];
  for (const v of violations) {
    lines.push(`**Task ${v.taskNumber} (${v.taskTitle})** modified out-of-scope files:`);
    for (const file of v.outOfScopeFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function integrationReport(
  results: ReportResult[],
  violations: ReportViolation[]
): IntegrationReportOutput {
  const violationMap = buildViolationMap(violations);

  const tableHeader = [
    "| Task | Status | Branch | Files | Scope |",
    "|------|--------|--------|-------|-------|",
  ];

  const tableRows = results.map((r) =>
    buildTableRow(r, violationMap.get(r.taskNumber))
  );

  const warningsSection = buildWarningsSection(violations);

  const markdown =
    "## Integration Report\n\n" +
    [...tableHeader, ...tableRows].join("\n") +
    warningsSection;

  const successful = results.filter((r) => r.state === "completed").length;
  const failed = results.filter(
    (r) => r.state === "failed" || r.state === "cancelled"
  ).length;

  return {
    markdown,
    stats: {
      total: results.length,
      successful,
      failed,
      scopeViolations: violations.length,
    },
  };
}
