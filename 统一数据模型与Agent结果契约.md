# 统一数据模型与 Agent 结果契约

## 一、文档目标

本文档用于统一前端、后端、数据库和 Agent 之间的数据定义，避免后续开发过程中出现字段含义不一致、结果无法入库、页面无法展示的问题。

本文档重点解决三个问题：

1. 线索对象怎么定义
2. 评分对象怎么定义
3. Agent 结果如何回传给后端

同时，本文档补充以下设计目标：

4. 初筛与深查如何分层建模
5. 去重、机会归并和机会重启如何建模
6. 同类机会扩散如何表达

## 二、设计原则

统一契约时，建议遵循以下原则：

1. 结构稳定优先于字段丰富
   - 第一版字段尽量少而准，不追求一次性覆盖所有扩展场景。
2. 原始字段与加工字段分开
   - 方便追溯原始数据来源，避免后续排查困难。
3. 模型输出与后端聚合分离
   - 模型负责理解和抽取，后端负责稳定计算和业务状态管理。
4. 评分结果必须可解释
   - 每个关键分数都要能追溯到原因和证据。

## 三、统一线索对象

线索对象不应只理解为“某个网页结果”，而应拆成三个层次：

1. `lead`
   - 表达一个可跟进的具体机会主实体
2. `leadEvent`
   - 表达该机会在不同时间、不同阶段命中的事件记录
3. `opportunityCluster`
   - 表达同类机会场景簇，用于衡量市场热度和横向扩散

后续所有页面和分析流程，都建议围绕这三层对象展开。

### 1. Lead 基础结构

```json
{
  "id": 1001,
  "title": "某市12345热线智能化升级项目采购公告",
  "normalizedTitle": "某市12345热线智能化升级项目采购公告",
  "url": "https://example.gov.cn/detail/123",
  "normalizedUrl": "https://example.gov.cn/detail/123",
  "sourceName": "某市公共资源交易中心",
  "sourceDomain": "example.gov.cn",
  "sourceType": "招采类",
  "sourceLevel": "A",
  "organizationName": "某市政务服务管理局",
  "publishTimeRaw": "2026-04-06 10:30:00",
  "publishTime": "2026-04-06T10:30:00+08:00",
  "publishTimeConfidence": 0.95,
  "summary": "项目拟建设智能问答、工单辅助分派和知识库检索能力。",
  "content": "正文内容",
  "matchedKeywords": ["热线", "知识库", "智能化升级"],
  "scenarioTags": ["热线服务", "知识管理"],
  "status": "待研判",
  "expiryStatus": "有效",
  "createdAt": "2026-04-08T09:30:00+08:00",
  "updatedAt": "2026-04-08T09:30:00+08:00"
}
```

建议补充以下字段：

- `leadId`
- `dedupeKey`
- `currentStage`
- `leadCategory`
- `isActionableNow`
- `firstSeenAt`
- `lastSeenAt`
- `lastActivatedAt`
- `reactivationCount`
- `clusterId`

### 2. 字段分组建议

建议按以下分组理解：

1. 原始采集字段
   - `title`
   - `url`
   - `summary`
   - `content`
   - `publishTimeRaw`
2. 标准化字段
   - `normalizedTitle`
   - `normalizedUrl`
   - `publishTime`
   - `publishTimeConfidence`
3. 业务识别字段
   - `sourceType`
   - `sourceLevel`
   - `organizationName`
   - `matchedKeywords`
   - `scenarioTags`
4. 业务状态字段
   - `status`
   - `expiryStatus`

### 3. 状态枚举建议

`status` 建议值：

- `待研判`
- `待跟进`
- `跟进中`
- `已转商机`
- `暂不跟进`
- `已关闭`

`expiryStatus` 建议值：

- `有效`
- `高时效关注`
- `待复评`
- `已过期`

### 4. LeadEvent 建议结构

`leadEvent` 用于记录某个机会被再次命中时的具体事件，而不是直接覆盖主实体。

```json
{
  "eventId": "event-20260408-001",
  "leadId": "lead-1001",
  "eventType": "招标公告",
  "publishTime": "2026-04-06T10:30:00+08:00",
  "capturedAt": "2026-04-08T09:30:00+08:00",
  "sourceDomain": "example.gov.cn",
  "normalizedUrl": "https://example.gov.cn/detail/123",
  "triggeredReactivation": true,
  "stageBefore": "规划信号",
  "stageAfter": "招标中"
}
```

### 5. OpportunityCluster 建议结构

`opportunityCluster` 用于表达同类机会簇，而不是某一个具体项目。

