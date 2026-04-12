<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import {
  createAgentKeywordSubscription,
  createAgentSignalSource,
  getAgentRuntimeConfig,
  getAgentRuntimeLogs,
  getAgentRuntimeStatus,
  getTask,
  getTasks,
  startAgentRuntime,
  stopAgentRuntime,
  updateAgentRuntimeConfig,
} from '../api'
import type {
  AgentConfigItem,
  AgentKeywordSubscriptionOption,
  AgentRuntimeConfig,
  AgentRuntimeLogs,
  AgentRuntimeStatus,
  AgentSignalSourceOption,
  AgentTaskDetail,
  AgentTaskSummary,
  CreateAgentKeywordSubscriptionRequest,
  CreateAgentSignalSourceRequest,
  PagedResponse,
} from '../types'
import { formatDate, formatLabel } from '../utils'

type StartMode = 'screening_chain' | 'screening' | 'investigation'
type ConfigDetailView = 'runtime_scope' | 'system' | 'default' | 'topics' | 'sources'

interface StartModeOption {
  value: StartMode
  label: string
  description: string
}

const startModeOptions: StartModeOption[] = [
  {
    value: 'screening_chain',
    label: '初筛 + 深查',
    description: '先执行一轮初筛，命中候选池后自动继续深查。',
  },
  {
    value: 'screening',
    label: '仅初筛',
    description: '只判断本轮哪些线索值得继续关注，不自动进入深查。',
  },
  {
    value: 'investigation',
    label: '仅深查',
    description: '直接对指定任务或输入文件做深查，不再额外执行初筛。',
  },
]

const opportunityModeOptions = [
  { value: 'all', label: '全部启用主题' },
  { value: 'single', label: '仅选中主题' },
]

const config = ref<AgentRuntimeConfig | null>(null)
const status = ref<AgentRuntimeStatus | null>(null)
const logs = ref<AgentRuntimeLogs | null>(null)
const tasks = ref<PagedResponse<AgentTaskSummary> | null>(null)
const selectedTaskId = ref<number | null>(null)
const taskDetail = ref<AgentTaskDetail | null>(null)

const isBootstrapping = ref(false)
const isStarting = ref(false)
const isStopping = ref(false)
const isSavingSystemConfig = ref(false)
const isSavingDefaultConfig = ref(false)
const isCreatingSignalSource = ref(false)
const isCreatingKeywordSubscription = ref(false)
const isLoadingTaskDetail = ref(false)

const pageErrorMessage = ref('')
const pageSuccessMessage = ref('')
const pollTimer = ref<number | null>(null)
const hasInitializedForms = ref(false)

const isSystemConfigModalOpen = ref(false)
const isDefaultConfigModalOpen = ref(false)
const isSignalSourceModalOpen = ref(false)
const isKeywordSubscriptionModalOpen = ref(false)
const isStartTopicModalOpen = ref(false)
const isStartSourceModalOpen = ref(false)
const activeConfigDetailView = ref<ConfigDetailView | null>(null)

const startForm = reactive({
  taskType: 'screening_chain' as StartMode,
  prompt: '',
  inputFile: '',
  model: '',
  screeningOpportunityMode: 'all',
  subscriptionIds: [] as string[],
  sourceProfileIds: [] as string[],
  extraKeywordsText: '',
  thinking: true,
  bypassPermissions: true,
})

const systemConfigForm = reactive({
  openAiApiKey: '',
  openAiBaseUrl: '',
  anthropicApiKey: '',
  anthropicBaseUrl: '',
  tavilyApiKey: '',
  defaultModel: '',
})

const defaultConfigForm = reactive({
  runInvestigationAfterScreening: true,
  targetPoolEntryCount: 3,
  screeningOpportunityMode: 'all',
  screeningSubscriptionIds: [] as string[],
  screeningSourceProfileIds: [] as string[],
  screeningExtraKeywordsText: '',
})

const signalSourceForm = reactive({
  id: '',
  label: '',
  description: '',
  searchScopesText: '',
  documentTypesText: '',
  includeDomainsText: '',
  excludeDomainsText: '',
  queryHintsText: '',
})

const keywordSubscriptionForm = reactive({
  id: '',
  label: '',
  description: '',
  keywordsText: '',
  preferredSourceProfileIds: [] as string[],
})

const isScreeningStart = computed(() => startForm.taskType !== 'investigation')

const envItemMap = computed(() => {
  const map = new Map<string, AgentConfigItem>()

  ;(config.value?.envItems ?? []).forEach((item) => {
    map.set(item.key, item)
  })

  return map
})

const signalSourceMap = computed(() => {
  const map = new Map<string, AgentSignalSourceOption>()

  ;(config.value?.signalSourceOptions ?? []).forEach((item) => {
    map.set(item.id, item)
  })

  return map
})

const keywordSubscriptionMap = computed(() => {
  const map = new Map<string, AgentKeywordSubscriptionOption>()

  ;(config.value?.keywordSubscriptionOptions ?? []).forEach((item) => {
    map.set(item.id, item)
  })

  return map
})

const selectedTopicLabels = computed(() =>
  startForm.subscriptionIds
    .map((id) => keywordSubscriptionMap.value.get(id)?.label || id)
    .filter(Boolean),
)

const selectedSourceLabels = computed(() =>
  startForm.sourceProfileIds
    .map((id) => signalSourceMap.value.get(id)?.label || id)
    .filter(Boolean),
)

const startExtraKeywordList = computed(() => parseTextList(startForm.extraKeywordsText))
const defaultTopicLabels = computed(() =>
  defaultConfigForm.screeningSubscriptionIds
    .map((id) => keywordSubscriptionMap.value.get(id)?.label || id)
    .filter(Boolean),
)
const defaultSourceLabels = computed(() =>
  defaultConfigForm.screeningSourceProfileIds
    .map((id) => signalSourceMap.value.get(id)?.label || id)
    .filter(Boolean),
)
const defaultExtraKeywordList = computed(() =>
  parseTextList(defaultConfigForm.screeningExtraKeywordsText),
)
const defaultOpportunityModeLabel = computed(
  () =>
    opportunityModeOptions.find(
      (option) => option.value === defaultConfigForm.screeningOpportunityMode,
    )?.label || '全部启用主题',
)
const availableTopicOptions = computed(() => config.value?.keywordSubscriptionOptions ?? [])
const availableSourceOptions = computed(() => config.value?.signalSourceOptions ?? [])
const isConfigDetailModalOpen = computed(() => activeConfigDetailView.value !== null)

const selectedModeSummary = computed(() => {
  return startModeOptions.find((item) => item.value === startForm.taskType) ?? startModeOptions[0]
})

const metrics = computed(() => {
  const activeMode =
    startForm.taskType === 'screening_chain'
      ? '初筛后自动深查'
      : startForm.taskType === 'screening'
        ? '仅初筛'
        : '仅深查'

  return [
    {
      label: '当前运行状态',
      value: status.value?.running ? '运行中' : '空闲',
      hint: status.value?.running
        ? `任务类型：${formatLabel(status.value.taskType || '--')}`
        : '当前没有正在执行的智能体任务',
    },
    {
      label: '默认联动方式',
      value:
        config.value?.runInvestigationAfterScreening === false ? '仅初筛' : '初筛后自动深查',
      hint: `本轮启动方式：${activeMode}`,
    },
    {
      label: '最近入库结果',
      value: status.value?.lastImportedTaskKey || '--',
      hint: status.value?.lastImportedAt
        ? `入库时间：${formatDate(status.value.lastImportedAt)}`
        : '暂时还没有新的自动入库记录',
    },
  ]
})

