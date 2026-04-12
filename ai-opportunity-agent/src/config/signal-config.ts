// 场景识别规则。
// 当文本命中这些关键词时，系统会把线索归入对应业务场景，并给出推荐技术方向。
export interface ScenarioRule {
  tag: string;
  keywords: string[];
  technologies: string[];
  minHits?: number;
}

// 机会阶段枚举。
// 这组值用于表达“该线索现在处于项目生命周期的哪个阶段”。
export type OpportunityStage =
  | "规划信号"
  | "招标中"
  | "中标后"
  | "合同签订"
  | "已落地"
  | "政策信号";

// 搜索信号源预设。
// 这不是最终的业务机会分类，而是“搜索时去哪类站点、关注哪类文档”的预设。
export interface SearchSourceProfile {
  id: string;
  label: string;
  description: string;

  // 搜索作用域。
  // 这里放 site:xxx 这类限定，表示“去哪搜”。
  searchScopes: string[];

  // 文档类型。
  // 这里放“采购公告/政策文件/企业新闻”这类结果类型，表示“搜到后属于什么文档”。
  // 当前主要用于表达预设语义，后续可接到结果筛选逻辑里。
  documentTypes?: string[];

  // 域名白名单。
  // search_web 会把这些域名传给 include_domains，用于进一步约束召回来源。
  includeDomains: string[];
  excludeDomains?: string[];

  // 查询增强词。
  // 用于在不同来源类型下自动强化“执行信号”约束，避免所有来源都混用同一组宽词。
  queryHints?: string[];
}

// 关键词订阅预设。
// 一个订阅对应一类长期关注主题，比如“政务热线智能化”“公文办公智能化”。
export interface KeywordSubscription {
  id: string;
  label: string;
  description: string;

  // 这组关键词会直接参与查询拼装，属于“搜什么”。
  keywords: string[];

  // 推荐搭配哪些信号源预设一起使用。
  // 这是推荐关系，不是强制绑定关系。
  preferredSourceProfileIds: string[];
}

// 初筛机会类型选择配置。
// 用于控制 screening 是只搜索某一类机会，还是轮询多类机会。
export interface ScreeningOpportunityTypeConfig {
  mode: "single" | "all";
  singleSubscriptionId?: string;
  subscriptionIds?: string[];
}

// 初筛默认信号源配置。
// 用于控制 screening 任务默认优先使用哪些来源预设。
export interface ScreeningSourceProfileConfig {
  sourceProfileIds: string[];
}

// 场景规则：控制业务场景识别和技术推荐。
export const SCENARIO_RULES: ScenarioRule[] = [
  {
    tag: "政务导办",
    keywords: ["政务服务", "办事服务", "一网通办", "便民服务", "政务大厅"],
    technologies: ["大模型问答", "知识库检索", "流程助手"],
  },
  {
    tag: "热线工单",
    keywords: ["12345", "热线", "工单", "诉求", "派单", "回访"],
    technologies: ["智能问答", "工单辅助分派", "语音识别"],
  },
  {
    tag: "公文流转",
    keywords: ["公文", "收文", "发文", "文稿", "材料撰写", "公文流转"],
    technologies: ["大模型写作辅助", "智能校对", "知识库检索"],
  },
  {
    tag: "政策服务",
    keywords: ["政策服务", "政策兑现", "免申即享", "申报辅导", "企业服务", "政策直达"],
    technologies: ["智能问答", "政策匹配", "知识抽取"],
  },
  {
    tag: "招采评审",
    keywords: ["招标", "采购", "投标", "招采", "合规审查", "比选"],
    technologies: ["文档审查", "规则比对", "风险提示"],
    minHits: 2,
  },
  {
    tag: "合同履约",
    keywords: ["合同审核", "协议审核", "条款审查", "法务审核", "履约审查"],
    technologies: ["合同审查", "条款比对", "风险识别"],
    minHits: 1,
  },
  {
    tag: "执法巡查",
    keywords: ["行政执法", "执法监督", "非现场监管", "双随机", "执法巡查", "合规检查"],
    technologies: ["规则比对", "风险识别", "事件研判"],
    minHits: 1,
  },
  {
    tag: "城市运行",
    keywords: ["预警", "风险", "监测", "异常", "监管", "舆情", "应急"],
    technologies: ["风险识别", "事件归因", "趋势分析"],
  },
  {
    tag: "视频巡检",
    keywords: ["视频监控", "视频巡检", "摄像头", "图像识别", "视觉分析"],
    technologies: ["计算机视觉", "视频结构化", "事件识别"],
    minHits: 1,
  },
  {
    tag: "数据治理",
    keywords: ["数据治理", "数据质量", "主数据", "数据资产", "指标体系"],
    technologies: ["智能质检", "语义建模", "自动归类"],
  },
];

