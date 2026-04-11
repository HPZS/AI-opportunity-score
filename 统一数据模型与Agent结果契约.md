# 统一数据模型与 Agent 结果契约

## 一、文档目标

本文档用于统一前端、后端、数据库和 Agent 之间的数据定义，并以当前 `ai-opportunity-agent` 的真实输出为准进行对齐。

本次对齐重点解决三个问题：

1. 当前 Agent 实际产出的结果结构到底是什么
2. 哪些字段是 Agent 真实输出，哪些字段应由后端补充和维护
3. 后端如何把当前 Agent 输出映射成稳定的落库模型和展示模型

需要特别说明：

1. 旧版文档中的 `results: [{ lead, screening, deepAnalysis }]` 已不再代表当前真实输出
2. 当前系统里同时存在两层对象
   - Agent 原始/归一化输出
   - 后端目标数据模型
3. 本文档会明确区分这两层，避免继续混用

## 二、对齐基准

本文件基于以下最新实现和样例结果整理：

1. `ai-opportunity-agent/data/task-results/2026-04-11T04-28-54-981Z_screening.json`
2. `ai-opportunity-agent/data/task-results/2026-04-11T04-54-20-377Z_investigation.json`
3. `ai-opportunity-agent/src/result-normalizer.ts`
4. `ai-opportunity-agent/src/storage.ts`

其中：

1. `task-results` 目录下保存的是任务结果总包
2. `result-normalizer.ts` 负责把 Agent 输出做归一化、补齐时间窗状态、补 summary、补综合分等
3. `storage.ts` 负责把结果拆存到 `screening-runs`、`screening-pool`、`investigation-runs`、`investigation-reports` 等目录

## 三、当前 Agent 实际输出总览

### 1. 顶层任务结果包

当前 Agent 每次执行后，落盘的顶层结构统一为：

```json
{
  "taskType": "screening",
  "originalTaskType": "screening",
  "model": "gpt-5.x",
  "savedAt": "2026-04-11T04:28:54.981Z",
  "taskInput": {},
  "taskMeta": {},
  "tokens": {},
  "parsed": true,
  "result": {},
  "rawText": "..."
}
```

当前已确认的顶层字段如下：

- `taskType`
- `originalTaskType`
- `model`
- `savedAt`
- `taskInput`
- `taskMeta`
- `tokens`
- `parsed`
- `result`
- `rawText`

字段含义建议如下：

1. `taskType`
   - 当前任务的归一化类型，当前主要是 `screening` 或 `investigation`
2. `originalTaskType`
   - 原始任务类型，兼容历史别名或输入类型
3. `model`
   - 本次任务使用的模型标识
4. `savedAt`
   - 结果落盘时间
5. `taskInput`
   - 本次任务的输入信息和任务说明
6. `taskMeta`
   - 本次任务的执行状态和恢复信息
7. `tokens`
   - 令牌统计
8. `parsed`
   - `rawText` 是否已成功提取成结构化 JSON
9. `result`
   - 当前任务真正的业务结果
10. `rawText`
   - Agent 原始文本输出，便于追溯

### 2. taskInput 真实结构

当前 `taskInput` 真实字段为：

- `prompt`
- `inputFile`
- `taskMessage`

示例：

```json
{
  "prompt": "按当前已启用 subscription 配置执行一轮初筛...",
  "inputFile": null,
  "taskMessage": "任务类型: screening\n\n任务说明:\n..."
}
```

说明：

1. 当前系统并没有单独落一个“标准化任务对象”作为顶层主字段
2. 当前更接近“任务说明文本 + 结构化结果”的模式
3. 如果后端后续要做任务中心，可以基于 `taskInput` 再抽象内部任务表

### 3. taskMeta 真实结构

当前 `taskMeta` 真实字段为：

- `attemptCount`
- `stoppedByUser`
- `completed`
- `taskState`
- `resumable`
- `resumeKey`
- `failureReason`

示例：

