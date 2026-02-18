<template>
  <div class="md-parser-rendered" @click="handleGlobalClick">
    <!-- Inline TOC removed; handled at page level (BlogPost.vue) -->
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
          :title="readOnly ? '' : ''/*`Code Block ${index + 1}`*/"
          @change="(code, lang) => updateCode(index, code, lang)"
        />
      </div>
      <div v-else-if="block.type === 'quote'" class="content-block text-block" :data-block-index="index" v-html="renderBlockHtml(block)"></div>
      <div v-else class="content-block text-block" :data-block-index="index">
        <div class="parsed-html-content" v-html="renderBlockHtml(block)"></div>
      </div>
    </template>
    

    <!-- Math Interaction Popup moved to standalone component -->
    <MathTooltip />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, toRaw, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { parseMarkdown, convertToHtml, blocksToMarkdown, type ContentBlock } from '../utils/markdownParser'
import { usePreview } from '../composables/usePreview'
import { useImagePreview } from '../composables/useImagePreview'
import MarkdownTable from './MarkdownTable.vue'
import CodeChunk from './CodeChunk.vue'
import AsyncHighlight from './AsyncHighlight.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  readOnly?: boolean
  assetMap?: Record<string, string>
  blocks?: ContentBlock[] | undefined
}>(), {
  modelValue: '',
  readOnly: false,
  assetMap: () => ({})
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'parsed-blocks', blocks: ContentBlock[]): void
  (e: 'rendered'): void
}>()

const localBlocks = ref<ContentBlock[]>([])
const keyPrefix = ref('block-')
const { openPreview } = usePreview()
const { openImagePreview } = useImagePreview()

import MathTooltip from './MathTooltip.vue'
import useMathTooltip from '../composables/useMathTooltip'

const mathTooltip = useMathTooltip()

// Lazy-load KaTeX on demand to avoid bundling it into the initial payload
let katex: any = null
let katexCssLoaded = false
async function ensureKatexLoaded() {
  if (!katex) {
    const mod = await import('katex')
    katex = (mod && (mod as any).default) || mod
  }
  if (!katexCssLoaded) {
    const cssUrl = (await import('katex/dist/katex.min.css?url')).default
    if (!document.getElementById('katex-css')) {
      const l = document.createElement('link')
      l.id = 'katex-css'
      l.rel = 'stylesheet'
      l.href = cssUrl
      document.head.appendChild(l)
    }
    katexCssLoaded = true
  }
}

// Cache rendered KaTeX HTML by unique-id so if placeholders are re-inserted
// (e.g. due to layout/resize or v-html rewrite) we can reuse rendered output
// and avoid calling katex.renderToString again.
const katexRenderCache = new Map<string, string>()

