<template>
  <div class="login-container">
    <div class="login-box">
      <h2>Log In</h2>
      <div class="input-group">
        <label>Password</label>
        <input 
          type="password" 
          v-model="password" 
          @keyup.enter="handleLogin"
          placeholder="Enter admin password"
        />
      </div>
      <button @click="handleLogin" :disabled="loading">
        {{ loading ? 'Checking...' : 'Enter' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const password = ref('')
const loading = ref(false)
const error = ref('')

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
      const session = {
        token: 'active',
        expiry: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      }
      localStorage.setItem('chronicle_auth', JSON.stringify(session))
      router.push('/manage')
    } else {
      error.value = data.message || 'Login failed'
    }
  } catch (e) {
    error.value = 'Connection error'
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
  border-radius: 4px;
}
button {
  width: 100%;
  padding: 0.8rem;
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
.error {
  color: #ff4444;
  margin-top: 1rem;
}
</style>
