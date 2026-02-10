<template>
  <div class="text-editor-page">
    <BlogEditor class="full-height-editor" />
  </div>
</template>

<script setup lang="ts">
import BlogEditor from '../components/BlogEditor.vue'
</script>

<style scoped>
.text-editor-page {
  /* padding-top: 70px; Removed for standalone mode */ 
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
</style>