// Handler called by MathTooltip when user saves edits.
async function handleTooltipSave(newTex: string, uniqueId: string, blockIndex: number) {
  if (blockIndex === -1 || !localBlocks.value[blockIndex]) return
  try {
    await ensureKatexLoaded()
    if (newTex) katex.renderToString(newTex, { throwOnError: true, displayMode: true })
  } catch (e) {
    // validation should be handled in the tooltip component; block save if invalid
    return
  }

  const block = localBlocks.value[blockIndex]
  if (block.type === 'math') {
    block.content = newTex
    emit('update:modelValue', blocksToMarkdown(localBlocks.value))
    // Update cache for this unique id if provided
    if (uniqueId) {
      try {
        const html = katex.renderToString(newTex, { throwOnError: false, displayMode: true })
        katexRenderCache.set(uniqueId, html)
      } catch (e) {
        katexRenderCache.set(uniqueId, newTex)
      }
    }
    return
  }

  const text = block.content
  const matches: { start: number, end: number, content: string, full: string }[] = []
  let match: RegExpExecArray | null
  const regexBlock = /\\\[([\s\S]+?)\\\]/g
  while ((match = regexBlock.exec(text)) !== null) {
    matches.push({ start: match.index, end: regexBlock.lastIndex, content: match[1], full: match[0] })
  }
  const regexDisplay = /\$\$((?:[^\n]|\n)+?)\$\$/g
  while ((match = regexDisplay.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      matches.push({ start: match.index, end: regexDisplay.lastIndex, content: match[1], full: match[0] })
    }
  }
  const regexInlineParen = /\\\(([\s\S]+?)\\\)/g
  while ((match = regexInlineParen.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      matches.push({ start: match.index, end: regexInlineParen.lastIndex, content: match[1], full: match[0] })
    }
  }
  const regexInline = /\$((?:[^$\n]|)+?)\$/g
  while ((match = regexInline.exec(text)) !== null) {
    if (!matches.some(m => match!.index >= m.start && match!.index < m.end)) {
      if (match[1].trim()) {
        matches.push({ start: match.index, end: regexInline.lastIndex, content: match[1], full: match[0] })
      }
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const container = document.querySelector(`.content-block[data-block-index="${blockIndex}"]`)
  if (!container) return
  const placeholders = Array.from(container.querySelectorAll('.katex-interactive'))
  const targetIndex = placeholders.findIndex(el => el.getAttribute('data-unique-id') === uniqueId)

  if (targetIndex !== -1 && matches[targetIndex]) {
    const targetMatch = matches[targetIndex]
    const contentStartOffset = targetMatch.full.indexOf(targetMatch.content)
    if (contentStartOffset === -1) return
    const absStart = targetMatch.start + contentStartOffset
    const absEnd = absStart + targetMatch.content.length
    const newBlockContent = text.substring(0, absStart) + newTex + text.substring(absEnd)
    block.content = newBlockContent
    emit('update:modelValue', blocksToMarkdown(localBlocks.value))
    // Update cache for edited inline math
    if (uniqueId) {
      try {
        const html = katex.renderToString(newTex, { throwOnError: false, displayMode: false })
        katexRenderCache.set(uniqueId, html)
      } catch (e) {
        katexRenderCache.set(uniqueId, newTex)
      }
    }
  }
}


// Async math rendering state
let mathTimer: any = null
const MATH_BATCH = 12
function cancelRenderMath() {
  if (mathTimer) clearTimeout(mathTimer)
  mathTimer = null
}

async function processMathBatch() {
  const container = document.querySelector('.md-parser-rendered')
  if (!container) return
  const placeholders = Array.from(container.querySelectorAll('.katex-placeholder')) as HTMLElement[]
  // filter to those not yet marked rendered to avoid touching rendered DOM
  const pending = placeholders.filter(el => !el.classList.contains('katex-rendered')) as HTMLElement[]
  if (!pending.length) return
  const batch = pending.slice(0, MATH_BATCH)
  for (const el of batch) {
    const tex = el.getAttribute('data-tex') || ''
    const type = el.getAttribute('data-type') || 'inline'
    const uid = el.getAttribute('data-unique-id') || ''
    // If we have cached rendered HTML for this unique id, reuse it.
    if (uid && katexRenderCache.has(uid)) {
      const cached = katexRenderCache.get(uid) as string
      // If element already contains the same rendered HTML, avoid touching DOM to prevent reflow
      if (el.innerHTML && el.innerHTML.trim() === cached.trim()) {
        el.classList.add('katex-rendered')
        continue
      }
      el.innerHTML = cached
      el.classList.add('katex-rendered')
      continue
    }
    try {
      await ensureKatexLoaded()
      const html = katex.renderToString(tex, { displayMode: type === 'block', throwOnError: false })
      el.innerHTML = html
      el.classList.add('katex-rendered')
      console.log(`Rendered math: ${tex}`)
      if (uid) katexRenderCache.set(uid, html)
    } catch (e) {
      // fallback: show raw TeX
      el.textContent = tex
      el.classList.add('katex-rendered')
      if (uid) katexRenderCache.set(uid, tex)
    }
  }
  // schedule next batch if remaining
  const remaining = container.querySelectorAll('.katex-placeholder:not(.katex-rendered)').length
  if (remaining > 0) {
    mathTimer = setTimeout(() => { void processMathBatch() }, 40)
  } else {
    mathTimer = null
  }
}

function scheduleRenderMath() {
  cancelRenderMath()
  // let browser breathe a frame then start
  mathTimer = setTimeout(() => { void processMathBatch() }, 8)
}

// Inline TOC logic moved to page-level (BlogPost.vue)

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

  // Heading id injection is handled at page level (BlogPost.vue)
  
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
              return `src=\"${props.assetMap![src]}\"`
          }
          // Otherwise keep as is (might be absolute server path)
          return match
      })
  }
  // If we have cached KaTeX renderings for some unique ids, replace
  // the placeholder tags with the cached HTML so re-renders only affect
  // the specific formula that changed.
  html = html.replace(/<(span|div)\b([^>]*?)data-unique-id=["']([^"']+)["']([^>]*)>\s*<\/\1>/g, (match, tag, beforeAttrs, uid, afterAttrs) => {
    if (katexRenderCache.has(uid)) {
      return katexRenderCache.get(uid) as string
    }
    return match
  })
  return html
}


