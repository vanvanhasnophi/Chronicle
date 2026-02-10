import katex from 'katex'
import { Icons } from './icons'

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
}

export interface ContentBlock {
  type: 'text' | 'code' | 'table' | 'heading' | 'list' | 'quote' | 'paraWithBackslash' | 'para-backslash' | 'softBreakPara' | 'math';
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

  // 1. Block Math \[ ... \] (inline occurrence) - Display Mode
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_match, tex) => {
    try {
      // Restore HTML tags for tex? No, tex shouldn't contain HTML tags usually, but if it does, Katex might handle it or we need to restore?
      // Actually strictly Tex shouldn't have arbitrary HTML.
      // But if user typed \[ ... <br> ... \], we might have replaced <br> with placeholder.
      // Katex renderToString takes string. If we feed it placeholder, it renders placeholder.
      // We should probably NOT restore HTML tags inside math before passing to KaTex, unless we're sure.
      // But wait, the math regex is simply matching, it definitely matched the placeholder string if it was inside.
      // Let's restore strictly for the content passing to renderToString if necessary, but actually usually math mode ignores HTML tags anyway or treats as invalid.
      // For safety, let's just proceed. The main goal is protecting text rendering.
      
      const html = katex.renderToString(tex, { displayMode: true, throwOnError: false })
      return `<div class="katex-display-wrapper katex-interactive" data-tex="${escapeAttr(tex)}" data-type="block">${html}</div>`
    } catch {
      return _match
    }
  })

  // 2. Inline Math $$ ... $$ - class: inline-math-double
  processed = processed.replace(/\$\$((?:[^\n]|\n)+?)\$\$/g, (_match, tex) => {
    try {
      const html = katex.renderToString(tex, { displayMode: false, throwOnError: false });
      return `<span class="inline-math-double katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline">${html}</span>`
    } catch {
      return _match
    }
  })

  // 3. Inline Math \( ... \) - class: inline-math-slash
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_match, tex) => {
    try {
      const html = katex.renderToString(tex, { displayMode: false, throwOnError: false });
      return `<span class="inline-math-slash katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline">${html}</span>`
    } catch {
      return _match
    }
  })

  // 4. Inline Math $ ... $ - class: inline-math-single
  processed = processed.replace(/\$((?:[^$\n]|)+?)\$/g, (_match, tex) => {
    if (!tex.trim()) return _match;
    try {
      const html = katex.renderToString(tex, { displayMode: false, throwOnError: false });
      return `<span class="inline-math-single katex-interactive" data-tex="${escapeAttr(tex)}" data-type="inline">${html}</span>`
    } catch {
      return _match
    }
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
export function convertToHtml(text: any): string {
    // 渲染每个段落
  // 新的段落换行与反斜杠处理逻辑
  function renderParaBlock(block: string) {
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
      try {
        const html = katex.renderToString(block.content, { displayMode: true, throwOnError: false })
        return `<div class="katex-display-wrapper katex-interactive" data-tex="${escapeAttr(block.content)}" data-type="block">${html}</div>`
      } catch {
        return `<pre>${block.content}</pre>`
      }
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
  return parsedBlocks.map(renderBlock).join('\n')
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
