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

// 场景规则：控制业务场景识别和技术推荐。
export const SCENARIO_RULES: ScenarioRule[] = [
  {
    tag: "政务服务",
    keywords: ["政务服务", "办事服务", "一网通办", "便民服务", "政务大厅"],
    technologies: ["大模型问答", "知识库检索", "流程助手"],
  },
  {
    tag: "热线服务",
    keywords: ["12345", "热线", "工单", "诉求", "派单", "回访"],
    technologies: ["智能问答", "工单辅助分派", "语音识别"],
  },
  {
    tag: "公文处理",
    keywords: ["公文", "收文", "发文", "文稿", "材料撰写", "公文流转"],
    technologies: ["大模型写作辅助", "智能校对", "知识库检索"],
  },
  {
    tag: "知识管理",
    keywords: ["知识库", "知识管理", "资料库", "制度库", "文档中心"],
    technologies: ["RAG", "智能问答", "知识抽取"],
  },
  {
    tag: "招采合规",
    keywords: ["招标", "采购", "投标", "招采", "合规审查", "比选"],
    technologies: ["文档审查", "规则比对", "风险提示"],
    minHits: 2,
  },
  {
    tag: "合同审核",
    keywords: ["合同审核", "协议审核", "条款审查", "法务审核", "履约审查"],
    technologies: ["合同审查", "条款比对", "风险识别"],
    minHits: 1,
  },
  {
    tag: "客服质检",
    keywords: ["客服质检", "质检", "通话录音", "服务评价", "话术质检"],
    technologies: ["语音识别", "质检分析", "话术辅助"],
    minHits: 1,
  },
  {
    tag: "风险预警",
    keywords: ["预警", "风险", "监测", "异常", "监管", "舆情"],
    technologies: ["风险识别", "事件归因", "趋势分析"],
  },
  {
    tag: "视频治理",
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
    label: "政务热线智能化",
    description: "12345 热线、热线平台、智能客服、工单分派等相关订阅。",
    keywords: [
      "12345政务服务便民热线",
      "热线平台升级",
      "智能客服",
      "智能质检",
      "智能派单",
      "知识库",
      "采购意向",
      "运行维护",
    ],
    preferredSourceProfileIds: ["official_mixed"],
  },
  {
    id: "document_office",
    label: "公文办公智能化",
    description: "公文处理、材料写作、知识库与辅助审核等相关订阅。",
    keywords: [
      "公文",
      "发文",
      "收文",
      "材料撰写",
      "智能校对",
      "知识库",
      "大模型",
    ],
    preferredSourceProfileIds: ["government_portals", "procurement_portals"],
  },
  {
    id: "service_knowledge",
    label: "政务知识与问答",
    description: "知识库、问答助手、咨询导办、智能体相关订阅。",
    keywords: [
      "知识库",
      "问答",
      "咨询导办",
      "智能体",
      "智能问答",
      "RAG",
      "语义检索",
    ],
    preferredSourceProfileIds: ["government_portals", "official_mixed"],
  },
];

// 初筛机会类型配置。
// `single`: 只围绕 singleSubscriptionId 对应的机会类型执行初筛。
// `all`: 按 subscriptionIds 逐类轮询；若未显式填写，则默认轮询全部订阅类型。
export const SCREENING_OPPORTUNITY_TYPE_CONFIG: ScreeningOpportunityTypeConfig =
  {
    mode: "all",
    singleSubscriptionId: "hotline_upgrade",
  };

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

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function pickSourceIntentTerms(
  baseQuery: string,
  profileIds: string[],
): string[] {
  const hasProcurementLike =
    profileIds.includes("procurement_portals") ||
    profileIds.includes("trading_platforms") ||
    profileIds.includes("bidding_announcements") ||
    profileIds.includes("official_mixed");
  const hasGovernmentOnly =
    !hasProcurementLike &&
    (profileIds.includes("government_portals") ||
      profileIds.includes("policy_documents"));

  const procurementTerms = ["采购公告", "招标公告", "采购需求", "运维服务"];
  const governmentTerms = ["采购意向", "需求征集", "建设方案", "升级改造"];
  const candidates = hasProcurementLike
    ? procurementTerms
    : hasGovernmentOnly
      ? governmentTerms
      : [];

  return candidates
    .filter((item) => !baseQuery.includes(item.toLowerCase()))
    .slice(0, 1);
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
  resolvedProfileIds: string[];
  documentTypes: string[];
  subscriptionLabel: string | null;
  queryHints: string[];
} {
  const sourceProfiles = mergeSourceProfiles(input.sourceProfileIds || []);
  const subscription = input.subscriptionId
    ? getKeywordSubscription(input.subscriptionId)
    : undefined;
  const normalizedBaseQuery = normalizeQueryText(input.baseQuery);
  const selectedSubscriptionBoostTerms = pickSubscriptionBoostTerms(
    normalizedBaseQuery,
    input.subscriptionId,
    sourceProfiles.resolvedProfileIds,
  );
  const selectedSourceIntentTerms = pickSourceIntentTerms(
    normalizedBaseQuery,
    sourceProfiles.resolvedProfileIds,
  );
  const selectedExtraKeywords = pickExtraIntentTerms(
    normalizedBaseQuery,
    input.extraKeywords || [],
  );
  const selectedSearchScopes = shouldUseGovernmentSiteScope(
    sourceProfiles.resolvedProfileIds,
  )
    ? ["site:.gov.cn"]
    : [];
  const parts = [
    normalizedBaseQuery,
    ...selectedSubscriptionBoostTerms,
    ...selectedSourceIntentTerms,
    ...selectedExtraKeywords,
    ...selectedSearchScopes,
  ].filter(Boolean);

  return {
    finalQuery: unique(parts).join(" "),
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
