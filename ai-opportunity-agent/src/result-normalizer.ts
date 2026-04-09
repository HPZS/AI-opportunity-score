import { loadRuntimeOverrides } from "./self-healing.js";

type JsonRecord = Record<string, unknown>;

type ScreeningBucketKey =
  | "currentOpportunities"
  | "historicalCases"
  | "policySignals"
  | "outOfWindowLeads";

type TimeWindowState = boolean | null;
type TimeWindowStatus = "in_window" | "out_of_window" | "unknown";
type SystemGuardFlag =
  | "weak_time_demoted"
  | "placeholder_title_demoted"
  | "listing_page_demoted"
  | "budget_document_demoted"
  | "url_date_conflict_demoted"
  | "planning_stage_demoted"
  | "unverified_pdf_publish_time_demoted";

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
const BUDGET_DOCUMENT_PATTERNS = [
  /预算公开/u,
  /单位预算公开/u,
  /部门预算公开/u,
  /部门预算/u,
  /单位预算/u,
  /政府采购支出表/u,
  /项目支出绩效目标表/u,
  /预算绩效目标/u,
];
const FORMAL_ADVANCE_PATTERNS = [
  /采购意向/u,
  /需求征集/u,
  /招标公告/u,
  /采购公告/u,
  /竞争性磋商/u,
  /公开招标/u,
  /比选公告/u,
  /单一来源/u,
  /立项批复/u,
  /可研批复/u,
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeCandidateDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const directDate = new Date(trimmed);
  if (!Number.isNaN(directDate.getTime())) return directDate.toISOString();

  const normalized = trimmed
    .replace(/年|\/|\./g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .trim();
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractDateFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();

  const slashMatch = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/u);
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    return normalizeCandidateDate(`${year}-${month}-${day}`);
  }

  const compactMatch = url.match(/(20\d{2})[-_](\d{1,2})[-_](\d{1,2})/u);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return normalizeCandidateDate(`${year}-${month}-${day}`);
  }

  return null;
}