// 成熟度信号：控制“这条线索离真实机会有多近”。
// high / medium / policy 的命中数量会直接影响成熟度评分。
export const MATURITY_SIGNALS = {
  high: [
    "采购公告",
    "招标公告",
    "竞争性磋商",
    "中标",
    "立项",
    "项目预算",
    "实施方案",
    "采购需求",
    "采购文件",
    "服务采购",
  ],
  medium: [
    "试点",
    "建设方案",
    "专项行动",
    "能力提升",
    "平台建设",
    "升级改造",
    "运行维护",
    "升级维护",
    "知识库维护",
    "热线平台升级",
    "智能客服",
    "智能质检",
    "工单分拨",
    "工单分派",
  ],
  policy: ["通知", "意见", "专项资金", "政策支持", "行动计划", "工作要点"],
};

// 阶段识别规则：控制线索会被判成“招标中、合同签订、政策信号”等哪一种阶段。
export const STAGE_PATTERNS: Array<{
  stage: OpportunityStage;
  patterns: RegExp[];
}> = [
  {
    stage: "合同签订",
    patterns: [/合同公告/, /合同签订/, /签订合同/, /合同备案/, /合同金额/],
  },
  {
    stage: "中标后",
    patterns: [/中标/, /成交公告/, /成交结果/, /候选人公示/, /成交供应商/],
  },
  {
    stage: "招标中",
    patterns: [
      /招标公告/,
      /采购公告/,
      /竞争性磋商/,
      /比选公告/,
      /招标文件/,
      /采购需求/,
      /采购文件/,
      /服务采购/,
      /运维服务/,
      /运行维护/,
      /公开招标/,
    ],
  },
  {
    stage: "已落地",
    patterns: [/验收/, /上线运行/, /正式运行/, /投入使用/, /建成/, /落地应用/],
  },
  {
    stage: "政策信号",
    patterns: [
      /工作要点/,
      /行动计划/,
      /实施意见/,
      /通知/,
      /工作情况/,
      /政策支持/,
      /指导意见/,
    ],
  },
  {
    stage: "规划信号",
    patterns: [
      /立项/,
      /可行性研究/,
      /可研/,
      /建设方案/,
      /升级改造/,
      /采购意向/,
      /需求征集/,
      /项目建议书/,
      /预算公开/,
    ],
  },
];

// 预算识别规则：从正文里抽预算金额、项目金额、资金来源等显性信号。
export const BUDGET_PATTERNS = [
  /预算金额[:：]?\s*([0-9,.]+)\s*(万元|元|亿元)/g,
  /项目金额[:：]?\s*([0-9,.]+)\s*(万元|元|亿元)/g,
  /资金来源[:：]?\s*([^\n。；;]+)/g,
];

// 信号源预设库。
// 这里定义的是“搜索入口模板”，后续你要加新的来源类别，优先改这里。
export const SIGNAL_SOURCE_PROFILES: SearchSourceProfile[] = [
  {
    id: "bidding_announcements",
    label: "招投标公告",
    description: "聚焦采购公告、招标公告、中标公告和竞争性磋商等招采信号。",
    searchScopes: [
      "site:ccgp.gov.cn",
      "site:ggzy.gov.cn",
      "site:ggzyfw.gov.cn",
      "site:ggzyjypt.gov.cn",
    ],
    // 这些是常见的招采文档类型，方便后续按结果类型做进一步筛选。
    documentTypes: [
      "采购公告",
      "招标公告",
      "中标公告",
      "竞争性磋商",
      "公开招标",
    ],
    includeDomains: [
      "ccgp.gov.cn",
      "ggzy.gov.cn",
      "ggzyfw.gov.cn",
      "ggzyjypt.gov.cn",
    ],
  },
  {
    id: "government_portals",
    label: "政府官网",
    description: "覆盖各级政府及部门官网，适合抓政策、通知、工作动态。",
    searchScopes: ["site:.gov.cn"],
    documentTypes: ["政策文件", "通知公告", "工作动态"],
    includeDomains: [],
    queryHints: [
      "采购意向",
      "需求征集",
      "建设方案",
      "升级改造",
      "立项",
      "项目",
    ],
  },
  {
    id: "procurement_portals",
    label: "政府采购网",
    description: "覆盖政府采购类官网，适合抓采购公告、中标公告、采购意向。",
    searchScopes: ["site:ccgp.gov.cn", "site:ccgp-*.gov.cn"],
    documentTypes: ["采购公告", "中标公告", "采购意向"],
    includeDomains: ["ccgp.gov.cn"],
    queryHints: [
      "采购公告",
      "采购意向",
      "采购需求",
      "公开招标",
      "竞争性磋商",
      "服务采购",
    ],
  },
  {
    id: "trading_platforms",
    label: "公共资源交易平台",
    description: "覆盖公共资源交易与交易服务平台，适合抓招标公告、成交结果。",
    searchScopes: [
      "site:ggzy.gov.cn",
      "site:ggzyfw.gov.cn",
      "site:ggzyjypt.gov.cn",
    ],
    documentTypes: ["招标公告", "成交结果", "更正公告"],
    includeDomains: ["ggzy.gov.cn", "ggzyfw.gov.cn", "ggzyjypt.gov.cn"],
    queryHints: [
      "招标公告",
      "交易公告",
      "成交结果",
      "更正公告",
      "建设项目",
      "服务项目",
    ],
  },
  {
    id: "official_mixed",
    label: "政务招采混合源",
    description: "政府官网、政府采购和公共资源交易平台的组合预设。",
    searchScopes: [
      "site:.gov.cn",
      "site:ccgp.gov.cn",
      "site:ggzy.gov.cn",
      "site:ggzyfw.gov.cn",
      "site:ggzyjypt.gov.cn",
    ],
    documentTypes: ["政策文件", "采购公告", "招标公告", "中标公告"],
    includeDomains: [
      "ccgp.gov.cn",
      "ggzy.gov.cn",
      "ggzyfw.gov.cn",
      "ggzyjypt.gov.cn",
    ],
    queryHints: [
      "采购意向",
      "采购公告",
      "招标公告",
      "需求征集",
      "建设方案",
      "升级改造",
    ],
  },
  {
    id: "enterprise_news",
    label: "企业新闻",
    description: "聚焦企业官网新闻中心、公司动态、集团新闻等企业自有发布渠道。",
    // 企业新闻目前没有统一域名白名单，因此这里只表达结果类型，不强加 site 限定。
    searchScopes: [],
    documentTypes: ["企业新闻", "公司新闻", "集团新闻", "新闻中心"],
    includeDomains: [],
  },
  {
    id: "policy_documents",
    label: "政策文件",
    description: "聚焦通知、意见、行动计划、实施方案等政策制度类公开文件。",
    searchScopes: ["site:.gov.cn"],
    documentTypes: ["政策文件", "通知", "意见", "行动计划", "实施方案"],
    includeDomains: [],
  },
  {
    id: "industry_media",
    label: "行业媒体",
    description: "聚焦产业媒体、行业观察、专题报道等外部行业资讯源。",
    searchScopes: [],
    documentTypes: ["行业媒体", "产业观察", "专题报道", "行业动态", "深度报道"],
    includeDomains: [],
  },
];

