import type { ToolExecutionTraceEntry } from "./agent.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectRecordArray(container: JsonRecord, key: string): JsonRecord[] {
  const value = container[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function parseMaybeJson(text: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildLeadKey(input: {
  url?: unknown;
  normalizedUrl?: unknown;
  title?: unknown;
  normalizedTitle?: unknown;
  sourceDomain?: unknown;
}): string {
  const url = normalizeText(input.normalizedUrl) || normalizeText(input.url);
  if (url) return `url:${url.toLowerCase()}`;

  const title = normalizeText(input.normalizedTitle) || normalizeText(input.title);
  const sourceDomain = normalizeText(input.sourceDomain).toLowerCase();
  if (title) return `title:${title.toLowerCase()}|domain:${sourceDomain}`;

  return "";
}

function countUniqueKeys(items: string[]): number {
  return new Set(items.filter(Boolean)).size;
}

function extractSearchResultItems(entry: ToolExecutionTraceEntry): JsonRecord[] {
  const parsed = parseMaybeJson(entry.result);
  return parsed ? collectRecordArray(parsed, "results") : [];
}

function countSearchResults(entry: ToolExecutionTraceEntry): number {
  const parsed = parseMaybeJson(entry.result);
  if (!parsed) return 0;
  const resultCount = Number(parsed.resultCount);
  if (Number.isFinite(resultCount)) return resultCount;
  return collectRecordArray(parsed, "results").length;
}

function collectSearchCandidateKeys(trace: ToolExecutionTraceEntry[]): string[] {
  return trace
    .filter((entry) => entry.name === "search_web")
    .flatMap((entry) => extractSearchResultItems(entry))
    .map((item) =>
      buildLeadKey({
        url: item.url,
        normalizedUrl: item.normalizedUrl,
        title: item.title,
        normalizedTitle: item.normalizedTitle,
        sourceDomain: item.domain,
      })
    )
    .filter(Boolean);
}

function collectFetchPageKeys(trace: ToolExecutionTraceEntry[]): string[] {
  return trace
    .filter((entry) => entry.name === "fetch_page")
    .map((entry) => normalizeText(entry.input.url).toLowerCase())
    .filter(Boolean);
}

function collectExtractedLeadKeys(trace: ToolExecutionTraceEntry[]): string[] {
  return trace
    .filter((entry) => entry.name === "extract_signal")
    .map((entry) => {
      const parsed = parseMaybeJson(entry.result);
      return buildLeadKey({
        url: parsed?.url || entry.input.url,
        normalizedUrl: parsed?.normalizedUrl,
        title: parsed?.title || entry.input.title,
        normalizedTitle: parsed?.normalizedTitle,
        sourceDomain: parsed?.sourceDomain || entry.input.source_domain,
      });
    })
    .filter(Boolean);
}

function collectScreenedLeadOutputs(trace: ToolExecutionTraceEntry[]): Array<{ key: string; shouldEnterPool: boolean }> {
  return trace
    .filter((entry) => entry.name === "screen_opportunity")
    .map((entry) => {
      const parsed = parseMaybeJson(entry.result);
      return {
        key: buildLeadKey({
          url: parsed?.url || entry.input.url,
          normalizedUrl: parsed?.normalizedUrl,
          title: parsed?.title || entry.input.title,
          normalizedTitle: parsed?.normalizedTitle,
          sourceDomain: parsed?.sourceDomain || entry.input.source_domain,
        }),
        shouldEnterPool: parsed?.shouldEnterPool === true,
      };
    })
    .filter((item) => item.key);
}

function collectDeepInvestigatedKeys(trace: ToolExecutionTraceEntry[]): string[] {
  return trace
    .filter((entry) => entry.name === "deep_investigate")
    .map((entry) =>
      buildLeadKey({
        url: entry.input.lead_url,
        title: entry.input.lead_title,
        sourceDomain: entry.input.source_domain,
      })
    )
    .filter(Boolean);
}

function collectAnalyzedLeadKeys(trace: ToolExecutionTraceEntry[]): string[] {
  return trace
    .filter((entry) => entry.name === "analyze_opportunity")
    .map((entry) => {
      const parsed = parseMaybeJson(entry.result);
      return buildLeadKey({
        url: parsed?.url || entry.input.url,
        normalizedUrl: parsed?.normalizedUrl,
        title: parsed?.title || entry.input.title,
        normalizedTitle: parsed?.normalizedTitle,
        sourceDomain: parsed?.sourceDomain || entry.input.source_domain,
      });
    })
    .filter(Boolean);
}

export function buildTaskExecutionStats(
  taskType: string,
  parsedResult: unknown,
  trace: ToolExecutionTraceEntry[]
): JsonRecord {
  const summary = isRecord(parsedResult) && isRecord(parsedResult.summary) ? parsedResult.summary : {};
  const searchEntries = trace.filter((entry) => entry.name === "search_web");
  const fetchEntries = trace.filter((entry) => entry.name === "fetch_page");
  const extractEntries = trace.filter((entry) => entry.name === "extract_signal");
  const screenEntries = trace.filter((entry) => entry.name === "screen_opportunity");
  const deepEntries = trace.filter((entry) => entry.name === "deep_investigate");
  const analyzeEntries = trace.filter((entry) => entry.name === "analyze_opportunity");

  const screenedLeadOutputs = collectScreenedLeadOutputs(trace);
  const screenedLeadKeys = screenedLeadOutputs.map((item) => item.key);
  const acceptedLeadKeyCount = countUniqueKeys(
    screenedLeadOutputs.filter((item) => item.shouldEnterPool).map((item) => item.key)
  );

  const investigationLeads = isRecord(parsedResult) ? collectRecordArray(parsedResult, "investigatedLeads") : [];
  const rankedRecommendations = isRecord(parsedResult) ? collectRecordArray(parsedResult, "rankedRecommendations") : [];

  return {
    toolCallCount: trace.length,
    searchQueryCount: searchEntries.length,
    searchResultCount: searchEntries.reduce((sum, entry) => sum + countSearchResults(entry), 0),
    uniqueSearchResultCount: countUniqueKeys(collectSearchCandidateKeys(trace)),
    fetchPageCount: fetchEntries.length,
    uniqueFetchedPageCount: countUniqueKeys(collectFetchPageKeys(trace)),
    extractSignalCount: extractEntries.length,
    uniqueExtractedLeadCount: countUniqueKeys(collectExtractedLeadKeys(trace)),
    screenedLeadCount: countUniqueKeys(screenedLeadKeys),
    acceptedLeadCount:
      taskType === "screening"
        ? Number(summary.poolEntryCount) || acceptedLeadKeyCount
        : acceptedLeadKeyCount,
    rejectedLeadCount:
      taskType === "screening"
        ? Math.max(countUniqueKeys(screenedLeadKeys) - (Number(summary.poolEntryCount) || acceptedLeadKeyCount), 0)
        : Math.max(countUniqueKeys(screenedLeadKeys) - acceptedLeadKeyCount, 0),
    deepInvestigateCount: countUniqueKeys(collectDeepInvestigatedKeys(trace)),
    analyzeOpportunityCount: countUniqueKeys(collectAnalyzedLeadKeys(trace)),
    investigatedLeadCount:
      taskType === "investigation"
        ? Number(summary.investigatedLeadCount) || investigationLeads.length
        : 0,
    rankedRecommendationCount:
      taskType === "investigation"
        ? rankedRecommendations.length
        : 0,
  };
}

export function attachExecutionStatsToParsedResult(
  taskType: string,
  parsedResult: unknown,
  trace: ToolExecutionTraceEntry[]
): unknown {
  if (!isRecord(parsedResult)) return parsedResult;
  const summary = isRecord(parsedResult.summary) ? { ...parsedResult.summary } : {};
  summary.executionStats = buildTaskExecutionStats(taskType, parsedResult, trace);
  return {
    ...parsedResult,
    summary,
  };
}

export function formatTaskExecutionStats(taskType: string, parsedResult: unknown): string[] {
  if (!isRecord(parsedResult) || !isRecord(parsedResult.summary) || !isRecord(parsedResult.summary.executionStats)) {
    return [];
  }

  const stats = parsedResult.summary.executionStats;
  const lines: string[] = [];

  if (taskType === "screening") {
    lines.push(
      `初筛运行统计：共发起 ${Number(stats.searchQueryCount) || 0} 次搜索，召回 ${Number(stats.searchResultCount) || 0} 条候选，去重后 ${Number(stats.uniqueSearchResultCount) || 0} 条。`
    );
    lines.push(
      `初筛判定统计：完成 ${Number(stats.screenedLeadCount) || 0} 条线索研判，成功入池 ${Number(stats.acceptedLeadCount) || 0} 条，拒绝 ${Number(stats.rejectedLeadCount) || 0} 条。`
    );
    lines.push(
      `抓取统计：抓取页面 ${Number(stats.fetchPageCount) || 0} 次，提取结构化信号 ${Number(stats.extractSignalCount) || 0} 次。`
    );
    return lines;
  }

  if (taskType === "investigation") {
    lines.push(
      `深查运行统计：共发起 ${Number(stats.searchQueryCount) || 0} 次搜索，召回 ${Number(stats.searchResultCount) || 0} 条候选，去重后 ${Number(stats.uniqueSearchResultCount) || 0} 条。`
    );
    lines.push(
      `深查处理统计：实际深查 ${Number(stats.deepInvestigateCount) || 0} 条线索，综合分析 ${Number(stats.analyzeOpportunityCount) || 0} 条，输出深查结果 ${Number(stats.investigatedLeadCount) || 0} 条。`
    );
    lines.push(`推荐输出统计：形成 ${Number(stats.rankedRecommendationCount) || 0} 条排序推荐。`);
    return lines;
  }

  lines.push(
    `任务运行统计：搜索 ${Number(stats.searchQueryCount) || 0} 次，召回 ${Number(stats.searchResultCount) || 0} 条候选，处理 ${Number(stats.screenedLeadCount) || 0} 条线索。`
  );
  return lines;
}
