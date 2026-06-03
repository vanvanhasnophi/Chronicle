# Markdown → HTML 转换规则（概要）

此文档列出 `chronicle-frontend` 中当前用于将 Markdown 转换为 HTML 的规则与行为摘要，来源文件：[src/utils/markdownParser.ts](src/utils/markdownParser.ts#L1-L1200)。

## 总体流程
- 入口函数是 `convertToHtml(text, options?)`。它会先调用 `parseMarkdown(content)` 把输入拆成 `ContentBlock[]`，再按 block 渲染成 HTML。
- `parseMarkdown(content)` 按行识别代码块、数学块、表格、标题、引用、列表、软换行段落等结构。

## 图片与链接
- 图片：`![alt](url)` 会渲染为图片容器，并附带 caption。
- 链接：`[text](url)` 会先识别文件后缀。若是常见媒体、文档或代码文本后缀，会渲染成 `file-card`。
- 特殊协议也会影响输出：`audio:`、`video:`、`link:`、`mailto:` 会被解析为对应类型的卡片或链接。
- 如果既没有特殊协议，也没有可识别后缀，就渲染为普通外链 `<a>`，并加上 `target="_blank" rel="noopener noreferrer"`。

## 强调与行内语法
- 行内代码：`` `code` `` → `<code>...</code>`。
- 粗体、斜体、粗斜体：`**text**`、`*text*`、`***text***` 会被转换为对应 HTML。
- 图片和链接的识别优先于强调处理。

## 代码块与高亮
- 围栏代码块 ` ```lang ... ``` ` 会被识别为 `code` block。
- 渲染时会走 `highlightCode(code, language)`，基于语言规则做简单的正则高亮。
- 未识别语言或 `plain` / `text` 会直接 HTML 转义。

## 数学公式
- 支持 `\[ ... \]`、`$$ ... $$`、`\( ... \)`、`$ ... $`。
- 公式不会立刻渲染为完整 KaTeX HTML，而是先生成占位符，随后由 `hydrateKatexIn(container)` 异步补渲染。

## 表格
- 支持标准 Markdown 表格。
- `parseTableMarkdown` 会提取 header/body，并渲染为语义化 `<table class="md-table">`。
- 同时兼容 `[[MARKDOWN_TABLE:...]]` 形式的占位表格。

## 列表、引用、标题和分割线
- 标题：`#{1,6} ` → `<h1>`..`<h6>`。
- 引用：以 `>` 开头的块会递归解析内部 Markdown，然后渲染为 `<blockquote>`。
- 列表：支持有序、无序与缩进层级。
- 分割线：独立行 `---` / `***` / `___` 会渲染为 `<hr />`。

## 软换行与段落合并
- 单换行场景下，连续文本会合并成一个段落，并在合并处插入 `<br>`。
- 如果出现空行分隔，会按正常段落分块，不再跨空行用反斜杠继续合并。

## HTML 标签保护
- `processEmphasis` 在处理 Markdown 强调前会先保护原始 HTML 标签，避免属性内容被误解析。
- 恢复标签时会做轻量清理，降低常见脚本注入和危险属性的风险。

## 渲染包装
- `convertToHtml(..., { wrapBlocks: true })` 会把每个 block 包装成 `.content-block`，以匹配预览区的 DOM 结构。

## 反向生成 Markdown
- `blocksToMarkdown(blocks)` 可以把 `ContentBlock[]` 还原为 Markdown。
- 代码块、数学块、表格、段落与常见强调标签都会尽量回写为原始 Markdown 形式。

## 文本统计
- `getStats(md)` 先用 `stripMarkdown(md)` 清理格式，再统计字符数、词数、Markdown 长度和摘要。

## 扩展点
- KaTeX 占位、代码块 `data-block-index`、`file-card` 都是后续做交互编辑或同步更新的可用钩子。
- 目前的清理是轻量级的，如果以后开放更自由的 HTML 编辑，建议再接入更完整的白名单过滤。

---
原始实现详见：[src/utils/markdownParser.ts](src/utils/markdownParser.ts#L1-L1200)
