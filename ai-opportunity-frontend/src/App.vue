<script setup lang="ts">
import { ref } from 'vue'

import LeadDetailPage from './pages/LeadDetailPage.vue'
import OverviewPage from './pages/OverviewPage.vue'
import TaskPage from './pages/TaskPage.vue'

type ViewMode = 'overview' | 'detail' | 'tasks'

const currentView = ref<ViewMode>('overview')
const selectedLeadId = ref<number | null>(null)

function openLeadDetail(id: number) {
  selectedLeadId.value = id
  currentView.value = 'detail'
}

function openOverview() {
  currentView.value = 'overview'
}

function openTasks() {
  currentView.value = 'tasks'
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__badge">AI Opportunity</span>
        <div>
          <strong>销售线索工作台</strong>
          <p>聚焦 AI 评分、AI 判断、跟进建议，以及 Agent 任务管理</p>
        </div>
      </div>

      <nav class="topbar__nav">
        <button
          type="button"
          class="topbar__link"
          :class="{ 'topbar__link--active': currentView === 'overview' }"
          @click="openOverview"
        >
          销售总览
        </button>
        <button
          type="button"
          class="topbar__link"
          :class="{ 'topbar__link--active': currentView === 'tasks' }"
          @click="openTasks"
        >
          Agent 管理
        </button>
      </nav>
    </header>

    <OverviewPage
      v-if="currentView === 'overview'"
      @open-detail="openLeadDetail"
    />

    <LeadDetailPage
      v-else-if="currentView === 'detail'"
      :lead-id="selectedLeadId"
      @back="openOverview"
    />

    <TaskPage v-else />
  </div>
</template>
