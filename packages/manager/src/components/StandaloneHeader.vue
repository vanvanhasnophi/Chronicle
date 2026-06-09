<template>
  <div class="immersion-bar">
    <!-- Left group: back + server -->
    <div class="left-group">
      <button v-if="showBack" class="ghost-btn" @click="goHome" title="Back to home">
        <span v-html="Icons.arrowUp" style="transform: rotate(270deg);"></span>
      </button>

      <div v-if="showConfigBtn" class="server-group" @click="showConfig = !showConfig">
        <span class="conn-dot" :class="{ on: serverReady, error: hasError }"></span>
        <span class="conn-label" :class="{ error: hasError }" :title="serverLabel">{{ statusText }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="action-group">
      <select class="ghost-select" :value="locale" @change="onLocaleChange" :title="t('login.switchLang')">
        <option value="en">EN</option>
        <option value="zh-CN">中文</option>
      </select>
      <button class="ghost-btn" @click="cycleTheme" :title="themeLabel">
        <span v-if="theme === 'follow' || theme === 'system'" v-html="Icons.themeSystem"></span>
        <span v-else-if="theme === 'light'" v-html="Icons.themeLight"></span>
        <span v-else v-html="Icons.themeDark"></span>
      </button>
      <WindowControls />
    </div>

    <!-- Server config popover (anchored below server-group) -->
    <div v-if="showConfig" class="config-popover">
      <input type="url" v-model="serverUrl" @keyup.enter="handleConnect" @input="clearMessages"
        :placeholder="t('login.serverUrlPlaceholder')" class="url-input" />
      <button class="btn act" @click="handleConnect" :disabled="!serverUrl.trim() || checking">
        {{ checking ? '...' : t('login.connect') }}
      </button>
      <p v-if="successMsg" class="ok">{{ successMsg }}</p>
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="hasError && !checking && !error && !successMsg" class="err muted">Previously unreachable — check the
        address and retry</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePreferences } from '../composables/usePreferences'
import { needsServerUrl, useServerUrl, buildApiUrl } from '../composables/useServerUrl'
import { Icons } from '../utils/icons'
import WindowControls from './WindowControls.vue'

const props = defineProps<{ showBack?: boolean }>()
const router = useRouter()
const { t, locale: i18nLocale } = useI18n()
const { locale, theme, cycleTheme } = usePreferences()

function goHome() { router.push('/') }

const showConfigBtn = needsServerUrl
const { url: serverUrl, confirmed, confirmedUrl, checking, error, verify } = useServerUrl()
const showConfig = ref(false)
const successMsg = ref('')

const hasError = computed(() => !checking.value && confirmed.value === false)
const serverReady = computed(() => !showConfigBtn || (confirmed.value === true && !checking.value))
const serverLabel = computed(() => {
  if (!showConfigBtn) return buildApiUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  return confirmedUrl.value || serverUrl.value || ''
})
const statusText = computed(() => {
  if (checking.value) return (serverLabel.value || '').replace(/^https?:\/\//, '').slice(0, 22)
  if (hasError.value) return (serverLabel.value || '???').replace(/^https?:\/\//, '').slice(0, 22)
  if (serverReady.value) return serverLabel.value.replace(/^https?:\/\//, '').slice(0, 24)
  if (serverLabel.value) return serverLabel.value.replace(/^https?:\/\//, '').slice(0, 24)
  return t('welcome.noServer')
})

onMounted(() => {
  if (showConfigBtn && (!confirmedUrl.value || hasError.value)) showConfig.value = true
})

function clearMessages() { successMsg.value = '' }

async function handleConnect() {
  const ok = await verify()
  if (ok) successMsg.value = t('login.serverOk')
}

function onLocaleChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  locale.value = v
  i18nLocale.value = v
}

const themeLabel = computed(() => {
  if (theme.value === 'follow' || theme.value === 'system') return t('login.themeFollow')
  if (theme.value === 'light') return t('login.themeLight')
  return t('login.themeDark')
})
</script>

<style scoped>
.immersion-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px 0 16px;
  height: 52px;
  pointer-events: none;
  -webkit-app-region: drag;
}

.immersion-bar>* {
  pointer-events: auto;
}

.immersion-bar button,
.immersion-bar select,
.immersion-bar input,
.immersion-bar .win-controls {
  -webkit-app-region: no-drag;
}

.left-group { display: flex; align-items: center; gap: 4px; -webkit-app-region: no-drag; }

/* ── Server group ── */
.server-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: background .2s;
  border-radius: 9999px;
  cursor: pointer;
  color: var(--text-primary);
  height: 36px;
  padding: 0 14px;
}

.server-group:hover {
  background: color-mix(in srgb, var(--text-secondary) 20%, transparent);
}

.conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary);
  flex-shrink: 0;
}

.conn-dot.on {
  background: var(--status-success);
  box-shadow: 0 0 6px var(--status-success);
}

.conn-dot.error {
  background: var(--status-error);
  box-shadow: 0 0 6px var(--status-error);
}

.conn-label {
  font-size: .75rem;
  color: var(--text-secondary);
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn-label.error {
  color: var(--status-error);
}

/* ── Ghost controls ── */
.action-group {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.ghost-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 9999px;
  padding: 0;
  transition: color .15s, background .15s;
}

.ghost-btn:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-secondary) 20%, transparent);
}

.ghost-btn span,
.ghost-btn:deep(svg) {
  width: 22px;
  height: 22px;
}

.ghost-select {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: .85rem;
  padding: 4px 32px 4px 16px;
  cursor: pointer;
  border-radius: 9999px;
  transition: color .15s;
  height: 40px;
  min-width: 100px;
  -webkit-appearance: none;
  appearance: none;
  transition: background .2s, color .2s;
}

.ghost-select:hover {
  background: color-mix(in srgb, var(--text-secondary) 20%, transparent);
}

.ghost-select option {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* ── Config popover (anchored below server group) ── */
.server-group {
  position: relative;
}

.config-popover {
  position: absolute;
  top: 100%;
  left: 8px;
  margin-top: 8px;
  z-index: 110;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  gap: 6px;
  align-items: flex-start;
  flex-wrap: wrap;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .2);
  min-width: 300px;
}

.url-input {
  flex: 1;
  min-width: 180px;
  padding: .5rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: .85em;
}

.btn {
  padding: .5rem .9rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: .85em;
  cursor: pointer;
  white-space: nowrap;
}

.btn.act {
  background: var(--accent-color);
  color: #fff;
  border-color: var(--accent-color);
  padding: 0 12px;
  height: 34px;
  font-size: .8rem;
  text-align: center;
}

.btn:disabled {
  opacity: .5;
}

.err {
  color: var(--status-error);
  font-size: .78rem;
  margin: .2rem 0 0;
  width: 100%;
}

.err.muted {
  color: var(--text-secondary);
}

.ok {
  color: var(--status-success);
  font-size: .78rem;
  margin: .2rem 0 0;
  width: 100%;
}
</style>