const currentScopeSummary = computed(() => {
  if (!isScreeningStart.value) {
    return [
      { label: '当前模式', value: '仅深查' },
      {
        label: '任务输入',
        value: startForm.inputFile.trim() || '使用任务提示直接发起深查',
      },
      {
        label: '补充说明',
        value: '本轮不会再从信号源筛选线索，而是直接对指定内容做深查。',
      },
    ]
  }

  return [
    {
      label: '机会类型',
      value: startForm.screeningOpportunityMode === 'single' ? '仅选中主题' : '全部启用主题',
    },
    {
      label: '主题订阅',
      value: joinOrFallback(selectedTopicLabels.value, '使用默认主题'),
    },
    {
      label: '信号源',
      value: joinOrFallback(selectedSourceLabels.value, '使用默认信号源'),
    },
    {
      label: '补充关键词',
      value: joinOrFallback(startExtraKeywordList.value, '未额外添加'),
    },
  ]
})


const systemConfigSummary = computed(() => [
  {
    label: 'OpenAI',
    value: readConfiguredSummary('OPENAI_API_KEY', 'OPENAI_BASE_URL'),
  },
  {
    label: 'Anthropic',
    value: readConfiguredSummary('ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL'),
  },
  {
    label: 'Tavily',
    value: envItemMap.value.get('TAVILY_API_KEY')?.configured ? '已配置 Key' : '未配置',
  },
  {
    label: '默认模型',
    value: envItemMap.value.get('MINI_CLAUDE_MODEL')?.value || '未设置',
  },
])


const defaultConfigSummary = computed(() => [
  {
    label: '默认运行方式',
    value: defaultConfigForm.runInvestigationAfterScreening ? '初筛 + 深查' : '仅初筛',
  },
  {
    label: '候选池目标数',
    value: String(defaultConfigForm.targetPoolEntryCount || '--'),
  },
  {
    label: '默认主题',
    value: joinOrFallback(
      defaultConfigForm.screeningSubscriptionIds.map(
        (id) => keywordSubscriptionMap.value.get(id)?.label || id,
      ),
      '未设置',
    ),
  },
  {
    label: '默认信号源',
    value: joinOrFallback(
      defaultConfigForm.screeningSourceProfileIds.map(
        (id) => signalSourceMap.value.get(id)?.label || id,
      ),
      '未设置',
    ),
  },
])

const managementConfigSummary = computed(() => [
  {
    label: '系统配置',
    value: String(
      systemConfigSummary.value.filter(
        (item) => !item.value.includes('未配置') && !item.value.includes('未设置'),
      ).length,
    ),
    hint: '已完成配置的摘要项',
  },
  {
    label: '默认目标数',
    value: String(defaultConfigForm.targetPoolEntryCount || 0),
    hint: defaultConfigForm.runInvestigationAfterScreening ? '默认初筛后继续深查' : '默认仅初筛',
  },
  {
    label: '主题 / 信号源',
    value: `${availableTopicOptions.value.length} / ${availableSourceOptions.value.length}`,
    hint: '可用主题数 / 可用信号源数',
  },
])


const configDetailMeta = computed(() => {
  switch (activeConfigDetailView.value) {
    case 'system':
      return {
        eyebrow: '系统参数',
        title: '系统配置详情',
        description: '查看当前运行环境变量、模型和接口配置状态。',
      }
    case 'default':
      return {
        eyebrow: '默认参数',
        title: '默认筛选配置详情',
        description: '查看默认筛选策略、主题、信号源和补充关键词。',
      }
    case 'topics':
      return {
        eyebrow: '主题参数',
        title: '主题订阅详情',
        description: '查看主题关键词，以及默认和本轮的启用状态。',
      }
    case 'sources':
      return {
        eyebrow: '信号源参数',
        title: '信号源详情',
        description: '查看信号源定义，以及默认和本轮的启用状态。',
      }
    case 'runtime_scope':
    default:
      return {
        eyebrow: '运行参数',
        title: '本轮任务详情',
        description: '查看本轮运行范围、已选筛选项和补充关键词。',
      }
  }
})

watch(selectedTaskId, async (value) => {
  if (!value) {
    taskDetail.value = null
    return
  }

  await loadTaskDetail(value)
})

onMounted(async () => {
  await refreshPage(true)

  pollTimer.value = window.setInterval(() => {
    void refreshPage()
  }, 5000)
})

onUnmounted(() => {
  if (pollTimer.value !== null) {
    window.clearInterval(pollTimer.value)
  }
})

function readConfiguredSummary(secretKey: string, urlKey: string) {
  const secret = envItemMap.value.get(secretKey)
  const url = envItemMap.value.get(urlKey)

  if (!secret?.configured) {
    return '未配置'
  }

  return url?.value ? '已配置 Key / ' + url.value : '已配置 Key'
}

function joinOrFallback(values: string[], fallback: string) {
  const list = values.filter((item) => item && item.trim())
  return list.length ? list.join('、') : fallback
}

