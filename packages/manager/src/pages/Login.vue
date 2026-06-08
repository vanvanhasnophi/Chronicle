<template>
  <div class="login-container">
    <StandaloneHeader showBack />

    <div class="login-box">
      <h2>{{ $t('login.title') }}</h2>
      <p v-if="serverHint" class="server-hint">{{ $t("login.currentServer", { url: serverHint }) }}</p>
      <div v-if="!show2FAGate">
        <div class="input-group">
          <label>{{ $t('login.password') }}</label>
          <input
            class="modern-input login-input"
            type="password"
            v-model="password"
            @keyup.enter="handleLogin"
            :placeholder="t('login.placeholder')"
          />
        </div>
        <button @click="handleLogin" :disabled="loading" class="primary-btn">
          {{ loading ? $t('login.checking') : $t('login.enter') }}
        </button>
        <p class="recover-link">
          <router-link to="/recover">{{ $t('login.lostPassword') }}</router-link>
        </p>
      </div>

      <div v-else class="two-fa-section">
          <p class="verification-hint">{{ $t('login.2faRequired') }}</p>

          <button @click="handlePasskeyLogin(true)" :disabled="loading" class="primary-btn passkey-main-btn">
             <span class="icon" v-html="Icons.lock"></span>
             {{ $t('login.usePasskey') }}
          </button>

          <div class="divider">{{ $t('login.or') }}</div>

          <div class="code-entry">
              <input
                  class="modern-input login-input"
                  type="text"
                  v-model="inputCode"
                  :placeholder="t('login.codePlaceholder')"
                  maxlength="6"
                  @keyup.enter="handleCodeVerify"
              />
                <button @click="handleCodeVerify" class="secondary-btn" :disabled="loading || inputCode.length < 6">
                  {{ $t('login.verify') }}
                </button>
          </div>

          <button @click="resetLogin" class="text-btn">{{ $t('login.backToPassword') }}</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { startAuthentication } from '@simplewebauthn/browser'
import { Icons } from '../utils/icons'
import { useI18n } from 'vue-i18n'
import StandaloneHeader from '../components/StandaloneHeader.vue'
import { apiUrl, getSavedServerUrl, needsServerUrl } from '../composables/useServerUrl'

const router = useRouter()
const route = useRoute()

// Redirect to setup if this is a first boot
onMounted(async () => {
  try {
    const url = apiUrl(`/api/admin/status?t=${Date.now()}`)
    const resp = await fetch(url)
    const json = await resp.json()
    const phase = (json.data && json.data.phase) || json.phase
    if (phase === 'setup' || phase === 'token') {
      router.replace(`/setup${window.location.search}`)
    }
  } catch { /* proceed to login form */ }
})

