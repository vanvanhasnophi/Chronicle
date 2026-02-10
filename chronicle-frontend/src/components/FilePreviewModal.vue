<template>
  <div v-if="state.visible" class="file-preview-overlay" @click.self="closePreview">
    <div class="file-preview-container">
      <div class="file-preview-header">
        <span class="file-preview-title">{{ state.file?.name }}</span>
        <div class="header-actions">
            <a :href="state.file?.path" download target="_blank" class="file-action-btn primary">Download</a>
            <button class="file-action-btn close" @click="closePreview">Close</button>
        </div>
      </div>
      
      <div class="file-preview-body">
         <div v-if="loading" class="loading-state">Loading...</div>
         
         <template v-else>
             <!-- Text/Code -->
             <div v-if="state.file?.type === 'Code/Text'" class="text-wrapper">
                 <div class="encoding-bar">
                     <select v-model="encoding" class="encoding-select">
                        <option value="utf-8">UTF-8</option>
                        <option value="gbk">GBK</option>
                        <option value="iso-8859-1">ISO-8859-1</option>
                        <option value="windows-1252">Windows-1252</option>
                     </select>
                 </div>
                 <div class="text-scroll-container">
                    <pre class="file-text-content">{{ textContent }}</pre>
                 </div>
             </div>
             
             <!-- PDF Document -->
             <div v-else-if="state.file?.type === 'Document' && state.file?.name.endsWith('.pdf')" class="file-media-content pdf-content">
                 <iframe :src="state.file.path" width="100%" height="100%" frameborder="0"></iframe>
             </div>

             <!-- Audio -->
             <div v-else-if="state.file?.type === 'Audio'" class="file-media-content">
                 <audio controls :src="state.file.path" autoplay></audio>
             </div>

             <!-- Video -->
             <div v-else-if="state.file?.type === 'Video'" class="file-media-content">
                 <video controls :src="state.file.path" autoplay></video>
             </div>

             <!-- Others -->
             <div v-else class="file-generic-content">
                 <div class="file-generic-icon" v-html="Icons.generic"></div>
                 <div class="file-generic-text">
                    Preview not available for {{ state.file?.type }}
                 </div>
                 <a :href="state.file?.path" target="_blank" class="file-primary-action">Open in Browser</a>
             </div>
         </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePreview } from '../composables/usePreview'
import { Icons } from '../utils/icons'

const { state, closePreview } = usePreview()
const textContent = ref('')
const loading = ref(false)
const encoding = ref('utf-8')

// Reload when file or encoding changes
watch([() => state.file, encoding], async ([newFile, newEncoding]) => {
    if (!newFile || !state.visible) return
    
    // Only reload text content if needed
    if (newFile.type === 'Code/Text' || newFile.name.match(/\.(txt|md|json|js|ts|css|html|xml|log|csv|py|java|c|cpp|h|sh|bat)$/i)) {
       loading.value = true
       try {
         const res = await fetch(newFile.path)
         if(res.ok) {
             const buffer = await res.arrayBuffer()
             const decoder = new TextDecoder(newEncoding as string)
             textContent.value = decoder.decode(buffer)
         }
         else textContent.value = 'Failed to load content'
       } catch (e) { 
           textContent.value = 'Error loading content'
       } finally {
           loading.value = false
       }
    } else {
        textContent.value = ''
    }
}, { immediate: true })

// Reset encoding on new file
watch(() => state.file, () => {
    encoding.value = 'utf-8'
})
</script>

<style scoped>
/* Scoped styles mainly here */
/* .text-wrapper, .encoding-bar, .encoding-select defined in previous replacement block?
   Wait, the tool replacement was lower down. I need to make sure I didn't leave duplicates. */


.file-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  z-index: 20000; /* Higher than image preview if needed */
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  animation: fadeIn 0.2s forwards;
}

@keyframes fadeIn {
  to { opacity: 1; }
}

.file-preview-container {
  background: #1e1e1e;
  width: 80%;
  max-width: 900px;
  height: 80%;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  border: 1px solid #333;
}

.file-preview-header {
  height: 50px;
  background: #252525;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.file-preview-title {
  color: #eee;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 20px;
}

.header-actions {
    display: flex;
    gap: 10px;
}

.file-action-btn {
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    text-decoration: none;
    transition: all 0.2s;
}

.file-action-btn.primary {
    background: #2ea35f;
    color: #fff;
}
.file-action-btn.primary:hover {
    background: #24804a;
}

.file-action-btn.close {
    background: #333;
    color: #ccc;
}
.file-action-btn.close:hover {
    background: #444;
    color: #fff;
}

.file-preview-body {
  flex: 1;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #1e1e1e;
}

.loading-state {
    color: #888;
    align-self: center;
    margin-top: 20px;
}

.text-wrapper {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

.text-scroll-container {
    flex: 1;
    width: 100%;
    overflow: auto;
    position: relative;
    display: flex; /* To ensure child min-height works */
    flex-direction: column;
}

.encoding-bar {
    padding: 8px 20px;
    background: #252526;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-shrink: 0;
}

.encoding-select {
    background: #333;
    color: #eee;
    border: 1px solid #444;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
}

.file-text-content {
  width: fit-content;
  min-width: 100%;
  margin: 0;
  padding: 20px;
  white-space: pre;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  color: #e0e0e0;
  line-height: 1.6;
  overflow: visible;
  background: transparent;
  border: none;
  box-sizing: border-box;
}

.file-media-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 20px;
  background: #000;
}

.file-media-content.pdf-content {
    padding: 0;
}

.file-generic-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #aaa;
  height: 100%;
}

.file-generic-icon {
  width: 64px;
  height: 64px;
  color: #555;
  display: flex;
  justify-content: center;
  align-items: center;
}
.file-generic-icon :deep(svg) {
    width: 100%;
    height: 100%;
    stroke-width: 1;
}

.file-primary-action {
  color: #2ea35f;
  border: 1px solid #2ea35f;
  padding: 8px 24px;
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.2s;
}
.file-primary-action:hover {
  background: rgba(46, 163, 95, 0.1);
}
</style>