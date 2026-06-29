<template>
  <div class="slides-body" ref="slidesBodyRef" @keydown="onKeydown">
    <!-- Left: Thumbnail strip -->
    <div class="thumbnail-strip" v-show="showThumbnails">
      <div class="thumbnail-strip-header">
        <span class="thumbnail-count">{{ slides.length }} {{ slides.length === 1 ? 'slide' : 'slides' }}</span>
        <button class="thumbnail-toggle" @click="showThumbnailsLocal = !showThumbnailsLocal" title="Toggle thumbnails">
          <span class="icon-svg">☰</span>
        </button>
      </div>
      <div class="thumbnail-list">
        <div v-for="(slide, i) in slides" :key="i" class="thumbnail-item" :class="{ active: i === currentSlide }"
          @click="goToSlide(i)">
          <span class="thumbnail-num">{{ i + 1 }}</span>
          <span class="thumbnail-label">{{ slideTitle(slide) }}</span>
          <span v-if="slide.hasNotes" class="thumbnail-notes-dot" title="Has speaker notes">💬</span>
        </div>
      </div>
    </div>

    <!-- Split area: editor + preview, sized against remaining space after thumbnails -->
    <div class="split-area" ref="splitAreaRef">
      <!-- Center: Code editor -->
      <div v-show="showEditor" class="pane editor-pane" :style="editorStyle">
        <CmEditor ref="editorRef" v-model="localContent" :disabled="props.disabled"
          :placeholder="placeholder" :fontClass="fontClass"
          @cursorChange="onCursorChange" />
      </div>

      <!-- Draggable divider (split mode) -->
      <div
        v-if="showEditor && showPreview"
        class="pane-divider"
        @mousedown.prevent="onDividerDown"
      >
      <span class="divider-line" ></span>
      </div>

      <!-- Right: Slide preview -->
      <div v-show="showPreview" class="pane preview-pane" :class="previewMode" :style="previewStyle" ref="previewPaneRef" @wheel="onWheel">
      <div v-if="slides.length" class="marp-output" ref="marpOutRef" style="width:100%;height:100%;overflow:auto"></div>
      <template v-if="currentSlideData">
        <!-- Speaker notes -->
        <div v-if="currentSlideData.hasNotes" class="speaker-notes-panel" :class="{ expanded: notesExpanded }">
          <button class="notes-toggle" @click="notesExpanded = !notesExpanded">
            💬 Speaker Notes {{ notesExpanded ? '▾' : '▸' }}
          </button>
          <div v-show="notesExpanded" class="notes-content">{{ currentSlideData.notes }}</div>
        </div>
      </template>
      <div v-else class="empty-preview">
        <p>No slides yet.</p>
        <p>Start writing and separate slides with <code>---</code> on a blank line.</p>
      </div>

      <!-- Slide navigation controls -->
      <div v-if="slides.length > 0" class="slide-controls-bar">
        <button @click="goToSlide(0)" :disabled="currentSlide <= 0" title="First slide (Home)">
          <span class="icon-svg reverse" v-html="Icons.toBottom" ></span>
        </button>
        <button @click="prevSlide" :disabled="currentSlide <= 0" title="Previous slide (← / PageUp)">
          <span class="icon-svg reverse" v-html="Icons.chevron" ></span>
        </button>
        <span class="slide-position">{{ currentSlide + 1 }} / {{ slides.length }}</span>
        <button @click="nextSlide" :disabled="currentSlide >= slides.length - 1" title="Next slide (→ / PageDown)">
          <span class="icon-svg" v-html="Icons.chevron" ></span>
        </button>
        <button @click="goToSlide(slides.length - 1)" :disabled="currentSlide >= slides.length - 1" title="Last slide (End)">
          <span class="icon-svg" v-html="Icons.toBottom"></span>
        </button>
      </div>
    </div>
    </div><!-- .split-area -->
  </div>

  <!-- Slide overview modal -->
  <SlideOverview v-if="showOverview" :slides="slides" :active-index="currentSlide" @close="showOverview = false"
    @select="goToSlide($event); showOverview = false" />