// 关键词订阅库。
// 这里定义的是“长期关注主题”，后续如果要做订阅式搜索，主要改这里。
export const KEYWORD_SUBSCRIPTIONS: KeywordSubscription[] = [
  {
    id: "hotline_upgrade",
    label: "政务热线与工单协同",
    description: "12345 热线、工单流转、诉求处置、回访督办等相关订阅。",
    keywords: [
      "12345政务服务便民热线",
      "工单流转",
      "工单派发",
      "诉求处置",
      "回访督办",
      "热线运营",
      "接诉即办",
      "热线平台升级",
    ],
    preferredSourceProfileIds: ["official_mixed"],
  },
  {
    id: "document_office",
    label: "公文写作与流转审核",
    description: "公文拟稿、收发文流转、材料审核、督办归档等相关订阅。",
    keywords: [
      "公文写作",
      "公文流转",
      "收文管理",
      "发文管理",
      "材料审核",
      "督办督查",
      "档案归集",
      "办文效率",
    ],
    preferredSourceProfileIds: ["government_portals", "procurement_portals"],
  },
  {
    id: "service_knowledge",
    label: "政策服务与惠企申报",
    description: "惠企政策兑现、政策匹配、申报辅导、免申即享等相关订阅。",
    keywords: [
      "惠企政策",
      "政策兑现",
      "免申即享",
      "政策匹配",
      "申报辅导",
      "企业服务",
      "政策直达",
      "专项资金申报",
    ],
    preferredSourceProfileIds: ["government_portals", "policy_documents", "official_mixed"],
  },
  {
    id: "smart_approval",
    label: "政务导办与审批协同",
    description: "一网通办、智能导办、帮办代办、审批协同等相关订阅。",
    keywords: [
      "一网通办",
      "智能导办",
      "帮办代办",
      "审批协同",
      "审批提速",
      "事项梳理",
      "办事指南",
      "政务大厅",
    ],
    preferredSourceProfileIds: ["government_portals", "official_mixed"],
  },
  {
    id: "bidding_compliance",
    label: "招采评审与合规审查",
    description: "招标评审、采购文件审查、电子招投标、围串标识别等相关订阅。",
    keywords: [
      "招标评审",
      "采购文件审查",
      "电子招投标",
      "合规审查",
      "围串标识别",
      "专家评审",
      "投标文件",
      "评标辅助",
    ],
    preferredSourceProfileIds: ["procurement_portals", "trading_platforms"],
  },
  {
    id: "contract_review",
    label: "合同审核与履约监管",
    description: "合同起草审核、条款比对、履约监管、付款验收等相关订阅。",
    keywords: [
      "合同审核",
      "条款比对",
      "履约监管",
      "付款审核",
      "验收管理",
      "协议审查",
      "风险条款",
      "合同管理",
    ],
    preferredSourceProfileIds: ["government_portals", "procurement_portals"],
  },
  {
    id: "service_quality",
    label: "执法检查与合规巡查",
    description: "行政执法、非现场监管、双随机巡查、合规检查等相关订阅。",
    keywords: [
      "行政执法",
      "执法监督",
      "非现场监管",
      "双随机一公开",
      "执法巡查",
      "合规检查",
      "智能监管",
      "风险巡查",
    ],
    preferredSourceProfileIds: ["government_portals", "policy_documents", "official_mixed"],
  },
  {
    id: "risk_monitoring",
    label: "城市运行监测与风险预警",
    description: "城市运行、应急值守、风险监测、舆情联动等相关订阅。",
    keywords: [
      "城市运行",
      "风险预警",
      "应急值守",
      "态势感知",
      "异常监测",
      "舆情联动",
      "事件研判",
      "监管预警",
    ],
    preferredSourceProfileIds: ["government_portals", "policy_documents", "industry_media"],
  },
  {
    id: "video_governance",
    label: "视频巡检与事件处置",
    description: "视频巡检、事件识别、告警联动、处置闭环等相关订阅。",
    keywords: [
      "视频巡检",
      "事件识别",
      "告警联动",
      "处置闭环",
      "视频监控",
      "智能摄像头",
      "视觉分析",
      "视频结构化",
    ],
    preferredSourceProfileIds: ["government_portals", "procurement_portals", "trading_platforms"],
  },
  {
    id: "data_governance",
    label: "数据治理与指标运营",
    description: "数据治理、数据质量、主数据、指标体系、数据资产等相关订阅。",
    keywords: [
      "数据治理",
      "主数据",
      "指标管理",
      "数据资产",
      "数据目录",
      "数据标准",
      "数据质量",
      "指标运营",
    ],
    preferredSourceProfileIds: ["government_portals", "policy_documents", "enterprise_news"],
  },
];

