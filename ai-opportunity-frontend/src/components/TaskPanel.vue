<script setup lang="ts">
import type { AgentTaskDetail, AgentTaskSummary, PagedResponse } from '../types'
import { formatDate, formatDateShort, formatLabel, renderScalar } from '../utils'

defineProps<{
  tasks: PagedResponse<AgentTaskSummary> | null
  selectedTaskId: number | null
  taskDetail: AgentTaskDetail | null
  isLoadingTasks: boolean
  isLoadingTaskDetail: boolean
  executionStats: Record<string, number>
}>()

const emit = defineEmits<{
  (event: 'selectTask', value: number): void
}>()
</script>

<template>
  <article class="panel task-panel">
    <div class="panel-header">
      <div>
        <p class="eyebrow">Agent Runs</p>
        <h2>任务批次</h2>
      </div>
      <span class="mini-pill">
        {{ isLoadingTasks ? '加载中...' : `共 ${tasks?.totalElements ?? 0} 次执行` }}
      </span>
    </div>

    <div class="task-layout">
      <div class="task-list">
        <button
          v-for="item in tasks?.content ?? []"
          :key="item.id"
          type="button"
          class="task-card"
          :class="{ 'task-card--active': item.id === selectedTaskId }"
          @click="emit('selectTask', item.id)"
        >
          <div class="task-card-top">
            <span class="mini-pill mini-pill--strong">{{ item.taskType }}</span>
            <span>{{ formatDateShort(item.savedAt) }}</span>
          </div>
          <strong>{{ item.taskKey }}</strong>
          <div class="task-meta">
            <span>{{ item.modelName || '--' }}</span>
            <span>{{ item.tokenInput ?? 0 }} / {{ item.tokenOutput ?? 0 }}</span>
          </div>
        </button>
      </div>

      <div class="task-detail">
        <div v-if="isLoadingTaskDetail" class="empty-state">任务详情加载中...</div>

        <div v-else-if="taskDetail" class="task-detail-body">
          <div class="task-summary-grid">
            <div class="summary-stat">
              <span>任务类型</span>
              <strong>{{ taskDetail.taskType }}</strong>
            </div>
            <div class="summary-stat">
              <span>解析状态</span>
              <strong>{{ taskDetail.parsed ? '已结构化' : '未解析' }}</strong>
            </div>
            <div class="summary-stat">
              <span>结果条目</span>
              <strong>{{ taskDetail.items.length }}</strong>
            </div>
            <div class="summary-stat">
              <span>保存时间</span>
              <strong>{{ formatDate(taskDetail.savedAt) }}</strong>
            </div>
          </div>

          <div class="task-sections">
            <section class="info-card">
              <h4>执行统计</h4>
              <div class="kv-grid kv-grid--compact">
                <div v-for="(value, key) in executionStats" :key="key">
                  <span class="kv-label">{{ formatLabel(key) }}</span>
                  <strong>{{ value }}</strong>
                </div>
              </div>
              <p v-if="!Object.keys(executionStats).length" class="muted">暂无 executionStats</p>
            </section>

            <section class="info-card">
              <h4>任务说明</h4>
              <pre class="code-block">{{ taskDetail.taskMessage || taskDetail.promptText || '暂无任务说明' }}</pre>
            </section>

            <section class="info-card info-card--wide">
              <h4>关键结果项</h4>
              <div class="item-list">
                <article
                  v-for="item in taskDetail.items.slice(0, 4)"
                  :key="item.id"
                  class="result-item"
                >
                  <div class="result-item-top">
                    <span class="mini-pill">{{ item.resultType || 'result' }}</span>
                    <span v-if="item.rankOrder">Rank {{ item.rankOrder }}</span>
                  </div>
                  <strong>{{ item.title || '未命名结果' }}</strong>
                  <p class="body-text muted">
                    {{ renderScalar(item.payload.reason ?? item.payload.finalRecommendation ?? item.payload.description) }}
                  </p>
                </article>
                <div v-if="!taskDetail.items.length" class="empty-state">
                  当前任务没有可展示结果项。
                </div>
              </div>
            </section>
          </div>
        </div>

        <div v-else class="empty-state">请选择一个任务批次查看。</div>
      </div>
    </div>
  </article>
</template>