</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { EditorView } from '@codemirror/view'
import CmEditor from './CmEditor.vue'
import SlideOverview from './slides/SlideOverview.vue'
import { parseSlides } from '@chronicle/shared/utils'
import type { ParsedSlide } from '@chronicle/shared/utils'
import { renderPreview } from '../utils/markdownPreview'
import { Icons } from '../utils/icons'
import Marp from '@marp-team/marp-core'
import { chronicleCSS, chronicleDarkCSS, chronicleLightTheme, chronicleDarkTheme } from '../utils/chronicleThemes'

// Marp engine with Chronicle themes (default accent)
const marp = new Marp({ html: true, markdown: { breaks: false } })
try { marp.themeSet.add(chronicleCSS); marp.themeSet.add(chronicleDarkCSS) } catch {}


const props = withDefaults(defineProps<{
  modelValue: string
  fontClass?: string
  placeholder?: string
  layoutMode?: 'slideshow' | 'split' | 'edit'
  disabled?: boolean
}>(), {
  modelValue: '',
  fontClass: 'font-sans',
  placeholder: 'Write your slides...',
  layoutMode: 'split',
  disabled: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// ── Content ──────────────────────────────────────────
const localContent = ref(props.modelValue)

// Apply accent-color from frontmatter before each Marp render
let lastAccent = ''
function applyAccentTheme(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  const fm = m ? m[1] : ''
  const raw = fm.match(/accent-color:\s*"?([^"\n]+)"?/)?.[1]?.trim() || ''
  if (!raw || raw === lastAccent) return
  lastAccent = raw
  const accent = raw === 'follow'
    ? getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#2563eb'
    : (raw.startsWith('#') ? raw : `#${raw}`)
  try {
    marp.themeSet.add(chronicleLightTheme(accent))
    marp.themeSet.add(chronicleDarkTheme(accent))
  } catch {}
}

watch(() => props.modelValue, (val) => {
  if (val !== localContent.value) localContent.value = val
})

watch(localContent, (val) => {
  emit('update:modelValue', val)
})

// ── Refs & state ─────────────────────────────────────
const editorRef = ref<any>(null)
const splitAreaRef = ref<HTMLDivElement | null>(null)
const currentSlide = ref(0)
const notesExpanded = ref(false)
const showThumbnailsLocal = ref(true)
const showOverview = ref(false)
const previewMode = ref<"single" | "all">("single")
const cursorLine = ref(1)
const autoFollow = ref(true)

// ── Parse slides: count outer <svg data-marpit-svg>, extract content section per slide ──
const parsed = computed(() => {
  if (!localContent.value.trim()) return { slides: [] as ParsedSlide[], css: '' }
  try {
    const { html, css } = marp.render(localContent.value)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const svgs = [...doc.querySelectorAll('[data-marpit-svg]')]
    const slides: ParsedSlide[] = svgs.map((svg, i) => {
      // Each SVG has multiple foreignObject/section layers; take the content one (has id attr on section)
      const contentSec = svg.querySelector('section[id]') || svg.querySelector('section')
      const notes = contentSec?.querySelector('.notes, aside.notes')?.textContent?.trim() || ''
      return {
        index: i,
        markdown: '',
        html: contentSec?.outerHTML || '',
        directives: {} as Record<string, string>,
        notes,
        hasNotes: !!notes,
      }
    })
    return { slides: slides.length ? slides : [{ index: 0, markdown: '', html: '', directives: {}, notes: '', hasNotes: false }], css }
  } catch {
    return { slides: [] as ParsedSlide[], css: '' }
  }
})

const previewPaneRef = ref<HTMLElement | null>(null)
const marpOutRef = ref<HTMLElement | null>(null)

// ── Split divider drag ───────────────────────────────
const SPLIT_KEY_SLIDES = 'chronicle_slides_split_ratio'
const splitRatio = ref(Number(localStorage.getItem(SPLIT_KEY_SLIDES)) || 0.5)
const editorStyle = computed(() =>
  props.layoutMode !== 'edit' && showPreview.value
    ? { width: `calc(${splitRatio.value * 100}% - 5px)`, flex: 'none' }
    : {}
)
const previewStyle = computed(() =>
  props.layoutMode !== 'edit' && showEditor.value
    ? { width: `calc(${(1 - splitRatio.value) * 100}% - 5px)`, flex: 'none' }
    : {}
)

function onDividerDown(e: MouseEvent) {
  const ws = splitAreaRef.value; if (!ws) return
  const startX = e.clientX
  const startRatio = splitRatio.value
  const totalWidth = ws.offsetWidth
  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX
    const r = Math.min(0.8, Math.max(0.2, startRatio + dx / totalWidth))
    splitRatio.value = r
  }
  const onUp = () => {
    localStorage.setItem(SPLIT_KEY_SLIDES, String(splitRatio.value))
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const slides = computed(() => parsed.value.slides)
const currentSlideData = computed(() => slides.value[currentSlide.value] ?? null)

// Inject Marp HTML + CSS, preserve current slide index across re-renders
function renderMarpOutput(md: string) {
  if (!md.trim()) { currentSlide.value = 0; return }
  applyAccentTheme(md)
  const prev = currentSlide.value
  try {
    const { html, css } = marp.render(md)
    const el = marpOutRef.value; if (!el) return
    el.innerHTML = html
    document.getElementById('marp-slides-css')?.remove()
    const style = document.createElement('style')
    style.id = 'marp-slides-css'; style.textContent = css
    previewPaneRef.value?.appendChild(style)
    // Restore previous slide or clamp to valid range
    const svgCount = el.querySelectorAll('[data-marpit-svg]').length
    currentSlide.value = Math.min(prev, Math.max(0, svgCount - 1))
    updateSlideVisibility(currentSlide.value)
  } catch {}
}

watch(localContent, (val) => {
  void nextTick(() => renderMarpOutput(val))
}, { immediate: true })

function updateSlideVisibility(idx: number) {
  const el = marpOutRef.value; if (!el) return
  if (previewMode.value === 'single') {
    el.querySelectorAll('[data-marpit-svg]').forEach((svg: any, i) => {
      svg.style.display = i === idx ? '' : 'none'
    })
  } else {
    // "all" mode: scroll the target slide into view
    const svgs = el.querySelectorAll('[data-marpit-svg]')
    if (svgs[idx]) {
      svgs[idx].scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }
}

watch(currentSlide, (idx) => updateSlideVisibility(idx))
watch(previewMode, (mode) => {
  const el = marpOutRef.value; if (!el) return
  if (mode === 'all') {
    el.querySelectorAll('[data-marpit-svg]').forEach((n: any) => { n.style.display = '' })
  } else {
    updateSlideVisibility(currentSlide.value)
  }
})
const config = computed(() => ({} as Record<string, any>))
const ratio = computed(() => '16:9')

// Insert text at the beginning of slide N (right after the --- separator)
function insertAtSlideStart(idx: number, text: string) {
  const lines = localContent.value.split('\n')
  let slideStart = 0
  let sepCount = 0
  let inFrontmatter = true
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) { inFrontmatter = false; slideStart = i + 1 }
      continue
    }
    if (sepCount === idx) { break }
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      sepCount++
      slideStart = i + 1
    }
  }
  // After separator, insert directive with exactly one blank line above.
  // Use CodeMirror dispatch to preserve undo history.
  while (slideStart < lines.length && !lines[slideStart].trim()) { slideStart++ }
  const before = lines.slice(0, slideStart).join('\n').replace(/\n+$/, '')
  const editor = editorRef.value as any
  const view = editor?.getEditor?.()
  if (view) {
    const insertPos = before.length + 2  // after before + \n\n
    view.dispatch({
      changes: { from: insertPos, to: insertPos, insert: `${text}\n` },
    })
  }
}