// 初筛机会类型配置。
// `single`: 只围绕 singleSubscriptionId 对应的机会类型执行初筛。
// `all`: 按 subscriptionIds 逐类轮询；若未显式填写，则默认轮询全部订阅类型。
export const SCREENING_OPPORTUNITY_TYPE_CONFIG: ScreeningOpportunityTypeConfig =
  {
    mode: "all",
    singleSubscriptionId: "hotline_upgrade",
    subscriptionIds: [
      "hotline_upgrade",
      "document_office",
      "service_knowledge",
      "smart_approval",
      "bidding_compliance",
      "contract_review",
      "service_quality",
      "risk_monitoring",
      "video_governance",
      "data_governance"
    ],
  };

// 初筛默认信号源配置。
// 这些来源会作为当前 screening 的默认搜索来源预设。
export const SCREENING_SOURCE_PROFILE_CONFIG: ScreeningSourceProfileConfig = {
  sourceProfileIds: [
    "bidding_announcements",
    "procurement_portals",
    "official_mixed",
    "policy_documents",
    "industry_media",
    "enterprise_news",
    "trading_platforms",
    "government_portals"
  ],
};

// 初筛默认补充关键词。
// 这些词会作为当前 screening 的 extra_keywords 候选补充给 search_web。
export const SCREENING_EXTRA_KEYWORDS: string[] = [];

const SEARCH_QUERY_ANCHOR_KEYWORDS = [
  "12345",
  "便民热线",
  "热线",
  "接诉即办",
  "热线平台",
];
const STRONG_SEARCH_QUERY_ANCHOR_TERMS = [
  "12345",
  "12345热线",
  "政务服务便民热线",
  "12345政务服务便民热线",
  "接诉即办",
];
const SEARCH_QUERY_EXECUTION_KEYWORDS = [
  "采购公告",
  "招标公告",
  "采购需求",
  "服务采购",
  "运维服务",
  "运行维护",
  "采购意向",
  "需求征集",
  "建设方案",
  "升级改造",
  "立项",
];
const GENERIC_GOVERNMENT_QUERY_TOKENS = [
  "采购意向",
  "需求征集",
  "建设方案",
  "升级改造",
  "立项",
  "服务项目",
  "平台建设",
  "项目建设",
];
const GENERIC_PROCUREMENT_QUERY_TOKENS = [
  "采购公告",
  "招标公告",
  "采购需求",
  "公开招标",
  "竞争性磋商",
  "服务采购",
  "运维服务",
  "运行维护",
];

const SUBSCRIPTION_INTENT_TERMS: Record<
  string,
  { procurement: string[]; government: string[] }
