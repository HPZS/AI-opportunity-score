// 初筛任务兼容的任务别名。
// `collect_and_screen` 是历史命名，后续统一收口到 `screening`。
export const SCREENING_TASK_ALIASES = ["screening", "collect_and_screen"] as const;

// 初筛任务的核心执行配置。
// 这组配置决定“要筛出多少条真正入池的机会，以及允许系统为此搜索多少轮”。
export interface ScreeningTaskConfig {
  // 目标入池数量。
  // 只有 shouldEnterPool=true 的线索才计入这个数量。
  targetPoolEntryCount: number;

  // 初筛主结果里最多展示多少条 currentOpportunities。
  // 这个值控制展示输出，不等于全量召回数。
  candidateOutputLimit: number;

  // 最多允许模型发起多少轮搜索。
  // 调大可以提升召回率，但会增加 token 和耗时。
  maxSearchRounds: number;

  // 单轮 search_web 建议返回多少条。
  // 这是“每次搜多少”，不是“最终要多少”。
  maxResultsPerQuery: number;

  // 是否强制要求达到 targetPoolEntryCount。
  // 为 true 时，如果最终 poolEntryCount 不达标，任务会被判定为失败。
  enforceTargetPoolEntryCount: boolean;

  // 是否启用任务级自动续跑。
  // 启用后，如果模型提前收尾但还没达到入池目标，外层编排会继续补跑。
  enableTaskSupervisor: boolean;

  // 单个初筛任务最多允许完整跑多少次 Agent。
  // 这里统计的是“整轮任务续跑次数”，不是单轮 search_web 次数。
  maxSupervisorRuns: number;
}

// 初筛默认配置。
// 当前策略是：目标入池 10 条，必须达标。
export const SCREENING_DEFAULT_CONFIG: ScreeningTaskConfig = {
  targetPoolEntryCount: 10,
  candidateOutputLimit: 10,
  maxSearchRounds: 6,
  maxResultsPerQuery: 10,
  enforceTargetPoolEntryCount: true,
  enableTaskSupervisor: true,
  maxSupervisorRuns: 3,
};

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
export function buildScreeningTaskOutputRequirements(config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG): string {
  return (
    "输出要求:\n" +
    "1. 本任务是初筛任务，目标是形成候选池，不要直接把结论写成最终成交判断。\n" +
    `2. 本轮目标是成功进入候选池的机会数量达到 ${config.targetPoolEntryCount} 条。这里的“成功进入候选池”是指 shouldEnterPool=true，且应计入 summary.poolEntryCount。\n` +
    `3. 本轮 currentOpportunities 主列表最多输出 ${config.candidateOutputLimit} 条，优先展示成功进入候选池的有效机会。\n` +
    `4. 搜索应尽量分轮进行，建议最多 ${config.maxSearchRounds} 轮，每轮单次 search_web 的 max_results 建议不超过 ${config.maxResultsPerQuery}。\n` +
    "5. 每次调用 search_web 时，都应显式传入与本任务一致的 time_window_days，避免后续补搜时偏离时间窗。\n" +
    `6. ${config.enforceTargetPoolEntryCount ? `如果 summary.poolEntryCount 小于 ${config.targetPoolEntryCount}，本次任务应视为未达成目标，必须在 notes 中明确写出“未达到候选池目标数量”。` : "如果未达到目标数量，可在 notes 中说明原因。"}\n` +
    "7. 最终请输出结构化 JSON。\n" +
    "8. 凡涉及 shouldEnterPool、totalScore、aiFitScore、maturityScore、publishTime、是否推荐跟进，必须严格以工具输出为准，不得自行改写。\n" +
    "9. 如果工具结果显示线索不在时间窗内，最终结果必须明确标记。\n" +
    "10. 如果抓取对象是 PDF 且无法解析正文，必须明确标注“待补抓 PDF 正文”，不要把乱码当正文分析。\n" +
    "11. 如果抓取对象是 PDF 且只有正文内日期、没有权威公告页发布时间，不要把正文日期直接当作最终发布时间；应允许保留为时间待核验状态。\n" +
    "12. 最终结果必须分层输出 currentOpportunities、historicalCases、policySignals、outOfWindowLeads，不要把不同语义的线索混在一个数组里。\n" +
    "13. historicalCases 和 policySignals 不能写进当前商机主列表。\n" +
    "14. 如果 isActionableNow=false，则结论里不能写成建议当前跟进。\n" +
    "15. 来自政府官网或政策来源的线索，如果正文已出现明确采购、立项、建设方案、升级改造等执行信号，可以保留为 currentOpportunities，不要一律降为 policySignals。\n" +
    "16. 每条线索尽量保留 leadCategory、opportunityStage、isActionableNow、scoreBreakdown、categoryReason。\n" +
    "17. 如果 publishTime 为空，但 PDF 正文候选日期明显早于当前时间窗，该线索可以保留为待核验参考，但不得直接 shouldEnterPool=true。\n" +
    "18. 输出结构优先参考以下模板：\n" +
    "```json\n" +
    SCREENING_RESULT_TEMPLATE +
    "\n```"
  );
}

// 生成运行时摘要，主要用于把关键执行参数直接写进任务消息，
// 避免模型不知道本轮的目标数量和停止标准。
export function buildScreeningExecutionSummary(config: ScreeningTaskConfig = SCREENING_DEFAULT_CONFIG): string {
  return [
    "初筛执行配置:",
    `- 目标入池数量: ${config.targetPoolEntryCount}`,
    `- 主列表输出上限: ${config.candidateOutputLimit}`,
    `- 最大搜索轮数: ${config.maxSearchRounds}`,
    `- 单轮最大召回数建议: ${config.maxResultsPerQuery}`,
    `- 是否强制达标: ${config.enforceTargetPoolEntryCount ? "是" : "否"}`,
    `- 是否启用任务级自动续跑: ${config.enableTaskSupervisor ? "是" : "否"}`,
    `- 任务级自动续跑上限: ${config.maxSupervisorRuns}`,
  ].join("\n");
}

// 初筛相关的本地存储目录。
// runs: 每次初筛任务的完整原始结果
// artifact: 供后续深查复用的候选池快照
export const SCREENING_STORAGE_DIRS = {
  runs: "screening-runs",
  artifact: "screening-pool",
} as const;
