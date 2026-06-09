<template>
  <div class="welcome-root">
    <StandaloneHeader />

    <!-- Branding -->
    <div class="brand">
      <h1>Chronicle Manager</h1>
      <p>{{ $t('welcome.subtitle') }}</p>
    </div>

    <!-- Cards -->
    <div class="card-row">
      <button class="hero-card" @click="isLoggedIn ? goConsole() : goLogin()">
        <div class="card-icon" v-html="Icons.columns"></div>
        <h2>{{ $t('welcome.console') }}</h2>
        <p>{{ isLoggedIn ? $t('welcome.enterHint') : $t('welcome.loginHint') }}</p>
        <span class="card-arrow">{{ isLoggedIn ? $t('welcome.enter') : $t('welcome.login') }} →</span>
      </button>

      <button class="hero-card" @click="goEditor">
        <div class="card-icon" v-html="Icons.edit"></div>
        <h2>{{ $t('welcome.editor') }}</h2>
        <p>{{ $t('welcome.editorHint') }}</p>
        <span class="card-arrow">{{ $t('welcome.open') }} →</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StandaloneHeader from '../components/StandaloneHeader.vue'
import { apiUrl } from '../composables/useServerUrl'
import { Icons } from '../utils/icons'

const router = useRouter()
const { t } = useI18n()
const isLoggedIn = ref(false)

onMounted(async () => {
  // Verify auth with a minimal authenticated ping
  try {
    const raw = localStorage.getItem('chronicle_auth')
    if (!raw) return
    const session = JSON.parse(raw)
    if (!session.token || !session.expiry || Date.now() > session.expiry) {
      localStorage.removeItem('chronicle_auth')
      return
    }
    const resp = await fetch(apiUrl('/api/auth/ping?t=' + Date.now()), {
      headers: { 'x-chronicle-auth': raw }
    })
    if (resp.ok) {
      isLoggedIn.value = true
    } else {
      localStorage.removeItem('chronicle_auth')
    }
  } catch {
    // Server unreachable — keep existing state, don't clear auth
  }
})

function goLogin()   { router.push('/login') }
function goEditor()  { router.push('/editor') }
function goConsole() { router.push('/dashboard') }
</script>

<style scoped>
.welcome-root {
  height: var(--app-height);
  overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--bg-primary);
  padding: 1.5rem;
  box-sizing: border-box;
}

/* ── Branding ── */
.brand {
  text-align: center;
  margin-bottom: clamp(2rem, 6vh, 3.5rem);
}
.brand h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
  font-weight: 600;
  font-variation-settings: 'wght' 600, 'wdth' 100;
  letter-spacing: -.03em;
  line-height: 1;
}
.brand p {
  margin: .5rem 0 0;
  color: var(--text-secondary);
  font-size: .95rem;
}

/* ── Cards ── */
.card-row {
  display: flex; gap: 1.2rem;
  max-width: 620px; width: 100%;
}
.hero-card {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: clamp(2rem, 6vh, 3rem) 1.5rem;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  text-align: center;
  transition: border-color .2s, box-shadow .2s, transform .15s;
  min-height: 200px;
}
.hero-card:hover {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
}
.card-icon { margin-bottom: 1rem; }
.card-icon :deep(svg) { width: 40px; height: 40px; color: var(--accent-color); }
.hero-card h2 { margin: 0 0 .4rem; font-size: 1.1rem; font-weight: 700; }
.hero-card p  { margin: 0 0 1rem; font-size: .82rem; color: var(--text-secondary); line-height: 1.45; max-width: 200px; }
.card-arrow { font-size: .82rem; color: var(--accent-color); font-weight: 600; }

@media (max-width: 500px) {
  .card-row { flex-direction: column; }
  .hero-card { min-height: 140px; padding: 1.5rem; }
  .brand h1 { font-size: 1.6rem; }
}
</style>
