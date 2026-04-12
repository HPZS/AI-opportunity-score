import {
  getScreeningExtraKeywords,
  getScreeningOpportunityTypeSelection,
  getScreeningSourceProfileSelection,
  getScreeningTopicExecutionPlans,
} from "./signal-config.js";

export const SCREENING_TASK_ALIASES = [
  "screening",
  "collect_and_screen",
] as const;

export interface ScreeningTaskConfig {
  targetPoolEntryCount: number;
}

export const SCREENING_DEFAULT_CONFIG: ScreeningTaskConfig = {
  targetPoolEntryCount: 2,
};

export function getScreeningMaxSupervisorAttempts(
  config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG,
): number {
  return Math.max(4, Math.min(10, config.targetPoolEntryCount + 3));
}

function getMaxSearchRoundsPerAttempt(config: ScreeningTaskConfig): number {
  return Math.max(6, Math.min(20, config.targetPoolEntryCount));
}

function getMaxResultsPerQuery(config: ScreeningTaskConfig): number {
  return Math.max(10, Math.min(20, config.targetPoolEntryCount));
}

function buildScreeningTopicExecutionPlanText(): string {
  const plans = getScreeningTopicExecutionPlans();
  if (plans.length === 0) {
    return "当前未配置可用主题，请先至少启用一个主题。";
  }

  if (plans.length === 1) {
    const [plan] = plans;
    return [
      "当前仅启用单主题搜索：",
      `1. ${plan.label} | subscription_id=${plan.subscriptionId} | 推荐来源=${plan.sourceLabels.join("、") || "无"} | 核心词=${plan.keywords.join("、") || "无"}`,
    ].join("\n");
  }

  return [
    "多主题轮询计划：",
    ...plans.map((plan, index) =>
      `${index + 1}. ${plan.label} | subscription_id=${plan.subscriptionId} | 推荐来源=${plan.sourceLabels.join("、") || "无"} | 核心词=${plan.keywords.join("、") || "无"}`,
    ),
  ].join("\n");
}

export const SCREENING_RESULT_TEMPLATE = `{
  "taskType": "screening",
  "topic": "主题",
  "timeWindow": {
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "days": 30
  },
  "summary": {
    "currentOpportunityCount": 0,
    "historicalCaseCount": 0,
    "policySignalCount": 0,
    "outOfWindowCount": 0,
    "recommendedFollowUpCount": 0,
    "priorityFollowUpCount": 0,
    "watchlistCount": 0,
    "signalTrackingCount": 0,
    "poolEntryCount": 0,
    "executionStats": {
      "searchQueryCount": 0,
      "searchResultCount": 0,
      "uniqueSearchResultCount": 0,
      "screenedLeadCount": 0,
      "acceptedLeadCount": 0,
      "rejectedLeadCount": 0
    }
  },
  "currentOpportunities": [],
  "historicalCases": [],
  "policySignals": [],
  "outOfWindowLeads": [],
  "notes": []
}`;