// ── Layout modes ─────────────────────────────────────
const showThumbnails = computed(() => showThumbnailsLocal.value && props.layoutMode !== 'edit')
const showEditor = computed(() => props.layoutMode === 'split' || props.layoutMode === 'edit')
const showPreview = computed(() => props.layoutMode !== 'edit')

// ── Slide title extraction ───────────────────────────
function slideTitle(slide: ParsedSlide): string {
  // Extract from HTML (section[id] content)
  const h = slide.html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (h) return h[1].replace(/<[^>]+>/g, '').slice(0, 40)
  const text = slide.html.replace(/<[^>]+>/g, '').trim()
  return text.slice(0, 40) || `Slide ${slide.index + 1}`
}

// ── Cursor→slide sync ────────────────────────────────
function onCursorChange(line: number) {
  cursorLine.value = line
  if (!autoFollow.value) return
  // Find which slide contains this line
  const contentBefore = localContent.value.split('\n').slice(0, line).join('\n')
  // Count --- separators to find slide index
  const lines = localContent.value.split('\n')
  let sepCount = 0
  let inFrontmatter = true
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) inFrontmatter = false
      continue
    }
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      sepCount++
    }
  }
  const slideIdx = Math.min(sepCount, Math.max(0, slides.value.length - 1))
  if (slideIdx !== currentSlide.value) {
    currentSlide.value = slideIdx
  }
}

