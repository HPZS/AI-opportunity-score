import { existsSync, readFileSync } from "fs";
import { join } from "path";

let envLoaded = false;
const loadedEnv: Record<string, string> = {};

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();

  const hashIndex = value.indexOf(" #");
  if (hashIndex >= 0) {
    value = value.slice(0, hashIndex).trim();
  }

  return {
    key,
    value: stripWrappingQuotes(value),
  };
}

export function loadEnvFile(filePath = join(process.cwd(), ".env")): void {
  if (envLoaded) return;
  envLoaded = true;

  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    loadedEnv[parsed.key] = parsed.value;
    process.env[parsed.key] = parsed.value;
  }
}

export function getEnvVar(key: string): string | undefined {
  if (!envLoaded) loadEnvFile();
  return loadedEnv[key];
}