```json
{
  "attemptCount": 1,
  "stoppedByUser": false,
  "completed": true,
  "taskState": "completed",
  "resumable": false,
  "resumeKey": "a6024892390279bbfd0f",
  "failureReason": null
}
```

## 四、当前 Screening 结果契约

### 1. screening.result 根结构

当前 `screening` 任务的 `result` 真实字段为：

- `taskType`
- `topic`
- `timeWindow`
- `summary`
- `currentOpportunities`
- `historicalCases`
- `policySignals`
- `outOfWindowLeads`
- `notes`

示例：

```json
{
  "taskType": "screening",
  "topic": "政企 AI 改造机会初筛",
  "timeWindow": {
    "start": "2026-03-12",
    "end": "2026-04-11",
    "days": 30
  },
  "summary": {},
  "currentOpportunities": [],
  "historicalCases": [],
  "policySignals": [],
  "outOfWindowLeads": [],
  "notes": []
}
```

### 2. screening.summary 结构

当前样例中，`summary` 已包含业务统计和执行统计：

```json
{
  "currentOpportunityCount": 4,
  "historicalCaseCount": 0,
  "policySignalCount": 0,
  "outOfWindowCount": 1,
  "recommendedFollowUpCount": 2,
  "priorityFollowUpCount": 1,
  "watchlistCount": 1,
  "signalTrackingCount": 0,
  "poolEntryCount": 2,
  "executionStats": {
    "toolCallCount": 32,
    "searchQueryCount": 17,
    "searchResultCount": 38,
    "uniqueSearchResultCount": 28,
    "fetchPageCount": 5,
    "uniqueFetchedPageCount": 5,
    "extractSignalCount": 5,
    "uniqueExtractedLeadCount": 5,
    "screenedLeadCount": 5,
    "acceptedLeadCount": 2,
    "rejectedLeadCount": 3,
    "deepInvestigateCount": 0,
    "analyzeOpportunityCount": 0,
    "investigatedLeadCount": 0,
    "rankedRecommendationCount": 0
  }
}
```

说明：

1. `summary` 已不是早期只放计数的简单对象
2. 现在还承载了工具执行统计，可直接给后端做任务回溯或管理台展示

### 3. screening lead item 真实结构

当前 `currentOpportunities[0]` 的真实字段为：

- `title`
- `normalizedTitle`
- `url`
- `sourceName`
- `sourceDomain`
- `leadCategory`
- `opportunityStage`
- `isActionableNow`
- `shouldEnterPool`
- `poolEntryTier`
- `opportunitySignalClass`
- `categoryReason`
- `description`
- `ownerOrg`
- `scenarioTags`
- `publishTime`
- `publishTimeRaw`
- `publishTimeConfidence`
- `withinTimeWindow`
- `recommendedTechnologies`
- `evidenceSummary`
- `scoreBreakdown`
- `followUpAction`
- `suggestedAction`
- `relatedLinks`
- `timeWindowStatus`

当前真实样例如下：

