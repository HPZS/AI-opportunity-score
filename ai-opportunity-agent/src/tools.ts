import type Anthropic from "@anthropic-ai/sdk";
import { createRequire } from "module";
import {
  BUDGET_PATTERNS,
  buildSearchQuery,
  getKeywordSubscription,
  MATURITY_SIGNALS,
  mergeSourceProfiles,
  SCENARIO_RULES,
  STAGE_PATTERNS,
  type OpportunityStage,
  type ScenarioRule,
} from "./config/signal-config.js";
import { getEnvVar, loadEnvFile } from "./env.js";
import { loadRuntimeOverrides } from "./self-healing.js";

loadEnvFile();

const require = createRequire(import.meta.url);
const parsePdf = require("pdf-parse/lib/pdf-parse.js") as (data: Buffer) => Promise<{
  numpages?: number;
  text?: string;
  info?: Record<string, unknown>;
  metadata?: unknown;
}>;

export type PermissionMode = "default" | "plan" | "acceptEdits" | "bypassPermissions" | "dontAsk";
export type ToolDef = Anthropic.Tool;

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "ai-opportunity-agent/0.1",
};

type JsonObject = Record<string, unknown>;

type LeadCategory = "current_opportunity" | "historical_case" | "policy_signal";
type PoolEntryTier = "优先跟进" | "观察入池" | "信号跟踪" | "不入池";
type OpportunitySignalClass = "明确招采" | "前置信号" | "方向信号" | "参考线索";
type PublishTimeSource = "explicit" | "body" | "pdf_body_unverified" | "unknown";

export const toolDefinitions: ToolDef[] = [
  {
    name: "search_web",
    description: "使用 Tavily Search 检索公开网页，返回候选线索列表。",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "检索关键词或检索表达式" },
        max_results: { type: "number", description: "返回结果数，默认 5" },
        topic: { type: "string", description: "检索主题，例如 general 或 news" },
        time_window_days: {
          type: "number",
          description: "显式指定时间窗天数，例如 30。未传时会尝试从 query 中推断。",
        },
        source_profile_ids: {
          type: "array",
          items: { type: "string" },
          description: "信号源预设 ID 列表，例如 government_portals、procurement_portals、trading_platforms、official_mixed",
        },
        subscription_id: {
          type: "string",
          description: "关键词订阅预设 ID，例如 hotline_upgrade、document_office、service_knowledge",
        },
        extra_keywords: {
          type: "array",
          items: { type: "string" },
          description: "追加检索关键词，用于细化某次搜索",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "限定检索域名列表",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "排除域名列表",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description: "抓取指定网页正文并提取基础元信息。",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "目标网页地址" },
        timeout_ms: { type: "number", description: "抓取超时，默认 15000 毫秒" },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_signal",
    description: "从标题、摘要和正文中提取发布时间、预算、场景标签、来源类型等结构化信号。",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "线索标题" },
        url: { type: "string", description: "原始链接" },
        source_name: { type: "string", description: "来源名称" },
        source_domain: { type: "string", description: "来源域名" },
        summary: { type: "string", description: "摘要" },
        content: { type: "string", description: "正文内容" },
        publish_time: { type: "string", description: "已知发布时间，可选" },
        publish_time_raw: { type: "string", description: "已知发布时间原始文本，可选" },
        publish_time_confidence: { type: "number", description: "发布时间可信度，可选" },
        is_pdf: { type: "boolean", description: "是否为 PDF 抓取结果，可选" },
      },
      required: ["content"],
    },
  },
  {
    name: "screen_opportunity",
    description: "对线索执行机会初筛，输出场景标签、AI 适配度、商机成熟度和是否入池建议。",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "线索标题" },
        summary: { type: "string", description: "线索摘要" },
        content: { type: "string", description: "线索正文" },
        url: { type: "string", description: "线索原始链接，可选" },
        source_domain: { type: "string", description: "来源域名" },
        publish_time: { type: "string", description: "发布时间 ISO 字符串" },
        publish_time_raw: { type: "string", description: "发布时间原始文本，可选" },
        publish_time_confidence: { type: "number", description: "发布时间可信度，可选" },
        is_pdf: { type: "boolean", description: "是否为 PDF 抓取结果，可选" },
      },
      required: ["content"],
    },
  },
  {
    name: "deep_investigate",
    description: "对高潜线索执行深查补证据，输出同源连续性、横向案例、落地验证、政策和预算支撑。",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_title: { type: "string", description: "目标线索标题" },
        lead_summary: { type: "string", description: "目标线索摘要" },
        lead_url: { type: "string", description: "目标线索原始链接，可选" },
        source_name: { type: "string", description: "来源名称，可选" },
        source_domain: { type: "string", description: "来源域名，可选" },
        publish_time: { type: "string", description: "线索发布时间，可选" },
        source_continuity_texts: {
          type: "array",
          items: { type: "string" },
          description: "同源连续性证据文本",
        },
        source_continuity_links: {
          type: "array",
          items: { type: "string" },
          description: "同源连续性证据链接，可选",
        },
        similar_case_texts: {
          type: "array",
          items: { type: "string" },
          description: "横向同类案例文本",
        },
        similar_case_links: {
          type: "array",
          items: { type: "string" },
          description: "横向同类案例链接，可选",
        },
        landing_case_texts: {
          type: "array",
          items: { type: "string" },
          description: "落地验证证据文本",
        },
        landing_case_links: {
          type: "array",
          items: { type: "string" },
          description: "落地验证证据链接，可选",
        },
        policy_support_texts: {
          type: "array",
          items: { type: "string" },
          description: "政策支撑文本",
        },
        policy_support_links: {
          type: "array",
          items: { type: "string" },
          description: "政策支撑链接，可选",
        },
        budget_support_texts: {
          type: "array",
          items: { type: "string" },
          description: "预算或资金支撑文本，可选",
        },
        budget_support_links: {
          type: "array",
          items: { type: "string" },
          description: "预算或资金支撑链接，可选",
        },
      },
      required: ["lead_title"],
    },
  },
  {
    name: "analyze_opportunity",
    description: "输出综合分析结果；若传入 deep_analysis_score，则仅输出深查补充建议，不重算初筛主分。",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "线索标题" },
        summary: { type: "string", description: "线索摘要" },
        content: { type: "string", description: "线索正文" },
        url: { type: "string", description: "线索原始链接，可选" },
        source_domain: { type: "string", description: "来源域名，可选" },
        publish_time: { type: "string", description: "发布时间 ISO 字符串，可选" },
        publish_time_raw: { type: "string", description: "发布时间原始文本，可选" },
        publish_time_confidence: { type: "number", description: "发布时间可信度，可选" },
        is_pdf: { type: "boolean", description: "是否为 PDF 抓取结果，可选" },
        deep_analysis_score: { type: "number", description: "深查得分，可选" },
      },
      required: ["content"],
    },
  },
  {
    name: "push_result",
    description: "将结构化结果通过 HTTP POST 回传给后端服务。",
    input_schema: {
      type: "object" as const,
      properties: {
        endpoint: { type: "string", description: "后端回传地址" },
        payload: { type: "object", description: "回传 JSON 内容" },
        bearer_token: { type: "string", description: "可选 Bearer Token" },
      },
      required: ["endpoint", "payload"],
    },
  },
  {
    name: "agent",
    description: "启动子 Agent 处理独立任务。类型包括 screening、investigation、analysis。",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "子任务简要描述" },
        prompt: { type: "string", description: "子任务详细说明" },
        type: {
          type: "string",
          enum: ["screening", "investigation", "analysis"],
          description: "子 Agent 类型",
        },
      },
      required: ["description", "prompt"],
    },
  },
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const keep = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (!key.toLowerCase().startsWith("utm_")) keep.set(key, value);
    }
    parsed.search = keep.toString();
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function truncateText(text: string, limit = 6000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes(".pdf");
}

function extractPdfTitle(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !/^[-—\d\s.]+$/.test(line))
    .filter((line) => line.length >= 6);

  return lines[0] || "";
}

async function parsePdfContent(url: string, response: Response): Promise<string> {
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await parsePdf(buffer);
    const text = normalizeWhitespace(parsed.text || "");
    const title = extractPdfTitle(parsed.text || "");
    const publishInfo = extractPublishTime(parsed.text || "");

    return JSON.stringify(
      {
        url: normalizeUrl(url),
        title,
        content: truncateText(text, 12000),
        contentLength: text.length,
        isPdf: true,
        pageCount: typeof parsed.numpages === "number" ? parsed.numpages : null,
        fetchedAt: new Date().toISOString(),
        publishTimeCandidate: publishInfo.normalized,
        publishTimeRaw: publishInfo.raw,
        publishTimeConfidence: publishInfo.normalized ? 0.25 : 0,
        publishTimeSource: publishInfo.normalized ? "pdf_body_unverified" : "unknown",
        note: text
          ? "已解析 PDF 正文；正文内日期仅作为待核验候选时间。"
          : "PDF 已抓取，但未提取到有效正文。",
      },
      null,
      2
    );
  } catch (error: any) {
    return JSON.stringify(
      {
        url: normalizeUrl(url),
        title: "",
        content: "",
        contentLength: 0,
        isPdf: true,
        fetchedAt: new Date().toISOString(),
        note: "PDF 抓取成功，但正文解析失败，请保留链接并标记待补抓 PDF 内容。",
        parseError: safeString(error?.message) || "unknown pdf parse error",
      },
      null,
      2
    );
  }
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mergeStringArrays(...inputs: string[][]): string[] {
  return Array.from(new Set(inputs.flat().filter(Boolean)));
}

function buildDescription(input: {
  title?: string;
  summary?: string;
  content?: string;
  fallback?: string;
}): string {
  const summary = normalizeWhitespace(safeString(input.summary));
  if (summary) return truncateText(summary, 160);

  const fallback = normalizeWhitespace(safeString(input.fallback));
  if (fallback) return truncateText(fallback, 160);

  const content = normalizeWhitespace(safeString(input.content));
  if (content) return truncateText(content, 160);

  return truncateText(normalizeWhitespace(safeString(input.title)), 160);
}

