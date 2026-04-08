type JsonRecord = Record<string, unknown>;

type ScreeningBucketKey =
  | "currentOpportunities"
  | "historicalCases"
  | "policySignals"
  | "outOfWindowLeads";

type TimeWindowState = boolean | null;
type TimeWindowStatus = "in_window" | "out_of_window" | "unknown";

const SCREENING_BUCKET_KEYS: ScreeningBucketKey[] = [
  "currentOpportunities",
  "historicalCases",
  "policySignals",
  "outOfWindowLeads",
];

const POSITIVE_FOLLOW_UP_PATTERNS = [
  "立即跟进",
  "优先跟进",
  "进入候选机会池",
  "进入机会池",
  "建议当前跟进",
];

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

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildTimeWindow(result: JsonRecord): { start: string; end: string } | null {
  const timeWindow = result.timeWindow;
  if (!isRecord(timeWindow)) return null;

  const start = normalizeDateKey(timeWindow.start);
  const end = normalizeDateKey(timeWindow.end);
  if (!start || !end) return null;
  return { start, end };
}

function computeWithinTimeWindow(item: JsonRecord, timeWindow: { start: string; end: string } | null): TimeWindowState {
  if (!timeWindow) return typeof item.withinTimeWindow === "boolean" ? item.withinTimeWindow : null;
  const publishDateKey = normalizeDateKey(item.publishTime);
  if (!publishDateKey) return null;
  return publishDateKey >= timeWindow.start && publishDateKey <= timeWindow.end;
}

function computeTimeWindowStatus(withinTimeWindow: TimeWindowState): TimeWindowStatus {
  if (withinTimeWindow === true) return "in_window";
  if (withinTimeWindow === false) return "out_of_window";
  return "unknown";
}

function resolveBucket(item: JsonRecord, originBucket: ScreeningBucketKey, withinTimeWindow: TimeWindowState): ScreeningBucketKey {
  const leadCategory = typeof item.leadCategory === "string" ? item.leadCategory : "";

  if (withinTimeWindow === false) return "outOfWindowLeads";

  if (withinTimeWindow === null) {
    if (leadCategory === "current_opportunity") return "currentOpportunities";
    if (originBucket === "currentOpportunities") return "currentOpportunities";
    if (leadCategory === "historical_case") return "historicalCases";
    if (leadCategory === "policy_signal") return "policySignals";
    return originBucket;
  }

  if (leadCategory === "historical_case") return "historicalCases";
  if (leadCategory === "policy_signal") return "policySignals";
  if (leadCategory === "current_opportunity") return "currentOpportunities";
  return originBucket === "outOfWindowLeads" ? "currentOpportunities" : originBucket;
}

function isPositiveFollowUp(item: JsonRecord): boolean {
  if (item.isActionableNow === false) return false;

  const directFlag = item["是否推荐跟进"];
  if (directFlag === "是" || directFlag === true) return true;

  const followUpAction = typeof item.followUpAction === "string" ? item.followUpAction : "";
  if (POSITIVE_FOLLOW_UP_PATTERNS.some((pattern) => followUpAction.includes(pattern))) return true;

  const suggestedAction = typeof item.suggestedAction === "string" ? item.suggestedAction : "";
  return POSITIVE_FOLLOW_UP_PATTERNS.some((pattern) => suggestedAction.includes(pattern));
}

function buildScreeningSummary(
  buckets: Record<ScreeningBucketKey, JsonRecord[]>,
  existingSummary: unknown
): JsonRecord {
  const summary = isRecord(existingSummary) ? { ...existingSummary } : {};
  const currentOpportunities = buckets.currentOpportunities;

  summary.currentOpportunityCount = currentOpportunities.length;
  summary.historicalCaseCount = buckets.historicalCases.length;
  summary.policySignalCount = buckets.policySignals.length;
  summary.outOfWindowCount = buckets.outOfWindowLeads.length;
  summary.poolEntryCount = currentOpportunities.filter((item) => item.shouldEnterPool === true).length;
  summary.recommendedFollowUpCount = currentOpportunities.filter(isPositiveFollowUp).length;

  return summary;
}

function normalizeScreeningResult(parsedResult: JsonRecord): JsonRecord {
  const timeWindow = buildTimeWindow(parsedResult);
  const normalizedBuckets: Record<ScreeningBucketKey, JsonRecord[]> = {
    currentOpportunities: [],
    historicalCases: [],
    policySignals: [],
    outOfWindowLeads: [],
  };

  let correctedEntryCount = 0;

  for (const bucketKey of SCREENING_BUCKET_KEYS) {
    const items = collectRecordArray(parsedResult, bucketKey);
    for (const item of items) {
      const normalizedItem: JsonRecord = { ...item };
      const normalizedWithinTimeWindow = computeWithinTimeWindow(normalizedItem, timeWindow);
      if (normalizedItem.withinTimeWindow !== normalizedWithinTimeWindow) {
        correctedEntryCount += 1;
      }
      normalizedItem.withinTimeWindow = normalizedWithinTimeWindow;
      normalizedItem.timeWindowStatus = computeTimeWindowStatus(normalizedWithinTimeWindow);
      const targetBucket = resolveBucket(normalizedItem, bucketKey, normalizedWithinTimeWindow);
      normalizedBuckets[targetBucket].push(normalizedItem);
    }
  }

  const notes = collectStringArray(parsedResult, "notes");
  if (
    correctedEntryCount > 0 &&
    !notes.some((note) => note.includes("系统已按时间窗自动纠正 withinTimeWindow 和结果分桶"))
  ) {
    notes.push("系统已按时间窗自动纠正 withinTimeWindow 和结果分桶，避免发布时间与窗口判断冲突。");
  }

  return {
    ...parsedResult,
    summary: buildScreeningSummary(normalizedBuckets, parsedResult.summary),
    currentOpportunities: normalizedBuckets.currentOpportunities,
    historicalCases: normalizedBuckets.historicalCases,
    policySignals: normalizedBuckets.policySignals,
    outOfWindowLeads: normalizedBuckets.outOfWindowLeads,
    notes,
  };
}

export function normalizeParsedTaskResult(taskType: string, parsedResult: unknown): unknown {
  if (taskType !== "screening" || !isRecord(parsedResult)) return parsedResult;
  return normalizeScreeningResult(parsedResult);
}
