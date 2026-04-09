import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Agent, ToolExecutionTraceEntry } from "./agent.js";
import { normalizeParsedTaskResult } from "./result-normalizer.js";
import { updateRuntimeOverridesFromReview } from "./self-healing.js";

interface JsonRecord {
  [key: string]: unknown;
}

interface ValidationResult {
  ok: boolean;
  message?: string;
}

export interface ScreeningSelfImprovementInput {
  taskType: string;
  model: string;
  prompt?: string;
  taskMessage: string;
  assistantText: string;
  attemptCount: number;
  validation: ValidationResult;
  taskResultFilePath: string;
}

export interface ScreeningSelfImprovementResult {
  filePath: string;
  parsed: boolean;
  text: string;
  runtimeOverridesFilePath?: string;
  activatedRuntimeGuards?: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRecordArray(container: JsonRecord, key: string): JsonRecord[] {
  const value = container[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
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

function truncateText(text: string, limit = 1200): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "review";
}

function parseMaybeJson(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeSearchResult(result: JsonRecord): JsonRecord {
  const results = Array.isArray(result.results) ? result.results : [];
  return {
    query: result.query || "",
    sourceProfileIds: result.sourceProfileIds || [],
    subscriptionId: result.subscriptionId || null,
    extraKeywords: result.extraKeywords || [],
    timeWindowDays: result.timeWindowDays || null,
    resultCount: result.resultCount || 0,
    titles: results.slice(0, 8).map((item) => {
      if (!isRecord(item)) return item;
      return {
        title: item.title || "",
        domain: item.domain || "",
        published_date: item.published_date || "",
      };
    }),
  };
}

function summarizeScreeningResult(result: JsonRecord, input: JsonRecord): JsonRecord {
  return {
    title: input.title || "",
    source_domain: input.source_domain || "",
    publish_time: input.publish_time || null,
    publish_time_raw: input.publish_time_raw || null,
    leadCategory: result.leadCategory || "",
    opportunityStage: result.opportunityStage || "",
    isActionableNow: result.isActionableNow || false,
    shouldEnterPool: result.shouldEnterPool || false,
    aiFitScore: result.aiFitScore || null,
    maturityScore: result.maturityScore || null,
    totalScore: result.totalScore || null,
    categoryReason: result.categoryReason || "",
  };
}

function summarizeTraceEntry(entry: ToolExecutionTraceEntry): JsonRecord {
  const parsedResult = parseMaybeJson(entry.result);

  if (entry.name === "search_web" && parsedResult) {
    return {
      tool: entry.name,
      input: {
        query: entry.input.query || "",
        source_profile_ids: entry.input.source_profile_ids || [],
        subscription_id: entry.input.subscription_id || null,
        extra_keywords: entry.input.extra_keywords || [],
        time_window_days: entry.input.time_window_days || null,
      },
      output: summarizeSearchResult(parsedResult),
    };
  }

  if ((entry.name === "screen_opportunity" || entry.name === "analyze_opportunity") && parsedResult) {
    return {
      tool: entry.name,
      output: summarizeScreeningResult(parsedResult, entry.input),
    };
  }

  if (entry.name === "extract_signal" && parsedResult) {
    return {
      tool: entry.name,
      output: {
        title: parsedResult.title || entry.input.title || "",
        normalizedTitle: parsedResult.normalizedTitle || "",
        publishTime: parsedResult.publishTime || null,
        publishTimeRaw: parsedResult.publishTimeRaw || null,
        publishTimeConfidence: parsedResult.publishTimeConfidence || null,
        sourceType: parsedResult.sourceType || "",
        opportunityStage: parsedResult.opportunityStage || "",
      },
    };
  }

  if (entry.name === "fetch_page" && parsedResult) {
    return {
      tool: entry.name,
      input: { url: entry.input.url || "" },
      output: {
        title: parsedResult.title || "",
        contentLength: parsedResult.contentLength || 0,
        fetchedAt: parsedResult.fetchedAt || "",
      },
    };
  }

  return {
    tool: entry.name,
    input: entry.input,
    output: truncateText(entry.result, 600),
  };
}

function summarizeToolTrace(trace: ToolExecutionTraceEntry[]): JsonRecord[] {
  return trace
    .filter((entry) => ["search_web", "fetch_page", "extract_signal", "screen_opportunity", "analyze_opportunity"].includes(entry.name))
    .slice(-24)
    .map(summarizeTraceEntry);
}

function summarizeBucket(parsedResult: JsonRecord, key: string): JsonRecord[] {
  return collectRecordArray(parsedResult, key).slice(0, 10).map((item) => ({
    title: item.title || "",
    url: item.url || "",
    leadCategory: item.leadCategory || "",
    opportunityStage: item.opportunityStage || "",
    isActionableNow: item.isActionableNow || false,
    shouldEnterPool: item.shouldEnterPool || false,
    totalScore: item.totalScore || null,
    categoryReason: item.categoryReason || "",
    notes: Array.isArray(item.notes) ? item.notes.slice(0, 4) : [],
  }));
}

function summarizeParsedResult(parsedResult: unknown): JsonRecord | null {
  if (!isRecord(parsedResult)) return null;
  return {
    summary: isRecord(parsedResult.summary) ? parsedResult.summary : {},
    timeWindow: isRecord(parsedResult.timeWindow) ? parsedResult.timeWindow : {},
    currentOpportunities: summarizeBucket(parsedResult, "currentOpportunities"),
    historicalCases: summarizeBucket(parsedResult, "historicalCases"),
    policySignals: summarizeBucket(parsedResult, "policySignals"),
    outOfWindowLeads: summarizeBucket(parsedResult, "outOfWindowLeads"),
    notes: Array.isArray(parsedResult.notes) ? parsedResult.notes.slice(0, 12) : [],
  };
}

function getReviewDir(): string {
  return join(process.cwd(), "data", "self-improvement-reviews");
}

function loadRecentReviewSummaries(limit = 3): JsonRecord[] {
  const dir = getReviewDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .slice(-limit);

  return files.map((fileName) => {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, fileName), "utf-8"));
      const result = isRecord(parsed.result) ? parsed.result : {};
      const summary = isRecord(result.summary) ? result.summary : {};
      return {
        fileName,
        savedAt: parsed.savedAt || "",
        rootCauseSummary: summary.rootCauseSummary || "",
        priority: summary.priority || "",
        blockedGoodOpportunityCount: summary.blockedGoodOpportunityCount || 0,
        admittedBadOpportunityCount: summary.admittedBadOpportunityCount || 0,
        searchQualityIssueCount: summary.searchQualityIssueCount || 0,
      };
    } catch {
      return {
        fileName,
        savedAt: "",
        rootCauseSummary: "历史复盘文件解析失败",
      };
    }
  });
}