// ── Navigation ───────────────────────────────────────
function goToSlide(idx: number) {
  if (idx < 0 || idx >= slides.value.length) return
  currentSlide.value = idx
  autoFollow.value = false
  jumpEditorToSlide(idx)
  // Re-enable cursor→slide sync after the programmatic jump settles
  void nextTick(() => { autoFollow.value = true })
  notesExpanded.value = false
}

function prevSlide() { if (currentSlide.value > 0) { currentSlide.value--; goToSlide(currentSlide.value) } }
function nextSlide() { if (currentSlide.value < slides.value.length - 1) { currentSlide.value++; goToSlide(currentSlide.value) } }

function onWheel(e: WheelEvent) {
  if (previewMode.value === 'single') {
    e.preventDefault()
    if (e.deltaY > 0) nextSlide()
    else if (e.deltaY < 0) prevSlide()
  }
}

function jumpEditorToSlide(idx: number) {
  if (!editorRef.value) return
  const lines = localContent.value.split('\n')
  // Slide 0 starts right after the frontmatter closing ---
  if (idx === 0) {
    let inFrontmatter = true
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim()
      if (inFrontmatter && l === '---' && i > 0) {
        inFrontmatter = false
        const cmView = (editorRef.value as any)?.getEditor?.()
        if (cmView) {
          const pos = cmView.state.doc.line(Math.min(i + 2, lines.length)).from
          cmView.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: 'start' }),
          })
        }
        return
      }
    }
    return
  }
  // Slide N (N>0) starts after separator #(N-1)
  let sepCount = 0
  let inFrontmatter = true
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) { inFrontmatter = false; continue }
      continue
    }
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      if (sepCount === idx - 1) {
        const cmView = (editorRef.value as any)?.getEditor?.()
        if (cmView) {
          const pos = cmView.state.doc.line(Math.min(i + 2, lines.length)).from
          cmView.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: 'start' }),
          })
        }
        return
      }
      sepCount++
    }
  }
}

