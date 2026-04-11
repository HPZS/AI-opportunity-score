<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { getLead, getLeadDeepAnalysis } from '../api'
import type { LeadDeepAnalysis, LeadDetail } from '../types'
import {
  collectSourceLinks,
  formatDate,
  formatScore,
  scoreRows,
  scoreTone,
  timelineKey,
  toPercentBar,
} from '../utils'

interface BreakdownSection {
  eyebrow: string
  title: string
  summary: string
  bullets: string[]
}

interface ContentReadingBlock {
  title: string
  summary: string
  bullets: string[]
}

const props = defineProps<{
  leadId: number | null
}>()

const emit = defineEmits<{
  (event: 'back'): void
}>()

const leadDetail = ref<LeadDetail | null>(null)
const deepAnalysis = ref<LeadDeepAnalysis | null>(null)
const isLoading = ref(false)
const errorMessage = ref('')

const currentLeadId = computed(() => Number(props.leadId))
const sourceLinks = computed(() => collectSourceLinks(leadDetail.value, deepAnalysis.value))

watch(currentLeadId, async () => {
  await loadLead()
})

onMounted(async () => {
  await loadLead()
})

async function loadLead() {
  if (!currentLeadId.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const [detail, analysis] = await Promise.all([
      getLead(currentLeadId.value),
      getLeadDeepAnalysis(currentLeadId.value),
    ])

    leadDetail.value = detail
    deepAnalysis.value = analysis
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '详情加载失败'
  } finally {
    isLoading.value = false
  }
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || ''
}

function firstAvailable(...values: Array<string | null | undefined>) {
  return values.map(cleanText).find(Boolean) || ''
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
}

function lineOf(label: string, value: string | null | undefined) {
  const text = cleanText(value)
  return text ? `${label}：${text}` : ''
}

function yesNo(value: boolean | null | undefined) {
  if (value === true) {
    return '是'
  }

  if (value === false) {
    return '否'
  }

  return ''
}

function joinChinese(values: string[]) {
  return values.filter(Boolean).join('；')
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}

const aiHeadline = computed(
  () => '下面只解读这条机会公开材料本身写了什么，不重复评分、入池判断和销售建议。',
)

const contentReadingBlocks = computed<ContentReadingBlock[]>(() => {
  const lead = leadDetail.value
  const deep = deepAnalysis.value

  if (!lead) {
    return []
  }

  const evidenceItems = lead.evidenceSummary.slice(0, 4)
  const timelineItems = (deep?.timeline ?? []).slice(0, 3)
  const mergedContent = joinChinese([
    cleanText(lead.description),
    ...evidenceItems,
    cleanText(deep?.sourceContinuity),
    cleanText(deep?.landingCaseSummary),
    cleanText(deep?.policySupportSummary),
    cleanText(deep?.budgetSupportSummary),
  ])

  const contentGaps = uniqueStrings([
    !containsAny(mergedContent, ['预算', '金额', '限价', '概算'])
      ? '当前材料里没有明确预算金额、最高限价或预算概算'
      : '',
    !containsAny(mergedContent, ['招标', '采购意向', '询价', '比选', '需求', '采购文件'])
      ? '当前材料里没有看到明确的招采文件名称或正式采购节点'
      : '',
    !containsAny(mergedContent, ['实施', '上线', '验收', '服务期', '周期'])
      ? '当前材料里没有写清楚实施周期、上线安排或验收节点'
      : '',
    ...(deep?.aiRisks ?? []).map((item) => `当前材料仍待补证：${item}`),
  ])

  const fileContentSummary =
    firstAvailable(
      lead.description,
      evidenceItems[0],
      lead.categoryReason,
    ) || '当前公开材料还不足以完整说明这条机会的具体内容。'

  const fileContentBullets = uniqueStrings([
    ...evidenceItems.map((item) => `公开内容：${item}`),
  ])

  const explicitActionSummary =
    firstAvailable(
      deep?.sourceContinuity,
      deep?.landingCaseSummary,
      evidenceItems[1],
      evidenceItems[2],
    ) || '当前公开材料还不足以说明已经发生了哪些明确动作。'

  const explicitActionBullets = uniqueStrings([
    ...evidenceItems.map((item) => `已明确动作：${item}`),
    ...timelineItems.map((item) => {
      const title = cleanText(item.title) || '关键节点'
      const description = cleanText(item.description)
      return item.date
        ? `${formatDate(item.date)}：${title}${description ? `，${description}` : ''}`
        : `${title}${description ? `：${description}` : ''}`
    }),
  ])

  const scopeSummary =
    firstAvailable(
      deep?.policySupportSummary,
      deep?.landingCaseSummary,
      deep?.sourceContinuity,
      '从现有材料看，这条机会已经不是一句笼统方向，而是出现了可落地的项目范围或执行线索。',
    ) || '当前还很难从公开材料里界定项目边界。'

  const scopeBullets = uniqueStrings([
    cleanText(deep?.sourceContinuity) ? `连续信息：${cleanText(deep?.sourceContinuity)}` : '',
    cleanText(deep?.landingCaseSummary) ? `落地线索：${cleanText(deep?.landingCaseSummary)}` : '',
    cleanText(deep?.policySupportSummary) ? `政策支撑：${cleanText(deep?.policySupportSummary)}` : '',
  ])

  const missingInfoSummary =
    firstAvailable(
      deep?.budgetSupportSummary,
      '从现有材料看，公开信息仍然没有把预算、招采文件、实施边界完全讲透。',
    ) || '当前材料仍有不少关键信息缺口。'

  return [
    {
      title: '这条机会具体讲了什么',
      summary: fileContentSummary,
      bullets: fileContentBullets.length ? fileContentBullets : ['暂无更具体的公开内容'],
    },
    {
      title: '材料里已经明确写出的动作和节点',
      summary: explicitActionSummary,
      bullets: explicitActionBullets.length ? explicitActionBullets : ['暂无更明确的动作或节点'],
    },
    {
      title: '从这些内容里能读出的项目范围',
      summary: scopeSummary,
      bullets: scopeBullets.length ? scopeBullets : ['当前还缺少更多交叉材料来界定项目范围'],
    },
    {
      title: '这份材料还没有讲清楚的部分',
      summary: missingInfoSummary,
      bullets: contentGaps.length ? contentGaps : ['当前公开材料缺口不明显'],
    },
  ]
})