async function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  const mathWrapper = target.closest('.katex-interactive') as HTMLElement
  if (mathWrapper) {
    e.stopPropagation()
    const tex = mathWrapper.getAttribute('data-tex')
    const uniqueId = mathWrapper.getAttribute('data-unique-id') || ''
    const contentBlock = mathWrapper.closest('.content-block') as HTMLElement
    // blockIndex might be on the content-block or its parent depending on structure
    // We added :data-block-index="index" to .content-block
    const blockIndexStr = contentBlock?.getAttribute('data-block-index')
    const blockIndex = blockIndexStr ? parseInt(blockIndexStr, 10) : -1

    if (tex) {
      mathTooltip.show({ x: e.clientX, y: e.clientY, tex, uniqueId, blockIndex, isEditing: !props.readOnly, onSave: handleTooltipSave })
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
  mathTooltip.hide()
}


// Tooltip UI moved to MathTooltip component which handles its own outside-click listeners

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
  const container = document.querySelector('.md-parser-rendered')
  if (container) {
     container.addEventListener('error', handleImageError, true)
     container.addEventListener('load', handleImageLoad, true)
  }

  // If parent provided parsed blocks, use them instead of parsing modelValue
  if (props.blocks && Array.isArray(props.blocks) && props.blocks.length) {
    localBlocks.value = props.blocks as ContentBlock[]
    nextTick(() => {
      emit('rendered')
      scheduleRenderMath()
    })
  }
})
onUnmounted(() => {
    const container = document.querySelector('.md-parser-rendered')
    if (container) {
       container.removeEventListener('error', handleImageError, true)
       container.removeEventListener('load', handleImageLoad, true)
    }
  cancelRenderMath()
})

watch(() => props.modelValue, (newVal) => {
  // If parent provided blocks (even empty array), assume parent controls content
  if (props.blocks !== undefined) return

  if (newVal === blocksToMarkdown(toRaw(localBlocks.value))) {
    return
  }
  localBlocks.value = parseMarkdown(newVal || '')
  emit('parsed-blocks', toRaw(localBlocks.value))
  nextTick(() => {
    emit('rendered')
    scheduleRenderMath()
  })
}, { immediate: true })

// Watch for parent-updated blocks and adopt them
watch(() => props.blocks, (b) => {
  if (b && Array.isArray(b)) {
    localBlocks.value = b as ContentBlock[]
    nextTick(() => {
      emit('rendered')
      scheduleRenderMath()
    })
  }
})
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

function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const offset = 72
  const top = window.scrollY + rect.top - offset
  window.scrollTo({ top, behavior: 'smooth' })
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
  /* v-if handles visibility now, so we start visible */
  opacity: 1;
  transform: translateY(0);
  animation: tooltipFadeIn 0.16s ease;
}

@keyframes tooltipFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