function buildLinkItems(urls: string[], type: string, labelPrefix: string): JsonObject[] {
  const normalized = Array.from(
    new Set(
      urls
        .map((url) => normalizeUrl(safeString(url)))
        .filter((url) => /^https?:\/\//i.test(url))
    )
  );

  return normalized.map((url, index) => ({
    label: normalized.length > 1 ? `${labelPrefix}${index + 1}` : labelPrefix,
    url,
    type,
  }));
}

function flattenLinkGroups(groups: JsonObject[]): JsonObject[] {
  const seen = new Set<string>();
  const merged: JsonObject[] = [];
  for (const group of groups) {
    for (const item of Object.values(group)) {
      if (!Array.isArray(item)) continue;
      for (const link of item) {
        if (typeof link !== "object" || link === null || Array.isArray(link)) continue;
        const url = safeString((link as JsonObject).url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        merged.push(link as JsonObject);
      }
    }
  }
  return merged;
}

function buildTimelineEntries(input: {
  title?: string;
  publishTime?: string | null;
  leadUrl?: string;
  sourceContinuityTexts?: string[];
  sourceContinuityLinks?: string[];
  similarCaseTexts?: string[];
  similarCaseLinks?: string[];
  landingCaseTexts?: string[];
  landingCaseLinks?: string[];
  policySupportTexts?: string[];
  policySupportLinks?: string[];
  budgetSupportTexts?: string[];
  budgetSupportLinks?: string[];
}): JsonObject[] {
  const entries: JsonObject[] = [];
  const pushEntries = (texts: string[], links: string[], type: string, title: string) => {
    texts.forEach((text, index) => {
      const description = normalizeWhitespace(text);
      if (!description) return;
      const resolvedDate =
        extractPublishTime(description).normalized ||
        extractDateFromUrl(links[index] || "") ||
        null;
      entries.push({
        date: resolvedDate,
        type,
        title,
        description,
        sourceUrl: /^https?:\/\//i.test(links[index] || "") ? normalizeUrl(links[index]) : null,
      });
    });
  };

  if (input.publishTime) {
    entries.push({
      date: input.publishTime,
      type: "publish",
      title: "线索发布时间",
      description: `${safeString(input.title) || "该线索"} 首次公开发布时间`,
      sourceUrl: /^https?:\/\//i.test(input.leadUrl || "") ? normalizeUrl(safeString(input.leadUrl)) : null,
    });
  }

  pushEntries(input.sourceContinuityTexts || [], input.sourceContinuityLinks || [], "source_continuity", "同源连续性");
  pushEntries(input.similarCaseTexts || [], input.similarCaseLinks || [], "similar_case", "横向案例");
  pushEntries(input.landingCaseTexts || [], input.landingCaseLinks || [], "landing_case", "落地验证");
  pushEntries(input.policySupportTexts || [], input.policySupportLinks || [], "policy_support", "政策支撑");
  pushEntries(input.budgetSupportTexts || [], input.budgetSupportLinks || [], "budget_support", "预算支撑");

  return entries
    .filter((entry) => safeString(entry.description))
    .sort((a, b) => {
      const left = safeString(a.date);
      const right = safeString(b.date);
      if (!left && !right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return left.localeCompare(right);
    });
}

function buildAiValueSummary(input: {
  title?: string;
  tags: string[];
  technologies: string[];
  transformationMode: string;
}): string {
  const tagText = input.tags.length > 0 ? input.tags.join("、") : "通用业务提效";
  const techText = input.technologies.slice(0, 3).join("、") || "大模型问答、知识库检索、流程助手";
  return `${safeString(input.title) || "该机会"} 在 ${tagText} 场景下具备明确 AI 切入空间，优先可从 ${techText} 方向做 ${input.transformationMode}。`;
}

function detectSourceType(sourceDomain: string, text: string): string {
  const combined = `${sourceDomain} ${text}`.toLowerCase();
  if (combined.includes("ccgp") || combined.includes("采购") || combined.includes("招标") || combined.includes("交易中心")) {
    return "招采类";
  }
  if (combined.includes("gov") || combined.includes("通知") || combined.includes("政策") || combined.includes("工作要点")) {
    return "政策类";
  }
  return "组织动态类";
}

function detectSourceLevel(sourceDomain: string): string {
  const domain = sourceDomain.toLowerCase();
  if (domain.includes(".gov.cn") || domain.includes("ccgp") || domain.includes("ggzy")) return "A";
  if (domain.includes(".cn") || domain.includes(".com.cn")) return "B";
  return "C";
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripNegativeSignalMentions(text: string, keywords: string[]): string {
  let next = normalizeWhitespace(text).replace(
    /(?:未见|尚未|未出现|没有|缺少|待补证据[:：]?|待补|尚缺|暂无|无法确认|未获取|不能等同于)[^。；\n]{0,48}/giu,
    " "
  );
  for (const keyword of keywords) {
    const escapedKeyword = escapeRegExp(keyword);
    next = next.replace(
      new RegExp(
        `(?:未见|尚未|未出现|没有|缺少|待补证据[:：]?|待补|尚缺|暂无|无法确认|未获取|不能等同于)[^。；，,\\n]{0,24}${escapedKeyword}`,
        "giu"
      ),
      " "
    );
  }
  return next;
}

function containsPositiveKeyword(text: string, keywords: string[]): boolean {
  return containsAnyKeyword(stripNegativeSignalMentions(text, keywords), keywords);
}

function countPositiveKeywordHits(text: string, keywords: string[]): number {
  return countKeywordHits(stripNegativeSignalMentions(text, keywords), keywords);
}

const HOTLINE_ANCHOR_KEYWORDS = ["12345", "便民热线", "热线", "接诉即办", "市民服务热线", "热线平台"];
const HOTLINE_OPPORTUNITY_KEYWORDS = [
  "智能",
  "智能化",
  "升级",
  "改造",
  "采购",
  "招标",
  "公告",
  "项目",
  "预算",
  "采购意向",
  "需求征集",
  "知识库",
  "质检",
  "派单",
  "坐席",
  "回访",
  "大模型",
  "ai",
  "运维",
  "运行维护",
];
const HOTLINE_TITLE_BRIDGE_KEYWORDS = [
  "采购",
  "招标",
  "公告",
  "预算",
  "预算公开",
  "采购意向",
  "需求征集",
  "实施方案",
  "建设方案",
  "建设",
  "升级",
  "改造",
  "运维",
  "平台",
];
const HOTLINE_GENERIC_PORTAL_PATTERNS = [
  /12345政务服务便民热线$/u,
  /12345热线$/u,
  /政务服务便民热线$/u,
];
const BUDGET_DOCUMENT_KEYWORDS = [
  "预算公开",
  "单位预算公开",
  "部门预算公开",
  "部门预算",
  "单位预算",
  "政府采购支出表",
  "项目支出绩效目标表",
  "项目支出预算",
  "预算绩效目标",
  "预算表",
];
const FORMAL_ADVANCE_SIGNAL_KEYWORDS = [
  "采购意向",
  "需求征集",
  "招标公告",
  "采购公告",
  "竞争性磋商",
  "公开招标",
  "比选公告",
  "单一来源",
  "立项批复",
  "可研批复",
];
const PROJECT_BODY_SIGNAL_KEYWORDS = [
  "项目名称",
  "项目编号",
  "采购需求",
  "采购内容",
  "服务范围",
  "服务期限",
  "合同履约期限",
  "预算金额",
  "最高限价",
  "采购方式",
  "招标文件",
  "投标人",
  "招标项目",
];
const INDIRECT_PROCUREMENT_SIGNAL_KEYWORDS = [
  "招标代理",
  "代理机构",
  "代理单位",
  "代理服务",
  "遴选代理",
  "招标代理单位",
  "招标代理机构",
  "询价结果公示",
  "代理结果公示",
  "代理比选",
];
const EXECUTION_TASK_SIGNAL_KEYWORDS = [
  "建设任务",
  "重点任务",
  "场景建设",
  "能力建设",
  "系统优化升级项目",
  "升级项目建设",
  "平台建设",
  "知识库一体化",
  "热线百科",
  "问答台",
  "智能客服",
  "智能数据分析",
  "智能座席",
  "自动派单",
  "知识库推荐",
  "智能回访",
  "智能质检",
  "事件预警",
];
const GOVERNMENT_REPORT_NOISE_KEYWORDS = [
  "工作动态",
  "媒体聚焦",
  "经验做法",
  "典型案例",
  "样板",
  "观察",
  "如何做好",
  "开启新",
  "日报",
  "爱济南",
  "总客服",
  "成效",
  "做法",
  "专题报道",
];
const AI_EXPLICIT_SIGNAL_KEYWORDS = [
  "人工智能",
  "大模型",
  "智能客服",
  "智能问答",
  "智能座席",
  "智能助手",
  "语音识别",
  "语音转写",
  "知识推荐",
  "知识库",
  "ocr",
  "图像识别",
  "机器学习",
  "算法模型",
];
const AI_DATA_SIGNAL_KEYWORDS = [
  "文本",
  "语音",
  "图像",
  "视频",
  "知识库",
  "问答",
  "工单",
  "审核",
  "质检",
  "客服",
  "坐席",
  "回访",
  "派单",
  "识别",
  "分类",
  "推荐",
  "分析",
  "检索",
  "转写",
];
const BUSINESS_MODULE_SIGNAL_KEYWORDS = [
  "平台",
  "系统",
  "服务",
  "流程",
  "热线",
  "知识库",
  "审批",
  "工单",
  "质检",
  "合同",
  "公文",
  "客服",
];
const GENERIC_SEARCH_RESULT_TITLE_PATTERNS = [
  /^一[、，.．]/u,
  /^二[、，.．]/u,
  /^三[、，.．]/u,
  /^附件$/u,
  /^采购需求$/u,
  /^招标文件$/u,
  /^项目概况$/u,
  /^湖北省政府采购$/u,
  /^\d{4}\s*年度$/u,
  /^合同中的下列术语应解释为[:：]?$/u,
];
const OUTDATED_YEAR_MARGIN = 1;

function isHotlineFocusedSearch(query: string, subscriptionId: string | null | undefined): boolean {
  if (subscriptionId === "hotline_upgrade") return true;
  return containsAnyKeyword(query, HOTLINE_ANCHOR_KEYWORDS);
}

function containsBudgetDocumentSignal(text: string): boolean {
  return containsAnyKeyword(text, BUDGET_DOCUMENT_KEYWORDS);
}

function containsFormalAdvanceSignal(text: string): boolean {
  return containsPositiveKeyword(text, FORMAL_ADVANCE_SIGNAL_KEYWORDS);
}

function containsProjectBodySignal(text: string): boolean {
  return containsPositiveKeyword(text, PROJECT_BODY_SIGNAL_KEYWORDS);
}

function containsIndirectProcurementSignal(text: string): boolean {
  return containsAnyKeyword(text, INDIRECT_PROCUREMENT_SIGNAL_KEYWORDS);
}

function containsExecutionTaskSignal(text: string): boolean {
  return containsAnyKeyword(text, EXECUTION_TASK_SIGNAL_KEYWORDS);
}

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length;
}

function isHotlineRelevantSearchResult(title: string, snippet: string, url: string): boolean {
  const normalizedSnippet = normalizeWhitespace(snippet);
  const combined = normalizeWhitespace(`${title} ${normalizedSnippet} ${url}`);
  const normalizedTitle = normalizeWhitespace(title);
  const titleHasAnchor = containsAnyKeyword(normalizedTitle, HOTLINE_ANCHOR_KEYWORDS);
  const snippetHasAnchor = containsAnyKeyword(normalizedSnippet, HOTLINE_ANCHOR_KEYWORDS);
  const hasOpportunityIntent = containsAnyKeyword(combined, HOTLINE_OPPORTUNITY_KEYWORDS);
  const titleHasBridgeIntent = containsAnyKeyword(normalizedTitle, HOTLINE_TITLE_BRIDGE_KEYWORDS);
  const isGenericPortalPage = HOTLINE_GENERIC_PORTAL_PATTERNS.some((pattern) => pattern.test(normalizedTitle));

  if (!titleHasAnchor && !(snippetHasAnchor && (titleHasBridgeIntent || hasOpportunityIntent))) return false;
  if (isGenericPortalPage && !hasOpportunityIntent) return false;
  return hasOpportunityIntent;
}

function isGovernmentPortalDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return lowerDomain.endsWith(".gov.cn") && !lowerDomain.includes("ccgp") && !lowerDomain.includes("ggzy");
}

function isProcurementOrTradingDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return lowerDomain.includes("ccgp") || lowerDomain.includes("ggzy");
}

function hasSearchExecutionSignal(title: string, snippet: string, url: string): boolean {
  const combined = normalizeWhitespace(`${title} ${snippet} ${url}`);
  return (
    containsAnyKeyword(combined, FORMAL_ADVANCE_SIGNAL_KEYWORDS) ||
    containsAnyKeyword(combined, EXECUTION_TASK_SIGNAL_KEYWORDS) ||
    containsAnyKeyword(combined, HOTLINE_TITLE_BRIDGE_KEYWORDS) ||
    containsAnyKeyword(combined, HOTLINE_OPPORTUNITY_KEYWORDS)
  );
}

function isGovernmentReportNoise(title: string, snippet: string): boolean {
  const combined = normalizeWhitespace(`${title} ${snippet}`);
  return containsAnyKeyword(combined, GOVERNMENT_REPORT_NOISE_KEYWORDS);
}

function isGenericSearchResultTitle(title: string): boolean {
  const normalizedTitle = normalizeWhitespace(title);
  if (!normalizedTitle) return true;
  return GENERIC_SEARCH_RESULT_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle));
}

function hasHotlineAnchorInUrl(url: string): boolean {
  return containsAnyKeyword(url, HOTLINE_ANCHOR_KEYWORDS);
}

function extractYearMonthFromUrl(url: string): string | null {
  if (!url) return null;
  const compactYearMonth = url.match(/(?:\/|_)(20\d{2})(0[1-9]|1[0-2])(?:\/|[_-]|$)/u);
  if (compactYearMonth) {
    const [, year, month] = compactYearMonth;
    return buildIsoDate(year, month, "01");
  }

  const slashYearMonth = url.match(/\/(20\d{2})\/(\d{1,2})(?:\/|$)/u);
  if (slashYearMonth) {
    const [, year, month] = slashYearMonth;
    return buildIsoDate(year, month, "01");
  }

  return null;
}

function extractYearFromUrl(url: string): string | null {
  if (!url) return null;
  const yearMatch = url.match(/(?:\/|_|-)(20\d{2})(?:\/|_|-|$)/u);
  if (!yearMatch) return null;
  const [, year] = yearMatch;
  return buildIsoDate(year, "01", "01");
}

