import chalk from "chalk";

export function printWelcome() {
  console.log(
    chalk.bold.cyan("\n  AI Opportunity Agent") +
      chalk.gray(" — 政企 AI 商机分析底座\n")
  );
  console.log(chalk.gray("  输入任务说明开始执行，或输入 exit 退出。"));
  console.log(chalk.gray("  命令：/clear /cost\n"));
}

export function printUserPrompt() {
  process.stdout.write(chalk.bold.green("\n> "));
}

export function printAssistantText(text: string) {
  process.stdout.write(text);
}

export function printToolCall(name: string, input: Record<string, any>) {
  const icon = getToolIcon(name);
  const summary = getToolSummary(name, input);
  console.log(chalk.yellow(`\n  ${icon} ${name}`) + (summary ? chalk.gray(` ${summary}`) : ""));
}

export function printToolResult(_name: string, result: string) {
  const maxLen = 600;
  const truncated =
    result.length > maxLen
      ? result.slice(0, maxLen) + chalk.gray(`\n  ... (${result.length} chars total)`)
      : result;
  const lines = truncated.split("\n").map((line) => `  ${line}`);
  console.log(chalk.dim(lines.join("\n")));
}

export function printError(msg: string) {
  console.error(chalk.red(`\n  Error: ${msg}`));
}

export function printConfirmation(message: string): void {
  console.log(chalk.yellow("\n  需要确认: ") + chalk.white(message));
}

export function printDivider() {
  console.log(chalk.gray("\n  " + "─".repeat(50)));
}

export function printCost(inputTokens: number, outputTokens: number) {
  const costIn = (inputTokens / 1_000_000) * 3;
  const costOut = (outputTokens / 1_000_000) * 15;
  const total = costIn + costOut;
  console.log(
    chalk.gray(
      `\n  Tokens: ${inputTokens} in / ${outputTokens} out (~$${total.toFixed(4)})`
    )
  );
}

export function printRetry(attempt: number, max: number, reason: string) {
  console.log(chalk.yellow(`\n  重试 ${attempt}/${max}: ${reason}`));
}

export function printInfo(msg: string) {
  console.log(chalk.cyan(`\n  ℹ ${msg}`));
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;

export function startSpinner(label = "分析中") {
  if (spinnerTimer) return;
  spinnerFrame = 0;
  process.stdout.write(chalk.gray(`\n  ${SPINNER_FRAMES[0]} ${label}...`));
  spinnerTimer = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r${chalk.gray(`  ${SPINNER_FRAMES[spinnerFrame]} ${label}...`)}`);
  }, 80);
}

export function stopSpinner() {
  if (!spinnerTimer) return;
  clearInterval(spinnerTimer);
  spinnerTimer = null;
  process.stdout.write("\r\x1b[K");
}

export function printSubAgentStart(type: string, description: string) {
  console.log(chalk.magenta(`\n  ┌─ 子 Agent [${type}]: ${description}`));
}

export function printSubAgentEnd(type: string, _description: string) {
  console.log(chalk.magenta(`  └─ 子 Agent [${type}] 完成`));
}

function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    search_web: "🌐",
    fetch_page: "📄",
    extract_signal: "🧩",
    screen_opportunity: "🧪",
    deep_investigate: "🔎",
    analyze_opportunity: "📊",
    push_result: "📤",
    agent: "🤖",
  };
  return icons[name] || "🔨";
}

function getToolSummary(name: string, input: Record<string, any>): string {
  switch (name) {
    case "search_web":
      return input.query || "";
    case "fetch_page":
      return input.url || "";
    case "extract_signal":
      return input.title || input.source_name || "";
    case "screen_opportunity":
      return input.title || "";
    case "deep_investigate":
      return input.lead_title || "";
    case "analyze_opportunity":
      return input.title || "";
    case "push_result":
      return input.endpoint || "";
    case "agent":
      return `[${input.type || "analysis"}] ${input.description || ""}`;
    default:
      return "";
  }
}
