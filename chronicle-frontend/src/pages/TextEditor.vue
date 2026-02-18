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
  background: #1e1e1e;
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
  background: rgba(255,255,255,0.03);
  color: #ddd;
  padding: 18px 24px;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.6);
  font-size: 16px;
}
</style>