```json
{
  "clusterId": "cluster-hotline-upgrade",
  "clusterName": "政务热线智能化",
  "scenarioTags": ["热线服务", "知识管理"],
  "leadCount": 12,
  "organizationCount": 9,
  "recentLeadCount30d": 4,
  "heatLevel": "high",
  "lastObservedAt": "2026-04-08T09:30:00+08:00"
}
```

## 四、统一评分对象

评分对象用于表达一条线索的初筛结果、深查结果和综合评分。

### 1. Score 基础结构

```json
{
  "leadId": 1001,
  "scenarioConfidence": 0.9,
  "aiFitScore": 82,
  "maturityScore": 76,
  "deepAnalysisScore": 68,
  "recencyWeight": 0.85,
  "totalScore": 77.6,
  "scoreTime": "2026-04-08T09:40:00+08:00",
  "modelName": "screening-model-v1",
  "scoreReason": "热线场景重复性高，文本数据丰富，采购意向明确，时间窗口较近。",
  "suggestedAction": "建议售前跟进",
  "modelConfidence": 0.86
}
```

### 2. 分值定义建议

`aiFitScore`
- 判断该业务场景是否适合 AI 提效或替代

`maturityScore`
- 判断当前是否具备采购、立项、试点、预算等可跟进信号

`deepAnalysisScore`
- 判断深查阶段补充证据是否足够支持正式跟进

`recencyWeight`
- 后端基于发布时间和截止时间计算的时效权重

`totalScore`
- 后端聚合后的最终综合分

### 3. 推荐计算公式

建议由后端按如下公式计算：

```text
总分 = AI适配度 * 0.4 + 商机成熟度 * 0.4 + 深查补证据得分 * 0.2
综合展示分 = 总分 * 时效权重
```

说明：

1. 模型输出分维度分数
2. 后端聚合基础总分
3. 后端再叠加时效衰减

这样有利于结果稳定和业务解释。

## 五、统一深查结果对象

深查对象用于描述高潜线索的补证据结果。

```json
{
  "leadId": 1001,
  "sourceContinuity": "近6个月同一单位连续发布过热线平台建设、知识库优化和工单协同相关信息。",
  "similarCaseSummary": "其他地市已有12345热线智能辅助分派和知识问答建设案例。",
  "landingCaseSummary": "检索到同类项目中标公告和验收报道，说明建设路径成熟。",
  "policySupportSummary": "地方数字政府建设方案明确提出提升热线智能化能力。",
  "budgetSupportSummary": "采购公告中出现预算金额和资金来源说明。",
  "deepAnalysisConclusion": "需求真实，方向成熟，适合尽快跟进。",
  "deepAnalysisScore": 68,
  "analysisTime": "2026-04-08T09:50:00+08:00"
}
```

## 六、Agent 任务契约

为了保证 Agent 与后端边界清晰，建议通过任务和结果两个对象协作。

### 1. 后端下发任务

```json
{
  "taskId": "task-20260408-001",
  "taskType": "screening",
  "triggerType": "manual",
  "keywords": ["热线", "知识库", "智能化升级"],
  "sourceTypes": ["招采类", "政策类", "组织动态类"],
  "timeRangeDays": 30,
  "limit": 20
}
```

`taskType` 建议值：

- `screening`
- `investigation`
- `rescore_recent`

说明：

1. `screening`
   - 用于召回、抽信号、初筛和形成候选池
2. `investigation`
   - 用于对指定高潜线索或 TopN 线索执行深查
3. `collect_and_screen`
   - 可作为兼容期别名保留，但长期不建议继续作为主类型

### 2. Agent 回传结果结构

```json
{
  "taskId": "task-20260408-001",
  "taskStatus": "SUCCESS",
  "modelName": "opportunity-agent-v1",
  "results": [
    {
      "lead": {
        "title": "某市12345热线智能化升级项目采购公告",
        "normalizedTitle": "某市12345热线智能化升级项目采购公告",
        "url": "https://example.gov.cn/detail/123",
        "normalizedUrl": "https://example.gov.cn/detail/123",
        "sourceName": "某市公共资源交易中心",
        "sourceDomain": "example.gov.cn",
        "sourceType": "招采类",
        "sourceLevel": "A",
        "organizationName": "某市政务服务管理局",
        "publishTimeRaw": "2026-04-06 10:30:00",
        "publishTime": "2026-04-06T10:30:00+08:00",
        "publishTimeConfidence": 0.95,
        "summary": "项目拟建设智能问答、工单辅助分派和知识库检索能力。",
        "content": "正文内容",
        "matchedKeywords": ["热线", "知识库", "智能化升级"],
        "scenarioTags": ["热线服务", "知识管理"]
      },
      "screening": {
        "shouldEnterPool": true,
        "leadCategory": "current_opportunity",
        "opportunityStage": "招标中",
        "isActionableNow": true,
        "scenarioConfidence": 0.9,
        "aiFitScore": 82,
        "maturityScore": 76,
        "scoreReason": "热线场景文本密集、流程重复度高，且采购信号明确。",
        "suggestedAction": "建议进入候选机会池",
        "evidenceList": [
          "标题中出现热线智能化升级和知识库建设信号",
          "正文中出现采购范围和建设内容"
        ],
        "modelConfidence": 0.86
      },
      "deepAnalysis": null
    }
  ],
  "errorMessage": null,
  "finishedAt": "2026-04-08T09:55:00+08:00"
}
```

