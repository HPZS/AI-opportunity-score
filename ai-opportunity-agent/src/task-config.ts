import {
  INVESTIGATION_STORAGE_DIRS,
  INVESTIGATION_TASK_ALIASES,
  buildInvestigationTaskOutputRequirements,
} from "./config/investigation-config.js";
import {
  SCREENING_DEFAULT_CONFIG,
  SCREENING_STORAGE_DIRS,
  SCREENING_TASK_ALIASES,
  buildScreeningTaskOutputRequirements,
  buildScreeningExecutionSummary,
} from "./config/screening-config.js";

export type CanonicalTaskType = "screening" | "investigation" | "ad_hoc_task";

export interface TaskProfile {
  canonicalType: CanonicalTaskType;
  aliases: readonly string[];
  displayName: string;
  buildOutputRequirements: () => string;
  buildExecutionSummary?: () => string;
  storageDirs: {
    runs: string;
    artifact: string;
  } | null;
}

const TASK_PROFILES: TaskProfile[] = [
  {
    canonicalType: "screening",
    aliases: SCREENING_TASK_ALIASES,
    displayName: "初筛任务",
    buildOutputRequirements: () => buildScreeningTaskOutputRequirements(SCREENING_DEFAULT_CONFIG),
    buildExecutionSummary: () => buildScreeningExecutionSummary(SCREENING_DEFAULT_CONFIG),
    storageDirs: SCREENING_STORAGE_DIRS,
  },
  {
    canonicalType: "investigation",
    aliases: INVESTIGATION_TASK_ALIASES,
    displayName: "深查任务",
    buildOutputRequirements: buildInvestigationTaskOutputRequirements,
    storageDirs: INVESTIGATION_STORAGE_DIRS,
  },
];

export function normalizeTaskType(taskType?: string): CanonicalTaskType | undefined {
  if (!taskType) return undefined;
  const normalized = taskType.trim().toLowerCase();
  const profile = TASK_PROFILES.find((item) => item.aliases.includes(normalized));
  if (profile) return profile.canonicalType;
  return normalized ? "ad_hoc_task" : undefined;
}

export function resolveTaskProfile(taskType?: string): TaskProfile {
  const canonicalType = normalizeTaskType(taskType);
  const found = TASK_PROFILES.find((item) => item.canonicalType === canonicalType);
  if (found) return found;
  return {
    canonicalType: "ad_hoc_task",
    aliases: [],
    displayName: "通用任务",
    buildOutputRequirements: buildScreeningTaskOutputRequirements,
    storageDirs: null,
  };
}