function parseTextList(value: string) {
  return value
    .split(/\r?\n|,|;|，|；/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function ensureStringArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? [...value] : []
}

function isTopicEnabledInDefault(id: string) {
  return (
    defaultConfigForm.screeningOpportunityMode === 'all' ||
    defaultConfigForm.screeningSubscriptionIds.includes(id)
  )
}

function isTopicEnabledInCurrent(id: string) {
  return (
    startForm.screeningOpportunityMode === 'all' ||
    startForm.subscriptionIds.includes(id)
  )
}

function isSourceEnabledInDefault(id: string) {
  return defaultConfigForm.screeningSourceProfileIds.includes(id)
}

function isSourceEnabledInCurrent(id: string) {
  return startForm.sourceProfileIds.includes(id)
}

function getEnvValue(key: string) {
  const item = envItemMap.value.get(key)
  return item?.secret ? '' : item?.value || ''
}

function initializeForms(runtimeConfig: AgentRuntimeConfig) {
  const nextStartMode: StartMode =
    runtimeConfig.runInvestigationAfterScreening === false ? 'screening' : 'screening_chain'

  startForm.taskType = nextStartMode
  startForm.model = envItemMap.value.get('MINI_CLAUDE_MODEL')?.value || ''
  startForm.screeningOpportunityMode = runtimeConfig.screeningOpportunityMode || 'all'
  startForm.subscriptionIds = ensureStringArray(runtimeConfig.screeningSubscriptionIds)
  startForm.sourceProfileIds = ensureStringArray(runtimeConfig.screeningSourceProfileIds)
  startForm.extraKeywordsText = ensureStringArray(runtimeConfig.screeningExtraKeywords).join('\n')

  defaultConfigForm.runInvestigationAfterScreening =
    runtimeConfig.runInvestigationAfterScreening !== false
  defaultConfigForm.targetPoolEntryCount = runtimeConfig.screeningTargetPoolEntryCount || 3
  defaultConfigForm.screeningOpportunityMode = runtimeConfig.screeningOpportunityMode || 'all'
  defaultConfigForm.screeningSubscriptionIds = ensureStringArray(
    runtimeConfig.screeningSubscriptionIds,
  )
  defaultConfigForm.screeningSourceProfileIds = ensureStringArray(
    runtimeConfig.screeningSourceProfileIds,
  )
  defaultConfigForm.screeningExtraKeywordsText = ensureStringArray(
    runtimeConfig.screeningExtraKeywords,
  ).join('\n')
}

function syncFormsFromConfig(runtimeConfig: AgentRuntimeConfig) {
  config.value = runtimeConfig
  initializeForms(runtimeConfig)
  hasInitializedForms.value = true
}

function resetStartFormFromConfig() {
  if (!config.value) {
    return
  }

  initializeForms(config.value)
  pageSuccessMessage.value = '本轮配置已恢复为当前默认配置。'
}

async function refreshPage(includeConfig = false) {
  if (includeConfig) {
    isBootstrapping.value = true
  }

  pageErrorMessage.value = ''

  try {
    const requests: Array<Promise<unknown>> = [
      getAgentRuntimeStatus(),
      getAgentRuntimeLogs(200),
      getTasks(0, 10),
    ]

    if (includeConfig || !hasInitializedForms.value) {
      requests.unshift(getAgentRuntimeConfig())
    }

    const [maybeConfig, maybeStatus, maybeLogs, maybeTasks] = await Promise.all(requests)

    if (includeConfig || !hasInitializedForms.value) {
      syncFormsFromConfig(maybeConfig as AgentRuntimeConfig)
      status.value = maybeStatus as AgentRuntimeStatus
      logs.value = maybeLogs as AgentRuntimeLogs | null
      tasks.value = maybeTasks as PagedResponse<AgentTaskSummary>
    } else {
      status.value = maybeConfig as AgentRuntimeStatus
      logs.value = maybeStatus as AgentRuntimeLogs | null
      tasks.value = maybeLogs as PagedResponse<AgentTaskSummary>
    }

    const firstTaskId = tasks.value?.content[0]?.id ?? null
    if (!selectedTaskId.value && firstTaskId) {
      selectedTaskId.value = firstTaskId
    }
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '任务页数据加载失败'
  } finally {
    isBootstrapping.value = false
  }
}

async function loadTaskDetail(id: number) {
  isLoadingTaskDetail.value = true

  try {
    taskDetail.value = await getTask(id)
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '任务详情加载失败'
  } finally {
    isLoadingTaskDetail.value = false
  }
}

function toggleId(target: string[], id: string) {
  const index = target.indexOf(id)
  if (index >= 0) {
    target.splice(index, 1)
    return
  }

  target.push(id)
}

function openSystemConfigModal() {
  systemConfigForm.openAiApiKey = ''
  systemConfigForm.openAiBaseUrl = getEnvValue('OPENAI_BASE_URL')
  systemConfigForm.anthropicApiKey = ''
  systemConfigForm.anthropicBaseUrl = getEnvValue('ANTHROPIC_BASE_URL')
  systemConfigForm.tavilyApiKey = ''
  systemConfigForm.defaultModel = envItemMap.value.get('MINI_CLAUDE_MODEL')?.value || ''
  isSystemConfigModalOpen.value = true
}

function openDefaultConfigModal() {
  if (!config.value) {
    return
  }

  defaultConfigForm.runInvestigationAfterScreening =
    config.value.runInvestigationAfterScreening !== false
  defaultConfigForm.targetPoolEntryCount = config.value.screeningTargetPoolEntryCount || 3
  defaultConfigForm.screeningOpportunityMode = config.value.screeningOpportunityMode || 'all'
  defaultConfigForm.screeningSubscriptionIds = ensureStringArray(
    config.value.screeningSubscriptionIds,
  )
  defaultConfigForm.screeningSourceProfileIds = ensureStringArray(
    config.value.screeningSourceProfileIds,
  )
  defaultConfigForm.screeningExtraKeywordsText = ensureStringArray(
    config.value.screeningExtraKeywords,
  ).join('\n')
  isDefaultConfigModalOpen.value = true
}

function openSignalSourceModal() {
  signalSourceForm.id = ''
  signalSourceForm.label = ''
  signalSourceForm.description = ''
  signalSourceForm.searchScopesText = ''
  signalSourceForm.documentTypesText = ''
  signalSourceForm.includeDomainsText = ''
  signalSourceForm.excludeDomainsText = ''
  signalSourceForm.queryHintsText = ''
  isSignalSourceModalOpen.value = true
}

function openKeywordSubscriptionModal() {
  keywordSubscriptionForm.id = ''
  keywordSubscriptionForm.label = ''
  keywordSubscriptionForm.description = ''
  keywordSubscriptionForm.keywordsText = ''
  keywordSubscriptionForm.preferredSourceProfileIds = []
  isKeywordSubscriptionModalOpen.value = true
}

function openConfigDetailModal(view: ConfigDetailView) {
  activeConfigDetailView.value = view
}

function closeConfigDetailModal() {
  activeConfigDetailView.value = null
}

function openStartTopicModal() {
  isStartTopicModalOpen.value = true
}

function openStartSourceModal() {
  isStartSourceModalOpen.value = true
}

async function handleStart() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''

  isStarting.value = true

  try {
    const payload = {
      prompt: startForm.prompt.trim() || undefined,
      inputFile: startForm.inputFile.trim() || undefined,
      model: startForm.model.trim() || undefined,
      thinking: startForm.thinking,
      bypassPermissions: startForm.bypassPermissions,
      taskType: 'screening',
      runInvestigationAfterScreening: undefined as boolean | undefined,
      screeningOpportunityMode: undefined as string | undefined,
      subscriptionIds: undefined as string[] | undefined,
      sourceProfileIds: undefined as string[] | undefined,
      extraKeywords: undefined as string[] | undefined,
    }

    if (startForm.taskType === 'investigation') {
      payload.taskType = 'investigation'
    } else {
      payload.taskType = 'screening'
      payload.runInvestigationAfterScreening = startForm.taskType === 'screening_chain'
      payload.screeningOpportunityMode = startForm.screeningOpportunityMode
      payload.subscriptionIds = [...startForm.subscriptionIds]
      payload.sourceProfileIds = [...startForm.sourceProfileIds]
      payload.extraKeywords = parseTextList(startForm.extraKeywordsText)
    }

    await startAgentRuntime(payload)
    pageSuccessMessage.value =
      startForm.taskType === 'screening_chain'
        ? '任务已启动：本轮会先初筛，再自动进入深查。'
        : startForm.taskType === 'screening'
          ? '任务已启动：本轮只执行初筛。'
          : '任务已启动：本轮直接执行深查。'

    await refreshPage()
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '启动任务失败'
  } finally {
    isStarting.value = false
  }
}

async function handleStop() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''
  isStopping.value = true

  try {
    await stopAgentRuntime()
    pageSuccessMessage.value = '已发送停止指令。'
    await refreshPage()
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '停止任务失败'
  } finally {
    isStopping.value = false
  }
}