```json
{
  "title": "市数据资源管理局（市政务服务管理局）2026年3月份工作落实情况",
  "normalizedTitle": "市数据资源管理局（市政务服务管理局）2026年3月份工作落实情况",
  "url": "https://tl.gov.cn/openness/OpennessContent/show/1144887.html",
  "sourceName": "铜陵市数据资源管理局（市政务服务管理局）",
  "sourceDomain": "tl.gov.cn",
  "leadCategory": "current_opportunity",
  "opportunityStage": "招标中",
  "isActionableNow": true,
  "shouldEnterPool": true,
  "poolEntryTier": "优先跟进",
  "opportunitySignalClass": "明确招采",
  "categoryReason": "该线索处于规划或招采阶段，且仍在有效时间窗内，可作为当前商机继续跟进。",
  "description": "铜陵市数据局3月份落实情况显示AI智能问答项目已通过省局审核...",
  "ownerOrg": "市数据资源管理局（市政务服务管理局）",
  "scenarioTags": ["政务服务", "招采合规"],
  "publishTime": "2026-03-31T00:00:00.000Z",
  "publishTimeRaw": "2026-03-31T00:00:00.000Z",
  "publishTimeConfidence": 0.9,
  "withinTimeWindow": true,
  "recommendedTechnologies": ["大模型问答", "知识库检索", "流程助手"],
  "evidenceSummary": [
    "AI智能问答项目已通过省局审核。",
    "政务服务优化拓展项目已完成采购意向公示。"
  ],
  "scoreBreakdown": {
    "scenarioFitScore": 63,
    "aiFitScore": 65,
    "opportunityMaturityScore": 62,
    "screeningScore": 71.4,
    "opportunityScore": 71.4,
    "referenceValueScore": 59.5,
    "totalScore": 71.4
  },
  "followUpAction": "建议进入候选机会池并优先跟进",
  "suggestedAction": "建议优先跟进，尽快补齐客户关系、预算节点和竞争格局。",
  "relatedLinks": [
    {
      "label": "原始链接",
      "url": "https://tl.gov.cn/openness/OpennessContent/show/1144887.html",
      "type": "main"
    }
  ],
  "timeWindowStatus": "in_window"
}
```

### 4. screening 阶段需要注意的真实情况

当前真实输出与旧文档相比，有几个关键变化：

1. 没有单独的 `lead` 包装对象
   - 当前是 bucket 数组直接挂 lead item
2. 没有单独的 `score` 主对象
   - 当前分数嵌在 `scoreBreakdown` 中
3. screening 阶段通常没有 `leadId`
   - 这意味着后端需要在入库时自行生成主键、去重键或 `leadId`
4. 当前 screening item 没有稳定提供以下字段
   - `normalizedUrl`
   - `sourceType`
   - `sourceLevel`
   - `status`
   - `expiryStatus`
5. 上述字段更适合由后端规则层统一补充

### 5. 关于四个 bucket 的统一处理

当前样例里 `historicalCases` 和 `policySignals` 为空，但根据 `result-normalizer.ts` 的统一 bucket 归一化逻辑，可以推断：

1. 四个 bucket 会按相近的数据结构处理
2. 后端应尽量按一套基础字段兼容接收
3. 但在业务语义上要区分：
   - `currentOpportunities`：当前可跟进机会
   - `historicalCases`：历史案例
   - `policySignals`：政策信号
   - `outOfWindowLeads`：超时间窗线索

这里“结构相近”是基于代码逻辑的推断，不是来自当前样例文件的直接事实。

## 五、当前 Investigation 结果契约

### 1. investigation.result 根结构

当前 `investigation` 任务的 `result` 真实字段为：

- `taskType`
- `sourceScreeningTaskId`
- `summary`
- `investigatedLeads`
- `rankedRecommendations`
- `notes`

示例：

```json
{
  "taskType": "investigation",
  "sourceScreeningTaskId": "2026-04-11T04-28-54-981Z_screening",
  "summary": {},
  "investigatedLeads": [],
  "rankedRecommendations": [],
  "notes": []
}
```

### 2. investigation.summary 结构

当前样例中的 `summary` 为：

```json
{
  "selectedLeadCount": 2,
  "investigatedLeadCount": 2,
  "highPriorityCount": 1,
  "executionStats": {
    "toolCallCount": 17,
    "searchQueryCount": 8,
    "searchResultCount": 29,
    "uniqueSearchResultCount": 21,
    "fetchPageCount": 3,
    "uniqueFetchedPageCount": 3,
    "extractSignalCount": 2,
    "uniqueExtractedLeadCount": 2,
    "screenedLeadCount": 0,
    "acceptedLeadCount": 0,
    "rejectedLeadCount": 0,
    "deepInvestigateCount": 2,
    "analyzeOpportunityCount": 2,
    "investigatedLeadCount": 2,
    "rankedRecommendationCount": 2
  }
}
```

### 3. investigatedLead 真实结构

当前 `investigatedLeads[0]` 的真实字段为：

