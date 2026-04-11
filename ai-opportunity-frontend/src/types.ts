export interface PagedResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface LeadListItem {
  id: number
  title: string
  organizationName: string | null
  sourceName: string | null
  sourceDomain: string | null
  leadCategory: string | null
  currentStage: string | null
  poolEntryTier: string | null
  status: string | null
  expiryStatus: string | null
  shouldEnterPool: boolean | null
  publishTime: string | null
  compositeScore: number | null
  scenarioTags: string[]
  updatedAt: string | null
}

export interface ScoreResponse {
  scenarioFitScore: number | null
  aiFitScore: number | null
  opportunityMaturityScore: number | null
  screeningScore: number | null
  totalScore: number | null
  deepAnalysisScore: number | null
  evidenceStrengthScore: number | null
  rawCompositeScore: number | null
  compositeScore: number | null
  scoreReason: string | null
  suggestedAction: string | null
  scoreTime: string | null
}

export interface LinkItem {
  label?: string
  url?: string
  type?: string
}

export interface LeadDetail {
  id: number
  externalLeadId: string | null
  title: string
  normalizedTitle: string | null
  url: string | null
  sourceName: string | null
  sourceDomain: string | null
  sourceBucket: string | null
  organizationName: string | null
  leadCategory: string | null
  currentStage: string | null
  isActionableNow: boolean | null
  shouldEnterPool: boolean | null
  poolEntryTier: string | null
  opportunitySignalClass: string | null
  categoryReason: string | null
  description: string | null
  publishTime: string | null
  publishTimeRaw: string | null
  publishTimeConfidence: number | null
  withinTimeWindow: boolean | null
  timeWindowStatus: string | null
  status: string | null
  expiryStatus: string | null
  scenarioTags: string[]
  evidenceSummary: string[]
  recommendedTechnologies: string[]
  relatedLinks: LinkItem[]
  score: ScoreResponse | null
  latestFollowUpAction: string | null
  latestSuggestedAction: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface TimelineItem {
  date?: string
  type?: string
  title?: string
  description?: string
}

export interface LeadDeepAnalysis {
  leadId: number
  sourceContinuity: string | null
  similarCaseSummary: string | null
  landingCaseSummary: string | null
  policySupportSummary: string | null
  budgetSupportSummary: string | null
  competitionAndDeliveryJudgement: string | null
  deepAnalysisConclusion: string | null
  deepAnalysisScore: number | null
  evidenceStrengthScore: number | null
  suggestedAction: string | null
  aiValueSummary: string | null
  aiRisks: string[]
  timeline: TimelineItem[]
  relatedLinks: LinkItem[]
  sourceLinksByType: Record<string, unknown>
  screeningSnapshot: Record<string, unknown>
  finalRecommendation: string | null
  analysisTime: string | null
  updatedAt: string | null
}

export interface AgentTaskSummary {
  id: number
  taskKey: string
  taskType: string
  originalTaskType: string
  modelName: string | null
  savedAt: string | null
  parsed: boolean
  completed: boolean
  taskState: string | null
  attemptCount: number | null
  tokenInput: number | null
  tokenOutput: number | null
  createdAt: string | null
}

export interface AgentTaskResultItem {
  id: number
  leadId: number | null
  resultType: string | null
  sourceBucket: string | null
  rankOrder: number | null
  title: string | null
  payload: Record<string, unknown>
}

export interface AgentTaskDetail {
  id: number
  taskKey: string
  taskType: string
  originalTaskType: string
  modelName: string | null
  savedAt: string | null
  promptText: string | null
  inputFile: string | null
  taskMessage: string | null
  attemptCount: number | null
  stoppedByUser: boolean | null
  completed: boolean | null
  taskState: string | null
  resumable: boolean | null
  resumeKey: string | null
  failureReason: string | null
  tokenInput: number | null
  tokenOutput: number | null
  parsed: boolean | null
  resultPayload: Record<string, unknown>
  items: AgentTaskResultItem[]
  createdAt: string | null
  updatedAt: string | null
}

export interface AgentConfigItem {
  key: string
  value: string | null
  secret: boolean
  configured: boolean
}

export interface AgentSignalSourceOption {
  id: string
  label: string
  description: string
}

export interface AgentKeywordSubscriptionOption {
  id: string
  label: string
  description: string
  keywords: string[]
  preferredSourceProfileIds: string[]
}

export interface CreateAgentSignalSourceRequest {
  id?: string
  label: string
  description?: string
  searchScopes?: string[]
  documentTypes?: string[]
  includeDomains?: string[]
  excludeDomains?: string[]
  queryHints?: string[]
}

export interface CreateAgentKeywordSubscriptionRequest {
  id?: string
  label: string
  description?: string
  keywords: string[]
  preferredSourceProfileIds?: string[]
}

export interface AgentRuntimeConfig {
  agentDir: string
  envFilePath: string
  logsDir: string
  nodeCommand: string
  runInvestigationAfterScreening: boolean | null
  screeningTargetPoolEntryCount: number | null
  screeningOpportunityMode: string
  screeningSubscriptionIds: string[]
  screeningSourceProfileIds: string[]
  screeningExtraKeywords: string[]
  signalSourceOptions: AgentSignalSourceOption[]
  keywordSubscriptionOptions: AgentKeywordSubscriptionOption[]
  envItems: AgentConfigItem[]
}

export interface AgentRuntimeStatus {
  running: boolean
  pid?: number | null
  taskType?: string | null
  promptPreview?: string | null
  logFileName?: string | null
  logFilePath?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  exitCode?: number | null
  autoInvestigationScheduled?: boolean | null
  lastImportedTaskKey?: string | null
  lastImportedAt?: string | null
  lastImportSucceeded?: boolean | null
  lastImportMessage?: string | null
}

export interface AgentRuntimeLogs {
  logFileName: string | null
  logFilePath: string | null
  running: boolean
  updatedAt: string | null
  lines: string[]
}

export interface AgentRuntimeStartRequest {
  taskType: string
  prompt?: string
  inputFile?: string
  model?: string
  runInvestigationAfterScreening?: boolean
  screeningOpportunityMode?: string
  subscriptionIds?: string[]
  sourceProfileIds?: string[]
  extraKeywords?: string[]
  thinking?: boolean
  bypassPermissions?: boolean
}

export interface AgentRuntimeStartResponse {
  started: boolean
  pid: number | null
  taskType: string | null
  promptPreview: string | null
  logFileName: string | null
  logFilePath: string | null
  startedAt: string | null
}

export interface AgentRuntimeStopResponse {
  stopped: boolean
  pid: number | null
}

export interface AgentRuntimeConfigUpdateRequest {
  openAiApiKey?: string
  openAiBaseUrl?: string
  anthropicApiKey?: string
  anthropicBaseUrl?: string
  tavilyApiKey?: string
  defaultModel?: string
  runInvestigationAfterScreening?: boolean
  targetPoolEntryCount?: number
  screeningOpportunityMode?: string
  screeningSubscriptionIds?: string[]
  screeningSourceProfileIds?: string[]
  screeningExtraKeywords?: string[]
}
