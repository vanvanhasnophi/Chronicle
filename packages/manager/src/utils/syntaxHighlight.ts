/**
 * Chronicle — Shared Syntax Highlighting Engine
 *
 * Regex-based syntax highlighter supporting ~40 languages.
 * Used by: AsyncHighlight.vue (CodeChunk, MathTooltip), MarkdownItPreview.vue (code blocks)
 *
 * For math tooltip, use language "katex" — highlights TeX commands, brackets, operators.
 */

function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ═══════════════════════════════════════════════════════════
//  Language Rules (alphabetical, "plain" at end)
// ═══════════════════════════════════════════════════════════

const syntaxRules: Record<string, Array<{ pattern: RegExp; className: string }>> = {
  apache: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(Listen|ServerName|DocumentRoot|LoadModule|ProxyPass|ProxyPassReverse|ErrorLog|CustomLog|DirectoryIndex)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
  ],
  bash: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\$\w+|\${[^}]+}/g, className: 'variable' },
    { pattern: /\b(if|then|else|fi|for|in|do|done|case|esac|function|return)\b/g, className: 'keyword' },
  ],
  basic: [
    { pattern: /'.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(PRINT|LET|IF|THEN|ELSE|FOR|TO|STEP|NEXT|GOTO|GOSUB|RETURN|DIM|REM|END|FUNCTION|SUB|WHILE|WEND|AND|OR|NOT|MOD)\b/gi, className: 'keyword' },
    { pattern: /\b\d+\b/g, className: 'number' },
    { pattern: /[+\-*/=<>]/g, className: 'operator' },
  ],
  c: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|NULL)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[ulULfF]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' },
  ],
  cpp: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char16_t|char32_t|class|compl|const|constexpr|const_cast|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|nullptr)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[ulULfF]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' },
  ],
  css: [
    { pattern: /\/\*([\s\S]*?)\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b([a-z-]+)(?=\s*:)/gi, className: 'property' },
    { pattern: /#[0-9a-fA-F]{3,6}\b/g, className: 'color' },
    { pattern: /\.[a-zA-Z_][\w-]*/g, className: 'selector' },
    { pattern: /:[a-zA-Z-]+/g, className: 'selector' },
    { pattern: /\b\d+\.?\d*(px|em|rem|%)?\b/g, className: 'number' },
  ],
  dockerfile: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|WORKDIR|USER)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
  ],
  git: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(commit|push|pull|merge|rebase|checkout|branch|tag|clone)\b/gi, className: 'keyword' },
  ],
  go: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(package|import|func|var|const|type|struct|interface|map|range|return|if|else|for|go|select|case|defer)\b/g, className: 'keyword' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
  ],
  html: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /<\/?[a-zA-Z][^\s>]*\b/g, className: 'tag' },
    { pattern: /\b(class|id|style|src|href|alt|title|type|value|name|rel|for|onclick|onchange|oninput|onfocus|onblur|checked|disabled|readonly|required|selected|multiple|placeholder|action|method|target|enctype|accept|autocomplete|autofocus|form|list|max|min|pattern|step|size|width|height|rows|cols|wrap|spellcheck|tabindex|accesskey|contenteditable|draggable|hidden|lang|translate|dir|data-[\w-]+)\b/g, className: 'attribute' },
  ],
  ini: [
    { pattern: /;.*/g, className: 'comment' },
    { pattern: /\[[^\]]+\]/g, className: 'section' },
    { pattern: /\b[\w.-]+(?=\s*=)/g, className: 'attribute' },
    { pattern: /=/g, className: 'operator' },
  ],
  java: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while)\b/g, className: 'keyword' },
    { pattern: /\b(true|false)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[fdl]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' },
  ],
  javascript: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor)\b/g, className: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[lf]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' },
  ],
  json: [
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(true|false|null)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[:,]/g, className: 'operator' },
  ],
  katex: [
    { pattern: /(\%.*$)/gm, className: 'comment' },
    { pattern: /[_+\-*/%=^&|]/g, className: 'katexoperator' },
    { pattern: /\\[a-zA-Z]+(?![a-zA-Z])/g, className: 'katexcommand' },
    { pattern: /\\[^a-zA-Z]/g, className: 'katexcommand' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'katexnumber' },
    { pattern: /[{}[\]()]/g, className: 'katexbracket' },
  ],
  kotlin: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(class|fun|val|var|if|else|for|while|when|object|interface|package|import|return|is|in|null)\b/g, className: 'keyword' },
  ],
  less: [
    { pattern: /\/\*([\s\S]*?)\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\.[a-zA-Z_][\w-]*/g, className: 'selector' },
  ],
  lua: [
    { pattern: /--.*$/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|local|if|then|else|elseif|end|for|in|do|while|repeat|until|return)\b/g, className: 'keyword' },
  ],
  markdown: [
    { pattern: /^\s{0,3}(#{1,6})\s+(.*)$/gm, className: 'header' },
    { pattern: /\*\*(.*?)\*\*/g, className: 'bold' },
    { pattern: /\*(.*?)\*/g, className: 'italic' },
    { pattern: /`([^`]+)`/g, className: 'inline-code' },
    { pattern: /^>\s+(.*)$/gm, className: 'quote' },
    { pattern: /^\s*[-*+]\s+/gm, className: 'list' },
    { pattern: /\[(.*?)\]\((.*?)\)/g, className: 'link' },
  ],
  matlab: [
    { pattern: /%.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|end|if|else|for|while|switch|case|otherwise|return)\b/gi, className: 'keyword' },
  ],
  mermaid: [
    { pattern: /^%%.*$/g, className: 'comment' },
    { pattern: /%%\{[\s\S]*?\}%%/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(class|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|erDiagram|pie|journey|subgraph|end|click|classDef|style|linkStyle|note|activate|deactivate|loop|alt|opt|par|rect|section|today|axis|direction|LR|TB|TD)\b/gi, className: 'keyword' },
    { pattern: /(-->|->|---|==>|===|<--|<-)/g, className: 'operator' },
    { pattern: /\[[^\]]*\]|\([^\)]*\)/g, className: 'bracket' },
  ],
  nginx: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b(server|location|listen|proxy_pass|root|index|server_name|error_page|access_log|try_files)\b/gi, className: 'keyword' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
  ],
  php: [
    { pattern: /(\/\*?[\s\S]*?\*?\/)/g, className: 'comment' },
    { pattern: /(<\?php[\s\S]*?\?>)/g, className: 'string' },
    { pattern: /\b(function|echo|print|return|if|else|foreach|as|class|public|private|protected|namespace|use|new)\b/gi, className: 'keyword' },
  ],
  powershell: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|param|return|if|else|elseif|foreach|for|while|switch|break|continue)\b/gi, className: 'keyword' },
    { pattern: /[A-Za-z]+-[A-Za-z]+/g, className: 'cmdlet' },
  ],
  python: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /(["']{3}[\s\S]*?["']{3}|(["'])(?:(?!\2).)*\2)/g, className: 'string' },
    { pattern: /\b(def|class|if|elif|else|for|while|break|continue|return|try|except|finally|with|as|import|from|pass|raise|in|is|not|and|or|lambda|yield|assert|del|global|nonlocal|print)\b/g, className: 'keyword' },
    { pattern: /\b(True|False|None)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|]/g, className: 'operator' },
  ],
  r: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(function|if|else|for|while|repeat|in|next|break|return)\b/gi, className: 'keyword' },
  ],
  react: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|class|extends|import|export|from|JSX)\b/g, className: 'keyword' },
  ],
  ruby: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(def|class|module|end|if|else|elsif|do|while|until|for|in|return)\b/g, className: 'keyword' },
  ],
  rust: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(fn|let|mut|pub|impl|trait|struct|enum|match|use|crate|mod|unsafe|async|await|move|ref|return)\b/g, className: 'keyword' },
  ],
  scss: [
    { pattern: /\/\*[\s\S]*?\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b([a-z-]+)(?=\s*:)/gi, className: 'property' },
  ],
  sql: [
    { pattern: /--.*$/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP BY|ORDER BY|LIMIT|OFFSET|AS|AND|OR|NOT|NULL|IS|IN|CREATE|TABLE|ALTER|DROP)\b/gi, className: 'keyword' },
  ],
  swift: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(func|let|var|if|else|for|in|while|return|class|struct|enum|protocol|extension|import)\b/g, className: 'keyword' },
  ],
  toml: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\[[^\]]+\]/g, className: 'section' },
    { pattern: /=/g, className: 'operator' },
  ],
  typescript: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /(["'`])(?:(?!(\\|\1)).|\\.)*(\\|\1)/g, className: 'string' },
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor|interface|type|enum|namespace|module|declare|abstract|implements|private|public|protected|readonly)\b/g, className: 'keyword' },
    { pattern: /\b(string|number|boolean|object|any|void|never|unknown|Array|Promise|Date|RegExp)\b/g, className: 'type' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'boolean' },
    { pattern: /\b\d+\.?\d*(e[+-]?\d+)?[lf]?\b/gi, className: 'number' },
    { pattern: /[{}[\]()]/g, className: 'bracket' },
    { pattern: /[+\-*/%=<>!&|?:.]/g, className: 'operator' },
  ],
  vb: [
    { pattern: /'[^\n]*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(If|Then|Else|ElseIf|End If|For|Each|Next|While|Wend|Function|Sub|Dim|As|Set|Let|Return|Select|Case|Do|Loop|And|Or|Not|Is|Mod|Private|Public|Friend|End)\b/gi, className: 'keyword' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[+\-*/=<>]/g, className: 'operator' },
  ],
  vue: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /<\/?[a-zA-Z][^>]*>/g, className: 'tag' },
  ],
  xml: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /<\/?[a-zA-Z][^>]*>/g, className: 'tag' },
    { pattern: /\b([a-zA-Z-]+)(?=\=)/g, className: 'attribute' },
  ],
  yaml: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /\b[\w-]+(?=\:)/g, className: 'attribute' },
    { pattern: /\b(true|false|null)\b/g, className: 'boolean' },
  ],
  plain: [],
}

