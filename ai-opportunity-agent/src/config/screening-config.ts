// 初筛任务兼容的任务别名。
// `collect_and_screen` 是历史命名，后续统一收口到 `screening`。
export const SCREENING_TASK_ALIASES = [
  "screening",
  "collect_and_screen",
] as const;

// 初筛任务的核心执行配置。
// 用户层只配置“目标入池数量”。
export interface ScreeningTaskConfig {
  // 目标入池数量。
  // 只有 shouldEnterPool=true 的线索才计入这个数量。
  targetPoolEntryCount: number;
}

// 初筛默认配置。
// 当前用户只需要关心要入池多少条。
export const SCREENING_DEFAULT_CONFIG: ScreeningTaskConfig = {
  targetPoolEntryCount: 2,
};

function getCandidateOutputLimit(config: ScreeningTaskConfig): number {
  return Math.max(1, config.targetPoolEntryCount);
}

function getMaxSearchRoundsPerAttempt(config: ScreeningTaskConfig): number {
  return Math.max(6, Math.min(20, config.targetPoolEntryCount));
}

function getMaxResultsPerQuery(config: ScreeningTaskConfig): number {
  return Math.max(10, Math.min(20, config.targetPoolEntryCount));
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
    "poolEntryCount": 0
  },
  "currentOpportunities": [],
  "historicalCases": [],
  "policySignals": [],
  "outOfWindowLeads": [],
  "notes": []
}`;

// 生成给模型看的“初筛任务规则说明”。
// 这里不是程序逻辑本身，而是约束模型如何执行、何时算成功。
export function buildScreeningTaskOutputRequirements(
  config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG,
): string {
  const candidateOutputLimit = getCandidateOutputLimit(config);
  const maxSearchRoundsPerAttempt = getMaxSearchRoundsPerAttempt(config);
  const maxResultsPerQuery = getMaxResultsPerQuery(config);

  return (
    "输出要求:\n" +
    "1. 本任务是初筛任务，目标是形成候选池，不要直接把结论写成最终成交判断。\n" +
    `2. 本轮目标是成功进入候选池的机会数量达到 ${config.targetPoolEntryCount} 条。这里的“成功进入候选池”是指 shouldEnterPool=true，且应计入 summary.poolEntryCount。\n` +
    `3. 本轮 currentOpportunities 主列表最多输出 ${candidateOutputLimit} 条，优先展示成功进入候选池的有效机会。\n` +
    `4. 单次完整尝试内，搜索应尽量分轮进行，建议最多 ${maxSearchRoundsPerAttempt} 轮，每轮单次 search_web 的 max_results 建议不超过 ${maxResultsPerQuery}。\n` +
    "5. 每次调用 search_web 时，都应显式传入与本任务一致的 time_window_days，避免后续补搜时偏离时间窗。\n" +
    "6. 搜索必须按来源类型拆轮，不要每一轮都混用 government_portals、procurement_portals、trading_platforms。应优先分别执行：\n" +
    "   - 招采轮：source_profile_ids 仅使用 procurement_portals + trading_platforms，query 聚焦 12345政务服务便民热线 / 运营服务 / 运维服务 / 采购公告 / 招标公告 / 采购需求。\n" +
    "   - 政府官网轮：source_profile_ids 仅使用 government_portals，query 聚焦 12345热线 / 服务项目 / 采购意向 / 建设方案 / 数据分析服务 / 升级改造。\n" +
    "   - 只有拆轮召回明显不足时，才允许混合源补搜。\n" +
    `7. 如果 summary.poolEntryCount 小于 ${config.targetPoolEntryCount}，本次任务应视为未达成目标，必须在 notes 中明确写出“未达到候选池目标数量”。\n` +
    "8. 如果当前入池数量还未达到目标，不要主动结束，应继续补搜，直到达到目标数量或收到用户手动终止。\n" +
    "9. 最终请输出结构化 JSON。\n" +
    "10. 凡涉及 shouldEnterPool、totalScore、aiFitScore、maturityScore、publishTime、是否推荐跟进，必须严格以工具输出为准，不得自行改写。\n" +
    "11. 如果工具结果显示线索不在时间窗内，最终结果必须明确标记。\n" +
    "12. 如果抓取对象是 PDF 且无法解析正文，必须明确标注“待补抓 PDF 正文”，不要把乱码当正文分析。\n" +
    "13. 如果抓取对象是 PDF 且只有正文内日期、没有权威公告页发布时间，不要把正文日期直接当作最终发布时间；应允许保留为时间待核验状态。\n" +
    "14. 最终结果必须分层输出 currentOpportunities、historicalCases、policySignals、outOfWindowLeads，不要把不同语义的线索混在一个数组里。\n" +
    "15. historicalCases 和 policySignals 不能写进当前商机主列表。\n" +
    "16. 如果 isActionableNow=false，则结论里不能写成建议当前跟进。\n" +
    "17. 来自政府官网或政策来源的线索，如果正文已出现明确采购、立项、建设方案、升级改造等执行信号，可以保留为 currentOpportunities，不要一律降为 policySignals。\n" +
    "18. 每条线索尽量保留 leadCategory、opportunityStage、isActionableNow、scoreBreakdown、categoryReason。\n" +
    "19. 如果 publishTime 为空，但 PDF 正文候选日期明显早于当前时间窗，该线索可以保留为待核验参考，但不得直接 shouldEnterPool=true。\n" +
    "20. 对同一条线索，优先先调用 extract_signal，再把 extract_signal 返回的 publishTime、publishTimeRaw、publishTimeConfidence、normalizedTitle 继续传给 screen_opportunity 和最终结果，不要丢字段。\n" +
    "21. 如果标题只是“项目编号”“一、服务项目背景”“采购需求”“招标文件”等占位标题，不得直接作为最终商机标题或直接入池，必须优先补正式项目名称。\n" +
    "22. 对“预算公开/部门预算/单位预算/政府采购支出表”类文件，如缺少独立采购公告、采购意向、需求征集或立项批复，不得 shouldEnterPool=true；可保留为待观察线索或 policySignals。\n" +
    "23. 输出结构优先参考以下模板：\n" +
    "```json\n" +
    SCREENING_RESULT_TEMPLATE +
    "\n```"
  );
}

// 生成运行时摘要，主要用于把关键执行参数直接写进任务消息，
// 避免模型不知道本轮的目标数量和停止标准。
export function buildScreeningExecutionSummary(
  config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG,
): string {
  const candidateOutputLimit = getCandidateOutputLimit(config);
  const maxSearchRoundsPerAttempt = getMaxSearchRoundsPerAttempt(config);
  const maxResultsPerQuery = getMaxResultsPerQuery(config);

  return [
    "初筛执行配置:",
    `- 目标入池数量: ${config.targetPoolEntryCount}`,
    `- 主列表输出上限: ${candidateOutputLimit}`,
    `- 单次完整尝试内最大搜索轮数: ${maxSearchRoundsPerAttempt}`,
    `- 单轮最大召回数建议: ${maxResultsPerQuery}`,
    "- 是否强制达标: 是",
    "- 停止条件: 入池数量达到目标，或用户手动终止",
  ].join("\n");
}

// 初筛相关的本地存储目录。
// runs: 每次初筛任务的完整原始结果
// artifact: 供后续深查复用的候选池快照
export const SCREENING_STORAGE_DIRS = {
  runs: "screening-runs",
  artifact: "screening-pool",
} as const;
