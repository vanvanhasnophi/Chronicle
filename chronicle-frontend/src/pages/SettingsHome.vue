<template>
  <div class="settings-page">
    <h2 style="margin-bottom: 0;">{{ $t('settings.home') }}</h2>
    <p class="hint">{{ $t('settings.homeHint') }}</p>

    <section class="card">
      <div class="editor-area">
        <textarea v-model="html" rows="12" style="font-family: monospace;"></textarea>
      </div>
    </section>

    <div class="actions">
      <button class="primary" @click="saveAll">{{ $t('settings.save') }}</button>
      <button class="secondary" @click="resetAll">{{ $t('settings.reset') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
const key = 'chronicle.settings.homeHtml'
const html = ref('')

onMounted(() => {
  const v = localStorage.getItem(key)
  if (v) html.value = v
})

function save() {
  localStorage.setItem(key, html.value)
}

function saveAll() {
  save()
  alert('Saved')
}

function resetAll() { if (window.confirm('Are you sure you want to reset the current settings?')) { localStorage.removeItem(key); html.value = '' } }
</script>

<style scoped>
.settings-card { background:var(--bg-secondary); padding:1rem; border-radius:8px }
.editor-area textarea { width:100%; font-family:var(--app-font-stack); }
.actions { margin-top:0.5rem; display:flex; gap:0.5rem }
</style>
