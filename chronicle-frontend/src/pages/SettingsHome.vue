<template>
  <div class="settings-card">
    <h2>{{ $t('settings.home') }}</h2>
    <p class="hint">{{ $t('settings.homeHint') }}</p>

    <div class="editor-area">
      <textarea v-model="html" rows="12" style="font-family: monospace;"></textarea>
    </div>

    <div class="actions">
      <button class="primary" @click="save">{{ $t('editor.saveDraft') }}</button>
      <button class="secondary" @click="previewToggle">{{ preview ? 'Hide' : 'Preview' }}</button>
    </div>

    <div v-if="preview" class="preview" v-html="html"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
const key = 'chronicle.settings.homeHtml'
const html = ref('')
const preview = ref(false)

onMounted(() => {
  const v = localStorage.getItem(key)
  if (v) html.value = v
})

function save() {
  localStorage.setItem(key, html.value)
  alert('Saved')
}

function previewToggle() { preview.value = !preview.value }
</script>

<style scoped>
.settings-card { background:var(--bg-secondary); padding:1rem; border-radius:8px }
.editor-area textarea { width:100%; font-family:var(--app-font-stack); }
.actions { margin-top:0.5rem; display:flex; gap:0.5rem }
.preview { margin-top:1rem; padding:1rem; background:var(--bg-primary); border-radius:6px }
</style>