export function buildScreeningTaskOutputRequirements(
  config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG,
): string {
  const maxSearchRoundsPerAttempt = getMaxSearchRoundsPerAttempt(config);
  const maxResultsPerQuery = getMaxResultsPerQuery(config);
  const typeSelection = getScreeningOpportunityTypeSelection();
  const sourceSelection = getScreeningSourceProfileSelection();
  const extraKeywords = getScreeningExtraKeywords();
  const selectionModeText = typeSelection.mode === "single" ? "单主题搜索" : "多主题轮询";
  const topicExecutionPlanText = buildScreeningTopicExecutionPlanText();

  return [
    "输出要求:",
    "1. 本任务是初筛任务，目标是形成候选池，不要直接把结论写成最终成单判断。",
    `2. 本轮目标是让 shouldEnterPool=true 的线索数量达到 ${config.targetPoolEntryCount} 条，并把这个数量写入 summary.poolEntryCount。`,
    "3. 已确认可入池的线索全部保留，不要为了贴合目标数量而截断结果。",
    `4. 单次完整尝试内建议最多进行 ${maxSearchRoundsPerAttempt} 轮搜索；每次 search_web 的 max_results 建议不超过 ${maxResultsPerQuery}。`,
    "5. 每次调用 search_web 时都必须显式传入与当前任务一致的 time_window_days。",
    `6. 当前主题模式: ${selectionModeText}。已启用 subscription_id: ${typeSelection.subscriptionIds.join(", ")}。`,
    `7. 当前默认信号源: ${sourceSelection.sourceProfileIds.join(", ") || "无"}。默认补充关键词: ${extraKeywords.join("、") || "无"}。`,
    "8. 多主题模式下，必须逐主题轮询执行。一次 search_web 只允许服务当前主题，不得把多个主题的关键词混在同一条 query 中。",
    "9. 开启多个主题时，每个主题的查询逻辑必须与单主题模式一致；差别只在于调度器会按主题轮询多跑几遍。",
    "10. 如果当前正在处理某个 subscription_id，则 query、source_profile_ids、extra_keywords 都只能围绕这个主题，不得跨主题串词。",
    "11. 多主题轮询时，应先按主题依次完成第一轮，再决定哪些主题需要进入下一轮补搜；不要连续死盯单个主题。",
    "12. source_profile_ids 必须优先使用当前主题自己的推荐来源，不要把全局所有来源一次性混在一起。",
    "13. 招采来源和政府官网来源应拆开搜索。只有拆开搜索召回不足时，才允许做同主题的补充混搜。",
    "14. 最终必须输出完整的结构化 JSON，不要只输出增量说明。",
    "15. 最终结果必须分层输出 currentOpportunities、historicalCases、policySignals、outOfWindowLeads，不能混在一起。",
    "16. historicalCases 和 policySignals 不能写入当前机会主列表。",
    "17. 如果线索没有明确执行信号，只能降级为政策信号、观察线索或历史线索，不能强行入池。",
    "18. 如果工具结果显示线索不在时间窗内，最终结果必须明确标记。",
    "19. 如果抓取对象是 PDF 且无法解析正文，必须明确标注“待补抓 PDF 正文”，不要把乱码当正文分析。",
    "20. 如果 PDF 只有正文日期、没有权威公告页发布时间，不要直接把正文日期当最终发布时间。",
    "21. 对同一条线索，优先先调用 extract_signal，再把 extract_signal 返回的发布时间、标题规范化结果继续传给 screen_opportunity 和最终结果。",
    "22. 预算公开、部门预算、支出表这类文件，如果缺少独立采购公告、采购意向、需求征集或立项批复，不得 shouldEnterPool=true。",
    "23. 凡涉及 shouldEnterPool、scoreBreakdown、publishTime、recommendedFollowUp 等字段，必须以工具输出为准，不得自行改写。",
    "24. 如未达到目标数量，必须在 notes 中明确写出“未达到候选池目标数量”。",
    "25. 输出结构优先参考以下模板:",
    "```json",
    SCREENING_RESULT_TEMPLATE,
    "```",
    "",
    topicExecutionPlanText,
  ].join("\n");
}

export function buildScreeningExecutionSummary(
  config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG,
): string {
  const maxSearchRoundsPerAttempt = getMaxSearchRoundsPerAttempt(config);
  const maxResultsPerQuery = getMaxResultsPerQuery(config);
  const typeSelection = getScreeningOpportunityTypeSelection();
  const sourceSelection = getScreeningSourceProfileSelection();
  const extraKeywords = getScreeningExtraKeywords();
  const topicExecutionPlanText = buildScreeningTopicExecutionPlanText();

  return [
    "初筛执行配置:",
    `- 目标入池数量: ${config.targetPoolEntryCount}`,
    `- 机会类型模式: ${typeSelection.mode === "single" ? "单主题搜索" : "多主题轮询"}`,
    `- 已启用机会类型: ${typeSelection.labels.join("、")}`,
    `- 已启用 subscription_id: ${typeSelection.subscriptionIds.join(", ")}`,
    `- 默认信号源: ${sourceSelection.labels.join("、") || "未配置"}`,
    `- 默认 source_profile_ids: ${sourceSelection.sourceProfileIds.join(", ") || "无"}`,
    `- 默认补充关键词: ${extraKeywords.join("、") || "无"}`,
    `- 单次完整尝试内最大搜索轮数: ${maxSearchRoundsPerAttempt}`,
    `- 单轮最大召回数建议: ${maxResultsPerQuery}`,
    "- 多主题执行原则: 单主题查询逻辑保持不变，多主题只做轮询，不做混搜",
    topicExecutionPlanText,
  ].join("\n");
}

export const SCREENING_STORAGE_DIRS = {
  runs: "screening-runs",
  artifact: "screening-pool",
} as const;
