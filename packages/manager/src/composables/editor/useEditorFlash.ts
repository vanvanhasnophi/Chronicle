/**
 * useEditorFlash — CodeMirror 行闪烁高亮（纯视觉，slide/article 通用）
 *
 * flashCMLines(view, fromLine, toLine?):
 *   - 单行：flashCMLines(view, line)
 *   - 多行：flashCMLines(view, fromLine, toLine)
 * 实现：遍历区间 .cm-line → style.background 瞬亮 → transition 1s 渐隐 → 1.1s 后清理
 */

import type { EditorView } from '@codemirror/view'

export function flashCMLines(view: EditorView, fromLine: number, toLine?: number) {
  const end = toLine ?? fromLine
  for (let i = fromLine; i <= end; i++) {
    if (i < 1 || i > view.state.doc.lines) continue
    const pos = view.state.doc.line(i).from
    const dom = findCMLine(view, pos)
    if (dom) flashDom(dom)
  }
}

/** 从 position 追溯到 .cm-line DOM 元素 */
function findCMLine(view: EditorView, pos: number): HTMLElement | null {
  let el: Node | null = view.domAtPos(pos).node
  while (el && el !== view.dom) {
    if (el instanceof HTMLElement && el.classList.contains('cm-line')) return el
    el = el.parentElement
  }
  return null
}

/** 单个 DOM 元素闪烁 */
function flashDom(dom: HTMLElement) {
  dom.style.transition = 'background 1s ease-out'
  dom.style.background = 'var(--component-bg-accent-blur, rgba(59,130,246,.2))'
  requestAnimationFrame(() => {
    dom.style.background = 'transparent'
  })
  setTimeout(() => {
    dom.style.background = ''
    dom.style.transition = ''
  }, 1100)
}
