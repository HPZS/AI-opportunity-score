import { existsSync, readFileSync } from "fs";
import { Agent } from "./agent.js";
import { printInfo } from "./ui.js";
import { buildInvestigationResumePrompt, loadLatestInvestigationRecovery } from "./investigation-recovery.js";
import { SCREENING_DEFAULT_CONFIG, getScreeningMaxSupervisorAttempts } from "./config/screening-config.js";
import { resolveTaskProfile } from "./task-config.js";
import { normalizeParsedTaskResult } from "./result-normalizer.js";

type JsonRecord = Record<string, unknown>;

interface ParsedArgsLike {
  taskType?: string;
  prompt?: string;
  inputFile?: string;
}

export interface AgentRunResult {
  text: string;
  tokens: {
    input: number;
    output: number;
  };
}

export interface TaskValidationResult {
  ok: boolean;
  partial: boolean;
  message?: string;
  reasonCode?: "invalid_json" | "missing_pool_entry_count" | "target_not_met" | "max_attempts_reached";
  poolEntryCount?: number | null;
  targetPoolEntryCount?: number;
}

export interface TaskExecutionResult {
  taskMessage: string;
  taskType: string;
  originalTaskType: string;
  result: AgentRunResult;
  attemptCount: number;
  stoppedByUser: boolean;
  validation: TaskValidationResult;
}

export interface SavableTaskAttemptSnapshot {
  taskMessage: string;
  taskType: string;
  originalTaskType: string;
  result: AgentRunResult;
  attemptCount: number;
  validation: TaskValidationResult;
}

interface TaskRunOptions {
  shouldStop?: () => boolean;
  onSavableAttempt?: (attempt: SavableTaskAttemptSnapshot) => Promise<void> | void;
}

interface SavableTaskAttempt {
  result: AgentRunResult;
  validation: TaskValidationResult;
  attemptCount: number;
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

function canSavePartialResult(validation: TaskValidationResult): boolean {
  return validation.ok || validation.partial;
}

function chooseBetterSavableAttempt(
  current: SavableTaskAttempt | null,
  next: SavableTaskAttempt,
): SavableTaskAttempt {
  if (!current) return next;
  const currentPoolEntryCount = current.validation.poolEntryCount ?? -1;
  const nextPoolEntryCount = next.validation.poolEntryCount ?? -1;
  if (nextPoolEntryCount > currentPoolEntryCount) return next;
  if (nextPoolEntryCount < currentPoolEntryCount) return current;
  return next.attemptCount >= current.attemptCount ? next : current;
}

function buildMaxAttemptsReachedValidation(
  maxAttempts: number,
  poolEntryCount: number | null,
  targetPoolEntryCount: number,
): TaskValidationResult {
  return {
    ok: false,
    partial: true,
    reasonCode: "max_attempts_reached",
    poolEntryCount,
    targetPoolEntryCount,
    message: `初筛已达到最大补跑次数 ${maxAttempts}，当前候选池入池数量 ${poolEntryCount ?? 0}，仍低于目标 ${targetPoolEntryCount}。系统将保存当前最佳结果并结束本次任务。`,
  };
}

export function validateTaskResult(taskType: string, assistantText: string): TaskValidationResult {
  if (taskType !== "screening") {
    return { ok: true, partial: false };
  }

  const parsed = getNormalizedParsedResult(taskType, assistantText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      partial: false,
      reasonCode: "invalid_json",
      message: "初筛任务未输出可解析的结构化 JSON，无法判断是否达到候选池目标数量。",
    };
  }

  const poolEntryCount = getPoolEntryCount(parsed);
  if (poolEntryCount === null) {
    return {
      ok: false,
      partial: false,
      reasonCode: "missing_pool_entry_count",
      message: "初筛结果缺少有效的 summary.poolEntryCount，无法校验候选池目标数量。",
    };
  }

  if (poolEntryCount < SCREENING_DEFAULT_CONFIG.targetPoolEntryCount) {
    return {
      ok: false,
      partial: true,
      reasonCode: "target_not_met",
      poolEntryCount,
      targetPoolEntryCount: SCREENING_DEFAULT_CONFIG.targetPoolEntryCount,
      message: `初筛未达成目标：候选池入池数量 ${poolEntryCount}，低于配置目标 ${SCREENING_DEFAULT_CONFIG.targetPoolEntryCount}。`,
    };
  }