function extractCoarseDateSignal(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return null;

  const fullDate = extractPublishTime(normalized).normalized;
  if (fullDate) return fullDate;

  const yearMonthMatch = normalized.match(/\b(20\d{2})[-年/.](0?[1-9]|1[0-2])(?:月)?\b/u);
  if (yearMonthMatch) {
    const [, year, month] = yearMonthMatch;
    return buildIsoDate(year, month, "01");
  }

  const yearMatch = normalized.match(/\b(20\d{2})年?\b/u);
  if (yearMatch) {
    const [, year] = yearMatch;
    return buildIsoDate(year, "01", "01");
  }

  return null;
}

function isClearlyOutdatedSignal(dateText: string | null, inferredDays: number | null): boolean {
  if (!dateText || !inferredDays) return false;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const ageDays = (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > inferredDays + 30;
}

function evaluateHotlineSearchResult(input: {
  title: string;
  snippet: string;
  url: string;
  domain: string;
  publishedDate: string;
  sourceProfileIds: string[];
  hotlineFocused: boolean;
  inferredDays: number | null;
}): { keep: boolean; reason: string } {
  const { title, snippet, url, domain, publishedDate, sourceProfileIds, hotlineFocused, inferredDays } = input;
  if (hotlineFocused && !isHotlineRelevantSearchResult(title, snippet, url)) {
    return { keep: false, reason: "not_hotline_relevant" };
  }

  const hasExecutionSignal = hasSearchExecutionSignal(title, snippet, url);
  const isGovPortal = isGovernmentPortalDomain(domain);
  const isProcurementLike = isProcurementOrTradingDomain(domain);
  const isPdf = isPdfUrl(url);
  const titleOrUrlHasHotlineAnchor =
    containsAnyKeyword(title, HOTLINE_ANCHOR_KEYWORDS) || hasHotlineAnchorInUrl(url);
  const snippetHasHotlineAnchor = containsAnyKeyword(snippet, HOTLINE_ANCHOR_KEYWORDS);
  const urlDate = extractDateFromUrl(url) || extractYearMonthFromUrl(url) || extractYearFromUrl(url);
  const coarseDateSignal = extractCoarseDateSignal(`${title} ${snippet}`) || urlDate;
  const titleIsGeneric = isGenericSearchResultTitle(title);

  if (
    hotlineFocused &&
    !titleOrUrlHasHotlineAnchor &&
    !(isProcurementLike && snippetHasHotlineAnchor && containsFormalAdvanceSignal(`${title} ${snippet}`))
  ) {
    return { keep: false, reason: "missing_hotline_anchor" };
  }

  if (isGovPortal && isGovernmentReportNoise(title, snippet) && !hasExecutionSignal) {
    return { keep: false, reason: "government_report_noise" };
  }

  if (isGovPortal && sourceProfileIds.includes("government_portals") && !hasExecutionSignal) {
    return { keep: false, reason: "government_portal_without_execution_signal" };
  }

  if (
    isGovPortal &&
    titleOrUrlHasHotlineAnchor &&
    containsFormalAdvanceSignal(`${title} ${snippet}`) &&
    !publishedDate &&
    !coarseDateSignal &&
    inferredDays
  ) {
    return { keep: true, reason: "keep_government_pending_date_verification" };
  }

  if (titleIsGeneric && !hasHotlineAnchorInUrl(url) && !containsAnyKeyword(title, HOTLINE_ANCHOR_KEYWORDS)) {
    return { keep: false, reason: "generic_title_without_anchor" };
  }

  if (isProcurementLike && titleOrUrlHasHotlineAnchor && containsFormalAdvanceSignal(`${title} ${snippet}`)) {
    if (!publishedDate && !coarseDateSignal && inferredDays) {
      return { keep: true, reason: "keep_procurement_pending_date_verification" };
    }
    return { keep: true, reason: "keep_procurement_like" };
  }

  if (
    isProcurementLike &&
    snippetHasHotlineAnchor &&
    containsFormalAdvanceSignal(`${title} ${snippet}`) &&
    !publishedDate &&
    !coarseDateSignal &&
    inferredDays
  ) {
    return { keep: true, reason: "keep_procurement_snippet_pending_date_verification" };
  }

  if (containsBudgetDocumentSignal(`${title} ${snippet}`) && !containsFormalAdvanceSignal(`${title} ${snippet}`)) {
    return { keep: false, reason: "budget_without_formal_signal" };
  }

  if (inferredDays && !publishedDate && !coarseDateSignal) {
    return { keep: false, reason: "missing_date_signal" };
  }

  if (!publishedDate && isClearlyOutdatedSignal(coarseDateSignal, inferredDays)) {
    return { keep: false, reason: "clearly_outdated" };
  }

  if (
    isPdf &&
    inferredDays &&
    urlDate &&
    !publishedDate &&
    !isWithinDays(urlDate, inferredDays)
  ) {
    return { keep: false, reason: "pdf_url_date_out_of_window" };
  }

  return { keep: true, reason: "keep_default" };
}

function isAllowedBySourceProfiles(domain: string, sourceProfileIds: string[]): boolean {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase();
  const allowGovernment = sourceProfileIds.includes("government_portals") || sourceProfileIds.includes("official_mixed");
  const allowProcurement = sourceProfileIds.includes("procurement_portals") || sourceProfileIds.includes("official_mixed");
  const allowTrading = sourceProfileIds.includes("trading_platforms") || sourceProfileIds.includes("official_mixed");

  if (allowGovernment && lowerDomain.endsWith(".gov.cn")) return true;
  if (allowProcurement && lowerDomain.includes("ccgp")) return true;
  if (allowTrading && lowerDomain.includes("ggzy")) return true;

  return sourceProfileIds.length === 0;
}

function isAllowedUrlBySourceProfiles(url: string, sourceProfileIds: string[]): boolean {
  const lowerUrl = url.toLowerCase();
  if (!lowerUrl) return sourceProfileIds.length === 0;

  const allowGovernment = sourceProfileIds.includes("government_portals") || sourceProfileIds.includes("official_mixed");
  const allowProcurement = sourceProfileIds.includes("procurement_portals") || sourceProfileIds.includes("official_mixed");
  const allowTrading = sourceProfileIds.includes("trading_platforms") || sourceProfileIds.includes("official_mixed");

  if (allowGovernment && lowerUrl.includes(".gov.cn")) return true;
  if (allowProcurement && lowerUrl.includes("ccgp")) return true;
  if (allowTrading && lowerUrl.includes("ggzy")) return true;

  return sourceProfileIds.length === 0;
}

function shouldUseExplicitIncludeDomains(sourceProfileIds: string[]): boolean {
  const hasGovernmentLikeProfile =
    sourceProfileIds.includes("government_portals") ||
    sourceProfileIds.includes("policy_documents") ||
    sourceProfileIds.includes("official_mixed");

  return !hasGovernmentLikeProfile;
}

function extractPublishTime(text: string): { raw: string | null; normalized: string | null; confidence: number } {
  const patterns = [
    /\b(20\d{2}[-/年](?:0?[1-9]|1[0-2])[-/月](?:0?[1-9]|[12]\d|3[01])(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\b/,
    /\b(20\d{2}\.\d{1,2}\.\d{1,2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = match[1];
    const normalized = normalizeDate(raw);
    return {
      raw,
      normalized,
      confidence: normalized ? 0.9 : 0.4,
    };
  }

  return { raw: null, normalized: null, confidence: 0 };
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const directDate = new Date(trimmed);
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const normalized = trimmed
    .replace(/年|\/|\./g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .trim();
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function resolveWeakPublishCandidate(raw: string | null | undefined): string | null {
  const text = safeString(raw);
  if (!text) return null;
  return normalizeDate(text) || null;
}

function resolvePublishInfo(input: {
  text: string;
  explicitPublishTime?: string | null;
  explicitPublishTimeRaw?: string | null;
  explicitPublishTimeConfidence?: number | null;
  isPdf?: boolean;
}): {
  raw: string | null;
  normalized: string | null;
  confidence: number;
  source: PublishTimeSource;
} {
  const inferred = extractPublishTime(input.text);
  const explicitRaw = safeString(input.explicitPublishTime);
  const explicitPublishTimeRaw = safeString(input.explicitPublishTimeRaw);
  const explicitNormalized = explicitRaw ? normalizeDate(explicitRaw) || explicitRaw : null;
  const explicitConfidence = safeNumber(input.explicitPublishTimeConfidence);
  const trustedExplicitConfidence = explicitConfidence ?? (explicitNormalized ? 0.9 : 0);
  const preferredRaw = explicitRaw || explicitPublishTimeRaw || inferred.raw;

  if (input.isPdf) {
    if (explicitNormalized && trustedExplicitConfidence >= 0.85) {
      return {
        raw: preferredRaw,
        normalized: explicitNormalized,
        confidence: trustedExplicitConfidence,
        source: "explicit",
      };
    }

    return {
      raw: preferredRaw,
      normalized: null,
      confidence: Math.min(Math.max(trustedExplicitConfidence || inferred.confidence || 0.25, 0.25), 0.35),
      source: preferredRaw ? "pdf_body_unverified" : "unknown",
    };
  }

  if (explicitNormalized) {
    return {
      raw: explicitRaw,
      normalized: explicitNormalized,
      confidence: trustedExplicitConfidence,
      source: "explicit",
    };
  }

  return {
    raw: preferredRaw,
    normalized: inferred.normalized,
    confidence: inferred.confidence,
    source: inferred.normalized ? "body" : "unknown",
  };
}

function extractBudgetSignals(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of BUDGET_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      hits.push(normalizeWhitespace(match[0]));
    }
  }
  return Array.from(new Set(hits)).slice(0, 5);
}

function detectScenarios(text: string): { tags: string[]; technologies: string[]; evidence: string[] } {
  const tags: string[] = [];
  const technologies = new Set<string>();
  const evidence: string[] = [];
  const lower = text.toLowerCase();

  for (const rule of SCENARIO_RULES) {
    const hits = rule.keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    if (hits.length < (rule.minHits || 1)) continue;
    tags.push(rule.tag);
    for (const tech of rule.technologies) technologies.add(tech);
    evidence.push(`${rule.tag}: ${hits.slice(0, 3).join("、")}`);
  }

  return {
    tags,
    technologies: Array.from(technologies),
    evidence: evidence.slice(0, 5),
  };
}

function scoreScenarioFit(text: string, scenarioCount: number, evidenceCount: number): number {
  if (scenarioCount === 0) {
    return clampScore(12 + Math.min(10, countKeywordHits(text, BUSINESS_MODULE_SIGNAL_KEYWORDS) * 2));
  }

  let score = 20;
  score += Math.min(48, scenarioCount * 16);
  score += Math.min(16, evidenceCount * 4);
  score += Math.min(12, countKeywordHits(text, BUSINESS_MODULE_SIGNAL_KEYWORDS) * 3);

  if (containsIndirectProcurementSignal(text) && !containsFormalAdvanceSignal(text) && !containsProjectBodySignal(text)) {
    score -= 10;
  }

  return clampScore(score);
}

function scoreAiFit(text: string, scenarioCount: number, budgetSignalCount: number): number {
  let score = 20;
  const lower = text.toLowerCase();
  const explicitAiHits = countKeywordHits(lower, AI_EXPLICIT_SIGNAL_KEYWORDS);
  const dataSignalHits = countKeywordHits(lower, AI_DATA_SIGNAL_KEYWORDS);
  const automationHits = countKeywordHits(lower, ["自动", "辅助", "提效", "识别", "分类", "推荐", "分析", "检索", "转写", "问答"]);
  const hotlineHits = countKeywordHits(lower, ["12345", "热线", "工单"]);
  const processSignalHits = countKeywordHits(lower, [
    "运营服务",
    "服务外包",
    "人工服务",
    "接听",
    "受理",
    "坐席",
    "客服",
    "工单",
    "回访",
    "知识库",
    "检索",
    "质检",
    "审核",
    "派单",
    "7×24",
    "7x24",
  ]);

  score += Math.min(24, scenarioCount * 6);
  score += Math.min(24, dataSignalHits * 4);
  score += Math.min(18, explicitAiHits * 6);
  score += Math.min(12, automationHits * 3);
  score += Math.min(18, processSignalHits * 3);
  score += Math.min(6, budgetSignalCount * 2);

  if (hotlineHits > 0) {
    score += dataSignalHits >= 2 || explicitAiHits >= 1 ? 8 : 10;
  }

  if (containsPositiveKeyword(text, ["运营服务", "服务外包", "人工服务"]) && hotlineHits > 0) {
    score += 8;
  }

  if (containsIndirectProcurementSignal(text) && explicitAiHits === 0 && dataSignalHits <= 1 && processSignalHits <= 2) {
    score -= 8;
  }

  return clampScore(score);
}

function scoreMaturity(input: {
  text: string;
  sourceLevel: string;
  publishTime: string | null;
  weakPublishAgeDays: number | null;
  budgetSignalCount: number;
  stage: OpportunityStage;
}): number {
  let score = input.sourceLevel === "A" ? 30 : input.sourceLevel === "B" ? 22 : 14;
  const lower = input.text.toLowerCase();
  const formalAdvanceHits = countPositiveKeywordHits(lower, FORMAL_ADVANCE_SIGNAL_KEYWORDS);
  const projectBodyHits = countPositiveKeywordHits(lower, PROJECT_BODY_SIGNAL_KEYWORDS);
  const executionHits = countKeywordHits(lower, EXECUTION_TASK_SIGNAL_KEYWORDS);
  const indirectWeakSignal =
    containsIndirectProcurementSignal(lower) &&
    !containsFormalAdvanceSignal(lower) &&
    !containsProjectBodySignal(lower);

  score += Math.min(24, formalAdvanceHits * 8);
  score += Math.min(18, projectBodyHits * 4);
  score += Math.min(10, executionHits * 2);
  score += Math.min(12, input.budgetSignalCount * 4);

  if (input.stage === "招标中") score += 12;
  if (input.stage === "规划信号") score += 4;
  if (input.stage === "政策信号") score -= 10;
  if (["中标后", "合同签订", "已落地"].includes(input.stage)) score -= 24;

  if (input.publishTime) {
    const days = Math.floor((Date.now() - new Date(input.publishTime).getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 7) score += 12;
    else if (days <= 30) score += 8;
    else if (days <= 60) score += 2;
    else if (days <= 90) score -= 4;
    else score -= 12;
  } else if (input.weakPublishAgeDays !== null) {
    if (input.weakPublishAgeDays <= 30) score += 2;
    else if (input.weakPublishAgeDays <= 45) score += 0;
    else if (input.weakPublishAgeDays <= 90) score -= 8;
    else score -= 14;
  } else {
    score -= 8;
  }

  if (indirectWeakSignal) {
    score -= 26;
  } else if (containsIndirectProcurementSignal(lower)) {
    score -= 14;
  }

  return clampScore(score);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
}

function getAgeDays(publishTime: string | null | undefined): number | null {
  if (!publishTime) return null;
  const time = new Date(publishTime).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function detectOpportunityStage(headlineText: string, bodyText: string, sourceType: string): OpportunityStage {
  const headlineRules: Array<{ stage: OpportunityStage; pattern: RegExp }> = [
    { stage: "招标中", pattern: /招标公告|采购公告|竞争性磋商|比选公告|采购需求|公开招标/ },
    { stage: "中标后", pattern: /中标|成交公告|成交结果|候选人公示/ },
    { stage: "合同签订", pattern: /合同公告|合同签订|签订合同|合同备案/ },
    { stage: "已落地", pattern: /验收|上线运行|正式运行|投入使用|建成|落地应用/ },
    { stage: "政策信号", pattern: /工作要点|行动计划|实施意见|通知|工作情况|政策支持|指导意见/ },
    { stage: "规划信号", pattern: /立项|可行性研究|可研|建设方案|升级改造|采购意向|需求征集|项目建议书|预算公开/ },
  ];

  for (const rule of headlineRules) {
    if (rule.pattern.test(headlineText)) return rule.stage;
  }

  for (const rule of STAGE_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(bodyText))) {
      return rule.stage;
    }
  }

  if (sourceType === "政策类") return "政策信号";
  return "规划信号";
}

function classifyLead(input: {
  stage: OpportunityStage;
  sourceType: string;
  publishTime: string | null;
  weakPublishAgeDays: number | null;
  text: string;
}): {
  leadCategory: LeadCategory;
  isActionableNow: boolean;
  categoryReason: string;
} {
  const ageDays = getAgeDays(input.publishTime);
  const isStale = ageDays !== null && ageDays > 180;
  const isWeakOutdated = input.weakPublishAgeDays !== null && input.weakPublishAgeDays > 45;
  const isWeakHistorical = input.weakPublishAgeDays !== null && input.weakPublishAgeDays > 180;
  const lower = input.text.toLowerCase();
  const isBudgetDocument = containsBudgetDocumentSignal(input.text);
  const hasFormalAdvanceSignal = containsFormalAdvanceSignal(input.text);
  const hasProjectBodySignal = containsProjectBodySignal(input.text);
  const hasIndirectWeakSignal =
    containsIndirectProcurementSignal(input.text) &&
    !hasFormalAdvanceSignal &&
    !hasProjectBodySignal;
  const hasCurrentOpportunitySignal =
    [
      "采购意向",
      "采购公告",
      "招标公告",
      "公开招标",
      "竞争性磋商",
      "需求征集",
      "立项",
      "可行性研究",
      "建设方案",
      "实施方案",
      "升级改造",
      "智能化升级",
      "扩容升级",
      "项目建议书",
      "预算公开",
    ].some((keyword) => lower.includes(keyword.toLowerCase()));
  const hasDirectionalBuildSignal =
    [
      "平台建设",
      "接入大模型",
      "试点",
      "部署",
      "上线",
      "推广应用",
      "实施方案",
      "能力建设",
    ].some((keyword) => lower.includes(keyword.toLowerCase()));
  const hasExecutionTaskSignal =
    containsExecutionTaskSignal(input.text) ||
    [
      "实施方案",
      "建设任务",
      "重点任务",
      "场景建设",
      "能力建设",
      "智能客服",
      "智能数据分析",
      "智能座席",
      "自动派单",
      "知识库推荐",
      "智能回访",
      "智能质检",
    ].some((keyword) => lower.includes(keyword.toLowerCase()));
  const hasBudgetOpportunitySignal =
    isBudgetDocument &&
    hasExecutionTaskSignal &&
    ["项目", "建设", "升级", "改造", "系统", "平台"].some((keyword) => lower.includes(keyword.toLowerCase()));

  if (["中标后", "合同签订", "已落地"].includes(input.stage)) {
    return {
      leadCategory: "historical_case",
      isActionableNow: false,
      categoryReason: "该线索已进入中标、签约或落地阶段，更适合作为历史案例参考，不属于当前可跟进商机。",
    };
  }

  if (hasIndirectWeakSignal) {
    return {
      leadCategory: "policy_signal",
      isActionableNow: false,
      categoryReason: "该线索体现的是招标代理、代理机构遴选或询价结果公示等前置采购动作，尚不能代表项目本体采购已正式启动，适合作为观察信号持续跟踪。",
    };
  }

  if ((input.stage === "招标中" || input.stage === "规划信号") && (isStale || isWeakHistorical || isWeakOutdated)) {
    return {
      leadCategory: "historical_case",
      isActionableNow: false,
      categoryReason: "该线索缺少权威发布时间，且正文候选日期明显早于当前时间窗，暂按历史/待核验参考处理。",
    };
  }

  if (isBudgetDocument) {
    if (!isStale && !isWeakOutdated && hasExecutionTaskSignal && hasFormalAdvanceSignal) {
      return {
        leadCategory: "current_opportunity",
        isActionableNow: true,
        categoryReason: "该线索属于预算/预算支出类文件，但已出现独立采购、需求征集或立项推进信号，可作为前置机会继续跟进。",
      };
    }

    if (!isStale && !isWeakOutdated && hasBudgetOpportunitySignal) {
      return {
        leadCategory: "current_opportunity",
        isActionableNow: false,
        categoryReason: "该线索属于预算公开/预算支出类文件，虽已出现升级项目和建设内容，但尚缺少独立采购或立项公告，宜作为前置机会观察，不直接按成熟商机推进。",
      };
    }

    return {
      leadCategory: "policy_signal",
      isActionableNow: false,
      categoryReason: "该线索属于预算公开/预算支出类文件，更多体现预算与建设方向，暂不足以作为当前可推进商机。",
    };
  }

  if (!isStale && !isWeakOutdated && (input.stage === "招标中" || input.stage === "规划信号")) {
    return {
      leadCategory: "current_opportunity",
      isActionableNow: true,
      categoryReason: "该线索处于规划或招采阶段，且仍在有效时间窗内，可作为当前商机继续跟进。",
    };
  }

  if (input.stage === "政策信号" || input.sourceType === "政策类") {
    if (
      !isStale &&
      !isWeakOutdated &&
      hasFormalAdvanceSignal &&
      (hasCurrentOpportunitySignal || (hasDirectionalBuildSignal && hasExecutionTaskSignal))
    ) {
      return {
        leadCategory: "current_opportunity",
        isActionableNow: true,
        categoryReason: "该线索虽来自政策/政府动态来源，但正文已出现明确采购、建设任务或升级改造执行信号，可视为当前机会线索。",
      };
    }
    if (!isStale && !isWeakOutdated && (hasDirectionalBuildSignal || hasExecutionTaskSignal || hasCurrentOpportunitySignal)) {
      return {
        leadCategory: "current_opportunity",
        isActionableNow: false,
        categoryReason: "该线索虽未形成明确采购或预算说明，但已体现出建设方向、持续推进意图或后续转化空间，适合作为观察型机会纳入候选池持续跟踪。",
      };
    }
    return {
      leadCategory: "policy_signal",
      isActionableNow: false,
      categoryReason: hasDirectionalBuildSignal
        ? "该线索体现出明确建设方向，但当前仍以政策/工作动态为主，更适合作为方向性信号持续跟踪。"
        : "该线索以政策/工作导向为主，更适合作为方向性信号，不属于当前可直接推进的商机。",
    };
  }

  if (isStale) {
    return {
      leadCategory: "historical_case",
      isActionableNow: false,
      categoryReason: "该线索发布时间较久，已偏离当前跟进窗口，更适合作为历史案例参考。",
    };
  }

  return {
    leadCategory: "current_opportunity",
    isActionableNow: true,
    categoryReason: "该线索仍处于规划或招采阶段，且时间相对较新，可作为当前商机继续跟进。",
  };
}

function scoreOpportunity(input: {
  screeningScore: number;
  stage: OpportunityStage;
  budgetSignals: string[];
  publishTime: string | null;
  weakPublishAgeDays: number | null;
  leadCategory: LeadCategory;
  text: string;
}): number {
  let score = input.screeningScore;
  const ageDays = getAgeDays(input.publishTime);
  const indirectWeakSignal =
    containsIndirectProcurementSignal(input.text) &&
    !containsFormalAdvanceSignal(input.text) &&
    !containsProjectBodySignal(input.text);

  if (input.stage === "招标中") score += 4;
  if (input.stage === "规划信号") score -= 2;
  if (input.stage === "中标后") score -= 16;
  if (input.stage === "合同签订") score -= 20;
  if (input.stage === "已落地") score -= 24;
  if (input.stage === "政策信号") score -= 14;

  if (input.budgetSignals.length > 0) score += 4;

  if (ageDays !== null) {
    if (ageDays <= 30) score += 4;
    else if (ageDays <= 90) score += 0;
    else score -= 12;
  } else if (input.weakPublishAgeDays !== null) {
    if (input.weakPublishAgeDays <= 30) score += 0;
    else if (input.weakPublishAgeDays <= 45) score += 0;
    else if (input.weakPublishAgeDays <= 90) score -= 10;
    else if (input.weakPublishAgeDays <= 180) score -= 16;
    else score -= 24;
  }

  if (indirectWeakSignal) {
    score -= 22;
  }

  if (input.leadCategory !== "current_opportunity") {
    score = Math.min(score, 59);
  }

  return clampScore(score);
}

function scoreReferenceValue(input: {
  scenarioFitScore: number;
  aiFitScore: number;
  opportunityMaturityScore: number;
  sourceLevel: string;
  budgetSignals: string[];
  stage: OpportunityStage;
  leadCategory: LeadCategory;
  text: string;
}): number {
  let score = input.scenarioFitScore * 0.3 + input.aiFitScore * 0.25 + input.opportunityMaturityScore * 0.2;

  if (input.sourceLevel === "A") score += 12;
  else if (input.sourceLevel === "B") score += 6;

  if (input.budgetSignals.length > 0) score += 8;
  if (["中标后", "合同签订", "已落地"].includes(input.stage)) score += 8;
  if (input.leadCategory === "policy_signal") score += 6;
  if (containsIndirectProcurementSignal(input.text) && !containsFormalAdvanceSignal(input.text) && !containsProjectBodySignal(input.text)) {
    score -= 10;
  }

  return clampScore(score);
}

function inferDateWindowDays(query: string): number | null {
  const match = query.match(/近\s*(\d+)\s*天/);
  if (match) return Number(match[1]);
  if (query.includes("近一周")) return 7;
  if (query.includes("近一个月")) return 30;
  if (query.includes("近三个月")) return 90;
  return null;
}

function buildDateWindow(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function isWithinDays(dateText: string, days: number): boolean | null {
  if (!dateText) return null;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;
  const diffDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays <= days;
}

function buildSuggestedAction(totalScore: number): string {
  if (totalScore >= 80) return "建议售前立即跟进";
  if (totalScore >= 65) return "建议进入候选机会池并持续观察";
  if (totalScore >= 50) return "建议补充客户画像后再判断";
  return "建议暂不跟进";
}

function resolveOpportunitySignalClass(input: {
  leadCategory: LeadCategory;
  opportunityStage: OpportunityStage;
  hasStrongPoolSignal: boolean;
  hasExecutionTaskSignal: boolean;
  hasDirectionalBuildSignal: boolean;
  hasIndirectWeakSignal: boolean;
}): OpportunitySignalClass {
  if (input.leadCategory !== "current_opportunity") return "参考线索";
  if (input.hasIndirectWeakSignal) return "参考线索";
  if (input.hasStrongPoolSignal || input.opportunityStage === "招标中") return "明确招采";
  if (input.hasExecutionTaskSignal || input.opportunityStage === "规划信号") return "前置信号";
  if (input.hasDirectionalBuildSignal || input.opportunityStage === "政策信号") return "方向信号";
  return "参考线索";
}

function resolvePoolEntryTier(input: {
  leadCategory: LeadCategory;
  passesWeakTimeGate: boolean;
  budgetDocumentPoolEligible: boolean;
  hasIndirectWeakSignal: boolean;
  isActionableNow: boolean;
  hasStrongPoolSignal: boolean;
  hasExecutionTaskSignal: boolean;
  hasDirectionalBuildSignal: boolean;
  opportunityScore: number;
  opportunityMaturityScore: number;
  scenarioFitScore: number;
  aiFitScore: number;
}): PoolEntryTier {
  if (input.leadCategory !== "current_opportunity") return "不入池";
  if (!input.passesWeakTimeGate || !input.budgetDocumentPoolEligible || input.hasIndirectWeakSignal) return "不入池";
  if (input.scenarioFitScore < 40 || input.aiFitScore < 35) return "不入池";

  if (
    input.isActionableNow &&
    input.hasStrongPoolSignal &&
    input.opportunityScore >= 65 &&
    input.opportunityMaturityScore >= 50
  ) {
    return "优先跟进";
  }

  if (
    input.hasStrongPoolSignal ||
    input.hasExecutionTaskSignal ||
    input.opportunityScore >= 50 ||
    input.opportunityMaturityScore >= 40
  ) {
    return "观察入池";
  }

  if (input.hasDirectionalBuildSignal || input.scenarioFitScore >= 50) {
    return "信号跟踪";
  }

  return "不入池";
}

function buildCategorySuggestion(input: {
  leadCategory: LeadCategory;
  isActionableNow: boolean;
  opportunityStage: OpportunityStage;
  opportunityScore: number;
  referenceValueScore: number;
  poolEntryTier: PoolEntryTier;
}): string {
  if (input.leadCategory === "policy_signal") {
    return "建议纳入政策信号池，作为方向性依据持续跟踪。";
  }
  if (input.leadCategory === "historical_case") {
    return input.referenceValueScore >= 70
      ? "建议纳入历史案例池，作为客户沟通和售前论证参考。"
      : "建议仅保留为一般参考，不作为当前商机推进。";
  }
  if (input.poolEntryTier === "优先跟进") {
    return "建议优先跟进，尽快补齐客户关系、预算节点和竞争格局。";
  }
  if (input.poolEntryTier === "观察入池") {
    return "建议进入机会池观察，重点补充采购范围、预算和立项进度。";
  }
  if (input.poolEntryTier === "信号跟踪") {
    return "建议入池作为方向跟踪线索，持续关注后续采购、立项或试点转化。";
  }
  if (!input.isActionableNow) {
    return "建议先观察，不作为当前销售推进对象。";
  }
  if (input.opportunityStage === "招标中" && input.opportunityScore >= 70) {
    return "建议优先跟进，尽快补齐客户关系、招采节点和竞争格局。";
  }
  if (input.opportunityStage === "规划信号" && input.opportunityScore >= 60) {
    return "建议进入机会池并补充客户画像、预算和立项进度。";
  }
  return "建议继续观察，待更多预算或招采信号出现后再升级。";
}

function buildScoreReason(input: {
  scenarioFitScore: number;
  scenarioTags: string[];
  aiFitScore: number;
  opportunityMaturityScore: number;
  sourceLevel: string;
  budgetSignals: string[];
}): string {
  const scenarioText = input.scenarioTags.length > 0 ? input.scenarioTags.join("、") : "场景待补充识别";
  const budgetText = input.budgetSignals.length > 0 ? "出现预算或资金信号" : "预算信号暂不明显";
  return `识别到 ${scenarioText} 场景；场景匹配度 ${input.scenarioFitScore} 分，AI 适配度 ${input.aiFitScore} 分，商机成熟度 ${input.opportunityMaturityScore} 分；来源可信等级 ${input.sourceLevel}；${budgetText}。`;
}

function evaluateOpportunity(input: {
  title?: string;
  summary?: string;
  content: string;
  url?: string;
  sourceDomain?: string;
  publishTime?: string | null;
  publishTimeRaw?: string | null;
  publishTimeConfidence?: number | null;
  isPdf?: boolean;
  deepAnalysisScore?: number;
}): JsonObject {
  const title = safeString(input.title);
  const summary = safeString(input.summary);
  const content = safeString(input.content);
  const url = safeString(input.url);
  const text = normalizeWhitespace(`${title} ${summary} ${content}`);
  const sourceDomain = safeString(input.sourceDomain);
  const sourceType = detectSourceType(sourceDomain, text);
  const sourceLevel = detectSourceLevel(sourceDomain);
  const runtimeOverrides = loadRuntimeOverrides();
  const ownerOrg = extractOrganization(text);
  const publishInfo = resolvePublishInfo({
    text,
    explicitPublishTime: input.publishTime,
    explicitPublishTimeRaw: input.publishTimeRaw,
    explicitPublishTimeConfidence: input.publishTimeConfidence ?? null,
    isPdf: input.isPdf,
  });
  const publishTime = publishInfo.normalized;
  const weakPublishCandidate = publishTime || resolveWeakPublishCandidate(publishInfo.raw);
  const weakPublishAgeDays = getAgeDays(weakPublishCandidate);
  const scenarios = detectScenarios(text);
  const budgetSignals = extractBudgetSignals(text);
  const lower = text.toLowerCase();
  const isBudgetDocument = containsBudgetDocumentSignal(text);
  const hasFormalAdvanceSignal = containsFormalAdvanceSignal(text);
  const hasProjectBodySignal = containsProjectBodySignal(text);
  const hasIndirectWeakSignal =
    containsIndirectProcurementSignal(text) &&
    !hasFormalAdvanceSignal &&
    !hasProjectBodySignal;
  const hasDirectionalBuildSignal =
    [
      "平台建设",
      "接入大模型",
      "试点",
      "部署",
      "上线",
      "推广应用",
      "实施方案",
      "能力建设",
    ].some((keyword) => lower.includes(keyword.toLowerCase()));
  const hasExecutionTaskSignal =
    containsExecutionTaskSignal(text) ||
    [
      "实施方案",
      "建设任务",
      "重点任务",
      "场景建设",
      "能力建设",
      "智能客服",
      "智能数据分析",
      "智能座席",
      "自动派单",
      "知识库推荐",
      "智能回访",
      "智能质检",
    ].some((keyword) => lower.includes(keyword.toLowerCase()));
  const hasProcurementSignal = MATURITY_SIGNALS.high.filter((keyword) => lower.includes(keyword.toLowerCase())).length >= 2;
  const opportunityStage = detectOpportunityStage(normalizeWhitespace(`${title} ${summary}`), text, sourceType);
  const relatedLinks = buildLinkItems(url ? [url] : [], "main", "原始链接");
  const sourceLinksByType = {
    main: relatedLinks,
    sourceContinuity: [],
    similarCases: [],
    landingCases: [],
    policySupports: [],
    budgetSupports: [],
  };
  const timeline = buildTimelineEntries({
    title,
    publishTime,
    leadUrl: url,
  });

  const scenarioFitScore = scoreScenarioFit(text, scenarios.tags.length, scenarios.evidence.length);
  const aiFitScore = scoreAiFit(text, scenarios.tags.length, budgetSignals.length);
  const opportunityMaturityScore = scoreMaturity({
    text,
    sourceLevel,
    publishTime,
    weakPublishAgeDays,
    budgetSignalCount: budgetSignals.length,
    stage: opportunityStage,
  });
  const maturityScore = opportunityMaturityScore;
  const deepScore = typeof input.deepAnalysisScore === "number" ? input.deepAnalysisScore : 0;
  const screeningScoreRaw = Number((scenarioFitScore * 0.2 + aiFitScore * 0.4 + opportunityMaturityScore * 0.4).toFixed(1));
  const lead = classifyLead({
    stage: opportunityStage,
    sourceType,
    publishTime,
    weakPublishAgeDays,
    text,
  });
  const opportunityScore = scoreOpportunity({
    screeningScore: screeningScoreRaw,
    stage: opportunityStage,
    budgetSignals,
    publishTime,
    weakPublishAgeDays,
    leadCategory: lead.leadCategory,
    text,
  });
  const referenceValueScore = scoreReferenceValue({
    scenarioFitScore,
    aiFitScore,
    opportunityMaturityScore,
    sourceLevel,
    budgetSignals,
    stage: opportunityStage,
    leadCategory: lead.leadCategory,
    text,
  });
  let leadCategory = lead.leadCategory;
  let isActionableNow = lead.isActionableNow;
  let categoryReason = lead.categoryReason;
  const selfHealingFlags: string[] = [];
  const urlDate = extractDateFromUrl(url);
  const urlDateAgeDays = getAgeDays(urlDate);
  const isListingPage = isListingLikeOpportunityPage(title, url, content);

  if (
    runtimeOverrides.poolGuards.disallowPlanningStageActionableByDefault &&
    opportunityStage === "规划信号" &&
    isActionableNow &&
    !hasFormalAdvanceSignal
  ) {
    leadCategory = "policy_signal";
    isActionableNow = false;
    categoryReason = "系统自修复拦截：该线索仅表现为规划信号，且缺少采购、立项、需求征集或招标执行信号，暂不按当前可跟进机会处理。";
    selfHealingFlags.push("planning_stage_requires_execution_signal");
  }

  let totalScore = leadCategory === "current_opportunity" ? opportunityScore : referenceValueScore;
  const passesWeakTimeGate =
    publishTime !== null ||
    weakPublishAgeDays === null ||
    weakPublishAgeDays <= 45;
  const budgetDocumentPoolEligible = !isBudgetDocument || (hasFormalAdvanceSignal && publishTime !== null);
  const hasStrongPoolSignal =
    hasFormalAdvanceSignal ||
    hasProjectBodySignal ||
    (opportunityStage === "招标中" && !hasIndirectWeakSignal);
  const budgetPoolEligible =
    !isBudgetDocument || hasFormalAdvanceSignal || hasExecutionTaskSignal || hasProjectBodySignal;
  let poolEntryTier = resolvePoolEntryTier({
    leadCategory,
    passesWeakTimeGate,
    budgetDocumentPoolEligible: budgetPoolEligible,
    hasIndirectWeakSignal,
    isActionableNow,
    hasStrongPoolSignal,
    hasExecutionTaskSignal,
    hasDirectionalBuildSignal,
    opportunityScore,
    opportunityMaturityScore,
    scenarioFitScore,
    aiFitScore,
  });
  let shouldEnterPool = poolEntryTier !== "不入池";

  if (
    runtimeOverrides.poolGuards.requireResolvedProjectTitleForCurrentOpportunity &&
    leadCategory === "current_opportunity" &&
    isPlaceholderOpportunityTitle(title)
  ) {
    shouldEnterPool = false;
    poolEntryTier = "不入池";
    selfHealingFlags.push("placeholder_title_requires_resolution");
  }

  if (leadCategory === "current_opportunity" && isListingPage) {
    shouldEnterPool = false;
    poolEntryTier = "不入池";
    selfHealingFlags.push("listing_page_blocked");
  }

  if (
    runtimeOverrides.poolGuards.requireAuthorityPublishTimeForPoolEntry &&
    shouldEnterPool &&
    publishInfo.source === "pdf_body_unverified"
  ) {
    shouldEnterPool = false;
    poolEntryTier = "不入池";
    leadCategory = "policy_signal";
    isActionableNow = false;
    categoryReason = "系统自修复拦截：该线索仅有 PDF 正文候选日期，缺少权威公告页发布时间，暂不允许进入当前机会池。";
    selfHealingFlags.push("unverified_pdf_publish_time_blocked");
  }

  if (
    runtimeOverrides.poolGuards.blockOldPdfWithoutAuthorityPage &&
    input.isPdf &&
    shouldEnterPool &&
    urlDateAgeDays !== null &&
    urlDateAgeDays > 45 &&
    publishInfo.source !== "explicit"
  ) {
    shouldEnterPool = false;
    poolEntryTier = "不入池";
    leadCategory = "historical_case";
    isActionableNow = false;
    categoryReason = "系统自修复拦截：PDF 链接路径日期明显早于当前时间窗，且缺少权威公告页发布时间，暂按历史/待核验线索处理。";
    selfHealingFlags.push("old_pdf_without_authority_page_blocked");
  }

  totalScore = leadCategory === "current_opportunity" ? opportunityScore : referenceValueScore;
  const opportunitySignalClass = resolveOpportunitySignalClass({
    leadCategory,
    opportunityStage,
    hasStrongPoolSignal,
    hasExecutionTaskSignal,
    hasDirectionalBuildSignal,
    hasIndirectWeakSignal,
  });

  const followUpAction = shouldEnterPool
    ? (
      poolEntryTier === "优先跟进"
        ? "建议进入候选机会池并优先跟进"
        : poolEntryTier === "观察入池"
          ? "建议进入候选机会池并持续观察"
          : "建议进入候选机会池并作为方向跟踪线索持续关注"
    )
    : hasIndirectWeakSignal
      ? "建议持续跟踪正式招标转化，不按当前成熟商机推进"
      : leadCategory !== "current_opportunity"
        ? buildCategorySuggestion({
            leadCategory,
            isActionableNow,
            opportunityStage,
            opportunityScore,
            referenceValueScore,
            poolEntryTier,
          })
    : (selfHealingFlags.includes("placeholder_title_requires_resolution")
      ? "建议补充正式项目名称后再判断"
      : selfHealingFlags.includes("listing_page_blocked")
        ? "建议下钻具体公告详情页后再判断"
        : selfHealingFlags.includes("unverified_pdf_publish_time_blocked")
        ? "建议先补抓权威公告页发布时间后再判断"
        : selfHealingFlags.includes("old_pdf_without_authority_page_blocked")
          ? "建议转为历史/待核验参考，不作为当前商机推进"
          : buildSuggestedAction(opportunityScore));

  return {
    description: buildDescription({ title, summary, content, fallback: categoryReason }),
    sourceType,
    sourceLevel,
    leadCategory,
    opportunityStage,
    isActionableNow,
    categoryReason,
    scenarioTags: scenarios.tags,
    scenarioConfidence: Number(Math.min(0.98, 0.45 + scenarios.tags.length * 0.12).toFixed(2)),
    ownerOrg,
    scenarioFitScore,
    aiFitScore,
    opportunityMaturityScore,
    maturityScore,
    screeningScore: opportunityScore,
    deepAnalysisScore: deepScore,
    totalScore,
    scoreBreakdown: {
      scenarioFitScore,
      aiFitScore,
      opportunityMaturityScore,
      baseScore: screeningScoreRaw,
      screeningScoreRaw,
      screeningScore: opportunityScore,
      opportunityScore,
      referenceValueScore,
      deepAnalysisScore: deepScore,
    },
    shouldEnterPool,
    budgetSignals,
    evidenceList: [...scenarios.evidence, ...budgetSignals].slice(0, 6),
    scoreReason: buildScoreReason({
      scenarioFitScore,
      scenarioTags: scenarios.tags,
      aiFitScore,
      opportunityMaturityScore,
      sourceLevel,
      budgetSignals,
    }),
    suggestedAction: buildCategorySuggestion({
      leadCategory,
      isActionableNow,
      opportunityStage,
      opportunityScore,
      referenceValueScore,
      poolEntryTier,
    }),
    followUpAction,
    poolEntryTier,
    opportunitySignalClass,
    modelConfidence: Number(Math.min(0.95, 0.5 + scenarios.tags.length * 0.08).toFixed(2)),
    publishTime,
    publishTimeRaw: publishInfo.raw,
    publishTimeConfidence: publishInfo.confidence,
    publishTimeSource: publishInfo.source,
    recommendedTechnologies: scenarios.technologies,
    relatedLinks,
    sourceLinksByType,
    timeline,
    selfHealingFlags,
    runtimeGuardVersion: runtimeOverrides.version,
  };
}

function isPlaceholderOpportunityTitle(value: string): boolean {
  const title = normalizeWhitespace(value);
  if (!title) return true;
  return (
    /^项目编号[:：]?/u.test(title) ||
    /^[一二三四五六七八九十]+[、，.．]/u.test(title) ||
    /^(采购需求|招标文件|附件)$/u.test(title) ||
    /^(公开招标公告|邀请招标公告|竞争性磋商公告|询价公告|终止公告|更正公告|中标公告|成交公告)_中国政府采购网$/u.test(title)
  );
}

function isListingLikeOpportunityPage(title: string, url: string, content: string): boolean {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedUrl = url.toLowerCase();
  const normalizedContent = normalizeWhitespace(content);

  if (
    /^(公开招标公告|邀请招标公告|竞争性磋商公告|询价公告|终止公告|更正公告|中标公告|成交公告)_中国政府采购网$/u.test(normalizedTitle)
  ) {
    return true;
  }

  if (
    /\/index(?:_\d+)?\.htm$/u.test(normalizedUrl) ||
    /\/cggg\/[^?#]+\/$/u.test(normalizedUrl)
  ) {
    return true;
  }

  if (
    normalizedContent.includes("下一页") &&
    normalizedContent.includes("上一页") &&
    normalizedContent.includes("中国政府采购网")
  ) {
    return true;
  }

  return false;
}

function extractDateFromUrl(url: string): string | null {
  if (!url) return null;

  const compactSlashMatch = url.match(/\/(20\d{2})(0[1-9]|1[0-2])\/(\d{1,2})(?:\/|$)/u);
  if (compactSlashMatch) {
    const [, year, month, day] = compactSlashMatch;
    return buildIsoDate(year, month, day);
  }

  const slashMatch = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/u);
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    return buildIsoDate(year, month, day);
  }

  const compactMatch = url.match(/(20\d{2})[-_](\d{1,2})[-_](\d{1,2})/u);
  if (compactMatch) {
    const [, year, month, day] = compactMatch;
    return buildIsoDate(year, month, day);
  }

  return null;
}

function buildIsoDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function summarizeEvidence(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  const normalized = items.map((item) => normalizeWhitespace(item)).filter(Boolean);
  if (normalized.length === 0) return fallback;
  return normalized.slice(0, 3).join("；");
}

function countEvidenceKeywordHits(items: string[], keywords: string[]): number {
  const text = normalizeWhitespace(items.join(" "));
  if (!text) return 0;
  return countKeywordHits(text, keywords);
}

function scoreDeepEvidenceDimension(input: {
  base: number;
  evidenceCount: number;
  keywordHits: number;
  maxScore: number;
  evidenceWeight?: number;
  keywordWeight?: number;
}): number {
  const evidenceWeight = input.evidenceWeight ?? 10;
  const keywordWeight = input.keywordWeight ?? 4;
  const score =
    input.base +
    Math.min(evidenceWeight, input.evidenceCount * Math.max(1, Math.floor(evidenceWeight / 2))) +
    Math.min(keywordWeight * 3, input.keywordHits * keywordWeight);
  return clampScore(Math.min(input.maxScore, score));
}

function buildDeepSuggestedAction(input: {
  evidenceStrengthScore: number;
  hasWeakProcurementOnly: boolean;
  hasFormalProjectSignal: boolean;
  hasBudgetSupport: boolean;
}): string {
  if (input.hasWeakProcurementOnly) {
    return "建议持续跟踪正式招标转化，不按当前成熟商机推进";
  }
  if (input.evidenceStrengthScore >= 80 && input.hasFormalProjectSignal) {
    return "建议售前立即跟进";
  }
  if (input.evidenceStrengthScore >= 65 && input.hasFormalProjectSignal) {
    return input.hasBudgetSupport
      ? "建议继续补齐客户关系和竞争格局后跟进"
      : "建议先补预算与采购范围后再投入售前";
  }
  if (input.evidenceStrengthScore >= 50) {
    return "建议持续观察并补充正式采购、预算和需求附件";
  }
  return "建议暂不投入正式售前资源";
}

function buildDeepActionRationale(input: {
  hasWeakProcurementOnly: boolean;
  hasFormalProjectSignal: boolean;
  hasBudgetSupport: boolean;
  publishTime: string | null;
  riskFlags: string[];
}): string {
  if (input.hasWeakProcurementOnly) {
    return "当前证据主要停留在招标代理、代理机构遴选或询价结果公示等前置信号，缺少项目本体采购和预算闭环。";
  }
  if (!input.hasFormalProjectSignal) {
    return "当前已识别业务方向，但还缺少项目本体采购、采购需求或服务范围等正式执行证据。";
  }
  if (!input.hasBudgetSupport) {
    return "项目方向较明确，但预算、最高限价或资金安排仍待补证据，暂不宜按最高优先级推进。";
  }
  if (!input.publishTime) {
    return "方向和采购证据较完整，但发布时间仍需持续校验，建议跟进时同步核实窗口期。";
  }
  if (input.riskFlags.length > 0) {
    return `方向较清晰，但仍需关注 ${input.riskFlags.join("、")} 等风险。`;
  }
  return "场景方向、项目本体和预算支撑较完整，可按正式售前机会推进。";
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function collectMatchedKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();

  for (const rule of SCENARIO_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) hits.add(keyword);
    }
  }

  for (const keyword of [...MATURITY_SIGNALS.high, ...MATURITY_SIGNALS.medium, ...MATURITY_SIGNALS.policy]) {
    if (lower.includes(keyword.toLowerCase())) hits.add(keyword);
  }

  return Array.from(hits).slice(0, 20);
}

function extractOrganization(text: string): string {
  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()]+(?:局|厅|委|中心|公司|集团|医院|学校))/);
  return match ? match[1] : "";
}

