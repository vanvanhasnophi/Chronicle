<template>

</template>

<script lang="ts">
// 处理粗体、斜体、粗斜体，isHeading为true时只处理斜体
function processEmphasis(text: string, isHeading = false): string {
  let processed = text
  if (!isHeading) {
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
  type: 'text' | 'code'
  content: string
  language?: string
}

// 只识别行首的```为代码块起止
const codeBlockPattern = /^```(\w*)\n([\s\S]*?)^```/gm;

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
    const bsMatchNew = line.match(/(\\+)$/)
    if (bsMatchNew && bsMatchNew.index === line.length - bsMatchNew[1].length) {
      const bsCount = bsMatchNew[1].length
      if (bsCount === 1 && (line.length === 1 || line[line.length-2] !== '\\')) {
        // 单反斜杠结尾，合并后续所有单反斜杠结尾行，用<br>连接
        let paraLines = [line.slice(0, -1)]
        let j = i+1
        while (j < lines.length) {
          const nextLine = lines[j]
          const nextMatch = nextLine.match(/(\\+)$/)
          if (nextMatch && nextMatch.index === nextLine.length - nextMatch[1].length && nextMatch[1].length === 1 && (nextLine.length === 1 || nextLine[nextLine.length-2] !== '\\')) {
            paraLines.push(nextLine.slice(0, -1))
            j++
          } else {
            break
          }
        }
        // 合并后如有非单反斜杠结尾行，合进去
        if (j < lines.length && lines[j].trim() !== '') {
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
    // 引用
    if (/^\s*> /.test(line)) {
      let quoteLines = [line]
      let j = i+1
      while (j < lines.length && /^\s*> /.test(lines[j])) {
        quoteLines.push(lines[j])
        j++
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') })
      i = j
      continue
    }
    // 列表（支持制表符和空格缩进多级）
    if (/^([ \t]*)([-*]|\d+\.) /.test(line)) {
      let listLines = [line]
      let j = i+1
      while (j < lines.length && /^([ \t]*)([-*]|\d+\.) /.test(lines[j])) {
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
export function convertToHtml(text: string): string {
  // 处理表格，支持单元格内换行（\n），并支持粗体/斜体渲染
  text = text.replace(/((?:^\s*\|.*\|\s*\n)+)\s*([| :]*)\-+([| :\-]*)\n((?:\s*\|.*\|\s*\n?)*)/gm,
    (match: string, headerRows: string, beforeSep: string, afterSep: string, bodyRows: string) => {
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

  // 预处理：将所有行分割为数组
  const lines = text.split(/\n/)
  const blocks: string[] = []
  let buffer: string[] = []
  let inCode = false
  let inList = false
  let inQuote = false
  let inTable = false
  let inParaWithBackslash = false
  let inTitle = false
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
    // 列表
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      if (!inList) {
        if (buffer.length) blocks.push(buffer.join('\n'))
        buffer = [line]
        inList = true
      } else {
        buffer.push(line)
      }
      // 检查下一个是否还是列表
      if (i+1 >= lines.length || !/^\s*([-*]|\d+\.) /.test(lines[i+1])) {
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
    // 代码块、列表、引用原样输出
    if (/^\s*```/.test(block) || /^\s*([-*]|\d+\.) /.test(block) || /^\s*> /.test(block)) {
      return block
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
    const lines = block.split(/\n/)
    let html = ''
    let i = 0
    while (i < lines.length) {
      let line = lines[i]
      // 统计结尾反斜杠数
      const match = line.match(/(\\+)$/)
      if (match) {
        const bsCount = match[1].length
        if (bsCount === 1) {
          html += processEmphasis(line.slice(0, -1)) + '<br>'
          i++
          continue
        } else {
          html += processEmphasis(line.slice(0, -bsCount)) + '\\'.repeat(bsCount - 1)
          break
        }
      } else {
        html += processEmphasis(line)
      }
      if (i < lines.length - 1) html += '\n'
      i++
    }
    return `<div class=\"para-backslash\">${html}</div>`
  }
  // 支持list/quote类型的block渲染
  return blocks.map(block => {
    // 列表
    // 多级列表渲染，li内容支持粗体/斜体
    if (/^([ \t]*)([-*]|\d+\.) /.test(block)) {
      const lines = block.split(/\n/).filter(Boolean)
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
    // 引用，内容支持粗体/斜体
    if (/^\s*> /.test(block)) {
      const lines = block.split(/\n/).filter(Boolean)
      const html = lines.map(l => l.replace(/^\s*>\s?/, '')).map(l => `<p>${processEmphasis(l)}</p>`).join('')
      return `<blockquote>${html}</blockquote>`
    }
    // 其他类型走原有逻辑
    return renderParaBlock(block)
  }).join('\n')
}

// 解析markdown表格，返回{header, body}数组，供TextEditor渲染MarkdownTable用
export function parseTableMarkdown(text: string): Array<{header: string[], body: string[][], raw: string, start: number, end: number}> {
  const results: Array<{header: string[], body: string[][], raw: string, start: number, end: number}> = [];
  const tableRegex = /((?:^\s*\|.*\|\s*\n)+)\s*([| :]*)\-+([| :\-]*)\n((?:\s*\|.*\|\s*\n?)*)/gm;
  let match;
  while ((match = tableRegex.exec(text)) !== null) {
    const [raw, headerRows, beforeSep, afterSep, bodyRows] = match;
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
    if (block.type === 'code') {
      md += `\n\n\`\`\`${block.language || 'plain'}\n${block.content}\n\`\`\`\n\n`;
    } else if (block.type === 'text') {
      let text = block.content;
      text = text.replace(/<p>(.*?)<\/p>/g, '$1\n');
      text = text.replace(/<br\s*\/?>(\n)?/g, '\n');
      text = text.replace(/<[^>]+>/g, '');
      md += text + '\n\n';
    }
  }
  return md.trim();
}
</script>