function getAgeDays(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function isPlaceholderTitle(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const title = value.trim();
  if (!title) return true;
  return (
    /^项目编号[:：]?/u.test(title) ||
    /^[一二三四五六七八九十]+[、，.．]/u.test(title) ||
    /^(采购需求|招标文件|附件)$/u.test(title) ||
    /^(公开招标公告|邀请招标公告|竞争性磋商公告|询价公告|终止公告|更正公告|中标公告|成交公告)_中国政府采购网$/u.test(title)
  );
}

function isListingLikePage(item: JsonRecord): boolean {
  const title = typeof item.title === "string" ? normalizeWhitespace(item.title) : "";
  const url = typeof item.url === "string" ? item.url.toLowerCase() : "";
  const normalizedUrl = typeof item.normalizedUrl === "string" ? item.normalizedUrl.toLowerCase() : "";
  const context = buildGuardContext(item);

  if (
    /^(公开招标公告|邀请招标公告|竞争性磋商公告|询价公告|终止公告|更正公告|中标公告|成交公告)_中国政府采购网$/u.test(title)
  ) {
    return true;
  }

  if (
    /\/index(?:_\d+)?\.htm$/u.test(url) ||
    /\/index(?:_\d+)?\.htm$/u.test(normalizedUrl) ||
    /\/cggg\/[^?#]+\/$/u.test(url) ||
    /\/cggg\/[^?#]+\/$/u.test(normalizedUrl)
  ) {
    return true;
  }

  if (context.includes("中国政府采购网") && context.includes("栏目聚合页")) {
    return true;
  }

  return false;
}

function buildGuardContext(item: JsonRecord): string {
  const parts: string[] = [];
  if (typeof item.title === "string") parts.push(item.title);
  if (typeof item.normalizedTitle === "string") parts.push(item.normalizedTitle);
  if (typeof item.categoryReason === "string") parts.push(item.categoryReason);
  if (typeof item.sourceName === "string") parts.push(item.sourceName);
  parts.push(...collectStringArray(item, "budgetSignals"));

  const evidence = item.evidence;
  if (isRecord(evidence)) {
    if (typeof evidence.summary === "string") parts.push(evidence.summary);
    parts.push(...collectStringArray(evidence, "keyEvidence"));
    parts.push(...collectStringArray(evidence, "evidenceList"));
  }

  parts.push(...collectStringArray(item, "evidenceSummary"));
  parts.push(...collectStringArray(item, "notes"));
  return parts.join(" ");
}

function collectGuardFlags(
  item: JsonRecord,
  timeWindow: { start: string; end: string } | null,
  runtimeOverrides: ReturnType<typeof loadRuntimeOverrides>
): SystemGuardFlag[] {
  const flags: SystemGuardFlag[] = [];
  const publishTime = typeof item.publishTime === "string" ? item.publishTime : null;
  const publishTimeRaw = normalizeCandidateDate(item.publishTimeRaw);
  const publishTimeSource = typeof item.publishTimeSource === "string" ? item.publishTimeSource : "";
  const weakAgeDays = publishTime ? null : getAgeDays(publishTimeRaw);
  const urlDate = extractDateFromUrl(item.url) || extractDateFromUrl(item.normalizedUrl);
  const urlDateKey = normalizeDateKey(urlDate);
  const context = buildGuardContext(item);
  const isBudgetDocument = BUDGET_DOCUMENT_PATTERNS.some((pattern) => pattern.test(context));
  const hasFormalAdvanceSignal = FORMAL_ADVANCE_PATTERNS.some((pattern) => pattern.test(context));

  if (item.leadCategory === "current_opportunity" && publishTime === null && weakAgeDays !== null && weakAgeDays > 45) {
    flags.push("weak_time_demoted");
  }

  if (item.leadCategory === "current_opportunity" && isPlaceholderTitle(item.title)) {
    flags.push("placeholder_title_demoted");
  }

  if (item.leadCategory === "current_opportunity" && isListingLikePage(item)) {
    flags.push("listing_page_demoted");
  }

  if (
    item.leadCategory === "current_opportunity" &&
    item.shouldEnterPool === true &&
    isBudgetDocument &&
    !hasFormalAdvanceSignal
  ) {
    flags.push("budget_document_demoted");
  }

  if (
    runtimeOverrides.poolGuards.disallowPlanningStageActionableByDefault &&
    item.leadCategory === "current_opportunity" &&
    item.opportunityStage === "规划信号" &&
    item.isActionableNow === true &&
    !hasFormalAdvanceSignal
  ) {
    flags.push("planning_stage_demoted");
  }

  if (
    runtimeOverrides.poolGuards.requireAuthorityPublishTimeForPoolEntry &&
    item.leadCategory === "current_opportunity" &&
    item.shouldEnterPool === true &&
    publishTimeSource === "pdf_body_unverified"
  ) {
    flags.push("unverified_pdf_publish_time_demoted");
  }

  if (
    runtimeOverrides.bucketGuards.fallbackToOutOfWindowWhenUrlDateConflicts &&
    item.leadCategory === "current_opportunity" &&
    urlDateKey &&
    timeWindow &&
    (urlDateKey < timeWindow.start || urlDateKey > timeWindow.end) &&
    publishTimeSource !== "explicit"
  ) {
    flags.push("url_date_conflict_demoted");
  }

  return flags;
}

function applyScreeningGuards(
  item: JsonRecord,
  timeWindow: { start: string; end: string } | null,
  runtimeOverrides: ReturnType<typeof loadRuntimeOverrides>
): JsonRecord {
  const nextItem: JsonRecord = { ...item };
  const flags = collectGuardFlags(nextItem, timeWindow, runtimeOverrides);
  if (flags.length === 0) return nextItem;

  const existingNotes = collectStringArray(nextItem, "notes");

  if (flags.includes("weak_time_demoted")) {
    nextItem.leadCategory = "historical_case";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议暂不跟进";
    nextItem.categoryReason = "该线索缺少权威发布时间，且正文候选日期明显早于当前时间窗，暂按历史/待核验参考处理。";
    existingNotes.push("系统兜底降级：正文候选日期明显早于当前时间窗，已取消入池并转为历史/待核验参考。");
  }

  if (flags.includes("placeholder_title_demoted")) {
    nextItem.shouldEnterPool = false;
    if (nextItem.isActionableNow !== false) {
      nextItem.followUpAction = "建议补充正式项目名称后再判断";
    }
    existingNotes.push("系统兜底拦截：标题疑似章节名或项目编号占位，待补权威项目名称后再决定是否入池。");
  }

  if (flags.includes("listing_page_demoted")) {
    nextItem.shouldEnterPool = false;
    nextItem.isActionableNow = false;
    nextItem.leadCategory = "policy_signal";
    nextItem.followUpAction = "建议下钻具体公告详情页后再判断";
    nextItem.categoryReason = "系统兜底拦截：当前链接疑似栏目聚合页或列表页，不是具体项目公告详情页，暂不作为当前可入池商机。";
    existingNotes.push("系统兜底拦截：栏目聚合页/列表页不得直接入池，需先下钻到具体项目公告详情页。");
  }

  if (flags.includes("budget_document_demoted")) {
    nextItem.leadCategory = "policy_signal";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议持续观察预算与后续采购节点";
    nextItem.categoryReason = "该线索属于预算公开/预算支出类文件，虽有建设方向，但尚缺少独立采购、需求征集或立项批复信号，暂按政策/规划观察线索处理。";
    existingNotes.push("系统兜底降级：预算公开/预算支出类文件缺少独立采购或立项推进信号，已取消入池并转为政策/规划观察线索。");
  }

  if (flags.includes("planning_stage_demoted")) {
    nextItem.leadCategory = "policy_signal";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议持续观察后续采购、立项或招标节点";
    nextItem.categoryReason = "系统自修复降级：该线索仅体现为规划信号，当前缺少明确采购、立项、需求征集或招标执行证据。";
    existingNotes.push("系统自修复降级：规划信号缺少执行证据，已取消当前跟进与入池资格。");
  }

  if (flags.includes("unverified_pdf_publish_time_demoted")) {
    nextItem.leadCategory = "policy_signal";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议先补抓权威公告页发布时间后再判断";
    nextItem.categoryReason = "系统自修复降级：该 PDF 仅有正文候选日期，缺少权威公告页发布时间，暂不作为当前机会推进。";
    existingNotes.push("系统自修复降级：PDF 仅有正文候选日期，未取得权威公告页发布时间，已取消入池。");
  }

  if (flags.includes("url_date_conflict_demoted")) {
    nextItem.leadCategory = "historical_case";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议转入窗口外/历史参考，除非补到近窗公告页";
    nextItem.categoryReason = "系统自修复降级：链接路径日期与任务时间窗明显冲突，且缺少权威公告页发布时间，暂按历史或窗口外线索处理。";
    nextItem.withinTimeWindow = false;
    existingNotes.push("系统自修复降级：URL 路径日期明显早于时间窗，且缺少权威公告页发布时间，已回退为窗口外/历史线索。");
  }

  nextItem.notes = existingNotes;
  nextItem.systemGuardFlags = flags;
  return nextItem;
}

function applyFinalConsistencyCheck(
  item: JsonRecord,
  withinTimeWindow: TimeWindowState,
  runtimeOverrides: ReturnType<typeof loadRuntimeOverrides>
): JsonRecord {
  if (!runtimeOverrides.bucketGuards.runFinalBucketConsistencyCheck) return item;

  const nextItem: JsonRecord = { ...item };
  const notes = collectStringArray(nextItem, "notes");
  let changed = false;

  if (nextItem.shouldEnterPool === true && withinTimeWindow !== true) {
    nextItem.shouldEnterPool = false;
    nextItem.isActionableNow = false;
    if (withinTimeWindow === false) nextItem.leadCategory = "historical_case";
    nextItem.followUpAction = withinTimeWindow === false ? "建议暂不跟进" : "建议先补齐发布时间后再判断";
    notes.push("系统终检回退：入池资格与时间窗状态不一致，已取消入池。");
    changed = true;
  }

  if (nextItem.opportunityStage === "规划信号" && nextItem.isActionableNow === true) {
    nextItem.leadCategory = "policy_signal";
    nextItem.isActionableNow = false;
    nextItem.shouldEnterPool = false;
    nextItem.followUpAction = "建议持续观察后续执行节点";
    notes.push("系统终检回退：规划信号不得直接按当前可行动机会输出。");
    changed = true;
  }

  if (!changed) return nextItem;
  nextItem.notes = notes;
  return nextItem;
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
    if (leadCategory === "historical_case") return "historicalCases";
    if (leadCategory === "policy_signal") return "policySignals";
    if (originBucket === "currentOpportunities") return "currentOpportunities";
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
  const runtimeOverrides = loadRuntimeOverrides();
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
      const guardedItem = applyScreeningGuards(item, timeWindow, runtimeOverrides);
      const normalizedWithinTimeWindow = computeWithinTimeWindow(guardedItem, timeWindow);
      const normalizedItem = applyFinalConsistencyCheck(guardedItem, normalizedWithinTimeWindow, runtimeOverrides);
      if (guardedItem.withinTimeWindow !== normalizedWithinTimeWindow) {
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
  if (!notes.some((note) => note.includes("系统已对旧PDF候选日期、占位标题、栏目聚合页和预算公开类弱信号执行入池兜底校正"))) {
    notes.push("系统已对旧PDF候选日期、占位标题、栏目聚合页和预算公开类弱信号执行入池兜底校正，避免明显过期、命名不完整、列表页或仅预算规划型线索误入池。");
  }
  if (
    runtimeOverrides.activationReasons.length > 0 &&
    !notes.some((note) => note.includes("系统已加载自我升级沉淀的运行时规则"))
  ) {
    notes.push(`系统已加载自我升级沉淀的运行时规则：${runtimeOverrides.activationReasons.join("；")}`);
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
