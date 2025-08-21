// highlight-util.ts
// 复用 CodeChunk 里的高亮规则和 escapeHtml

export const syntaxRules: Record<string, Array<{ pattern: RegExp; className: string }>> = {
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
  plain: []
  // ...可补充其他语言
}

export function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
