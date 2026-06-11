<!--
  Chronicle Manager — CodeMirror 6 Editor
  Replaces raw <textarea> with syntax-highlighted markdown editing.
-->
<template>
  <div ref="editorHost" class="cm-editor-host"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  fontClass?: string
}>(), {
  modelValue: '',
  placeholder: '',
  disabled: false,
  fontClass: 'font-sans',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'cursorChange': [line: number, col: number]
  'changeRange': [range: { from: number; to: number }]
  'editorScroll': []
}>()

const editorHost = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const editableCompartment = new Compartment()

// Track cursor position
let cursorTimer: ReturnType<typeof setTimeout> | null = null

function emitCursor(view: EditorView) {
  if (cursorTimer) clearTimeout(cursorTimer)
  cursorTimer = setTimeout(() => {
    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    emit('cursorChange', line.number, pos - line.from + 1)
  }, 50)
}

// hljs-inspired markdown syntax highlighting (class-based, colors in CSS)
const hljsHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: 'hljs-heading' },
  { tag: tags.heading2, class: 'hljs-heading' },
  { tag: tags.heading3, class: 'hljs-heading' },
  { tag: tags.heading4, class: 'hljs-heading' },
  { tag: tags.heading5, class: 'hljs-heading' },
  { tag: tags.heading6, class: 'hljs-heading' },
  { tag: tags.strong, class: 'hljs-strong' },
  { tag: tags.emphasis, class: 'hljs-emphasis' },
  { tag: tags.strikethrough, class: 'hljs-strikethrough' },
  { tag: tags.link, class: 'hljs-link' },
  { tag: tags.url, class: 'hljs-link' },
  { tag: tags.monospace, class: 'hljs-code' },
  { tag: tags.list, class: 'hljs-list' },
  { tag: tags.quote, class: 'hljs-quote' },
  { tag: tags.meta, class: 'hljs-meta' },
  { tag: tags.comment, class: 'hljs-comment' },
  { tag: tags.contentSeparator, class: 'hljs-hr' },
])

function createExtensions(): Extension[] {
  const exts: Extension[] = [
    markdown({ base: markdownLanguage }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Suppress model-value emission during IME composition — emitting
        // mid-composition triggers the modelValue watcher's full-document
        // replacement, which force-commits the IME and causes double-input
        // for CJK punctuation marks.
        if (!update.view.composing) {
          const val = update.state.doc.toString()
          const len = update.startState.doc.length
          const newLen = update.state.doc.length
          // Compute changed line range from transaction
          let fromLine = Infinity, toLine = 0
          if (len > 0 && newLen > 0) {
            update.changes.iterChanges((fromA, _toA, _fromB, toB) => {
              const p0 = Math.min(Math.max(fromA, 0), len - 1)
              const l0 = update.startState.doc.lineAt(p0).number
              const p1 = Math.min(Math.max(toB - 1, 0), newLen - 1)
              const l1 = update.state.doc.lineAt(p1).number
              fromLine = Math.min(fromLine, l0)
              toLine = Math.max(toLine, l1)
            })
          }
          if (!isFinite(fromLine)) { fromLine = 1; toLine = update.state.doc.lines }
          emit('update:modelValue', val)
          emit('changeRange', { from: fromLine, to: toLine })
        }
      }
      if (update.selectionSet) {
        emitCursor(update.view)
      }
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    history(),
    EditorState.allowMultipleSelections.of(false),
    EditorView.lineWrapping,
  ]

  if (props.placeholder) {
    exts.push(cmPlaceholder(props.placeholder))
  }

  // hljs-style syntax highlighting
  exts.push(syntaxHighlighting(hljsHighlight))

  if (props.disabled) {
    exts.push(EditorState.readOnly.of(true))
  }
  exts.push(editableCompartment.of(EditorView.editable.of(!props.disabled)))

  return exts
}

function createEditor() {
  if (!editorHost.value) return
  if (editorView) editorView.destroy()

  editorView = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: createExtensions(),
    }),
    parent: editorHost.value,
  })
}

onMounted(() => {
  nextTick(() => {
    createEditor()
    // Listen to CodeMirror's internal scroller (not host div)
    editorView?.scrollDOM.addEventListener('scroll', () => emit('editorScroll'), { passive: true })
  })
})

