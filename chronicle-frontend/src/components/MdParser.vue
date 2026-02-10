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
      <div v-else-if="block.type === 'quote'" class="content-block text-block" v-html="convertToHtml(block)"></div>
      <div v-else class="content-block text-block">
        <div class="parsed-html-content" v-html="convertToHtml(block)"></div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { parseMarkdown, convertToHtml, blocksToMarkdown, type ContentBlock } from '../utils/markdownParser'
import MarkdownTable from './MarkdownTable.vue'
import CodeChunk from './CodeChunk.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  readOnly?: boolean
}>(), {
  modelValue: '',
  readOnly: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const localBlocks = ref<ContentBlock[]>([])
const keyPrefix = ref('block-')

// Latex Tooltip Logic
const tooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  tex: '',
  copied: false,
  timer: null as any
})

function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const wrapper = target.closest('.katex-interactive') as HTMLElement
  
  if (wrapper) {
    e.stopPropagation()
    const tex = wrapper.getAttribute('data-tex')
    if (tex) {
      showTooltip(e, tex, wrapper)
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
onMounted(() => {
    document.addEventListener('click', closeTooltipOutside)
})
onUnmounted(() => {
    document.removeEventListener('click', closeTooltipOutside)
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
  color: #d23330d6;
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
</style>