- `leadId`
- `title`
- `description`
- `ownerOrg`
- `leadCategory`
- `opportunityStage`
- `isActionableNow`
- `shouldEnterPool`
- `poolEntryTier`
- `initialScreeningJudgment`
- `relatedLinks`
- `sourceLinksByType`
- `timeline`
- `deepAnalysis`
- `analysisSupplement`
- `screeningSnapshot`
- `finalRecommendation`

当前真实样例如下：

```json
{
  "leadId": "lead-001",
  "title": "市数据资源管理局（市政务服务管理局）2026年3月份工作落实情况",
  "description": "3月份重点工作落实情况，核心可跟踪信号包括...",
  "ownerOrg": "铜陵市数据资源管理局（市政务服务管理局）",
  "leadCategory": "current_opportunity",
  "opportunityStage": "招标中",
  "isActionableNow": true,
  "shouldEnterPool": true,
  "poolEntryTier": "优先跟进",
  "initialScreeningJudgment": "优先跟进",
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
  "deepAnalysis": {},
  "analysisSupplement": {},
  "screeningSnapshot": {},
  "finalRecommendation": "建议重点跟进，但动作以‘补证据+找增量切口’为主。"
}
```

### 4. deepAnalysis 真实结构

当前 `deepAnalysis` 真实字段为：

- `sourceContinuity`
- `similarCaseSummary`
- `landingCaseSummary`
- `policySupportSummary`
- `budgetSupportSummary`
- `competitionAndDeliveryJudgement`
- `deepAnalysisConclusion`
- `evidenceStrengthScore`
- `deepAnalysisScore`
- `suggestedAction`

说明：

1. 相比旧文档，现在多了 `competitionAndDeliveryJudgement`
2. 这部分非常关键，已经不是简单“有没有案例”，而是开始承载竞争格局和切入方式判断

### 5. analysisSupplement 真实结构

当前 `analysisSupplement` 真实字段为：

- `aiValueSummary`
- `aiRisks`

说明：

1. 这一层不是主结论，而是补充解释
2. 非常适合直接给前端详情页使用

### 6. screeningSnapshot 真实结构

当前 `screeningSnapshot` 真实字段为：

- `scenarioFitScore`
- `aiFitScore`
- `opportunityMaturityScore`
- `screeningScore`
- `totalScore`
- `note`

说明：

1. 深查阶段会尽量保留初筛快照，不在深查时改写初筛主分
2. 如果找不到对应初筛池数据，快照可能为空或为 `null`

### 7. rankedRecommendations 真实结构

当前 `rankedRecommendations[0]` 的真实字段为：

- `rank`
- `leadId`
- `title`
- `initialScreeningJudgment`
- `deepAnalysisScore`
- `evidenceStrengthScore`
- `recommendedPriority`
- `reason`
- `suggestedAction`

当前代码里的 `result-normalizer.ts` 还支持在归一化时补充以下字段：

- `compositeScore`
- `finalRecommendation`

但需要说明：

1. 当前历史样例文件里不一定已经出现这两个字段
2. 这是当前归一化代码已支持的扩展结果
3. 后端入库时应把它们视为可选字段，而不是强依赖字段

## 六、当前综合评分的真实位置

旧文档把评分定义成独立 `score` 对象，但当前真实情况不是这样。

当前分数分布如下：

1. 初筛分
   - 在 `screening.currentOpportunities[*].scoreBreakdown`
2. 深查分
   - 在 `investigation.investigatedLeads[*].deepAnalysis.deepAnalysisScore`
3. 深查证据强度
   - 在 `investigation.investigatedLeads[*].deepAnalysis.evidenceStrengthScore`
4. 初筛快照
   - 在 `investigation.investigatedLeads[*].screeningSnapshot`
5. 用户展示综合分
   - 当前由 `result-normalizer.ts` 归一化补充 `compositeScore`

当前代码中的综合分规则为：

