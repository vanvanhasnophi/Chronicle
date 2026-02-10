<template>
  <div class="md-parser-rendered" @click="handleGlobalClick">
    <template v-for="(block, index) in localBlocks" :key="keyPrefix + index">
      <div v-if="block.type === 'table'" class="content-block">
        <MarkdownTable
          :header="block.header || []"
          :body="block.body || []"
          :readOnly="readOnly"
          @change="(h, b) => updateTable(index, h, b)"
        />
      </div>
      <div v-else-if="block.type === 'code'" class="content-block">
        <CodeChunk
          v-model="block.content"
          :language="block.language || 'plain'"
          :readonly="readOnly"
          :title="readOnly ? '' : `代码块 ${index + 1}`"
          @change="(code, lang) => updateCode(index, code, lang)"
        />
      </div>
      <div v-else-if="block.type === 'quote'" class="content-block text-block" v-html="renderBlockHtml(block)"></div>
      <div v-else class="content-block text-block">
        <div class="parsed-html-content" v-html="renderBlockHtml(block)"></div>
      </div>
    </template>

    <!-- Math Interaction Popup -->
    <div v-if="tooltip.visible" 
         class="math-tooltip" 
         :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
         @click.stop
    >
      <div class="math-tooltip-content">
        <div class="math-tooltip-tex">{{ tooltip.tex }}</div>
        <div class="math-tooltip-actions">
           <button class="icon-btn square-btn" @click="copyTex" :title="tooltip.copied ? 'Copied' : 'Copy'">
             <svg v-if="!tooltip.copied" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
             <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
           </button>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal moved to global App.vue -->
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { parseMarkdown, convertToHtml, blocksToMarkdown, type ContentBlock } from '../utils/markdownParser'
import { usePreview } from '../composables/usePreview'
import { useImagePreview } from '../composables/useImagePreview'
import MarkdownTable from './MarkdownTable.vue'
import CodeChunk from './CodeChunk.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  readOnly?: boolean
  assetMap?: Record<string, string>
}>(), {
  modelValue: '',
  readOnly: false,
  assetMap: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const localBlocks = ref<ContentBlock[]>([])
const keyPrefix = ref('block-')
const { openPreview } = usePreview()
const { openImagePreview } = useImagePreview()

// Latex Tooltip Logic
const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  tex: '',
  copied: false,
  timer: null as any
})

// Removed local preview states as we now use global composables

function handleImgWheel(e: WheelEvent) {
  // Logic moved to useImagePreview
}

function handleImgMouseDown(e: MouseEvent) {
  // Logic moved to useImagePreview
}

function handleImgMouseMove(e: MouseEvent) { 
  // Logic moved to useImagePreview
}

function handleImgMouseUp() {
  // Logic moved to useImagePreview
}

function renderBlockHtml(block: ContentBlock): string {
  let html = convertToHtml(block)
  
  // Replace images
  // Matches any src that is NOT http/https
  // We use a regex that captures the src content
  if (props.assetMap && Object.keys(props.assetMap).length > 0) {
      html = html.replace(/src=["']([^"']+)["']/g, (match, src) => {
          // If online url, skip
          if (/^https?:\/\//i.test(src)) {
              return match
          }
          // If we have a local mapping (from upload), use it
          if (props.assetMap![src]) {
              return `src="${props.assetMap![src]}"`
          }
          // Otherwise keep as is (might be absolute server path)
          return match
      })
  }

  return html
}

async function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  const mathWrapper = target.closest('.katex-interactive') as HTMLElement
  if (mathWrapper) {
    e.stopPropagation()
    const tex = mathWrapper.getAttribute('data-tex')
    if (tex) {
      showTooltip(e, tex, mathWrapper)
      return
    }
  }

  // File Card Click
  const cardEl = target.closest('.file-card') as HTMLElement
  if (cardEl) {
      e.stopPropagation()
      const url = cardEl.getAttribute('data-url') || ''
      const name = cardEl.getAttribute('data-name') || 'File'
      const type = cardEl.getAttribute('data-type') || ''
      openPreview({
        name,
        path: url,
        type
      })
      return
  }

  // Image Click Handling
  if (target.tagName === 'IMG' && target.classList.contains('md-image')) {
    const wrapper = target.closest('.md-image-wrapper')
    // Allow clicking even if not fully "loaded" class if src exists
    if (wrapper || target) {
      e.stopPropagation()
      const src = (target as HTMLImageElement).src
      openImagePreview(src)
      return
    }
  }

  // Click elsewhere closes tooltip
  if (tooltip.visible) {
    tooltip.visible = false
  }
}