function inferDeepScoreFromText(text: string): number {
  let score = 45;
  const lower = text.toLowerCase();
  if (lower.includes("采购") || lower.includes("招标")) score += 15;
  if (lower.includes("试点") || lower.includes("上线") || lower.includes("验收")) score += 10;
  if (lower.includes("政策") || lower.includes("专项")) score += 10;
  return Math.min(90, score);
}

function buildDeepConclusion(score: number): string {
  if (score >= 80) return "深查证据较充分，建议尽快投入售前资源。";
  if (score >= 65) return "深查结论偏积极，建议继续补充客户背景后跟进。";
  return "当前深查证据仍偏弱，建议持续观察并补充更多外部依据。";
}

function decideTransformationMode(aiFitScore: number): string {
  if (aiFitScore >= 80) return "辅助提效 + 局部替代";
  if (aiFitScore >= 65) return "辅助提效";
  return "以辅助分析为主";
}

async function searchWeb(input: Record<string, unknown>): Promise<string> {
  const apiKey = getEnvVar("TAVILY_API_KEY");
  if (!apiKey) {
    return JSON.stringify({ error: "缺少 TAVILY_API_KEY，无法执行公开网页检索。" }, null, 2);
  }

  const baseQuery = safeString(input.query);
  const sourceProfileIds = safeStringArray(input.source_profile_ids);
  const subscriptionId = safeString(input.subscription_id);
  const extraKeywords = safeStringArray(input.extra_keywords);
  const mergedProfiles = mergeSourceProfiles(sourceProfileIds);
  const builtQuery = buildSearchQuery({
    baseQuery,
    sourceProfileIds,
    subscriptionId: subscriptionId || undefined,
    extraKeywords,
  });
  const query = builtQuery.finalQuery || baseQuery;
  const explicitTimeWindowDays = typeof input.time_window_days === "number" && input.time_window_days > 0
    ? input.time_window_days
    : null;
  const inferredDays = explicitTimeWindowDays || inferDateWindowDays(query);
  const dateWindow = inferredDays ? buildDateWindow(inferredDays) : null;
  const subscription = subscriptionId ? getKeywordSubscription(subscriptionId) : undefined;
  const explicitIncludeDomains = safeStringArray(input.include_domains);
  const explicitExcludeDomains = safeStringArray(input.exclude_domains);
  const includeDomains = shouldUseExplicitIncludeDomains(sourceProfileIds)
    ? mergeStringArrays(mergedProfiles.includeDomains, explicitIncludeDomains)
    : explicitIncludeDomains;
  const excludeDomains = mergeStringArrays(mergedProfiles.excludeDomains, explicitExcludeDomains);
  const body = {
    api_key: apiKey,
    query,
    max_results: typeof input.max_results === "number" ? input.max_results : 5,
    topic: safeString(input.topic) || "general",
    include_domains: includeDomains,
    exclude_domains: excludeDomains,
    search_depth: "advanced",
    include_raw_content: false,
    ...(dateWindow ? { start_date: dateWindow.start, end_date: dateWindow.end } : {}),
  };

  const response = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return JSON.stringify({ error: `Tavily 检索失败: ${response.status}`, details: truncateText(text, 1000) }, null, 2);
  }

  const data = await response.json() as JsonObject;
  const results = Array.isArray(data.results) ? data.results : [];
  const shouldFilterHotline = isHotlineFocusedSearch(query, subscription?.id || null);
  const shouldFilterBySourceProfile = builtQuery.resolvedProfileIds.length > 0;
  const normalizedResults = results.map((item) => {
    const row = (item ?? {}) as JsonObject;
    const title = safeString(row.title);
    const snippet = safeString(row.content);
    const publishedDate = safeString(row.published_date);
    const url = normalizeUrl(safeString(row.url));
    const urlDate = extractDateFromUrl(url) || extractYearMonthFromUrl(url) || extractYearFromUrl(url);
    const inferredPublish = publishedDate
      ? publishedDate
      : extractPublishTime(`${title} ${snippet}`).normalized || urlDate;
    const withinWindow = inferredDays ? isWithinDays(inferredPublish || publishedDate, inferredDays) : null;
    return {
      title,
      url,
      content: truncateText(snippet, 800),
      published_date: inferredPublish || publishedDate,
      domain: deriveDomain(url),
      within_time_window: withinWindow,
    };
  });
  const withinWindowResults = normalizedResults.filter((item) => item.within_time_window !== false);
  const sourceProfileResults = withinWindowResults.filter((item) =>
    !shouldFilterBySourceProfile ||
    (
      isAllowedUrlBySourceProfiles(item.url, builtQuery.resolvedProfileIds) &&
      isAllowedBySourceProfiles(item.domain, builtQuery.resolvedProfileIds)
    )
  );
  const hotlineAnchorResults = sourceProfileResults.filter((item) =>
    !shouldFilterHotline ||
    !isGovernmentPortalDomain(item.domain) ||
    containsAnyKeyword(`${item.title} ${item.url}`, HOTLINE_ANCHOR_KEYWORDS)
  );
  const semanticEvaluatedResults = hotlineAnchorResults.map((item) => ({
    ...item,
    semanticDecision: evaluateHotlineSearchResult({
      title: item.title,
      snippet: item.content,
      url: item.url,
      domain: item.domain,
      publishedDate: safeString(item.published_date),
      sourceProfileIds: builtQuery.resolvedProfileIds,
      hotlineFocused: shouldFilterHotline,
      inferredDays,
    }),
  }));
  const normalized = semanticEvaluatedResults
    .filter((item) => item.semanticDecision.keep)
    .map(({ semanticDecision, ...item }) => item);
  const droppedSemanticSamples = semanticEvaluatedResults
    .filter((item) => !item.semanticDecision.keep)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      domain: item.domain,
      published_date: item.published_date,
      reason: item.semanticDecision.reason,
      url: item.url,
    }));

  return JSON.stringify(
    {
      query: body.query,
      baseQuery,
      sourceProfileIds: builtQuery.resolvedProfileIds,
      documentTypes: builtQuery.documentTypes,
      queryHints: builtQuery.queryHints,
      subscriptionId: subscription?.id || null,
      subscriptionLabel: builtQuery.subscriptionLabel,
      extraKeywords,
      includeDomains,
      excludeDomains,
      timeWindowDays: inferredDays,
      timeWindow: dateWindow,
      rawResultCount: normalizedResults.length,
      filterStats: {
        droppedOutOfWindowCount: normalizedResults.length - withinWindowResults.length,
        droppedBySourceProfileCount: withinWindowResults.length - sourceProfileResults.length,
        droppedByGovernmentAnchorCount: sourceProfileResults.length - hotlineAnchorResults.length,
        droppedBySemanticFilterCount: hotlineAnchorResults.length - normalized.length,
      },
      droppedSemanticSamples,
      resultCount: normalized.length,
      results: normalized,
    },
    null,
    2
  );
}