// ── Keyboard ─────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement

  // Allow keyboard shortcuts in body area even when focus is on non-input elements
  const isInInput = target.closest('.cm-editor, input, textarea')
  const isInShell = target.closest('.blog-editor')

  // Overview has its own keyboard handling (Esc closes)
  if (showOverview.value) {
    if (!isInInput && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); showOverview.value = false }
    return
  }

  if (isInInput) return // let CodeMirror handle it
  if (!isInShell) return // only handle keys within the editor

  switch (e.key) {
    case 'ArrowLeft': case 'PageUp': e.preventDefault(); prevSlide(); break
    case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); nextSlide(); break
    case 'Home': e.preventDefault(); goToSlide(0); break
    case 'End': e.preventDefault(); goToSlide(slides.value.length - 1); break
    case 'o': case 'O': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); showOverview.value = true } break
    case 'f': case 'F': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFullscreen() } break
  }
}

function toggleFullscreen() {
  const el = document.querySelector('.preview-pane') as HTMLElement | null
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    el.requestFullscreen()
  }
}

// ── Expose ───────────────────────────────────────────
function insertAtCursor(text: string) {
  const editor = editorRef.value as any
  editor?.insertAtCursor?.(text)
}
function getSelection() { return (editorRef.value as any)?.getSelection?.() || '' }
function clearHistory() { (editorRef.value as any)?.clearHistory?.() }
function undo() { (editorRef.value as any)?.undo() }
function redo() { (editorRef.value as any)?.redo() }

// Pass through CmEditor's reactive undo/redo state
const canUndo = computed(() => !!(editorRef.value as any)?.canUndo)
const canRedo = computed(() => !!(editorRef.value as any)?.canRedo)

function handleToolAction(action: string) {
  if (action === 'preview:single') previewMode.value = 'single'
  else if (action === 'preview:all') previewMode.value = 'all'
  else if (action === 'toggleOutline') showThumbnailsLocal.value = !showThumbnailsLocal.value
  else if (action === 'newSlide') insertNewSlide()
  else if (action === 'insertHeader') insertAtSlideStart(currentSlide.value, '<!-- _header:  -->')
  else if (action === 'insertFooter') insertAtSlideStart(currentSlide.value, '<!-- _footer:  -->')
  else if (action === 'insertClassLead') insertAtSlideStart(currentSlide.value, '<!-- _class: lead -->')
  else if (action === 'insertBgColor') insertAtSlideStart(currentSlide.value, '<!-- _backgroundColor:  -->')
  else if (action === 'insertPaginate') insertAtSlideStart(currentSlide.value, '<!-- _paginate: true -->')
}

function insertNewSlide() {
  const lines = localContent.value.split('\n')
  let slideStart = 0
  let sepCount = 0
  let inFrontmatter = true
  // Find start of current slide
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (inFrontmatter) {
      if (l === '---' && i > 0) { inFrontmatter = false; slideStart = i + 1; continue }
      continue
    }
    if (sepCount >= currentSlide.value) break
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      sepCount++; slideStart = i + 1
    }
  }
  // Find end of current slide (next separator or EOF)
  let slideEnd = lines.length
  for (let i = slideStart; i < lines.length; i++) {
    const l = lines[i].trim()
    if (l === '---' && (i === 0 || lines[i - 1].trim() === '') && (i + 1 >= lines.length || lines[i + 1].trim() === '')) {
      slideEnd = i; break
    }
  }
  const before = lines.slice(0, slideEnd).join('\n')
  const insert = `\n---\n\n<!-- New Page -->\n\n\n`
  const editor = editorRef.value as any
  const view = editor?.getEditor?.()
  if (view) {
    view.dispatch({
      changes: { from: before.length, to: before.length, insert },
    })
    const cursorPos = before.length + insert.length - 1
    view.dispatch({ selection: { anchor: cursorPos } })
    // Auto-navigate to the new page after Marp re-renders
    const newIdx = currentSlide.value + 1
    void nextTick(() => {
      void nextTick(() => {
        goToSlide(newIdx)
      })
    })
  }
}