onUnmounted(() => {
  if (cursorTimer) clearTimeout(cursorTimer)
  editorView?.destroy()
  editorView = null
})

// Sync external value changes → editor
watch(() => props.modelValue, (val) => {
  // Never replace the document mid-composition — it force-commits the IME
  // and causes double-input for CJK characters.
  if (editorView && !editorView.composing && val !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: val },
    })
  }
})

// Sync disabled state
watch(() => props.disabled, (val) => {
  if (editorView) {
    editorView.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!val)),
    })
  }
})

defineExpose({
  focus() { editorView?.focus() },
  getEditor() { return editorView },
  undo() { if (editorView) undo(editorView) },
  redo() { if (editorView) redo(editorView) },
  getCursorLine(): number {
    if (!editorView) return 1
    const pos = editorView.state.selection.main.head
    return editorView.state.doc.lineAt(pos).number
  },
  /** Insert text at the current cursor position, replacing any selection. */
  insertAtCursor(text: string) {
    if (!editorView) return
    const { from, to } = editorView.state.selection.main
    editorView.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    })
  },
  /** Get the current selection range { from, to } plus the full document text. */
  getSelection(): { from: number; to: number; text: string } | null {
    if (!editorView) return null
    const { from, to } = editorView.state.selection.main
    return { from, to, text: editorView.state.sliceDoc(from, to) }
  },
  /** CodeMirror's scrollable DOM element for scroll-sync */
  getScrollDom(): HTMLElement | null {
    return editorView?.scrollDOM ?? null
  },
  addScrollListener(fn: EventListener) {
    editorView?.scrollDOM.addEventListener('scroll', fn)
  },
  removeScrollListener(fn: EventListener) {
    editorView?.scrollDOM.removeEventListener('scroll', fn)
  },
})
</script>

<style>
.cm-editor-host {
  height: 100%;
}

