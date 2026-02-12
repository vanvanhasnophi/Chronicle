<template>
  <div class="security-page">
    <h2>Security Settings</h2>
    
    <div class="card highlight-card">
        <h3 style="margin-top: 5px;">Login Verification Code</h3>
        <p class="hint">Use this code to log in on another device requiring 2FA.</p>
        
        <div v-if="verificationCode" class="code-display">
            <div class="code code-display">{{ verificationCode.split('').join(' ') }}</div>
            <div class="timer expire-timer">Expires in {{ Math.floor(codeTimer / 60) }}:{{ (codeTimer % 60).toString().padStart(2, '0') }}</div>
        </div>
        <button v-else @click="generateCode" class="secondary-btn">Generate Code</button>
    </div>

    <div class="card">
      <h3 style="margin-top: 5px;">Change Password</h3>
      
      <div class="form-group">
        <label>Current Password</label>
        <input type="password" v-model="oldPassword" />
      </div>

      <div class="form-group">
        <label>New Password</label>
        <input type="password" v-model="newPassword" />
      </div>

      <div class="form-group">
        <label>Confirm New Password</label>
        <input type="password" v-model="confirmPassword" />
      </div>

      <button @click="changePassword" :disabled="loading">
        {{ loading ? 'Updating...' : 'Update Password' }}
      </button>

      <p v-if="message" :class="['message', success ? 'success' : 'error']">
        {{ message }}
      </p>
    </div>

    <div class="card">
      <h3 style="margin-top: 5px;">Two-Factor Authentication</h3>
      <p class="hint">Register a Passkey device (FaceID/TouchID/YubiKey) to enforce 2FA verification after password login.</p>
      
      <button @click="registerPasskey" :disabled="regLoading" class="secondary-btn">
        {{ regLoading ? 'Registering...' : 'Register New Passkey' }}
      </button>
      
      <p v-if="regMessage" :class="['message', regSuccess ? 'success' : 'error']">
        {{ regMessage }}
      </p>

      <div v-if="passkeys.length > 0" class="passkey-list">
        <h4>Registered Keys</h4>
        <div v-for="pk in passkeys" :key="pk.id" class="passkey-item">
            <div class="pk-info">
                <span class="pk-name">{{ pk.name || 'Unnamed Key' }}</span>
                <span class="pk-date">Added: {{ new Date(pk.createdAt).toLocaleDateString() }}</span>
            </div>
            <div class="pk-actions">
                <button class="icon-btn edit-btn" @click="renamePasskey(pk.id, pk.name || 'Unnamed Key')" title="Rename" v-html="Icons.edit"></button>
                <button class="icon-btn delete-btn" @click="deletePasskey(pk.id)" title="Delete" v-html="Icons.trash"></button>
            </div>
        </div>
      </div>
    </div>

    <div class="card logout-card">
      <h3 style="margin-top: 5px;">Session</h3>
      <button class="logout-btn" @click="logout">Log Out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { Icons } from '../utils/icons'

const router = useRouter()
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const message = ref('')
const success = ref(false)

const verificationCode = ref('')
const codeTimer = ref(0)
let timerInterval: any = null

const generateCode = async () => {
    try {
        const res = await fetch('/api/auth/code/generate')
        const data = await res.json()
        if (data.code) {
            verificationCode.value = data.code
            codeTimer.value = data.expiresIn || 300
            if (timerInterval) clearInterval(timerInterval)
            timerInterval = setInterval(() => {
                codeTimer.value--
                if (codeTimer.value <= 0) {
                     verificationCode.value = ''
                     clearInterval(timerInterval)
                }
            }, 1000)
        }
    } catch(e) {
        console.error(e)
    }
}

interface Passkey {
    id: string;
    name: string;
    createdAt: number;
    lastUsed?: number;
}
const passkeys = ref<Passkey[]>([])

const verifyPasskey = async () => {
    try {
        message.value = "Verifying 2FA..."
        const resp = await fetch('/api/auth/passkey/login/options', { method: 'POST' })
        const options = await resp.json()
        
        const authResp = await startAuthentication(options)
        
        const verResp = await fetch('/api/auth/passkey/login/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: authResp })
        })
        const verData = await verResp.json()
        return verData.verified ? verData.token : null
    } catch (e) {
        console.error(e)
        return null
    }
}

const changePassword = async (tokenOrEvent?: string | Event) => {
  const actualToken = typeof tokenOrEvent === 'string' ? tokenOrEvent : ''

  if (newPassword.value !== confirmPassword.value) {
    message.value = "New passwords do not match"
    success.value = false
    return
  }
  if (!oldPassword.value) {
    message.value = "Please enter current password"
    success.value = false
    return
  }

  loading.value = true
  message.value = ''

  try {
    const res = await fetch('/api/auth/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldPassword: oldPassword.value,
        newPassword: newPassword.value,
        token: actualToken
      })
    })
    
    const data = await res.json()

    if (data.requirePasskey) {
        const passkeyToken = await verifyPasskey()
        if (passkeyToken) {
            await changePassword(passkeyToken)
            return
        } else {
             message.value = "2FA Verification Failed"
             success.value = false
        }
    } else if (data.success) {
      message.value = "Password updated successfully"
      success.value = true
      oldPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    } else {
      message.value = data.message || "Failed to update password"
      success.value = false
    }
  } catch (e) {
    message.value = "Connection error"
    success.value = false
  } finally {
    loading.value = false
  }
}