## 七、初筛结果契约

初筛结果建议保持轻量，只回答“是否值得进入候选机会池”。

必要字段：

- `shouldEnterPool`
- `leadCategory`
- `opportunityStage`
- `isActionableNow`
- `scenarioConfidence`
- `aiFitScore`
- `maturityScore`
- `scoreReason`
- `suggestedAction`
- `evidenceList`
- `modelConfidence`

建议补充字段：

- `dedupeKey`
- `leadId`
- `clusterId`
- `isReactivated`
- `reactivationReason`
- `scoreBreakdown`

## 八、深查结果契约

深查结果建议由人工或系统对高分线索单独触发。

```json
{
  "taskId": "task-20260408-002",
  "taskStatus": "SUCCESS",
  "modelName": "opportunity-agent-v1",
  "results": [
    {
      "leadId": 1001,
      "deepAnalysis": {
        "sourceContinuity": "近6个月连续出现相关建设动态",
        "similarCaseSummary": "其他地区存在同类建设案例",
        "landingCaseSummary": "检索到中标与验收信息",
        "policySupportSummary": "地方数字政府政策明确提出热线智能化提升",
        "budgetSupportSummary": "公告中出现预算金额",
        "deepAnalysisConclusion": "方向真实，建议尽快跟进",
        "deepAnalysisScore": 68,
        "suggestedAction": "建议售前跟进",
        "clusterEvidence": {
          "clusterId": "cluster-hotline-upgrade",
          "recentLeadCount30d": 4,
          "evidenceSummary": "近30天内多个地区出现同类热线智能化升级信号"
        }
      }
    }
  ],
  "errorMessage": null,
  "finishedAt": "2026-04-08T10:10:00+08:00"
}
```

### 8.1 深查任务与初筛任务的关系

推荐关系如下：

1. 初筛任务负责形成候选池
2. 深查任务只消费候选池中的线索
3. 深查排序应以深查结果为准，而不是只看初筛分

如果业务上要求“深查 10 个机会”，推荐流程为：

1. 初筛先召回并筛出候选池
2. 按 `leadCategory = current_opportunity`、`withinTimeWindow = true`、`shouldEnterPool = true` 等规则选择 TopN
3. 对 TopN 执行深查
4. 输出批次深查榜单

## 九、去重、归并与重启建模建议

该项目中的去重不能只做“见过就丢”，建议区分如下：

### 1. 原始记录去重

用于解决重复网页问题：

- `normalizedUrl`
- `normalizedTitle`
- `sourceDomain`

### 2. 同一机会归并

用于把同一客户、同一项目、不同阶段的记录归并到同一个 `leadId` 下。

建议字段：

- `dedupeKey`
- `projectCode`
- `noticeCode`
- `organizationName`
- `normalizedTitle`

### 3. 老机会重启

当历史机会在当前周期重新出现并状态升级时，不应被旧去重规则吞掉。

建议字段：

- `isReactivated`
- `reactivationReason`
- `lastActivatedAt`
- `reactivationCount`

### 4. 同类机会扩散

不同客户出现同类机会时，不应去重，而应挂到同一个 `clusterId` 下，作为横向案例和市场热度依据。

## 十、来源可信度规则建议

来源可信度建议由后端统一维护，不建议由 Agent 自由判断最终等级。

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

## 十一、落地建议

建议开发时先实现以下最小契约：

1. 线索基础对象
2. 初筛结果对象
3. 深查结果对象
4. `leadEvent` 对象
5. `opportunityCluster` 对象
6. Agent 任务对象
7. Agent 回传结果对象

第一版不要追求字段一次性最全，先保证：

1. 可以入库
2. 可以展示
3. 可以复查
4. 可以做规则聚合

这 4 点成立之后，再逐步扩展企业画像、案例知识库、多模型评分等增强能力。
