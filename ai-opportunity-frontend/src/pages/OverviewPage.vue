<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getLeads } from '../api'
import type { LeadListItem, PagedResponse } from '../types'
import { formatDateShort, formatLabel, formatScore, scoreTone } from '../utils'

const emit = defineEmits<{
  (event: 'openDetail', id: number): void
}>()

const leadCategoryOptions = ['current_opportunity', 'historical_case', 'policy_signal']
const poolTierOptions = ['优先跟进', '观察入池', '不入池']
const statusOptions = ['待跟进', '待研判', '已跟进']

const keyword = ref('')
const selectedLeadCategory = ref('')
const selectedPoolTier = ref('')
const selectedStatus = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const leads = ref<PagedResponse<LeadListItem> | null>(null)

const heroStats = computed(() => {
  const items = leads.value?.content ?? []
  const highScoreCount = items.filter((item) => (item.compositeScore ?? 0) >= 92).length
  const actionableCount = items.filter((item) => item.status === '待跟进').length
  const trackedCount = items.filter((item) => item.shouldEnterPool).length

  return [
    { label: '高优先线索', value: String(highScoreCount), hint: 'AI 综合分 92 以上' },
    { label: '待销售动作', value: String(actionableCount), hint: '建议优先跟进' },
    { label: '已入池线索', value: String(trackedCount), hint: '当前进入候选池' },
  ]
})

onMounted(async () => {
  await loadLeads()
})

async function loadLeads() {
  isLoading.value = true
  errorMessage.value = ''

  try {
    leads.value = await getLeads({
      keyword: keyword.value,
      leadCategory: selectedLeadCategory.value,
      poolEntryTier: selectedPoolTier.value,
      status: selectedStatus.value,
      page: 0,
      size: 20,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '线索加载失败'
  } finally {
    isLoading.value = false
  }
}

function aiOpinion(item: LeadListItem) {
  if ((item.compositeScore ?? 0) >= 92) {
    return '高优先级机会，AI 判断具备较强销售推进价值。'
  }

  if ((item.compositeScore ?? 0) >= 88) {
    return '具备持续跟进价值，建议边补证据边维持触达。'
  }

  return '当前更适合观察，先盯预算和正式采购信号。'
}

function aiSuggestion(item: LeadListItem) {
  if (item.status === '待跟进') {
    return '先确认客户关系和采购窗口，再推进首次触达。'
  }

  if (item.poolEntryTier === '观察入池') {
    return '跟踪采购意向、预算节点和正式公告。'
  }

  return '保留为参考线索，不建议投入过多售前资源。'
}
</script>

<template>
  <main class="page">
    <section class="hero-card hero-card--metrics">
      <article v-for="item in heroStats" :key="item.label" class="hero-metric hero-metric--dense">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </section>

    <section class="panel sales-panel">
      <div class="panel__header">
        <div>
          <p class="section-eyebrow">Lead Pool</p>
          <h2>销售线索池</h2>
        </div>
        <button class="button-secondary" type="button" @click="loadLeads">
          刷新列表
        </button>
      </div>

      <div class="filters">
        <label class="field field--wide">
          <span>关键词</span>
          <input
            v-model.trim="keyword"
            type="text"
            placeholder="按标题或机构搜索"
            @keyup.enter="loadLeads"
          />
        </label>

        <label class="field">
          <span>分类</span>
          <select v-model="selectedLeadCategory" @change="loadLeads">
            <option value="">全部</option>
            <option v-for="option in leadCategoryOptions" :key="option" :value="option">
              {{ formatLabel(option) }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>入池层级</span>
          <select v-model="selectedPoolTier" @change="loadLeads">
            <option value="">全部</option>
            <option v-for="option in poolTierOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>跟进状态</span>
          <select v-model="selectedStatus" @change="loadLeads">
            <option value="">全部</option>
            <option v-for="option in statusOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="errorMessage" class="alert-error">{{ errorMessage }}</p>

      <div class="list-meta">
        <span>{{ isLoading ? '加载中...' : `当前共 ${leads?.totalElements ?? 0} 条线索` }}</span>
        <span>点击卡片查看 AI 详情与全部来源链接</span>
      </div>

      <div class="lead-grid">
        <button
          v-for="item in leads?.content ?? []"
          :key="item.id"
          class="lead-tile lead-tile--sales"
          type="button"
          @click="emit('openDetail', item.id)"
        >
          <div class="lead-tile__score-panel" :data-tone="scoreTone(item.compositeScore)">
            <span class="lead-tile__score-label">AI 评分</span>
            <strong class="lead-tile__score-value">{{ formatScore(item.compositeScore) }}</strong>
            <span class="lead-tile__score-hint">{{ item.poolEntryTier ?? '未分层' }}</span>
          </div>

          <div class="lead-tile__content">
            <div class="lead-tile__header">
              <div>
                <strong class="lead-tile__title">{{ item.title }}</strong>
                <p class="lead-tile__meta">
                  {{ item.organizationName || item.sourceName || '未识别机构' }}
                </p>
              </div>
              <div class="lead-tile__chips">
                <span class="tag">{{ item.currentStage ?? '阶段待识别' }}</span>
                <span class="tag">{{ item.status ?? '状态待识别' }}</span>
                <span class="tag">{{ item.expiryStatus ?? '有效期未知' }}</span>
              </div>
            </div>

            <div class="lead-tile__insights">
              <section class="lead-tile__section lead-tile__section--opinion">
                <span class="lead-tile__label">AI 评价</span>
                <p>{{ aiOpinion(item) }}</p>
              </section>

              <section class="lead-tile__section lead-tile__section--suggestion">
                <span class="lead-tile__label">AI 建议</span>
                <p>{{ aiSuggestion(item) }}</p>
              </section>
            </div>

            <div class="lead-tile__footer">
              <span>{{ formatDateShort(item.publishTime) }}</span>
              <span>{{ item.sourceDomain ?? '未知来源' }}</span>
              <span class="lead-tile__cta">查看详情</span>
            </div>
          </div>
        </button>

        <div v-if="!isLoading && !(leads?.content.length)" class="empty-card">
          当前筛选条件下没有线索。
        </div>
      </div>
    </section>
  </main>
</template>