.cm-editor-host .cm-editor {
  background: var(--component-bg-primary);
  color: var(--app-text-primary);
  font-size: .9rem;
  height: 100%;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.cm-editor-host .cm-editor .cm-scroller {
  font-family: inherit;
  line-height: 1.7;
}

.cm-editor-host .cm-editor .cm-content {
  padding: 1rem 1rem 55vh 1rem;
}

.cm-editor-host .cm-editor.cm-focused {
  outline: none;
}

/* ── hljs token colors ─────────────────────────────── */
.cm-editor-host .hljs-strong       { font-weight: bold; }
.cm-editor-host .hljs-emphasis     { font-style: italic; }
.cm-editor-host .hljs-strikethrough{ text-decoration: line-through; opacity: 0.6; }

/* Dark theme (default) */
.cm-editor-host .hljs-heading      { color: #c678dd; font-weight: bold; }
.cm-editor-host .hljs-heading.hljs-meta{ color: #c678dd; }
.cm-editor-host .hljs-link         { color: #61afef; text-decoration: underline; }
.cm-editor-host .hljs-code         { color: var(--code-text) }
.cm-editor-host .hljs-code.hljs-meta{ color: var(--code-text) }
.cm-editor-host .hljs-list.hljs-meta{ color: #d19a66; }
.cm-editor-host .hljs-quote        { color: #98c379; }
.cm-editor-host .hljs-quote.hljs-meta{ color: #98c379; }
.cm-editor-host .hljs-comment      { color: #5c6370; font-style: italic; }
.cm-editor-host .hljs-hr           { color: #5c6370; }

.cm-editor-host .hljs-strong.hljs-meta{ color: var(--app-text-primary); }
.cm-editor-host .hljs-italic.hljs-meta{ color: var(--app-text-primary); }


/* Light theme — same hues, adjusted for light background */
[data-backend-theme="light"] .cm-editor-host .hljs-heading { color: #a626a4; font-weight: bold; }
[data-backend-theme="light"] .cm-editor-host .hljs-heading.hljs-meta{ color: #a626a4; }
[data-backend-theme="light"] .cm-editor-host .hljs-link    { color: #4078f2; text-decoration: underline; }
[data-backend-theme="light"] .cm-editor-host .hljs-quote   { color: #50a14f; }
[data-backend-theme="light"] .cm-editor-host .hljs-list.hljs-meta    { color: #986801; }
[data-backend-theme="light"] .cm-editor-host .hljs-quote.hljs-meta   { color: #50a14f; }
[data-backend-theme="light"] .cm-editor-host .hljs-meta    { color: #a626a4; }
[data-backend-theme="light"] .cm-editor-host .hljs-comment { color: #a0a1a7; font-style: italic; }
[data-backend-theme="light"] .cm-editor-host .hljs-hr      { color: #a0a1a7; }

/* Cursor & selection */
.cm-editor-host .cm-editor .cm-content  { caret-color: var(--app-text-primary); }
.cm-editor-host .cm-editor .cm-cursor   { border-left: 2px solid var(--app-text-primary); }
.cm-editor-host .cm-editor .cm-selectionBackground { background: var(--component-bg-active); }
.cm-editor-host .cm-editor .cm-activeLine          { background: var(--component-bg-hover); }
.cm-editor-host .cm-editor .cm-matchingBracket     { background: var(--component-bg-active); outline: 1px solid #2ea35f; }

/* ── Search / Replace Panel ────────────────────── */

/* Float panels above editor content */
.cm-panels {
  position: absolute !important;
  top: 0;
  right: 0;
  z-index: 20;
  background: transparent !important;
  border: none !important;
}

.cm-panels-bottom {
  position: absolute;
  top: auto;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  background: transparent !important;
  border: none !important;
}

.cm-panel {
  background: var(--component-bg-blur) !important;
  color: var(--component-text-primary) !important;
  border: 1px solid var(--border-color) !important;
  padding: 8px 12px !important;
  margin: 16px !important;
  border-radius: 10px !important;
  box-shadow: var(--shadow-elev-2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-family: var(--app-font-stack) !important;
  font-size: 0.85rem !important;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - 16px);
}

.cm-panel.cm-search [name=close]{
  font-size: 1.2rem !important;
  right: 8px !important;
}

/* Search / replace text fields */
.cm-panel .cm-textfield {
  background: var(--app-bg-primary) !important;
  color: var(--component-text-primary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  padding: 5px 10px !important;
  font-size: 0.85rem !important;
  font-family: var(--app-font-stack) !important;
  outline: none !important;
  transition: border-color 0.2s ease;
  min-width: 180px;
}
.cm-panel .cm-textfield:focus {
  border-color: var(--accent-color) !important;
  box-shadow: 0 0 0 2px var(--accent-color-bg);
}

/* Action buttons (Find Next, Prev, Replace, etc.) */
.cm-panel .cm-button {
  background-image: none !important;
  background: var(--component-bg) !important;
  color: var(--component-text-primary) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 6px !important;
  font-size: 0.8rem !important;
  font-family: var(--app-font-stack) !important;
  padding: 4px 10px !important;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  white-space: nowrap;
  touch-action: manipulation;
  text-transform: capitalize;
}
.cm-panel .cm-button:hover {
  background: var(--component-bg-hover) !important;
  border-color: var(--accent-color) !important;
}
.cm-panel .cm-button:active {
  background: var(--component-bg-active) !important;
}

/* Option checkboxes (case, word, regex) */
.cm-panel label {
  font-family: var(--app-font-stack) !important;
  font-size: 0.8rem !important;
  color: var(--component-text-secondary) !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin-left: .5rem!important;
  cursor: pointer;
  user-select: none;
}
.cm-panel input[type="checkbox"] {
  accent-color: var(--accent-color);
  width: 16px;
  height: 16px;
  cursor: pointer;
  margin: 0;
}

/* ── Search Match Highlighting ────────────────── */
.cm-searchMatch {
  background: color-mix(in srgb, var(--accent-color) 28%, transparent) !important;
  outline: 1px solid color-mix(in srgb, var(--accent-color) 48%, transparent) !important;
}
.cm-searchMatch.cm-searchMatch-selected {
  background: color-mix(in srgb, var(--accent-color) 50%, transparent) !important;
  outline: 2px solid var(--accent-color) !important;
}

</style>