const logout = () => {
  localStorage.removeItem('chronicle_auth')
  router.push('/login')
}

const regLoading = ref(false)
const regMessage = ref('')
const regSuccess = ref(false)

const registerPasskey = async () => {
    regLoading.value = true
    regMessage.value = ''
    try {
        const resp = await fetch('/api/auth/passkey/register/options', { method: 'POST' })
        const options = await resp.json()
        
        const attResp = await startRegistration(options)
        
        const verResp = await fetch('/api/auth/passkey/register/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response: attResp })
        })
        const verData = await verResp.json()
        if (verData.verified) {
             regSuccess.value = true
             regMessage.value = 'Passkey registered successfully!'
             fetchPasskeys()
        } else {
             regSuccess.value = false
             regMessage.value = 'Verification failed'
        }
    } catch (e: any) {
        regSuccess.value = false
        if (e.name === 'NotAllowedError') {
             regMessage.value = 'Registration cancelled'
        } else if (e.name === 'InvalidStateError') {
             regMessage.value = 'Authenticator already registered'
        } else {
             regMessage.value = 'Registration failed. Please try again.'
        }
    } finally {
        regLoading.value = false
    }
}

const fetchPasskeys = async () => {
    try {
        const res = await fetch('/api/auth/passkeys')
        if (res.ok) {
            passkeys.value = await res.json()
        }
    } catch (e) {
        console.error("Failed to fetch passkeys", e)
    }
}

const deletePasskey = async (id: string) => {
    if (!confirm('Are you sure you want to delete this passkey?')) return;
    try {
        const res = await fetch(`/api/auth/passkeys/${id}`, { method: 'DELETE' })
        if (res.ok) {
            fetchPasskeys()
        }
    } catch(e) {
        alert('Failed to delete passkey')
    }
}

const renamePasskey = async (id: string, currentName: string) => {
    const newName = prompt('Enter new name:', currentName)
    if (!newName || newName === currentName) return;
    
    try {
        const res = await fetch(`/api/auth/passkeys/${id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: newName })
        })
        if (res.ok) {
            fetchPasskeys()
        }
    } catch(e) {
        alert('Failed to rename passkey')
    }
}

onMounted(() => {
    fetchPasskeys()
})
</script>

<style scoped>
.security-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}
.card {
  background: var(--bg-secondary);
  padding: 2rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  margin-bottom: 2rem;
}
.hint {
    color: #888;
    font-size: 0.9em;
    margin-bottom: 1rem;
}
.secondary-btn {
    width: 100%;
    padding: 0.8rem;
    background: transparent;
    border: 1px solid #2ea35f;
    color: #2ea35f;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.secondary-btn:hover {
    background: rgba(46, 163, 95, 0.1);
}
.passkey-list {
    margin-top: 2rem;
    border-top: 1px solid var(--border-color);
    padding-top: 1rem;
}
.passkey-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8rem;
    border-bottom: 1px solid var(--border-color);
    background: rgba(0,0,0,0.2);
    margin-bottom: 8px;
    border-radius: 4px;
}
.pk-info {
    display: flex;
    flex-direction: column;
}
.pk-name {
    font-weight: bold;
    color: var(--text-primary);
}
.pk-date {
    font-size: 0.8rem;
    color: #888;
}
.pk-actions {
    display: flex;
    gap: 0.5rem;
}
.icon-btn {
    padding: 0.4rem;
    font-size: 1rem;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.icon-btn :deep(svg) {
    width: 1.2rem;
    height: 1.2rem;
}
.icon-btn:hover {
    background: rgba(255,255,255,0.1);
}
.delete-btn {
    color: #ff4444;
}
.delete-btn:hover {
    background: #ff222230;
}
.edit-btn {
    color: #ffffffc0;
}

.form-group {
  margin-bottom: 1.5rem;
}
label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}
input {
  display: flex;
  width: calc(100% - 20px);
  padding: 0.8rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
}
button {
  padding: 0.8rem 1.5rem;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}
button:disabled {
  opacity: 0.7;
}
.message {
  margin-top: 1rem;
}
.success { color: #44ff44; }
.error { color: #ff4444; }
.logout-btn {
  background: #ff4444;
}

.code.code-display {
    text-align: center;
    font-size: 3em;
    letter-spacing: 0.2em;
    font-weight: bold;
    margin-bottom: 0.5em;
    color: var(--accent-color);
}

.timer.expire-timer {
    text-align: center;
    font-size: 1em;
    color: #888;
}

</style>