```text
rawCompositeScore =
  0.4 * aiFitScore +
  0.4 * opportunityMaturityScore +
  0.2 * deepAnalysisScore

如果没有 deepAnalysisScore，则回退到已有 screeningScore / totalScore / 其他可用分值

compositeScore = 80 + rawCompositeScore * 0.2
```

说明：

1. `rawCompositeScore` 更适合内部存储
2. `compositeScore` 更适合前端直接展示给用户
3. 历史结果文件可能还没有 `compositeScore`
4. 当前后端设计应允许：
   - 若 Agent 已返回 `compositeScore`，直接入库
   - 若未返回，则后端按相同规则补算

## 七、当前存储产物

根据 `storage.ts`，当前不只是写一个 `task-results` 文件，还会拆出可直接消费的副本。

### 1. screening 任务的落盘副本

会写入：

1. `data/task-results/<taskId>.json`
   - 完整任务结果包
2. `data/screening-runs/<taskId>.json`
   - screening 结果包副本
3. `data/screening-pool/<taskId>.json`
   - 展平后的候选池数组

`screening-pool` 中，每条记录会补充：

- `screeningTaskId`
- `capturedAt`
- `sourceBucket`

这层数据对后端非常重要，因为：

1. 它更适合直接入库
2. 它把四个 bucket 的线索打平了
3. investigation 阶段会通过 `sourceScreeningTaskId` 回查这份数据

### 2. investigation 任务的落盘副本

会写入：

1. `data/task-results/<taskId>.json`
   - 完整任务结果包
2. `data/investigation-runs/<taskId>.json`
   - investigation 结果包副本
3. `data/investigation-reports/<taskId>.json`
   - 仅保留 `parsedResult`

## 八、后端目标数据模型

下面这部分不是“当前 Agent 原始输出”，而是后端为了入库、状态管理、前端展示而建议维护的目标模型。

### 1. lead

`lead` 仍然建议作为主实体保留，但它应理解为“后端标准化后的机会主表”，不是 Agent 原始 item。

建议结构：

```json
{
  "leadId": "lead-1001",
  "title": "某市12345热线智能化升级项目采购公告",
  "normalizedTitle": "某市12345热线智能化升级项目采购公告",
  "url": "https://example.gov.cn/detail/123",
  "normalizedUrl": "https://example.gov.cn/detail/123",
  "sourceName": "某市公共资源交易中心",
  "sourceDomain": "example.gov.cn",
  "sourceType": "招采类",
  "sourceLevel": "A",
  "organizationName": "某市政务服务管理局",
  "leadCategory": "current_opportunity",
  "currentStage": "招标中",
  "isActionableNow": true,
  "shouldEnterPool": true,
  "poolEntryTier": "优先跟进",
  "scenarioTags": ["热线服务", "知识管理"],
  "publishTime": "2026-04-06T10:30:00+08:00",
  "publishTimeRaw": "2026-04-06 10:30:00",
  "publishTimeConfidence": 0.95,
  "description": "项目拟建设智能问答、工单辅助分派和知识库检索能力。",
  "status": "待跟进",
  "expiryStatus": "有效",
  "dedupeKey": "xxx",
  "clusterId": "cluster-hotline-upgrade",
  "firstSeenAt": "2026-04-08T09:30:00+08:00",
  "lastSeenAt": "2026-04-11T09:30:00+08:00",
  "lastActivatedAt": "2026-04-11T09:30:00+08:00",
  "reactivationCount": 1
}
```

建议由后端维护、而非依赖 Agent 直接输出的字段：

- `leadId`
- `normalizedUrl`
- `sourceType`
- `sourceLevel`
- `status`
- `expiryStatus`
- `dedupeKey`
- `clusterId`
- `firstSeenAt`
- `lastSeenAt`
- `lastActivatedAt`
- `reactivationCount`

### 2. leadEvent

`leadEvent` 用于保存某条机会在不同时间点再次被命中的记录。

建议结构：