.math-tooltip.visible {
  /* Deprecated: handled by v-if */
}
.math-tooltip-tex {
  /* Deprecated, using editor structure instead */
  display: none;
}
/* Reused styles for content */
.math-tooltip-content { display: none; } 

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
.math-tooltip-actions .save-btn:hover {
    color: #2ea35f;
    border-color: #2ea35f;
}

.validation-error {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.2);
    border-radius: 4px;
    padding: 6px 8px;
    margin-top: 4px;
}
.validation-error svg {
    flex-shrink: 0;
}

.math-tooltip-actions .icon-btn:hover {
  background-color: #444;
  border-color: #2ea35f;
  color: #fff;
}

/* Edit Mode Styles */
.math-tooltip.editing {
  min-width: 400px;
  width: 400px;
  max-width: 600px;
}
.math-tooltip-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 80vh;
}

.math-tooltip-editor .editor-wrapper {
  position: relative;
  min-height: 48px;
  max-height: 200px; /* Limit max height */
  background: #2b2b2b;
  border: 1px solid #333;
  border-radius: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.math-tooltip-editor .editor-content {
  position: relative;
  width: 100%;
}

.math-tooltip-editor .syntax-highlight {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 8px;
  padding-bottom: 24px;
  min-height: 48px; /* Should match wrapper min-height roughly */
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word; /* Ensure wrapping so it dictates height */
  box-sizing: border-box;
  color: #d4d4d4;
  pointer-events: none;
}

.math-tooltip-editor .code-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 8px;
  padding-bottom: 20px;
  border: none;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background: transparent;
  color: transparent;
  caret-color: #fff;
  resize: none;
  border: none;
  outline: none;
  z-index: 10;
  overflow: hidden; /* Hide scrollbar, use wrapper's */
  box-sizing: border-box;
}

/* Cleanup redundant styles */
.math-tooltip-editor .editor-wrapper {
   min-height: 42px;
}
.math-tooltip-editor .syntax-highlight {
   padding-bottom: 20px;
   min-height: 42px;
}

.math-tooltip-editor .code-textarea {
  font-family: 'Consolas', 'Monaco', monospace; /* Force monospace */
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word; /* Deprecated but useful fallback */
  overflow-wrap: break-word;
  background: transparent;
  color: transparent;
  caret-color: #fff;
  resize: none;
  border: none;
  outline: none;
  z-index: 10;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 8px;
  padding-bottom: 20px; /* Consistent padding */
  overflow: hidden; /* Prevent double scrollbars, rely on wrapper */
  pointer-events: auto; /* Allow input */
}

.math-tooltip-editor .syntax-highlight {
  position: relative;
  margin: 0;
  padding: 8px;
  padding-bottom: 20px; /* Consistent padding */
  pointer-events: none;
  background: transparent;
  width: 100%;
  font-family: 'Consolas', 'Monaco', monospace; /* Force monospace */
  font-size: 13.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word; /* Deprecated but useful fallback */
  overflow-wrap: break-word;
}

/* The wrapper now scrolls if content exceeds its max-height */
.math-tooltip-editor .editor-wrapper {
  overflow-y: auto; /* Allow scrolling on wrapper */
}

.math-tooltip-editor .syntax-highlight {
  pointer-events: none;
  background: transparent;
  color: #d4d4d4;
  z-index: 0;
  /* Override padding-bottom for the highlighter so it aligns with textarea but doesn't trap scroll */
  /* Actually they must match exactly for alignment */
}

.math-tooltip-editor .code-textarea {
  background: transparent;
  color: transparent;
  caret-color: #fff;
  resize: none;
  outline: none;
  z-index: 1;
}

/* Ensure read-only highlight has proper scrolling if content is long */
.syntax-highlight-readonly {
  width: 100%;
  box-sizing: border-box;
}

.math-tooltip-editor .math-tooltip-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}

.math-tooltip-actions .text-btn {
  width: auto;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #444;
  background: #333;
  color: #eee;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.math-tooltip-actions .text-btn:hover {
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