function buildReviewPrompt(input: ScreeningSelfImprovementInput, parsedResult: unknown, traceSummary: JsonRecord[]): string {
  const parsedSummary = summarizeParsedResult(parsedResult);
  const recentReviews = loadRecentReviewSummaries();

  return [
    "请对本次 screening 运行做持续改进复盘。",
    "",
    "复盘边界：",
    "1. 用户配置的信号源、关键词、订阅词是用户意图的一部分，不要建议直接修改这些配置本身。",
    "2. 允许指出这些配置在当前任务下导致的覆盖边界或噪声后果，但改进建议应优先落在搜索编排、结果过滤、规则闸门、时间判断、标题规范化、PDF处理、重排序和分桶逻辑上。",
    "3. 重点回答：为什么没有搜到更匹配的信息、是否有好机会被挡、是否有坏机会入库、噪声是否来自搜索词展开或规则缺陷。",
    "4. 如果证据不足，要明确标记待验证点，不要臆断。",
    "",
    "请输出严格 JSON，结构如下：",
    "```json",
    "{",
    '  "reviewType": "screening_self_improvement",',
    '  "summary": {',
    '    "rootCauseSummary": "一句话总结",',
    '    "priority": "high|medium|low",',
    '    "searchQualityIssueCount": 0,',
    '    "blockedGoodOpportunityCount": 0,',
    '    "admittedBadOpportunityCount": 0',
    "  },",
    '  "configBoundary": {',
    '    "mustRespectUserConfig": true,',
    '    "shouldModifyUserConfig": false,',
    '    "reason": "为什么不能直接改用户配置"',
    "  },",
    '  "diagnosis": {',
    '    "searchQualityIssues": [],',
    '    "blockedGoodOpportunities": [],',
    '    "admittedBadOpportunities": [],',
    '    "ruleIssues": [],',
    '    "evidenceGaps": []',
    "  },",
    '  "recommendedImprovements": {',
    '    "searchLogic": [],',
    '    "ruleLogic": [],',
    '    "normalizationAndExtraction": [],',
    '    "rankingAndBucketing": []',
    "  },",
    '  "notes": []',
    "}",
    "```",
    "",
    `任务模型: ${input.model}`,
    `任务结果文件: ${input.taskResultFilePath}`,
    `任务尝试次数: ${input.attemptCount}`,
    `任务校验状态: ${input.validation.ok ? "通过" : "未通过"}`,
    `任务校验说明: ${input.validation.message || "无"}`,
    "",
    "原始任务说明：",
    input.prompt || "(无独立 prompt，见 taskMessage)",
    "",
    "任务消息：",
    truncateText(input.taskMessage, 6000),
    "",
    "本轮结果摘要：",
    JSON.stringify(parsedSummary || { parsed: false }, null, 2),
    "",
    "本轮工具轨迹摘要：",
    JSON.stringify(traceSummary, null, 2),
    "",
    "最近历史复盘摘要：",
    JSON.stringify(recentReviews, null, 2),
  ].join("\n");
}

