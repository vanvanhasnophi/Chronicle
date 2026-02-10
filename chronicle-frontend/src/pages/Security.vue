<template>
  <div class="security-page">
    <h2>Security Settings</h2>
    
    <div class="card">
      <h3>Change Password</h3>
      
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

    <div class="card logout-card">
      <h3>Session</h3>
      <button class="logout-btn" @click="logout">Log Out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const message = ref('')
const success = ref(false)

const changePassword = async () => {
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
        newPassword: newPassword.value
      })
    })
    
    const data = await res.json()
    if (data.success) {
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
.form-group {
  margin-bottom: 1.5rem;
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
</style>