async function handleSaveSystemConfig() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''
  isSavingSystemConfig.value = true

  try {
    const updatedConfig = await updateAgentRuntimeConfig({
      openAiApiKey: systemConfigForm.openAiApiKey.trim() || undefined,
      openAiBaseUrl: systemConfigForm.openAiBaseUrl.trim() || undefined,
      anthropicApiKey: systemConfigForm.anthropicApiKey.trim() || undefined,
      anthropicBaseUrl: systemConfigForm.anthropicBaseUrl.trim() || undefined,
      tavilyApiKey: systemConfigForm.tavilyApiKey.trim() || undefined,
      defaultModel: systemConfigForm.defaultModel.trim() || undefined,
    })

    syncFormsFromConfig(updatedConfig)
    isSystemConfigModalOpen.value = false
    pageSuccessMessage.value = '系统级配置已更新。'
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '保存系统配置失败'
  } finally {
    isSavingSystemConfig.value = false
  }
}

async function handleSaveDefaultConfig() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''
  isSavingDefaultConfig.value = true

  try {
    const updatedConfig = await updateAgentRuntimeConfig({
      runInvestigationAfterScreening: defaultConfigForm.runInvestigationAfterScreening,
      targetPoolEntryCount: defaultConfigForm.targetPoolEntryCount,
      screeningOpportunityMode: defaultConfigForm.screeningOpportunityMode,
      screeningSubscriptionIds: [...defaultConfigForm.screeningSubscriptionIds],
      screeningSourceProfileIds: [...defaultConfigForm.screeningSourceProfileIds],
      screeningExtraKeywords: parseTextList(defaultConfigForm.screeningExtraKeywordsText),
    })

    syncFormsFromConfig(updatedConfig)
    isDefaultConfigModalOpen.value = false
    pageSuccessMessage.value = '默认筛选配置已更新。'
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '保存默认筛选配置失败'
  } finally {
    isSavingDefaultConfig.value = false
  }
}

async function handleCreateSignalSource() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''

  if (!signalSourceForm.label.trim()) {
    pageErrorMessage.value = '请先填写信号源名称。'
    return
  }

  isCreatingSignalSource.value = true

  try {
    const payload: CreateAgentSignalSourceRequest = {
      id: signalSourceForm.id.trim() || undefined,
      label: signalSourceForm.label.trim(),
      description: signalSourceForm.description.trim() || undefined,
      searchScopes: parseTextList(signalSourceForm.searchScopesText),
      documentTypes: parseTextList(signalSourceForm.documentTypesText),
      includeDomains: parseTextList(signalSourceForm.includeDomainsText),
      excludeDomains: parseTextList(signalSourceForm.excludeDomainsText),
      queryHints: parseTextList(signalSourceForm.queryHintsText),
    }

    const updatedConfig = await createAgentSignalSource(payload)
    syncFormsFromConfig(updatedConfig)
    isSignalSourceModalOpen.value = false
    pageSuccessMessage.value = '新的信号源已添加。'
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '新增信号源失败'
  } finally {
    isCreatingSignalSource.value = false
  }
}

async function handleCreateKeywordSubscription() {
  pageErrorMessage.value = ''
  pageSuccessMessage.value = ''

  if (!keywordSubscriptionForm.label.trim()) {
    pageErrorMessage.value = '请先填写主题名称。'
    return
  }

  const keywords = parseTextList(keywordSubscriptionForm.keywordsText)

  if (!keywords.length) {
    pageErrorMessage.value = '请至少填写一个关键词。'
    return
  }

  isCreatingKeywordSubscription.value = true

  try {
    const payload: CreateAgentKeywordSubscriptionRequest = {
      id: keywordSubscriptionForm.id.trim() || undefined,
      label: keywordSubscriptionForm.label.trim(),
      description: keywordSubscriptionForm.description.trim() || undefined,
      keywords,
      preferredSourceProfileIds: [...keywordSubscriptionForm.preferredSourceProfileIds],
    }

    const updatedConfig = await createAgentKeywordSubscription(payload)
    syncFormsFromConfig(updatedConfig)
    isKeywordSubscriptionModalOpen.value = false
    pageSuccessMessage.value = '新的关键词主题已添加。'
  } catch (error) {
    pageErrorMessage.value = error instanceof Error ? error.message : '新增关键词主题失败'
  } finally {
    isCreatingKeywordSubscription.value = false
  }
}

function taskResultPreview() {
  if (!taskDetail.value?.items?.length) {
    return []
  }

  return taskDetail.value.items.slice(0, 4).map((item) => {
    const payload = item.payload ?? {}
    const preview =
      payload.finalRecommendation ??
      payload.reason ??
      payload.description ??
      payload.summary ??
      '暂无摘要'

    return {
      id: item.id,
      type: item.resultType || 'result',
      title: item.title || '未命名结果',
      preview: String(preview),
    }
  })
}
</script>

