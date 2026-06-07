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
      <h2>{{ $t('recover.title') }}</h2>
      <p class="hint">{{ $t('recover.hint') }}</p>

      <div class="input-group">
        <label>{{ $t('recover.codeLabel') }}</label>
        <input type="password" v-model="recoveryCode" />
      </div>

      <div class="input-group">
        <label>{{ $t('recover.newPasswordLabel') }}</label>
        <input type="password" v-model="password" :placeholder="t('setup.passwordPlaceholder')" />
      </div>

      <div class="input-group">
        <label>{{ $t('setup.confirmLabel') }}</label>
        <input type="password" v-model="confirmPassword" :placeholder="t('setup.confirmPlaceholder')" />
      </div>

      <button @click="handleRecover" :disabled="loading || !canSubmit" class="primary-btn">
        {{ loading ? $t('recover.resetting') : $t('recover.reset') }}
      </button>

      <p v-if="success" class="success-msg">{{ $t('recover.success') }}</p>
      <p v-if="error" class="error">{{ error }}</p>
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

const recoveryCode = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

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
  if (!recoveryCode.value.trim()) return false
  if (!password.value || password.value.length < 8) return false
  if (password.value !== confirmPassword.value) return false
  return true
})

onMounted(async () => {
  try {
    const resp = await fetch(`/api/admin/status?t=${Date.now()}`)
    const json = await resp.json()
    const phase = (json.data && json.data.phase) || json.phase
    if (phase === 'setup' || phase === 'token') {
      router.replace('/setup')
    } else if (phase !== 'login') {
      router.replace('/login')
    }
  } catch { /* show recover form */ }
})

async function handleRecover() {
  if (password.value !== confirmPassword.value) { error.value = t('setup.mismatch'); return }
  if (password.value.length < 8) { error.value = t('setup.tooShort'); return }

  loading.value = true; error.value = ''; success.value = false

  try {
    const resp = await fetch(`/api/admin/recover/reset?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: recoveryCode.value.trim(), password: password.value }),
    })
    const json = await resp.json()
    const data = json.data || json

    if (resp.ok) {
      success.value = true
      setTimeout(() => router.replace('/login'), 1500)
    } else {
      error.value = data.remainingMinutes
        ? t('recover.locked', { minutes: data.remainingMinutes })
        : (data.message || t('recover.invalid'))
    }
  } catch {
    error.value = t('recover.connectionError')
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
.page-box { background:var(--bg-secondary); padding:2rem; border-radius:8px; width:100%; max-width:420px; border:1px solid var(--border-color); }
h2 { margin:0 0 .5rem; text-align:center; }
.hint { color:var(--text-secondary); font-size:.9em; text-align:center; margin-bottom:1.5rem; }
.input-group { margin:1rem 0; text-align:left; }
label { display:block; margin-bottom:.5rem; color:var(--text-secondary); }
input { width:calc(100% - 20px); padding:.8rem; background:var(--bg-primary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; font-size:1em; }
.primary-btn { width:100%; padding:.8rem; background:var(--accent-color); color:var(--text-on-accent); border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:1.05em; margin-top:.5rem; }
.primary-btn:disabled { opacity:.6; cursor:not-allowed; }
.error { color:var(--code-text); margin-top:1rem; text-align:center; }
.success-msg { color:var(--accent-color); margin-top:1rem; text-align:center; }
</style>