function showTooltip(e: MouseEvent, tex: string, targetEl: HTMLElement) {
    tooltip.tex = tex
    tooltip.copied = false
    tooltip.visible = true
    
    // Position near the mouse click but keep inside viewport
    nextTick(() => {
        const el = document.querySelector('.math-tooltip') as HTMLElement
        if (!el) return
        
        const rect = el.getBoundingClientRect()
        let x = e.clientX
        let y = e.clientY + 20 // Default below cursor

        // Horizontal overflow adjustment
        if (x + rect.width > window.innerWidth - 20) {
             x = window.innerWidth - rect.width - 20
        }
        if (x < 20) x = 20

        // Vertical overflow adjustment
        // If it overflows bottom, try placing above
        if (y + rect.height > window.innerHeight - 20) {
             y = e.clientY - rect.height - 20
        }
        // If still fits top (or overflows top), clamp to view
        if (y < 20) y = 20
        
        // Final vertical safety check: if y + height > window, just stick to bottom
        if (y + rect.height > window.innerHeight - 20) {
             y = window.innerHeight - rect.height - 20
        }

        tooltip.x = x
        tooltip.y = y
    })
}

function copyTex() {
  navigator.clipboard.writeText(tooltip.tex).then(() => {
    tooltip.copied = true
    if (tooltip.timer) clearTimeout(tooltip.timer)
    tooltip.timer = setTimeout(() => {
      tooltip.copied = false
    }, 2000)
  })
}

// Global click listener to close tooltip if clicked outside (already partially handled by handleGlobalClick but for safety)
function closeTooltipOutside(e: MouseEvent) {
    if (tooltip.visible) {
       const target = e.target as HTMLElement;
       if (!target.closest('.math-tooltip') && !target.closest('.katex-interactive')) {
           tooltip.visible = false;
       }
    }
}

// Handling Image Events (Capture phase)
function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img && img.classList.contains('md-image')) {
    const wrapper = img.closest('.md-image-wrapper')
    if (wrapper) {
      wrapper.classList.remove('loading')
      wrapper.classList.add('error')
      const text = wrapper.querySelector('.md-placeholder-text')
      if (text) text.textContent = '解析失败'
    }
  }
}

function handleImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (img && img.classList.contains('md-image')) {
    const wrapper = img.closest('.md-image-wrapper')
    if (wrapper) {
      wrapper.classList.remove('loading')
      wrapper.classList.add('loaded')
    }
  }
}

onMounted(() => {
    document.addEventListener('click', closeTooltipOutside)
    const container = document.querySelector('.md-parser-rendered')
    if (container) {
       container.addEventListener('error', handleImageError, true)
       container.addEventListener('load', handleImageLoad, true)
    }
})
onUnmounted(() => {
    document.removeEventListener('click', closeTooltipOutside)
    const container = document.querySelector('.md-parser-rendered')
    if (container) {
       container.removeEventListener('error', handleImageError, true)
       container.removeEventListener('load', handleImageLoad, true)
    }
})

watch(() => props.modelValue, (newVal) => {
  // ... existing watch logic
  if (newVal === blocksToMarkdown(toRaw(localBlocks.value))) {
    return
  }
  localBlocks.value = parseMarkdown(newVal || '')
}, { immediate: true })
// ... rest of script to follow

function updateTable(index: number, header: string[], body: string[][]) {
  if (props.readOnly) return
  const block = localBlocks.value[index]
  if (block && block.type === 'table') {
    block.header = header
    block.body = body
    sync()
  }
}

function updateCode(index: number, code: string, lang: string) {
  if (props.readOnly) return
  const block = localBlocks.value[index]
  if (block && block.type === 'code') {
    block.content = code
    block.language = lang
    sync()
  }
}

function sync() {
  const md = blocksToMarkdown(toRaw(localBlocks.value))
  emit('update:modelValue', md)
}

defineExpose({
  getMarkdown: () => blocksToMarkdown(toRaw(localBlocks.value))
})
</script>

<style>
.katex-interactive, .katex-interactive-block {
  cursor: pointer;
  transition: background-color 0.2s;
  border-radius: 4px;
}
.katex-interactive:hover, .katex-interactive-block:hover {
  background-color: rgba(255, 255, 255, 0.15); /* Lightening effect */
}

.math-tooltip {
  position: fixed;
  z-index: 9999;
  background-color: #1e1e1e; /* Match body bg */
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  padding: 8px;
  min-width: 200px;
  max-width: 400px;
  color: #eee;
  font-size: 14px;
}
.math-tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.math-tooltip-tex {
  font-family: monospace;
  background-color: #2a2a2a;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: #ccc;
  border: 1px solid #333;
}
.math-tooltip-actions {
  display: flex;
  justify-content: flex-end;
}
.math-tooltip-actions .icon-btn {
  background: #333;
  border: 1px solid #444;
  color: #eee;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
}
.math-tooltip-actions .square-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px; /* Square with slight radius */
}
.math-tooltip-actions .icon-btn:hover {
  background-color: #444;
  border-color: #2ea35f;
  color: #fff;
}
</style>