<template>
  <main class="page">
    <section class="hero-card hero-card--metrics">
      <article v-for="item in metrics" :key="item.label" class="hero-metric hero-metric--dense">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </section>

    <p v-if="pageErrorMessage" class="alert-error">{{ pageErrorMessage }}</p>
    <p v-if="pageSuccessMessage" class="alert-success">{{ pageSuccessMessage }}</p>

    <section class="agent-grid">
      <article class="panel runtime-card agent-management-panel">
        <div class="panel__header">
          <div>
            <p class="section-eyebrow">智能体管理</p>
            <h2>启动与配置</h2>
          </div>
          <span class="status-chip" :class="{ 'status-chip--off': !status?.running }">
            {{ status?.running ? 'Agent 运行中' : 'Agent 空闲中' }}
          </span>
        </div>

        <section class="management-overview-grid">
          <div v-for="item in managementConfigSummary" :key="item.label" class="summary-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.hint }}</small>
          </div>
        </section>

        <section class="management-overview-grid management-overview-grid--panels">
          <div class="summary-section">
            <div class="summary-section__header">
              <div>
                <strong>系统配置</strong>
                <span>管理 AI Key、Base URL 和默认模型。</span>
              </div>
              <div class="summary-section__actions">
                <button class="button-secondary" type="button" @click="openConfigDetailModal('system')">
                  查看参数
                </button>
                <button class="button-secondary" type="button" @click="openSystemConfigModal">
                  编辑配置
                </button>
              </div>
            </div>

            <div class="scope-summary__grid">
              <div v-for="item in systemConfigSummary" :key="item.label" class="summary-card">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-section__header">
              <div>
                <strong>默认筛选配置</strong>
                <span>管理默认运行方式、目标池规模和筛选范围。</span>
              </div>
              <div class="summary-section__actions">
                <button class="button-secondary" type="button" @click="openConfigDetailModal('default')">
                  查看参数
                </button>
                <button class="button-secondary" type="button" @click="openDefaultConfigModal">
                  编辑配置
                </button>
              </div>
            </div>

            <div class="scope-summary__grid">
              <div v-for="item in defaultConfigSummary" :key="item.label" class="summary-card">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>

          <div class="summary-section">
            <div class="summary-section__header">
              <div>
                <strong>主题与信号源</strong>
                <span>在这里新增条目，并通过弹窗查看详细参数。</span>
              </div>
              <div class="summary-section__actions">
                <button class="button-secondary" type="button" @click="openConfigDetailModal('topics')">
                  主题参数
                </button>
                <button class="button-secondary" type="button" @click="openConfigDetailModal('sources')">
                  信号源参数
                </button>
              </div>
            </div>

            <div class="scope-summary__grid">
              <div class="summary-card">
                <span>主题</span>
                <strong>{{ availableTopicOptions.length }}</strong>
              </div>
              <div class="summary-card">
                <span>信号源</span>
                <strong>{{ availableSourceOptions.length }}</strong>
              </div>
            </div>

            <div class="config-toolbar">
              <button class="button-secondary" type="button" @click="openSignalSourceModal">
                新增信号源
              </button>
              <button class="button-secondary" type="button" @click="openKeywordSubscriptionModal">
                新增主题
              </button>
            </div>
          </div>
        </section>

        <div class="mode-toggle-grid">
          <button
            v-for="item in startModeOptions"
            :key="item.value"
            type="button"
            class="mode-tile"
            :class="{ 'mode-tile--active': startForm.taskType === item.value }"
            @click="startForm.taskType = item.value"
          >
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
          </button>
        </div>

        <div class="runtime-sticky-bar">
          <div class="runtime-sticky-bar__summary">
            <strong>{{ selectedModeSummary.label }}</strong>
            <span>{{ selectedModeSummary.description }}</span>
          </div>

          <div class="runtime-sticky-bar__controls">
            <div class="checkbox-row">
              <label class="checkbox-pill">
                <input v-model="startForm.thinking" type="checkbox" />
                <span>开启深度思考</span>
              </label>
              <label class="checkbox-pill">
                <input v-model="startForm.bypassPermissions" type="checkbox" />
                <span>跳过权限检查</span>
              </label>
            </div>

            <div class="runtime-actions runtime-actions--top">
              <button
                class="button-primary"
                type="button"
                :disabled="isStarting || status?.running"
                @click="handleStart"
              >
                {{ isStarting ? '启动中...' : '启动任务' }}
              </button>
              <button
                class="button-secondary"
                type="button"
                :disabled="isStopping || !status?.running"
                @click="handleStop"
              >
                {{ isStopping ? '停止中...' : '停止任务' }}
              </button>
              <button class="button-secondary" type="button" @click="resetStartFormFromConfig">
                恢复默认
              </button>
              <button class="button-secondary" type="button" @click="refreshPage(true)">
                {{ isBootstrapping ? '刷新中...' : '刷新页面' }}
              </button>
            </div>
          </div>
        </div>

        <div class="scope-summary">
          <div class="scope-summary__header">
            <div>
              <p class="section-eyebrow">运行范围</p>
              <h3>{{ isScreeningStart ? '本轮初筛范围' : '本轮深查范围' }}</h3>
            </div>
            <div class="summary-section__actions">
              <span class="tag">{{ selectedModeSummary.label }}</span>
              <button class="button-secondary" type="button" @click="openConfigDetailModal('runtime_scope')">
                查看详情
              </button>
            </div>
          </div>

          <div class="scope-summary__grid">
            <div v-for="item in currentScopeSummary" :key="item.label" class="summary-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </div>
        <div class="config-grid config-grid--runtime">
          <label class="field">
            <span>任务提示</span>
            <textarea
              v-model="startForm.prompt"
              class="textarea"
              rows="6"
              placeholder="填写任务意图、初筛重点或深查要求"
            />
          </label>

          <div class="config-grid">
            <label class="field">
              <span>输入文件</span>
              <input
                v-model.trim="startForm.inputFile"
                type="text"
                placeholder="例如：data/task-results/xxx.json"
              />
            </label>

            <label class="field">
              <span>模型</span>
              <input
                v-model.trim="startForm.model"
                type="text"
                placeholder="留空则使用默认模型"
              />
            </label>
          </div>
        </div>

        <template v-if="isScreeningStart">
          <div class="config-grid config-grid--runtime">
            <label class="field">
              <span>机会类型策略</span>
              <select v-model="startForm.screeningOpportunityMode">
                <option
                  v-for="option in opportunityModeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="config-grid config-grid--runtime">
            <article class="selection-summary-card">
              <div class="selection-summary-card__header">
                <div>
                  <strong>主题订阅</strong>
                  <span>本轮任务使用的主题统一在弹窗内查看和勾选。</span>
                </div>
                <button class="button-secondary" type="button" @click="openStartTopicModal">
                  查看全部
                </button>
              </div>
              <p>{{ joinOrFallback(selectedTopicLabels, '未选择主题') }}</p>
              <small>已选 {{ startForm.subscriptionIds.length }} 项</small>
            </article>

            <article class="selection-summary-card">
              <div class="selection-summary-card__header">
                <div>
                  <strong>信号源</strong>
                  <span>本轮任务使用的信号源统一在弹窗内查看和勾选。</span>
                </div>
                <button class="button-secondary" type="button" @click="openStartSourceModal">
                  查看全部
                </button>
              </div>
              <p>{{ joinOrFallback(selectedSourceLabels, '未选择信号源') }}</p>
              <small>已选 {{ startForm.sourceProfileIds.length }} 项</small>
            </article>
          </div>

          <label class="field">
            <span>补充关键词</span>
            <textarea
              v-model="startForm.extraKeywordsText"
              class="textarea"
              rows="4"
              placeholder="一行一个，或使用逗号分隔"
            />
          </label>
        </template>
      </article>
    </section>

    <section class="agent-grid agent-grid--bottom">
      <article class="panel log-card">
        <div class="panel__header">
          <div>
            <p class="section-eyebrow">运行日志</p>
            <h2>运行日志</h2>
          </div>
          <div class="log-meta">
            <span>{{ logs?.logFileName || '暂无日志文件' }}</span>
            <button class="button-secondary" type="button" @click="refreshPage()">
              刷新日志
            </button>
          </div>
        </div>

        <pre class="log-console">{{ logs?.lines?.join(`\n`) || '当前还没有可展示的日志。' }}</pre>
      </article>

      <article class="panel runtime-card">
        <div class="panel__header">
          <div>
            <p class="section-eyebrow">最近任务</p>
            <h2>最近任务批次</h2>
          </div>
          <span class="tag">共 {{ tasks?.totalElements ?? 0 }} 条</span>
        </div>

        <div class="task-history">
          <div class="task-list-column">
            <button
              v-for="item in tasks?.content ?? []"
              :key="item.id"
              type="button"
              class="task-card-compact"
              :class="{ 'task-card-compact--active': selectedTaskId === item.id }"
              @click="selectedTaskId = item.id"
            >
              <div class="task-card-compact__top">
                <strong>{{ formatLabel(item.taskType) }}</strong>
                <span>{{ formatDate(item.savedAt) }}</span>
              </div>
              <p>{{ item.taskKey }}</p>
              <small>
                {{ item.modelName || '--' }} / {{ item.completed ? '已完成' : '进行中' }}
              </small>
            </button>

            <div v-if="!(tasks?.content.length)" class="empty-card">当前还没有任务记录。</div>
          </div>

          <div class="task-detail-column">
            <div v-if="isLoadingTaskDetail" class="empty-card">任务详情加载中...</div>

            <template v-else-if="taskDetail">
              <div class="scope-summary__grid">
                <div class="summary-card">
                  <span>任务类型</span>
                  <strong>{{ formatLabel(taskDetail.taskType) }}</strong>
                </div>
                <div class="summary-card">
                  <span>保存时间</span>
                  <strong>{{ formatDate(taskDetail.savedAt) }}</strong>
                </div>
                <div class="summary-card">
                  <span>执行状态</span>
                  <strong>{{ taskDetail.taskState || '--' }}</strong>
                </div>
                <div class="summary-card">
                  <span>结果条数</span>
                  <strong>{{ taskDetail.items.length }}</strong>
                </div>
              </div>

              <div class="task-detail-block">
                <span>任务说明</span>
                <p>{{ taskDetail.taskMessage || taskDetail.promptText || '暂无任务说明。' }}</p>
              </div>

              <div class="task-detail-results">
                <div
                  v-for="item in taskResultPreview()"
                  :key="item.id"
                  class="task-result-card"
                >
                  <div class="task-card-compact__top">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.type }}</span>
                  </div>
                  <p>{{ item.preview }}</p>
                </div>

                <div v-if="!taskResultPreview().length" class="empty-card">
                  这个任务暂时没有可展示的结果摘要。
                </div>
              </div>
            </template>

            <div v-else class="empty-card">选择左侧任务，查看批次详情。</div>
          </div>
        </div>
      </article>
    </section>

    <div
      v-if="isStartTopicModalOpen"
      class="modal-backdrop"
      @click.self="isStartTopicModalOpen = false"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">主题订阅</p>
            <h3>选择本轮主题订阅</h3>
            <p>这里展示全部主题订阅，可直接勾选用于本轮任务。</p>
          </div>
          <button class="button-secondary" type="button" @click="isStartTopicModalOpen = false">
            关闭
          </button>
        </div>

        <div class="option-grid option-grid--modal">
          <label
            v-for="item in config?.keywordSubscriptionOptions ?? []"
            :key="`start-topic-${item.id}`"
            class="option-card"
          >
            <input
              :checked="startForm.subscriptionIds.includes(item.id)"
              type="checkbox"
              @change="toggleId(startForm.subscriptionIds, item.id)"
            />
            <div>
              <div class="option-card__title">
                <strong>{{ item.label }}</strong>
                <span class="tag">{{ item.id }}</span>
              </div>
              <p>{{ item.description || '暂无说明' }}</p>
              <small>关键词：{{ joinOrFallback(item.keywords, '未定义') }}</small>
            </div>
          </label>
          <div v-if="!(config?.keywordSubscriptionOptions ?? []).length" class="empty-card">
            当前没有可选的主题订阅。
          </div>
        </div>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="isStartTopicModalOpen = false">
            完成
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isStartSourceModalOpen"
      class="modal-backdrop"
      @click.self="isStartSourceModalOpen = false"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">信号源</p>
            <h3>选择本轮信号源</h3>
            <p>这里展示全部信号源，可直接勾选用于本轮任务。</p>
          </div>
          <button class="button-secondary" type="button" @click="isStartSourceModalOpen = false">
            关闭
          </button>
        </div>

        <div class="option-grid option-grid--modal">
          <label
            v-for="item in config?.signalSourceOptions ?? []"
            :key="`start-source-${item.id}`"
            class="option-card"
          >
            <input
              :checked="startForm.sourceProfileIds.includes(item.id)"
              type="checkbox"
              @change="toggleId(startForm.sourceProfileIds, item.id)"
            />
            <div>
              <div class="option-card__title">
                <strong>{{ item.label }}</strong>
                <span class="tag">{{ item.id }}</span>
              </div>
              <p>{{ item.description || '暂无说明' }}</p>
            </div>
          </label>
          <div v-if="!(config?.signalSourceOptions ?? []).length" class="empty-card">
            当前没有可选的信号源。
          </div>
        </div>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="isStartSourceModalOpen = false">
            完成
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isConfigDetailModalOpen"
      class="modal-backdrop"
      @click.self="closeConfigDetailModal"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">{{ configDetailMeta.eyebrow }}</p>
            <h3>{{ configDetailMeta.title }}</h3>
            <p>{{ configDetailMeta.description }}</p>
          </div>
          <button class="button-secondary" type="button" @click="closeConfigDetailModal">
            ??
          </button>
        </div>

        <template v-if="activeConfigDetailView === 'system'">
          <div class="scope-summary__grid">
            <div v-for="item in systemConfigSummary" :key="item.label" class="summary-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>

          <div class="config-item-list">
            <div v-for="item in config?.envItems ?? []" :key="item.key" class="config-item">
              <div>
                <strong>{{ item.key }}</strong>
                <p>{{ item.secret ? (item.configured ? '已配置' : '未配置') : item.value || '未设置' }}</p>
              </div>
              <span class="tag">{{ item.secret ? '敏感字段' : '普通字段' }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="activeConfigDetailView === 'default'">
          <div class="scope-summary__grid">
            <div v-for="item in defaultConfigSummary" :key="item.label" class="summary-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>

          <div class="detail-item-list detail-item-list--double">
            <article class="detail-item-card">
              <span class="detail-item-card__label">默认策略</span>
              <strong>{{ defaultOpportunityModeLabel }}</strong>
              <p>{{ defaultConfigForm.runInvestigationAfterScreening ? '默认先初筛，再自动进入深查。' : '默认仅执行初筛。' }}</p>
            </article>

            <article class="detail-item-card">
              <span class="detail-item-card__label">补充关键词</span>
              <div class="chip-group">
                <span v-for="item in defaultExtraKeywordList" :key="`default-extra-detail-${item}`" class="tag">
                  {{ item }}
                </span>
                <span v-if="!defaultExtraKeywordList.length" class="tag">无</span>
              </div>
            </article>
          </div>

          <div class="detail-item-list detail-item-list--double">
            <article class="detail-item-card">
              <span class="detail-item-card__label">默认主题</span>
              <div class="chip-group">
                <span v-for="item in defaultTopicLabels" :key="`default-topic-detail-${item}`" class="tag">
                  {{ item }}
                </span>
                <span v-if="!defaultTopicLabels.length" class="tag">无</span>
              </div>
            </article>

            <article class="detail-item-card">
              <span class="detail-item-card__label">默认信号源</span>
              <div class="chip-group">
                <span v-for="item in defaultSourceLabels" :key="`default-source-detail-${item}`" class="tag">
                  {{ item }}
                </span>
                <span v-if="!defaultSourceLabels.length" class="tag">无</span>
              </div>
            </article>
          </div>
        </template>

        <template v-else-if="activeConfigDetailView === 'runtime_scope'">
          <div class="scope-summary__grid">
            <div v-for="item in currentScopeSummary" :key="item.label" class="summary-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>

          <div v-if="isScreeningStart" class="detail-item-list detail-item-list--double">
            <article class="detail-item-card">
              <span class="detail-item-card__label">默认策略</span>
              <strong>{{ defaultOpportunityModeLabel }}</strong>
              <p>{{ defaultConfigForm.runInvestigationAfterScreening ? '默认已开启初筛后深查。' : '默认模式为仅初筛。' }}</p>
            </article>

            <article class="detail-item-card">
              <span class="detail-item-card__label">本轮策略</span>
              <strong>{{ startForm.screeningOpportunityMode === 'all' ? '全部启用主题' : '仅选中主题' }}</strong>
              <p>{{ selectedModeSummary.label }}</p>
            </article>
          </div>

          <div v-if="isScreeningStart" class="detail-item-list detail-item-list--double">
            <article class="detail-item-card">
              <span class="detail-item-card__label">本轮主题</span>
              <div class="chip-group">
                <span v-for="item in selectedTopicLabels" :key="`runtime-topic-${item}`" class="tag">
                  {{ item }}
                </span>
                <span v-if="!selectedTopicLabels.length" class="tag">无</span>
              </div>
            </article>

            <article class="detail-item-card">
              <span class="detail-item-card__label">本轮信号源</span>
              <div class="chip-group">
                <span v-for="item in selectedSourceLabels" :key="`runtime-source-${item}`" class="tag">
                  {{ item }}
                </span>
                <span v-if="!selectedSourceLabels.length" class="tag">无</span>
              </div>
            </article>
          </div>

          <article v-if="isScreeningStart" class="detail-item-card">
            <span class="detail-item-card__label">本轮补充关键词</span>
            <div class="chip-group">
              <span v-for="item in startExtraKeywordList" :key="`runtime-extra-${item}`" class="tag">
                {{ item }}
              </span>
              <span v-if="!startExtraKeywordList.length" class="tag">无</span>
            </div>
          </article>
        </template>

        <template v-else-if="activeConfigDetailView === 'topics'">
          <div class="detail-item-list">
            <article
              v-for="item in availableTopicOptions"
              :key="`topic-detail-${item.id}`"
              class="detail-item-card"
            >
              <div class="detail-item-card__top">
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.description || '暂无说明' }}</p>
                </div>
                <div class="chip-group">
                  <span class="tag" :class="{ 'tag--active': isTopicEnabledInDefault(item.id) }">
                    {{ isTopicEnabledInDefault(item.id) ? '默认启用' : '默认关闭' }}
                  </span>
                  <span class="tag" :class="{ 'tag--active': isTopicEnabledInCurrent(item.id) }">
                    {{ isTopicEnabledInCurrent(item.id) ? '本轮启用' : '本轮关闭' }}
                  </span>
                </div>
              </div>
              <div class="detail-item-card__subgroup">
                <span class="detail-item-card__label">关键词</span>
                <div class="chip-group">
                  <span v-for="keyword in item.keywords" :key="`topic-keyword-detail-${item.id}-${keyword}`" class="tag">
                    {{ keyword }}
                  </span>
                  <span v-if="!item.keywords.length" class="tag">未配置关键词</span>
                </div>
              </div>
            </article>
            <div v-if="!availableTopicOptions.length" class="empty-card">当前没有可展示的主题订阅。</div>
          </div>
        </template>

        <template v-else-if="activeConfigDetailView === 'sources'">
          <div class="detail-item-list">
            <article
              v-for="item in availableSourceOptions"
              :key="`source-detail-${item.id}`"
              class="detail-item-card"
            >
              <div class="detail-item-card__top">
                <div>
                  <strong>{{ item.label }}</strong>
                  <p>{{ item.description || '暂无说明' }}</p>
                </div>
                <div class="chip-group">
                  <span class="tag" :class="{ 'tag--active': isSourceEnabledInDefault(item.id) }">
                    {{ isSourceEnabledInDefault(item.id) ? '默认启用' : '默认关闭' }}
                  </span>
                  <span class="tag" :class="{ 'tag--active': isSourceEnabledInCurrent(item.id) }">
                    {{ isSourceEnabledInCurrent(item.id) ? '本轮启用' : '本轮关闭' }}
                  </span>
                </div>
              </div>
              <div class="detail-item-card__subgroup">
                <span class="detail-item-card__label">信号源 ID</span>
                <div class="chip-group">
                  <span class="tag">{{ item.id }}</span>
                </div>
              </div>
            </article>
            <div v-if="!availableSourceOptions.length" class="empty-card">当前没有可展示的信号源。</div>
          </div>
        </template>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="closeConfigDetailModal">
            关闭
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isSystemConfigModalOpen"
      class="modal-backdrop"
      @click.self="isSystemConfigModalOpen = false"
    >
      <div class="modal-panel">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">系统配置</p>
            <h3>系统级配置</h3>
          </div>
          <button class="button-secondary" type="button" @click="isSystemConfigModalOpen = false">
            关闭
          </button>
        </div>

        <div class="modal-form-grid">
          <label class="field">
            <span>OpenAI API 密钥</span>
            <input
              v-model.trim="systemConfigForm.openAiApiKey"
              type="password"
              placeholder="不填写则保持现状"
            />
          </label>

          <label class="field">
            <span>OpenAI 接口地址</span>
            <input v-model.trim="systemConfigForm.openAiBaseUrl" type="text" />
          </label>

          <label class="field">
            <span>Anthropic API 密钥</span>
            <input
              v-model.trim="systemConfigForm.anthropicApiKey"
              type="password"
              placeholder="不填写则保持现状"
            />
          </label>

          <label class="field">
            <span>Anthropic 接口地址</span>
            <input v-model.trim="systemConfigForm.anthropicBaseUrl" type="text" />
          </label>

          <label class="field">
            <span>Tavily API 密钥</span>
            <input
              v-model.trim="systemConfigForm.tavilyApiKey"
              type="password"
              placeholder="不填写则保持现状"
            />
          </label>

          <label class="field">
            <span>默认模型</span>
            <input v-model.trim="systemConfigForm.defaultModel" type="text" />
          </label>
        </div>

        <div class="config-item-list">
          <div v-for="item in config?.envItems ?? []" :key="item.key" class="config-item">
            <div>
              <strong>{{ item.key }}</strong>
              <p>{{ item.secret ? (item.configured ? '已配置' : '未配置') : item.value || '未设置' }}</p>
            </div>
            <span class="tag">{{ item.secret ? '敏感字段' : '普通字段' }}</span>
          </div>
        </div>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="isSystemConfigModalOpen = false">
            取消
          </button>
          <button
            class="button-primary"
            type="button"
            :disabled="isSavingSystemConfig"
            @click="handleSaveSystemConfig"
          >
            {{ isSavingSystemConfig ? '保存中...' : '保存系统配置' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isDefaultConfigModalOpen"
      class="modal-backdrop"
      @click.self="isDefaultConfigModalOpen = false"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">默认筛选配置</p>
            <h3>默认筛选配置</h3>
          </div>
          <button class="button-secondary" type="button" @click="isDefaultConfigModalOpen = false">
            关闭
          </button>
        </div>

        <div class="modal-form-grid">
          <label class="field">
            <span>默认运行方式</span>
            <select v-model="defaultConfigForm.runInvestigationAfterScreening">
              <option :value="true">初筛 + 深查</option>
              <option :value="false">仅初筛</option>
            </select>
          </label>

          <label class="field">
            <span>候选池目标数</span>
            <input v-model.number="defaultConfigForm.targetPoolEntryCount" type="number" min="1" />
          </label>

          <label class="field field--wide">
            <span>机会类型策略</span>
            <select v-model="defaultConfigForm.screeningOpportunityMode">
              <option
                v-for="option in opportunityModeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <section class="selection-block">
          <div class="selection-block__header">
            <div>
              <strong>默认主题订阅</strong>
              <span>这些会自动作为“本轮初筛范围”的默认值。</span>
            </div>
          </div>
          <div class="option-grid">
            <label
              v-for="item in config?.keywordSubscriptionOptions ?? []"
              :key="item.id"
              class="option-card"
            >
              <input
                :checked="defaultConfigForm.screeningSubscriptionIds.includes(item.id)"
                type="checkbox"
                @change="toggleId(defaultConfigForm.screeningSubscriptionIds, item.id)"
              />
              <div>
                <div class="option-card__title">
                  <strong>{{ item.label }}</strong>
                  <span class="tag">{{ item.id }}</span>
                </div>
                <p>{{ item.description || '暂无说明' }}</p>
              </div>
            </label>
          </div>
        </section>

        <section class="selection-block">
          <div class="selection-block__header">
            <div>
              <strong>默认信号源</strong>
              <span>这些会自动作为“本轮初筛范围”的默认值。</span>
            </div>
          </div>
          <div class="option-grid">
            <label
              v-for="item in config?.signalSourceOptions ?? []"
              :key="item.id"
              class="option-card"
            >
              <input
                :checked="defaultConfigForm.screeningSourceProfileIds.includes(item.id)"
                type="checkbox"
                @change="toggleId(defaultConfigForm.screeningSourceProfileIds, item.id)"
              />
              <div>
                <div class="option-card__title">
                  <strong>{{ item.label }}</strong>
                  <span class="tag">{{ item.id }}</span>
                </div>
                <p>{{ item.description || '暂无说明' }}</p>
              </div>
            </label>
          </div>
        </section>

        <label class="field">
          <span>默认补充关键词</span>
          <textarea
            v-model="defaultConfigForm.screeningExtraKeywordsText"
            class="textarea"
            rows="4"
            placeholder="一行一个，或使用逗号分隔"
          />
        </label>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="isDefaultConfigModalOpen = false">
            取消
          </button>
          <button
            class="button-primary"
            type="button"
            :disabled="isSavingDefaultConfig"
            @click="handleSaveDefaultConfig"
          >
            {{ isSavingDefaultConfig ? '保存中...' : '保存默认配置' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isSignalSourceModalOpen"
      class="modal-backdrop"
      @click.self="isSignalSourceModalOpen = false"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">信号源</p>
            <h3>新增信号源</h3>
          </div>
          <button class="button-secondary" type="button" @click="isSignalSourceModalOpen = false">
            关闭
          </button>
        </div>

        <div class="modal-form-grid">
          <label class="field">
            <span>信号源 ID</span>
            <input v-model.trim="signalSourceForm.id" type="text" placeholder="不填写则自动生成" />
          </label>

          <label class="field">
            <span>信号源名称</span>
            <input v-model.trim="signalSourceForm.label" type="text" placeholder="例如：省级采购网" />
          </label>

          <label class="field field--wide">
            <span>说明</span>
            <textarea v-model="signalSourceForm.description" class="textarea" rows="3" />
          </label>

          <label class="field">
            <span>搜索范围</span>
            <textarea
              v-model="signalSourceForm.searchScopesText"
              class="textarea"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            />
          </label>

          <label class="field">
            <span>文档类型</span>
            <textarea
              v-model="signalSourceForm.documentTypesText"
              class="textarea"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            />
          </label>

          <label class="field">
            <span>包含域名</span>
            <textarea
              v-model="signalSourceForm.includeDomainsText"
              class="textarea"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            />
          </label>

          <label class="field">
            <span>排除域名</span>
            <textarea
              v-model="signalSourceForm.excludeDomainsText"
              class="textarea"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            />
          </label>

          <label class="field field--wide">
            <span>检索提示词</span>
            <textarea
              v-model="signalSourceForm.queryHintsText"
              class="textarea"
              rows="3"
              placeholder="一行一个，或用逗号分隔"
            />
          </label>
        </div>

        <div class="modal-panel__footer">
          <button class="button-secondary" type="button" @click="isSignalSourceModalOpen = false">
            取消
          </button>
          <button
            class="button-primary"
            type="button"
            :disabled="isCreatingSignalSource"
            @click="handleCreateSignalSource"
          >
            {{ isCreatingSignalSource ? '创建中...' : '创建信号源' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isKeywordSubscriptionModalOpen"
      class="modal-backdrop"
      @click.self="isKeywordSubscriptionModalOpen = false"
    >
      <div class="modal-panel modal-panel--wide">
        <div class="modal-panel__header">
          <div>
            <p class="section-eyebrow">主题订阅</p>
            <h3>新增关键词主题</h3>
          </div>
          <button
            class="button-secondary"
            type="button"
            @click="isKeywordSubscriptionModalOpen = false"
          >
            关闭
          </button>
        </div>

        <div class="modal-form-grid">
          <label class="field">
            <span>主题 ID</span>
            <input
              v-model.trim="keywordSubscriptionForm.id"
              type="text"
              placeholder="不填写则自动生成"
            />
          </label>

          <label class="field">
            <span>主题名称</span>
            <input
              v-model.trim="keywordSubscriptionForm.label"
              type="text"
              placeholder="例如：政务热线智能化"
            />
          </label>

          <label class="field field--wide">
            <span>说明</span>
            <textarea v-model="keywordSubscriptionForm.description" class="textarea" rows="3" />
          </label>
        </div>

        <label class="field">
          <span>关键词</span>
          <textarea
            v-model="keywordSubscriptionForm.keywordsText"
            class="textarea"
            rows="4"
            placeholder="一行一个，或用逗号分隔"
          />
        </label>

        <section class="selection-block">
          <div class="selection-block__header">
            <div>
              <strong>推荐信号源</strong>
              <span>可选，帮助这个主题优先匹配更合适的站点来源。</span>
            </div>
          </div>
          <div class="option-grid">
            <label
              v-for="item in config?.signalSourceOptions ?? []"
              :key="item.id"
              class="option-card"
            >
              <input
                :checked="keywordSubscriptionForm.preferredSourceProfileIds.includes(item.id)"
                type="checkbox"
                @change="toggleId(keywordSubscriptionForm.preferredSourceProfileIds, item.id)"
              />
              <div>
                <div class="option-card__title">
                  <strong>{{ item.label }}</strong>
                  <span class="tag">{{ item.id }}</span>
                </div>
                <p>{{ item.description || '暂无说明' }}</p>
              </div>
            </label>
          </div>
        </section>

        <div class="modal-panel__footer">
          <button
            class="button-secondary"
            type="button"
            @click="isKeywordSubscriptionModalOpen = false"
          >
            取消
          </button>
          <button
            class="button-primary"
            type="button"
            :disabled="isCreatingKeywordSubscription"
            @click="handleCreateKeywordSubscription"
          >
            {{ isCreatingKeywordSubscription ? '创建中...' : '创建关键词主题' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