const opportunityOverview = computed(() => {
  const lead = leadDetail.value

  if (!lead) {
    return ''
  }

  const concreteParts = uniqueStrings([
    lead.description,
    ...lead.evidenceSummary.slice(0, 2),
  ])

  if (!concreteParts.length) {
    return '当前公开内容有限，这条机会更像一个方向性线索，还需要继续补原文和附件。'
  }

  return joinChinese(concreteParts)
})

const aiInterpretationSections = computed<BreakdownSection[]>(() => {
  const lead = leadDetail.value
  const deep = deepAnalysis.value

  if (!lead) {
    return []
  }

  const sections: BreakdownSection[] = [
    {
      eyebrow: 'Opportunity Scope',
      title: '这条线到底在推进什么',
      summary:
        firstAvailable(
          lead.description,
          deep?.sourceContinuity,
          lead.categoryReason,
        ) || '当前没有足够信息说明这条线具体在推进什么。',
      bullets: uniqueStrings([
        lineOf('机构', lead.organizationName || lead.sourceName),
        lineOf('当前阶段', lead.currentStage),
        lineOf('信号类型', lead.opportunitySignalClass),
        lead.publishTime ? lineOf('发布时间', formatDate(lead.publishTime)) : '',
        ...lead.evidenceSummary.slice(0, 2).map((item) => `证据：${item}`),
      ]),
    },
    {
      eyebrow: 'AI Judgment',
      title: 'AI 为什么认为它值得看或不值得看',
      summary:
        firstAvailable(
          deep?.deepAnalysisConclusion,
          lead.score?.scoreReason,
          lead.categoryReason,
        ) || '当前没有明确的 AI 判断依据。',
      bullets: uniqueStrings([
        lineOf('是否建议入池', yesNo(lead.shouldEnterPool)),
        lineOf('是否可立即推进', yesNo(lead.isActionableNow)),
        lineOf('入池层级', lead.poolEntryTier),
        lineOf('有效期判断', lead.expiryStatus),
        lead.score?.compositeScore !== null && lead.score?.compositeScore !== undefined
          ? lineOf('综合评分', formatScore(lead.score.compositeScore))
          : '',
        lead.score?.screeningScore !== null && lead.score?.screeningScore !== undefined
          ? lineOf('初筛分', formatScore(lead.score.screeningScore))
          : '',
      ]),
    },
    {
      eyebrow: 'AI Entry',
      title: '这单更适合从什么 AI 切口切入',
      summary:
        firstAvailable(
          deep?.aiValueSummary,
          lead.latestSuggestedAction,
          lead.score?.suggestedAction,
          lead.latestFollowUpAction,
        ) || '当前暂无明确的 AI 切入建议。',
      bullets: uniqueStrings([
        ...lead.recommendedTechnologies.map((item) => `推荐能力：${item}`),
        lineOf('销售动作', lead.latestFollowUpAction),
        lineOf('AI 建议', lead.latestSuggestedAction),
      ]),
    },
    {
      eyebrow: 'Commercial Risk',
      title: '当前成交门槛和主要风险',
      summary:
        firstAvailable(
          deep?.competitionAndDeliveryJudgement,
          deep?.budgetSupportSummary,
          deep?.policySupportSummary,
          lead.categoryReason,
        ) || '当前暂无明确风险说明。',
      bullets: uniqueStrings([
        ...(deep?.aiRisks ?? []).map((item) => `风险：${item}`),
        lineOf('深查建议', deep?.suggestedAction),
        lineOf('最终结论', deep?.finalRecommendation),
      ]),
    },
    {
      eyebrow: 'Next Action',
      title: '下一步到底该怎么推进',
      summary:
        firstAvailable(
          deep?.finalRecommendation,
          lead.latestSuggestedAction,
          deep?.suggestedAction,
          lead.latestFollowUpAction,
        ) || '当前暂无后续动作建议。',
      bullets: uniqueStrings([
        lineOf('销售跟进', lead.latestFollowUpAction),
        lineOf('AI 追加建议', lead.latestSuggestedAction),
        ...(deep?.timeline ?? []).slice(0, 2).map((item) => {
          const title = cleanText(item.title) || '关键节点'
          const dateText = item.date ? formatDate(item.date) : '时间待补充'
          return `${dateText}：${title}`
        }),
      ]),
    },
  ]

  return sections.map((section) => ({
    ...section,
    bullets: section.bullets.length ? section.bullets : ['暂无更多可拆解信息'],
  }))
})

