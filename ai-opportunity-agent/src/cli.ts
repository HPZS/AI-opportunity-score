#!/usr/bin/env node

import * as readline from "readline";
import { Agent } from "./agent.js";
import { printWelcome, printUserPrompt, printError, printInfo } from "./ui.js";
import { buildTaskResumeKey } from "./investigation-recovery.js";
import { loadSession, getLatestSessionId } from "./session.js";
import { resolveTaskProfile } from "./task-config.js";
import type { PermissionMode } from "./tools.js";
import { getEnvVar, loadEnvFile } from "./env.js";
import { attachExecutionStatsToParsedResult, formatTaskExecutionStats } from "./execution-stats.js";
import { normalizeParsedTaskResult } from "./result-normalizer.js";
import { saveTaskResult } from "./storage.js";
import { buildTaskFailureMessage, buildTaskMessage, extractJsonFromText, runTaskWithSupervisor } from "./task-runner.js";
import { runScreeningSelfImprovementReview } from "./self-improvement.js";

loadEnvFile();

interface ParsedArgs {
  permissionMode: PermissionMode;
  model: string;
  apiBase?: string;
  prompt?: string;
  resume?: boolean;
  thinking?: boolean;
  maxCost?: number;
  maxTurns?: number;
  taskType?: string;
  inputFile?: string;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let permissionMode: PermissionMode = "default";
  let thinking = false;
  let model = getEnvVar("MINI_CLAUDE_MODEL") || "gpt-5.4";
  let apiBase: string | undefined;
  let resume = false;
  let maxCost: number | undefined;
  let maxTurns: number | undefined;
  let taskType: string | undefined;
  let inputFile: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--yolo" || args[i] === "-y") {
      permissionMode = "bypassPermissions";
    } else if (args[i] === "--dont-ask") {
      permissionMode = "dontAsk";
    } else if (args[i] === "--thinking") {
      thinking = true;
    } else if (args[i] === "--model" || args[i] === "-m") {
      model = args[++i] || model;
    } else if (args[i] === "--api-base") {
      apiBase = args[++i];
    } else if (args[i] === "--resume") {
      resume = true;
    } else if (args[i] === "--max-cost") {
      const value = parseFloat(args[++i]);
      if (!Number.isNaN(value)) maxCost = value;
    } else if (args[i] === "--max-turns") {
      const value = parseInt(args[++i], 10);
      if (!Number.isNaN(value)) maxTurns = value;
    } else if (args[i] === "--task-type") {
      taskType = args[++i];
    } else if (args[i] === "--input-file") {
      inputFile = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
Usage: mini-claude [options] [task_prompt]

Options:
  --yolo, -y             跳过确认，直接执行允许的工具
  --dont-ask             对需要确认的外部回传直接拒绝
  --thinking             启用增强推理（Anthropic）
  --model, -m MODEL      指定模型
  --api-base URL         使用 OpenAI 兼容接口地址
  --resume               恢复最近一次会话
  --max-cost USD         费用上限
  --max-turns N          最多 Agent 轮次
  --task-type TYPE       任务类型，例如 screening / investigation
  --input-file PATH      读取 JSON 或文本任务输入
  --help, -h             显示帮助

Examples:
  mini-claude --task-type screening "检索近30天政务热线智能化升级机会"
  mini-claude --task-type investigation --input-file ./sample-task.json
  mini-claude --resume
`);
      process.exit(0);
    } else {
      positional.push(args[i]);
    }
  }

  return {
    permissionMode,
    model,
    apiBase,
    resume,
    thinking,
    maxCost,
    maxTurns,
    taskType,
    inputFile,
    prompt: positional.length > 0 ? positional.join(" ") : undefined,
  };
}

async function runRepl(agent: Agent) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  agent.setConfirmFn(() => {
    return new Promise((resolve) => {
      rl.question("  是否允许继续? (y/n): ", (answer) => {
        resolve(answer.toLowerCase().startsWith("y"));
      });
    });
  });

  let sigintCount = 0;
  process.on("SIGINT", () => {
    if (agent.isProcessing) {
      agent.abort();
      console.log("\n  (已中断)");
      sigintCount = 0;
      printUserPrompt();
    } else {
      sigintCount++;
      if (sigintCount >= 2) {
        console.log("\nBye!\n");
        process.exit(0);
      }
      console.log("\n  再按一次 Ctrl+C 退出。");
      printUserPrompt();
    }
  });

  printWelcome();

  const askQuestion = (): void => {
    printUserPrompt();
    rl.once("line", async (line) => {
      const input = line.trim();
      sigintCount = 0;

      if (!input) {
        askQuestion();
        return;
      }

      if (input === "exit" || input === "quit") {
        console.log("\nBye!\n");
        rl.close();
        process.exit(0);
      }

      if (input === "/clear") {
        agent.clearHistory();
        askQuestion();
        return;
      }

      if (input === "/cost") {
        agent.showCost();
        askQuestion();
        return;
      }

      try {
        await agent.chat(input);
      } catch (error: any) {
        if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
          printError(error.message);
        }
      }

      askQuestion();
    });
  };

  askQuestion();
}

async function main() {
  const { permissionMode, model, apiBase, prompt, resume, thinking, maxCost, maxTurns, taskType, inputFile } = parseArgs();

  let resolvedApiBase = apiBase;
  let resolvedApiKey: string | undefined;
  let resolvedUseOpenAI = !!apiBase;
  const openAiApiKey = getEnvVar("OPENAI_API_KEY");
  const openAiBaseUrl = getEnvVar("OPENAI_BASE_URL");
  const anthropicApiKey = getEnvVar("ANTHROPIC_API_KEY");
  const anthropicBaseUrl = getEnvVar("ANTHROPIC_BASE_URL");

  if (openAiApiKey && openAiBaseUrl) {
    resolvedApiKey = openAiApiKey;
    resolvedApiBase = resolvedApiBase || openAiBaseUrl;
    resolvedUseOpenAI = true;
  } else if (anthropicApiKey) {
    resolvedApiKey = anthropicApiKey;
    resolvedApiBase = resolvedApiBase || anthropicBaseUrl;
    resolvedUseOpenAI = false;
  } else if (openAiApiKey) {
    resolvedApiKey = openAiApiKey;
    resolvedApiBase = resolvedApiBase || openAiBaseUrl;
    resolvedUseOpenAI = true;
  }

  if (!resolvedApiKey && apiBase) {
    resolvedApiKey = openAiApiKey || anthropicApiKey;
    resolvedUseOpenAI = true;
  }

  if (!resolvedApiKey) {
    printError("缺少 API Key。请设置 ANTHROPIC_API_KEY，或设置 OPENAI_API_KEY + OPENAI_BASE_URL。");
    process.exit(1);
  }

  const agent = new Agent({
    permissionMode,
    model,
    thinking,
    maxCostUsd: maxCost,
    maxTurns,
    apiBase: resolvedUseOpenAI ? resolvedApiBase : undefined,
    anthropicBaseURL: !resolvedUseOpenAI ? resolvedApiBase : undefined,
    apiKey: resolvedApiKey,
  });

  if (resume) {
    const sessionId = getLatestSessionId();
    if (sessionId) {
      const session = loadSession(sessionId);
      if (session) {
        agent.restoreSession({
          anthropicMessages: session.anthropicMessages,
          openaiMessages: session.openaiMessages,
        });
      } else {
        printInfo("未找到可恢复的会话。");
      }
    } else {
      printInfo("当前没有历史会话。");
    }
  }

  try {
    let manualStopRequested = false;
    const handleTaskSigint = () => {
      if (manualStopRequested) {
        printInfo("手动终止请求已收到，正在等待当前尝试停止并保存已有结果。");
        return;
      }
      manualStopRequested = true;
      printInfo("收到手动终止请求，正在停止当前尝试。已成功入池的结果会保留并写入结果文件。");
      if (agent.isProcessing) {
        agent.abort();
      }
    };

    let taskExecution = null;
    process.on("SIGINT", handleTaskSigint);
    try {
      taskExecution = await runTaskWithSupervisor(agent, {
        taskType,
        prompt,
        inputFile,
      }, {
        shouldStop: () => manualStopRequested,
      });
    } finally {
      process.off("SIGINT", handleTaskSigint);
    }

    if (taskExecution) {
      const {
        result,
        taskMessage,
        taskType: canonicalTaskType,
        originalTaskType,
        attemptCount,
        stoppedByUser,
        validation,
      } =
        taskExecution;

      if (result.text.trim()) {
        process.stdout.write(`\n${result.text}\n`);
      }

      const toolTrace = agent.exportToolExecutionTrace();

      const saved = saveTaskResult({
        taskType: canonicalTaskType,
        originalTaskType,
        model,
        taskMessage,
        prompt,
        inputFile,
        assistantText: result.text,
        attemptCount,
        stoppedByUser,
        completed: validation.ok,
        taskState: validation.ok ? "completed" : "failed",
        tokens: result.tokens,
        toolTrace,
        resumeKey: buildTaskResumeKey({
          taskType: canonicalTaskType,
          prompt,
          inputFile,
        }),
      });
      printInfo(`任务结果已保存到 ${saved.filePath}`);

      const parsedForStats = attachExecutionStatsToParsedResult(
        canonicalTaskType,
        normalizeParsedTaskResult(canonicalTaskType, extractJsonFromText(result.text)),
        toolTrace
      );
      for (const line of formatTaskExecutionStats(canonicalTaskType, parsedForStats)) {
        printInfo(line);
      }

      try {
        const review = await runScreeningSelfImprovementReview(agent, {
          taskType: canonicalTaskType,
          model,
          prompt,
          taskMessage,
          assistantText: result.text,
          attemptCount,
          validation,
          taskResultFilePath: saved.filePath,
        });
        if (review) {
          printInfo(`持续改进复盘已保存到 ${review.filePath}`);
          if (review.runtimeOverridesFilePath) {
            printInfo(`运行时自修复规则已更新到 ${review.runtimeOverridesFilePath}`);
          }
          if (review.activatedRuntimeGuards && review.activatedRuntimeGuards.length > 0) {
            printInfo(`当前启用的自修复规则: ${review.activatedRuntimeGuards.join(" | ")}`);
          }
        }
      } catch (error: any) {
        printInfo(`持续改进复盘生成失败，已跳过: ${error.message}`);
      }

      if (stoppedByUser) {
        printInfo("任务已按用户请求提前终止；当前已完成尝试中的入池结果已保留。");
        return;
      }

      const failureMessage = buildTaskFailureMessage(validation);
      if (failureMessage) {
        printError(failureMessage);
        process.exit(2);
      }
      return;
    }
  } catch (error: any) {
    const taskProfile = resolveTaskProfile(taskType);
    const canonicalTaskType = taskProfile.canonicalType;
    const taskMessage = buildTaskMessage(taskType, prompt, inputFile);
    const toolTrace = agent.exportToolExecutionTrace();

    if (canonicalTaskType === "investigation" && taskMessage) {
      try {
        const saved = saveTaskResult({
          taskType: canonicalTaskType,
          originalTaskType: taskType || canonicalTaskType,
          model,
          taskMessage,
          prompt,
          inputFile,
          assistantText: "",
          attemptCount: 1,
          stoppedByUser: false,
          completed: false,
          taskState: "partial",
          failureReason: error.message,
          tokens: agent.getTokenUsage(),
          toolTrace,
          resumeKey: buildTaskResumeKey({
            taskType: canonicalTaskType,
            prompt,
            inputFile,
          }),
        });
        printInfo(`深查中断检查点已保存到 ${saved.filePath}`);
      } catch (checkpointError: any) {
        printInfo(`深查中断检查点保存失败，已跳过: ${checkpointError.message}`);
      }
    }

    printError(error.message);
    process.exit(1);
  }

  await runRepl(agent);
}

main();