async function fetchPage(input: Record<string, unknown>): Promise<string> {
  const url = safeString(input.url);
  if (!/^https?:\/\//i.test(url)) {
    return JSON.stringify({ error: "仅支持抓取 http 或 https 地址。" }, null, 2);
  }

  const controller = new AbortController();
  const timeout = typeof input.timeout_ms === "number" ? input.timeout_ms : 15000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": DEFAULT_HEADERS["User-Agent"] },
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("pdf") || isPdfUrl(url)) {
      return parsePdfContent(url, response);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const text = stripHtml(html);

    return JSON.stringify(
      {
        url: normalizeUrl(url),
        title: titleMatch ? normalizeWhitespace(titleMatch[1]) : "",
        content: truncateText(text, 12000),
        contentLength: text.length,
        fetchedAt: new Date().toISOString(),
      },
      null,
      2
    );
  } catch (error: any) {
    return JSON.stringify({ error: `抓取失败: ${error.message}` }, null, 2);
  } finally {
    clearTimeout(timer);
  }
}

function extractSignal(input: Record<string, unknown>): string {
  const title = safeString(input.title);
  const summary = safeString(input.summary);
  const content = safeString(input.content);
  const url = safeString(input.url);
  const isPdf = input.is_pdf === true || isPdfUrl(url);
  const sourceDomain = safeString(input.source_domain) || deriveDomain(url);
  const text = normalizeWhitespace(`${title} ${summary} ${content}`);
  const publishInfo = resolvePublishInfo({
    text,
    explicitPublishTime: safeString(input.publish_time) || null,
    explicitPublishTimeRaw: safeString(input.publish_time_raw) || null,
    explicitPublishTimeConfidence: safeNumber(input.publish_time_confidence),
    isPdf,
  });
  const scenarios = detectScenarios(text);
  const sourceType = detectSourceType(sourceDomain, text);
  const opportunityStage = detectOpportunityStage(normalizeWhitespace(`${title} ${summary}`), text, sourceType);
  const lead = classifyLead({
    stage: opportunityStage,
    sourceType,
    publishTime: publishInfo.normalized,
    weakPublishAgeDays: getAgeDays(publishInfo.normalized || resolveWeakPublishCandidate(publishInfo.raw)),
    text,
  });
  const ownerOrg = extractOrganization(text);
  const relatedLinks = buildLinkItems(url ? [url] : [], "main", "原始链接");
  const sourceLinksByType = {
    main: relatedLinks,
    sourceContinuity: [],
    similarCases: [],
    landingCases: [],
    policySupports: [],
    budgetSupports: [],
  };
  const timeline = buildTimelineEntries({
    title,
    publishTime: publishInfo.normalized,
    leadUrl: url,
  });

  const result = {
    title,
    description: buildDescription({ title, summary, content }),
    normalizedTitle: normalizeWhitespace(title),
    url,
    normalizedUrl: url ? normalizeUrl(url) : "",
    sourceName: safeString(input.source_name),
    sourceDomain,
    isPdf,
    sourceType,
    sourceLevel: detectSourceLevel(sourceDomain),
    leadCategory: lead.leadCategory,
    opportunityStage,
    isActionableNow: lead.isActionableNow,
    categoryReason: lead.categoryReason,
    organizationName: ownerOrg,
    ownerOrg,
    publishTimeRaw: publishInfo.raw,
    publishTime: publishInfo.normalized,
    publishTimeConfidence: publishInfo.confidence,
    publishTimeSource: publishInfo.source,
    matchedKeywords: collectMatchedKeywords(text),
    scenarioTags: scenarios.tags,
    recommendedTechnologies: scenarios.technologies,
    budgetSignals: extractBudgetSignals(text),
    evidenceList: scenarios.evidence,
    relatedLinks,
    sourceLinksByType,
    timeline,
  };

  return JSON.stringify(result, null, 2);
}

