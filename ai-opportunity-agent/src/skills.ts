// Skills system — discover, parse, and execute .claude/skills/*/SKILL.md
// Mirrors Claude Code's skill architecture: frontmatter metadata + prompt templates.

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename, resolve } from "path";
import { homedir } from "os";
import { parseFrontmatter } from "./frontmatter.js";

// ─── Types ──────────────────────────────────────────────────

export interface SkillDefinition {
  name: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  postTaskOnly?: boolean;
  userInvocable: boolean;
  context: "inline" | "fork";   // inline = inject into conversation, fork = run in sub-agent
  promptTemplate: string;
  source: "builtin" | "project" | "user";
  skillDir: string;
}

const BUILTIN_SCREENING_SELF_IMPROVEMENT_PROMPT = `# Screening 持续改进 Skill

你不是来重跑整轮初筛，也不是来改写用户配置。你的职责是基于本次 screening 的运行证据，产出一份可执行的诊断报告，帮助系统后续自我升级。

## 工作边界

1. 必须尊重用户当前配置的信号源、关键词、订阅词和时间窗，不要建议直接修改这些配置本身。
2. 允许指出当前用户配置带来的覆盖边界或噪声后果，但改进动作应优先落在系统内部逻辑：
   - 搜索编排与 query 拆分
   - 结果过滤
   - 时间窗识别
   - 标题规范化
   - PDF 发布时间与正文日期处理
   - 场景识别与阶段识别
   - shouldEnterPool 判定
   - 分桶与排序
3. 只有在提供的运行证据不足以判断时，才允许用 search_web、fetch_page、extract_signal、screen_opportunity、analyze_opportunity 对个别边界线索做小范围核验。
4. 不要重新发散检索，不要把这份复盘变成一轮新的 screening。

## 你要回答的核心问题

1. 在当前用户配置边界下，为什么没有正常搜索出更匹配的信息？
2. 是否有好的机会因为规则、过滤、时间判定、PDF处理或分桶逻辑被挡掉？
3. 是否有不好的机会被放进当前商机池？
4. 如果垃圾机会偏多，更像是哪些系统问题导致的：
   - query 展开方式有噪声
   - 结果过滤太宽
   - 标题归一化失败
   - 发布时间判断失真
   - 场景/阶段判定太宽
   - shouldEnterPool 闸门过松
5. 下一步应该改哪一层系统逻辑，而不是改用户配置？

## 诊断原则

1. 先看搜索轨迹，再看最终分桶，不要只看最终 JSON。
2. 证据优先级：
   - 本轮 search_web 输入输出摘要
   - 本轮 extract_signal / screen_opportunity 输出
   - 最终结果 JSON
   - 历史复盘摘要
3. 如果一个问题是由用户配置天然收窄带来的，要明确写“这是配置边界，不是系统 bug”；但仍可提出系统侧补偿方案，例如：
   - query 分轮拆解
   - 同配置下的多模板搜索
   - 更严格的结果重排
   - 不同来源类型使用不同过滤器
4. 如果一个问题会导致明显的误入池、误分桶或误时间判断，要优先列为高优先级。

## 输出要求

必须输出严格 JSON，不要输出散文。字段至少包括：

\`\`\`json
{
  "reviewType": "screening_self_improvement",
  "summary": {
    "rootCauseSummary": "一句话总结",
    "priority": "high|medium|low",
    "searchQualityIssueCount": 0,
    "blockedGoodOpportunityCount": 0,
    "admittedBadOpportunityCount": 0
  },
  "configBoundary": {
    "mustRespectUserConfig": true,
    "shouldModifyUserConfig": false,
    "reason": "为什么不能直接改用户配置"
  },
  "diagnosis": {
    "searchQualityIssues": [],
    "blockedGoodOpportunities": [],
    "admittedBadOpportunities": [],
    "ruleIssues": [],
    "evidenceGaps": []
  },
  "recommendedImprovements": {
    "searchLogic": [],
    "ruleLogic": [],
    "normalizationAndExtraction": [],
    "rankingAndBucketing": []
  },
  "notes": []
}
\`\`\`

## 字段口径

### diagnosis.searchQualityIssues

每条至少说明：
- 触发位置：哪一轮搜索、哪个 query 或 source_profile
- 现象：为什么召回不匹配
- 根因：搜索词展开、结果过滤或来源混杂问题
- 证据：来自哪条轨迹

### diagnosis.blockedGoodOpportunities

只有在你能明确看到“线索本身较好，但被系统挡掉”时才填。每条至少说明：
- 线索标题或 URL
- 被挡位置：搜索过滤 / 时间判定 / 阶段判定 / shouldEnterPool / 分桶
- 为什么你认为它是潜在好机会
- 还缺什么证据

### diagnosis.admittedBadOpportunities

只有在你能明确看到“线索质量差，却进入 currentOpportunities 或 shouldEnterPool=true”时才填。每条至少说明：
- 线索标题或 URL
- 入库原因
- 为什么它不该入池
- 应该收紧哪条规则

## 推荐改进口径

改进建议只能落在系统内部，不落在用户配置本身。例如：

- recommendedImprovements.searchLogic
  - 同一用户配置下拆成招采轮、预算轮、政策轮，不混成单个长 query
  - 对热线主题要求标题或摘要命中热线主体词，而不是正文任意位置命中

- recommendedImprovements.ruleLogic
  - 预算公开类文件缺少独立采购或立项推进信号时，不得直接入池
  - 仅有 PDF 正文候选日期且明显过旧时，自动降级为历史/待核验参考

- recommendedImprovements.normalizationAndExtraction
  - 标题是“项目编号”“采购需求”时优先补正式项目名
  - 区分权威发布时间与 PDF 正文候选日期

- recommendedImprovements.rankingAndBucketing
  - historical_case 和 policy_signal 不得因 withinTimeWindow=null 被重新塞回主列表

## 禁止事项

1. 不要建议“直接把用户关键词改成别的”。
2. 不要建议“直接放宽所有规则”。
3. 不要因为结果少就默认系统一定有 bug。
4. 不要凭主观想象补造被挡住的机会。`;

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    name: "opportunity-screening-self-improvement",
    description:
      "对 screening 运行结果做持续改进复盘。用于分析在当前用户配置边界下，为什么没有召回更匹配的信息、为什么好机会被挡、为什么坏机会入库，以及应改进哪些系统内部逻辑。",
    whenToUse:
      "在 screening 任务完成后自动使用；或当 poolEntryCount 偏低、结果噪声偏高、存在误拦截或误入池时使用。",
    allowedTools: ["search_web", "fetch_page", "extract_signal", "screen_opportunity", "analyze_opportunity"],
    postTaskOnly: true,
    userInvocable: false,
    context: "fork",
    promptTemplate: BUILTIN_SCREENING_SELF_IMPROVEMENT_PROMPT,
    source: "builtin",
    skillDir: join(process.cwd(), ".internal-skills", "opportunity-screening-self-improvement"),
  },
];