```json
{
  "eventId": "event-20260411-001",
  "leadId": "lead-1001",
  "screeningTaskId": "2026-04-11T04-28-54-981Z_screening",
  "sourceBucket": "current_opportunity",
  "eventType": "screening_hit",
  "publishTime": "2026-04-06T10:30:00+08:00",
  "capturedAt": "2026-04-11T04:28:54.981Z",
  "normalizedUrl": "https://example.gov.cn/detail/123",
  "triggeredReactivation": true
}
```

### 3. scoreSnapshot

考虑到当前真实分数分散在多个位置，建议后端新增独立的 `scoreSnapshot` 或 `leadScore` 表，而不是继续依赖一个理想化的 Agent `score` 对象。

建议结构：

```json
{
  "leadId": "lead-1001",
  "screeningTaskId": "2026-04-11T04-28-54-981Z_screening",
  "investigationTaskId": "2026-04-11T04-54-20-377Z_investigation",
  "scenarioFitScore": 63,
  "aiFitScore": 65,
  "opportunityMaturityScore": 62,
  "screeningScore": 71.4,
  "deepAnalysisScore": 53.1,
  "evidenceStrengthScore": 53.1,
  "rawCompositeScore": 61.62,
  "compositeScore": 92.3,
  "scoreTime": "2026-04-11T04:54:20.377Z"
}
```

说明：

1. 这个对象是后端目标模型，不是当前 Agent 原生输出
2. 如果 Agent 结果里已经有 `compositeScore`，直接保存
3. 如果没有，由后端补算

### 4. opportunityCluster

`opportunityCluster` 仍然建议保留，用于表达同类场景簇和市场热度。

```json
{
  "clusterId": "cluster-hotline-upgrade",
  "clusterName": "政务热线智能化",
  "scenarioTags": ["热线服务", "知识管理"],
  "leadCount": 12,
  "organizationCount": 9,
  "recentLeadCount30d": 4,
  "heatLevel": "high",
  "lastObservedAt": "2026-04-11T09:30:00+08:00"
}
```

## 九、Agent 输出到后端模型的映射建议

### 1. screening item -> lead

建议映射关系：

1. `title` -> `lead.title`
2. `normalizedTitle` -> `lead.normalizedTitle`
3. `url` -> `lead.url`
4. `sourceName` -> `lead.sourceName`
5. `sourceDomain` -> `lead.sourceDomain`
6. `ownerOrg` -> `lead.organizationName`
7. `leadCategory` -> `lead.leadCategory`
8. `opportunityStage` -> `lead.currentStage`
9. `isActionableNow` -> `lead.isActionableNow`
10. `shouldEnterPool` -> `lead.shouldEnterPool`
11. `poolEntryTier` -> `lead.poolEntryTier`
12. `scenarioTags` -> `lead.scenarioTags`
13. `description` -> `lead.description`
14. `publishTime` -> `lead.publishTime`
15. `publishTimeRaw` -> `lead.publishTimeRaw`
16. `publishTimeConfidence` -> `lead.publishTimeConfidence`
17. `timeWindowStatus` -> `lead.expiryStatus` 的计算输入之一

### 2. screening item -> scoreSnapshot

建议映射关系：

1. `scoreBreakdown.scenarioFitScore` -> `scenarioFitScore`
2. `scoreBreakdown.aiFitScore` -> `aiFitScore`
3. `scoreBreakdown.opportunityMaturityScore` -> `opportunityMaturityScore`
4. `scoreBreakdown.screeningScore` -> `screeningScore`
5. `scoreBreakdown.totalScore` -> `screeningScore` 或 `rawScreeningTotal`
6. `compositeScore` -> `compositeScore`
7. `rawCompositeScore` -> `rawCompositeScore`

### 3. investigatedLead -> lead

建议映射关系：