function deepInvestigate(input: Record<string, unknown>): string {
  const leadTitle = safeString(input.lead_title);
  const leadSummary = safeString(input.lead_summary);
  const leadUrl = safeString(input.lead_url);
  const sourceName = safeString(input.source_name);
  const sourceDomain = safeString(input.source_domain) || deriveDomain(leadUrl);
  const publishTime = safeString(input.publish_time) || null;
  const sourceContinuityTexts = safeStringArray(input.source_continuity_texts);
  const sourceContinuityLinks = safeStringArray(input.source_continuity_links);
  const similarCaseTexts = safeStringArray(input.similar_case_texts);
  const similarCaseLinks = safeStringArray(input.similar_case_links);
  const landingCaseTexts = safeStringArray(input.landing_case_texts);
  const landingCaseLinks = safeStringArray(input.landing_case_links);
  const policySupportTexts = safeStringArray(input.policy_support_texts);
  const policySupportLinks = safeStringArray(input.policy_support_links);
  const budgetSupportTexts = safeStringArray(input.budget_support_texts);
  const budgetSupportLinks = safeStringArray(input.budget_support_links);
  const evidenceBase = normalizeWhitespace(
    [
      leadTitle,
      leadSummary,
      ...sourceContinuityTexts,
      ...similarCaseTexts,
      ...landingCaseTexts,
      ...policySupportTexts,
      ...budgetSupportTexts,
    ].join(" ")
  );
  const budgetSignals = extractBudgetSignals(evidenceBase);
  const hasFormalProjectSignal =
    containsFormalAdvanceSignal(evidenceBase) ||
    containsProjectBodySignal(evidenceBase);
  const hasWeakProcurementOnly =
    containsIndirectProcurementSignal(evidenceBase) &&
    !containsFormalAdvanceSignal(evidenceBase) &&
    !containsProjectBodySignal(evidenceBase) &&
    budgetSignals.length === 0;
  const hasBudgetSupport = budgetSignals.length > 0 || budgetSupportTexts.length > 0;

  const sourceContinuityScore = scoreDeepEvidenceDimension({
    base: 12,
    evidenceCount: sourceContinuityTexts.length,
    keywordHits: countEvidenceKeywordHits(sourceContinuityTexts, [...FORMAL_ADVANCE_SIGNAL_KEYWORDS, ...PROJECT_BODY_SIGNAL_KEYWORDS]),
    maxScore: 100,
    evidenceWeight: 18,
    keywordWeight: 6,
  });
  const procurementEvidenceScore = scoreDeepEvidenceDimension({
    base: hasFormalProjectSignal ? 38 : 18,
    evidenceCount: landingCaseTexts.length + (hasBudgetSupport ? 1 : 0),
    keywordHits: countEvidenceKeywordHits(
      [...sourceContinuityTexts, ...landingCaseTexts, ...budgetSupportTexts, ...budgetSignals],
      [...FORMAL_ADVANCE_SIGNAL_KEYWORDS, ...PROJECT_BODY_SIGNAL_KEYWORDS, "中标", "成交", "合同", "预算金额", "最高限价"]
    ),
    maxScore: 100,
    evidenceWeight: 16,
    keywordWeight: 5,
  });
  const similarCaseScore = scoreDeepEvidenceDimension({
    base: 18,
    evidenceCount: similarCaseTexts.length,
    keywordHits: countEvidenceKeywordHits(similarCaseTexts, ["中标", "成交", "预算", "服务期", "智能化", "知识库", "语音转写"]),
    maxScore: 100,
    evidenceWeight: 18,
    keywordWeight: 4,
  });
  const policyBudgetSupportScore = scoreDeepEvidenceDimension({
    base: 16,
    evidenceCount: policySupportTexts.length + budgetSupportTexts.length + (hasBudgetSupport ? 1 : 0),
    keywordHits: countEvidenceKeywordHits(
      [...policySupportTexts, ...budgetSupportTexts, ...budgetSignals],
      ["政策", "通知", "方案", "专项", "预算", "资金", "最高限价", "财政"]
    ),
    maxScore: 100,
    evidenceWeight: 16,
    keywordWeight: 4,
  });

  let followThroughReadinessScore = 18;
  if (sourceContinuityTexts.length > 0) followThroughReadinessScore += 14;
  if (landingCaseTexts.length > 0) followThroughReadinessScore += 12;
  if (hasFormalProjectSignal) followThroughReadinessScore += 18;
  if (hasBudgetSupport) followThroughReadinessScore += 12;
  if (hasWeakProcurementOnly) followThroughReadinessScore -= 20;
  followThroughReadinessScore = clampScore(followThroughReadinessScore);

  let evidenceStrengthScore = clampScore(
    sourceContinuityScore * 0.22 +
    procurementEvidenceScore * 0.3 +
    similarCaseScore * 0.16 +
    policyBudgetSupportScore * 0.16 +
    followThroughReadinessScore * 0.16
  );

  if (evidenceStrengthScore === 0) {
    evidenceStrengthScore = Math.max(35, Math.min(100, inferDeepScoreFromText(evidenceBase)));
  }

  if (hasWeakProcurementOnly) {
    evidenceStrengthScore = Math.min(evidenceStrengthScore, 58);
  } else if (!hasFormalProjectSignal && !hasBudgetSupport) {
    evidenceStrengthScore = Math.min(evidenceStrengthScore, 62);
  }

  const deepAnalysisScore = evidenceStrengthScore;
  const suggestedAction = buildDeepSuggestedAction({
    evidenceStrengthScore,
    hasWeakProcurementOnly,
    hasFormalProjectSignal,
    hasBudgetSupport,
  });
  const ownerOrg = extractOrganization(evidenceBase);
  const sourceLinksByType = {
    main: buildLinkItems(leadUrl ? [leadUrl] : [], "main", "原始链接"),
    sourceContinuity: buildLinkItems(sourceContinuityLinks, "source_continuity", "同源证据"),
    similarCases: buildLinkItems(similarCaseLinks, "similar_case", "横向案例"),
    landingCases: buildLinkItems(landingCaseLinks, "landing_case", "落地验证"),
    policySupports: buildLinkItems(policySupportLinks, "policy_support", "政策支撑"),
    budgetSupports: buildLinkItems(budgetSupportLinks, "budget_support", "预算支撑"),
  };
  const relatedLinks = flattenLinkGroups([sourceLinksByType]);
  const timeline = buildTimelineEntries({
    title: leadTitle,
    publishTime,
    leadUrl,
    sourceContinuityTexts,
    sourceContinuityLinks,
    similarCaseTexts,
    similarCaseLinks,
    landingCaseTexts,
    landingCaseLinks,
    policySupportTexts,
    policySupportLinks,
    budgetSupportTexts: [...budgetSupportTexts, ...budgetSignals],
    budgetSupportLinks,
  });
  const riskFlags = hasWeakProcurementOnly
    ? ["前置信号偏强但项目本体证据不足", "缺少正式项目采购与预算闭环"]
    : [
        ...(!hasFormalProjectSignal ? ["缺少正式项目本体采购证据"] : []),
        ...(!hasBudgetSupport ? ["预算或资金支撑待补证据"] : []),
      ];

  return JSON.stringify(
    {
      leadTitle,
      description: buildDescription({
        title: leadTitle,
        summary: leadSummary,
        content: evidenceBase,
        fallback: buildDeepConclusion(deepAnalysisScore),
      }),
      ownerOrg,
      sourceName,
      sourceDomain,
      leadUrl,
      sourceContinuity: summarizeEvidence(sourceContinuityTexts, "暂未补充到明显的同源连续性证据。"),
      similarCaseSummary: summarizeEvidence(similarCaseTexts, "暂未检索到清晰的横向同类案例。"),
      landingCaseSummary: summarizeEvidence(landingCaseTexts, "暂未补充到明确的中标、验收或上线证据。"),
      policySupportSummary: summarizeEvidence(policySupportTexts, "暂未发现直接的政策或专项支撑材料。"),
      budgetSupportSummary: summarizeEvidence(
        [...budgetSupportTexts, ...budgetSignals],
        "预算支撑信息待进一步核验。"
      ),
      deepAnalysisConclusion: buildDeepConclusion(deepAnalysisScore),
      evidenceStrengthScore,
      deepAnalysisScore,
      scoreBreakdown: {
        sourceContinuityScore,
        procurementEvidenceScore,
        similarCaseScore,
        policyBudgetSupportScore,
        followThroughReadinessScore,
      },
      suggestedAction,
      relatedLinks,
      sourceLinksByType,
      timeline,
      riskFlags,
    },
    null,
    2
  );
}