// ─── Discovery ──────────────────────────────────────────────

let cachedSkills: SkillDefinition[] | null = null;

export function discoverSkills(): SkillDefinition[] {
  if (cachedSkills) return cachedSkills;

  const skills = new Map<string, SkillDefinition>();

  // User-level skills (lower priority)
  const userDir = join(homedir(), ".claude", "skills");
  loadSkillsFromDir(userDir, "user", skills);

  // Project-level skills (higher priority, overwrites user-level)
  for (const projectDir of getProjectSkillDirs()) {
    loadSkillsFromDir(projectDir, "project", skills);
  }

  // Built-in skills (highest priority, does not depend on local skill files)
  for (const skill of BUILTIN_SKILLS) {
    skills.set(skill.name, skill);
  }

  cachedSkills = Array.from(skills.values());
  return cachedSkills;
}

function getProjectSkillDirs(): string[] {
  const dirs: string[] = [];
  let dir = process.cwd();
  while (true) {
    dirs.unshift(join(dir, ".claude", "skills"));
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

function loadSkillsFromDir(
  baseDir: string,
  source: "project" | "user",
  skills: Map<string, SkillDefinition>
): void {
  if (!existsSync(baseDir)) return;
  let entries: string[];
  try {
    entries = readdirSync(baseDir);
  } catch { return; }

  for (const entry of entries) {
    const skillDir = join(baseDir, entry);
    try {
      if (!statSync(skillDir).isDirectory()) continue;
    } catch { continue; }
    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    const skill = parseSkillFile(skillFile, source, skillDir);
    if (skill) skills.set(skill.name, skill);
  }
}

function parseSkillFile(
  filePath: string,
  source: "project" | "user",
  skillDir: string
): SkillDefinition | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);

    const name = meta.name || basename(skillDir) || "unknown";
    const userInvocable = meta["user-invocable"] !== "false";
    const context = meta.context === "fork" ? "fork" as const : "inline" as const;

    // Parse allowed-tools (comma or JSON array format)
    let allowedTools: string[] | undefined;
    if (meta["allowed-tools"]) {
      const raw = meta["allowed-tools"];
      if (raw.startsWith("[")) {
        try { allowedTools = JSON.parse(raw); } catch {
          allowedTools = raw.replace(/[\[\]]/g, "").split(",").map((s) => s.trim());
        }
      } else {
        allowedTools = raw.split(",").map((s) => s.trim());
      }
    }

    return {
      name,
      description: meta.description || "",
      whenToUse: meta.when_to_use || meta["when-to-use"],
      allowedTools,
      postTaskOnly: meta.post_task_only === "true" || meta["post-task-only"] === "true",
      userInvocable,
      context,
      promptTemplate: body,
      source,
      skillDir,
    };
  } catch {
    return null;
  }
}