> = {
  hotline_upgrade: {
    procurement: ["运营服务", "热线平台", "坐席服务", "服务采购"],
    government: ["工作方案", "实施方案", "接诉即办", "热线升级"],
  },
  document_office: {
    procurement: ["公文系统", "办文系统", "档案系统", "服务采购"],
    government: ["工作方案", "实施方案", "公文处理", "办文流程"],
  },
  service_knowledge: {
    procurement: ["政策服务", "申报服务", "兑现平台", "服务采购"],
    government: ["服务清单", "实施细则", "申报通知", "兑现方案"],
  },
  smart_approval: {
    procurement: ["一网通办", "导办服务", "审批系统", "服务采购"],
    government: ["办事指南", "实施方案", "事项梳理", "审批流程"],
  },
  bidding_compliance: {
    procurement: ["评标辅助", "电子招投标", "合规审查", "服务采购"],
    government: ["实施意见", "监管方案", "建设方案", "试点方案"],
  },
  contract_review: {
    procurement: ["合同管理", "履约监管", "条款审核", "服务采购"],
    government: ["管理办法", "监管方案", "履约检查", "实施方案"],
  },
  service_quality: {
    procurement: ["执法监督平台", "非现场监管", "双随机", "服务采购"],
    government: ["执法检查", "监管方案", "行动计划", "实施意见"],
  },
  risk_monitoring: {
    procurement: ["监测预警平台", "态势感知", "应急指挥", "服务采购"],
    government: ["监测预警", "工作方案", "应急值守", "实施方案"],
  },
  video_governance: {
    procurement: ["视频巡检", "事件识别", "视觉分析", "服务采购"],
    government: ["治理方案", "工作方案", "建设方案", "实施方案"],
  },
  data_governance: {
    procurement: ["数据治理", "主数据", "指标管理", "服务采购"],
    government: ["数据治理", "工作方案", "管理办法", "数据目录"],
  },
};

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function hasProcurementLikeProfiles(profileIds: string[]): boolean {
  return (
    profileIds.includes("procurement_portals") ||
    profileIds.includes("trading_platforms") ||
    profileIds.includes("bidding_announcements") ||
    profileIds.includes("official_mixed")
  );
}

function hasGovernmentOnlyProfiles(profileIds: string[]): boolean {
  return (
    !hasProcurementLikeProfiles(profileIds) &&
    (profileIds.includes("government_portals") ||
      profileIds.includes("policy_documents"))
  );
}

function stripGenericIntentTokens(
  baseQuery: string,
  blockedTokens: string[],
): string {
  const normalized = normalizeQueryText(baseQuery);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return normalized;

  const filtered = tokens.filter(
    (token) =>
      !blockedTokens.some(
        (blocked) => token === blocked || token.includes(blocked),
      ),
  );

  return filtered.length > 0 ? filtered.join(" ") : normalized;
}

function normalizeBaseQueryForProfiles(
  baseQuery: string,
  profileIds: string[],
): string {
  const normalized = normalizeQueryText(baseQuery);
  if (!normalized) return "";

  if (hasGovernmentOnlyProfiles(profileIds)) {
    return stripGenericIntentTokens(normalized, GENERIC_GOVERNMENT_QUERY_TOKENS);
  }

  if (hasProcurementLikeProfiles(profileIds)) {
    return stripGenericIntentTokens(normalized, GENERIC_PROCUREMENT_QUERY_TOKENS);
  }

  return normalized;
}

function pickSourceIntentTerms(
  baseQuery: string,
  profileIds: string[],
  subscriptionId?: string,
  offset = 0,
  limit = 2,
): string[] {
  const scenarioTerms = subscriptionId
    ? SUBSCRIPTION_INTENT_TERMS[subscriptionId]
    : undefined;
  const procurementTerms = scenarioTerms?.procurement || [
    "采购公告",
    "招标公告",
    "采购需求",
    "运维服务",
  ];
  const governmentTerms = scenarioTerms?.government || [
    "采购意向",
    "需求征集",
    "建设方案",
    "升级改造",
  ];
  const candidates = hasProcurementLikeProfiles(profileIds)
    ? procurementTerms
    : hasGovernmentOnlyProfiles(profileIds)
      ? governmentTerms
      : [];

  return candidates
    .filter((item) => !baseQuery.includes(item.toLowerCase()))
    .slice(offset, offset + limit);
}

function pickSubscriptionBoostTerms(
  baseQuery: string,
  subscriptionId?: string,
  profileIds: string[] = [],
): string[] {
  if (subscriptionId !== "hotline_upgrade") return [];
  const hasProcurementLike =
    profileIds.includes("procurement_portals") ||
    profileIds.includes("trading_platforms") ||
    profileIds.includes("bidding_announcements") ||
    profileIds.includes("official_mixed");
  const parts: string[] = [];

  if (hasProcurementLike && !baseQuery.includes("政务服务便民热线")) {
    parts.push("政务服务便民热线");
  }

  if (!includesAnyKeyword(baseQuery, SEARCH_QUERY_ANCHOR_KEYWORDS)) {
    parts.push("12345");
  }

  return parts.slice(0, 2);
}

function pickSubscriptionKeywordTerms(
  baseQuery: string,
  subscriptionId?: string,
  offset = 0,
  limit = 2,
): string[] {
  const subscription = subscriptionId
    ? getKeywordSubscription(subscriptionId)
    : undefined;
  if (!subscription) return [];

  return subscription.keywords
    .map((item) => normalizeQueryText(item))
    .filter(Boolean)
    .filter((item) => !baseQuery.includes(item))
    .slice(offset, offset + limit);
}

function pickExtraIntentTerms(baseQuery: string, items: string[]): string[] {
  return items
    .map((item) => normalizeQueryText(item))
    .filter(Boolean)
    .filter((item) => !baseQuery.includes(item))
    .filter(
      (item) =>
        STRONG_SEARCH_QUERY_ANCHOR_TERMS.some((term) =>
          item.includes(term.toLowerCase()),
        ) || includesAnyKeyword(item, SEARCH_QUERY_EXECUTION_KEYWORDS),
    )
    .slice(0, 2);
}

