<template>
  <div class="text-editor-page">
    <div class="page-header">
      <h1>Chronicle 文本编辑器</h1>
      <p>简单的 Markdown 编辑器，支持代码块自动识别</p>
    </div>
    <div class="editor-container">
      <div class="input-section">
        <h3>Markdown 输入</h3>
        <textarea
          v-model="markdownContent"
          class="markdown-input"
          placeholder="输入 Markdown 内容，使用 ``` 创建代码块..."
          @input="parseMarkdownContent"
        ></textarea>
      </div>
      <div class="preview-section">
        <h3>实时预览</h3>
  <div class="preview-content" :key="parsedBlocks.length" ref="previewContentRef">
          <template v-for="(block, index) in parsedBlocks" :key="index">
            <template v-if="block.type === 'table'">
              <div class="content-block">
                <MarkdownTable :header="block.header || []" :body="block.body || []" @change="(h,b)=>updateTableBlock(index,h,b)" />
              </div>
            </template>
            <template v-else-if="block.type === 'code'">
              <div class="content-block">
                <CodeChunk
                  v-model="block.content"
                  :language="block.language || 'javascript'"
                  :title="`代码块 ${index + 1}`"
                  height="300px"
                  @change="(code, lang) => updateCodeBlock(index, code, lang)"
                  @copy="onCodeCopy"
                />
              </div>
            </template>
            <template v-else>
              <div class="content-block text-block" v-html="convertToHtml(block.content)"></div>
            </template>
          </template>
        </div>
      </div>
    </div>
    <div class="status-bar">
      <span>代码块数量: {{ codeBlockCount }}</span>
      <span>总字符数: {{ totalCharacters }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import CodeChunk from '../components/CodeChunk.vue'
import { parseMarkdown, convertToHtml, blocksToMarkdown, parseTableMarkdown } from '../components/MdParser.vue'
import MarkdownTable from '../components/MarkdownTable.vue'
type Block = {
  type: 'text' | 'code' | 'table' | 'heading' | 'list' | 'quote' | 'paraWithBackslash';
  content: string;
  language?: string;
  header?: string[];
  body?: string[][];
}

// 如果MdParser.vue中有ContentBlock类型导出，则如下导入
// import type { ContentBlock } from '../components/MdParser.vue'
// 若没有导出，则在此处定义ContentBlock类型

type ContentBlock = {
  type: 'text' | 'code',
  content: string,
  language?: string
}

const markdownContent = ref(`# 欢迎使用 Chronicle

这是一个简单的 Markdown 编辑器，支持代码块、表格、段落自动识别。

## JavaScript 示例
\`\`\`javascript
function hello(name) {
  console.log("Hello, " + name + "!");
  return "欢迎使用 Chronicle!";
}

hello("World");
\`\`\`

使用三个反引号 \`\`\` 来创建代码块，支持多种编程语言的语法高亮！

## 这是一个表格：
|Row1|Row2|Row3|
|-|-|-|
|John Doe|Zhang San|Hu Yanbing|
|1|2.00|3|

## 这是一个长段落
红军不怕远征难\\
万水千山只等闲
五岭逶迤腾细浪\\
乌蒙磅礴走泥丸\\1
金沙水拍云崖暖\\
大渡桥横铁索寒\\\\
更喜岷山千里雪
三军过后尽开颜\\`)

const parsedBlocks = ref<Block[]>([])
const previewContentRef = ref<HTMLDivElement | null>(null)

// 计算属性
const codeBlockCount = computed(() => {
  return parsedBlocks.value.filter(block => block.type === 'code').length
})

const totalCharacters = computed(() => {
  return markdownContent.value.length
})

// 解析 Markdown 内容
function parseMarkdownContent() {
  // 记录滚动位置
  let scrollTop = 0
  if (previewContentRef.value) {
    scrollTop = previewContentRef.value.scrollTop
  }
  parsedBlocks.value = parseMarkdown(markdownContent.value)
  nextTick(() => {
    if (previewContentRef.value) {
      previewContentRef.value.scrollTop = scrollTop
    }
  })
}

// convertToHtml 已由 MdParser 导出

// 更新代码块内容
function updateCodeBlock(index: number, code: string, language: string) {
  const block = parsedBlocks.value[index]
  if (block && block.type === 'code') {
    block.content = code
    block.language = language
    // 同步更新原始 markdown
    syncMarkdownContent()
  }
}

// 更新表格块
function updateTableBlock(index: number, header: string[], body: string[][]) {
  // 更新block内容并同步markdown
  const block = parsedBlocks.value[index]
  if (block && block.type === 'table') {
    block.header = header
    block.body = body
    // 重新生成表格占位符内容
    block.content = `[[MARKDOWN_TABLE:${JSON.stringify({header,body})}]]`
    syncMarkdownContent()
  }
}

// 转义表格单元格内容，防止破坏markdown结构
function escapeTableCell(cell: string): string {
  return cell
    .replace(/\\/g, '\\\\') // 先转义反斜杠
    .replace(/\|/g, '\\|')     // 再转义竖线
    .replace(/\n/g, ' ')         // 换行转空格
    .replace(/\r/g, '')
}

// 将[[MARKDOWN_TABLE:...]]格式转为标准markdown表格
function tableBlockToMarkdown(tableBlock: string): string {
  // 匹配[[MARKDOWN_TABLE:{...}]]
  const match = tableBlock.match(/^[\[]\[MARKDOWN_TABLE:(.*)\]\]$/s)
  if (!match) return tableBlock
  try {
    const obj = JSON.parse(match[1])
    const header = obj.header || []
    const body = obj.body || []
    if (!header.length) return ''
    // 构造表头
    const headerLine = '| ' + header.map(escapeTableCell).join(' | ') + ' |'
    const sepLine = '| ' + header.map(() => '---').join(' | ') + ' |'
    // 构造表体
    const bodyLines = body.map((row:string[]) => '| ' + row.map(escapeTableCell).join(' | ') + ' |')
    return [headerLine, sepLine, ...bodyLines].join('\n')
  } catch {
    return tableBlock
  }
}

function syncMarkdownContent() {
  // 支持所有类型block的还原
  const md = parsedBlocks.value.map(block => {
    if (block.type === 'text') {
      return block.content
    } else if (block.type === 'code') {
      return `\n\n\${block.language || ''}\n${block.content}\n\\n\n`
    } else if (block.type === 'table') {
      return tableBlockToMarkdown(block.content)
    } else if (block.type === 'heading') {
      return block.content
    } else if (block.type === 'list') {
      return block.content
    } else if (block.type === 'quote') {
      return block.content
    } else if (block.type === 'paraWithBackslash') {
      return block.content
    }
    return ''
  }).join('\n\n')
  // 不自动赋值markdownContent，避免textarea光标跳动
  // markdownContent.value = md.trim()
}

// 代码复制回调
function onCodeCopy(code: string) {
  console.log('代码已复制:', code.substring(0, 50) + '...')
}

// 渲染块内容
function renderBlockContent(block: ContentBlock) {
  // 检查是否为表格占位符
  const tableMatch = block.content.match(/^\[\[MARKDOWN_TABLE:(.*)\]\]$/)
  if (tableMatch) {
    try {
      const { header, body } = JSON.parse(tableMatch[1])
      return { type: 'table', header, body }
    } catch {
      return { type: 'text', html: block.content }
    }
  }
  return { type: 'text', html: block.content }
}

// 初始化解析
parseMarkdownContent()
</script>

<style scoped>
.text-editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
}

