// Defer importing KaTeX to runtime to avoid blocking initial bundle parsing.
let _katex: any = null
import { Icons } from './icons'

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
}

export interface ContentBlock {
  type: 'text' | 'code' | 'table' | 'heading' | 'list' | 'quote' | 'hr' | 'paraWithBackslash' | 'para-backslash' | 'softBreakPara' | 'math';
  content: string;
  language?: string;
  header?: string[];
  body?: string[][];
  start?: number;
  end?: number;
  raw?: string;
}

// 处理粗体、斜体、粗斜体，isHeading为true时只处理斜体
export function processEmphasis(text: string, isHeading = false): string {
  let processed = text

  // 0. Placeholder for HTML tags, escaped dollar signs AND escaped brackets
  const PLACEHOLDER_HTML_TAG = (id: string) => `___HTML_TAG_${id}___`
  const PLACEHOLDER_ESCAPED_DOLLAR = '___ESCAPED_DOLLAR___'
  const PLACEHOLDER_ESCAPED_LBRACKET = '___ESCAPED_LBRACKET___'
  const PLACEHOLDER_ESCAPED_RBRACKET = '___ESCAPED_RBRACKET___'
  
  const htmlTagMatches: string[] = []
  
  // Protect HTML tags from markdown processing (e.g. underscores in attributes)
  processed = processed.replace(/<[^>]+>/g, (match) => {
      const id = htmlTagMatches.length.toString()
      htmlTagMatches.push(match)
      return PLACEHOLDER_HTML_TAG(id)
  })

  processed = processed.replace(/\\\$/g, PLACEHOLDER_ESCAPED_DOLLAR)
  processed = processed.replace(/\\\\\[/g, PLACEHOLDER_ESCAPED_LBRACKET)
  processed = processed.replace(/\\\\\]/g, PLACEHOLDER_ESCAPED_RBRACKET)

  // 1. Block Math \[ ... \] (inline occurrence) - produce a lightweight placeholder
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex) => {
    const uniqueId = `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return `<div class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="block" data-unique-id="${uniqueId}"></div>`
  })

  // 2. Inline Math $$ ... $$ - produce placeholder
  processed = processed.replace(/\$\$((?:[^\n]|\n)+?)\$\$/g, (_match, tex) => {
    const uniqueId = `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return `<span class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline" data-unique-id="${uniqueId}"></span>`
  })

  // 3. Inline Math \( ... \) - produce placeholder
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_match, tex) => {
    const uniqueId = `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return `<span class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline" data-unique-id="${uniqueId}"></span>`
  })

  // 4. Inline Math $ ... $ - produce placeholder
  processed = processed.replace(/\$((?:[^$\n]|)+?)\$/g, (_match, tex) => {
    if (!tex.trim()) return _match;
    const uniqueId = `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return `<span class="katex-placeholder katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline" data-unique-id="${uniqueId}"></span>`
  })
  
  // 5. Restore escaped dollars and brackets
  processed = processed.replace(new RegExp(PLACEHOLDER_ESCAPED_DOLLAR, 'g'), '$')
  processed = processed.replace(new RegExp(PLACEHOLDER_ESCAPED_LBRACKET, 'g'), '\\[')
  processed = processed.replace(new RegExp(PLACEHOLDER_ESCAPED_RBRACKET, 'g'), '\\]')

  // Restore HTML tags BEFORE markdown link/image processing? 
  // No, actually if we restore HTML tags now, subsequent regex (like Bold/Italic) might mess them up if we didn't disable _ for italic.
  
  // Wait, I already disabled _ for italic in the previous tool call. 
  // But strictly speaking, we generally want to restore HTML *after* markdown processing so that markdown regex doesn't match inside HTML attributes.
  // HOWEVER, for things like Images/Links, sometimes people put HTML inside?
  
  // Let's restore at the VERY END.
  
  if (!isHeading) {
    // 图片 ![alt](url)
    processed = processed.replace(/!\[([^\]]*?)\]\((.*?)\)/g, (_match, alt, url) => {
        const safeAlt = escapeAttr(alt)
        const captionHtml = safeAlt ? `<div class="md-image-caption">${safeAlt}</div>` : ''
        
        if (!url || url.trim() === '') {
            return `<div class="md-image-container">
                      <div class="md-image-wrapper placeholder">
                        <span class="md-placeholder-text">解析中</span>
                      </div>
                      ${captionHtml}
                    </div>`
        }
        return `<div class="md-image-container">
                  <div class="md-image-wrapper loading">
                    <img src="${url}" alt="${safeAlt}" class="md-image" />
                    <span class="md-placeholder-text">解析中</span>
                  </div>
                  ${captionHtml}
                </div>`
    })

    // 正在输入的图片语法 ![alt] (且后面没有跟着左括号)
    processed = processed.replace(/!\[([^\]]*?)\](?!\()/g, (_match, alt) => {
         const safeAlt = escapeAttr(alt)
         const captionHtml = safeAlt ? `<div class="md-image-caption">${safeAlt}</div>` : ''
         return `<div class="md-image-container">
                   <div class="md-image-wrapper placeholder">
                     <span class="md-placeholder-text">解析中</span>
                   </div>
                   ${captionHtml}
                 </div>`
    })
    
    // 链接 [text](url) -> 智能转换为文件卡片
    // 识别常见文件后缀，如果是媒体文件则渲染为卡片，否则保留默认链接样式
    processed = processed.replace(/\[([^\]]+?)\]\((.*?)\)/g, (match, text, url) => {
        const cleanUrl = url.trim()
        const extMatch = cleanUrl.match(/\.([0-9a-z]+)($|\?)/i)
        const ext = extMatch ? extMatch[1].toLowerCase() : ''
        
        // Define types
        let type = '', icon = ''
        
        // Audio
        if (['mp3','wav','ogg','m4a','flac','aac'].includes(ext)) {
            type = 'Audio'; icon = Icons.audio
        }
        // Video
        else if (['mp4','webm','mkv','mov','avi'].includes(ext)) {
            type = 'Video'; icon = Icons.video
        }
        // Doc
        else if (['pdf','doc','docx','ppt','pptx','xls','xlsx'].includes(ext)) {
            type = 'Document'; icon = Icons.document
        }
        // Code/Text
        else if (['txt','md','js','ts','json','c','cpp','py','java','html','css','vue','log','xml','yaml'].includes(ext)) {
            type = 'Code/Text'; icon = Icons.codeText
        }
        // Archive/Other (only if extension exists and it's likely a file link)
        else if (['zip','rar','7z','tar','gz'].includes(ext)) {
            type = 'Archive'; icon = Icons.archive
        }
        
        if (type) {
             const safeName = escapeAttr(text)
             const safeUrl = escapeAttr(cleanUrl)
             return `<div class="file-card" data-url="${safeUrl}" data-name="${safeName}" data-type="${type}">
                       <div class="file-card-icon">${icon}</div>
                       <div class="file-card-info">
                          <div class="file-name">${safeName}</div>
                          <div class="file-type">${type}</div>
                       </div>
                    </div>`
        }

        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="md-link">${text}</a>`
    })

    // 行内代码 `mono`
    processed = processed.replace(/`([^`]+?)`/g, '<code>$1</code>')
    // ***粗斜体***
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><i>$1</i></strong>')
    // processed = processed.replace(/___(.+?)___/g, '<strong><i>$1</i></strong>')
    // **粗体**
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>')
  }
  // *斜体*
  processed = processed.replace(/\*(.+?)\*/g, '<i>$1</i>')
  // processed = processed.replace(/_(.+?)_/g, '<i>$1</i>')
  
  // 6. Restore HTML tags
  htmlTagMatches.forEach((tag, index) => {
      processed = processed.replace(PLACEHOLDER_HTML_TAG(index.toString()), tag)
  })

  return processed
}

export function parseTableMarkdown(text: string): Array<{header: string[], body: string[][], raw: string, start: number, end: number}> {
  const results: Array<{header: string[], body: string[][], raw: string, start: number, end: number}> = [];
  const tableRegex = /((?:^\s*\|.*\|\s*\n)+)\s*([| :]*)\-+([| :\-]*)\n((?:\s*\|.*\|\s*\n?)*)/gm;
  let match;
  while ((match = tableRegex.exec(text)) !== null) {
    const [raw, headerRows, _beforeSep, _afterSep, bodyRows] = match;
    const headerLines = headerRows.trim().split(/\n/).filter(Boolean);
    const header = headerLines[headerLines.length - 1].replace(/^\||\|$/g, '').split('|').map((cell: string) => cell.trim());
    const body = bodyRows.split(/\n/).filter((row: string) => row.trim()).map((row: string) => {
      return row.trim().replace(/^\||\|$/g, '').split('|').map((cell: string) => cell.trim());
    });
    results.push({header, body, raw, start: match.index, end: match.index + raw.length});
  }
  return results;
}

// Server-like syntax highlighting rules (copied/adapted from Astro page)
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
    { pattern: /<\/?[a-zA-Z][^\s>]*\b/g, className: 'htmlTag' },
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
    { pattern: /\$\w+|\$\{[^}]+}/g, className: 'variable' },
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
    { pattern: /\b(class|fun|val|var|if|else|for|in|while|when|object|interface|package|import|return|is|in|null)\b/g, className: 'keyword' }
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
    { pattern: /(\/\*?[[\s\S]*?\]?\*?\/)/g, className: 'comment' },
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
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|new|this|super|static|get|set|constructor|interface|type|enum|namespace|module|declare|abstract|implements|private|public|protected|readonly)\b/g, className: 'keyword' }
  ],
  ruby: [
    { pattern: /#.*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(def|class|module|end|if|else|elsif|do|while|until|for|in|return)\b/gi, className: 'keyword' }
  ],
  rust: [
    { pattern: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(fn|let|mut|pub|impl|trait|struct|enum|match|use|crate|mod|unsafe|async|await|move|ref|return)\b/g, className: 'keyword' }
  ],
  scss: [
    { pattern: /\/\*([\s\S]*?)\*\//g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\.[a-zA-Z_][\w-]*/g, className: 'selector' }
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
    { pattern: /<\/?[a-zA-Z][^\>]*>/g, className: 'htmlTag' }
  ],
  xml: [
    { pattern: /<!--([\s\S]*?)-->/g, className: 'comment' },
    { pattern: /<\/?[a-zA-Z][^\>]*>/g, className: 'htmlTag' },
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
    { pattern: /'[^]*/g, className: 'comment' },
    { pattern: /("[^"]*"|'[^']*')/g, className: 'string' },
    { pattern: /\b(If|Then|Else|ElseIf|End If|For|Each|Next|While|Wend|Function|Sub|Dim|As|Set|Let|Return|Select|Case|Do|Loop|And|Or|Not|Is|Mod|Private|Public|Friend|End)\b/gi, className: 'keyword' },
    { pattern: /\b\d+\.?\d*\b/g, className: 'number' },
    { pattern: /[+\-*/=<>]/g, className: 'operator' }
  ],
  plain: []
}

function escapeHtmlText(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightCode(code: string, language: string): string {
  try {
    if (!code || !language || language === 'plain' || language === 'text' || !syntaxRules[language]) {
      return escapeHtmlText(code)
    }

    const rules = syntaxRules[language] || []
    let highlighted = code
    const placeholders: Array<{ index: number; replacement: string }> = []
    let placeholderIndex = 0

    rules.forEach((rule: { pattern: RegExp; className: string }) => {
      try {
        highlighted = highlighted.replace(rule.pattern, (match) => {
          const placeholder = `__HIGHLIGHT_${placeholderIndex}__`
          placeholders.push({ index: placeholderIndex, replacement: `<span class="${rule.className}">${escapeHtmlText(match)}</span>` })
          placeholderIndex++
          return placeholder
        })
      } catch (e) {
        // skip rule on failure
      }
    })

    highlighted = escapeHtmlText(highlighted)

    placeholders.forEach(({ index, replacement }) => {
      const placeholder = `__HIGHLIGHT_${index}__`
      highlighted = highlighted.replace(escapeHtmlText(placeholder), replacement)
    })

    return highlighted
  } catch (e) {
    return escapeHtmlText(code)
  }
}

export function parseMarkdown(content: string, cacheKey?: number): Array<ContentBlock> {
  // 先用convertToHtml的分段逻辑拆分
  const lines = content.split(/\n/)
  const blocks: ContentBlock[] = []
  let inCode = false
  let codeLang = ''
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 代码块
    if (/^\s*```(\w*)/.test(line)) {
      const langMatch = line.match(/^\s*```(\w*)/)
      if (inCode) {
        // 结束代码块
        inCode = false
        codeLang = ''
        i++
        continue
      } else {
        // 开始代码块
        inCode = true
        codeLang = langMatch && langMatch[1] ? langMatch[1] : ''
        let codeLines = []
        i++
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          codeLines.push(lines[i])
          i++
        }
        // 跳过结尾 ```
        if (i < lines.length && /^\s*```/.test(lines[i])) {
          inCode = false
          i++
        }
        blocks.push({ type: 'code', content: codeLines.join('\n'), language: codeLang })
        codeLang = ''
        continue
      }
    }

    // 公式块: \[ ... \] 或 $$ ... $$
    // 提高优先级：检测到开头后，持续读取直到检测到结尾，无视中间的空行或换行
    if (/^\s*(\\\[|\$\$)/.test(line)) {
      const isDoub = /^\s*\$\$/.test(line)
      const startRegex = isDoub ? /^\s*\$\$/ : /^\s*\\\[/
      const endStrict = isDoub ? /\$\$\s*$/ : /\\\]\s*$/
      const endRegex = isDoub ? /\$\$/ : /\\\]/

      let mathLines = []
      // 去掉开头的 \[ 或 $$
      let firstLineContent = line.replace(startRegex, '')
      if (firstLineContent.trim()) {
        mathLines.push(firstLineContent)
      }
      
      // 单行情况: \[ content \] 或 $$ content $$
      if (endStrict.test(firstLineContent)) {
         let content = firstLineContent.replace(endStrict, '')
         blocks.push({ type: 'math', content: content })
         i++
         continue
      }
      
      i++
      // 循环一直读到发现结束符所在的行
      while (i < lines.length) {
         const currentLine = lines[i]
         // 如果该行包含结束符
         if (endRegex.test(currentLine)) {
            break // 跳出循环，交给后面处理结束行
         }
         mathLines.push(currentLine)
         i++
      }

      // 处理结束行
      if (i < lines.length && endRegex.test(lines[i])) {
        let lastLine = lines[i]
        // 尝试移除末尾的结束符
        let contentBefore = lastLine.replace(endStrict, '')
        // 如果 replace 没起作用（说明结束符不在末尾？），强制截断
        if (contentBefore === lastLine) {
           const idx = lastLine.indexOf(isDoub ? '$$' : '\\]')
           if (idx !== -1) {
             contentBefore = lastLine.substring(0, idx)
           }
        }
        
        if (contentBefore.trim()) {
           mathLines.push(contentBefore)
        }
        i++
      }
      blocks.push({ type: 'math', content: mathLines.join('\n') })
      continue
    }

    // 新的段落换行逻辑：单反斜杠结尾合并为同一段落并用<br>换行，多反斜杠结尾分段并转义

    // 对quote类型完全忽略软换行逻辑
    if (!/^\s*> /.test(line)) {
      const bsMatchNew = line.match(/(\\+)$/)
      if (bsMatchNew && bsMatchNew.index === line.length - bsMatchNew[1].length) {
        const bsCount = bsMatchNew[1].length
        if (bsCount === 1 && (line.length === 1 || line[line.length-2] !== '\\')) {
          // 非引用块，原有软换行逻辑
          let paraLines = [line.slice(0, -1)]
          let j = i+1
          while (j < lines.length) {
            const nextLine = lines[j]
            // 遇到特殊块直接break，不合并
            if (
              /^\s*> /.test(nextLine) || // 引用
              /^\s*\|.*\|\s*$/.test(nextLine) || // 表格
              /^\s*```/.test(nextLine) || // 代码块
              /^\s*\\\[/.test(nextLine) || // 公式块 \[...\]
              /^([ \t]*)([-*]|\d+\.) /.test(nextLine) || // 列表
              /^\s*#{1,6} /.test(nextLine) || // 标题
              /^\[\[MARKDOWN_TABLE:/.test(nextLine) // 表格占位符
            ) {
              break
            }
            const nextMatch = nextLine.match(/(\\+)$/)
            if (nextMatch && nextMatch.index === nextLine.length - nextMatch[1].length && nextMatch[1].length === 1 && (nextLine.length === 1 || nextLine[nextLine.length-2] !== '\\')) {
              paraLines.push(nextLine.slice(0, -1))
              j++
            } else {
              break
            }
          }
          // 合并后如有非单反斜杠结尾行，且不是特殊块，合进去
          if (
            j < lines.length &&
            lines[j].trim() !== '' &&
            !/^\s*> /.test(lines[j]) &&
            !/^\s*\|.*\|\s*$/.test(lines[j]) &&
            !/^\s*```/.test(lines[j]) &&
            !/^\s*\\\[/.test(lines[j]) &&
            !/^([ \t]*)([-*]|\d+\.) /.test(lines[j]) &&
            !/^\s*#{1,6} /.test(lines[j]) &&
            !/^\[\[MARKDOWN_TABLE:/.test(lines[j])
          ) {
            paraLines.push(lines[j])
            j++
          }
          blocks.push({ type: 'softBreakPara', content: paraLines.join('<br>') })
          i = j
          continue
        } else if (bsCount >= 2) {
          // 多反斜杠结尾，转义为少一个反斜杠，分段
          blocks.push({ type: 'softBreakPara', content: line.slice(0, -1) })
          i++
          continue
        }
      }
    }
    // 支持标准markdown表格
    if (/^\s*\|.*\|\s*$/.test(line) && i+1 < lines.length && /^\s*\|?\s*[-:]+.*\|\s*$/.test(lines[i+1])) {
      // 收集表格所有行
      let tableLines = [line]
      let j = i+1
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        tableLines.push(lines[j])
        j++
      }
      // 解析表格
      const tableText = tableLines.join('\n') + '\n'
      const tables = parseTableMarkdown(tableText)
      if (tables.length > 0) {
        const { header, body } = tables[0]
        blocks.push({ type: 'table', content: tableText, header, body })
        i = j
        continue
      }
    }
    // 兼容[[MARKDOWN_TABLE:...]]
    if (/^\[\[MARKDOWN_TABLE:/.test(line)) {
      try {
        const { header, body } = JSON.parse(line.match(/^\[\[MARKDOWN_TABLE:(.*)\]\]$/)?.[1] || '{}')
        blocks.push({ type: 'table', content: line, header, body })
      } catch {
        blocks.push({ type: 'table', content: line })
      }
      i++
      continue
    }
    // 标题
    if (/^\s*#{1,6} /.test(line)) {
      blocks.push({ type: 'heading', content: line })
      i++
      continue
    }
    // 分割线：只匹配独立一行的 --- / *** / ___，避免和表格分隔线混淆
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr', content: line })
      i++
      continue
    }
    // 引用块递归解析（不解析代码块、表格、嵌套引用），不再处理软换行
    if (/^\s*> /.test(line)) {
      let quoteLines: string[] = [];
      let j = i;
      while (j < lines.length && /^\s*> /.test(lines[j])) {
        let curr = lines[j].replace(/^\s*>\s?/, '');
        quoteLines.push(curr);
        j++;
      }
      // 递归解析
      const quoteContent = quoteLines.join('\n');
      // @ts-ignore
      const innerBlocks = parseMarkdown(quoteContent, cacheKey)
        .filter(b => b.type !== 'code' && b.type !== 'table' && b.type !== 'quote');
      // @ts-ignore
      blocks.push({ type: 'quote', content: innerBlocks });
      i = j;
      continue;
    }
    // 列表（支持制表符、空格缩进多级，以及引用内列表）
    if (/^([ \t]*)([-*]|\d+\.) /.test(line) || /^\s*>\s*([-*]|\d+\.) /.test(line)) {
      let listLines = [line]
      let j = i+1
      while (j < lines.length && (/^([ \t]*)([-*]|\d+\.) /.test(lines[j]) || /^\s*>\s*([-*]|\d+\.) /.test(lines[j]))) {
        listLines.push(lines[j])
        j++
      }
      blocks.push({ type: 'list', content: listLines.join('\n') })
      i = j
      continue
    }
    // 单/多反斜杠结尾的行合并为paraWithBackslash段落
    const bsMatch = line.match(/(\\+)$/)
    if (bsMatch && bsMatch.index === line.length - bsMatch[1].length) {
      const bsCount = bsMatch[1].length
      if (bsCount === 1 && (line.length === 1 || line[line.length-2] !== '\\')) {
        let paraLines = [line]
        let j = i+1
        while (j < lines.length) {
          const nextLine = lines[j]
          const nextMatch = nextLine.match(/(\\+)$/)
          if (nextMatch && nextMatch.index === nextLine.length - nextMatch[1].length && nextMatch[1].length === 1 && (nextLine.length === 1 || nextLine[nextLine.length-2] !== '\\')) {
            paraLines.push(nextLine)
            j++
          } else {
            break
          }
        }
        blocks.push({ type: 'paraWithBackslash', content: paraLines.join('\n') })
        i = j
        continue
      } else if (bsCount >= 2) {
        blocks.push({ type: 'paraWithBackslash', content: line })
        i++
        continue
      }
    }
    // 普通无反斜杠文本行立即切段
    if (line.trim() !== '') {
      blocks.push({ type: 'text', content: line })
      i++
      continue
    }
    i++
  }
  if (typeof cacheKey === 'number') {
    return blocks.map(b => ({ ...b }))
  }
  return blocks
}

// 用自定义控件占位符替换表格，后续由TextEditor渲染MarkdownTable组件
export function convertToHtml(text: any, options?: { wrapBlocks?: boolean, locale?: string }): string {
    // 渲染每个段落
  // 新的段落换行与反斜杠处理逻辑
  function renderParaBlock(block: string) {
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(block)) {
      return '<hr />'
    }
    // 代码块、列表原样输出
    if (/^\s*```/.test(block) || /^\s*([-*]|\d+\.) /.test(block)) {
      return block
    }
    // 引用块特殊处理：行间只插入一次 quote-hard-break，避免多余换行
    if (/^\s*> /.test(block)) {
      const lines = block.split(/\n/)
      let html = ''
      for (let i = 0; i < lines.length; i++) {
        html += processEmphasis(lines[i]).replace(/\\/g, '&#92;')
        // 只在行间插入一次 quote-hard-break
        if (i === 0 && lines.length > 1) {
          html += '<span class="quote-hard-break"></span>'
        }
      }
      return `<div class=\"para-backslash\">${html}</div>`
    }
    // 表格占位符不渲染，交由TextEditor中的MarkdownTable组件渲染
    if (/^\[\[MARKDOWN_TABLE:/.test(block)) {
      return ''
    }
    // 标题渲染为<h1>-<h6>，仅支持斜体
    const headingMatch = block.match(/^\s*(#{1,6}) (.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = processEmphasis(headingMatch[2], true)
      return `<h${level}>${content}</h${level}>`
    }
    // 纯文本段落反斜杠换行与结束处理，并处理粗体/斜体/粗斜体
    // 优先处理 paraWithBackslash/softBreakPara 类型的 <br>，直接转为 <br> 标签
    // quote类型不处理软换行<br>
    if (block.includes('<br>') && !/^<blockquote/.test(block)) {
      // 先按 <br> 拆分，逐段 processEmphasis
      return `<div class=\"para-backslash\">${block.split('<br>').map(s => processEmphasis(s)).join('<br>')}</div>`;
    }
    // 引用块内硬换行插入特殊span
    const lines = block.split(/\n/)
    let html = ''
    let i = 0
    while (i < lines.length) {
      let line = lines[i]
      // 先处理markdown强调，再转义反斜杠，保证不会被误处理
      html += processEmphasis(line).replace(/\\/g, '&#92;')
      // quote block: 段落间插入更大行距
      if (i < lines.length - 1) html += '<span class="quote-hard-break"></span>'
      i++
    }
    return `<div class=\"para-backslash\">${html}</div>`
  }
  // 支持list/quote类型的block渲染
  function renderBlock(block: any): string {
    // Math Block
    if (block && block.type === 'math') {
      // Return a lightweight placeholder. Actual KaTeX rendering will be
      // performed later via `hydrateKatex` to avoid blocking initial loads.
      const uniqueId = `math-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      return `<div class="katex-placeholder katex-interactive" data-tex="${escapeAttr(block.content)}" data-type="block" data-unique-id="${uniqueId}"></div>`
    }
    // 递归渲染quote类型
    if (block && block.type === 'quote' && Array.isArray(block.content)) {
      const html = block.content.map(renderBlock).join('');
      return `<blockquote class='md-quote-block'>${html}</blockquote>`;
    }
    // 递归渲染list类型
    if (block && block.type === 'list') {
      const lines = block.content.split(/\n/).filter(Boolean)
      function renderList(lines: string[], level = 0): string {
        let html = ''
        let i = 0
        while (i < lines.length) {
          const line = lines[i]
          const match = line.match(/^([ \t]*)([-*]|\d+\.) (.*)$/)
          if (!match) { i++; continue }
          const indent = match[1].replace(/\t/g, '    ').length
          const content = processEmphasis(match[3])
          let subItems = []
          let j = i+1
          while (j < lines.length) {
            const next = lines[j]
            const nextMatch = next.match(/^([ \t]*)([-*]|\d+\.) (.*)$/)
            if (!nextMatch) break
            const nextIndent = nextMatch[1].replace(/\t/g, '    ').length
            if (nextIndent > indent) {
              subItems.push(next)
              j++
            } else if (nextIndent === indent) {
              break
            } else {
              break
            }
          }
          let subHtml = ''
          if (subItems.length) {
            subHtml = renderList(subItems, level+1)
          }
          html += `<li>${content}${subHtml}</li>`
          i = j
        }
        const isOrdered = lines.some(l => /^([ \t]*)\d+\. /.test(l))
        const tag = isOrdered ? 'ol' : 'ul'
        return `<${tag}>${html}</${tag}>`
      }
      return renderList(lines)
    }
    // Code block
    if (block && block.type === 'code') {
      const codeRaw = String(block.content || '')
      const codeEsc = escapeAttr(codeRaw)
      const lang = (block.language || '').trim() || 'plain'
      const safeLang = escapeAttr(lang)
      const lines = codeRaw.split('\n').length || 1
      const lineHeight = 20
      const height = Math.max(80, Math.min(360, lines * lineHeight + 24))

      const highlightedCodeHtml = highlightCode(codeRaw, lang)
      // Language display mapping (optional per-locale). If options.locale is not provided,
      // we will display the raw language value.
      const langLabelMaps: Record<string, Record<string, string>> = {
        'en': {
          apache: 'Apache', bash: 'Bash', basic: 'Basic', vb: 'VB', c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS',
          dockerfile: 'Dockerfile', git: 'Git', go: 'Go', html: 'HTML', ini: 'INI/Config', java: 'Java', javascript: 'JavaScript', json: 'JSON',
          katex: 'KaTeX', kotlin: 'Kotlin', less: 'LESS', lua: 'Lua', markdown: 'Markdown', matlab: 'MATLAB', mermaid: 'Mermaid', nginx: 'Nginx',
          php: 'PHP', powershell: 'PowerShell', python: 'Python', r: 'R', react: 'React/JSX', ruby: 'Ruby', rust: 'Rust', scss: 'SCSS',
          sql: 'SQL', swift: 'Swift', toml: 'TOML', typescript: 'TypeScript', vue: 'Vue', xml: 'XML', yaml: 'YAML', plain: 'Plain Text'
        },
        'zh-CN': {
          apache: 'Apache', bash: 'Bash', basic: 'Basic', vb: 'VB', c: 'C', cpp: 'C++', csharp: 'C#', css: 'CSS',
          dockerfile: 'Dockerfile', git: 'Git', go: 'Go', html: 'HTML', ini: 'INI/配置', java: 'Java', javascript: 'JavaScript', json: 'JSON',
          katex: 'KaTeX', kotlin: 'Kotlin', less: 'LESS', lua: 'Lua', markdown: 'Markdown', matlab: 'MATLAB', mermaid: 'Mermaid', nginx: 'Nginx',
          php: 'PHP', powershell: 'PowerShell', python: 'Python', r: 'R', react: 'React/JSX', ruby: 'Ruby', rust: 'Rust', scss: 'SCSS',
          sql: 'SQL', swift: 'Swift', toml: 'TOML', typescript: 'TypeScript', vue: 'Vue', xml: 'XML', yaml: 'YAML', plain: '纯文本'
        }
      }

      const locale = options && options.locale ? (options.locale === 'en' ? 'en' : 'zh-CN') : undefined
      const displayLabel = locale ? (langLabelMaps[locale]?.[lang] ?? lang) : lang

      const chunkHtml = `
        <div class="code-chunk-container">
          <div class="editor-header">
            <div class="header-left">
              <select class="language-selector transparent-select" title="${safeLang}" disabled style="font-family: var(--app-font-stack);">
                <option value="${safeLang}" selected>${escapeAttr(displayLabel)}</option>
              </select>
            </div>
            <div class="toolbar">
              <button class="icon-btn copy-btn" title="Copy" data-code="${escapeAttr(codeRaw)}">
                <svg class="copy-icon" width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"></rect><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect></svg>
                <svg class="success-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" style="display: none;"><path d="M4 10l3 3 9-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
              </button>
            </div>
          </div>
          <div class="editor-wrapper" style="height: ${height}px;">
            <div class="editor-content">
              <pre class="syntax-highlight" style="padding: 0.7rem 1.5rem 1.2rem 1.5rem; font-size: 13.5px; line-height: 1.3em; font-family: inherit; box-sizing: border-box;"><code>${highlightedCodeHtml}</code></pre>
              <textarea class="code-textarea" spellcheck="false" placeholder="" readonly >${escapeAttr(codeRaw)}</textarea>
            </div>
          </div>
          <div class="editor-footer" data-chars="${escapeAttr(String(codeRaw.length))}" data-lines="${lines}"><span><span class="code-stat-chars"></span> &nbsp;|&nbsp; <span class="code-stat-lines"></span></span></div>
        </div>
      `

      return `<div class="content-block" data-block-index="${block.start || 0}" data-type="code" data-language="${safeLang}">${chunkHtml}</div>`
    }
    // Table block -> render HTML table for published output
    if (block && block.type === 'table') {
      // If header/body provided, render semantic table
      if (block.header && Array.isArray(block.header)) {
        const th = block.header.map((h: string) => `<th>${escapeAttr(String(h))}</th>`).join('')
        const rows = (block.body || []).map((r: string[]) => `\n<tr>${r.map((c: string)=>`<td>${escapeAttr(String(c))}</td>`).join('')}</tr>`).join('')
        return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`
      }
      // Fallback: output raw content escaped
      return `<div class="md-table-raw">${escapeAttr(String(block.content || ''))}</div>`
    }
    // 其他类型走原有逻辑
    if (typeof block === 'string') return renderParaBlock(block)
    if (block && typeof block.content === 'string') return renderParaBlock(block.content)
    return ''
  }

  // 判断输入是markdown还是blocks
  let parsedBlocks: any[]
  if (typeof text === 'string') {
    parsedBlocks = parseMarkdown(text)
  } else if (Array.isArray(text)) {
    parsedBlocks = text
  } else {
    parsedBlocks = [text]
  }
  if (!options || !options.wrapBlocks) {
    return parsedBlocks.map(renderBlock).join('\n')
  }

  // Wrap blocks similarly to how MdParser.vue renders them so compiled HTML
  // matches the read-only preview structure (content-block wrappers, parsed-html-content).
  return parsedBlocks.map((block: any, idx: number) => {
    const html = renderBlock(block)
    // If block is an object with a type, we can decide wrapper style
    if (block && typeof block === 'object' && block.type === 'quote') {
      return `<div class="content-block text-block" data-block-index="${idx}">${html}</div>`
    }
    if (block && typeof block === 'object' && (block.type === 'code' || block.type === 'table')) {
      return `<div class="content-block" data-block-index="${idx}">${html}</div>`
    }
    // Default: text-like block wrapped with parsed-html-content
    return `<div class="content-block text-block" data-block-index="${idx}"><div class="parsed-html-content">${html}</div></div>`
  }).join('\n')
}

// Inject heading ids into an HTML string using a precomputed TOC.
export function injectHeadingIds(html: string, toc: Array<{id: string, text: string, level: number}>): string {
  if (!html || !Array.isArray(toc) || toc.length === 0) return html
  let i = 0
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (match, level, inner) => {
    if (i >= toc.length) return match
    const id = toc[i++].id || ''
    if (!id) return match
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
}

// Asynchronously hydrate KaTeX placeholders inside a container element.
export async function hydrateKatexIn(container: HTMLElement | null) {
  if (!container) return
  try {
    if (!_katex) {
      const mod = await import('katex')
      _katex = (mod && (mod as any).default) ? (mod as any).default : mod
    }
  } catch (e) {
    return
  }

  const placeholders = Array.from(container.querySelectorAll('.katex-placeholder')) as HTMLElement[]
  for (const ph of placeholders) {
    try {
      const tex = ph.getAttribute('data-tex') || ''
      const type = ph.getAttribute('data-type') || 'inline'
      const display = type === 'block'
      let html = ''
      try {
        html = _katex.renderToString(tex, { displayMode: display, throwOnError: false })
      } catch (err) {
        html = `<pre>${tex}</pre>`
      }
      const wrapper = document.createElement(display ? 'div' : 'span')
      if (display) wrapper.className = 'katex-display-wrapper katex-interactive'
      else wrapper.className = 'katex-inline-wrapper katex-interactive'
      wrapper.setAttribute('data-tex', tex)
      wrapper.setAttribute('data-type', type)
      wrapper.innerHTML = html
      ph.replaceWith(wrapper)
    } catch (e) {}
  }
}

export function blocksToMarkdown(blocks: ContentBlock[]): string {
  let md = '';
  for (const block of blocks) {
    switch (block.type) {
      case 'code':
        md += `\`\`\`${block.language || 'plain'}\n${block.content}\n\`\`\`\n\n`;
        break;
      case 'math':
        md += `\\[\n${block.content}\n\\]\n\n`;
        break;
      case 'table': {
        // 优先用header/body还原标准表格
        if (block.header && block.body) {
          const headerLine = '| ' + block.header.join(' | ') + ' |';
          const sepLine = '| ' + block.header.map(()=>'---').join(' | ') + ' |'; // separator line
          const bodyLines = block.body.map(row => '| ' + row.join(' | ') + ' |');
          md += [headerLine, sepLine, ...bodyLines].join('\n') + '\n\n';
        } else {
          md += (block.content || '') + '\n\n';
        }
        break;
      }
      case 'paraWithBackslash':
      case 'para-backslash':
      case 'softBreakPara': {
        let text = block.content;
        text = text.replace(/^<div[^>]*>|<\/div>$/g, '');
        // 还原行内代码 <code> 为 `mono`
        text = text.replace(/<code>(.*?)<\/code>/g, '`$1`');
        // 还原粗体/斜体
        text = text.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
        text = text.replace(/<b>(.*?)<\/b>/g, '**$1**');
        text = text.replace(/<em>(.*?)<\/em>/g, '*$1*');
        text = text.replace(/<i>(.*?)<\/i>/g, '*$1*');
        
        text = text.replace(/<br\s*\/?>(?!$)/g, '\\\n');
        text = text.replace(/\s+$/g, '');
        if (!text.endsWith('\n')) text += '\n\n';
        md += text;
        break;
      }
      case 'heading':
      case 'list':
        md += (block.content || '') + '\n\n';
        break;
      case 'hr':
        md += '---\n\n';
        break;
      case 'quote': {
        // ...existing code...
        if (Array.isArray(block.content)) {
          const quoteMd = blocksToMarkdown(block.content as ContentBlock[])
            .split('\n')
            .map(l => l ? '> ' + l +'\n': '')
            .join('');
          md += quoteMd; 
        } else {
          md += block.content || '';
        }
        md = md.trimEnd() + '\n\n'; 
        break;
      }
      case 'text': {
        let text = block.content;
        // 还原行内代码 <code> 为 `mono`
        text = text.replace(/<code>(.*?)<\/code>/g, '`$1`');
        // 还原粗体/斜体
        text = text.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
        text = text.replace(/<b>(.*?)<\/b>/g, '**$1**');
        text = text.replace(/<em>(.*?)<\/em>/g, '*$1*');
        text = text.replace(/<i>(.*?)<\/i>/g, '*$1*');
        
        text = text.replace(/<p>(.*?)<\/p>/g, '$1\n');
        text = text.replace(/<br\s*\/?>(\n)?/g, '\n');
        text = text.replace(/<[^>]+>/g, '');
        md += text + '\n\n';
        break;
      }
      default:
        md += (block.content || '') + '\n\n';
    }
  }
  return md.trim();
}


export function unescapeMarkdownCell(cell: string) {
  // 反转义顺序要和转义顺序相反
  return cell
    .replace(/\\n/g, '\n')   // \\n -> 换行
    .replace(/\\\|/g, '|')  // \\| -> |
    .replace(/\\\\/g, '\\') // \\\\ -> \
}

export function stripMarkdown(md: string): string {
    if (!md) return ''
    let text = md
    // Headers
    text = text.replace(/^#+\s+/gm, '')
    // Blockquotes
    text = text.replace(/^>\s+/gm, '')
    // Bold/Italic
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
    text = text.replace(/(\*|_)(.*?)\1/g, '$2')
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Images ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Code blocks
    text = text.replace(/```[\s\S]*?```/g, '')
    // Inline code
    text = text.replace(/`([^`]+)`/g, '$1')
    // HTML tags
    text = text.replace(/<[^>]+>/g, '')
    // Horizontal rules
    text = text.replace(/^[-*_]{3,}\s*$/gm, '')
    // List elements
    text = text.replace(/^[\s-]*[-+*]\s+/gm, '')
    text = text.replace(/^\s*\d+\.\s+/gm, '')
    
    return text
}

export function getStats(md: string) {
    const plain = stripMarkdown(md)
    
    // 1. Character Count (with spaces)
    const charCount = plain.length
    
    // 2. Character Count (no spaces)
    const charCountNoSpaces = plain.replace(/\s/g, '').length
    
    // 3. Word Count
    // Split by whitespace and filter empty
    const westernWords = plain.split(/\s+/).filter(w => w.length > 0)
    // Count simple western words as 1, but we need to account for CJK. 
    // Simple approach: Count CJK characters as words, and non-CJK sequences as words.
    // Regex for CJK characters
    const cjkRegex = /[\u4e00-\u9fa5\uf900-\ufa2d\u3040-\u309f\u30a0-\u30ff]/g
    const cjkMatches = plain.match(cjkRegex) || []
    const cjkCount = cjkMatches.length
    
    // Remove CJK from plain to count western words more accurately
    const nonCjk = plain.replace(cjkRegex, ' ')
    const westernWordCount = nonCjk.split(/\s+/).filter(w => w.length > 0).length
    
    const wordCount = westernWordCount + cjkCount

    // 4. Non-Western Count
    const nonWesternCount = cjkCount

    // 5. Markdown Count
    const markdownCount = md.length

    // Summary: First 150 chars
    const summary = plain.replace(/\s+/g, ' ').trim().slice(0, 150) + (plain.length > 150 ? '...' : '')
    
    return {
        charCount,
        charCountNoSpaces,
        wordCount,
        nonWesternCount,
        markdownCount,
        summary
    }
}