function shouldUseGovernmentSiteScope(profileIds: string[]): boolean {
  return (
    profileIds.includes("government_portals") ||
    profileIds.includes("policy_documents") ||
    profileIds.includes("official_mixed")
  );
}

// 通过 id 获取单个信号源预设。
export function getSignalSourceProfile(
  id: string,
): SearchSourceProfile | undefined {
  return SIGNAL_SOURCE_PROFILES.find((item) => item.id === id);
}

// 通过 id 获取单个关键词订阅。
export function getKeywordSubscription(
  id: string,
): KeywordSubscription | undefined {
  return KEYWORD_SUBSCRIPTIONS.find((item) => item.id === id);
}

export interface ScreeningTopicExecutionPlan {
  subscriptionId: string;
  label: string;
  keywords: string[];
  sourceProfileIds: string[];
  sourceLabels: string[];
}

const SOURCE_PROFILE_PRIORITY = [
  "procurement_portals",
  "trading_platforms",
  "bidding_announcements",
  "government_portals",
  "policy_documents",
  "official_mixed",
  "industry_media",
  "enterprise_news",
];

const PROCUREMENT_ORIENTED_SOURCE_IDS = [
  "procurement_portals",
  "trading_platforms",
  "bidding_announcements",
];

const GOVERNMENT_ORIENTED_SOURCE_IDS = [
  "government_portals",
  "policy_documents",
];

const MIXED_SOURCE_EXPANSIONS: Record<string, string[]> = {
  official_mixed: [
    "procurement_portals",
    "trading_platforms",
    "bidding_announcements",
    "government_portals",
  ],
};

const PROCUREMENT_INTENT_TERMS = [
  "采购公告",
  "招标公告",
  "采购需求",
  "公开招标",
  "竞争性磋商",
  "服务采购",
  "中标",
  "成交结果",
];

const GOVERNMENT_INTENT_TERMS = [
  "采购意向",
  "需求征集",
  "建设方案",
  "升级改造",
  "立项",
  "实施方案",
  "工作方案",
  "项目",
];

function sortSourceProfileIds(profileIds: string[]): string[] {
  return [...profileIds].sort((left, right) => {
    const leftIndex = SOURCE_PROFILE_PRIORITY.indexOf(left);
    const rightIndex = SOURCE_PROFILE_PRIORITY.indexOf(right);
    const normalizedLeftIndex = leftIndex === -1 ? SOURCE_PROFILE_PRIORITY.length : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? SOURCE_PROFILE_PRIORITY.length : rightIndex;
    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }
    return left.localeCompare(right);
  });
}

function sortSourceProfileIdsByReference(profileIds: string[], referenceProfileIds: string[]): string[] {
  if (referenceProfileIds.length === 0) {
    return sortSourceProfileIds(profileIds);
  }

  return [...profileIds].sort((left, right) => {
    const leftIndex = referenceProfileIds.indexOf(left);
    const rightIndex = referenceProfileIds.indexOf(right);
    const normalizedLeftIndex = leftIndex === -1 ? referenceProfileIds.length : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? referenceProfileIds.length : rightIndex;
    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }
    return sortSourceProfileIds([left, right])[0] === left ? -1 : 1;
  });
}

function expandSourceProfileIds(profileIds: string[]): string[] {
  return unique(
    profileIds.flatMap((profileId) => MIXED_SOURCE_EXPANSIONS[profileId] || [profileId]),
  ).filter((profileId) => !!getSignalSourceProfile(profileId));
}