function saveReviewFile(input: {
  taskType: string;
  taskResultFilePath: string;
  model: string;
  attemptCount: number;
  validation: ValidationResult;
  traceSummary: JsonRecord[];
  reviewText: string;
  reviewParsed: unknown;
}): string {
  const dir = getReviewDir();
  ensureDir(dir);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}_${slugify(`${input.taskType}_self_improvement`)}`;
  const filePath = join(dir, `${baseName}.json`);
  const payload = {
    reviewType: "screening_self_improvement",
    taskType: input.taskType,
    taskResultFilePath: input.taskResultFilePath,
    model: input.model,
    savedAt: now.toISOString(),
    attemptCount: input.attemptCount,
    validation: input.validation,
    traceSummary: input.traceSummary,
    parsed: input.reviewParsed !== null,
    result: input.reviewParsed,
    rawText: input.reviewText,
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return filePath;
}

export async function runScreeningSelfImprovementReview(
  agent: Agent,
  input: ScreeningSelfImprovementInput
): Promise<ScreeningSelfImprovementResult | null> {
  if (input.taskType !== "screening") return null;

  const parsedResult = normalizeParsedTaskResult(input.taskType, extractJsonFromText(input.assistantText));
  const traceSummary = summarizeToolTrace(agent.exportToolExecutionTrace());
  const reviewPrompt = buildReviewPrompt(input, parsedResult, traceSummary);
  const reviewRun = await agent.runSkillOnce("opportunity-screening-self-improvement", reviewPrompt);
  const parsedReview = extractJsonFromText(reviewRun.text);
  const filePath = saveReviewFile({
    taskType: input.taskType,
    taskResultFilePath: input.taskResultFilePath,
    model: input.model,
    attemptCount: input.attemptCount,
    validation: input.validation,
    traceSummary,
    reviewText: reviewRun.text,
    reviewParsed: parsedReview,
  });
  const runtimeUpdate = updateRuntimeOverridesFromReview(parsedReview, {
    reviewFilePath: filePath,
    taskResultFilePath: input.taskResultFilePath,
  });

  return {
    filePath,
    parsed: parsedReview !== null,
    text: reviewRun.text,
    runtimeOverridesFilePath: runtimeUpdate?.filePath,
    activatedRuntimeGuards: runtimeUpdate?.overrides.activationReasons || [],
  };
}
