<template>
  <div class="login-container">
    <div class="login-box">
      <h2>{{ $t('login.title') }}</h2>

      <div v-if="!show2FAGate">
        <div class="input-group">
          <label>{{ $t('login.password') }}</label>
          <input 
            type="password" 
            v-model="password" 
            @keyup.enter="handleLogin"
            :placeholder="t('login.placeholder')"
            style="width: calc(100% - 20px) !important;"
          />
        </div>
        <button @click="handleLogin" :disabled="loading" class="primary-btn">
          {{ loading ? $t('login.checking') : $t('login.enter') }}
        </button>
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
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { startAuthentication } from '@simplewebauthn/browser'
import { Icons } from '../utils/icons' 
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
const password = ref('')
const loading = ref(false)
const error = ref('')
const show2FAGate = ref(false)
const inputCode = ref('')

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
    router.push('/manage')
}

const handleLogin = async () => {
  if (!password.value) return
  
  loading.value = true
  error.value = ''
  
  try {
    const res = await fetch('/api/auth/login', {
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
        const res = await fetch('/api/auth/code/verify', {
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
        const resp = await fetch('/api/auth/passkey/login/options', { method: 'POST' })
        const options = await resp.json()
        
        const authResp = await startAuthentication(options)
        
        const verResp = await fetch('/api/auth/passkey/login/verify', {
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
  height: 80vh;
}
.login-box {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 8px;
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
  color: var(--text-secondary);
}
input {
  width: 100%;
  padding: 0.8rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 6px;
}
.primary-btn {
  width: 100%;
  padding: 0.8rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
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
    background: rgba(46, 163, 95, 0.1);
}
.divider {
    margin: 15px 0;
    color: #666;
    font-size: 0.8em;
    position: relative;
}
.divider::before, .divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 40%;
    height: 1px;
    background: #444;
}
.divider::before { left: 0; }
.divider::after { right: 0; }
button {
  width: 100%;
  padding: 0.8rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1.05em;
}
button:disabled {
  opacity: 0.7;
}
.error {
  color: #ff4444;
  margin-top: 1rem;
}

/* New Responsive & 2FA Styles */
@media (max-width: 480px) {
    .login-box {
        border: none;
        background: transparent;
        padding: 1rem;
    }
    .input-group input {
        border-radius: 8px;
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
}
.secondary-btn:hover {
    background: rgba(46, 163, 95, 0.1);
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
</style>
