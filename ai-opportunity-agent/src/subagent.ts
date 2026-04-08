import type { ToolDef } from "./tools.js";
import { toolDefinitions } from "./tools.js";

export type SubAgentType = "screening" | "investigation" | "analysis" | string;

export interface SubAgentConfig {
  systemPrompt: string;
  tools: ToolDef[];
}

const SCREENING_PROMPT = `你是政企 AI 商机分析系统中的初筛子 Agent。

职责：
1. 使用 search_web 和 fetch_page 获取候选信息。
2. 使用 extract_signal 和 screen_opportunity 识别场景、AI 适配度和商机成熟度。
3. 输出简洁、结构化的初筛结论。

要求：
- 优先保证召回和场景识别。
- 不要自由发挥没有证据的结论。
- 如证据不足，明确说明待补证据点。`;

const INVESTIGATION_PROMPT = `你是政企 AI 商机分析系统中的深查子 Agent。

职责：
1. 围绕单条高潜线索补充同源连续性、横向案例、落地验证和政策支撑。
2. 适度扩展检索，但不要发散到无关信息。
3. 结合 deep_investigate 工具输出深查结论。

要求：
- 结论必须围绕“是否值得正式跟进”。
- 输出要突出证据，而不是空泛判断。`;

const ANALYSIS_PROMPT = `你是政企 AI 商机分析系统中的综合分析子 Agent。

职责：
1. 结合初筛和深查结果归纳切入场景。
2. 输出建议技术路径、建议动作和简要解释。
3. 保持结果结构化、可回传、可展示。`;

function getToolsByName(names: string[]): ToolDef[] {
  return toolDefinitions.filter((tool) => names.includes(tool.name));
}

export function getSubAgentConfig(type: SubAgentType): SubAgentConfig {
  switch (type) {
    case "screening":
      return {
        systemPrompt: SCREENING_PROMPT,
        tools: getToolsByName(["search_web", "fetch_page", "extract_signal", "screen_opportunity"]),
      };
    case "investigation":
      return {
        systemPrompt: INVESTIGATION_PROMPT,
        tools: getToolsByName([
          "search_web",
          "fetch_page",
          "extract_signal",
          "deep_investigate",
          "analyze_opportunity",
        ]),
      };
    case "analysis":
    default:
      return {
        systemPrompt: ANALYSIS_PROMPT,
        tools: getToolsByName(["extract_signal", "screen_opportunity", "deep_investigate", "analyze_opportunity"]),
      };
  }
}

export function getAvailableAgentTypes(): { name: string; description: string }[] {
  return [
    { name: "screening", description: "机会初筛与候选线索研判" },
    { name: "investigation", description: "高潜线索深查与补证据分析" },
    { name: "analysis", description: "综合结论整理与建议动作输出" },
  ];
}

export function buildAgentDescriptions(): string {
  const lines = ["# 可用子 Agent 类型", ""];
  for (const item of getAvailableAgentTypes()) {
    lines.push(`- **${item.name}**: ${item.description}`);
  }
  return lines.join("\n");
}
