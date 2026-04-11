import type { LeadDeepAnalysis, LeadDetail, ScoreResponse, TimelineItem } from './types'

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDateShort(value: string | null | undefined) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatScore(value: number | null | undefined) {
  return typeof value === 'number' ? value.toFixed(2) : '--'
}

export function scoreTone(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'muted'
  }

  if (value >= 92) {
    return 'high'
  }

  if (value >= 88) {
    return 'medium'
  }

  return 'risk'
}

export function toPercentBar(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 0
  }

  return Math.max(0, Math.min(value, 100))
}

export function formatLabel(value: string | null | undefined) {
  if (!value) {
    return '--'
  }

  return value.replace(/_/g, ' ')
}

export function renderScalar(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '--'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function timelineKey(item: TimelineItem, index: number) {
  return `${item.date ?? 'unknown'}-${item.title ?? 'item'}-${index}`
}

export function scoreRows(score: ScoreResponse | null | undefined) {
  return [
    { label: '场景匹配', value: score?.scenarioFitScore ?? null },
    { label: 'AI 匹配', value: score?.aiFitScore ?? null },
    { label: '成熟度', value: score?.opportunityMaturityScore ?? null },
    { label: '初筛分', value: score?.screeningScore ?? null },
    { label: '深查分', value: score?.deepAnalysisScore ?? null },
    { label: '证据强度', value: score?.evidenceStrengthScore ?? null },
  ]
}

export interface SourceLinkView {
  url: string
  label: string
  type: string
  source: string
}

export function collectSourceLinks(
  leadDetail: LeadDetail | null,
  deepAnalysis: LeadDeepAnalysis | null,
) {
  const links: SourceLinkView[] = []
  const seen = new Set<string>()

  const pushLink = (
    url: string | undefined,
    label: string | undefined,
    type: string | undefined,
    source: string,
  ) => {
    if (!url) {
      return
    }

    const key = `${url}::${type ?? 'link'}`

    if (seen.has(key)) {
      return
    }

    seen.add(key)
    links.push({
      url,
      label: label || type || '来源链接',
      type: type || 'reference',
      source,
    })
  }

  leadDetail?.relatedLinks.forEach((item) => {
    pushLink(item.url, item.label, item.type, '线索原始链接')
  })

  deepAnalysis?.relatedLinks.forEach((item) => {
    pushLink(item.url, item.label, item.type, '深查补充链接')
  })

  Object.entries(deepAnalysis?.sourceLinksByType ?? {}).forEach(([type, value]) => {
    if (!Array.isArray(value)) {
      return
    }

    value.forEach((item, index) => {
      if (typeof item === 'string') {
        pushLink(item, `${formatLabel(type)} ${index + 1}`, type, '深查证据来源')
        return
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        pushLink(
          typeof record.url === 'string' ? record.url : undefined,
          typeof record.label === 'string' ? record.label : undefined,
          typeof record.type === 'string' ? record.type : type,
          '深查证据来源',
        )
      }
    })
  })

  return links
}