function analyzeOpportunity(input: Record<string, unknown>): string {
  const deepAnalysisScore = typeof input.deep_analysis_score === "number" ? input.deep_analysis_score : 0;
  const title = safeString(input.title);
  const summary = safeString(input.summary);
  const content = safeString(input.content);
  const url = safeString(input.url);
  const sourceDomain = safeString(input.source_domain);
  const publishTime = safeString(input.publish_time) || null;
  const publishTimeRaw = safeString(input.publish_time_raw) || null;
  const publishTimeConfidence = safeNumber(input.publish_time_confidence);
  const isPdf = input.is_pdf === true;
  const text = normalizeWhitespace(`${title} ${summary} ${content}`);
  const scenarios = detectScenarios(text);
  const aiFitScore = scoreAiFit(text, scenarios.tags.length, extractBudgetSignals(text).length);
  const technologies = scenarios.technologies;
  const tags = scenarios.tags;
  const transformationMode = decideTransformationMode(aiFitScore);
  const hasFormalProjectSignal =
    containsFormalAdvanceSignal(text) ||
    containsProjectBodySignal(text);
  const hasWeakProcurementOnly =
    containsIndirectProcurementSignal(text) &&
    !containsFormalAdvanceSignal(text) &&
    !containsProjectBodySignal(text);
  const hasBudgetSupport = extractBudgetSignals(text).length > 0;
  const resolvedPublishTime = resolvePublishInfo({
    text,
    explicitPublishTime: publishTime,
    explicitPublishTimeRaw: publishTimeRaw,
    explicitPublishTimeConfidence: publishTimeConfidence,
    isPdf,
  }).normalized;
  const riskFlags = [
    ...(!hasFormalProjectSignal ? ["缺少正式项目本体采购或服务范围证据"] : []),
    ...(!hasBudgetSupport ? ["预算或最高限价待补证据"] : []),
    ...(hasWeakProcurementOnly ? ["当前仍偏前置采购信号"] : []),
    ...(!resolvedPublishTime ? ["发布时间待进一步核验"] : []),
  ];
  const ownerOrg = extractOrganization(text);
  const sourceLinksByType = {
    main: buildLinkItems(url ? [url] : [], "main", "原始链接"),
    sourceContinuity: [],
    similarCases: [],
    landingCases: [],
    policySupports: [],
    budgetSupports: [],
  };
  const relatedLinks = flattenLinkGroups([sourceLinksByType]);
  const timeline = buildTimelineEntries({
    title,
    publishTime: resolvedPublishTime,
    leadUrl: url,
  });
  const aiValueSummary = buildAiValueSummary({
    title,
    tags,
    technologies,
    transformationMode,
  });

  if (deepAnalysisScore > 0) {
    const suggestedAction = buildDeepSuggestedAction({
      evidenceStrengthScore: deepAnalysisScore,
      hasWeakProcurementOnly,
      hasFormalProjectSignal,
      hasBudgetSupport,
    });
    const actionRationale = buildDeepActionRationale({
      hasWeakProcurementOnly,
      hasFormalProjectSignal,
      hasBudgetSupport,
      publishTime: resolvedPublishTime,
      riskFlags,
    });

    return JSON.stringify(
      {
        analysisMode: "investigation_supplement",
        description: buildDescription({ title, summary, content }),
        ownerOrg,
        scenarioTags: tags,
        recommendedTechnologies: technologies,
        transformationMode,
        analysisSummary: `${title || "该线索"} 更适合从 ${tags.length > 0 ? tags.join("、") : "通用业务提效"} 方向切入，优先考虑 ${technologies.slice(0, 3).join("、") || "大模型问答、知识库检索和流程助手"}。`,
        aiValueSummary,
        aiRisks: riskFlags,
        suggestedAction,
        toolSuggestedAction: suggestedAction,
        actionRationale,
        followUpAction: suggestedAction,
        riskFlags,
        relatedLinks,
        sourceLinksByType,
        timeline,
        evidenceStrengthScore: deepAnalysisScore,
        deepAnalysisScore,
        screeningPreservationNote: "当前为深查补充模式，不覆盖初筛的 leadCategory、opportunityStage、shouldEnterPool 和主评分。",
      },
      null,
      2
    );
  }

  const result = evaluateOpportunity({
    title,
    summary,
    content,
    url,
    sourceDomain,
    publishTime,
    publishTimeRaw,
    publishTimeConfidence,
    isPdf,
  });

  return JSON.stringify(
    {
      leadCategory: result.leadCategory,
      opportunityStage: result.opportunityStage,
      isActionableNow: result.isActionableNow,
      description: result.description,
      ownerOrg: result.ownerOrg,
      scenarioTags: Array.isArray(result.scenarioTags) ? (result.scenarioTags as string[]) : [],
      recommendedTechnologies: Array.isArray(result.recommendedTechnologies)
        ? (result.recommendedTechnologies as string[])
        : [],
      transformationMode,
      aiValueSummary,
      aiRisks: riskFlags,
      suggestedAction: result.suggestedAction,
      followUpAction: result.followUpAction,
      analysisSummary: `${title} 更适合从 ${tags.length > 0 ? tags.join("、") : "通用业务提效"} 方向切入，优先考虑 ${technologies.slice(0, 3).join("、") || "大模型问答和知识库"}。`,
      shouldEnterPool: result.shouldEnterPool,
      relatedLinks: result.relatedLinks,
      sourceLinksByType: result.sourceLinksByType,
      timeline: result.timeline,
      scenarioFitScore: result.scenarioFitScore,
      aiFitScore: result.aiFitScore,
      opportunityMaturityScore: result.opportunityMaturityScore,
      maturityScore: result.maturityScore,
      screeningScore: result.screeningScore,
      totalScore: result.totalScore,
      scoreBreakdown: result.scoreBreakdown,
      scoreReason: result.scoreReason,
    },
    null,
    2
  );
}