function getToolbarConfig() {
  return {
    tabs: [
      {
        id: 'start', label: 'Start', icon: Icons.edit,
        groups: [
          {
            tools: [
              { type: 'button', id: 'new-slide', label: 'New Page', icon: Icons.plus, action: 'newSlide' },
              { type: 'button', id: 'media', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'mode-slideshow', label: 'Slideshow', icon: Icons.slideshow, action: 'layout:slideshow' },
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
            ]
          },
          {
            tools: [
              { type: 'spacer' },
              { type: 'button', id: 'export', label: 'Export', icon: Icons.save, action: 'export' },
              { type: 'button', id: 'wordcount', label: '', icon: '', action: 'stats', isStats: true },
            ]
          },
        ]
      },
      {
        id: 'insert', label: 'Insert', icon: Icons.plus,
        groups: [
          {
            tools: [
              { type: 'button', id: 'new-slide', label: 'New Page', icon: Icons.plus, action: 'newSlide' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'media', label: 'Media', icon: Icons.media, action: 'openMediaModal' },
              { type: 'button', id: 'link', label: 'Link', icon: Icons.link, action: 'openLinkModal' },
              { type: 'button', id: 'table', label: 'Table', icon: Icons.table, action: 'openTableModal' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'code', label: 'Code', icon: Icons.codeTag, action: 'insertCode' },
              { type: 'button', id: 'math', label: 'Formula', icon: Icons.formula, action: 'openMathModal' },
              { type: 'button', id: 'quote', label: 'Quote', icon: Icons.quote, action: 'insertQuote' },
              { type: 'button', id: 'todo', label: 'Todo', icon: Icons.todo, action: 'insertTodo' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'insertHeader', label: 'Header', icon: Icons.header, action: 'insertHeader' },
              { type: 'button', id: 'insertFooter', label: 'Footer', icon: Icons.footer, action: 'insertFooter' },
            ]
          },
        ]
      },
      {
        id: 'page', label: 'Page', icon: Icons.slideshow,
        groups: [
          {
            tools: [
              { type: 'button', id: 'insertClassLead', label: 'Lead', icon: Icons.singlePage, action: 'insertClassLead' },
              { type: 'button', id: 'insertBgColor', label: 'BG Color', icon: Icons.palette, action: 'insertBgColor' },
              { type: 'button', id: 'insertPaginate', label: 'Paginate', icon: Icons.orderNum, action: 'insertPaginate' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'insertHeader', label: 'Header', icon: Icons.header, action: 'insertHeader' },
              { type: 'button', id: 'insertFooter', label: 'Footer', icon: Icons.footer, action: 'insertFooter' },
            ]
          },
        ]
      },
      {
        id: 'view', label: 'View', icon: Icons.eye,
        groups: [
          {
            tools: [
              { type: 'button', id: 'toggle-outline', label: 'Outline', icon: Icons.list, action: 'toggleOutline' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'mode-slideshow', label: 'Slideshow', icon: Icons.slideshow, action: 'layout:slideshow' },
              { type: 'button', id: 'mode-split', label: 'Split', icon: Icons.columns, action: 'layout:split' },
              { type: 'button', id: 'mode-edit', label: 'Edit', icon: Icons.edit, action: 'layout:edit' },
            ]
          },
          {
            tools: [
              { type: 'button', id: 'preview-single', label: 'Single', icon: Icons.singlePage, action: 'preview:single' },
              { type: 'button', id: 'preview-all', label: 'All', icon: Icons.rows, action: 'preview:all' },
            ]
          }
        ]
      },
    ]
  }
}

defineExpose({
  editorRef, insertAtCursor, getSelection, undo, redo, clearHistory,
  canUndo, canRedo, getToolbarConfig, handleToolAction, previewMode, showThumbnailsLocal,
  initContent(content: string) {
    localContent.value = content
    ;(editorRef.value as any)?.initContent?.(content)
  },
})
</script>

