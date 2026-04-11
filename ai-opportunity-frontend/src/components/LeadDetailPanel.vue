<script setup lang="ts">
import type { LeadDeepAnalysis, LeadDetail } from '../types'
import {
  formatDate,
  formatScore,
  scoreRows,
  scoreTone,
  timelineKey,
  toPercentBar,
} from '../utils'

defineProps<{
  leadDetail: LeadDetail | null
  deepAnalysis: LeadDeepAnalysis | null
  isLoadingLeadDetail: boolean
  selectedLeadId: number | null
  statusOptions: string[]
  isUpdatingStatus: boolean
}>()

const emit = defineEmits<{
  (event: 'updateStatus', value: string): void
}>()
</script>

<template>
  <article class="panel detail-panel">
    <div class="panel-header panel-header--detail">
      <div>
        <p class="eyebrow">Selected Lead</p>
        <h2>机会详情</h2>
      </div>
      <div class="status-actions">
        <button
          v-for="option in statusOptions"
          :key="option"
          type="button"
          class="status-button"
          :class="{ 'status-button--active': leadDetail?.status === option }"
          :disabled="isUpdatingStatus || !selectedLeadId"
          @click="emit('updateStatus', option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div v-if="isLoadingLeadDetail" class="empty-state">详情加载中...</div>

    <div v-else-if="leadDetail" class="detail-content">
      <div class="detail-hero">
        <div>
          <div class="detail-title-row">
            <h3>{{ leadDetail.title }}</h3>
            <span
              class="score-badge"
              :data-tone="scoreTone(leadDetail.score?.compositeScore)"
            >
              综合分 {{ formatScore(leadDetail.score?.compositeScore) }}
            </span>
          </div>
          <p class="detail-subtitle">
            {{ leadDetail.organizationName || leadDetail.sourceName || '未识别机构' }}
            <span class="dot">·</span>
            {{ leadDetail.sourceDomain || '未知来源' }}
            <span class="dot">·</span>
            {{ leadDetail.currentStage || '待识别阶段' }}
          </p>
        </div>

        <div class="detail-chip-row">
          <span class="tag tag--accent">{{ leadDetail.status || '未设状态' }}</span>
          <span class="tag">{{ leadDetail.poolEntryTier || '未设层级' }}</span>
          <span class="tag">{{ leadDetail.expiryStatus || '未知有效性' }}</span>
          <span class="tag">{{ leadDetail.sourceBucket || '未知 bucket' }}</span>
        </div>
      </div>

      <div class="detail-grid">
        <section class="info-card info-card--wide">
          <h4>机会摘要</h4>
          <p class="body-text">{{ leadDetail.description || '暂无摘要' }}</p>
          <div class="kv-grid">
            <div>
              <span class="kv-label">发布时间</span>
              <strong>{{ formatDate(leadDetail.publishTime) }}</strong>
            </div>
            <div>
              <span class="kv-label">信号类型</span>
              <strong>{{ leadDetail.opportunitySignalClass || '--' }}</strong>
            </div>
            <div>
              <span class="kv-label">可立即动作</span>
              <strong>{{ leadDetail.isActionableNow ? '是' : '否' }}</strong>
            </div>
            <div>
              <span class="kv-label">时间窗</span>
              <strong>{{ leadDetail.timeWindowStatus || '--' }}</strong>
            </div>
          </div>
        </section>

        <section class="info-card">
          <h4>评分画像</h4>
          <div class="score-list">
            <div v-for="row in scoreRows(leadDetail.score)" :key="row.label" class="score-row">
              <div class="score-row-top">
                <span>{{ row.label }}</span>
                <strong>{{ formatScore(row.value) }}</strong>
              </div>
              <div class="score-bar">
                <span :style="{ width: `${toPercentBar(row.value)}%` }" />
              </div>
            </div>
          </div>
        </section>

        <section class="info-card">
          <h4>最新动作</h4>
          <p class="body-text emphasized">
            {{ leadDetail.latestSuggestedAction || '暂无建议动作' }}
          </p>
          <p class="body-text muted">
            {{ leadDetail.latestFollowUpAction || leadDetail.score?.scoreReason || '暂无补充说明' }}
          </p>
        </section>

        <section class="info-card">
          <h4>证据摘要</h4>
          <ul class="content-list">
            <li v-for="item in leadDetail.evidenceSummary" :key="item">{{ item }}</li>
            <li v-if="!leadDetail.evidenceSummary.length">暂无证据摘要</li>
          </ul>
        </section>

        <section class="info-card">
          <h4>推荐技术</h4>
          <div class="chip-wrap">
            <span
              v-for="item in leadDetail.recommendedTechnologies"
              :key="item"
              class="tech-chip"
            >
              {{ item }}
            </span>
            <span v-if="!leadDetail.recommendedTechnologies.length" class="muted">
              暂无推荐技术
            </span>
          </div>
        </section>

        <section class="info-card">
          <h4>场景标签</h4>
          <div class="chip-wrap">
            <span v-for="item in leadDetail.scenarioTags" :key="item" class="tag">
              {{ item }}
            </span>
            <span v-if="!leadDetail.scenarioTags.length" class="muted">暂无标签</span>
          </div>
        </section>

        <section class="info-card info-card--wide">
          <h4>相关链接</h4>
          <div class="link-list">
            <a
              v-for="item in leadDetail.relatedLinks"
              :key="`${item.url}-${item.label}`"
              class="link-card"
              :href="item.url"
              target="_blank"
              rel="noreferrer"
            >
              <span class="link-type">{{ item.type || 'link' }}</span>
              <strong>{{ item.label || item.url }}</strong>
              <span class="link-url">{{ item.url || '--' }}</span>
            </a>
            <div v-if="!leadDetail.relatedLinks.length" class="empty-state">
              暂无相关链接
            </div>
          </div>
        </section>
      </div>

      <div class="analysis-panel">
        <div class="analysis-header">
          <div>
            <p class="eyebrow">Deep Investigation</p>
            <h3>深查结论</h3>
          </div>
          <span v-if="deepAnalysis" class="mini-pill">
            深查时间 {{ formatDate(deepAnalysis.analysisTime) }}
          </span>
        </div>

        <div v-if="deepAnalysis" class="analysis-grid">
          <section class="info-card">
            <h4>最终建议</h4>
            <p class="body-text emphasized">
              {{ deepAnalysis.finalRecommendation || '暂无最终建议' }}
            </p>
            <p class="body-text muted">{{ deepAnalysis.suggestedAction || '暂无执行动作' }}</p>
          </section>

          <section class="info-card">
            <h4>AI 价值与风险</h4>
            <p class="body-text">{{ deepAnalysis.aiValueSummary || '暂无价值总结' }}</p>
            <ul class="content-list compact-list">
              <li v-for="risk in deepAnalysis.aiRisks" :key="risk">{{ risk }}</li>
              <li v-if="!deepAnalysis.aiRisks.length">暂无风险项</li>
            </ul>
          </section>

          <section class="info-card">
            <h4>连续性判断</h4>
            <p class="body-text">{{ deepAnalysis.sourceContinuity || '暂无结论' }}</p>
          </section>

          <section class="info-card">
            <h4>政策与预算</h4>
            <p class="body-text">{{ deepAnalysis.policySupportSummary || '暂无政策结论' }}</p>
            <p class="body-text muted">{{ deepAnalysis.budgetSupportSummary || '暂无预算结论' }}</p>
          </section>

          <section class="info-card">
            <h4>竞争与交付</h4>
            <p class="body-text">
              {{ deepAnalysis.competitionAndDeliveryJudgement || '暂无判断' }}
            </p>
          </section>

          <section class="info-card">
            <h4>参考案例与落地</h4>
            <p class="body-text">{{ deepAnalysis.similarCaseSummary || '暂无案例结论' }}</p>
            <p class="body-text muted">{{ deepAnalysis.landingCaseSummary || '暂无落地结论' }}</p>
          </section>

          <section class="info-card info-card--wide">
            <h4>时间线</h4>
            <div class="timeline-list">
              <article
                v-for="(item, index) in deepAnalysis.timeline"
                :key="timelineKey(item, index)"
                class="timeline-item"
              >
                <span class="timeline-date">{{ formatDate(item.date) }}</span>
                <div>
                  <strong>{{ item.title || '未命名事件' }}</strong>
                  <p class="body-text muted">{{ item.description || '暂无事件说明' }}</p>
                </div>
              </article>
              <div v-if="!deepAnalysis.timeline.length" class="empty-state">
                暂无时间线
              </div>
            </div>
          </section>
        </div>

        <div v-else class="empty-state">该线索暂未沉淀深查结果。</div>
      </div>
    </div>

    <div v-else class="empty-state">请选择一条线索查看详情。</div>
  </article>
</template>
