import { existsSync, readFileSync } from "fs";
import { Agent } from "./agent.js";
import { printInfo } from "./ui.js";
import { buildInvestigationResumePrompt, loadLatestInvestigationRecovery } from "./investigation-recovery.js";
import { resolveTaskProfile } from "./task-config.js";
import { SCREENING_DEFAULT_CONFIG } from "./config/screening-config.js";
import { normalizeParsedTaskResult } from "./result-normalizer.js";

type JsonRecord = Record<string, unknown>;

interface ParsedArgsLike {
  taskType?: string;
  prompt?: string;
  inputFile?: string;
}

interface AgentRunResult {
  text: string;
  tokens: {
    input: number;
    output: number;
  };
}

export interface TaskExecutionResult {
  taskMessage: string;
  taskType: string;
  originalTaskType: string;
  result: AgentRunResult;
  attemptCount: number;
  stoppedByUser: boolean;
  validation: {
    ok: boolean;
    message?: string;
  };
}

interface TaskRunOptions {
  shouldStop?: () => boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRecordArray(container: JsonRecord, key: string): JsonRecord[] {
  const value = container[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function collectStringArray(container: JsonRecord, key: string): string[] {
  const value = container[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function truncateText(text: string, limit = 2000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message.toLowerCase().includes("aborted");
}

export function buildTaskMessage(taskType?: string, prompt?: string, inputFile?: string): string | null {
  const parts: string[] = [];
  const taskProfile = resolveTaskProfile(taskType);

  if (taskType) {
    parts.push(`任务类型: ${taskProfile.canonicalType}`);
    if (taskType !== taskProfile.canonicalType) {
      parts.push(`兼容任务别名: ${taskType}`);
    }
  }
  if (prompt) parts.push(`任务说明:\n${prompt}`);

  if (inputFile) {
    if (!existsSync(inputFile)) throw new Error(`输入文件不存在: ${inputFile}`);
    const raw = readFileSync(inputFile, "utf-8").trim();
    if (raw) parts.push(`任务输入:\n${raw}`);
  }

  if (taskProfile.buildExecutionSummary) {
    parts.push(taskProfile.buildExecutionSummary());
  }

  if (taskProfile.canonicalType === "investigation") {
    const checkpoint = loadLatestInvestigationRecovery({
      taskType: taskProfile.canonicalType,
      prompt,
      inputFile,
    });
    if (checkpoint) {
      parts.push(buildInvestigationResumePrompt(checkpoint));
    }
  }

  parts.push(taskProfile.buildOutputRequirements());

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

export function extractJsonFromText(text: string): unknown {
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

function getNormalizedParsedResult(taskType: string, assistantText: string): unknown {
  return normalizeParsedTaskResult(taskType, extractJsonFromText(assistantText));
}

function getPoolEntryCount(parsed: unknown): number | null {
  if (!isRecord(parsed)) return null;
  const summary = parsed.summary;
  if (!isRecord(summary)) return null;
  const poolEntryCount = Number(summary.poolEntryCount);
  return Number.isFinite(poolEntryCount) ? poolEntryCount : null;
}

export function validateTaskResult(taskType: string, assistantText: string): { ok: boolean; message?: string } {
  if (taskType !== "screening") {
    return { ok: true };
  }

  const parsed = getNormalizedParsedResult(taskType, assistantText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "初筛任务未输出可解析的结构化 JSON，无法判断是否达到候选池目标数量。" };
  }

  const poolEntryCount = getPoolEntryCount(parsed);
  if (poolEntryCount === null) {
    return { ok: false, message: "初筛结果缺少有效的 summary.poolEntryCount，无法校验候选池目标数量。" };
  }

  if (poolEntryCount < SCREENING_DEFAULT_CONFIG.targetPoolEntryCount) {
    return {
      ok: false,
      message: `初筛未达成目标：候选池入池数量 ${poolEntryCount}，低于配置目标 ${SCREENING_DEFAULT_CONFIG.targetPoolEntryCount}。`,
    };
  }

  return { ok: true };
}

function summarizeExistingLeads(parsed: unknown): string {
  if (!isRecord(parsed)) return "暂无可复用的结构化结果，请继续检索并输出完整 JSON。";

  const summary = isRecord(parsed.summary) ? parsed.summary : {};
  const sections = [
    { key: "currentOpportunities", label: "currentOpportunities" },
    { key: "historicalCases", label: "historicalCases" },
    { key: "policySignals", label: "policySignals" },
    { key: "outOfWindowLeads", label: "outOfWindowLeads" },
  ];

  const lines = [
    `- 当前 poolEntryCount: ${Number(summary.poolEntryCount) || 0}`,
    `- currentOpportunityCount: ${Number(summary.currentOpportunityCount) || 0}`,
    `- historicalCaseCount: ${Number(summary.historicalCaseCount) || 0}`,
    `- policySignalCount: ${Number(summary.policySignalCount) || 0}`,
    `- outOfWindowCount: ${Number(summary.outOfWindowCount) || 0}`,
  ];

  const leadLines = sections.flatMap(({ key, label }) => {
    const items = collectRecordArray(parsed, key)
      .map((item) => {
        const title = typeof item.title === "string" ? item.title : "未命名线索";
        const url = typeof item.url === "string" ? item.url : "";
        return `  - ${label}: ${title}${url ? ` | ${url}` : ""}`;
      })
      .slice(0, 8);
    return items;
  });

  return [...lines, ...leadLines].join("\n");
}

function buildScreeningContinuationPrompt(assistantText: string, attemptCount: number): string {
  const parsed = getNormalizedParsedResult("screening", assistantText);
  const poolEntryCount = getPoolEntryCount(parsed);
  const target = SCREENING_DEFAULT_CONFIG.targetPoolEntryCount;
  const summaryText = summarizeExistingLeads(parsed);
  const notes = isRecord(parsed) ? collectStringArray(parsed, "notes").slice(0, 6) : [];
  const noteText = notes.length > 0 ? notes.map((item) => `- ${item}`).join("\n") : "- 暂无模型自带说明。";

  return [
    "上轮初筛尚未完成，请继续执行，不要直接结束。",
    "",
    `当前是任务级自动续跑，第 ${attemptCount} 次完整尝试。`,
    `当前入池数量: ${poolEntryCount ?? "未知"} / 目标数量: ${target}`,
    "",
    "请严格遵守以下要求：",
    "1. 保留并复用上轮已经确认的有效线索，不要丢失已有结果。",
    "2. 不要重复输出相同 URL 的线索；优先补充新的政府官网、采购网、公共资源交易平台结果。",
    "3. 如果当前候选池数量仍不足，请继续补搜，而不是提前收尾。",
    "4. 对 PDF 只有正文日期的线索，继续保持时间待核验状态，不要强行判为窗口外。",
    "5. 最终必须重新输出一份完整的结构化 JSON，不要只输出增量说明。",
    "",
    "上轮规范化摘要：",
    summaryText,
    "",
    "上轮 notes 摘要：",
    noteText,
    "",
    "请从现有上下文继续补搜，并输出完整 JSON。",
  ].join("\n");
}

export async function runTaskWithSupervisor(
  agent: Agent,
  params: ParsedArgsLike,
  options: TaskRunOptions = {}
): Promise<TaskExecutionResult | null> {
  const taskMessage = buildTaskMessage(params.taskType, params.prompt, params.inputFile);
  if (!taskMessage) return null;

  const taskProfile = resolveTaskProfile(params.taskType);
  const canonicalTaskType = taskProfile.canonicalType;
  const originalTaskType = params.taskType || canonicalTaskType;
  const shouldStop = options.shouldStop || (() => false);
  const shouldRunUntilTarget = canonicalTaskType === "screening";

  let attemptCount = 0;
  let latestResult: AgentRunResult | null = null;
  let validation: { ok: boolean; message?: string } = { ok: true };
  let nextPrompt = taskMessage;

  while (true) {
    if (shouldStop() && !latestResult) {
      throw new Error("任务已按用户请求终止，尚未产出可保存的完整结果。");
    }

    if (shouldStop() && latestResult) {
      printInfo("检测到手动终止请求，停止继续补跑，保留当前已成功入池的结果。");
      break;
    }

    try {
      latestResult = await agent.runOnce(nextPrompt);
      attemptCount += 1;
      validation = validateTaskResult(canonicalTaskType, latestResult.text);
    } catch (error) {
      if (isAbortLikeError(error) && shouldStop() && latestResult) {
        printInfo("当前尝试已按用户请求停止，回退到上一轮已完成结果继续收尾保存。");
        break;
      }
      if (isAbortLikeError(error) && shouldStop()) {
        throw new Error("任务已按用户请求终止，但当前尚无可保存的完整结果。");
      }
      throw error;
    }

    if (!shouldRunUntilTarget || validation.ok) {
      break;
    }

    if (shouldStop()) {
      printInfo("检测到手动终止请求，当前未达标，但将保留已完成尝试中的入池结果。");
      break;
    }

    const nextAttempt = attemptCount + 1;
    printInfo(`初筛任务未达标，继续任务级补跑（第 ${nextAttempt} 次完整尝试）。`);
    nextPrompt = buildScreeningContinuationPrompt(latestResult.text, nextAttempt);
  }

  if (!latestResult) return null;

  return {
    taskMessage,
    taskType: canonicalTaskType,
    originalTaskType,
    result: latestResult,
    attemptCount,
    stoppedByUser: shouldStop() && !validation.ok,
    validation,
  };
}

export function buildTaskFailureMessage(validation: { ok: boolean; message?: string }): string | undefined {
  if (validation.ok) return undefined;
  return truncateText(validation.message || "任务结果校验失败。", 500);
}