const { t } = useI18n()
const serverHint = (() => { try { const u = getSavedServerUrl(); return u ? u.replace(/^https?:\/\//, "") : "" } catch { return "" } })()


const password = ref('')
const loading = ref(false)
const error = ref('')
const show2FAGate = ref(false)
const inputCode = ref('')

// Sync composable locale ↔ vue-i18n locale

function resolveLoginTarget() {
  const next = route.query.next
  const target = Array.isArray(next) ? next[0] : next
  if (typeof target === 'string' && target.startsWith('/')) {
    return target
  }
  return '/manage'
}

const resetLogin = () => {
    show2FAGate.value = false
    password.value = ''
    error.value = ''
    inputCode.value = ''
}

const completeLogin = () => {
    const session = {
        token: 'active',
        expiry: Date.now() + 24 * 60 * 60 * 1000
    }
    localStorage.setItem('chronicle_auth', JSON.stringify(session))
  router.replace(resolveLoginTarget())
}

const handleLogin = async () => {
  if (!password.value) return

  loading.value = true
  error.value = ''

  try {
    const res = await fetchWithAuth(`/api/auth/login?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    })

    const data = await res.json()
    if (data.success) {
      if (data.requirePasskey) {
        show2FAGate.value = true
      } else {
        completeLogin()
      }
    } else {
      error.value = data.message || t('login.failed')
    }
  } catch (e) {
    error.value = t('login.connectionError')
  } finally {
    loading.value = false
  }
}

const handleCodeVerify = async () => {
    loading.value = true
    error.value = ''
    try {
        const res = await fetchWithAuth(`/api/auth/code/verify?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: inputCode.value })
        })
        const data = await res.json()
        if (data.success) {
            completeLogin()
        } else {
            error.value = data.message || 'Verification failed'
        }
    } catch(e) {
        error.value = 'Verification error'
    } finally {
        loading.value = false
    }
}

const handlePasskeyLogin = async (is2FA = false) => {
    loading.value = true
    if (is2FA) error.value = ''
    else error.value = ''

    try {
        const resp = await fetchWithAuth(`/api/auth/passkey/login/options?t=${Date.now()}`, { method: 'POST' })
        const options = await resp.json()

        const authResp = await startAuthentication(options)

        const verResp = await fetchWithAuth(`/api/auth/passkey/login/verify?t=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: authResp })
        })
        const verData = await verResp.json()
        if (verData.verified) {
          completeLogin()
        } else {
          error.value = t('login.passkeyFailed')
        }
    } catch (e: any) {
           if (e.name === 'NotAllowedError') {
             error.value = t('login.cancelled')
           } else if (e.name === 'InvalidStateError') {
             error.value = t('login.invalidAuthenticator')
           } else {
             error.value = t('login.authFailed')
           }
    } finally {
        loading.value = false
    }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  position: relative;
  background: var(--bg-primary);
  overflow: hidden;
}

.login-box h2{
  margin-top: 8px;
  margin-bottom: 12px;
}
.server-hint {
  text-align: center; font-size: .8rem; color: var(--text-secondary);
  margin: .25rem 0 .5rem;
}

.floating-controls {
  position: fixed;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 100;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  padding: 0;
}

.ctrl-btn:hover {
  background: var(--component-bg-hover);
}

.ctrl-btn:hover option{
  background: var(--component-bg);
  color: var(--text-primary);
}

.theme-toggle svg {
  width: 18px;
  height: 18px;
}


.login-box {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 18px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  border: 1px solid var(--border-color);
}
.input-group {
  margin: 1.5rem 0;
  text-align: left;
}
label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.primary-btn {
  width: 100%;
  padding: 0.8rem;
  background: var(--accent-color);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-variation-settings: 'wght' 600;
}
.passkey-btn {
  width: 100%;
  padding: 0.8rem;
  background: transparent;
  border: 1px solid var(--accent-color);
  color: var(--accent-color);
  border-radius: 6px;
  cursor: pointer;
  margin-top: 10px;
}
.passkey-btn:hover {
  background: var(--component-bg-hover);
}
.divider {
    margin: 15px 0;
  color: var(--component-text-secondary);
    font-size: 0.8em;
    position: relative;
}
.divider::before, .divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background: var(--border-color);
}
.divider::before { left: 0; }
.divider::after { right: 0; }
button {
  width: 100%;
  padding: 0.8rem;
  background: var(--accent-color);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-variation-settings: 'wght' 600;
  font-size: 1.05em;
}
button:disabled {
  opacity: 0.7;
}
.error {
  color: var(--code-text);
  margin-top: 1rem;
}
.recover-link {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.85em;
}
.recover-link a {
  color: var(--text-secondary);
  text-decoration: none;
}
.recover-link a:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
    .login-box {
        border: none;
        background: transparent;
        padding: 1rem;
    }
}
.two-fa-section {
    display: flex;
    flex-direction: column;
    gap: 15px;
}
.secondary-btn {
    width: 100%;
    padding: 0.8rem;
    background: transparent;
    border: 1px solid var(--accent-color);
    color: var(--accent-color);
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-variation-settings: 'wght' 600;
}
.secondary-btn:hover {
  background: var(--component-bg-hover);
}
.text-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.9em;
    padding: 5px;
}
.verification-hint {
    margin-bottom: 5px;
    color: var(--text-secondary);
    font-size: 0.9em;
}
.code-entry {
    display: flex;
    gap: 10px;
}
.code-entry input {
    width: 60%;
    text-align: center;
    letter-spacing: 2px;
    font-size: 1.1em;
}
.code-entry button {
    width: 40%;
}
.passkey-main-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}
.server-url-group {
  margin-bottom: 1.2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}
.server-url-group .hint {
  margin: .35rem 0 .6rem;
  font-size: .82rem;
  color: var(--component-text-secondary);
}
.server-ok {
  color: var(--accent-color);
  font-size: .85rem;
  margin: .4rem 0 0;
}
.server-err {
  color: var(--status-error);
  font-size: .85rem;
  margin: .4rem 0 0;
}
.small-btn {
  font-size: .82rem;
  padding: .4rem 1rem;
}
</style>
