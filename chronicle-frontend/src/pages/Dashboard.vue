<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type DashboardResponse = {
  overview: Record<string, any>
  recentPosts: Array<any>
  topTags: Array<{ name: string; count: number }>
  monthlyPosts: Array<{ key: string; label: string; count: number }>
  traffic: Record<string, any>
  uploadStats: Record<string, any>
}

const { t } = useI18n()
const loading = ref(true)
const error = ref('')
const data = ref<DashboardResponse | null>(null)

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

onMounted(async () => {
  try {
    const response = await fetch('/api/dashboard?days=30&t=' + Date.now(), { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    data.value = await response.json()
  } catch (err) {
    error.value = t('dashboard.loadFailed')
  } finally {
    loading.value = false
  }
})

const overviewCards = computed(() => {
  const overview = data.value?.overview || {}
  return [
    { label: t('dashboard.totalPosts'), value: overview.totalPosts ?? 0, note: t('dashboard.publishedPosts', { count: overview.publishedPosts ?? 0 }) },
    { label: t('dashboard.drafts'), value: overview.draftPosts ?? 0, note: t('dashboard.modifyingPosts', { count: overview.modifyingPosts ?? 0 }) },
    { label: t('dashboard.featuredPosts'), value: overview.featuredPosts ?? 0, note: t('dashboard.aiGeneratedPosts', { count: overview.aiGeneratedPosts ?? 0 }) },
    { label: t('dashboard.uploadFiles'), value: overview.totalUploads ?? 0, note: formatBytes(overview.totalUploadBytes ?? 0) },
  ]
})

const trafficCards = computed(() => {
  const traffic = data.value?.traffic || {}
  return [
    { label: t('dashboard.pageViews'), value: traffic.pageViews ?? 0 },
    { label: t('dashboard.apiCalls'), value: traffic.apiCalls ?? 0 },
    { label: t('dashboard.uniqueVisitors'), value: traffic.uniqueVisitors ?? 0 },
    { label: t('dashboard.totalRequests'), value: traffic.totalRequests ?? 0 },
  ]
})

const topTags = computed(() => data.value?.topTags || [])
const monthlyPosts = computed(() => data.value?.monthlyPosts || [])
const recentPosts = computed(() => data.value?.recentPosts || [])
</script>

<template>
  <div class="page-dashboard">
    <header class="page-header">
      <div>
        <h2>{{ t('dashboard.title') }}</h2>
        <p>{{ t('dashboard.subtitle') }}</p>
      </div>
    </header>

    <div v-if="loading" class="state-card">{{ t('dashboard.loading') }}</div>
    <div v-else-if="error" class="state-card error">{{ error }}</div>
    <template v-else>
      <section class="section-grid summary-grid">
        <article v-for="card in overviewCards" :key="card.label" class="metric-card">
          <span class="metric-label">{{ card.label }}</span>
          <strong class="metric-value">{{ card.value }}</strong>
          <small class="metric-note">{{ card.note }}</small>
        </article>
      </section>

      <section class="section-grid two-col">
        <article class="panel">
          <div class="panel-header">
            <h3>{{ t('dashboard.recentPosts') }}</h3>
          </div>
          <ul class="list-card">
            <li v-for="post in recentPosts" :key="post.id">
              <div class="list-main">
                <strong>{{ post.title }}</strong>
                <span>{{ formatDate(post.updatedAt || post.date) }}</span>
              </div>
              <span class="badge" :class="post.status">{{ post.status }}</span>
            </li>
          </ul>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h3>{{ t('dashboard.topTags') }}</h3>
          </div>
          <ul class="tag-rank">
            <li v-for="tag in topTags" :key="tag.name">
              <span class="tag-name">#{{ tag.name }}</span>
              <span class="tag-count">{{ tag.count }}</span>
              <span class="tag-bar"><span :style="{ width: `${Math.min(100, Math.max(8, tag.count * 16))}%` }"></span></span>
            </li>
          </ul>
        </article>
      </section>

      <section class="section-grid two-col">
        <article class="panel">
          <div class="panel-header">
            <h3>{{ t('dashboard.monthlyPosts') }}</h3>
          </div>
          <div class="bar-chart">
            <div v-for="item in monthlyPosts" :key="item.key" class="bar-row">
              <span class="bar-label">{{ item.label }}</span>
              <div class="bar-track"><span :style="{ width: `${Math.max(6, (item.count / Math.max(1, Math.max(...monthlyPosts.map((v) => v.count)))) * 100)}%` }"></span></div>
              <span class="bar-value">{{ item.count }}</span>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <h3>{{ t('dashboard.trafficSnapshot') }}</h3>
          </div>
          <div class="snapshot-grid">
            <div v-for="card in trafficCards" :key="card.label" class="snapshot-item">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </div>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page-dashboard { padding: 1.2rem; display: grid; gap: 1rem; }
.page-header h2 { margin: 0; font-size: 1.6rem; }
.page-header p { margin: .35rem 0 0; color: var(--component-text-secondary); }
.state-card { padding: 1rem 1.2rem; border: 1px solid var(--border-color); border-radius: 14px; background: var(--component-bg); }
.state-card.error { color: var(--warning); }
.section-grid { display: grid; gap: 1rem; }
.summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.metric-card, .panel { border: 1px solid var(--border-color); border-radius: 16px; background: var(--component-bg-blur-alt); box-shadow: var(--shadow-elev-1); }
.metric-card { padding: 1rem; display: grid; gap: .35rem; }
.metric-label { color: var(--component-text-secondary); font-size: .9rem; }
.metric-value { font-size: 2rem; line-height: 1; }
.metric-note { color: var(--component-text-secondary); }
.panel { padding: 1rem; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .8rem; }
.panel-header h3 { margin: 0; font-size: 1.05rem; }
.list-card, .tag-rank { list-style: none; margin: 0; padding: 0; display: grid; gap: .65rem; }
.list-card li { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: .8rem .9rem; border-radius: 12px; background: var(--component-bg); border: 1px solid var(--border-color); }
.list-main { display: grid; gap: .2rem; min-width: 0; }
.list-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-main span { color: var(--component-text-secondary); font-size: .85rem; }
.badge { padding: .25rem .55rem; border-radius: 999px; font-size: .78rem; background: var(--component-bg-hover); }
.badge.published { color: var(--featured); }
.badge.draft { color: var(--warning); }
.badge.modifying { color: var(--accent-color); }
.tag-rank li { display: grid; grid-template-columns: auto auto 1fr; gap: .6rem; align-items: center; }
.tag-name { min-width: 0; }
.tag-count { color: var(--component-text-secondary); }
.tag-bar { height: 8px; border-radius: 999px; background: var(--component-bg); overflow: hidden; }
.tag-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 45%, transparent)); }
.bar-chart { display: grid; gap: .7rem; }
.bar-row { display: grid; grid-template-columns: 50px 1fr 36px; gap: .6rem; align-items: center; }
.bar-label { color: var(--component-text-secondary); font-size: .88rem; }
.bar-track { height: 10px; background: var(--component-bg); border-radius: 999px; overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 25%, transparent)); }
.bar-value { text-align: right; color: var(--component-text-secondary); font-size: .88rem; }
.snapshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
.snapshot-item { padding: .85rem .95rem; border-radius: 12px; background: var(--component-bg); border: 1px solid var(--border-color); display: grid; gap: .25rem; }
.snapshot-item span { color: var(--component-text-secondary); font-size: .85rem; }
.snapshot-item strong { font-size: 1.25rem; }
@media (max-width: 1100px) { .summary-grid, .two-col { grid-template-columns: 1fr 1fr; } }
@media (max-width: 720px) { .summary-grid, .two-col, .snapshot-grid { grid-template-columns: 1fr; } .bar-row { grid-template-columns: 44px 1fr 32px; } }
</style>
