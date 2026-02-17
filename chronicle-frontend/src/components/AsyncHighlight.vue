<template>
  <pre class="syntax-highlight" :style="styleObject" ref="innerHighlightLayer"><span v-for="(part, idx) in highlightedParts" :key="idx" v-html="part"></span></pre>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'


const props = defineProps<{
  code: string
  language: string
  styleObject?: Record<string, any>
  segmentSize?: number // 每段多少行
  highlightLayer?: any
}>()

const highlightedParts = ref<string[]>([])

// highlightLayer 兼容父组件传入的 ref 或内部自建
const innerHighlightLayer = ref<HTMLElement | null>(null)
defineExpose({ highlightDom: innerHighlightLayer })

// 语法高亮规则（内置，支持多语言，按字母序排列，plain在最后）
const syntaxRules: Record<string, Array<{ pattern: RegExp; className: string }>> = {
  c: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|NULL)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[ulULfF]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  cpp: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char16_t|char32_t|class|compl|const|constexpr|const_cast|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|nullptr)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[ulULfF]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  css: [
    { pattern: /\/\*([\s\S]*?)\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b([a-z-]+)(?=\s*:)/gi, className: 'property' },
    { pattern: /#[0-9a-fA-F]{3,6}\b/g, className: 'color' },
    { pattern: /\.[a-zA-Z_][\w-]*/g, className: 'selector' },
    { pattern: /:[a-zA-Z-]+/g, className: 'selector' },
    { pattern: /\b\d+\.?\d*(px|em|rem|%)?\b/g, className: 'number' }
  ],
  html: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /<\/?[a-zA-Z][^\s>]*\b/g, className: 'tag' },
    { pattern: /\b(class|id|style|src|href|alt|title|type|value|name|rel|for|onclick|onchange|oninput|onfocus|onblur|checked|disabled|readonly|required|selected|multiple|placeholder|action|method|target|enctype|accept|autocomplete|autofocus|form|list|max|min|pattern|step|size|width|height|rows|cols|wrap|spellcheck|tabindex|accesskey|contenteditable|draggable|hidden|lang|translate|dir|data-[\w-]+)\b/g, className: 'attribute' }
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
  javascript: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[lf]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  json: [
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(true|false|null)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[:,]/g, className: 'operator' }
  ],
  katex: [
    { pattern: /(\%.*$)/gm, className: 'comment' },
    { pattern: /[_+\-*/%=^&|]/g, className: 'katexoperator' },
    { pattern: /\\[a-zA-Z]+(?![a-zA-Z])/g, className: 'katexcommand' },
    { pattern: /\\[^a-zA-Z]/g, className: 'katexcommand' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'katexnumber' },
    { pattern: /[{}[\]()]/g, className: 'katexbracket' },
  ],
  markdown: [
    { pattern: /^\s{0,3}(#{1,6})\s+(.*)$/gm, className: 'header' },
    { pattern: /\*\*(.*?)\*\*/g, className: 'bold' },
    { pattern: /\*(.*?)\*/g, className: 'italic' },
    { pattern: /`([^`]+)`/g, className: 'inline-code' },
    { pattern: /^>\s+(.*)$/gm, className: 'quote' },
    { pattern: /^\s*[-*+]\s+/gm, className: 'list' },
    { pattern: /\[(.*?)\]\((.*?)\)/g, className: 'link' }
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
  typescript: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor|interface|type|enum|namespace|module|declare|abstract|implements|private|public|protected|readonly)\b/g, className: 'keyword' },
    { pattern: /\b(string|number|boolean|object|any|void|never|unknown|Array|Promise|Date|RegExp)\b/g, className: 'type' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[lf]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' }
  ],
  apache: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(Listen|ServerName|DocumentRoot|LoadModule|ProxyPass|ProxyPassReverse|ErrorLog|CustomLog|DirectoryIndex)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' }
  ],
  bash: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\$\w+|\${[^}]+}/g, className: 'variable' },
    { pattern: /\b(if|then|else|fi|for|in|do|done|case|esac|function|return)\b/g, className: 'keyword' }
  ],
  dockerfile: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|WORKDIR|USER)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' }
  ],
  git: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(commit|push|pull|merge|rebase|checkout|branch|tag|clone)\b/gi, className: 'keyword' }
  ],
  go: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(package|import|func|var|const|type|struct|interface|map|range|return|if|else|for|go|select|case|defer)\b/g, className: 'keyword' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' }
  ],
  ini: [
    { pattern: /;.*/g, className: 'comment' },
    { pattern: /\[[^\]]+\]/g, className: 'section' },
    { pattern: /\b[\w.-]+(?=\s*=)/g, className: 'attribute' },
    { pattern: /=/g, className: 'operator' }
  ],
  kotlin: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(class|fun|val|var|if|else|for|while|when|object|interface|package|import|return|is|in|null)\b/g, className: 'keyword' }
  ],
  less: [
    { pattern: /\/\*([\s\S]*?)\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\.[a-zA-Z_][\w-]*/g, className: 'selector' }
  ],
  lua: [
    { pattern: /--.*$/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|local|if|then|else|elseif|end|for|in|do|while|repeat|until|return)\b/g, className: 'keyword' }
  ],
  matlab: [
    { pattern: /%.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|end|if|else|for|while|switch|case|otherwise|return)\b/gi, className: 'keyword' }
  ],
  nginx: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(server|location|listen|proxy_pass|root|index|server_name|error_page|access_log|try_files)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' }
  ],
  php: [
    { pattern: /(\/\*?[\s\S]*?\*?\/)/g, className: 'comment' },
    { pattern: /(<\?php[\s\S]*?\?>)/g, className: 'string' },
    { pattern: /\b(function|echo|print|return|if|else|foreach|as|class|public|private|protected|namespace|use|new)\b/gi, className: 'keyword' }
  ],
  powershell: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|param|return|if|else|elseif|foreach|for|while|switch|break|continue)\b/gi, className: 'keyword' },
    { pattern: /[A-Za-z]+-[A-Za-z]+/g, className: 'cmdlet' }
  ],
  r: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|if|else|for|while|repeat|in|next|break|return)\b/gi, className: 'keyword' }
  ],
  react: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|class|extends|import|export|from|JSX)\b/g, className: 'keyword' }
  ],
  ruby: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(def|class|module|end|if|else|elsif|do|while|until|for|in|return)\b/g, className: 'keyword' }
  ],
  rust: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(fn|let|mut|pub|impl|trait|struct|enum|match|use|crate|mod|unsafe|async|await|move|ref|return)\b/g, className: 'keyword' }
  ],
  scss: [
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b([a-z-]+)(?=\s*:)/gi, className: 'property' }
  ],
  sql: [
    { pattern: /--.*$/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|IS|IN|CREATE|TABLE|ALTER|DROP)\b/gi, className: 'keyword' }
  ],
  swift: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(func|let|var|if|else|for|in|while|return|class|struct|enum|protocol|extension|import)\b/g, className: 'keyword' }
  ],
  toml: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\[[^\]]+\]/g, className: 'section' },
    { pattern: /=/g, className: 'operator' }
  ],
  vue: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /<\/?[a-zA-Z][^>]*>/g, className: 'tag' }
  ],
  xml: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /<\/?[a-zA-Z][^>]*>/g, className: 'tag' },
    { pattern: /\b([a-zA-Z-]+)(?=\=)/g, className: 'attribute' }
  ],
  yaml: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b[\w-]+(?=\:)/g, className: 'attribute' },
    { pattern: /\b(true|false|null)\b/g, className: 'boolean' }
  ],
  mermaid: [
    { pattern: /^%%.*$/g, className: 'comment' },
    { pattern: /%%\{[\s\S]*?\}%%/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(class|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|erDiagram|pie|journey|subgraph|end|click|classDef|style|linkStyle|note|activate|deactivate|loop|alt|opt|par|rect|section|today|axis|direction|LR|TB|TD)\b/gi, className: 'keyword' },
    { pattern: /(-->|->|---|==>|===|<--|<-)/g, className: 'operator' },
    { pattern: /\[[^\]]*\]|\([^\)]*\)/g, className: 'bracket' }
  ],
  basic: [
    { pattern: /'.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(PRINT|LET|IF|THEN|ELSE|FOR|TO|STEP|NEXT|GOTO|GOSUB|RETURN|DIM|REM|END|FUNCTION|SUB|WHILE|WEND|AND|OR|NOT|MOD)\b/gi, className: 'keyword' },
    { pattern: /\b\d+\b/g, className: 'number' },
    { pattern: /[+\-*/=<>]/g, className: 'operator' }
  ],
  vb: [
    { pattern: /'[^\n]*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(If|Then|Else|ElseIf|End If|For|Each|Next|While|Wend|Function|Sub|Dim|As|Set|Let|Return|Select|Case|Do|Loop|And|Or|Not|Is|Mod|Private|Public|Friend|End)\b/gi, className: 'keyword' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[+\-*/=<>]/g, className: 'operator' }
  ],
  plain: []
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
  // 统一换行符，消除异常换行影响
  const normalizedCode = props.code.replace(/\r\n|\r/g, '\n')
  const lines = normalizedCode.split('\n')
  highlightedParts.value = await Promise.all(
    lines.map(async (line) => {
      const part = await highlightSegment(line, props.language)
      return part + '<br>'
    })
  )
}

async function highlightSegment(segment: string, language: string) {
  // 可直接用同步高亮逻辑
  if (!segment || language === 'plain') return escapeHtml(segment).replace(/\n/g, '<br>')
  // 允许 mermaid 使用规则高亮（已在 syntaxRules 中定义）
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
  // 将换行符替换为<br>，以便在高亮层中正确显示换行
  highlighted = highlighted.replace(/\n/g, '<br>')
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
  /* pointer-events: none; 允许高亮层可滚动 */
  white-space: pre-wrap;
  word-wrap: break-word;
  tab-size: 2;
  vertical-align: top;
}
</style>
