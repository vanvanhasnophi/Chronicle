<template>
  <div class="standalone-page">
    <StandaloneHeader showBack />

    <div class="page-box">
      <h2>{{ $t('recover.title') }}</h2>
      <p v-if="serverHint" class="server-hint">{{ $t("login.currentServer", { url: serverHint }) }}</p>
      <p class="hint">{{ $t('recover.hint') }}</p>

      <div class="input-group">
        <label>{{ $t('recover.codeLabel') }}</label>
        <input class="modern-input login-input" type="password" v-model="recoveryCode" />
      </div>

      <div class="input-group">
        <label>{{ $t('recover.newPasswordLabel') }}</label>
        <input class="modern-input login-input" type="password" v-model="password" :placeholder="t('setup.passwordPlaceholder')" />
      </div>

      <div class="input-group">
        <label>{{ $t('setup.confirmLabel') }}</label>
        <input class="modern-input login-input" type="password" v-model="confirmPassword" :placeholder="t('setup.confirmPlaceholder')" />
      </div>

      <button @click="handleRecover" :disabled="loading || !canSubmit" class="primary-btn">
        {{ loading ? $t('recover.resetting') : $t('recover.reset') }}
      </button>

      <p class="back-link">
        <router-link to="/login">{{ $t('recover.backToLogin') }}</router-link>
      </p>

      <p v-if="success" class="success-msg">{{ $t('recover.success') }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StandaloneHeader from '../components/StandaloneHeader.vue'
import { apiUrl, getSavedServerUrl, needsServerUrl } from '../composables/useServerUrl'

const router = useRouter()
const { t } = useI18n()
const serverHint = (() => { try { const u = getSavedServerUrl(); return u ? u.replace(/^https?:\/\//, "") : "" } catch { return "" } })()

const recoveryCode = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)


const canSubmit = computed(() => {
  if (loading.value) return false
  if (!recoveryCode.value.trim()) return false
  if (!password.value || password.value.length < 8) return false
  if (password.value !== confirmPassword.value) return false
  return true
})

onMounted(async () => {
  try {
    const resp = await fetch(apiUrl(`/api/admin/status?t=${Date.now()}`))
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
    const resp = await fetch(apiUrl(`/api/admin/recover/reset?t=${Date.now()}`), {
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
.page-box { background:var(--bg-secondary); padding:2rem; border-radius:8px; width:100%; max-width:420px; border:1px solid var(--border-color); }
h2 { margin:0 0 .5rem; text-align:center; }
.server-hint { text-align:center; font-size:.8rem; color:var(--text-secondary); margin:.25rem 0 .5rem; }
.hint { color:var(--text-secondary); font-size:.9em; text-align:center; margin-bottom:1.5rem; }
.input-group { margin:1rem 0; text-align:left; }
label { display:block; margin-bottom:.5rem; color:var(--text-secondary); font-size: 0.95rem; }
.primary-btn { width:100%; padding:.8rem; background:var(--accent-color); color:var(--text-on-accent); border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:1.05em; margin-top:.5rem; }
.primary-btn:disabled { opacity:.6; cursor:not-allowed; }
.error { color:var(--code-text); margin-top:1rem; text-align:center; }
.success-msg { color:var(--accent-color); margin-top:1rem; text-align:center; }
.back-link { text-align:center; margin-top:.8rem; }
.back-link a { color:var(--text-secondary); font-size:.85rem; }
</style>