<style>
.md-parser-rendered {
  width: 100%;
}
.content-block {
  margin: 1em 0;
}
.md-quote-block {
  background: #8585851d;
  border-left: 4px solid #2ea35f;
  padding: 0.5em 1em;
  margin: 0.5em 0;
  border-radius: 4px;
  line-height: 1.6;
}
.md-quote-block br {
  line-height: 1.2;
  display: block;
  margin: 0.2em 0 0.2em 0;
}
.md-quote-block .quote-hard-break {
  display: block;
  height: 1.6em;
  content: '';
}
.md-quote-block .backslash {
  font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
  color: #b8b8b8;
  padding: 0 0.1em;
}

code {
  background: rgba(255, 0, 0, 0.12);
  color: #ff8585;
  border-radius: 5px;
  padding: 0.2em 0.5em;
  font-size: 0.85em;
  font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
  font-weight: 500;
  vertical-align: middle;
}

.text-block p {
  margin: 0.8em 0;
  line-height: 1.6;
}

/* 修复强调标签样式 */
i, em {
  font-style: italic;
}
strong, b {
  font-weight: bold;
}

/* Image Centering & Wrapper */
.md-image-container {
  display: block;
  margin: 1em auto;
  width: fit-content; /* Ensure caption stays with image width or minimal needed */
  text-align: center;
  max-width: 100%;
}

.md-image-wrapper {
  display: block;
  margin: 0 auto; /* Center inside container */
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  max-width: 100%;
  width: fit-content;
}

/* Loading / Error / Placeholder States (Dark box) */
.md-image-wrapper.loading,
.md-image-wrapper.error,
.md-image-wrapper.placeholder {
  background-color: #2b2b2b;
  min-width: 200px;
  min-height: 120px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  box-sizing: border-box;
}

/* Ensure consistent font for placeholder text */
.md-placeholder-text {
  font-family: var(--app-font-stack);
  font-size: 14px;
  color: #ccc;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
}

/* Error State Specifics */
.md-image-wrapper.error .md-placeholder-text {
  color: #ff4d4f; /* Red text for error */
}

/* Hide the actual image element in non-loaded states */
.md-image-wrapper.loading .md-image,
.md-image-wrapper.error .md-image,
.md-image-wrapper.placeholder .md-image {
  display: none !important;
}

/* Loaded State */
.md-image-wrapper.loaded {
  background-color: transparent;
}

.md-image-wrapper.loaded .md-placeholder-text {
  display: none;
}

.md-image-caption {
  display: block;
  margin-top: 8px;
  font-size: 0.9em;
  color: #999;
  text-align: center;
  font-family: var(--app-font-stack);
  width: 100%; /* Ensure it spans the container's width */
}

.md-image {
  max-width: 100%;
  max-height: 500px; /* Max height in document flow */
  height: auto;
  border-radius: 8px;
  display: block;
  cursor: zoom-in;
  object-fit: contain; /* Ensure it doesn't stretch */
}

.md-link {
  color: #2ea35f;
  text-decoration: underline;
  text-underline-offset: 4px;
  transition: color 0.2s;
}

.md-link:hover {
  color: #24804a;
}

/* Image Preview Modal */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  z-index: 10000;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  animation: fadeIn 0.2s ease;
}

.preview-close-btn {
  position: absolute;
  top: 30px;
  right: 30px;
  background: rgba(0, 0, 0, 0.5); /* #2b2b2b ish but semi-transparent */
  border: none;
  color: #fff;
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10001;
  transition: background 0.2s, transform 0.1s;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.preview-close-btn:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}
.preview-close-btn svg {
  width: 24px;
  height: 24px;
}
.preview-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.image-preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-content {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  cursor: grab;
  transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  will-change: transform;
}
.image-preview-content.is-dragging {
  transition: none !important;
}
.image-preview-content:active {
  cursor: grabbing;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* File Card Styles */
.file-card {
  display: inline-flex;
  align-items: center;
  background-color: #2b2b2b;
  border: 1px solid #3d3d3d;
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  max-width: 100%;
}

.file-card:hover {
  background-color: #383838;
  border-color: #2ea35f;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.file-card-icon {
  width: 24px;
  height: 24px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
}
.file-card:hover .file-card-icon {
    color: #2ea35f;
}

.file-card-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-name {
  font-size: 14px;
  color: #eee;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-type {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}
</style>