const aiRecommendationList = computed(() =>
  uniqueStrings([
    leadDetail.value?.latestFollowUpAction,
    leadDetail.value?.latestSuggestedAction,
    deepAnalysis.value?.suggestedAction,
    deepAnalysis.value?.finalRecommendation,
    deepAnalysis.value?.aiValueSummary,
  ]),
)

const riskList = computed(() =>
  uniqueStrings([
    ...(deepAnalysis.value?.aiRisks ?? []),
    deepAnalysis.value?.competitionAndDeliveryJudgement,
    deepAnalysis.value?.budgetSupportSummary,
  ]),
)
</script>

<template>
  <main class="page">
    <div class="back-row">
      <button type="button" class="back-link" @click="emit('back')">返回销售总览</button>
      <button class="button-secondary" type="button" @click="loadLead">刷新详情</button>
    </div>

    <p v-if="errorMessage" class="alert-error">{{ errorMessage }}</p>

    <section v-if="isLoading" class="empty-card">详情加载中...</section>

    <template v-else-if="leadDetail">
      <section class="hero-card">
        <div>
          <p class="section-eyebrow">Lead Detail</p>
          <h1 class="page-title">{{ leadDetail.title }}</h1>
          <p class="page-description">
            {{ leadDetail.organizationName || leadDetail.sourceName || '未识别机构' }}
            <span class="dot">·</span>
            {{ leadDetail.currentStage || '阶段待识别' }}
            <span class="dot">·</span>
            {{ formatDate(leadDetail.publishTime) }}
          </p>
        </div>

        <div class="hero-card__aside">
          <span class="score-pill score-pill--large" :data-tone="scoreTone(leadDetail.score?.compositeScore)">
            AI 评分 {{ formatScore(leadDetail.score?.compositeScore) }}
          </span>
          <div class="hero-card__chips">
            <span class="status-chip">{{ leadDetail.status ?? '未设状态' }}</span>
            <span class="status-chip">{{ leadDetail.poolEntryTier ?? '未分层' }}</span>
            <span class="status-chip">{{ leadDetail.expiryStatus ?? '有效期未知' }}</span>
          </div>
        </div>
      </section>

      <section class="detail-layout">
        <div class="detail-layout__main">
          <article class="panel detail-card detail-card--highlight">
            <p class="section-eyebrow">AI Reading</p>
            <h2>AI 对这条线索的完整解读</h2>
            <p class="body-copy body-copy--strong">{{ aiHeadline }}</p>
            <p class="body-copy">{{ opportunityOverview }}</p>

            <div class="narrative-list">
              <section
                v-for="block in contentReadingBlocks"
                :key="block.title"
                class="narrative-block"
              >
                <h3 class="narrative-block__title">{{ block.title }}</h3>
                <p class="narrative-block__content">{{ block.summary }}</p>
                <ul class="bullet-list bullet-list--compact">
                  <li v-for="item in block.bullets" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>
          </article>

          <article class="panel detail-card">
            <p class="section-eyebrow">Opportunity Breakdown</p>
            <h2>把机会拆开来看</h2>
            <div class="analysis-grid">
              <section
                v-for="section in aiInterpretationSections"
                :key="section.title"
                class="analysis-card"
              >
                <span class="analysis-card__eyebrow">{{ section.eyebrow }}</span>
                <h3 class="analysis-card__title">{{ section.title }}</h3>
                <p class="analysis-card__summary">{{ section.summary }}</p>
                <ul class="bullet-list bullet-list--compact">
                  <li v-for="item in section.bullets" :key="item">{{ item }}</li>
                </ul>
              </section>
            </div>
          </article>

          <article class="panel detail-card">
            <p class="section-eyebrow">AI Recommendation</p>
            <h2>AI 建议怎么推</h2>
            <ul class="bullet-list">
              <li v-for="item in aiRecommendationList" :key="item">{{ item }}</li>
              <li v-if="!aiRecommendationList.length">当前暂无 AI 推进建议</li>
            </ul>
          </article>

          <article class="panel detail-card">
            <p class="section-eyebrow">AI Score Detail</p>
            <h2>AI 评分拆解</h2>
            <div class="score-list">
              <div v-for="row in scoreRows(leadDetail.score)" :key="row.label" class="score-row">
                <div class="score-row__top">
                  <span>{{ row.label }}</span>
                  <strong>{{ formatScore(row.value) }}</strong>
                </div>
                <div class="score-row__bar">
                  <span :style="{ width: `${toPercentBar(row.value)}%` }" />
                </div>
              </div>
            </div>
          </article>

          <article class="panel detail-card">
            <p class="section-eyebrow">Evidence</p>
            <h2>AI 主要依据</h2>
            <ul class="bullet-list">
              <li v-for="item in leadDetail.evidenceSummary" :key="item">{{ item }}</li>
              <li v-if="!leadDetail.evidenceSummary.length">暂无证据摘要</li>
            </ul>
          </article>

          <article class="panel detail-card">
            <p class="section-eyebrow">Source Links</p>
            <h2>深查使用到的全部来源链接</h2>
            <div class="source-link-list">
              <a
                v-for="item in sourceLinks"
                :key="`${item.type}-${item.url}`"
                :href="item.url"
                target="_blank"
                rel="noreferrer"
                class="source-link"
              >
                <div>
                  <span class="source-link__type">{{ item.type }}</span>
                  <strong>{{ item.label }}</strong>
                </div>
                <div class="source-link__meta">
                  <span>{{ item.source }}</span>
                  <span>{{ item.url }}</span>
                </div>
              </a>
              <div v-if="!sourceLinks.length" class="empty-card">暂无来源链接</div>
            </div>
          </article>
        </div>

        <aside class="detail-layout__aside">
          <article class="panel side-card">
            <p class="section-eyebrow">Sales Snapshot</p>
            <h2>销售摘要</h2>
            <div class="kv-list">
              <div><span>机构</span><strong>{{ leadDetail.organizationName || '--' }}</strong></div>
              <div><span>当前阶段</span><strong>{{ leadDetail.currentStage || '--' }}</strong></div>
              <div><span>信号类型</span><strong>{{ leadDetail.opportunitySignalClass || '--' }}</strong></div>
              <div><span>入池层级</span><strong>{{ leadDetail.poolEntryTier || '--' }}</strong></div>
              <div><span>状态</span><strong>{{ leadDetail.status || '--' }}</strong></div>
              <div><span>来源站点</span><strong>{{ leadDetail.sourceDomain || '--' }}</strong></div>
            </div>
          </article>

          <article class="panel side-card">
            <p class="section-eyebrow">AI Entry Points</p>
            <h2>推荐 AI 切入点</h2>
            <div class="chip-group">
              <span v-for="item in leadDetail.recommendedTechnologies" :key="item" class="tag">
                {{ item }}
              </span>
              <span v-if="!leadDetail.recommendedTechnologies.length" class="muted-text">
                暂无推荐切入点
              </span>
            </div>
          </article>

          <article class="panel side-card">
            <p class="section-eyebrow">Risk Focus</p>
            <h2>当前风险提醒</h2>
            <ul class="bullet-list bullet-list--compact">
              <li v-for="item in riskList" :key="item">{{ item }}</li>
              <li v-if="!riskList.length">暂无明确风险提示</li>
            </ul>
          </article>

          <article class="panel side-card">
            <p class="section-eyebrow">Timeline</p>
            <h2>关键时间线</h2>
            <div class="timeline-list">
              <div
                v-for="(item, index) in deepAnalysis?.timeline ?? []"
                :key="timelineKey(item, index)"
                class="timeline-item"
              >
                <span>{{ formatDate(item.date) }}</span>
                <div>
                  <strong>{{ item.title || '未命名事件' }}</strong>
                  <p>{{ item.description || '暂无说明' }}</p>
                </div>
              </div>
              <div v-if="!(deepAnalysis?.timeline?.length)" class="empty-card">暂无时间线</div>
            </div>
          </article>
        </aside>
      </section>
    </template>

    <section v-else class="empty-card">未找到这条线索</section>
  </main>
</template>