// Language aliases
const ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  kt: 'kotlin',
  ps1: 'powershell',
  docker: 'dockerfile',
  txt: 'plain',
  text: 'plain',
}

function resolveLang(lang: string): string {
  const lower = (lang || 'plain').toLowerCase().trim()
  return ALIASES[lower] || lower
}

/**
 * Highlight a single line of code for a given language.
 * Returns HTML string with <span class="..."> wrappers.
 */
export function highlightLine(line: string, language: string): string {
  if (!line || language === 'plain') return escapeHtml(line)

  const lang = resolveLang(language)
  const rules = syntaxRules[lang] || []
  let highlighted = line
  const placeholders: string[] = []
  let idx = 0

  for (const rule of rules) {
    highlighted = highlighted.replace(rule.pattern, (match) => {
      const ph = `__HL_${idx}__`
      placeholders[idx] = `<span class="${rule.className}">${escapeHtml(match)}</span>`
      idx++
      return ph
    })
  }

  highlighted = escapeHtml(highlighted)
  for (let i = 0; i < idx; i++) {
    highlighted = highlighted.replace(`__HL_${i}__`, placeholders[i])
  }

  return highlighted
}

/**
 * Highlight multi-line code for a given language.
 * Returns HTML string with <br> line separators.
 */
export function highlightCode(code: string, language: string): string {
  if (!code) return ''
  const normalized = code.replace(/\r\n|\r/g, '\n')
  const lines = normalized.split('\n')
  return lines.map(line => highlightLine(line, language)).join('<br>')
}

/**
 * Get all supported language names (including aliases).
 */
export function supportedLanguages(): string[] {
  return [...Object.keys(syntaxRules), ...Object.keys(ALIASES)]
}
