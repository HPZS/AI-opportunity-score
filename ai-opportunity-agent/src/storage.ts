import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { normalizeParsedTaskResult } from "./result-normalizer.js";

interface TaskStorageInput {
  taskType: string;
  originalTaskType?: string;
  model: string;
  taskMessage: string;
  prompt?: string;
  inputFile?: string;
  assistantText: string;
  attemptCount?: number;
  stoppedByUser?: boolean;
  completed?: boolean;
  tokens?: {
    input: number;
    output: number;
  };
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "task";
}

function extractJsonFromText(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRecordArray(container: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = container[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function writeJsonFile(dir: string, fileName: string, payload: unknown): void {
  ensureDir(dir);
  writeFileSync(join(dir, fileName), JSON.stringify(payload, null, 2), "utf-8");
}

function buildScreeningPool(parsedResult: Record<string, unknown>, baseName: string, savedAt: string): Record<string, unknown>[] {
  const buckets = [
    { key: "currentOpportunities", bucket: "current_opportunity" },
    { key: "historicalCases", bucket: "historical_case" },
    { key: "policySignals", bucket: "policy_signal" },
    { key: "outOfWindowLeads", bucket: "out_of_window" },
    { key: "leads", bucket: "legacy" },
  ];

  return buckets.flatMap(({ key, bucket }) =>
    collectRecordArray(parsedResult, key).map((item) => ({
      ...item,
      screeningTaskId: baseName,
      capturedAt: savedAt,
      sourceBucket: bucket,
    }))
  );
}

function writeTaskArtifacts(
  taskType: string,
  baseName: string,
  payload: Record<string, unknown>,
  parsedResult: unknown
): void {
  if (taskType === "screening") {
    const runsDir = join(process.cwd(), "data", "screening-runs");
    const poolDir = join(process.cwd(), "data", "screening-pool");
    writeJsonFile(runsDir, `${baseName}.json`, payload);
    if (isRecord(parsedResult)) {
      const pool = buildScreeningPool(parsedResult, baseName, String(payload.savedAt || new Date().toISOString()));
      if (pool.length > 0) {
        writeJsonFile(poolDir, `${baseName}.json`, pool);
      }
    }
    return;
  }

  if (taskType === "investigation") {
    const runsDir = join(process.cwd(), "data", "investigation-runs");
    const reportsDir = join(process.cwd(), "data", "investigation-reports");
    writeJsonFile(runsDir, `${baseName}.json`, payload);
    if (parsedResult !== null) {
      writeJsonFile(reportsDir, `${baseName}.json`, parsedResult);
    }
    return;
  }

  if (isRecord(parsedResult)) {
    const reportsDir = join(process.cwd(), "data", "reports");
    const leadsDir = join(process.cwd(), "data", "leads");
    writeJsonFile(reportsDir, `${baseName}.json`, parsedResult);
    const flatLeads = buildScreeningPool(parsedResult, baseName, String(payload.savedAt || new Date().toISOString()));
    if (flatLeads.length > 0) {
      writeJsonFile(leadsDir, `${baseName}.json`, flatLeads);
    }
  }
}

export function saveTaskResult(input: TaskStorageInput): { filePath: string; parsed: boolean } {
  const baseDir = join(process.cwd(), "data", "task-results");
  ensureDir(baseDir);

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}_${slugify(input.taskType)}`;
  const filename = `${baseName}.json`;
  const filePath = join(baseDir, filename);
  const parsedResult = normalizeParsedTaskResult(input.taskType, extractJsonFromText(input.assistantText));

  const payload = {
    taskType: input.taskType,
    originalTaskType: input.originalTaskType || input.taskType,
    model: input.model,
    savedAt: now.toISOString(),
    taskInput: {
      prompt: input.prompt || null,
      inputFile: input.inputFile || null,
      taskMessage: input.taskMessage,
    },
    taskMeta: {
      attemptCount: input.attemptCount || 1,
      stoppedByUser: input.stoppedByUser || false,
      completed: input.completed !== false,
    },
    tokens: input.tokens || null,
    parsed: parsedResult !== null,
    result: parsedResult,
    rawText: input.assistantText,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  writeTaskArtifacts(input.taskType, baseName, payload, parsedResult);
  return { filePath, parsed: parsedResult !== null };
}