1. `leadId` -> `lead.leadId`
2. `title` -> `lead.title`
3. `ownerOrg` -> `lead.organizationName`
4. `leadCategory` -> `lead.leadCategory`
5. `opportunityStage` -> `lead.currentStage`
6. `isActionableNow` -> `lead.isActionableNow`
7. `shouldEnterPool` -> `lead.shouldEnterPool`
8. `poolEntryTier` -> `lead.poolEntryTier`
9. `finalRecommendation` -> `lead.latestRecommendation`

### 4. investigatedLead -> scoreSnapshot

建议映射关系：

1. `screeningSnapshot.scenarioFitScore` -> `scenarioFitScore`
2. `screeningSnapshot.aiFitScore` -> `aiFitScore`
3. `screeningSnapshot.opportunityMaturityScore` -> `opportunityMaturityScore`
4. `screeningSnapshot.screeningScore` -> `screeningScore`
5. `deepAnalysis.deepAnalysisScore` -> `deepAnalysisScore`
6. `deepAnalysis.evidenceStrengthScore` -> `evidenceStrengthScore`
7. `compositeScore` -> `compositeScore`
8. `rawCompositeScore` -> `rawCompositeScore`

## 十、去重、归并与重启建模建议

这部分仍然有效，但要按当前真实字段来源重新理解。

### 1. 原始记录去重

建议优先使用：

- `url`
- `normalizedTitle`
- `sourceDomain`

如果后端已补出 `normalizedUrl`，则优先使用 `normalizedUrl`。

### 2. 同一机会归并

用于把同一客户、同一项目、不同阶段的记录归并到同一个 `leadId` 下。

建议组合字段：

- `organizationName`
- `normalizedTitle`
- `sourceDomain`
- `projectCode`
- `noticeCode`

### 3. 老机会重启

当历史机会在当前周期重新出现并状态升级时，不应直接被旧去重规则吞掉。

建议维护：

- `isReactivated`
- `reactivationReason`
- `lastActivatedAt`
- `reactivationCount`

### 4. 同类机会扩散

不同客户出现相同场景时，不应去重，而应归入同一个 `clusterId`。

## 十一、来源可信度规则建议

来源可信度仍建议由后端统一维护，不建议依赖 Agent 自由输出最终等级。

推荐规则表结构：

```json
{
  "domain": "ccgp.gov.cn",
  "sourceName": "中国政府采购网",
  "sourceType": "招采类",
  "sourceLevel": "A",
  "credibilityWeight": 1.0,
  "enabled": true
}
```

等级建议：

1. `A`
   - 官方站点、采购平台、交易平台、国企官网、上市公司公告
2. `B`
   - 权威行业媒体、主管部门转载栏目
3. `C`
   - 普通资讯站、聚合信息站
4. `D`
   - 自媒体、论坛、来源不明页面

## 十二、当前最小闭环建议

如果后端和前端要开始接当前 Agent 结果，建议先按下面的最小闭环落地：

1. 先把 `task-results` 顶层结果包入库
   - 解决任务追溯问题
2. 再把 `screening-pool` 打平入库
   - 解决候选池展示问题
3. 再把 `investigatedLeads` 和 `rankedRecommendations` 入库
   - 解决深查详情和重点榜单问题
4. 再在后端补 `lead`、`leadEvent`、`scoreSnapshot`、`opportunityCluster`
   - 解决状态流转、排序和管理问题

第一版优先保证四件事：

1. 可以入库
2. 可以展示
3. 可以复查
4. 可以稳定计算综合分

## 十三、结论

当前系统的真实契约已经不是早期的“单条结果 = `lead + screening + deepAnalysis`”模式，而是：

1. 任务结果总包
2. `screening` 分 bucket 输出
3. `investigation` 分 lead 深查输出
4. 归一化阶段补 summary、时间窗状态和综合分
5. 后端再把这些结果映射成稳定的主数据模型

因此，后续前端、后端、数据库设计应统一按以下原则推进：

1. 当前 Agent 输出按真实结构接入
2. 后端落库模型单独抽象
3. 映射关系明确写死，不再依赖“猜测字段”
4. 用户展示的综合分统一收敛到 `compositeScore`
