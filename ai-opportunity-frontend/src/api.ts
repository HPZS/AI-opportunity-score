import type {
  AgentRuntimeConfig,
  AgentRuntimeConfigUpdateRequest,
  AgentRuntimeLogs,
  AgentRuntimeStartRequest,
  AgentRuntimeStartResponse,
  AgentRuntimeStatus,
  AgentRuntimeStopResponse,
  AgentTaskDetail,
  AgentTaskSummary,
  CreateAgentKeywordSubscriptionRequest,
  CreateAgentSignalSourceRequest,
  LeadDeepAnalysis,
  LeadDetail,
  LeadListItem,
  PagedResponse,
} from './types'

interface LeadQuery {
  keyword?: string
  leadCategory?: string
  poolEntryTier?: string
  status?: string
  page?: number
  size?: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function buildQuery(params: Record<string, string | number | undefined> | LeadQuery) {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export function getLeads(params: LeadQuery) {
  return request<PagedResponse<LeadListItem>>(`/api/leads${buildQuery(params)}`)
}

export function getLead(id: number) {
  return request<LeadDetail>(`/api/leads/${id}`)
}

export async function getLeadDeepAnalysis(id: number) {
  try {
    return await request<LeadDeepAnalysis>(`/api/leads/${id}/deep-analysis`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }

    throw error
  }
}

export function updateLeadStatus(id: number, status: string) {
  return request<void>(`/api/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function getTasks(page = 0, size = 20) {
  return request<PagedResponse<AgentTaskSummary>>(
    `/api/agent/tasks${buildQuery({ page, size })}`,
  )
}

export function getTask(id: number) {
  return request<AgentTaskDetail>(`/api/agent/tasks/${id}`)
}

export function getAgentRuntimeStatus() {
  return request<AgentRuntimeStatus>('/api/agent/runtime/status')
}

export function startAgentRuntime(payload: AgentRuntimeStartRequest) {
  return request<AgentRuntimeStartResponse>('/api/agent/runtime/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function stopAgentRuntime() {
  return request<AgentRuntimeStopResponse>('/api/agent/runtime/stop', {
    method: 'POST',
  })
}

export function getAgentRuntimeConfig() {
  return request<AgentRuntimeConfig>('/api/agent/runtime/config')
}

export function updateAgentRuntimeConfig(payload: AgentRuntimeConfigUpdateRequest) {
  return request<AgentRuntimeConfig>('/api/agent/runtime/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function createAgentSignalSource(payload: CreateAgentSignalSourceRequest) {
  return request<AgentRuntimeConfig>('/api/agent/runtime/config/signal-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function createAgentKeywordSubscription(payload: CreateAgentKeywordSubscriptionRequest) {
  return request<AgentRuntimeConfig>('/api/agent/runtime/config/keyword-subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getAgentRuntimeLogs(lines = 200) {
  try {
    return await request<AgentRuntimeLogs>(`/api/agent/runtime/logs${buildQuery({ lines })}`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }

    throw error
  }
}