  return {
    ok: true,
    partial: false,
    poolEntryCount,
    targetPoolEntryCount: SCREENING_DEFAULT_CONFIG.targetPoolEntryCount,
  };
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
    "上一轮初筛尚未完成，请继续执行，不要直接结束。",
    "",
    `当前是任务级自动续跑，第 ${attemptCount} 次完整尝试。`,
    `当前入池数量: ${poolEntryCount ?? "未知"} / 目标数量: ${target}`,
    "",
    "请严格遵守以下要求：",
    "1. 保留并复用上轮已经确认的有效线索，不要丢失已有结果。",
    "2. 不要重复输出相同 URL 的线索；优先补充新的政府官网、采购网、公共资源交易平台结果。",
    "3. 如果当前候选池数量仍然不足，请继续补搜，而不是提前收尾。",
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
  options: TaskRunOptions = {},
): Promise<TaskExecutionResult | null> {
  const taskMessage = buildTaskMessage(params.taskType, params.prompt, params.inputFile);
  if (!taskMessage) return null;

  const taskProfile = resolveTaskProfile(params.taskType);
  const canonicalTaskType = taskProfile.canonicalType;
  const originalTaskType = params.taskType || canonicalTaskType;
  const shouldStop = options.shouldStop || (() => false);
  const onSavableAttempt = options.onSavableAttempt;
  const shouldRunUntilTarget = canonicalTaskType === "screening";
  const maxSupervisorAttempts = shouldRunUntilTarget
    ? getScreeningMaxSupervisorAttempts(SCREENING_DEFAULT_CONFIG)
    : 1;

  let attemptCount = 0;
  let latestResult: AgentRunResult | null = null;
  let bestSavableAttempt: SavableTaskAttempt | null = null;
  let validation: TaskValidationResult = { ok: true, partial: false };
  let nextPrompt = taskMessage;

  while (true) {
    if (shouldStop() && !bestSavableAttempt) {
      throw new Error("任务已按用户请求终止，但尚未产出可保存的完整结果。");
    }

    if (shouldStop() && bestSavableAttempt) {
      latestResult = bestSavableAttempt.result;
      validation = bestSavableAttempt.validation;
      printInfo("检测到手动终止请求，停止继续补跑，保留当前最佳可保存结果。");
      break;
    }

    try {
      latestResult = await agent.runOnce(nextPrompt);
      attemptCount += 1;
      validation = validateTaskResult(canonicalTaskType, latestResult.text);

      if (canSavePartialResult(validation)) {
        const candidateAttempt = {
          result: latestResult,
          validation,
          attemptCount,
        };
        const selectedAttempt = chooseBetterSavableAttempt(bestSavableAttempt, candidateAttempt);
        bestSavableAttempt = selectedAttempt;
        if (selectedAttempt === candidateAttempt && onSavableAttempt) {
          await onSavableAttempt({
            taskMessage,
            taskType: canonicalTaskType,
            originalTaskType,
            result: latestResult,
            attemptCount,
            validation,
          });
        }
      }
    } catch (error) {
      if (isAbortLikeError(error) && shouldStop() && bestSavableAttempt) {
        latestResult = bestSavableAttempt.result;
        validation = bestSavableAttempt.validation;
        printInfo("当前尝试已按用户请求停止，回退到上一轮最佳结果继续收尾保存。");
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
      if (bestSavableAttempt) {
        latestResult = bestSavableAttempt.result;
        validation = bestSavableAttempt.validation;
      }
      printInfo("检测到手动终止请求，当前未达标，但将保留已完成尝试中的入池结果。");
      break;
    }

    if (attemptCount >= maxSupervisorAttempts) {
      if (bestSavableAttempt) {
        latestResult = bestSavableAttempt.result;
        validation = buildMaxAttemptsReachedValidation(
          maxSupervisorAttempts,
          bestSavableAttempt.validation.poolEntryCount ?? null,
          SCREENING_DEFAULT_CONFIG.targetPoolEntryCount,
        );
        printInfo(validation.message || `初筛已达到最大补跑次数 ${maxSupervisorAttempts}`);
        break;
      }

      validation = {
        ok: false,
        partial: false,
        reasonCode: "max_attempts_reached",
        targetPoolEntryCount: SCREENING_DEFAULT_CONFIG.targetPoolEntryCount,
        message: `初筛已达到最大补跑次数 ${maxSupervisorAttempts}，但仍未产生可保存的结构化结果。`,
      };
      printInfo(validation.message || `初筛已达到最大补跑次数 ${maxSupervisorAttempts}`);
      break;
    }

    const nextAttempt = attemptCount + 1;
    printInfo(`初筛任务未达标，继续任务级补跑（第 ${nextAttempt} 次完整尝试）。`);
    nextPrompt = buildScreeningContinuationPrompt(latestResult.text, nextAttempt);
  }

  if (!latestResult && bestSavableAttempt) {
    latestResult = bestSavableAttempt.result;
    validation = bestSavableAttempt.validation;
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

export function buildTaskFailureMessage(validation: TaskValidationResult): string | undefined {
  if (validation.ok) return undefined;
  return truncateText(validation.message || "任务结果校验失败。", 500);
}
