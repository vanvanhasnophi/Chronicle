<template>
  <pre class="syntax-highlight" :style="styleObject" ref="highlightLayer"><span v-for="(part, idx) in highlightedParts" :key="idx" v-html="part"></span><br /></pre>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  code: string
  language: string
  styleObject?: Record<string, any>
  segmentSize?: number // 每段多少行
}>()

const highlightedParts = ref<string[]>([])
const highlightLayer = ref<HTMLElement>()

// 语法高亮规则（内置，支持多语言）
const syntaxRules: Record<string, Array<{ pattern: RegExp; className: string }>> = {
  javascript: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[lf]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  python: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /(["']{3}[\s\S]*?["']{3}|(["'])(?:(?!\2).)*\2)/g, className: 'string' },
    { pattern: /\b(def|class|if|elif|else|for|while|break|continue|return|try|except|finally|with|as|import|from|pass|raise|in|is|not|and|or|lambda|yield|assert|del|global|nonlocal|print)\b/g, className: 'keyword' },
    { pattern: /\b(True|False|None)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|]/g, className: 'operator' }
  ],
  java: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\b/g, className: 'keyword' },
    { pattern: /\b(true|false)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[fdl]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  plain: []
  // ...可继续补充其他语言
}

function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// 简单高亮规则（可复用原有规则）
async function asyncHighlight() {
  const lines = props.code.split('\n')
  const size = props.segmentSize || 30
  highlightedParts.value = []
  for (let i = 0; i < lines.length; i += size) {
    const segment = lines.slice(i, i + size).join('\n')
    const part = await highlightSegment(segment, props.language)
    highlightedParts.value.push(part)
    await nextTick() // 让 UI 有机会渲染
  }
}

async function highlightSegment(segment: string, language: string) {
  // 可直接用同步高亮逻辑
  if (!segment || language === 'plain') return escapeHtml(segment)
  const rules = syntaxRules[language] || []
  let highlighted = segment
  const placeholders: string[] = []
  let placeholderIndex = 0
  rules.forEach((rule: { pattern: RegExp; className: string }) => {
    highlighted = highlighted.replace(rule.pattern, (match) => {
      const placeholder = `__HIGHLIGHT_${placeholderIndex}__`
      placeholders[placeholderIndex] = `<span class=\"${rule.className}\">${escapeHtml(match)}</span>`
      placeholderIndex++
      return placeholder
    })
  })
  highlighted = escapeHtml(highlighted)
  placeholders.forEach((replacement, index) => {
    const placeholder = `__HIGHLIGHT_${index}__`
    highlighted = highlighted.replace(escapeHtml(placeholder), replacement)
  })
  return highlighted
}

watch(() => [props.code, props.language], async () => {
  await asyncHighlight()
}, { immediate: true })
</script>

<style scoped>
.syntax-highlight {
  /* 继承原样式 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  color: #d4d4d4;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.3em;
  overflow: auto;
  pointer-events: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  tab-size: 2;
  vertical-align: top;
}
</style>
