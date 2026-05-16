<template>
  <div class="settings-page">
    <h2 style="margin-bottom: 0;">{{ $t('settings.friends') }}</h2>
    <p class="hint">{{ $t('settings.friendsHint') }}</p>


    <label class="feature-row" style="padding: 1rem;">
      <span class="feature-copy">
        <strong>{{ $t('settings.featureToggle') }}</strong>
        <small>{{ $t('settings.featureFriendsPageHint') }}</small>
      </span>
      <input type="checkbox" v-model="enabled" />
    </label>

    <section class="card">
      <div class="editor-area">
        <textarea v-model="html" rows="12" style="font-family: monospace;"></textarea>
      </div>
    </section>

    <div class="actions">
      <button class="primary" :disabled="saving" @click="saveAll">{{ $t('settings.save') }}</button>
      <button class="secondary" :disabled="saving" @click="resetAll">{{ $t('settings.reset') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { useI18n } from 'vue-i18n'
import useToast from '../composables/useToast'

const { t } = useI18n()
const { show } = useToast()

const key = 'chronicle.settings.friendsHtml'
const html = ref('')
const enabled = ref(true)
const saving = ref(false)
const defaultEnabled = true

onMounted(async () => {
  const v = localStorage.getItem(key)
  if (v) html.value = v
  // load existing flag from backend
  try {
    const r = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
    if (r.ok) {
      const settings = await r.json()
      enabled.value = settings?.featureFlags?.friendsPage !== false
    }
  } catch (e) {
    // ignore
  }
})

async function saveFlag() {
  saving.value = true
  try {
    // fetch existing settings to avoid clobbering other flags
    const r = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
    const current = r.ok ? await r.json() : {}
    const existingFlags = current.featureFlags || {}
    const merged = Object.assign({}, existingFlags, { friendsPage: !!enabled.value })
    const resp = await fetchWithAuth(`/api/settings?t=${Date.now()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featureFlags: merged })
    })
    return resp.ok
  } catch (e) {
    return false
  } finally { saving.value = false }
}

async function saveAll() {
  saving.value = true
  try {
    const okFlag = await saveFlag()
    localStorage.setItem(key, html.value)
    if (okFlag) show(t('settings.saveSuccess') as string, { status: 'success' })
    else show(t('settings.save') as string, { status: 'success' })
  } catch (e) { show(t('settings.saveFailed') as string, { status: 'error' }) } finally { saving.value = false }
}

async function resetAll() {
  if (!window.confirm(t('settings.resetConfirm') as string)) return
  enabled.value = defaultEnabled
  localStorage.removeItem(key)
  html.value = ''
  await saveFlag()
}
</script>

<style scoped>

.card {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: var(--component-bg-blur);
  border: 1px solid var(--border-color);
}

.editor-area textarea {
  width: 100%;
  font-family: var(--app-font-stack);
}

.actions {
  display: flex;
  gap: 0.5rem
}
</style>
