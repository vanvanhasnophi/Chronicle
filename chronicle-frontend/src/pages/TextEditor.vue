<template>
  <div class="text-editor-page">
    <div class="page-header">
      <h1>Chronicle 文本编辑器</h1>
      <p>简单的 Markdown 编辑器，支持代码块自动识别</p>
    </div>
    
    <div class="editor-container">
      <!-- 输入区域 -->
      <div class="input-section">
        <h3>Markdown 输入</h3>
        <textarea
          v-model="markdownContent"
          class="markdown-input"
          placeholder="输入 Markdown 内容，使用 ``` 创建代码块..."
          @input="parseMarkdown"
        ></textarea>
      </div>
      
      <!-- 预览区域 -->
      <div class="preview-section">
        <h3>实时预览</h3>
        <div class="preview-content">
          <div v-for="(block, index) in parsedBlocks" :key="index" class="content-block">
            <!-- 普通文本 -->
            <div v-if="block.type === 'text'" v-html="block.content" class="text-block"></div>
            
            <!-- 代码块 -->
            <div v-else-if="block.type === 'code'" class="code-block-container">
              <CodeChunk
                v-model="block.content"
                :language="block.language || 'javascript'"
                :title="`代码块 ${index + 1}`"
                height="300px"
                @change="(code, lang) => updateCodeBlock(index, code, lang)"
                @copy="onCodeCopy"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 状态信息 -->
    <div class="status-bar">
      <span>代码块数量: {{ codeBlockCount }}</span>
      <span>总字符数: {{ totalCharacters }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import CodeChunk from '../components/CodeChunk.vue'

// 数据定义
const markdownContent = ref(`# 欢迎使用 Chronicle

这是一个简单的 Markdown 编辑器，支持代码块自动识别。

## JavaScript 示例
\`\`\`javascript
function hello(name) {
  console.log("Hello, " + name + "!");
  return "欢迎使用 Chronicle!";
}

hello("World");
\`\`\`

## Python 示例  
\`\`\`python
def greet(name):
    return f"Hello, {name}!"

print(greet("Chronicle"))
\`\`\`

使用三个反引号 \`\`\` 来创建代码块，支持多种编程语言的语法高亮！`)

// 内容块接口
interface ContentBlock {
  type: 'text' | 'code'
  content: string
  language?: string
}

const parsedBlocks = ref<ContentBlock[]>([])

// 计算属性
const codeBlockCount = computed(() => {
  return parsedBlocks.value.filter(block => block.type === 'code').length
})

const totalCharacters = computed(() => {
  return markdownContent.value.length
})

// 解析 Markdown 内容
function parseMarkdown() {
  const content = markdownContent.value
  const blocks: ContentBlock[] = []
  // 只识别行首的```为代码块起止
  const codeBlockPattern = /^```(\w*)\n([\s\S]*?)^```/gm
  let lastIndex = 0
  let match
  // 查找所有代码块
  while ((match = codeBlockPattern.exec(content)) !== null) {
    // 添加代码块前的文本内容
    const textBefore = content.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      blocks.push({
        type: 'text',
        content: convertToHtml(textBefore.trim())
      })
    }
    // 添加代码块
    blocks.push({
      type: 'code',
      content: match[2].trim(),
      language: match[1] || 'plain'
    })
    lastIndex = match.index + match[0].length
  }
  // 添加最后剩余的文本内容
  const remainingText = content.slice(lastIndex)
  if (remainingText.trim()) {
    blocks.push({
      type: 'text',
      content: convertToHtml(remainingText.trim())
    })
  }
  parsedBlocks.value = blocks
}

// 简单的 Markdown 转 HTML
function convertToHtml(text: string): string {
  return text
    // 标题转换
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // 粗体和斜体
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 段落处理
    .replace(/\n\n/g, '</p><p>')
    // 包装段落
    .replace(/^(.*)$/gm, (_, content) => {
      if (content.startsWith('<h') || content.startsWith('</')) {
        return content
      }
      return `<p>${content}</p>`
    })
    // 清理空段落
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[1-6]>.*?<\/h[1-6]>)<\/p>/g, '$1')
}

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

// 同步更新 markdown 内容
function syncMarkdownContent() {
  let newContent = ''
  
  parsedBlocks.value.forEach(block => {
    if (block.type === 'text') {
      // 简单地移除 HTML 标签并恢复 markdown
      const plainText = block.content
        .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
        .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
        .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
        .replace(/<em>(.*?)<\/em>/g, '*$1*')
        .replace(/<code>(.*?)<\/code>/g, '`$1`')
        .replace(/<p>(.*?)<\/p>/g, '$1\n')
        .replace(/<[^>]*>/g, '')
      newContent += plainText + '\n'
    } else if (block.type === 'code') {
      newContent += `\`\`\`${block.language || 'javascript'}\n${block.content}\n\`\`\`\n\n`
    }
  })
  
  markdownContent.value = newContent.trim()
}

// 代码复制回调
function onCodeCopy(code: string) {
  console.log('代码已复制:', code.substring(0, 50) + '...')
}

// 初始化解析
parseMarkdown()
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