<style>
.preview-pane.single [data-marpit-svg] {
  position: absolute;
  inset: 0;
  margin: auto;
  max-width: 100%;
  max-height: 100%
}

.preview-pane.full [data-marpit-svg] {
  display: block
}
</style>

<style scoped>
.preview-pane {
  position: relative
}

.slides-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

/* ── Thumbnail strip ──────────────────────────────── */
.thumbnail-strip {
  width: min(200px, 25vw);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  margin: 10px;
}

.thumbnail-strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: .75rem;
  color: var(--component-text-secondary);
}

.thumbnail-count {
  font-weight: 500;
  font-variation-settings: 'wght' 500;
}

.thumbnail-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--component-text-secondary);
  font-size: 14px;
  padding: 2px;
}

.thumbnail-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.thumbnail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: .75rem;
  color: var(--component-text-secondary);
  border: 1px solid transparent;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.thumbnail-item.active {
  background: var(--component-bg-accent);
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.thumbnail-item:hover:not(.active) {
  background: var(--component-bg-hover);
}

.thumbnail-num {
  font-weight: 700;
  font-size: 11px;
  min-width: 18px;
  text-align: center;
  color: var(--component-text-secondary);
}

.thumbnail-item.active .thumbnail-num {
  color: var(--component-text-primary);
}

.thumbnail-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-notes-dot {
  font-size: 9px;
  flex-shrink: 0;
}

/* ── Panes ─────────────────────────────────────────── */
.pane {
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  min-width: 0;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.empty-preview {
  text-align: center;
  color: var(--component-text-secondary);
  padding: 2rem;
  line-height: 1.8;
}

.empty-preview code {
  background: var(--component-bg-hover);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.9em;
}

/* ── Speaker notes ─────────────────────────────────── */
.speaker-notes-panel {
  width: 100%;
  max-width: 960px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
}

.notes-toggle {
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--component-text-secondary);
}

.notes-toggle:hover {
  background: var(--component-bg-hover);
}

.notes-content {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--component-text-secondary);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
}

/* ── Controls bar ──────────────────────────────────── */
.slide-controls-bar {
  display: flex;
  position: absolute;
  align-items: center;
  justify-content: center;
  bottom: 24px;
  gap: 8px;
  padding: 4px 12px;
  background: var(--component-bg-blur);
  backdrop-filter: blur(6px);
  border-radius: 99999px;
  font-size: .8rem;
  color: var(--component-text-primary);
}

.slide-controls-bar button {
  border: none;
  padding: 6px 8px;
  border-radius: 8px;
  background: transparent;
  color: var(--component-text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s, color 0.2s;
}

.slide-controls-bar button .icon-svg :deep(svg){
  width: 18px;
  height: 18px;
}

.slide-controls-bar button .icon-svg.reverse :deep(svg){
  transform: rotate(180deg);
}


.slide-controls-bar button:hover {
  background: var(--component-bg-hover);
  color: var(--component-text-primary);
  cursor: pointer;
  font-size: 12px;
}

.slide-controls-bar button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.slide-position {
  font-weight: 500;
  font-variation-settings: 'wght' 500;
  letter-spacing: .5px;
  min-width: 50px;
  text-align: center;
}

/* ── Split area ──────────────────────────────────── */
.split-area {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
}

/* ── Split divider ────────────────────────────────── */
.pane-divider {
  width: 9px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  user-select: none;
}
.pane-divider:hover .divider-line {
  width: 2px;
  background: color-mix(in srgb, var(--component-text-primary-highlight) 85%, transparent);
  box-shadow: 0 0 4px 0 var(--component-text-primary-highlight);
}
.pane-divider .divider-line {
  display: block;
  width: 1px;
  height: 100%;
  margin: 0 4px;
  background: var(--border-color);
  transition: width 0.15s, background 0.15s, box-shadow 0.15s;
}
</style>
