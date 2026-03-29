<template>
  <div class="text-editor-page">
    <Suspense>
      <template #default>
        <AsyncEditor class="full-height-editor" />
      </template>
      <template #fallback>
        <div class="editor-skeleton">
          <div class="skeleton-box">正在挂载编辑器...</div>
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const AsyncEditor = defineAsyncComponent(() => import('../components/BlogEditor.vue'))
</script>

<style scoped>
.text-editor-page {
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}
.full-height-editor {
  flex: 1;
  overflow: hidden;
}
.editor-skeleton {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(100vh - 0px);
}
.skeleton-box {
  background: var(--component-bg-hover);
  color: var(--component-text-primary);
  padding: 18px 24px;
  border-radius: 8px;
  box-shadow: var(--shadow-elev-3);
  font-size: 16px;
}
</style>