function includesAnyTerm(text: string, terms: string[]): boolean {
  const normalized = normalizeQueryText(text).toLowerCase();
  if (!normalized) return false;
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

export function resolveSubscriptionScopedSourceProfileIds(
  profileIds: string[],
  subscriptionId?: string,
  baseQuery?: string,
): string[] {
  const configuredProfileIds = unique(
    profileIds.filter((profileId) => typeof profileId === "string" && !!getSignalSourceProfile(profileId)),
  );
  const expandedConfiguredProfileIds = expandSourceProfileIds(configuredProfileIds);
  const subscription = subscriptionId ? getKeywordSubscription(subscriptionId) : undefined;
  const preferredProfileIds = subscription
    ? expandSourceProfileIds(subscription.preferredSourceProfileIds || [])
    : [];
  const orderedPreferredProfileIds = sortSourceProfileIdsByReference(
    preferredProfileIds,
    preferredProfileIds,
  );

  let candidateProfileIds =
    preferredProfileIds.length > 0
      ? expandedConfiguredProfileIds.filter((profileId) => preferredProfileIds.includes(profileId))
      : expandedConfiguredProfileIds;

  if (candidateProfileIds.length === 0) {
    candidateProfileIds =
      expandedConfiguredProfileIds.length > 0 ? expandedConfiguredProfileIds : preferredProfileIds;
  }

  const normalizedQuery = normalizeQueryText(baseQuery || "");
  const procurementScopedProfileIds = candidateProfileIds.filter((profileId) =>
    PROCUREMENT_ORIENTED_SOURCE_IDS.includes(profileId),
  );
  const governmentScopedProfileIds = candidateProfileIds.filter((profileId) =>
    GOVERNMENT_ORIENTED_SOURCE_IDS.includes(profileId),
  );

  if (includesAnyTerm(normalizedQuery, PROCUREMENT_INTENT_TERMS) && procurementScopedProfileIds.length > 0) {
    return sortSourceProfileIdsByReference(unique(procurementScopedProfileIds), orderedPreferredProfileIds).slice(0, 2);
  }

  if (includesAnyTerm(normalizedQuery, GOVERNMENT_INTENT_TERMS) && governmentScopedProfileIds.length > 0) {
    return sortSourceProfileIdsByReference(unique(governmentScopedProfileIds), orderedPreferredProfileIds).slice(0, 2);
  }

  return sortSourceProfileIdsByReference(unique(candidateProfileIds), orderedPreferredProfileIds).slice(0, 3);
}

export function getScreeningTopicExecutionPlans(): ScreeningTopicExecutionPlan[] {
  const typeSelection = getScreeningOpportunityTypeSelection();
  const sourceSelection = getScreeningSourceProfileSelection();

  return typeSelection.subscriptionIds.map((subscriptionId) => {
    const subscription = getKeywordSubscription(subscriptionId);
    const sourceProfileIds = resolveSubscriptionScopedSourceProfileIds(
      sourceSelection.sourceProfileIds,
      subscriptionId,
    );
    return {
      subscriptionId,
      label: subscription?.label || subscriptionId,
      keywords: (subscription?.keywords || []).slice(0, 4),
      sourceProfileIds,
      sourceLabels: sourceProfileIds
        .map((sourceProfileId) => getSignalSourceProfile(sourceProfileId)?.label || sourceProfileId)
        .filter(Boolean),
    };
  });
}

export function getScreeningOpportunityTypeSelection(): {
  mode: "single" | "all";
  subscriptionIds: string[];
  labels: string[];
} {
  const configuredIds =
    SCREENING_OPPORTUNITY_TYPE_CONFIG.mode === "single"
      ? [SCREENING_OPPORTUNITY_TYPE_CONFIG.singleSubscriptionId || ""]
      : SCREENING_OPPORTUNITY_TYPE_CONFIG.subscriptionIds &&
          SCREENING_OPPORTUNITY_TYPE_CONFIG.subscriptionIds.length > 0
        ? SCREENING_OPPORTUNITY_TYPE_CONFIG.subscriptionIds
        : KEYWORD_SUBSCRIPTIONS.map((item) => item.id);

  const subscriptionIds = unique(
    configuredIds.filter(
      (id) => typeof id === "string" && !!getKeywordSubscription(id),
    ),
  );
  const fallbackIds =
    KEYWORD_SUBSCRIPTIONS.length > 0 ? [KEYWORD_SUBSCRIPTIONS[0].id] : [];
  const resolvedIds =
    subscriptionIds.length > 0 ? subscriptionIds : fallbackIds;

  return {
    mode: SCREENING_OPPORTUNITY_TYPE_CONFIG.mode,
    subscriptionIds: resolvedIds,
    labels: resolvedIds
      .map((id) => getKeywordSubscription(id)?.label || id)
      .filter(Boolean),
  };
}

export function getScreeningSourceProfileSelection(): {
  sourceProfileIds: string[];
  labels: string[];
} {
  const sourceProfileIds = unique(
    (SCREENING_SOURCE_PROFILE_CONFIG.sourceProfileIds || []).filter(
      (id) => typeof id === "string" && !!getSignalSourceProfile(id),
    ),
  );

  return {
    sourceProfileIds,
    labels: sourceProfileIds
      .map((id) => getSignalSourceProfile(id)?.label || id)
      .filter(Boolean),
  };
}

export function getScreeningExtraKeywords(): string[] {
  return unique(
    (SCREENING_EXTRA_KEYWORDS || [])
      .map((item) => normalizeQueryText(item))
      .filter(Boolean),
  );
}

function assembleQuery(parts: string[]): string {
  return unique(parts.filter(Boolean)).join(" ");
}

// 合并多个信号源预设。
// 这个函数的作用是把多个 profile 的搜索范围、文档类型和域名白名单聚合到一起。
export function mergeSourceProfiles(profileIds: string[]): {
  resolvedProfileIds: string[];
  searchScopes: string[];
  documentTypes: string[];
  includeDomains: string[];
  excludeDomains: string[];
  queryHints: string[];
} {
  const profiles = profileIds
    .map((id) => getSignalSourceProfile(id))
    .filter((item): item is SearchSourceProfile => !!item);

  return {
    resolvedProfileIds: profiles.map((item) => item.id),
    // 搜索作用域会直接参与 query 拼装。
    searchScopes: unique(profiles.flatMap((item) => item.searchScopes)).slice(
      0,
      6,
    ),
    // 文档类型目前主要回传给上层，表示“本轮理论上想搜哪类文档”。
    documentTypes: unique(
      profiles.flatMap((item) => item.documentTypes || []),
    ).slice(0, 12),
    includeDomains: unique(
      profiles.flatMap((item) => item.includeDomains),
    ).slice(0, 12),
    excludeDomains: unique(
      profiles.flatMap((item) => item.excludeDomains || []),
    ).slice(0, 12),
    queryHints: unique(profiles.flatMap((item) => item.queryHints || [])).slice(
      0,
      8,
    ),
  };
}

// 构造最终搜索 query。
// 拼装顺序是：
// 1. 用户传入的 baseQuery
// 2. 关键词订阅
// 3. 临时追加关键词
// 4. 信号源限定作用域（site:xxx）
export function buildSearchQuery(input: {
  baseQuery: string;
  sourceProfileIds?: string[];
  subscriptionId?: string;
  extraKeywords?: string[];
}): {
  finalQuery: string;
  alternativeQueries: string[];
  resolvedProfileIds: string[];
  documentTypes: string[];
  subscriptionLabel: string | null;
  queryHints: string[];
} {
  const scopedSourceProfileIds = resolveSubscriptionScopedSourceProfileIds(
    input.sourceProfileIds || [],
    input.subscriptionId,
    input.baseQuery,
  );
  const sourceProfiles = mergeSourceProfiles(scopedSourceProfileIds);
  const subscription = input.subscriptionId
    ? getKeywordSubscription(input.subscriptionId)
    : undefined;
  const normalizedBaseQuery = normalizeQueryText(input.baseQuery);
  const normalizedCoreQuery =
    normalizeBaseQueryForProfiles(
      normalizedBaseQuery,
      sourceProfiles.resolvedProfileIds,
    ) || normalizedBaseQuery;
  const selectedSubscriptionBoostTerms = pickSubscriptionBoostTerms(
    normalizedCoreQuery,
    input.subscriptionId,
    sourceProfiles.resolvedProfileIds,
  );
  const selectedSubscriptionKeywordTerms = pickSubscriptionKeywordTerms(
    normalizedCoreQuery,
    input.subscriptionId,
  );
  const selectedSourceIntentTerms = pickSourceIntentTerms(
    normalizedCoreQuery,
    sourceProfiles.resolvedProfileIds,
    input.subscriptionId,
  );
  const selectedExtraKeywords = pickExtraIntentTerms(
    normalizedCoreQuery,
    input.extraKeywords || [],
  );
  const fallbackSubscriptionKeywordTerms = pickSubscriptionKeywordTerms(
    normalizedCoreQuery,
    input.subscriptionId,
    2,
    2,
  );
  const fallbackSourceIntentTerms = pickSourceIntentTerms(
    normalizedCoreQuery,
    sourceProfiles.resolvedProfileIds,
    input.subscriptionId,
    2,
    2,
  );
  const selectedSearchScopes = shouldUseGovernmentSiteScope(
    sourceProfiles.resolvedProfileIds,
  )
    ? ["site:.gov.cn"]
    : [];
  const primaryQuery = assembleQuery([
    normalizedCoreQuery,
    ...selectedSubscriptionBoostTerms,
    ...selectedSubscriptionKeywordTerms,
    ...selectedSourceIntentTerms,
    ...selectedExtraKeywords,
    ...selectedSearchScopes,
  ]);
  const fallbackQuery = assembleQuery([
    normalizedCoreQuery,
    ...selectedSubscriptionBoostTerms,
    ...(fallbackSubscriptionKeywordTerms.length > 0
      ? fallbackSubscriptionKeywordTerms
      : selectedSubscriptionKeywordTerms.slice(0, 1)),
    ...(fallbackSourceIntentTerms.length > 0
      ? fallbackSourceIntentTerms
      : selectedSourceIntentTerms.slice(0, 1)),
    ...selectedSearchScopes,
  ]);
  const compactFallbackQuery = assembleQuery([
    normalizedCoreQuery,
    ...selectedSubscriptionBoostTerms.slice(0, 1),
    ...selectedSubscriptionKeywordTerms.slice(0, 1),
    ...selectedSourceIntentTerms.slice(0, 1),
    ...selectedSearchScopes,
  ]);
  const alternativeQueries = unique(
    [fallbackQuery, compactFallbackQuery].filter(
      (item) => !!item && item !== primaryQuery,
    ),
  );

  return {
    finalQuery: primaryQuery,
    alternativeQueries,
    resolvedProfileIds: sourceProfiles.resolvedProfileIds,
    // 把文档类型一并返回，方便调用方知道当前预设的“内容意图”。
    documentTypes: sourceProfiles.documentTypes,
    subscriptionLabel: subscription?.label || null,
    queryHints: sourceProfiles.queryHints,
  };
}

function normalizeQueryText(value: string): string {
  const text = value
    .replace(/\b(?:site:[^\s]+|OR|AND)\b/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const blockedTokens = [
    "检索",
    "搜索",
    "热线百科",
    "样板",
    "经验做法",
    "典型案例",
    "媒体聚焦",
    "chinabidding.com",
  ];

  const filtered = text
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !blockedTokens.some((blocked) =>
          token.toLowerCase().includes(blocked.toLowerCase()),
        ),
    );

  return unique(filtered).join(" ").trim().toLowerCase();
}
