# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

**这是加粗文本**

*这是斜体文本*

***这是加粗斜体文本***

~~这是删除线文本~~

<u>这是下划线文本</u>

这是普通文本，其中包含`行内代码`和[普通链接](https://example.com)。

[应该自动渲染成卡片的音乐](a.mp3)

[强制转换为音乐卡片](audio:example.com)

[应该自动渲染成卡片的视频](v.mp4)

[强制转换为视频卡片](video:example.com)

[应该自动渲染成卡片的文本文档](t.txt)

[强制转换为文本卡片](text:example.com)

[应该自动渲染成卡片的PDF文档](d.pdf)

[强制转换为文档卡片](doc:example.com)

[强制转换为卡片的链接](link:https://music.163.com/#/song?id=2673721054)

[应该渲染成卡片的邮件名片](mailto:j13811593@163.com)

强制类型转换的目前问题：仅`audio: [url]`等有效，而`audio:[url]`等应该也有效，但是目前无效

这是mermaid代码块
```mermaid
flowchart LR
A[示例]--->B[示例2]--->C[示例3]
```

> 这是一级引用
> 
> > 这是嵌套引用
> 
> 引用内可以包含**加粗**等格式。

列表1：无序列表
* 无序列表项 1
  * 嵌套无序列表项 1.1
    * 更深层级
* 无序列表项 2
* 无序列表项 3

列表2：有序列表

1. 有序列表项 1
2. 有序列表项 2
   1. 嵌套有序列表项 2.1
   2. 嵌套有序列表项 2.2
3. 有序列表项 3

列表3：不规则有序列表

2. 不是以1开始的列表项
9. 任意数字列表项
6. 任意数字列表项

列表4：任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [ ] 另一个未完成任务

中间没有段落，只有硬换行的两个同类列表，应该显示为2个列表

1. 有序列表项 1
2. 有序列表项 2
   1. 嵌套有序列表项 2.1
   2. 嵌套有序列表项 2.2
3. 有序列表项 3

1. 有序列表项 1
2. 有序列表项 2
   1. 嵌套有序列表项 2.1
   2. 嵌套有序列表项 2.2
3. 有序列表项 3

```javascript
// 这是代码块
function helloWorld() {
  console.log("Hello, Markdown!");
}
```

内联代码：`const a = 1;`

| 左对齐 | 居中对齐 | 右对齐 |
| :----- | :------: | -----: |
| 单元格1 | 单元格2  | 单元格3 |
| 单元格4 | 单元格5  | 单元格6 |

***
---

水平分隔线（上面已有两条）

![不该渲染成`md-image-caption`的替代文本](https://picsum.photos/200/100 "应该渲染成`md-image-caption`的图片标题，并且支持公式嵌入")

使用`@tlylt/markdown-it-imsize`支持图片大小指定  
![不该渲染成`md-image-caption`的替代文本](https://picsum.photos/200/100 "应该渲染成`md-image-caption`的图片标题，并且支持公式嵌入" =800x600)

这是一个脚注示例[^1]，用于说明脚注功能。

[^1]: 脚注内容：这是对文本的补充说明。

这是一个\*不解析为斜体\*的示例。

行内公式：$E = mc^2$ 和 \(E = mc^2\)

单独成行的块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

\[
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\]

允许破坏行的块级公式：

这是一段示例段\[\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}\]被单行块级公式破坏了

这是一段示例行\[
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\]被多行块级公式破坏了

---

## 软换行与硬换行测试

这行后面有两个空格（可在源码中查看）  
这行是硬换行（`<br>`）的效果。

这行后面没有两个空格
这行是软换行，中间会被解析为一个普通空格。

---

## 混合样式测试

- **加粗列表项**中的*斜体*和`代码`
- 包含[链接](https://example.com)的列表项
- 列表项中的引用：
  > 这是一个在列表项内的引用块。

段落中的**加粗文本**和*斜体文本*以及`行内代码`混合排列，同时包含一个[链接](https://example.com)，并且可以包含~~删除线~~和<u>下划线</u>。

---

## HTML 标签测试

<p style="color: red;">这是直接嵌入的 HTML 段落（红色文字）。</p>

<span style="background-color: yellow;">行内 HTML 标签</span>。


应该渲染成什么样子？
```html

```


目前实际渲染成什么样子
```html
<div data-v-6f415caa="" class="md-parser-rendered preview-content"><!-- Inline TOC removed; handled at page level (BlogPost.vue) --><div class="content-block text-block" data-block-index="0"><div class="parsed-html-content"><h1>一级标题</h1></div></div><div class="content-block text-block" data-block-index="1"><div class="parsed-html-content"><h2>二级标题</h2></div></div><div class="content-block text-block" data-block-index="2"><div class="parsed-html-content"><h3>三级标题</h3></div></div><div class="content-block text-block" data-block-index="3"><div class="parsed-html-content"><h4>四级标题</h4></div></div><div class="content-block text-block" data-block-index="4"><div class="parsed-html-content"><h5>五级标题</h5></div></div><div class="content-block text-block" data-block-index="5"><div class="parsed-html-content"><h6>六级标题</h6></div></div><div class="content-block text-block" data-block-index="6"><div class="parsed-html-content"><div class="para-backslash"><strong>这是加粗文本</strong></div></div></div><div class="content-block text-block" data-block-index="7"><div class="parsed-html-content"><div class="para-backslash"><i>这是斜体文本</i></div></div></div><div class="content-block text-block" data-block-index="8"><div class="parsed-html-content"><div class="para-backslash"><strong><i>这是加粗斜体文本</i></strong></div></div></div><div class="content-block text-block" data-block-index="9"><div class="parsed-html-content"><div class="para-backslash">这是删除线文本</div></div></div><div class="content-block text-block" data-block-index="10"><div class="parsed-html-content"><div class="para-backslash"><u>这是下划线文本</u></div></div></div><div class="content-block text-block" data-block-index="11"><div class="parsed-html-content"><div class="para-backslash">这是普通文本，其中包含<code>行内代码</code>和<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="md-link">普通链接</a>。</div></div></div><div class="content-block text-block" data-block-index="12"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="a.mp3" data-name="应该自动渲染成卡片的音乐" data-type="Audio">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">应该自动渲染成卡片的音乐</div>
                <div class="file-card-subtitle">Audio</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="13"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="example.com" data-name="强制转换为音乐卡片" data-type="Audio">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">强制转换为音乐卡片</div>
                <div class="file-card-subtitle">Audio</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="14"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="v.mp4" data-name="应该自动渲染成卡片的视频" data-type="Video">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">应该自动渲染成卡片的视频</div>
                <div class="file-card-subtitle">Video</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="15"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="example.com" data-name="强制转换为视频卡片" data-type="Video">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">强制转换为视频卡片</div>
                <div class="file-card-subtitle">Video</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="16"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="t.txt" data-name="应该自动渲染成卡片的文本文档" data-type="Code/Text">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="m9 15 2 2 4-4"></path></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">应该自动渲染成卡片的文本文档</div>
                <div class="file-card-subtitle">Code/Text</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="17"><div class="parsed-html-content"><div class="para-backslash"><a href="text:example.com" target="_blank" rel="noopener noreferrer" class="md-link">强制转换为文本卡片</a></div></div></div><div class="content-block text-block" data-block-index="18"><div class="parsed-html-content"><div class="para-backslash"><div class="file-card" data-url="d.pdf" data-name="应该自动渲染成卡片的PDF文档" data-type="Document">
                       <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg></div>
                       <div class="file-card-info">
                          <div class="file-card-title">应该自动渲染成卡片的PDF文档</div>
                <div class="file-card-subtitle">Document</div>
                       </div>
                    </div></div></div></div><div class="content-block text-block" data-block-index="19"><div class="parsed-html-content"><div class="para-backslash"><a href="doc: example.com" target="_blank" rel="noopener noreferrer" class="md-link">强制转换为文档卡片</a></div></div></div><div class="content-block text-block" data-block-index="20"><div class="parsed-html-content"><div class="para-backslash"><a class="file-card" href="https://music.163.com/#/song?id=2673721054" target="_blank" rel="noopener noreferrer" data-name="强制转换为卡片的链接" data-type="music.163.com/#/song?id=2673721054">
                     <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></div>
                     <div class="file-card-info">
                       <div class="file-card-title">强制转换为卡片的链接</div>
                       <div class="file-card-subtitle">music.163.com/#/song?id=2673721054</div>
                     </div>
                   </a></div></div></div><div class="content-block text-block" data-block-index="21"><div class="parsed-html-content"><div class="para-backslash"><a class="file-card" href="mailto:j13811593@163.com" data-name="应该渲染成卡片的邮件名片" data-type="j13811593@163.com">
                     <div class="file-card-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                     <div class="file-card-info">
                       <div class="file-card-title">应该渲染成卡片的邮件名片</div>
                       <div class="file-card-subtitle">j13811593@163.com</div>
                     </div>
                   </a></div></div></div><div class="content-block text-block" data-block-index="22"><div class="parsed-html-content"><div class="para-backslash">强制类型转换的目前问题：仅<code>audio: [url]</code>等有效，而<code>audio:[url]</code>等应该也有效，但是目前无效</div></div></div><div class="content-block text-block" data-block-index="23"><div class="parsed-html-content"><div class="para-backslash">这是mermaid代码块</div></div></div><div class="content-block" data-block-index="24"><div class="code-chunk-container mermaid"><div class="editor-header"><div class="header-left"><select class="language-selector transparent-select" title="mermaid" style="font-family: var(--app-font-stack);"><option value="apache">Apache</option><option value="bash">Bash</option><option value="basic">Basic</option><option value="vb">VB</option><option value="c">C</option><option value="cpp">C++</option><option value="csharp">C#</option><option value="css">CSS</option><option value="dockerfile">Dockerfile</option><option value="git">Git</option><option value="go">Go</option><option value="html">HTML</option><option value="ini">INI/Config</option><option value="java">Java</option><option value="javascript">JavaScript</option><option value="json">JSON</option><option value="katex">KaTeX</option><option value="kotlin">Kotlin</option><option value="less">LESS</option><option value="lua">Lua</option><option value="markdown">Markdown</option><option value="matlab">MATLAB</option><option value="mermaid">Mermaid</option><option value="nginx">Nginx</option><option value="php">PHP</option><option value="powershell">PowerShell</option><option value="python">Python</option><option value="r">R</option><option value="react">React/JSX</option><option value="ruby">Ruby</option><option value="rust">Rust</option><option value="scss">SCSS</option><option value="sql">SQL</option><option value="swift">Swift</option><option value="toml">TOML</option><option value="typescript">TypeScript</option><option value="vue">Vue</option><option value="vb">Visual Basic</option><option value="xml">XML</option><option value="yaml">YAML</option><option value="plain">Plain Text</option></select></div><div class="toolbar"><!-- Mermaid group (左侧，靠近基础按钮) --><button class="icon-btn" title="editor.downloadSvg" style="margin-right: 0.25rem;"><!-- download icon --><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="M21 21H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></button><div class="toolbar-divider"></div><div class="mermaid-group"><button class="icon-btn active" title="editor.mermaidSplit"><!-- split icon: stacked panes --><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="8" rx="1" stroke="currentColor" stroke-width="1.5"></rect><rect x="3" y="13" width="18" height="8" rx="1" stroke="currentColor" stroke-width="1.5"></rect></svg></button><button class="icon-btn" title="editor.mermaidCode"><!-- code icon --><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M16 18l6-6-6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8 6l-6 6 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button><button class="icon-btn" title="editor.mermaidPreview"><!-- preview / eye icon --><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></circle></svg></button></div><div class="toolbar-divider"></div><button class="icon-btn format-btn" title="editor.formatCode"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 17h12M7 13l3-3 3 3M10 10V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button><button class="icon-btn copy-btn" title="editor.copyCode"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"></rect><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect></svg></button><button class="icon-btn clear-btn" title="editor.clearContent"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M6 14L14 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></button></div></div><div class="editor-wrapper" style="height: 92.65px;"><div class="editor-content"><!-- 语法高亮层 --><pre data-v-171339a9="" class="syntax-highlight" style="height: 92.65px; padding: 0.7rem 1.5rem 1.2rem; box-sizing: border-box;"><span data-v-171339a9=""><span class="keyword">flowchart</span> <span class="keyword">LR</span><br></span><span data-v-171339a9="">A<span class="bracket">[示例]</span><span class="operator">---</span>&gt;B<span class="bracket">[示例2]</span><span class="operator">---</span>&gt;C<span class="bracket">[示例3]</span><br></span><span data-v-171339a9=""><br></span></pre><!-- 文本输入层 --><textarea class="code-textarea" spellcheck="false" placeholder="Code here..." style="height: 92.65px; padding: 0.7rem 1.5rem 1.2rem; color: transparent; box-sizing: border-box;"></textarea></div></div><!-- mermaid 预览区域 --><div class="mermaid-preview" style="padding: 0.5rem 1rem;"><div style="align-items: center; justify-content: center; display: flex;"><svg id="mermaid_1780642550097" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 373.78125px;" viewBox="-8 -8 373.78125 55" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#mermaid_1780642550097{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}#mermaid_1780642550097 .error-icon{fill:#552222;}#mermaid_1780642550097 .error-text{fill:#552222;stroke:#552222;}#mermaid_1780642550097 .edge-thickness-normal{stroke-width:2px;}#mermaid_1780642550097 .edge-thickness-thick{stroke-width:3.5px;}#mermaid_1780642550097 .edge-pattern-solid{stroke-dasharray:0;}#mermaid_1780642550097 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid_1780642550097 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid_1780642550097 .marker{fill:#333333;stroke:#333333;}#mermaid_1780642550097 .marker.cross{stroke:#333333;}#mermaid_1780642550097 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid_1780642550097 .label{font-family:"trebuchet ms",verdana,arial,sans-serif;color:#333;}#mermaid_1780642550097 .cluster-label text{fill:#333;}#mermaid_1780642550097 .cluster-label span,#mermaid_1780642550097 p{color:#333;}#mermaid_1780642550097 .label text,#mermaid_1780642550097 span,#mermaid_1780642550097 p{fill:#333;color:#333;}#mermaid_1780642550097 .node rect,#mermaid_1780642550097 .node circle,#mermaid_1780642550097 .node ellipse,#mermaid_1780642550097 .node polygon,#mermaid_1780642550097 .node path{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}#mermaid_1780642550097 .flowchart-label text{text-anchor:middle;}#mermaid_1780642550097 .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#mermaid_1780642550097 .node .label{text-align:center;}#mermaid_1780642550097 .node.clickable{cursor:pointer;}#mermaid_1780642550097 .arrowheadPath{fill:#333333;}#mermaid_1780642550097 .edgePath .path{stroke:#333333;stroke-width:2.0px;}#mermaid_1780642550097 .flowchart-link{stroke:#333333;fill:none;}#mermaid_1780642550097 .edgeLabel{background-color:#e8e8e8;text-align:center;}#mermaid_1780642550097 .edgeLabel rect{opacity:0.5;background-color:#e8e8e8;fill:#e8e8e8;}#mermaid_1780642550097 .labelBkg{background-color:rgba(232, 232, 232, 0.5);}#mermaid_1780642550097 .cluster rect{fill:#ffffde;stroke:#aaaa33;stroke-width:1px;}#mermaid_1780642550097 .cluster text{fill:#333;}#mermaid_1780642550097 .cluster span,#mermaid_1780642550097 p{color:#333;}#mermaid_1780642550097 div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:12px;background:hsl(80, 100%, 96.2745098039%);border:1px solid #aaaa33;border-radius:2px;pointer-events:none;z-index:100;}#mermaid_1780642550097 .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#333;}#mermaid_1780642550097 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="mermaid_1780642550097_flowchart-pointEnd" class="marker flowchart" viewBox="0 0 10 10" refX="6" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid_1780642550097_flowchart-pointStart" class="marker flowchart" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid_1780642550097_flowchart-circleEnd" class="marker flowchart" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="mermaid_1780642550097_flowchart-circleStart" class="marker flowchart" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="mermaid_1780642550097_flowchart-crossEnd" class="marker cross flowchart" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid_1780642550097_flowchart-crossStart" class="marker cross flowchart" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><g class="root"><g class="clusters"></g><g class="edgePaths"><path d="M47,19.5L51.167,19.5C55.333,19.5,63.667,19.5,72,19.5C80.333,19.5,88.667,19.5,97,19.5C105.333,19.5,113.667,19.5,121.117,19.5C128.567,19.5,135.133,19.5,138.417,19.5L141.7,19.5" id="L-A-B-0" class="edge-thickness-normal edge-pattern-solid flowchart-link LS-A LE-B" style="fill:none;" marker-end="url(#mermaid_1780642550097_flowchart-pointEnd)"></path><path d="M202.391,19.5L206.557,19.5C210.724,19.5,219.057,19.5,227.391,19.5C235.724,19.5,244.057,19.5,252.391,19.5C260.724,19.5,269.057,19.5,276.507,19.5C283.957,19.5,290.524,19.5,293.807,19.5L297.091,19.5" id="L-B-C-0" class="edge-thickness-normal edge-pattern-solid flowchart-link LS-B LE-C" style="fill:none;" marker-end="url(#mermaid_1780642550097_flowchart-pointEnd)"></path></g><g class="edgeLabels"><g class="edgeLabel"><g class="label" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; white-space: nowrap;"><span class="edgeLabel"></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; white-space: nowrap;"><span class="edgeLabel"></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default default flowchart-label" id="flowchart-A-57" data-node="true" data-id="A" transform="translate(23.5, 19.5)"><rect class="basic label-container" style="" rx="0" ry="0" x="-23.5" y="-19.5" width="47" height="39"></rect><g class="label" style="" transform="translate(-16, -12)"><rect></rect><foreignObject width="32" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; white-space: nowrap;"><span class="nodeLabel">示例</span></div></foreignObject></g></g><g class="node default default flowchart-label" id="flowchart-B-58" data-node="true" data-id="B" transform="translate(174.6953125, 19.5)"><rect class="basic label-container" style="" rx="0" ry="0" x="-27.6953125" y="-19.5" width="55.390625" height="39"></rect><g class="label" style="" transform="translate(-20.1953125, -12)"><rect></rect><foreignObject width="40.390625" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; white-space: nowrap;"><span class="nodeLabel">示例2</span></div></foreignObject></g></g><g class="node default default flowchart-label" id="flowchart-C-59" data-node="true" data-id="C" transform="translate(330.0859375, 19.5)"><rect class="basic label-container" style="" rx="0" ry="0" x="-27.6953125" y="-19.5" width="55.390625" height="39"></rect><g class="label" style="" transform="translate(-20.1953125, -12)"><rect></rect><foreignObject width="40.390625" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: inline-block; white-space: nowrap;"><span class="nodeLabel">示例3</span></div></foreignObject></g></g></g></g></g></svg></div></div><div class="editor-footer"><span>行：1</span><span><span>39 字符</span> &nbsp;|&nbsp; <span>3 行</span></span></div></div></div><div class="content-block text-block" data-block-index="25"><blockquote class="md-quote-block"><div class="para-backslash">这是一级引用</div><div class="para-backslash">这是嵌套引用</div><div class="para-backslash">引用内可以包含<strong>加粗</strong>等格式。</div></blockquote></div><div class="content-block text-block" data-block-index="26"><div class="parsed-html-content"><div class="para-backslash">列表1：无序列表</div></div></div><div class="content-block text-block" data-block-index="27"><div class="parsed-html-content"><ul><li>无序列表项 1</li><li>无序列表项 2</li><li>无序列表项 3</li></ul></div></div><div class="content-block text-block" data-block-index="28"><div class="parsed-html-content"><div class="para-backslash">列表2：有序列表</div></div></div><div class="content-block text-block" data-block-index="29"><div class="parsed-html-content"><ol><li>有序列表项 1</li><li>有序列表项 2</li><li>有序列表项 3</li></ol></div></div><div class="content-block text-block" data-block-index="30"><div class="parsed-html-content"><div class="para-backslash">列表3：不规则有序列表</div></div></div><div class="content-block text-block" data-block-index="31"><div class="parsed-html-content"><ol><li>不是以1开始的列表项</li><li>任意数字列表项</li><li>任意数字列表项</li></ol></div></div><div class="content-block text-block" data-block-index="32"><div class="parsed-html-content"><div class="para-backslash">列表4：任务列表</div></div></div><div class="content-block text-block" data-block-index="33"><div class="parsed-html-content"><ul><li>[x] 已完成任务</li><li>[ ] 未完成任务</li><li>[ ] 另一个未完成任务</li></ul></div></div><div class="content-block text-block" data-block-index="34"><div class="parsed-html-content"><div class="para-backslash">中间没有段落，只有硬换行的两个同类列表，应该显示为2个列表</div></div></div><div class="content-block text-block" data-block-index="35"><div class="parsed-html-content"><ol><li>有序列表项 1</li><li>有序列表项 2</li><li>有序列表项 3</li><li>有序列表项 1</li><li>有序列表项 2</li><li>有序列表项 3</li></ol></div></div><div class="content-block" data-block-index="36"><div class="code-chunk-container javascript"><div class="editor-header"><div class="header-left"><select class="language-selector transparent-select" title="javascript" style="font-family: var(--app-font-stack);"><option value="apache">Apache</option><option value="bash">Bash</option><option value="basic">Basic</option><option value="vb">VB</option><option value="c">C</option><option value="cpp">C++</option><option value="csharp">C#</option><option value="css">CSS</option><option value="dockerfile">Dockerfile</option><option value="git">Git</option><option value="go">Go</option><option value="html">HTML</option><option value="ini">INI/Config</option><option value="java">Java</option><option value="javascript">JavaScript</option><option value="json">JSON</option><option value="katex">KaTeX</option><option value="kotlin">Kotlin</option><option value="less">LESS</option><option value="lua">Lua</option><option value="markdown">Markdown</option><option value="matlab">MATLAB</option><option value="mermaid">Mermaid</option><option value="nginx">Nginx</option><option value="php">PHP</option><option value="powershell">PowerShell</option><option value="python">Python</option><option value="r">R</option><option value="react">React/JSX</option><option value="ruby">Ruby</option><option value="rust">Rust</option><option value="scss">SCSS</option><option value="sql">SQL</option><option value="swift">Swift</option><option value="toml">TOML</option><option value="typescript">TypeScript</option><option value="vue">Vue</option><option value="vb">Visual Basic</option><option value="xml">XML</option><option value="yaml">YAML</option><option value="plain">Plain Text</option></select></div><div class="toolbar"><!-- Mermaid group (左侧，靠近基础按钮) --><!--v-if--><button class="icon-btn format-btn" title="editor.formatCode"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 17h12M7 13l3-3 3 3M10 10V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button><button class="icon-btn copy-btn" title="editor.copyCode"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" stroke-width="1.5"></rect><rect x="4" y="4" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect></svg></button><button class="icon-btn clear-btn" title="editor.clearContent"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M6 6l8 8M6 14L14 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></button></div></div><div class="editor-wrapper" style="height: 127.75px;"><div class="editor-content"><!-- 语法高亮层 --><pre data-v-171339a9="" class="syntax-highlight" style="height: 127.75px; padding: 0.7rem 1.5rem 1.2rem; box-sizing: border-box;"><span data-v-171339a9=""><span class="comment">// 这是代码块</span><br></span><span data-v-171339a9=""><span class="keyword">function</span> helloWorld<span class="bracket">(</span><span class="bracket">)</span> <span class="bracket">{</span><br></span><span data-v-171339a9="">  console<span class="operator">.</span>log<span class="bracket">(</span><span class="string">"Hello, Markdown!"</span><span class="bracket">)</span>;<br></span><span data-v-171339a9=""><span class="bracket">}</span><br></span><span data-v-171339a9=""><br></span></pre><!-- 文本输入层 --><textarea class="code-textarea" spellcheck="false" placeholder="Code here..." style="height: 127.75px; padding: 0.7rem 1.5rem 1.2rem; color: transparent; box-sizing: border-box;"></textarea></div></div><!-- mermaid 预览区域 --><!--v-if--><div class="editor-footer"><span>行：1</span><span><span>70 字符</span> &nbsp;|&nbsp; <span>5 行</span></span></div></div></div><div class="content-block text-block" data-block-index="37"><div class="parsed-html-content"><div class="para-backslash">内联代码：<code>const a = 1;</code></div></div></div><div class="content-block" data-block-index="38"><div data-v-bbccd0c5="" class="table-outer" style="width: 360px; margin-left: 10px;"><!-- 插入/删除列按钮（表头上方） --><div data-v-bbccd0c5="" class="table-insert-row"><span data-v-bbccd0c5="" class="table-dot insert-col-dot" title="插入列" style="left: -4px;"></span><span data-v-bbccd0c5="" class="table-dot insert-col-dot" title="插入列" style="left: 116px;"></span><span data-v-bbccd0c5="" class="table-dot insert-col-dot" title="插入列" style="left: 236px;"></span><span data-v-bbccd0c5="" class="table-dot insert-col-dot" title="插入列" style="left: 356px;"></span><span data-v-bbccd0c5="" class="table-dot delete-col-dot" title="删除列" style="left: 56px;"></span><span data-v-bbccd0c5="" class="table-dot delete-col-dot" title="删除列" style="left: 176px;"></span><span data-v-bbccd0c5="" class="table-dot delete-col-dot" title="删除列" style="left: 296px;"></span></div><table data-v-bbccd0c5="" class="markdown-table" style="width: 360px; margin-top: 0px;"><thead data-v-bbccd0c5=""><tr data-v-bbccd0c5=""><th data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><span data-v-bbccd0c5="" class="table-dot insert-row-dot" title="在首行前插入行" style="left: -6px; top: 24px;"></span><span data-v-bbccd0c5="" class="table-dot delete-row-dot" title="删除首行" style="left: -6px; top: 12px;"></span><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-idx="0" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 表头行高调整器：只在第一个th渲染，宽度覆盖整行 --><div data-v-bbccd0c5="" class="row-resizer-full" style="left: 0px; width: 360px;"></div></div></th><th data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-idx="1" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 表头行高调整器：只在第一个th渲染，宽度覆盖整行 --><!--v-if--></div></th><th data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-idx="2" style="height: 32px;"></textarea><!--v-if--><!-- 表头行高调整器：只在第一个th渲染，宽度覆盖整行 --><!--v-if--></div></th></tr></thead><tbody data-v-bbccd0c5=""><tr data-v-bbccd0c5=""><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><span data-v-bbccd0c5="" class="table-dot insert-row-dot" title="插入行" style="left: -6px; top: 28px; position: absolute;"></span><span data-v-bbccd0c5="" class="table-dot delete-row-dot" title="删除行" style="left: -6px; top: 16px; position: absolute;"></span><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="0" data-cidx="0" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><div data-v-bbccd0c5="" class="row-resizer-full" style="left: 0px; width: 360px;"></div></div></td><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="0" data-cidx="1" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><!--v-if--></div></td><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="0" data-cidx="2" style="height: 32px;"></textarea><!--v-if--><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><!--v-if--></div></td></tr><tr data-v-bbccd0c5=""><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><span data-v-bbccd0c5="" class="table-dot insert-row-dot" title="插入行" style="left: -6px; top: 28px; position: absolute;"></span><span data-v-bbccd0c5="" class="table-dot delete-row-dot" title="删除行" style="left: -6px; top: 16px; position: absolute;"></span><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="1" data-cidx="0" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><div data-v-bbccd0c5="" class="row-resizer-full" style="left: 0px; width: 360px;"></div></div></td><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="1" data-cidx="1" style="height: 32px;"></textarea><div data-v-bbccd0c5="" class="col-resizer"></div><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><!--v-if--></div></td><td data-v-bbccd0c5="" style="width: 120px; height: 32px; position: relative;"><div data-v-bbccd0c5="" class="cell-wrapper"><!--v-if--><!--v-if--><textarea data-v-bbccd0c5="" class="cell-input" rows="1" data-ridx="1" data-cidx="2" style="height: 32px;"></textarea><!--v-if--><!-- 行高调整器只在每行第一个td渲染，并绝对定位覆盖整行底部 --><!--v-if--></div></td></tr></tbody></table><div data-v-bbccd0c5="" class="table-width-resizer" style="height: 96px;"></div></div></div><div class="content-block text-block" data-block-index="39"><div class="parsed-html-content"><hr></div></div><div class="content-block text-block" data-block-index="40"><div class="parsed-html-content"><hr></div></div><div class="content-block text-block" data-block-index="41"><div class="parsed-html-content"><div class="para-backslash">水平分隔线（上面已有两条）</div></div></div><div class="content-block text-block" data-block-index="42"><div class="parsed-html-content"><div class="para-backslash"><div class="md-image-container">
            <div class="md-image-wrapper" data-placeholder-text="加载中">
              <img src="https://picsum.photos/200/100" alt="不该渲染成&lt;code&gt;md-image-caption&lt;/code&gt;的替代文本" class="md-image" loading="lazy" decoding="async">
              <span class="md-placeholder-text" aria-hidden="true">加载中</span>
            </div>
            <div class="md-image-caption">不该渲染成<code>md-image-caption</code>的替代文本</div>
          </div></div></div></div><div class="content-block text-block" data-block-index="43"><div class="parsed-html-content"><div class="para-backslash">使用<code>@tlylt/markdown-it-imsize</code>支持图片大小指定<br><div class="md-image-container">
            <div class="md-image-wrapper" data-placeholder-text="加载中">
              <img src="https://picsum.photos/200/100 &quot;应该渲染成&lt;code&gt;md-image-caption&lt;/code&gt;的图片标题，并且支持公式嵌入&quot; =800x600" alt="不该渲染成&lt;code&gt;md-image-caption&lt;/code&gt;的替代文本" class="md-image" loading="lazy" decoding="async">
              <span class="md-placeholder-text" aria-hidden="true">加载中</span>
            </div>
            <div class="md-image-caption">不该渲染成<code>md-image-caption</code>的替代文本</div>
          </div></div></div></div><div class="content-block text-block" data-block-index="44"><div class="parsed-html-content"><div class="para-backslash">这是一个脚注示例<a href="%E8%84%9A%E6%B3%A8%E5%86%85%E5%AE%B9%EF%BC%9A%E8%BF%99%E6%98%AF%E5%AF%B9%E6%96%87%E6%9C%AC%E7%9A%84%E8%A1%A5%E5%85%85%E8%AF%B4%E6%98%8E%E3%80%82" target="_blank" rel="noopener noreferrer" class="md-link">^1</a>，用于说明脚注功能。</div></div></div><div class="content-block text-block" data-block-index="45"><div class="parsed-html-content"><div class="para-backslash">这是一个<i>不解析为斜体</i>的示例。</div></div></div><div class="content-block text-block" data-block-index="46"><div class="parsed-html-content"><div class="para-backslash">行内公式：<span class="katex-placeholder katex-interactive katex-rendered" data-tex="E = mc^2" data-type="inline" data-unique-id="chr-5-mq0kuj8n"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:0.6833em;"></span><span class="mord mathnormal" style="margin-right:0.0576em;">E</span><span class="mspace" style="margin-right:0.2778em;"></span><span class="mrel">=</span><span class="mspace" style="margin-right:0.2778em;"></span></span><span class="base"><span class="strut" style="height:0.8141em;"></span><span class="mord mathnormal">m</span><span class="mord"><span class="mord mathnormal">c</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:0.8141em;"><span style="top:-3.063em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight">2</span></span></span></span></span></span></span></span></span></span></span></span> 和 <span class="katex-placeholder katex-interactive katex-rendered" data-tex="E = mc^2" data-type="inline" data-unique-id="chr-4-mq0kuj8n"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:0.6833em;"></span><span class="mord mathnormal" style="margin-right:0.0576em;">E</span><span class="mspace" style="margin-right:0.2778em;"></span><span class="mrel">=</span><span class="mspace" style="margin-right:0.2778em;"></span></span><span class="base"><span class="strut" style="height:0.8141em;"></span><span class="mord mathnormal">m</span><span class="mord"><span class="mord mathnormal">c</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:0.8141em;"><span style="top:-3.063em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight">2</span></span></span></span></span></span></span></span></span></span></span></span></div></div></div><div class="content-block text-block" data-block-index="47"><div class="parsed-html-content"><div class="para-backslash">单独成行的块级公式：</div></div></div><div class="content-block text-block" data-block-index="48"><div class="parsed-html-content"><div class="para-backslash">允许破坏行的块级公式：</div></div></div><div class="content-block text-block" data-block-index="49"><div class="parsed-html-content"><div class="para-backslash">这是一段示例段</div></div></div><div class="content-block text-block" data-block-index="50"><div class="parsed-html-content"><div class="katex-placeholder katex-interactive katex-rendered" data-tex="\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}" data-type="block" data-unique-id="math-1780642967785-wi7np7ytb"><span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><msubsup><mo>∫</mo><mrow><mo>−</mo><mi mathvariant="normal">∞</mi></mrow><mi mathvariant="normal">∞</mi></msubsup><msup><mi>e</mi><mrow><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup><mi>d</mi><mi>x</mi><mo>=</mo><msqrt><mi>π</mi></msqrt></mrow><annotation encoding="application/x-tex">\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:2.3846em;vertical-align:-0.9703em;"></span><span class="mop"><span class="mop op-symbol large-op" style="margin-right:0.4445em;position:relative;top:-0.0011em;">∫</span><span class="msupsub"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist" style="height:1.4143em;"><span style="top:-1.7881em;margin-left:-0.4445em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">−</span><span class="mord mtight">∞</span></span></span></span><span style="top:-3.8129em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">∞</span></span></span></span></span><span class="vlist-s">​</span></span><span class="vlist-r"><span class="vlist" style="height:0.9703em;"><span></span></span></span></span></span></span><span class="mspace" style="margin-right:0.1667em;"></span><span class="mord"><span class="mord mathnormal">e</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:1.0369em;"><span style="top:-3.113em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">−</span><span class="mord mtight"><span class="mord mathnormal mtight">x</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:0.8913em;"><span style="top:-2.931em;margin-right:0.0714em;"><span class="pstrut" style="height:2.5em;"></span><span class="sizing reset-size3 size1 mtight"><span class="mord mtight">2</span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span><span class="mord mathnormal">d</span><span class="mord mathnormal">x</span><span class="mspace" style="margin-right:0.2778em;"></span><span class="mrel">=</span><span class="mspace" style="margin-right:0.2778em;"></span></span><span class="base"><span class="strut" style="height:1.04em;vertical-align:-0.1908em;"></span><span class="mord sqrt"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist" style="height:0.8492em;"><span class="svg-align" style="top:-3em;"><span class="pstrut" style="height:3em;"></span><span class="mord" style="padding-left:0.833em;"><span class="mord mathnormal" style="margin-right:0.0359em;">π</span></span></span><span style="top:-2.8092em;"><span class="pstrut" style="height:3em;"></span><span class="hide-tail" style="min-width:0.853em;height:1.08em;"><svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice"><path d="M95,702
c-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14
c0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54
c44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10
s173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429
c69,-144,104.5,-217.7,106.5,-221
l0 -0
c5.3,-9.3,12,-14,20,-14
H400000v40H845.2724
s-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7
c-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z
M834 80h400000v40h-400000z"></path></svg></span></span></span><span class="vlist-s">​</span></span><span class="vlist-r"><span class="vlist" style="height:0.1908em;"><span></span></span></span></span></span></span></span></span></span></div></div></div><div class="content-block text-block" data-block-index="51"><div class="parsed-html-content"><div class="para-backslash">被单行块级公式破坏了</div></div></div><div class="content-block text-block" data-block-index="52"><div class="parsed-html-content"><div class="para-backslash">这是一段示例行</div></div></div><div class="content-block text-block" data-block-index="53"><div class="parsed-html-content"><div class="katex-placeholder katex-interactive katex-rendered" data-tex="\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}" data-type="block" data-unique-id="math-1780642967785-a4wl9ag1v"><span class="katex-display"><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block"><semantics><mrow><msubsup><mo>∫</mo><mrow><mo>−</mo><mi mathvariant="normal">∞</mi></mrow><mi mathvariant="normal">∞</mi></msubsup><msup><mi>e</mi><mrow><mo>−</mo><msup><mi>x</mi><mn>2</mn></msup></mrow></msup><mi>d</mi><mi>x</mi><mo>=</mo><msqrt><mi>π</mi></msqrt></mrow><annotation encoding="application/x-tex">\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base"><span class="strut" style="height:2.3846em;vertical-align:-0.9703em;"></span><span class="mop"><span class="mop op-symbol large-op" style="margin-right:0.4445em;position:relative;top:-0.0011em;">∫</span><span class="msupsub"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist" style="height:1.4143em;"><span style="top:-1.7881em;margin-left:-0.4445em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">−</span><span class="mord mtight">∞</span></span></span></span><span style="top:-3.8129em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">∞</span></span></span></span></span><span class="vlist-s">​</span></span><span class="vlist-r"><span class="vlist" style="height:0.9703em;"><span></span></span></span></span></span></span><span class="mspace" style="margin-right:0.1667em;"></span><span class="mord"><span class="mord mathnormal">e</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:1.0369em;"><span style="top:-3.113em;margin-right:0.05em;"><span class="pstrut" style="height:2.7em;"></span><span class="sizing reset-size6 size3 mtight"><span class="mord mtight"><span class="mord mtight">−</span><span class="mord mtight"><span class="mord mathnormal mtight">x</span><span class="msupsub"><span class="vlist-t"><span class="vlist-r"><span class="vlist" style="height:0.8913em;"><span style="top:-2.931em;margin-right:0.0714em;"><span class="pstrut" style="height:2.5em;"></span><span class="sizing reset-size3 size1 mtight"><span class="mord mtight">2</span></span></span></span></span></span></span></span></span></span></span></span></span></span></span></span><span class="mord mathnormal">d</span><span class="mord mathnormal">x</span><span class="mspace" style="margin-right:0.2778em;"></span><span class="mrel">=</span><span class="mspace" style="margin-right:0.2778em;"></span></span><span class="base"><span class="strut" style="height:1.04em;vertical-align:-0.1908em;"></span><span class="mord sqrt"><span class="vlist-t vlist-t2"><span class="vlist-r"><span class="vlist" style="height:0.8492em;"><span class="svg-align" style="top:-3em;"><span class="pstrut" style="height:3em;"></span><span class="mord" style="padding-left:0.833em;"><span class="mord mathnormal" style="margin-right:0.0359em;">π</span></span></span><span style="top:-2.8092em;"><span class="pstrut" style="height:3em;"></span><span class="hide-tail" style="min-width:0.853em;height:1.08em;"><svg xmlns="http://www.w3.org/2000/svg" width="400em" height="1.08em" viewBox="0 0 400000 1080" preserveAspectRatio="xMinYMin slice"><path d="M95,702
c-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14
c0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54
c44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10
s173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429
c69,-144,104.5,-217.7,106.5,-221
l0 -0
c5.3,-9.3,12,-14,20,-14
H400000v40H845.2724
s-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7
c-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z
M834 80h400000v40h-400000z"></path></svg></span></span></span><span class="vlist-s">​</span></span><span class="vlist-r"><span class="vlist" style="height:0.1908em;"><span></span></span></span></span></span></span></span></span></span></div></div></div><div class="content-block text-block" data-block-index="54"><div class="parsed-html-content"><div class="para-backslash">被多行块级公式破坏了</div></div></div><div class="content-block text-block" data-block-index="55"><div class="parsed-html-content"><hr></div></div><div class="content-block text-block" data-block-index="56"><div class="parsed-html-content"><h2>软换行与硬换行测试</h2></div></div><div class="content-block text-block" data-block-index="57"><div class="parsed-html-content"><div class="para-backslash">这行后面有两个空格（可在源码中查看）<br>这行是硬换行（`<br>`）的效果。</div></div></div><div class="content-block text-block" data-block-index="58"><div class="parsed-html-content"><div class="para-backslash">这行后面没有两个空格 这行是软换行，中间会被解析为一个普通空格。</div></div></div><div class="content-block text-block" data-block-index="59"><div class="parsed-html-content"><hr></div></div><div class="content-block text-block" data-block-index="60"><div class="parsed-html-content"><h2>混合样式测试</h2></div></div><div class="content-block text-block" data-block-index="61"><div class="parsed-html-content"><ul><li><strong>加粗列表项</strong>中的<i>斜体</i>和<code>代码</code></li><li>包含<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="md-link">链接</a>的列表项</li><li>列表项中的引用：</li></ul></div></div><div class="content-block text-block" data-block-index="62"><div class="parsed-html-content"><div class="para-backslash">段落中的<strong>加粗文本</strong>和<i>斜体文本</i>以及<code>行内代码</code>混合排列，同时包含一个<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="md-link">链接</a>，并且可以包含删除线和<u>下划线</u>。</div></div></div><div class="content-block text-block" data-block-index="63"><div class="parsed-html-content"><hr></div></div><div class="content-block text-block" data-block-index="64"><div class="parsed-html-content"><h2>HTML 标签测试</h2></div></div><div class="content-block text-block" data-block-index="65"><div class="parsed-html-content"><div class="para-backslash"><span style="background-color: yellow;">行内 HTML 标签</span>。</div></div></div><!-- Math Interaction Popup moved to standalone component (loaded after heavy components) --><!--teleport start--><!--teleport end--></div>
```
