<template>
  <div class="standalone-page">
    <div class="floating-controls">
      <select class="ctrl-btn lang-select" :value="locale" @change="onLocaleChange" :title="t('login.switchLang')">
        <option value="en">EN</option>
        <option value="zh-CN">中文</option>
        <option value="ja">日本語</option>
        <option value="ko">한국어</option>
      </select>
      <button class="ctrl-btn theme-toggle" @click="cycleTheme" :title="themeLabel" :aria-label="themeLabel">
        <span v-if="theme === 'follow' || theme === 'system'" v-html="Icons.themeSystem"></span>
        <span v-else-if="theme === 'light'" v-html="Icons.themeLight"></span>
        <span v-else v-html="Icons.themeDark"></span>
      </button>
    </div>

    <div class="page-box">
      <!-- Step 1: Password form -->
      <template v-if="!recoveryCodes.length">
        <h2>{{ $t('setup.title') }}</h2>
        <p class="hint">{{ $t('setup.hint') }}</p>

        <div v-if="phase === 'token'" class="input-group">
          <label>{{ $t('setup.tokenLabel') }}</label>
          <input type="text" v-model="setupToken" :placeholder="t('setup.tokenPlaceholder')" class="token-input" />
          <p class="small muted">{{ $t('setup.tokenHint') }}</p>
        </div>

        <div class="input-group">
          <label>{{ $t('setup.passwordLabel') }}</label>
          <input type="password" v-model="password" :placeholder="t('setup.passwordPlaceholder')" @keyup.enter="handleSetup" />
        </div>

        <div class="input-group">
          <label>{{ $t('setup.confirmLabel') }}</label>
          <input type="password" v-model="confirmPassword" :placeholder="t('setup.confirmPlaceholder')" @keyup.enter="handleSetup" />
        </div>

        <button @click="handleSetup" :disabled="loading || !canSubmit" class="primary-btn">
          {{ loading ? $t('setup.creating') : $t('setup.create') }}
        </button>

        <p v-if="error" class="error">{{ error }}</p>
      </template>

      <!-- Step 2: Recovery codes (shown after success) -->
      <template v-else>
        <h2>{{ $t('setup.saveCodesTitle') }}</h2>
        <p class="hint">{{ $t('setup.saveCodesHint') }}</p>
        <div class="codes-grid">
          <code v-for="(c, i) in recoveryCodes" :key="i">{{ c }}</code>
        </div>
        <button @click="router.replace('/login')" class="primary-btn" style="margin-top:1rem">
          {{ $t('setup.saved') }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePreferences } from '../composables/usePreferences'
import { Icons } from '../utils/icons'

const router = useRouter()
const { t, locale: i18nLocale } = useI18n()
const { locale, theme, cycleTheme } = usePreferences()

const phase = ref<'setup' | 'token'>('setup')
const setupToken = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const recoveryCodes = ref<string[]>([])

const onLocaleChange = (e: Event) => {
  const val = (e.target as HTMLSelectElement).value
  locale.value = val
  i18nLocale.value = val
}

const themeLabel = computed(() => {
  if (theme.value === 'follow' || theme.value === 'system') return t('login.themeFollow')
  if (theme.value === 'light') return t('login.themeLight')
  return t('login.themeDark')
})

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!password.value || password.value.length < 8) return false
  if (password.value !== confirmPassword.value) return false
  if (phase.value === 'token' && !setupToken.value.trim()) return false
  return true
})

onMounted(async () => {
  // Clear any stale auth from a previous session
  localStorage.removeItem('chronicle_auth')

  try {
    const resp = await fetch(`/api/admin/status?t=${Date.now()}`)
    const json = await resp.json()
    const data = json.data || json
    if (data.phase === 'setup' || data.phase === 'token') {
      phase.value = data.phase
    } else {
      router.replace('/login')
    }
  } catch {
    error.value = t('setup.statusFailed')
  }
})

async function handleSetup() {
  if (!password.value || password.value.length < 8) { error.value = t('setup.tooShort'); return }
  if (password.value !== confirmPassword.value) { error.value = t('setup.mismatch'); return }

  loading.value = true; error.value = ''

  try {
    const body: Record<string, string> = { password: password.value }
    if (phase.value === 'token') body.setupToken = setupToken.value.trim()

    const resp = await fetch(`/api/admin/setup?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await resp.json()
    const data = json.data || json

    if (resp.ok) {
      recoveryCodes.value = data.recoveryCodes || []
    } else {
      error.value = data.message || t('setup.failed')
    }
  } catch {
    error.value = t('setup.connectionError')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.standalone-page { display:flex; justify-content:center; align-items:center; height:100vh; position:relative; background:var(--bg-primary); overflow:hidden; }
.floating-controls { position:fixed; top:16px; right:16px; display:flex; gap:8px; z-index:100; }
.ctrl-btn { display:flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:50%; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; font-size:14px; padding:0; transition:background .2s; }
.ctrl-btn:hover { background:var(--component-bg-hover); }
.lang-select { width:auto; padding:0 8px; border-radius:20px; font-size:12px; font-weight:600; }
.theme-toggle svg { width:18px; height:18px; }
.page-box { background:var(--bg-secondary); padding:2rem; border-radius:8px; width:100%; max-width:460px; border:1px solid var(--border-color); }
h2 { margin:0 0 .5rem; text-align:center; }
.hint { color:var(--text-secondary); font-size:.9em; text-align:center; margin-bottom:1.5rem; }
.input-group { margin:1rem 0; text-align:left; }
label { display:block; margin-bottom:.5rem; color:var(--text-secondary); }
input { width:calc(100% - 20px); padding:.8rem; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:1em; }
.token-input { text-align:center; letter-spacing:2px; font-family:monospace; font-size:1.1em; }
.small { font-size:.8em; margin-top:.3rem; }
.muted { color:var(--text-secondary); }
.primary-btn { width:100%; padding:.8rem; background:var(--accent-color); color:var(--text-on-accent); border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:1.05em; margin-top:.5rem; }
.primary-btn:disabled { opacity:.6; cursor:not-allowed; }
.error { color:var(--code-text); margin-top:1rem; text-align:center; }
.codes-grid { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; margin:1rem 0; }
.codes-grid code { display:block; padding:.5rem; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:4px; font-family:monospace; font-size:1em; letter-spacing:1px; text-align:center; }
</style>
