<script setup lang="ts">
import type { PagedResponse, LeadListItem } from '../types'
import { formatDateShort, formatLabel, formatScore, scoreTone } from '../utils'

defineProps<{
  keyword: string
  selectedLeadCategory: string
  selectedPoolTier: string
  selectedStatus: string
  leadCategoryOptions: string[]
  poolTierOptions: string[]
  statusOptions: string[]
  leads: PagedResponse<LeadListItem> | null
  selectedLeadId: number | null
  isLoadingLeads: boolean
}>()

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void
  (event: 'update:selectedLeadCategory', value: string): void
  (event: 'update:selectedPoolTier', value: string): void
  (event: 'update:selectedStatus', value: string): void
  (event: 'refresh'): void
  (event: 'selectLead', value: number): void
}>()
</script>

<template>
  <aside class="panel sidebar-panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">Lead Explorer</p>
        <h2>机会列表</h2>
      </div>
      <button class="ghost-button" type="button" @click="emit('refresh')">
        刷新
      </button>
    </div>

    <div class="filter-grid">
      <label class="input-group input-group--full">
        <span>关键词</span>
        <input
          :value="keyword"
          type="text"
          placeholder="按标题或机构搜索"
          @input="emit('update:keyword', ($event.target as HTMLInputElement).value)"
          @keyup.enter="emit('refresh')"
        />
      </label>

      <label class="input-group">
        <span>分类</span>
        <select
          :value="selectedLeadCategory"
          @change="emit('update:selectedLeadCategory', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">全部</option>
          <option v-for="option in leadCategoryOptions" :key="option" :value="option">
            {{ formatLabel(option) }}
          </option>
        </select>
      </label>

      <label class="input-group">
        <span>入池层级</span>
        <select
          :value="selectedPoolTier"
          @change="emit('update:selectedPoolTier', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">全部</option>
          <option v-for="option in poolTierOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label class="input-group input-group--full">
        <span>跟进状态</span>
        <select
          :value="selectedStatus"
          @change="emit('update:selectedStatus', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">全部</option>
          <option v-for="option in statusOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
    </div>

    <div class="lead-list-meta">
      <span>{{ isLoadingLeads ? '加载中...' : `共 ${leads?.totalElements ?? 0} 条线索` }}</span>
      <span>展示前 {{ leads?.size ?? 20 }} 条</span>
    </div>

    <div class="lead-list">
      <button
        v-for="item in leads?.content ?? []"
        :key="item.id"
        type="button"
        class="lead-card"
        :class="{ 'lead-card--active': item.id === selectedLeadId }"
        @click="emit('selectLead', item.id)"
      >
        <div class="lead-card-top">
          <span class="lead-score" :data-tone="scoreTone(item.compositeScore)">
            {{ formatScore(item.compositeScore) }}
          </span>
          <span class="mini-pill">{{ item.poolEntryTier ?? '未分层' }}</span>
        </div>
        <strong class="lead-title">{{ item.title }}</strong>
        <p class="lead-org">
          {{ item.organizationName || item.sourceName || '未识别主体' }}
        </p>
        <div class="lead-tags">
          <span class="tag">{{ item.currentStage ?? '待识别阶段' }}</span>
          <span class="tag">{{ item.status ?? '未设状态' }}</span>
          <span class="tag">{{ item.expiryStatus ?? '未知有效期' }}</span>
        </div>
        <div class="lead-footer">
          <span>{{ formatDateShort(item.publishTime) }}</span>
          <span>{{ item.sourceDomain ?? '未知来源' }}</span>
        </div>
      </button>

      <div v-if="!isLoadingLeads && !(leads?.content.length)" class="empty-state">
        当前筛选条件下没有线索。
      </div>
    </div>
  </aside>
</template>
