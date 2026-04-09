import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type JsonRecord = Record<string, unknown>;

export interface RuntimeSelfHealingOverrides {
  version: number;
  updatedAt: string;
  sourceReviewFilePath: string | null;
  taskResultFilePath: string | null;
  activationReasons: string[];
  poolGuards: {
    requireAuthorityPublishTimeForPoolEntry: boolean;
    blockOldPdfWithoutAuthorityPage: boolean;
    disallowPlanningStageActionableByDefault: boolean;
    requireResolvedProjectTitleForCurrentOpportunity: boolean;
  };
  bucketGuards: {
    fallbackToOutOfWindowWhenUrlDateConflicts: boolean;
    runFinalBucketConsistencyCheck: boolean;
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

export function getSelfHealingDir(): string {
  return join(process.cwd(), "data", "self-healing");
}

export function getRuntimeOverridesPath(): string {
  return join(getSelfHealingDir(), "runtime-overrides.json");
}

export function createDefaultRuntimeOverrides(): RuntimeSelfHealingOverrides {
  return {
    version: 1,
    updatedAt: "",
    sourceReviewFilePath: null,
    taskResultFilePath: null,
    activationReasons: [],
    poolGuards: {
      requireAuthorityPublishTimeForPoolEntry: false,
      blockOldPdfWithoutAuthorityPage: false,
      disallowPlanningStageActionableByDefault: false,
      requireResolvedProjectTitleForCurrentOpportunity: false,
    },
    bucketGuards: {
      fallbackToOutOfWindowWhenUrlDateConflicts: false,
      runFinalBucketConsistencyCheck: false,
    },
  };
}

export function loadRuntimeOverrides(): RuntimeSelfHealingOverrides {
  const defaults = createDefaultRuntimeOverrides();
  const path = getRuntimeOverridesPath();
  if (!existsSync(path)) return defaults;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!isRecord(parsed)) return defaults;

    const poolGuards = isRecord(parsed.poolGuards) ? parsed.poolGuards : {};
    const bucketGuards = isRecord(parsed.bucketGuards) ? parsed.bucketGuards : {};

    return {
      version: typeof parsed.version === "number" ? parsed.version : defaults.version,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : defaults.updatedAt,
      sourceReviewFilePath: typeof parsed.sourceReviewFilePath === "string" ? parsed.sourceReviewFilePath : null,
      taskResultFilePath: typeof parsed.taskResultFilePath === "string" ? parsed.taskResultFilePath : null,
      activationReasons: Array.isArray(parsed.activationReasons)
        ? parsed.activationReasons.filter((item): item is string => typeof item === "string")
        : [],
      poolGuards: {
        requireAuthorityPublishTimeForPoolEntry: getBoolean(poolGuards.requireAuthorityPublishTimeForPoolEntry),
        blockOldPdfWithoutAuthorityPage: getBoolean(poolGuards.blockOldPdfWithoutAuthorityPage),
        disallowPlanningStageActionableByDefault: getBoolean(poolGuards.disallowPlanningStageActionableByDefault),
        requireResolvedProjectTitleForCurrentOpportunity: getBoolean(poolGuards.requireResolvedProjectTitleForCurrentOpportunity),
      },
      bucketGuards: {
        fallbackToOutOfWindowWhenUrlDateConflicts: getBoolean(bucketGuards.fallbackToOutOfWindowWhenUrlDateConflicts),
        runFinalBucketConsistencyCheck: getBoolean(bucketGuards.runFinalBucketConsistencyCheck),
      },
    };
  } catch {
    return defaults;
  }
}

function mergeUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function collectPatternMatches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferOverridesFromReview(review: unknown, current: RuntimeSelfHealingOverrides): RuntimeSelfHealingOverrides {
  const next: RuntimeSelfHealingOverrides = {
    ...current,
    poolGuards: { ...current.poolGuards },
    bucketGuards: { ...current.bucketGuards },
    activationReasons: [...current.activationReasons],
  };

  const text = JSON.stringify(review ?? {});

  const timeRiskDetected = collectPatternMatches(text, [
    /旧\s*pdf/iu,
    /pdf.*发布时间/iu,
    /权威公告页发布时间/iu,
    /时间窗判断/iu,
    /路径日期/iu,
    /url.*202[0-9]/iu,
    /显著早于.*时间窗/iu,
  ]);
  if (timeRiskDetected) {
    next.poolGuards.requireAuthorityPublishTimeForPoolEntry = true;
    next.poolGuards.blockOldPdfWithoutAuthorityPage = true;
    next.bucketGuards.fallbackToOutOfWindowWhenUrlDateConflicts = true;
    next.bucketGuards.runFinalBucketConsistencyCheck = true;
    next.activationReasons.push("基于复盘启用：旧 PDF / 发布时间冲突防误入池规则。");
  }

  const planningRiskDetected = collectPatternMatches(text, [
    /规划信号/iu,
    /不得\s*isActionableNow=true/iu,
    /规划信号.*入池/iu,
  ]);
  if (planningRiskDetected) {
    next.poolGuards.disallowPlanningStageActionableByDefault = true;
    next.bucketGuards.runFinalBucketConsistencyCheck = true;
    next.activationReasons.push("基于复盘启用：规划信号缺执行证据时禁止按当前机会入池。");
  }

  const titleRiskDetected = collectPatternMatches(text, [
    /占位标题/iu,
    /正式项目名/iu,
    /正式项目名称/iu,
    /采购需求/iu,
    /招标文件/iu,
    /项目编号/iu,
  ]);
  if (titleRiskDetected) {
    next.poolGuards.requireResolvedProjectTitleForCurrentOpportunity = true;
    next.activationReasons.push("基于复盘启用：占位标题未补全前禁止进入当前机会主列表。");
  }

  next.activationReasons = mergeUnique(next.activationReasons);
  return next;
}

export function updateRuntimeOverridesFromReview(
  review: unknown,
  meta: {
    reviewFilePath?: string | null;
    taskResultFilePath?: string | null;
  } = {}
): { filePath: string; overrides: RuntimeSelfHealingOverrides; changed: boolean } | null {
  if (!isRecord(review)) return null;

  const current = loadRuntimeOverrides();
  const next = inferOverridesFromReview(review, current);
  next.updatedAt = new Date().toISOString();
  next.sourceReviewFilePath = meta.reviewFilePath || null;
  next.taskResultFilePath = meta.taskResultFilePath || null;

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  const filePath = getRuntimeOverridesPath();
  ensureDir(getSelfHealingDir());
  writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");

  return { filePath, overrides: next, changed };
}
