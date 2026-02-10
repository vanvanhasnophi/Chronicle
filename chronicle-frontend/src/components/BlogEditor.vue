<template>
  <div class="blog-editor" :class="[`layout-${layout}`, { 'is-mobile': isMobile }]">
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <button 
          class="toolbar-btn text-btn"
          :class="{ active: previewReadOnly }"
          @click="previewReadOnly = !previewReadOnly"
          title="Toggle Read-Only Mode"
        >
          {{ previewReadOnly ? '🔒 Read Only' : '🔓 Editable' }}
        </button>
        <span class="divider"></span>
        <button 
          v-for="mode in displayModes" 
          :key="mode.value"
          class="toolbar-btn"
          :class="{ active: layout === mode.value }"
          @click="layout = mode.value"
          :title="mode.label"
        >
          {{ mode.icon }}
        </button>
      </div>
      <div class="toolbar-group">
        <span class="stat-item">Chars: {{ localValue.length }}</span>
      </div>
    </div>

    <div class="editor-workspace">
      <!-- Editor Pane -->
      <div v-show="showEditor" class="pane editor-pane">
        <textarea
          v-model="localValue"
          class="markdown-input"
          placeholder="Start writing markdown..."
          @scroll="syncScroll"
        ></textarea>
      </div>

      <!-- Preview Pane -->
      <div v-show="showPreview" class="pane preview-pane">
        <MdParser 
          v-model="localValue" 
          :readOnly="previewReadOnly" 
          class="preview-content"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MdParser from './MdParser.vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const localValue = ref(props.modelValue)
const previewReadOnly = ref(false)

watch(() => props.modelValue, (val) => {
  if (val !== localValue.value) localValue.value = val
})
watch(localValue, (val) => {
  emit('update:modelValue', val)
})

type LayoutMode = 'split' | 'edit' | 'preview'
const layout = ref<LayoutMode>('split')
const isMobile = ref(false) // placeholder for responsiveness

const displayModes: { label: string, value: LayoutMode, icon: string }[] = [
  { label: 'Split View', value: 'split', icon: '🌗' },
  { label: 'Editor Only', value: 'edit', icon: '✏️' },
  { label: 'Preview Only', value: 'preview', icon: '👁️' }
]

const showEditor = computed(() => layout.value === 'split' || layout.value === 'edit')
const showPreview = computed(() => layout.value === 'split' || layout.value === 'preview')

// Scroll sync placeholder
function syncScroll(e: Event) {
  // Implementation for scroll sync left as exercise or future improvement
}
</script>

<style scoped>
.blog-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #444;
  background: #1e1e1e;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  background: #252526;
  border-bottom: 1px solid #333;
}

.toolbar-group {
  display: flex;
  align-items: center;
}

.divider {
  width: 1px;
  height: 20px;
  background-color: #444;
  margin: 0 8px;
}

.toolbar-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #ccc;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 4px;
}
.toolbar-btn:hover {
  background: #333;
}
.toolbar-btn.active {
  background: #0e639c;
  color: white;
}

.editor-workspace {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.pane {
  flex: 1;
  overflow: auto;
  height: 100%;
}

.editor-pane {
  border-right: 1px solid #333;
  overflow: hidden;
}

.markdown-input {
  display: block;
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  color: #d4d4d4;
  border: none;
  padding: 16px;
  font-family: 'Consolas', monospace;
  font-size: 14px;
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.preview-pane {
  background: #1e1e1e;
  padding: 16px;
  box-sizing: border-box;
}

/* Layout modifiers */
.layout-split .pane {
  width: 50%;
}
.layout-edit .preview-pane { display: none; }
.layout-preview .editor-pane { display: none; }
.layout-preview .pane { width: 100%; }

</style>
