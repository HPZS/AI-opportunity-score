// 深查任务兼容的任务别名。
// `deep_analysis` 是历史命名，后续统一收口到 `investigation`。
export const INVESTIGATION_TASK_ALIASES = ["investigation", "deep_analysis"] as const;

// 深查任务的参考输出模板。
// 主要作用是约束模型输出结构，方便后续落盘和对接后端。
export const INVESTIGATION_RESULT_TEMPLATE = `{
  "taskType": "investigation",
  "sourceScreeningTaskId": "来自哪次初筛任务，可为空",
  "summary": {
    "selectedLeadCount": 0,
    "investigatedLeadCount": 0,
    "highPriorityCount": 0,
    "executionStats": {
      "searchQueryCount": 0,
      "searchResultCount": 0,
      "uniqueSearchResultCount": 0,
      "deepInvestigateCount": 0,
      "analyzeOpportunityCount": 0
    }
  },
  "investigatedLeads": [
    {
      "leadId": "lead-001",
      "title": "线索标题",
      "description": "线索标准摘要",
      "ownerOrg": "业主单位",
      "leadCategory": "current_opportunity",
      "opportunityStage": "招标中",
      "relatedLinks": [],
      "sourceLinksByType": {
        "main": [],
        "sourceContinuity": [],
        "similarCases": [],
        "landingCases": [],
        "policySupports": [],
        "budgetSupports": []
      },
      "timeline": [],
      "deepAnalysis": {
        "sourceContinuity": "同源连续性结论",
        "similarCaseSummary": "横向案例结论",
        "landingCaseSummary": "落地验证结论",
        "policySupportSummary": "政策支撑结论",
        "budgetSupportSummary": "预算支撑结论",
        "deepAnalysisConclusion": "深查结论",
        "evidenceStrengthScore": 68,
        "deepAnalysisScore": 68,
        "suggestedAction": "建议售前跟进"
      },
      "analysisSupplement": {
        "aiValueSummary": "AI切入价值总结",
        "aiRisks": []
      },
      "finalRecommendation": "建议重点跟进"
    }
  ],
  "rankedRecommendations": [],
  "notes": []
}`;

// 生成给模型看的“深查任务规则说明”。
// 这部分重点强调：深查不能覆盖初筛结论，只能补证据和给解释。
export function buildInvestigationTaskOutputRequirements(): string {
  return (
    "输出要求:\n" +
    "1. 本任务是深查任务，只针对指定候选线索或 TopN 线索补证据，不要重新做全网泛化初筛。\n" +
    "2. 最终请输出结构化 JSON。\n" +
    "3. 深查重点围绕同源连续性、横向案例、落地验证、政策支撑、预算支撑组织结论。\n" +
    "4. 如果证据不足，必须明确写“待补证据”，不要把猜测当结论。\n" +
    "5. deepAnalysisScore、evidenceStrengthScore、suggestedAction 等字段必须严格引用工具输出，不得自行篡改；深查阶段不得重新改写初筛主分。\n" +
    "6. 最终结果必须给出 investigatedLeads 和 rankedRecommendations，便于后续形成重点机会榜单。\n" +
    "7. 如果输入中已经包含 screening 快照，则 leadCategory、opportunityStage、isActionableNow、shouldEnterPool、scenarioFitScore、aiFitScore、opportunityMaturityScore/maturityScore、screeningScore、totalScore 以输入初筛结果为准，后续 analyze_opportunity 只能补充技术路径和动作解释，不能覆盖初筛结论。\n" +
    "8. 如果输入线索里包含历史案例或政策信号，要明确说明其作为参考证据，不要直接写成当前可跟进项目。\n" +
    "9. 调用 analyze_opportunity 时，尽量同时传入 source_domain 和 publish_time，避免因上下文缺失导致阶段误判。\n" +
    "10. 对每条 investigatedLead，尽量补齐 description、ownerOrg、relatedLinks、sourceLinksByType、timeline、analysisSupplement.aiValueSummary、analysisSupplement.aiRisks；如果暂缺链接或时间点，至少输出空数组，不要省略字段。\n" +
    "11. 输出结构优先参考以下模板：\n" +
    "```json\n" +
    INVESTIGATION_RESULT_TEMPLATE +
    "\n```"
  );
}

// 深查相关的本地存储目录。
// runs: 每次深查任务的完整原始结果
// artifact: 适合直接给人看的深查报告
export const INVESTIGATION_STORAGE_DIRS = {
  runs: "investigation-runs",
  artifact: "investigation-reports",
} as const;
