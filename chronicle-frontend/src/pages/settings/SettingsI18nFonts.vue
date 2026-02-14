<template>
  <div class="settings-card">
    <h2>{{ $t('settings.i18n') }}</h2>
    <p class="hint">{{ $t('settings.i18nHint') }}</p>

    <div class="form-row">
      <label>Frontend default language</label>
      <select v-model="frontendLocale" class="modern-select">
        <option value="follow">Follow Browser</option>
        <option value="zh-CN">中文 (简体)</option>
        <option value="en">English</option>
      </select>
    </div>

    <div class="form-row">
      <label>Backend default language</label>
      <select v-model="backendLocale" class="modern-select">
        <option value="follow">Follow Browser</option>
        <option value="zh-CN">中文 (简体)</option>
        <option value="en">English</option>
      </select>
    </div>

    <div class="form-row">
      <label>Frontend font</label>
      <select v-model="frontendFont" class="modern-select">
        <option value="sans">Sans-serif</option>
        <option value="serif">Serif</option>
      </select>
    </div>

    <div class="form-row">
      <label>Backend font</label>
      <select v-model="backendFont" class="modern-select">
        <option value="sans">Sans-serif</option>
        <option value="serif">Serif</option>
      </select>
    </div>

    <div class="actions">
      <button @click="save" class="primary">Save Settings</button>
      <button class="secondary" @click="reset">Reset</button>
    </div>
    <!-- Toast is handled by useToast composable, no need for extra markup here -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useToast from '../../composables/useToast'

const { locale } = useI18n()
const key = 'chronicle.settings'
const frontendLocale = ref('follow')
const backendLocale = ref('follow')
const frontendFont = ref('sans')
const backendFont = ref('sans')

const { show } = useToast()

onMounted(() => {
  const raw = localStorage.getItem(key)
  if (raw) {
    try {
      const cfg = JSON.parse(raw)
      frontendLocale.value = cfg.frontendLocale || 'follow'
      backendLocale.value = cfg.backendLocale || 'follow'
      frontendFont.value = cfg.frontendFont || 'sans'
      backendFont.value = cfg.backendFont || 'sans'
    } catch(e) {}
  }
  // try to load server-side persisted settings (merge)
  try {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((s: { backendLocale?: string; frontendLocale?: string; frontendFont?: string; backendFont?: string }) => {
        if (!s) return
        if (s.backendLocale) backendLocale.value = s.backendLocale
        if (s.frontendLocale) frontendLocale.value = s.frontendLocale
        if (s.frontendFont) frontendFont.value = s.frontendFont
        if (s.backendFont) backendFont.value = s.backendFont
      })
      .catch(() => {})
  } catch(e) {}
})

async function save() {
  const cfg = {
    frontendLocale: frontendLocale.value,
    backendLocale: backendLocale.value,
    frontendFont: frontendFont.value,
    backendFont: backendFont.value
  }
  // persist locally
  localStorage.setItem(key, JSON.stringify(cfg))

  // persist to backend
  try {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
  } catch(e) {}

  // Apply frontend font immediately after Save
  try {
    if (frontendFont.value === 'sans') {
      document.documentElement.style.setProperty('--app-font-stack', 'var(--app-font-stack-inter)')
    } else if (frontendFont.value === 'serif') {
      document.documentElement.style.setProperty('--app-font-stack', "'Noto Serif SC', serif")
    }
    // Also persist backend font into CSS var so backend UI (editor) can reflect immediately
    if (backendFont.value === 'sans') {
      document.documentElement.style.setProperty('--backend-font-stack', 'var(--app-font-stack-inter)')
    } else if (backendFont.value === 'serif') {
      document.documentElement.style.setProperty('--backend-font-stack', "'Noto Serif SC', serif")
    }
  } catch(e) {}

  // Apply language settings immediately for current session (Settings is backend):
  try {
    if (backendLocale.value && backendLocale.value !== 'follow') {
      locale.value = backendLocale.value as any
    } else {
      // Backend is follow: use browser default
      const nav = navigator.language || 'en'
      locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
    }
    // ensure frontend clients pick up the frontend locale choice on reload/first visit
    // Do NOT forcefully overwrite localStorage for existing clients who might have a preference.
    // The frontend logic in App.vue should respect this setting for new/default visitors.
  } catch(e) {}

  try { show('Saved') } catch(e) {}
}

function reset() {
  localStorage.removeItem(key)
  frontendLocale.value = 'follow'
  backendLocale.value = 'follow'
  frontendFont.value = 'sans'
  backendFont.value = 'sans'
}

// Optional: watch frontendLocale and apply as default for i18n on frontend
// NOTE: frontend locale will be applied only when the user clicks Save.
// Do not apply or reload on select change to avoid surprising behavior for current sessions.

// NOTE: backend locale will be persisted on Save; do not apply immediately on change.
</script>

<style scoped>
.settings-card { background:var(--bg-secondary); padding:1rem; border-radius:8px }
.form-row { margin-bottom:0.8rem; display:flex; flex-direction:column }
.actions { margin-top:0.8rem; display:flex; gap:0.5rem }
/* simple toast for save feedback */
.save-toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  background: var(--accent, #2b90ff);
  color: var(--text-on-accent, #fff);
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(11,22,40,0.24);
  z-index: 9999;
  font-weight: 600;
  transition: opacity 200ms ease, transform 200ms ease;
}

.save-toast[aria-hidden="true"] { opacity: 0; transform: translateY(8px); }

</style>