// ─── Resolution ─────────────────────────────────────────────

export function getSkillByName(name: string): SkillDefinition | null {
  return discoverSkills().find((s) => s.name === name) || null;
}

export function getAdvertisableSkills(): SkillDefinition[] {
  return discoverSkills().filter((skill) => !skill.postTaskOnly);
}

export function resolveSkillPrompt(skill: SkillDefinition, args: string): string {
  let prompt = skill.promptTemplate;
  // Replace $ARGUMENTS and ${ARGUMENTS}
  prompt = prompt.replace(/\$ARGUMENTS|\$\{ARGUMENTS\}/g, args);
  // Replace ${CLAUDE_SKILL_DIR}
  prompt = prompt.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skill.skillDir);
  return prompt;
}

export function executeSkill(
  skillName: string,
  args: string
): { prompt: string; allowedTools?: string[]; context: "inline" | "fork" } | null {
  const skill = getSkillByName(skillName);
  if (!skill) return null;
  return {
    prompt: resolveSkillPrompt(skill, args),
    allowedTools: skill.allowedTools,
    context: skill.context,
  };
}

// ─── System prompt section ──────────────────────────────────

export function buildSkillDescriptions(): string {
  const skills = getAdvertisableSkills();
  if (skills.length === 0) return "";

  const lines = ["# Available Skills", ""];
  const invocable = skills.filter((s) => s.userInvocable);
  const autoOnly = skills.filter((s) => !s.userInvocable);

  if (invocable.length > 0) {
    lines.push("User-invocable skills (user types /<name> to invoke):");
    for (const s of invocable) {
      lines.push(`- **/${s.name}**: ${s.description}`);
      if (s.whenToUse) lines.push(`  When to use: ${s.whenToUse}`);
    }
    lines.push("");
  }

  if (autoOnly.length > 0) {
    lines.push("Auto-invocable skills (use the skill tool when appropriate):");
    for (const s of autoOnly) {
      lines.push(`- **${s.name}**: ${s.description}`);
      if (s.whenToUse) lines.push(`  When to use: ${s.whenToUse}`);
    }
    lines.push("");
  }

  lines.push(
    "To invoke a skill programmatically, use the `skill` tool with the skill name and optional arguments."
  );
  return lines.join("\n");
}

// Reset cache (useful for testing)
export function resetSkillCache(): void {
  cachedSkills = null;
}
