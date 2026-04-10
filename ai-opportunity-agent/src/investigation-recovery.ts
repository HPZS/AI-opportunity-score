import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import type { ToolExecutionTraceEntry } from "./agent.js";
import { attachExecutionStatsToParsedResult } from "./execution-stats.js";

type JsonRecord = Record<string, unknown>;

interface TaskResumeIdentityInput {
  taskType: string;
  prompt?: string;
  inputFile?: string;
}

interface InvestigationRecoveryBuildInput extends TaskResumeIdentityInput {
  taskMessage: string;
  toolTrace: ToolExecutionTraceEntry[];
  assistantText?: string;
  errorMessage?: string;
}

interface InvestigationRunPayload {
  savedAt?: string;
  taskMeta?: JsonRecord;
  result?: unknown;
}

export interface InvestigationRecoveryCheckpoint {
  filePath: string;
  savedAt: string;
  failureReason: string;
  result: JsonRecord;
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

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseJsonRecord(text: string): JsonRecord | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildInputSnapshot(inputFile?: string): { resolvedPath: string | null; rawText: string } {
  if (!inputFile) {
    return { resolvedPath: null, rawText: "" };
  }
  const resolvedPath = resolve(inputFile);
  if (!existsSync(resolvedPath)) {
    return { resolvedPath, rawText: "" };
  }
  return {
    resolvedPath,
    rawText: readFileSync(resolvedPath, "utf-8"),
  };
}

export function buildTaskResumeKey(input: TaskResumeIdentityInput): string {
  const snapshot = buildInputSnapshot(input.inputFile);
  const basis = [
    input.taskType.trim().toLowerCase(),
    snapshot.resolvedPath || "",
    snapshot.rawText,
    input.prompt || "",
  ].join("\n---\n");
  return createHash("sha1").update(basis).digest("hex").slice(0, 20);
}

function parseInvestigationInput(rawText: string): JsonRecord {
  if (!rawText.trim()) return {};
  try {
    const parsed = JSON.parse(rawText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeLeadTitleKey(title: string): string {
  return normalizeWhitespace(title).toLowerCase();
}

function normalizeUrlKey(url: string): string {
  return normalizeWhitespace(url).toLowerCase();
}

function getSelectedLeadKey(selectedLead: JsonRecord): string {
  const leadId = safeString(selectedLead.leadId);
  if (leadId) return `id:${leadId}`;

  const title = safeString(selectedLead.title);
  const url = safeString(selectedLead.url);
  if (title || url) {
    return `title:${normalizeLeadTitleKey(title)}|url:${normalizeUrlKey(url)}`;
  }
  return `fallback:${createHash("sha1").update(JSON.stringify(selectedLead)).digest("hex").slice(0, 12)}`;
}

function getTraceLeadCandidateKeys(input: JsonRecord, parsedResult: JsonRecord | null): string[] {
  const keys: string[] = [];

  const leadId = safeString(input.lead_id) || safeString(parsedResult?.leadId);
  if (leadId) keys.push(`id:${leadId}`);

  const title =
    safeString(input.lead_title) ||
    safeString(input.leadTitle) ||
    safeString(input.title) ||
    safeString(parsedResult?.leadTitle) ||
    safeString(parsedResult?.title);
  const url =
    safeString(input.lead_url) ||
    safeString(input.leadUrl) ||
    safeString(input.url) ||
    safeString(parsedResult?.leadUrl) ||
    safeString(parsedResult?.url);

  if (title || url) {
    keys.push(`title:${normalizeLeadTitleKey(title)}|url:${normalizeUrlKey(url)}`);
  }
  if (title) keys.push(`title:${normalizeLeadTitleKey(title)}`);
  if (url) keys.push(`url:${normalizeUrlKey(url)}`);

  return Array.from(new Set(keys));
}

function buildSelectedLeadLookup(selectedLeads: JsonRecord[]): Map<string, JsonRecord> {
  const lookup = new Map<string, JsonRecord>();
  for (const lead of selectedLeads) {
    const title = safeString(lead.title);
    const url = safeString(lead.url);
    const leadId = safeString(lead.leadId);
    const stableKey = getSelectedLeadKey(lead);
    lookup.set(stableKey, lead);
    if (leadId) lookup.set(`id:${leadId}`, lead);
    if (title) lookup.set(`title:${normalizeLeadTitleKey(title)}`, lead);
    if (url) lookup.set(`url:${normalizeUrlKey(url)}`, lead);
  }
  return lookup;
}

function findMatchedLead(
  lookup: Map<string, JsonRecord>,
  candidateKeys: string[]
): { key: string; lead: JsonRecord } | null {
  for (const key of candidateKeys) {
    const direct = lookup.get(key);
    if (direct) return { key: getSelectedLeadKey(direct), lead: direct };
  }
  return null;
}

function normalizeLinkItems(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function mergeLinkItems(...groups: JsonRecord[][]): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();
  for (const group of groups) {
    for (const item of group) {
      const url = safeString(item.url);
      const label = safeString(item.label);
      const type = safeString(item.type);
      const key = `${type}|${label}|${url}`;
      if (!merged.has(key)) merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}

function mergeTimelineItems(...groups: JsonRecord[][]): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();
  for (const group of groups) {
    for (const item of group) {
      const key = [
        safeString(item.date),
        safeString(item.type),
        safeString(item.title),
        safeString(item.sourceUrl),
      ].join("|");
      if (!merged.has(key)) merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}

function buildMainLinksFromLead(lead: JsonRecord): JsonRecord[] {
  const url = safeString(lead.url);
  if (!url) return [];
  return [{ label: "原始链接", url, type: "main" }];
}

function buildEmptySourceLinksByType(lead: JsonRecord): JsonRecord {
  const main = buildMainLinksFromLead(lead);
  return {
    main,
    sourceContinuity: [],
    similarCases: [],
    landingCases: [],
    policySupports: [],
    budgetSupports: [],
  };
}

function mergeSourceLinksByType(
  lead: JsonRecord,
  deepResult: JsonRecord | null,
  analysisResult: JsonRecord | null
): JsonRecord {
  const base = buildEmptySourceLinksByType(lead);
  const deepLinks = isRecord(deepResult?.sourceLinksByType) ? deepResult.sourceLinksByType : {};
  const analysisLinks = isRecord(analysisResult?.sourceLinksByType) ? analysisResult.sourceLinksByType : {};

  return {
    main: mergeLinkItems(
      normalizeLinkItems(base.main),
      normalizeLinkItems((deepLinks as JsonRecord).main),
      normalizeLinkItems((analysisLinks as JsonRecord).main)
    ),
    sourceContinuity: mergeLinkItems(
      normalizeLinkItems((deepLinks as JsonRecord).sourceContinuity),
      normalizeLinkItems((analysisLinks as JsonRecord).sourceContinuity)
    ),
    similarCases: mergeLinkItems(
      normalizeLinkItems((deepLinks as JsonRecord).similarCases),
      normalizeLinkItems((analysisLinks as JsonRecord).similarCases)
    ),
    landingCases: mergeLinkItems(
      normalizeLinkItems((deepLinks as JsonRecord).landingCases),
      normalizeLinkItems((analysisLinks as JsonRecord).landingCases)
    ),
    policySupports: mergeLinkItems(
      normalizeLinkItems((deepLinks as JsonRecord).policySupports),
      normalizeLinkItems((analysisLinks as JsonRecord).policySupports)
    ),
    budgetSupports: mergeLinkItems(
      normalizeLinkItems((deepLinks as JsonRecord).budgetSupports),
      normalizeLinkItems((analysisLinks as JsonRecord).budgetSupports)
    ),
  };
}

function buildRecoveryLead(
  lead: JsonRecord,
  deepResult: JsonRecord | null,
  analysisResult: JsonRecord | null
): JsonRecord {
  const sourceLinksByType = mergeSourceLinksByType(lead, deepResult, analysisResult);
  const relatedLinks = mergeLinkItems(
    normalizeLinkItems(lead.relatedLinks),
    normalizeLinkItems(deepResult?.relatedLinks),
    normalizeLinkItems(analysisResult?.relatedLinks),
    normalizeLinkItems(sourceLinksByType.main),
    normalizeLinkItems(sourceLinksByType.sourceContinuity),
    normalizeLinkItems(sourceLinksByType.similarCases),
    normalizeLinkItems(sourceLinksByType.landingCases),
    normalizeLinkItems(sourceLinksByType.policySupports),
    normalizeLinkItems(sourceLinksByType.budgetSupports)
  );
  const timeline = mergeTimelineItems(
    normalizeLinkItems(lead.timeline),
    normalizeLinkItems(deepResult?.timeline),
    normalizeLinkItems(analysisResult?.timeline)
  );

  return {
    leadId: safeString(lead.leadId),
    title: safeString(lead.title),
    description:
      safeString(deepResult?.description) ||
      safeString(lead.description) ||
      safeString((lead.screeningEvidence as JsonRecord | undefined)?.summary),
    ownerOrg: safeString(deepResult?.ownerOrg) || safeString(lead.ownerOrg),
    leadCategory: safeString(lead.leadCategory) || "current_opportunity",
    opportunityStage: safeString(lead.opportunityStage),
    relatedLinks,
    sourceLinksByType,
    timeline,
    deepAnalysis: {
      sourceContinuity: safeString(deepResult?.sourceContinuity),
      similarCaseSummary: safeString(deepResult?.similarCaseSummary),
      landingCaseSummary: safeString(deepResult?.landingCaseSummary),
      policySupportSummary: safeString(deepResult?.policySupportSummary),
      budgetSupportSummary: safeString(deepResult?.budgetSupportSummary),
      deepAnalysisConclusion:
        safeString(deepResult?.deepAnalysisConclusion) || "当前已完成部分检索，但深查结论仍待续跑补齐。",
      evidenceStrengthScore: safeNumber(deepResult?.evidenceStrengthScore),
      deepAnalysisScore: safeNumber(deepResult?.deepAnalysisScore),
      suggestedAction: safeString(deepResult?.suggestedAction) || "待续跑补齐建议动作",
    },
    analysisSupplement: {
      aiValueSummary: safeString((analysisResult?.analysisSupplement as JsonRecord | undefined)?.aiValueSummary)
        || safeString(analysisResult?.aiValueSummary),
      aiRisks: collectStringArray(
        isRecord(analysisResult?.analysisSupplement) ? analysisResult.analysisSupplement : (analysisResult || {}),
        "aiRisks"
      ),
    },
    finalRecommendation:
      safeString(deepResult?.suggestedAction) ||
      safeString(analysisResult?.suggestedAction) ||
      safeString(lead.followUpAction) ||
      "待续跑补齐最终建议",
    recoveryStatus: deepResult ? "completed" : "partial",
  };
}

function buildPendingLead(lead: JsonRecord): JsonRecord {
  return {
    leadId: safeString(lead.leadId),
    title: safeString(lead.title),
    url: safeString(lead.url),
    reason: "上次深查在完成该线索前中断，待下次续跑。",
  };
}

function buildRankedRecommendations(investigatedLeads: JsonRecord[]): JsonRecord[] {
  return [...investigatedLeads]
    .sort(
      (left, right) =>
        safeNumber((right.deepAnalysis as JsonRecord | undefined)?.deepAnalysisScore)
        - safeNumber((left.deepAnalysis as JsonRecord | undefined)?.deepAnalysisScore)
    )
    .map((lead, index) => ({
      rank: index + 1,
      leadId: safeString(lead.leadId),
      title: safeString(lead.title),
      finalRecommendation: safeString(lead.finalRecommendation),
      deepAnalysisScore: safeNumber((lead.deepAnalysis as JsonRecord | undefined)?.deepAnalysisScore),
    }));
}

function collectRecentSearchQueries(toolTrace: ToolExecutionTraceEntry[]): string[] {
  return toolTrace
    .filter((entry) => entry.name === "search_web")
    .map((entry) => safeString(entry.input.query))
    .filter(Boolean)
    .slice(-6);
}

export function buildInvestigationRecoveryResult(input: InvestigationRecoveryBuildInput): JsonRecord | null {
  const snapshot = buildInputSnapshot(input.inputFile);
  const parsedInput = parseInvestigationInput(snapshot.rawText);
  const selectedLeads = collectRecordArray(parsedInput, "selectedLeads");
  if (selectedLeads.length === 0 && input.toolTrace.length === 0 && !(input.assistantText || "").trim()) {
    return null;
  }

  const leadLookup = buildSelectedLeadLookup(selectedLeads);
  const deepByLeadKey = new Map<string, JsonRecord>();
  const analysisByLeadKey = new Map<string, JsonRecord>();

  for (const traceEntry of input.toolTrace) {
    if (traceEntry.name !== "deep_investigate" && traceEntry.name !== "analyze_opportunity") continue;
    const parsedResult = parseJsonRecord(traceEntry.result);
    const candidateKeys = getTraceLeadCandidateKeys(traceEntry.input, parsedResult);
    const matched = findMatchedLead(leadLookup, candidateKeys);
    if (!matched || !parsedResult) continue;

    if (traceEntry.name === "deep_investigate") {
      deepByLeadKey.set(matched.key, parsedResult);
      continue;
    }
    analysisByLeadKey.set(matched.key, parsedResult);
  }

  const investigatedLeads: JsonRecord[] = [];
  const pendingLeads: JsonRecord[] = [];

  for (const lead of selectedLeads) {
    const leadKey = getSelectedLeadKey(lead);
    const deepResult = deepByLeadKey.get(leadKey) || null;
    const analysisResult = analysisByLeadKey.get(leadKey) || null;
    if (deepResult || analysisResult) {
      investigatedLeads.push(buildRecoveryLead(lead, deepResult, analysisResult));
      continue;
    }
    pendingLeads.push(buildPendingLead(lead));
  }

  const recentQueries = collectRecentSearchQueries(input.toolTrace);
  const result: JsonRecord = {
    taskType: "investigation",
    sourceScreeningTaskId: safeString(parsedInput.sourceScreeningTaskId),
    summary: {
      selectedLeadCount: selectedLeads.length,
      investigatedLeadCount: investigatedLeads.length,
      pendingLeadCount: pendingLeads.length,
      highPriorityCount: investigatedLeads.filter((lead) => safeString(lead.finalRecommendation).includes("重点")).length,
      executionStats: {
        searchQueryCount: 0,
        searchResultCount: 0,
        uniqueSearchResultCount: 0,
        deepInvestigateCount: 0,
        analyzeOpportunityCount: 0,
      },
    },
    investigatedLeads,
    pendingLeads,
    rankedRecommendations: buildRankedRecommendations(investigatedLeads),
    resumeInfo: {
      resumable: true,
      resumeStatus: "pending",
      interruptedReason: input.errorMessage || "深查过程中发生上游异常，已保存当前检查点。",
      completedLeadIds: investigatedLeads.map((lead) => safeString(lead.leadId)).filter(Boolean),
      pendingLeadIds: pendingLeads.map((lead) => safeString(lead.leadId)).filter(Boolean),
    },
    notes: [
      `深查任务因异常中断，已自动保存检查点。原因: ${input.errorMessage || "未知异常"}`,
      recentQueries.length > 0 ? `中断前最近搜索词: ${recentQueries.join(" | ")}` : "中断前尚未形成可复用的搜索查询记录。",
      investigatedLeads.length > 0
        ? `已完成 ${investigatedLeads.length} 条线索的部分深查结果，后续续跑时应优先复用。`
        : "当前尚未形成完整深查结论，后续续跑时请从待处理线索继续。",
    ],
  };

  const normalized = attachExecutionStatsToParsedResult("investigation", result, input.toolTrace);
  return isRecord(normalized) ? normalized : result;
}

export function loadLatestInvestigationRecovery(input: TaskResumeIdentityInput): InvestigationRecoveryCheckpoint | null {
  if (input.taskType !== "investigation") return null;

  const resumeKey = buildTaskResumeKey(input);
  const runsDir = join(process.cwd(), "data", "investigation-runs");
  if (!existsSync(runsDir)) return null;

  const candidateFiles = readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(runsDir, name))
    .sort((left, right) => {
      const leftTime = existsSync(left) ? statSync(left).mtimeMs : 0;
      const rightTime = existsSync(right) ? statSync(right).mtimeMs : 0;
      return rightTime - leftTime;
    });

  for (const filePath of candidateFiles) {
    try {
      const payload = JSON.parse(readFileSync(filePath, "utf-8")) as InvestigationRunPayload;
      const taskMeta = isRecord(payload.taskMeta) ? payload.taskMeta : {};
      if (safeString(taskMeta.resumeKey) !== resumeKey) continue;

      const taskState = safeString(taskMeta.taskState);
      if (taskState === "completed") return null;
      if (taskState !== "partial" || taskMeta.resumable !== true || !isRecord(payload.result)) return null;

      return {
        filePath,
        savedAt: safeString(payload.savedAt),
        failureReason: safeString(taskMeta.failureReason) || "上次深查异常中断",
        result: payload.result,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export function buildInvestigationResumePrompt(checkpoint: InvestigationRecoveryCheckpoint): string {
  const result = checkpoint.result;
  const investigatedLeads = collectRecordArray(result, "investigatedLeads");
  const pendingLeads = collectRecordArray(result, "pendingLeads");
  const summary = isRecord(result.summary) ? result.summary : {};

  const compactInvestigated = investigatedLeads.map((lead) => ({
    leadId: safeString(lead.leadId),
    title: safeString(lead.title),
    finalRecommendation: safeString(lead.finalRecommendation),
    deepAnalysis: isRecord(lead.deepAnalysis) ? lead.deepAnalysis : {},
    analysisSupplement: isRecord(lead.analysisSupplement) ? lead.analysisSupplement : {},
  }));

  return [
    "检测到上一轮深查因上游异常中断，请基于已保存检查点继续执行，不要从零开始推翻已有结果。",
    `上次检查点时间: ${checkpoint.savedAt || "未知"}`,
    `上次中断原因: ${checkpoint.failureReason}`,
    `已完成深查结果: ${investigatedLeads.length} / ${Number(summary.selectedLeadCount) || investigatedLeads.length + pendingLeads.length}`,
    `待续跑线索数: ${pendingLeads.length}`,
    "",
    "续跑要求:",
    "1. 已完成的 investigatedLeads 视为可复用结果，除非发现明显矛盾证据，否则不要重做和推翻。",
    "2. 优先补 pendingLeads，对缺失的 deepAnalysis、analysisSupplement 和 rankedRecommendations 继续补齐。",
    "3. 最终仍然必须输出完整 JSON，包含已完成 investigatedLeads 与本轮新增结果。",
    "4. 如果上次某条线索只完成了一部分证据，请在原有基础上补足，不要丢字段。",
    "",
    "已保存的 investigatedLeads 摘要:",
    "```json",
    JSON.stringify(compactInvestigated, null, 2),
    "```",
    "",
    "待续跑线索摘要:",
    "```json",
    JSON.stringify(pendingLeads, null, 2),
    "```",
  ].join("\n");
}