function screenOpportunity(input: Record<string, unknown>): string {
  const result = evaluateOpportunity({
    title: safeString(input.title),
    summary: safeString(input.summary),
    content: safeString(input.content),
    url: safeString(input.url),
    sourceDomain: safeString(input.source_domain),
    publishTime: safeString(input.publish_time) || null,
    publishTimeRaw: safeString(input.publish_time_raw) || null,
    publishTimeConfidence: safeNumber(input.publish_time_confidence),
    isPdf: input.is_pdf === true,
  });

  return JSON.stringify(result, null, 2);
}

async function pushResult(input: Record<string, unknown>): Promise<string> {
  const endpoint = safeString(input.endpoint);
  if (!/^https?:\/\//i.test(endpoint)) {
    return JSON.stringify({ error: "push_result 仅支持 http 或 https 地址。" }, null, 2);
  }

  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  const token = safeString(input.bearer_token);
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(input.payload ?? {}),
  });

  const text = await response.text();
  return JSON.stringify(
    {
      endpoint,
      status: response.status,
      ok: response.ok,
      body: truncateText(text, 2000),
    },
    null,
    2
  );
}

export function checkPermission(
  toolName: string,
  input: Record<string, any>,
  mode: PermissionMode = "default",
  _planFilePath?: string
): { action: "allow" | "deny" | "confirm"; message?: string } {
  if (mode === "bypassPermissions") return { action: "allow" };

  if (toolName === "push_result") {
    const endpoint = safeString(input.endpoint);
    if (!endpoint) return { action: "deny", message: "push_result 缺少 endpoint。" };
    if (mode === "dontAsk") return { action: "deny", message: "dontAsk 模式下禁止外部结果回传。" };
    return { action: "confirm", message: `即将向后端回传结果: ${endpoint}` };
  }

  return { action: "allow" };
}

export async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  switch (name) {
    case "search_web":
      return searchWeb(input);
    case "fetch_page":
      return fetchPage(input);
    case "extract_signal":
      return extractSignal(input);
    case "screen_opportunity":
      return screenOpportunity(input);
    case "deep_investigate":
      return deepInvestigate(input);
    case "analyze_opportunity":
      return analyzeOpportunity(input);
    case "push_result":
      return pushResult(input);
    default:
      return JSON.stringify({ error: `未知工具: ${name}` }, null, 2);
  }
}