.page-header {
  background: #2d2d30;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid #3e3e42;
}

.page-header h1 {
  margin: 0 0 0.5rem 0;
  color: #ffffff;
  font-size: 1.8rem;
}

.page-header p {
  margin: 0;
  color: #b8b8b8;
  font-size: 1rem;
}

.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.input-section,
.preview-section {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.input-section {
  border-right: 1px solid #3e3e42;
}

.input-section h3,
.preview-section h3 {
  color: #ffffff;
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
}

.markdown-input {
  width: 100%;
  height: calc(100% - 3rem);
  background: #252526;
  color: #d4d4d4;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  padding: 1rem;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.markdown-input:focus {
  border-color: #007acc;
}

.preview-content {
  height: calc(100% - 3rem);
  overflow-y: auto;
}

.content-block {
  margin-bottom: 1.5rem;
}

.text-block {
  line-height: 1.6;
}
.text-block table {
  border-collapse: collapse;
  margin: 1em 0;
  width: 100%;
  background: #232323;
  border: 2px solid #888;
  box-shadow: 0 2px 8px #0002;
}
.text-block th, .text-block td {
  border: 1.5px solid #aaa;
  padding: 0.5em 1em;
  text-align: left;
  background: #232323;
}
.text-block th {
  background: #2d2d30;
  color: #fff;
  border-bottom: 2px solid #888;
}
.text-block ul, .text-block ol {
  margin: 1em 0 1em 2em;
  padding: 0 0 0 1.2em;
}
.text-block li {
  margin: 0.2em 0;
}


.text-block h1,
.text-block h2,
.text-block h3 {
  color: #ffffff;
  margin: 1rem 0 0.8rem 0;
}

.text-block h1 {
  font-size: 1.6rem;
  border-bottom: 2px solid #3e3e42;
  padding-bottom: 0.5rem;
}

.text-block h2 {
  font-size: 1.4rem;
  border-bottom: 1px solid #3e3e42;
  padding-bottom: 0.3rem;
}

.text-block h3 {
  font-size: 1.2rem;
}


.text-block p {
  margin: 0.8rem 0;
  color: #d4d4d4;
}
.text-block .para-backslash {
  display: block;
  line-height: 1.2;
  margin: 0.2em 0;
  color: #d4d4d4;
}

.text-block strong {
  color: #ffffff;
  font-weight: bold;
}

.text-block em {
  color: #b8b8b8;
  font-style: italic;
}

.text-block code {
  background: #2d2d30;
  color: #ce9178;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
}

.code-block-container {
  margin: 1.5rem 0;
  border-radius: 6px;
  overflow: hidden;
}

.status-bar {
  background: #007acc;
  color: white;
  padding: 0.8rem 2rem;
  font-size: 0.9rem;
  display: flex;
  gap: 2rem;
  align-items: center;
}

/* 滚动条样式 */
.input-section::-webkit-scrollbar,
.preview-section::-webkit-scrollbar,
.preview-content::-webkit-scrollbar {
  width: 8px;
}

.input-section::-webkit-scrollbar-track,
.preview-section::-webkit-scrollbar-track,
.preview-content::-webkit-scrollbar-track {
  background: #2d2d30;
}

.input-section::-webkit-scrollbar-thumb,
.preview-section::-webkit-scrollbar-thumb,
.preview-content::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 4px;
}

.input-section::-webkit-scrollbar-thumb:hover,
.preview-section::-webkit-scrollbar-thumb:hover,
.preview-content::-webkit-scrollbar-thumb:hover {
  background: #555555;
}
</style>
