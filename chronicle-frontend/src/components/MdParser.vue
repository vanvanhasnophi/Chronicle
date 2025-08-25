<template>

</template>

<script lang="ts">
// 处理粗体、斜体、粗斜体，isHeading为true时只处理斜体
function processEmphasis(text: string, isHeading = false): string {
  let processed = text
  if (!isHeading) {
    // 行内代码 `mono`
    processed = processed.replace(/`([^`]+?)`/g, '<code>$1</code>')
    // ***粗斜体***
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    processed = processed.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    // **粗体**
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>')
  }
  // *斜体*
  processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
  processed = processed.replace(/_(.+?)_/g, '<em>$1</em>')
  return processed
}
export interface ContentBlock {
  type: 'text' | 'code' | 'table' | 'heading' | 'list' | 'quote' | 'paraWithBackslash' | 'para-backslash' | 'softBreakPara';
  content: string;
  language?: string;
  header?: string[];
  body?: string[][];
}

// 只识别行首的```为代码块起止
// const codeBlockPattern = /^```(\w*)\n([\s\S]*?)^```/gm;

export function parseMarkdown(content: string, cacheKey?: number): Array<{
  type: 'heading' | 'list' | 'quote' | 'table' | 'code' | 'paraWithBackslash' | 'text',
  content: string,
  language?: string,
  header?: string[],
  body?: string[][]
}> {
  // 先用convertToHtml的分段逻辑拆分
  const lines = content.split(/\n/)
  const blocks: any[] = []
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
      // 递归解析，禁用代码块、表格、嵌套引用
      const quoteContent = quoteLines.join('\n');
      const innerBlocks = parseMarkdown(quoteContent, cacheKey)
        .filter(b => b.type !== 'code' && b.type !== 'table' && b.type !== 'quote');
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
    // 单/多反斜杠结尾的行合并为paraWithBackslash段落，n>=2时本行结束，后续行继续判断
    // 只处理行末的反斜杠，行中间的\\不影响分段
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
  // 若传入cacheKey，强制返回新对象数组，避免渲染缓存
  if (typeof cacheKey === 'number') {
    return blocks.map(b => ({ ...b }))
  }
  return blocks
}

// 用自定义控件占位符替换表格，后续由TextEditor渲染MarkdownTable组件
export function convertToHtml(text: any): string {
  // 处理表格，支持单元格内换行（\n），并支持粗体/斜体渲染
  if (typeof text === 'string') {
    text = text.replace(/((?:^\s*\|.*\|\s*\n)+)\s*([| :]*)\-+([| :\-]*)\n((?:\s*\|.*\|\s*\n?)*)/gm,
      (_match: string, headerRows: string, _beforeSep: string, _afterSep: string, bodyRows: string) => {
        const headerLines = headerRows.trim().split(/\n/).filter(Boolean);
        const header = headerLines[headerLines.length - 1].replace(/^\||\|$/g, '').split('|').map((cell: string) =>
          processEmphasis(cell.replace(/\\\|/g, '|').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').trim())
        );
        const body = bodyRows.split(/\n/).filter((row: string) => row.trim()).map((row: string) => {
          return row.trim().replace(/^\||\|$/g, '').split('|').map((cell: string) =>
            processEmphasis(cell.replace(/\\\|/g, '|').replace(/\\\\/g, '\\').replace(/\\n/g, '\n').trim())
          );
        });
        // 用特殊标记包裹，后续TextEditor中replace为组件
        return `[[MARKDOWN_TABLE:${JSON.stringify({header,body})}]]`;
      });
  }

  // 预处理：将所有行分割为数组（仅字符串时）
  let lines: string[] = [];
  if (typeof text === 'string') {
    lines = text.split(/\n/)
  }
  const blocks: string[] = []
  let buffer: string[] = []
  let inCode = false
  let inList = false
  let inQuote = false
  // let inTable = false
  let inParaWithBackslash = false
  // let inTitle = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 代码块
    if (/^\s*```/.test(line)) {
      if (inCode) {
        buffer.push(line)
        blocks.push(buffer.join('\n'))
        buffer = []
        inCode = false
      } else {
        if (buffer.length) blocks.push(buffer.join('\n'))
        buffer = [line]
        inCode = true
      }
      continue
    }
    if (inCode) {
      buffer.push(line)
      continue
    }
    // 表格
    if (/^\[\[MARKDOWN_TABLE:/.test(line)) {
      if (buffer.length) blocks.push(buffer.join('\n'))
      blocks.push(line)
      buffer = []
      continue
    }
    // 标题
    if (/^\s*#{1,6} /.test(line)) {
      if (buffer.length) blocks.push(buffer.join('\n'))
      blocks.push(line)
      buffer = []
      continue
    }
    // 引用
    if (/^\s*> /.test(line)) {
      if (!inQuote) {
        if (buffer.length) blocks.push(buffer.join('\n'))
        buffer = [line]
        inQuote = true
      } else {
        buffer.push(line)
      }
      // 检查下一个是否还是引用
      if (i+1 >= lines.length || !/^\s*> /.test(lines[i+1])) {
        blocks.push(buffer.join('\n'))
        buffer = []
        inQuote = false
      }
      continue
    }
    // 列表（支持引用内列表）
    if (/^\s*([-*]|\d+\.) /.test(line) || /^\s*>\s*([-*]|\d+\.) /.test(line)) {
      if (!inList) {
        if (buffer.length) blocks.push(buffer.join('\n'))
        buffer = [line]
        inList = true
      } else {
        buffer.push(line)
      }
      // 检查下一个是否还是列表或引用内列表
      if (i+1 >= lines.length || (!/^\s*([-*]|\d+\.) /.test(lines[i+1]) && !/^\s*>\s*([-*]|\d+\.) /.test(lines[i+1]))) {
        blocks.push(buffer.join('\n'))
        buffer = []
        inList = false
      }
      continue
    }
    // \结尾的段落
    if (/\\$/.test(line)) {
      if (!inParaWithBackslash) {
        if (buffer.length) blocks.push(buffer.join('\n'))
        buffer = [line]
        inParaWithBackslash = true
      } else {
        buffer.push(line)
      }
      // 检查下一个是否还是\结尾
      if (i+1 >= lines.length || !/\\$/.test(lines[i+1])) {
        blocks.push(buffer.join('\n'))
        buffer = []
        inParaWithBackslash = false
      }
      continue
    }
    // 空行
    if (line.trim() === '') {
      if (buffer.length) blocks.push(buffer.join('\n'))
      buffer = []
      continue
    }
    // 普通行
    buffer.push(line)
    // 如果下一行是特殊块或结尾，则输出
    if (i+1 >= lines.length ||
      /^\s*```/.test(lines[i+1]) ||
      /^\[\[MARKDOWN_TABLE:/.test(lines[i+1]) ||
      /^\s*#{1,6} /.test(lines[i+1]) ||
      /^\s*> /.test(lines[i+1]) ||
      /^\s*([-*]|\d+\.) /.test(lines[i+1]) ||
      /\\$/.test(lines[i+1]) ||
      lines[i+1].trim() === '') {
      blocks.push(buffer.join('\n'))
      buffer = []
    }
  }
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

// 反转义markdown表格单元格内容，供TextEditor等还原时使用
export function unescapeMarkdownCell(cell: string) {
  // 反转义顺序要和转义顺序相反
  return cell
    .replace(/\\n/g, '\n')   // \\n -> 换行
    .replace(/\\\|/g, '|')  // \\| -> |
    .replace(/\\\\/g, '\\') // \\\\ -> \
}

// 解析markdown表格，返回{header, body}数组，供TextEditor渲染MarkdownTable用
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

export function blocksToMarkdown(blocks: ContentBlock[]): string {
  let md = '';
  for (const block of blocks) {
    switch (block.type) {
      case 'code':
        md += `\`\`\`${block.language || 'plain'}\n${block.content}\n\`\`\`\n\n`;
        break;
      case 'table': {
        // 优先用header/body还原标准表格
        if (block.header && block.body) {
          const headerLine = '| ' + block.header.join(' | ') + ' |';
          const sepLine = '| ' + block.header.map(()=>'---').join(' | ') + ' |';
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
        // 递归还原为> 行，不加后置换行
        if (Array.isArray(block.content)) {
          const quoteMd = blocksToMarkdown(block.content)
            .split('\n')
            .map(l => l ? '> ' + l +'\n': '')
            .join('');
          md += quoteMd + '\n';
        } else {
          md += block.content || '';
        }
        break;
      }
      case 'text': {
        let text = block.content;
        // 还原行内代码 <code> 为 `mono`
        text = text.replace(/<code>(.*?)<\/code>/g, '`$1`');
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
</script>

<style>
.md-quote-block {
  background: #8585851d;
  border-left: 4px solid #4a90e2;
  padding: 0.5em 1em;
  margin: 0.5em 0;
  border-radius: 4px;
  line-height: 1.6;
}

/* 引用块整体行距更大，软换行略小 */
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
  color: #d23330d6;
  border-radius: 5px;
  padding: 0.4em 1em;
  font-size: 0.85em;
  font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
  font-weight: 500;
  vertical-align: middle;
  /* 让行内 code 与正文高度更协调 */
}
</style>