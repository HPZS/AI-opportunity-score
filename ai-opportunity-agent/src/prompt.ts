import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import * as os from "os";
import { SYSTEM_PROMPT_TEMPLATE } from "./config/prompt-config.js";
import { buildMemoryPromptSection } from "./memory.js";
import { buildAgentDescriptions } from "./subagent.js";
import { buildSkillDescriptions } from "./skills.js";

function loadClaudeMd(): string {
  const parts: string[] = [];
  let dir = process.cwd();
  while (true) {
    const file = join(dir, "CLAUDE.md");
    if (existsSync(file)) {
      try {
        parts.unshift(readFileSync(file, "utf-8"));
      } catch {}
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return parts.length > 0
    ? "\n\n# 项目附加指令（CLAUDE.md）\n" + parts.join("\n\n---\n\n")
    : "";
}

export function buildSystemPrompt(): string {
  const date = new Date().toISOString().split("T")[0];
  const platform = `${os.platform()} ${os.arch()}`;
  const shell = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : (process.env.SHELL || "/bin/sh");
  const claudeMd = loadClaudeMd();
  const memorySection = buildMemoryPromptSection();
  const agentSection = buildAgentDescriptions();
  const skillSection = buildSkillDescriptions();

  return SYSTEM_PROMPT_TEMPLATE
    .split("{{cwd}}").join(process.cwd())
    .split("{{date}}").join(date)
    .split("{{platform}}").join(platform)
    .split("{{shell}}").join(shell)
    .split("{{claude_md}}").join(claudeMd)
    .split("{{memory}}").join(memorySection)
    .split("{{agents}}").join(agentSection)
    .split("{{skills}}").join(skillSection);
}
