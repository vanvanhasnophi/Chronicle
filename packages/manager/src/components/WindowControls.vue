<template>
  <div v-if="isVisible" class="win-controls" :class="{ 'is-maximized': isMaximized }">
    <button
      class="win-btn win-btn-min"
      @click="minimize"
      :title="$t('win.minimize') || 'Minimize'"
      aria-label="Minimize"
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
      </svg>
    </button>
    <button
      class="win-btn win-btn-max"
      @click="maximize"
      :title="isMaximized ? ($t('win.restore') || 'Restore') : ($t('win.maximize') || 'Maximize')"
      aria-label="Maximize"
    >
      <!-- Restore icon (overlapping squares) -->
      <svg v-if="isMaximized" width="12" height="12" viewBox="0 0 12 12">
        <rect x="3" y="0.5" width="7.5" height="7.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
        <rect x="0.5" y="3" width="7.5" height="7.5" rx="1" fill="currentColor" stroke="currentColor" stroke-width="1.2" opacity="0.15" />
      </svg>
      <!-- Maximize icon (single square) -->
      <svg v-else width="12" height="12" viewBox="0 0 12 12">
        <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
    <button
      class="win-btn win-btn-close"
      @click="closeWindow"
      :title="$t('win.close') || 'Close'"
      aria-label="Close"
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const api = (window as any).chronicleElectron
const isElectron = !!api?.isElectron
// macOS keeps native traffic lights with titleBarStyle:'hidden' — only show custom controls on Windows/Linux
const isVisible = isElectron && api?.platform !== 'darwin'
const isMaximized = ref(false)

onMounted(async () => {
  if (!isElectron) return
  try {
    isMaximized.value = await api.windowIsMaximized()
  } catch { /* ignore */ }
  if (api.onMaximizeChange) {
    api.onMaximizeChange((v: boolean) => {
      isMaximized.value = v
    })
  }
})

function minimize() {
  api?.windowMinimize?.()
}

function maximize() {
  api?.windowMaximize?.()
}

function closeWindow() {
  api?.windowClose?.()
}
</script>

<style scoped>
.win-controls {
  display: flex;
  align-items: center;
  gap: 0;
  height: 32px;
  -webkit-app-region: no-drag;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0.45;
  transition: opacity 0.25s ease;
}

.win-controls:hover {
  opacity: 1;
}

.win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 0;
  padding: 0;
  transition: background 0.15s ease, color 0.15s ease;
}

.win-btn:hover {
  background: var(--component-bg-hover);
  color: var(--text-primary);
}

.win-btn-close:hover {
  background: #e81123;
  color: #fff;
}

.win-btn:active {
  background: var(--component-bg-active);
}

.win-btn-close:active {
  background: #bf0f1d;
}
</style>
