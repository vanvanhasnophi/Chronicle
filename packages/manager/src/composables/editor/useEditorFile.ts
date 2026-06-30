/**
 * useEditorFile — 编辑器文件 I/O 操作
 *
 * 职责：保存、发布、导出、打印、Mermaid 渲染。
 * 支持三条保存路径：
 *   1. 本地文件   — File System Access API / Blob 下载
 *   2. 云端草稿   — POST /api/post (status=draft)
 *   3. 云端发布   — POST /api/post (status=published) → 触发 Astro 构建
 *
 * 依赖：useEditorFrontmatter（frontmatter 状态）、useEditorMedia（本地文件上传解析）
 */
import { ref, type Ref, type ComputedRef } from 'vue'
import type { SavedFm } from './useEditorFrontmatter'
import { renderPreview } from '../../utils/markdownPreview'
import { convertToHtml } from '../../utils/markdownParser'
import { triggerBuild } from '../useAstroBuild'
import { settingsStore } from '../settingsApi'
import pptxgen from 'pptxgenjs'
import _chronicleCSS from '@chronicle/shared/src/styles/chronicle-markdown.css?inline'

// ══════════════════════════════════════════════════════
// 内联 CSS（导出时嵌入独立 HTML）
// ══════════════════════════════════════════════════════

/** 与预览渲染引擎完全一致的 chronicle-markdown.css，Vite ?inline 构建时为字符串 */
const CHRONICLE_CSS: string = (_chronicleCSS as any).default || String(_chronicleCSS)

/** Marp 主题——直接复用预览窗格的 chronicleThemes，保证与预览所见一致 */
import { chronicleLightTheme, chronicleDarkTheme } from '../../utils/chronicleThemes'

/**
 * 导出专用覆盖样式（叠加在 chronicle-markdown.css 之上）：
 *   - body 居中 + 限宽
 *   - light/dark toggle 按钮
 *   - 图片始终居中
 *   - dark mode 变量覆盖 + prefers-color-scheme 回退
 *   - 打印隐藏交互元素
 */
const EXPORT_OVERRIDE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap');
:root{
--app-font-stack:-apple-system,BlinkMacSystemFont,'InterVariable','Inter','Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;
--app-font-stack-serif:'Noto Serif SC',serif;
--app-font-stack-mono:'Consolas','SF Mono','Menlo','Monaco','Courier New',monospace;
--text-primary:#111;--text-secondary:#4b5563;--app-text-primary:#111;
--border-color:#e5e7eb;--accent-color:#2563eb;--accent-color-dark:#1d4ed8;--accent-contrast:#fff;
--code-bg:#f5f5f5c0;--code-inline:#f3f4f6;
--code-keyword:#7c3aed;--code-string:#059669;--code-comment:#6b7280;--code-number:#d97706;
--code-type:#2563eb;--code-tag:#2563eb;--code-attribute:#7c3aed;--code-property:#059669;
--code-selector:#d97706;--code-operator:#4b5563;--code-variable:#111;--code-text:#111;
--code-quote:#059669;--code-link:#2563eb;--code-boolean:#d97706;--code-preprocessor:#dc2626;
--code-section:#2563eb;--code-directive:#7c3aed;--code-parameter:#4b5563;--code-cmdlet:#7c3aed;
--code-katexcommand:#2563eb;
--component-bg-primary:#fafafa;--component-bg-blur:rgba(250,250,250,.8);--component-bg-blur-alt:rgba(245,245,245,.7);
--component-bg-hover:#f3f4f690;--component-bg-highlight:#e5e7eb90;--component-bg-active:#d1d5db90;
--component-text-primary:#111;--component-text-secondary:#6b7280;
--status-error:#dc2626;--status-warning:#f59e0b;--featured:#f59e0b;
--toc-scroll-offset:100px;
}
body{max-width:800px;margin:0 auto;padding:40px 48px;font-family:var(--app-font-stack);background:var(--component-bg-primary);color:var(--text-primary)}
body[data-font="serif"]{font-family:var(--app-font-stack-serif)}
.article-title{font-size:2.5rem;line-height:1.25;margin-bottom:2.5rem;font-weight:600;font-variation-settings:'wght' 600;border-bottom:1px solid var(--border-color);padding-bottom:1.5rem;color:var(--text-primary)}
.code-chunk-header{padding:0 1rem}
.code-chunk-lang{font-size:0.85rem;font-family:var(--app-font-stack);color:var(--component-text-secondary)}
pre{margin-block:0}
.chronicle-markdown .md-image {width:auto;height:auto;}
img,.md-image{display:block;max-width:100%;margin-left:auto;margin-right:auto;cursor:default!important;opacity:1!important;filter:none!important;transition:none!important}
[data-theme="dark"]{--text-primary:#e5e7eb;--text-secondary:#9ca3af;--app-text-primary:#e5e7eb;--border-color:#333;--accent-color:#3b82f6;--accent-color-dark:#60a5fa;--accent-contrast:#111;--code-bg:#1a1a1ac0;--code-inline:#1f1f1f;--code-keyword:#a78bfa;--code-string:#34d399;--code-comment:#6b7280;--code-number:#fbbf24;--code-type:#60a5fa;--code-tag:#60a5fa;--code-attribute:#a78bfa;--code-property:#34d399;--code-selector:#fbbf24;--code-operator:#9ca3af;--code-variable:#e5e7eb;--code-text:#e5e7eb;--code-quote:#34d399;--code-link:#60a5fa;--code-boolean:#fbbf24;--code-preprocessor:#f87171;--code-section:#60a5fa;--code-directive:#a78bfa;--code-parameter:#9ca3af;--code-cmdlet:#a78bfa;--code-katexcommand:#60a5fa;--component-bg-primary:#1a1a1a;--component-bg-blur:rgba(40,40,40,.9);--component-bg-blur-alt:rgba(60,60,60,.7);--component-bg-hover:#fff2;
--component-bg-highlight:#fff2;--component-bg-active:#fff3;
--component-text-primary:#e5e7eb;--component-text-secondary:#9ca3af}
.theme-toggle{position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;border:1px solid var(--border-color);background:var(--component-bg-primary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100;transition:background .2s}
.theme-toggle svg{width:16px;height:16px;display:block}
.theme-toggle:hover{background:var(--component-bg-hover)}
@media print{body{padding:16px;max-width:none}.no-print{display:none!important}img,.md-image{opacity:1!important;filter:none!important;display:block!important;max-width:100%!important}}
@media (prefers-color-scheme:dark){:root:not([data-theme]){--text-primary:#e5e7eb;--text-secondary:#9ca3af;--app-text-primary:#e5e7eb;--border-color:#333;--accent-color:#3b82f6;--accent-color-dark:#60a5fa;--code-bg:#1a1a1a;--code-inline:#1f1f1f;--code-keyword:#a78bfa;--code-string:#34d399;--code-comment:#6b7280;--code-number:#fbbf24;--code-type:#60a5fa;--code-tag:#60a5fa;--code-attribute:#a78bfa;--code-property:#34d399;--code-selector:#fbbf24;--code-operator:#9ca3af;--code-variable:#e5e7eb;--code-text:#e5e7eb;--code-quote:#34d399;--code-link:#60a5fa;--code-boolean:#fbbf24;--code-preprocessor:#f87171;--code-section:#60a5fa;--code-directive:#a78bfa;--code-parameter:#9ca3af;--code-cmdlet:#a78bfa;--code-katexcommand:#60a5fa;--component-bg-primary:#1a1a1a;--component-bg-blur:rgba(26,26,26,.9);--component-bg-blur-alt:rgba(30,30,30,.7);--component-bg-hover:#222;--component-bg-highlight:#2a2a2a;--component-bg-active:#333;--component-text-primary:#e5e7eb;--component-text-secondary:#9ca3af}}
/* KaTeX 离线字体兜底——各系统自带数学字体 */
.katex,.katex .mord,.katex .mbin,.katex .mrel,.katex .mopen,.katex .mclose,.katex .mpunct,.katex .minner,.katex .mathit,.katex .mathbf,.katex .mainit{font-family:KaTeX_Main,Cambria Math,STIX Two Math,Latin Modern Math,serif}
.katex .amsrm,.katex .mathbb{font-family:KaTeX_AMS,Cambria Math,STIX Two Math,serif}
.katex .mathcal{font-family:KaTeX_Caligraphic,Cambria Math,STIX Two Math,serif}
.katex .mathfrak{font-family:KaTeX_Fraktur,serif}
.katex .mathtt{font-family:KaTeX_Typewriter,Menlo,Courier New,monospace}
.katex .mathscr{font-family:KaTeX_Script,serif}
.katex .mathsf{font-family:KaTeX_SansSerif,sans-serif}
.katex-html{cursor:default}
.katex:hover,.katex-html:hover,.katex-mathml:hover{background:transparent!important}
.mermaid-prerendered{display:flex;justify-content:center;padding:10px 0}
.mermaid-prerendered svg{max-width:100%;height:auto}
.mermaid-prerendered svg,.mermaid-prerendered svg *{font-family:inherit!important}
.mermaid-prerendered svg .nodeLabel,.mermaid-prerendered svg .label,.mermaid-prerendered svg .messageText,.mermaid-prerendered svg .legend text{fill:var(--component-text-primary)!important;color:var(--component-text-primary)!important}
.mermaid-prerendered svg .node rect,.mermaid-prerendered svg .node circle,.mermaid-prerendered svg .node ellipse,.mermaid-prerendered svg .node polygon,.mermaid-prerendered svg .cluster rect,.mermaid-prerendered svg .node path{fill:none!important;stroke:var(--component-text-secondary)!important}
.mermaid-prerendered svg .edgePath .path,.mermaid-prerendered svg .flowchart-link{stroke:var(--component-text-secondary)!important}
.mermaid-prerendered svg .edgeLabel text,.mermaid-prerendered svg .edgeLabel rect,.mermaid-prerendered svg .edgeLabel span{fill:var(--component-bg-primary)!important}
.mermaid-prerendered svg marker path{stroke:var(--component-text-secondary)!important;stroke-width:1.5!important}
.mermaid-prerendered svg .actor,.mermaid-prerendered svg .labelBox{fill:none!important;stroke:var(--component-text-secondary)!important}
`

/**
 * useEditorFile 的依赖注入选项。
 * 所有外部状态和函数通过此接口传入，保持 composable 无隐式依赖。
 */
export interface EditorFileOptions {
  editorType: Ref<'article' | 'slides'>
  localValue: Ref<string>
  // ── Frontmatter state (来自 useEditorFrontmatter) ──
  postTitle: Ref<string>
  isDefaultTitle: Ref<boolean>
  postId: Ref<string | null>
  postStatus: Ref<'local' | 'draft' | 'published' | 'modifying' | 'building'>
  postDate: Ref<string>
  postUpdated: Ref<string>
  postTags: Ref<string[]>
  postFont: Ref<string>
  postAuthor: Ref<string>
  postAIGenerated: Ref<boolean>
  slideshowConfig: Ref<Record<string, any>>
  // ── 编辑模式 ──
  isCloudEditing: ComputedRef<boolean>
  isAboutMode: ComputedRef<boolean>
  editorQueryId: ComputedRef<string | undefined>
  // ── 认证 ──
  isCloudAuthenticated: () => boolean
  refreshCloudAuthState: () => boolean
  goToLogin: (nextUrl: string) => void
  // ── Frontmatter 工具函数 ──
  buildSavedFm: () => SavedFm
  normalizeBody: (raw: string) => string
  stringifyFrontmatter: (data: Record<string, any>, content: string) => string
  CHRONICLE_FM_KEYS: Set<string>
  // ── 模态框 ──
  activeModal: Ref<string>
  openModal: <T>(name: string, props?: Record<string, any>) => Promise<T | null>
  // ── 通知 / i18n / 网络 ──
  showToast: (msg: string, opts?: any) => void
  t: (key: string) => string
  fetchWithAuth: any
  // ── 文件句柄 ──
  currentFileHandle: Ref<any>
  currentFilePath: Ref<string | null>
  // ── 脏检测基线 ──
  savedContent: Ref<string>
  savedFm: Ref<SavedFm>
  // ── 路由 ──
  route: any
  router: any
  locale: Ref<string>
  // ── 资源 ──
  assetMap: Ref<Record<string, string>>
  // ── 媒体解析 (来自 useEditorMedia) ──
  resolveLocalFileUrls: (md: string) => Promise<Record<string, string>>
  applyUrlMappings: (md: string, mapping: Record<string, string>) => string
  fileMap: Map<string, File>
  // ── Mermaid / HTML 工具 ──
  prerenderMermaidInCompiledHtml: (html: string) => Promise<string>
  escapeHtml: (text: string) => string
  // ── 最近项目 ──
  pushRecentProject: (meta: { title: string; path?: string; cloud?: boolean }) => void
}

export function useEditorFile(options: EditorFileOptions) {
  const {
    editorType, localValue, postTitle, isDefaultTitle, postId, postStatus,
    postDate, postUpdated, postTags, postFont, postAuthor, postAIGenerated,
    slideshowConfig, isCloudEditing, isAboutMode, editorQueryId,
    isCloudAuthenticated, refreshCloudAuthState, goToLogin,
    buildSavedFm, normalizeBody, activeModal, showToast, t,
    fetchWithAuth, currentFileHandle, currentFilePath, savedContent, savedFm,
    route, router, locale, assetMap,
    resolveLocalFileUrls, applyUrlMappings, prerenderMermaidInCompiledHtml,
    escapeHtml, CHRONICLE_FM_KEYS, stringifyFrontmatter,
    pushRecentProject,
  } = options

  // ══════════════════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════════════════

  /** 正在保存中（禁用保存按钮、显示 spinner） */
  const isSaving = ref(false)
  /** 正在触发 Astro SSG 构建 */
  const isBuilding = ref(false)
  /** 最近一次保存时间（ISO 字符串），用于状态栏展示 */
  const lastSavedTime = ref('')
  /** 保存/发布弹窗中编辑的临时标题 */
  const tempTitle = ref('')

  // ══════════════════════════════════════════════════════
  // 文件内容构建
  // ══════════════════════════════════════════════════════

  /**
   * 将当前 frontmatter 状态 + 正文序列化为完整 .md 文件内容。
   *
   * 幻灯片特殊处理：
   *   - 检测正文中的 Marp frontmatter（`marp: true`, `theme:`, `size:` 等）
   *   - 将 Marp 专属键合并到 Chronicle frontmatter 中
   *   - 合并 slideshowConfig 面板设置（theme, ratio, footer）
   */
  function buildFileContent(): string {
    const now = new Date().toISOString()
    const fm: Record<string, any> = {
      title: postTitle.value || '',
      date: postDate.value || now,
      tags: postTags.value.length ? postTags.value : [],
      author: postAuthor.value || '',
      aiGenerated: postAIGenerated.value || false,
    }
    if (editorType.value !== 'slides') {
      fm.font = postFont.value || 'sans'
    }
    let body = localValue.value
    if (editorType.value === 'slides') {
      // 检测正文中的 Marp YAML frontmatter 并提取非 Chronicle 键
      const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n?/)
      if (fmMatch) {
        const rawFm = fmMatch[1]
        const isMarp = /^(marp|theme|size|footer|paginate|header|class|backgroundColor|backgroundImage|color):/m.test(rawFm)
        if (isMarp) {
          body = body.slice(fmMatch[0].length)
          rawFm.split('\n').forEach(line => {
            const c = line.indexOf(':')
            if (c < 0) return
            const k = line.slice(0, c).trim()
            const v = line.slice(c + 1).trim().replace(/^"(.*)"$/, '$1')
            if (k && !CHRONICLE_FM_KEYS.has(k)) {
              fm[k] = v === 'true' ? true : v === 'false' ? false : v
            }
          })
        }
      }
      fm.marp = true
      // slideshowConfig 面板设置作为 fallback（正文 Marp FM 优先）
      const ss = slideshowConfig.value || {}
      if (ss.theme && !fm.theme) fm.theme = ss.theme
      if (ss.ratio && !fm.size) fm.size = ss.ratio
      if (ss.footer && !fm.footer) fm.footer = ss.footer
    }
    return stringifyFrontmatter(fm, body)
  }

  // ══════════════════════════════════════════════════════
  // 本地文件写入
  // ══════════════════════════════════════════════════════

  /**
   * 写入 File System Access API 文件句柄。
   * 兼容新旧 API：createWritable（现代）/ write（旧版）。
   */
  async function writeFileHandle(handle: any, contents: string) {
    if (!handle) return false
    try {
      if (handle.createWritable) {
        const writable = await handle.createWritable()
        await writable.write(contents)
        await writable.close()
        return true
      } else if (handle.write) {
        await handle.write(contents)
        return true
      }
    } catch (e) { console.error('writeFileHandle error', e) }
    return false
  }

  /**
   * 保存到当前文件句柄（已有路径）。
   * 无句柄时退化为 saveAs()。
   */
  async function saveFile() {
    try {
      if (currentFileHandle.value) {
        if (!postDate.value) postDate.value = new Date().toISOString()
        const contents = buildFileContent()
        const ok = await writeFileHandle(currentFileHandle.value, contents)
        if (ok) {
          savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
          savedFm.value = buildSavedFm()
          pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
          showToast(t('editor.file.savedToFile') as string)
          activeModal.value = 'none'
          return true
        }
      }
      return await saveAs()
    } catch (e) { console.error('saveFile failed', e); return false }
  }

  /**
   * 另存为：优先 File System Access API 弹出保存对话框，
   * 浏览器不支持时 fallback 到 Blob 下载。
   */
  async function saveAs() {
    if (!postDate.value) postDate.value = new Date().toISOString()
    const contents = buildFileContent()
    // 尝试 File System Access API
    if ((window as any).showSaveFilePicker) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
        })
        const ok = await writeFileHandle(handle, contents)
        if (ok) {
          currentFileHandle.value = handle
          currentFilePath.value = handle.name || null
          savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
          savedFm.value = buildSavedFm()
          pushRecentProject({ title: postTitle.value, path: currentFilePath.value || undefined, cloud: false })
          showToast(t('editor.file.savedToFile') as string)
          activeModal.value = 'none'
          return true
        }
      } catch (e) { console.error('saveAs: File System API failed, falling back to download', e) }
    }
    // Blob 下载 fallback
    const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const filename = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast(t('editor.file.savedToFile') as string)
    return true
  }

  // ══════════════════════════════════════════════════════
  // Marp 幻灯片渲染 — 内置 Chronicle 主题的单例引擎
  // ══════════════════════════════════════════════════════

  let _marpCore: any = null
  async function getMarpCore() {
    if (_marpCore) return _marpCore
    const mod = await import('@marp-team/marp-core')
    _marpCore = (mod as any).default || mod
    return _marpCore
  }

  /** 使用内置 Chronicle 主题的 Marp 引擎渲染幻灯片为 HTML。每次重建引擎以反映最新主题配置。 */
  async function renderSlidesToHTML(md: string): Promise<{ html: string; css: string }> {
    try {
      const Marp = await getMarpCore()
      const marp = new Marp({ html: true })
      // 从 frontmatter 读取 accent / accent-color / tinted-bg
      const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
      let fmAccent = '', tintedBg = false
      if (fmMatch) {
        const am = fmMatch[1].match(/^accent-color:\s*(\S+)/m) || fmMatch[1].match(/^accent:\s*(\S+)/m)
        if (am) fmAccent = am[1].replace(/["']/g, '')
        const tb = fmMatch[1].match(/^tinted-bg:\s*(\S+)/m)
        if (tb) tintedBg = tb[1] === 'true'
      }
      const accent = (fmAccent === 'follow')
        ? (getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#2563eb')
        : (fmAccent && fmAccent !== 'default' ? fmAccent : '#2563eb')
      try { marp.themeSet.add(chronicleLightTheme(accent, tintedBg)) } catch (e) { console.warn('[useEditorFile] Failed to register Chronicle theme', e) }
      try { marp.themeSet.add(chronicleDarkTheme(accent, tintedBg)) } catch (e) { console.warn('[useEditorFile] Failed to register Chronicle Dark theme', e) }
      // 若正文未显式指定 theme，默认使用 chronicle 主题
      let renderMd = md
      if (!/^theme:\s*\S/m.test(md)) {
        const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
        if (fmMatch) {
          renderMd = `---\n${fmMatch[1]}\ntheme: chronicle\n---${md.slice(fmMatch[0].length)}`
        } else {
          renderMd = `---\ntheme: chronicle\n---\n\n${md}`
        }
      }
      const r = marp.render(renderMd)
      // 后处理：Mermaid 代码块 → 预渲染 SVG
      let html = r.html
      if (html.includes('language-mermaid') || html.includes('mermaid')) {
        try {
          const mermaidMod = await import('mermaid')
          const mermaid = (mermaidMod && (mermaidMod as any).default) || mermaidMod
          try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const codes = doc.querySelectorAll('pre code.language-mermaid, code[class*="mermaid"]')
          for (const code of codes) {
            const pre = code.closest('pre')
            const text = code.textContent || ''
            if (!text.trim() || !pre) continue
            try {
              const id = 'mermaid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
              const res = await mermaid.render(id, text.trim())
              let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
              if (svg) {
                const wrapper = doc.createElement('div')
                wrapper.className = 'mermaid-prerendered'
                wrapper.innerHTML = svg
                pre.replaceWith(wrapper)
              }
            } catch { /* skip failed Mermaid blocks */ }
          }
          html = doc.body.innerHTML
        } catch { /* Mermaid not available */ }
      }
      return { html, css: r.css }
    } catch (e) {
      console.error('renderSlidesToHTML failed', e)
      return { html: `<section><pre>${escapeHtml(md)}</pre></section>`, css: '' }
    }
  }

  // ══════════════════════════════════════════════════════
  // 静态渲染管线 — 将交互式 preview HTML 转为纯静态 HTML
  // ══════════════════════════════════════════════════════

  /**
   * 将 renderPreview 产出的交互式 HTML 转为导出专用的纯静态 HTML：
   *   1. 代码块 → 静态 .code-chunk-container（无 copy 按钮、无 textarea）
   *   2. 图片 → 移除 onload/onerror/Loading 占位
   *   3. KaTeX → 预渲染为 HTML
   *   4. Mermaid → 预渲染为 SVG
   */
  async function renderStaticHTML(md: string): Promise<string> {
    // 1. 先 KaTeX 预渲染（在 HTML 字符串上，避免 DOM 序列化破坏占位符格式）
    let html = renderPreview(md)
    if (!html) return ''

    html = await prerenderKatexInHTML(html)

    // 2. 用 DOM 处理代码块和图片（结构变换）
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstChild as HTMLElement
    if (!root) return html

    // 代码块去交互化，Mermaid 特殊处理：预渲染为 SVG
    for (const chunk of Array.from(root.querySelectorAll('.code-chunk-container'))) {
      const langEl = chunk.querySelector('.language-selector option[selected]')
      const lang = langEl?.getAttribute('value') || langEl?.textContent || 'plain'
      const textarea = chunk.querySelector('textarea')
      const rawCode = textarea ? textarea.value || textarea.textContent || '' : ''

      // Mermaid：预渲染为静态 SVG
      if (lang === 'mermaid' && rawCode.trim()) {
        try {
          const mermaidMod = await import('mermaid')
          const mermaid = (mermaidMod && (mermaidMod as any).default) || mermaidMod
          try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
          const id = 'mermaid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
          const res = await mermaid.render(id, rawCode)
          let svg = (res && (res.svg || res)) ? String(res.svg || res) : ''
          // 箭头 marker → 敞口 V 形（去闭合边，只保留两条斜线）
          svg = svg.replace(
            /(<marker[^>]*id="[^"]*arrowhead[^"]*"[^>]*>)([\s\S]*?)<\/marker>/g,
            (_m: string, open: string, body: string) => {
              body = body.replace(/fill="context-stroke"/g, 'fill="none" stroke="context-stroke" stroke-linejoin="round"')
              body = body.replace(/\s*z\s*("|\/)/g, '$1') // 去掉 closePath
              return open + body + '</marker>'
            },
          )
          const wrapper = doc.createElement('div')
          wrapper.className = 'mermaid-prerendered'
          wrapper.innerHTML = `<div class="mermaid-svg">${svg}</div>`
          chunk.replaceWith(wrapper)
          continue
        } catch (e) { console.warn('Mermaid render failed for export', e) }
      }

      // 普通代码块
      const pre = chunk.querySelector('pre')
      const code = pre?.querySelector('code')
      chunk.innerHTML = ''
      const header = doc.createElement('div')
      header.className = 'code-chunk-header'
      const langSpan = doc.createElement('span')
      langSpan.className = 'code-chunk-lang'
      langSpan.textContent = lang
      header.appendChild(langSpan)
      chunk.appendChild(header)
      const body = doc.createElement('div')
      body.className = 'code-chunk-body'
      if (pre && code) {
        pre.className = ''
        code.className = ''
        body.appendChild(pre)
      } else {
        const fallback = doc.createElement('pre')
        const fc = doc.createElement('code')
        fc.textContent = rawCode
        fallback.appendChild(fc)
        body.appendChild(fallback)
      }
      chunk.appendChild(body)
    }

    // 图片：移除 wrapper，样式直写到 img，去掉 onload/onerror/占位
    for (const container of Array.from(root.querySelectorAll('.md-image-container'))) {
      const wrapper = container.querySelector('.md-image-wrapper')
      const img = wrapper?.querySelector('img')
      const caption = container.querySelector('.md-image-caption')
      if (!img) { container.remove(); continue }
      img.removeAttribute('onload')
      img.removeAttribute('onerror')
      img.removeAttribute('loading')
      img.setAttribute('loading', 'eager')
      const wrapperStyle = wrapper?.getAttribute('style') || ''
      if (wrapperStyle) img.setAttribute('style', wrapperStyle)
      // 替换：container → img + caption
      const frag = doc.createDocumentFragment()
      frag.appendChild(img)
      if (caption) frag.appendChild(caption)
      container.replaceWith(frag)
    }

    // file-card：div → a 标签，恢复链接跳转
    for (const card of Array.from(root.querySelectorAll('.file-card'))) {
      const url = card.getAttribute('data-url') || card.getAttribute('href')
      if (!url) continue
      const anchor = doc.createElement('a')
      anchor.className = 'file-card'
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener'
      anchor.innerHTML = card.innerHTML
      card.replaceWith(anchor)
    }

    html = root.innerHTML
    return html
  }

  // ══════════════════════════════════════════════════════
  // KaTeX 单例引擎
  // ══════════════════════════════════════════════════════

  let _katex: any = null
  async function getKatex() {
    if (_katex) return _katex
    const mod = await import('katex')
    _katex = (mod as any).default || mod
    return _katex
  }

  /** 将 KaTeX 占位符预渲染为静态 HTML */
  async function prerenderKatexInHTML(html: string): Promise<string> {
    if (!html.includes('katex-interactive')) return html
    try {
      const katex = await getKatex()
      // 匹配整个占位符标签：<span/div class="katex-placeholder katex-interactive" data-tex="…" data-type="inline|block" …>…</span/div>
      const re = /<(span|div)\s[^>]*class="[^"]*\bkatex-placeholder\b[^"]*\bkatex-interactive\b[^"]*"[^>]*data-tex="([^"]*)"[^>]*data-type="(inline|block)"[^>]*>[\s\S]*?<\/\1>/g
      return html.replace(re, (_m: string, _tag: string, tex: string, type: string) => {
        try {
          const rendered = katex.renderToString(tex, {
            throwOnError: false,
            displayMode: type === 'block',
          })
          return type === 'block'
            ? `<div class="katex-block">${rendered}</div>`
            : `<span class="katex-inline">${rendered}</span>`
        } catch {
          return `<code>${escapeHtml(tex)}</code>`
        }
      })
    } catch {
      return html
    }
  }

  /** 构建文章独立 HTML（含完整 chronicle-markdown CSS，无外部依赖） */
  function buildArticleStandaloneHtml(title: string, bodyHtml: string, lang: string, font?: string): string {
    const katexTag = KATEX_TAG
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${CHRONICLE_CSS}</style>
<style>${EXPORT_OVERRIDE}</style>
${katexTag}
</head>
<body${font ? ` data-font="${font}"` : ''}>
  <button class="theme-toggle no-print" id="theme-toggle" title="Toggle light/dark" aria-label="Toggle theme"><svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
  ${title ? `<h1 class="article-title">${escapeHtml(title)}</h1>` : ''}
  <div class="chronicle-markdown">${bodyHtml}</div>
<script>
(function(){var h=document.documentElement;var b=document.getElementById('theme-toggle');var sun='<svg class="theme-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';var moon='<svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';var s=localStorage.getItem('chronicle-export-theme');if(s==='dark'){h.dataset.theme='dark';b.innerHTML=moon}else if(s==='light'){h.dataset.theme='light';b.innerHTML=sun}b.addEventListener('click',function(){var c=h.dataset.theme==='dark'?'light':'dark';h.dataset.theme=c;b.innerHTML=c==='dark'?moon:sun;localStorage.setItem('chronicle-export-theme',c)})})()
<\/script>
</body>
</html>`
  }

  /** KaTeX CSS — CDN 加载，所有主流 CMS 标准做法。字体由 CDN 自动处理。 */
  const KATEX_TAG = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">'

  /** 构建幻灯片独立 HTML（含 Marp CSS，自包含） */
  function buildSlidesStandaloneHtml(title: string, bodyHtml: string, css: string, lang: string): string {
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap);</style>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;background:#000;color:#fff}
  .slides-wrapper{max-width:1280px;margin:0 auto;padding:40px 0}
  @media print{body{background:#fff}}
  ${css}
</style>
</head>
<body>
  <div class="slides-wrapper">${bodyHtml}</div>
</body>
</html>`
  }

  /** 构建幻灯片打印 HTML（每页一 slide，含 Marp CSS） */
  function buildSlidesPrintHtml(title: string, bodyHtml: string, css: string, lang: string): string {
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Print</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap);</style>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif}
  @media print{
    @page{margin:0;size:1280px 720px}
    body{margin:0}
    section{page-break-after:always}
  }
  ${css}
</style>
</head>
<body>${bodyHtml}</body>
</html>`
  }

  /** 将幻灯片 HTML 解析为 pptxgenjs 文本对象数组 */
  function parseSlideHTMLToTextObjects(sectionHTML: string): pptxgen.TextProps[] {
    const result: pptxgen.TextProps[] = []

    // 剥离 SVG/foreignObject 包裹层，提取纯 HTML 内容
    let html = sectionHTML
    const foMatch = html.match(/<foreignObject[^>]*>([\s\S]*?)<\/foreignObject>/i)
    if (foMatch) html = foMatch[1]
    const secMatch = html.match(/<section[^>]*>([\s\S]*?)<\/section>/i)
    if (secMatch) html = secMatch[1]

    // 解析 HTML 为结构化文本块
    const container = document.createElement('div')
    container.innerHTML = html

    function extractBlocks(el: Element, blocks: pptxgen.TextProps[]) {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent?.replace(/\s+/g, ' ') || ''
          if (t.trim()) blocks.push({ text: t, options: { fontSize: 16 } })
          continue
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue
        const c = child as HTMLElement
        const tag = c.tagName.toLowerCase()

        if (tag === 'h1') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 32, bold: true } })
        } else if (tag === 'h2') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 26, bold: true } })
        } else if (tag === 'h3') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 22, bold: true } })
        } else if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 18, bold: true } })
        } else if (tag === 'pre') {
          blocks.push({ text: c.textContent || '', options: { fontSize: 13, fontFace: 'Courier New' } })
        } else if (tag === 'li') {
          blocks.push({ text: '• ' + (c.textContent?.trim() || ''), options: { fontSize: 16 } })
        } else if (tag === 'p') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 16 } })
        } else if (tag === 'blockquote') {
          blocks.push({ text: c.textContent?.trim() || '', options: { fontSize: 15, italic: true, color: '666666' } })
        } else if (tag === 'hr') {
          blocks.push({ text: '────────────────', options: { fontSize: 10, color: 'CCCCCC' } })
        } else if (tag === 'br') {
          // skip
        } else if (tag === 'ul' || tag === 'ol' || tag === 'div' || tag === 'span' || tag === 'section') {
          extractBlocks(c, blocks)
        } else {
          // 未知标签：尝试提取文本
          const t = c.textContent?.trim()
          if (t) blocks.push({ text: t, options: { fontSize: 16 } })
        }
      }
    }

    extractBlocks(container, result)

    // 兜底：如果什么都没解析出来，直接用全部文本
    if (result.length === 0 && container.textContent?.trim()) {
      result.push({ text: container.textContent.trim(), options: { fontSize: 16 } })
    }

    return result
  }

  /** 从 Marp 渲染 HTML 中提取各 slide 的 HTML 内容 */
  function extractSlideSections(html: string): string[] {
    const sections: string[] = []
    // Marp v4 输出格式：<svg data-marpit-svg> → <foreignObject> → <section>
    const svgRe = /<svg[^>]*data-marpit-svg[^>]*>([\s\S]*?)<\/svg>/gi
    let m: RegExpExecArray | null
    while ((m = svgRe.exec(html)) !== null) {
      const inner = m[1]
      // 提取 foreignObject 中的 <section> 内容
      const foMatch = inner.match(/<foreignObject[^>]*>([\s\S]*?)<\/foreignObject>/i)
      if (foMatch) {
        sections.push(foMatch[1])
      } else {
        // fallback: 直接使用 SVG 内容
        sections.push(inner)
      }
    }
    if (sections.length === 0) {
      // 兼容旧格式：直接匹配 <section>
      const secRe = /<section[^>]*>([\s\S]*?)<\/section>/gi
      while ((m = secRe.exec(html)) !== null) {
        sections.push(m[1])
      }
    }
    if (sections.length === 0) {
      sections.push(html)
    }
    return sections
  }

  // ══════════════════════════════════════════════════════
  // 导出
  // ══════════════════════════════════════════════════════

  /** 导出为自包含 HTML 文件（无外部依赖）。Slides 使用 Marp 渲染。 */
  async function exportAsHTML() {
    try {
      if (editorType.value === 'slides') {
        const { html, css } = await renderSlidesToHTML(localValue.value)
        const fullHtml = buildSlidesStandaloneHtml(postTitle.value, html, css, locale.value || 'en')
        const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(postTitle.value || 'slides').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`
        a.click()
        URL.revokeObjectURL(url)
        activeModal.value = 'none'
        return
      }
      // 文章：静态渲染管线 + 完整 CSS 内联
      const renderedHtml = await renderStaticHTML(localValue.value)
      const fullHtml = buildArticleStandaloneHtml(postTitle.value, renderedHtml, locale.value || 'en', postFont.value)
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`
      a.click()
      URL.revokeObjectURL(url)
      activeModal.value = 'none'
    } catch (e) { console.error('exportAsHTML failed', e) }
  }

  /** 导出为 PPTX（仅幻灯片）。使用 Marp 渲染后转换为 PowerPoint 幻灯片。 */
  async function exportAsPPTX() {
    if (editorType.value !== 'slides') return
    try {
      const { html } = await renderSlidesToHTML(localValue.value)
      const sections = extractSlideSections(html)

      const pptx = new pptxgen()
      pptx.layout = 'LAYOUT_16x9'
      pptx.author = postAuthor.value || 'Chronicle'
      pptx.title = postTitle.value || 'Slides'

      for (const sectionHTML of sections) {
        const slide = pptx.addSlide()
        const texts = parseSlideHTMLToTextObjects(sectionHTML)
        if (texts.length > 0) {
          slide.addText(texts, {
            x: '5%', y: '5%', w: '90%', h: '90%',
            valign: 'top',
          })
        } else {
          // 兜底：无文本时显示 slide 编号
          slide.addText(`Slide ${sections.indexOf(sectionHTML) + 1}`, {
            x: '10%', y: '40%', w: '80%', h: '20%',
            fontSize: 24, color: '999999', align: 'center',
          })
        }
      }

      await pptx.writeFile({ fileName: `${(postTitle.value || 'slides').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx` })
      activeModal.value = 'none'
    } catch (e) { console.error('exportAsPPTX failed', e) }
  }

  // ══════════════════════════════════════════════════════
  // 认证工具
  // ══════════════════════════════════════════════════════

  /** 从 localStorage 读取 chronicle_auth token */
  function getAdminAuthToken() {
    try {
      const raw = localStorage.getItem('chronicle_auth')
      if (!raw) return ''
      const parsed = JSON.parse(raw)
      return typeof parsed?.token === 'string' ? parsed.token : ''
    } catch { return '' }
  }

  /** 要求云端认证，未登录则跳转登录页 */
  const requireCloudAuth = (nextUrl?: string) => {
    refreshCloudAuthState()
    if (isCloudAuthenticated()) return true
    goToLogin(nextUrl || route.fullPath || '/editor/article')
    return false
  }

  // ══════════════════════════════════════════════════════
  // Astro 构建
  // ══════════════════════════════════════════════════════

  /**
   * 触发 Astro SSG 构建。
   * 设置 isBuilding 标志，构建完成后更新 postStatus 为 'published'。
   */
  async function triggerAstroBuild(postIdVal: string) {
    const source = postIdVal === '__about__'
      ? (t('notification.source.aboutPublish') as string)
      : (t('notification.source.publish') as string)
    isBuilding.value = true
    try {
      await triggerBuild({ source, postId: postIdVal, t: (k: string) => t(k) as string })
      postStatus.value = 'published'
    } catch {} finally {
      isBuilding.value = false
    }
  }

  // ══════════════════════════════════════════════════════
  // 保存 / 发布流程
  // ══════════════════════════════════════════════════════

  /** 打开保存/发布弹窗 */
  function openSaveModal(type: 'draft' | 'publish') {
    refreshCloudAuthState()
    tempTitle.value = postTitle.value
    activeModal.value = type
  }

  /** 关闭所有模态框 */
  function closeModals() {
    activeModal.value = 'none'
  }

  /**
   * 本地直接保存（不弹窗）。
   * Ctrl+S 在本地模式下调用此函数。
   */
  async function saveLocalDirect(titleArg?: string) {
    try {
      const titleToKeep = (titleArg && titleArg.trim())
        ? titleArg.trim()
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)
      const now = new Date().toISOString()
      postId.value = null
      postTitle.value = titleToKeep
      postStatus.value = 'local'
      postUpdated.value = now
      if (!postDate.value) postDate.value = now
      savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
      savedFm.value = buildSavedFm()
      return await saveFile()
    } catch (e) { console.error('saveLocalDirect failed', e); return false }
  }

  /** 工具栏右上角保存按钮的入口：本地直接保存，云端弹窗 */
  function handleTopRightSave(_type: 'draft' | 'publish') {
    if (!isCloudEditing.value) { void saveLocalDirect(); return }
    openSaveModal(_type)
  }

  /**
   * 核心保存逻辑 — 根据环境和意图分发到三条路径之一。
   *
   * 路径 1: 本地      → saveFile() 写入本地文件系统/下载
   * 路径 2: 上传      → 分配云端 ID → 递归 doSave('publish')
   * 路径 3: 云端草稿/发布 → POST /api/post → 可选触发 Astro 构建
   *
   * @param action 保存意图：'local' | 'draft' | 'publish' | 'upload' | 'unsaved'
   */
  async function doSave(action?: 'local' | 'draft' | 'publish' | 'upload' | 'unsaved') {
    // ── About 页面特殊处理 ──
    if (isAboutMode.value) {
      isSaving.value = true
      try {
        const res = await fetchWithAuth('/api/admin/about', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: localValue.value }),
        })
        await res.json()
        savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
        activeModal.value = 'none'
        showToast(t('editor.saved') as string, { status: 'success', position: 'bottom-center', shape: 'capsule' })
        const settings = settingsStore.value
        if (settings?.autoBuildOnPublish) { try { await triggerAstroBuild('__about__') } catch {} }
      } catch (e: any) {
        showToast((e?.message || t('editor.saveFailed')) as string, { status: 'error', position: 'bottom-center', shape: 'capsule' })
      } finally { isSaving.value = false }
      return
    }

    // ── 路径 1: 本地保存 ──
    const intent = action || (activeModal.value || 'draft')
    if (intent === 'local' || !intent && (!isCloudEditing.value && activeModal.value !== 'publish')) {
      const titleToKeep = (tempTitle.value && tempTitle.value.trim())
        ? tempTitle.value
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)
      const now = new Date().toISOString()
      postId.value = null
      postTitle.value = titleToKeep
      postStatus.value = 'local'
      postUpdated.value = now
      if (!postDate.value) postDate.value = now
      savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
      savedFm.value = buildSavedFm()
      activeModal.value = 'none'
      await saveFile()
      return
    }

    // ── 路径 2: 本地首次上传 → 分配云端 ID → 保存草稿到 localStorage → 递归发布 ──
    if (intent === 'upload' || !intent && (!isCloudEditing.value && activeModal.value === 'publish')) {
      if (!requireCloudAuth('create-cloud-post')) return
      const titleToSeed = (tempTitle.value && tempTitle.value.trim())
        ? tempTitle.value.trim()
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)
      try {
        const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
        if (allocRes.ok) {
          const allocData = await allocRes.json()
          const newId = allocData && allocData.id
          if (newId) {
            // 暂存草稿以便在云端编辑器中恢复
            localStorage.setItem(`chronicle_draft_${newId}`, localValue.value)
            localStorage.setItem(`chronicle_draft_meta_${newId}`, JSON.stringify({
              title: titleToSeed, tags: postTags.value, font: postFont.value,
              author: postAuthor.value, aiGenerated: postAIGenerated.value,
              type: editorType.value,
              slideshow: editorType.value === 'slides' ? slideshowConfig.value : undefined,
            }))
            sessionStorage.setItem(`chronicle_history_${newId}`, JSON.stringify({ stack: [localValue.value], index: 0 }))
            savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
            savedFm.value = buildSavedFm()
            const editorPath = editorType.value === 'slides' ? '/editor/slides' : '/editor/article'
            router.replace({ path: editorPath, query: { id: `new-${newId}` } })
            postId.value = newId
            activeModal.value = 'none'
            await doSave('publish')
            return
          }
        }
      } catch (e) { console.error('[useEditorFile] allocate-id failed during upload redirect', e) }
      // 分配失败 → 退回本地模式
      postId.value = null; postTitle.value = t('editor.untitled'); isDefaultTitle.value = true
      postStatus.value = 'local'; postDate.value = ''; postUpdated.value = ''
      postAuthor.value = ''; postAIGenerated.value = false
      localValue.value = ''; savedContent.value = ''; savedFm.value = buildSavedFm()
      return
    }

    // ── 路径 3: 云端草稿 / 发布 ──
    const previousPostId = postId.value
    let status = postStatus.value
    if (intent === 'publish') { status = 'published' }
    else if (intent === 'draft') {
      // 已发布文章的新草稿 → modifying 状态（草稿覆盖已发布内容）
      if (postStatus.value === 'published' || postStatus.value === 'modifying') status = 'modifying'
      else status = 'draft'
    } else if (intent === 'unsaved' || intent === 'local') {
      if (postStatus.value === 'local') status = 'draft'
      else status = postStatus.value === 'building' ? 'published' : postStatus.value
    }

    isSaving.value = true
    try {
      const titleToSend = (tempTitle.value && tempTitle.value.trim())
        ? tempTitle.value
        : (isDefaultTitle.value ? t('editor.untitled') : postTitle.value)

      // 上传正文中引用的本地文件（blob:/file://）并替换为服务器 URL
      let contentToSend = localValue.value
      if (isCloudAuthenticated()) {
        const urlMapping = await resolveLocalFileUrls(contentToSend)
        if (Object.keys(urlMapping).length > 0) {
          contentToSend = applyUrlMappings(contentToSend, urlMapping)
          localValue.value = contentToSend
        }
      }

      // 发布时预渲染 compiledHtml + Mermaid SVG
      let compiledHtml = ''
      if (status === 'published') {
        compiledHtml = convertToHtml(contentToSend, { wrapBlocks: true })
        compiledHtml = await prerenderMermaidInCompiledHtml(compiledHtml)
      }

      // 确定请求 ID：已有 ID 或从 new-<uuid> 提取或新分配
      let requestId = postId.value
      let isNewPost = false
      if (!requestId) {
        const queryId = editorQueryId.value
        if (queryId && queryId.startsWith('new-')) {
          requestId = queryId.replace(/^new-/, '')
          isNewPost = true
        } else {
          const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
          if (allocRes.ok) {
            const allocData = await allocRes.json()
            requestId = allocData && allocData.id
            isNewPost = true
          }
          if (!requestId) { alert('Failed to allocate id'); return }
        }
      }

      if (!postDate.value) postDate.value = new Date().toISOString()

      const res = await fetchWithAuth(`/api/post?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId, title: titleToSend, content: buildFileContent(),
          status, tags: postTags.value, font: postFont.value,
          author: postAuthor.value, aiGenerated: postAIGenerated.value,
          type: editorType.value === 'slides' ? 'slides' : undefined,
          slideshow: editorType.value === 'slides' ? slideshowConfig.value : undefined,
          compiledHtml, toc: [], newPost: isNewPost,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.id) {
          // 清理旧草稿
          if (previousPostId === 'new') {
            localStorage.removeItem('chronicle_draft_new')
            sessionStorage.removeItem('chronicle_history_new')
          }
          // 更新状态
          postId.value = data.id; postTitle.value = tempTitle.value
          if (status) postStatus.value = status
          postUpdated.value = new Date().toISOString()
          if (!postDate.value) postDate.value = postUpdated.value
          savedContent.value = editorType.value === 'slides' ? localValue.value : normalizeBody(localValue.value)
          savedFm.value = buildSavedFm()
          // 清理旧 ID 的草稿
          if (previousPostId && previousPostId !== 'new') {
            localStorage.removeItem(`chronicle_draft_${previousPostId}`)
            sessionStorage.removeItem(`chronicle_history_${previousPostId}`)
          }
          // 更新 URL 中的 ID
          if (!previousPostId && intent === 'publish') {
            router.replace({ query: { ...route.query, id: data.id } as any })
          } else if (previousPostId === 'new' && route.query.id !== data.id) {
            router.replace({ query: { ...route.query, id: data.id } as any })
          } else if (editorQueryId.value && editorQueryId.value.startsWith('new-')) {
            router.replace({ query: { id: data.id } as any })
          }
        }
        // 通知其他标签页（PostManager）刷新列表
        try { new BroadcastChannel('chronicle').postMessage({ type: 'post-updated', id: data.id }) } catch {}
        closeModals()
        // 发布后自动触发构建（如果设置开启）
        if (status === 'published') {
          postStatus.value = 'published'
          const settings = settingsStore.value
          if (settings && settings.autoBuildOnPublish) {
            showToast(t('settings.buildSubmitted') as string, { status: 'info', position: 'bottom-center', shape: 'capsule' })
            void triggerAstroBuild(data.id || postId.value || '')
          }
        }
      } else {
        // 错误处理：ID 冲突时自动重新分配
        const errData = await res.json().catch(() => ({}))
        const errMsg = errData.message || 'Save failed'
        if (res.status === 400) {
          if (errMsg === 'ID already exists' || errMsg === 'Invalid id format' || errMsg === 'ID required') {
            try {
              const allocRes = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
              if (allocRes.ok) {
                const allocData = await allocRes.json()
                const newId = allocData && allocData.id
                if (newId) {
                  showToast(t('editor.usingNewIdRetry') as string, { status: 'warning', position: 'bottom-center', shape: 'capsule' })
                  router.replace({ query: { ...route.query, id: `new-${newId}` } as any })
                  return
                }
              }
            } catch (e) { console.error('[useEditorFile] allocate-id failed after error', e) }
            alert(`${errMsg}. Please try again.`)
          } else { alert(errMsg) }
        } else { alert(errMsg) }
      }
    } catch (e) { console.error('[useEditorFile] Save error', e); alert('Error saving') }
    finally { isSaving.value = false }
  }

  // ══════════════════════════════════════════════════════
  // Mermaid 渲染
  // ══════════════════════════════════════════════════════

  /**
   * 将 markdown 中的 ```mermaid 代码块渲染为内联 SVG。
   * 在保存前调用，确保 Astro 端直接使用预渲染的 SVG。
   */
  async function renderMermaidBlocksInMarkdown(md: string) {
    if (!md || !/```\s*mermaid\b/.test(md)) return md
    let mod: any
    try { mod = await import('mermaid') } catch (e) { console.warn('Failed to load mermaid', e); return md }
    const mermaid = (mod && mod.default) || mod
    try { mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'var(--app-font-stack)' } }) } catch {}
    /** 统一 SVG marker 引用到 chronicle-mermaid-arrow */
    function sanitizeSvg(svg: string) {
      if (!svg) return svg
      svg = svg.replace(/marker-(?:end|start)=("|')?url\([^#)]*#([^\)"']+)\)("|')?/g, 'marker-$1')
      svg = svg.replace(/marker-(end|start)=("|')?url\(\#([^\)"']+)\)("|')?/g, (_, pos: string) => `marker-${pos}="url(#chronicle-mermaid-arrow)"`)
      svg = svg.replace(/url\((?:"|')?\#([^\)"']+)(?:"|')?\)/g, 'url(#chronicle-mermaid-arrow)')
      return svg
    }
    const regex = /```\s*mermaid\s*\n([\s\S]*?)\n```/g
    let lastIndex = 0; let out = ''; let match: RegExpExecArray | null; let idx = 0
    while ((match = regex.exec(md)) !== null) {
      out += md.slice(lastIndex, match.index)
      try {
        const id = 'mermaid_' + Date.now() + '_' + (idx++)
        const res = await mermaid.render(id, match[1])
        let svg = String((res && (res.svg || res)) || '')
        svg = sanitizeSvg(svg)
        out += `<div class="mermaid-svg">${svg}</div>`
      } catch (e) { console.warn('mermaid render failed on save', e); out += match[0] }
      lastIndex = regex.lastIndex
    }
    out += md.slice(lastIndex)
    return out
  }

  // ══════════════════════════════════════════════════════
  // 打印预览
  // ══════════════════════════════════════════════════════

  /** 构建打印快照（通过 localStorage token 传递到打印页面） */
  function buildPrintSnapshot() {
    return {
      title: postTitle.value, content: localValue.value, font: postFont.value,
      assetMap: assetMap.value, postId: postId.value, postStatus: postStatus.value,
      postDate: postDate.value, postUpdated: postUpdated.value,
      tags: postTags.value, author: postAuthor.value, aiGenerated: postAIGenerated.value,
      locale: locale.value, createdAt: Date.now(),
      editorType: editorType.value,
    }
  }

  /**
   * 构建独立打印 HTML — 内联所有样式，无外部资源依赖。
   * Electron 下通过 IPC 发送到系统浏览器打印；Web 下在新标签页中打开。
   */
  function buildStandalonePrintHtml(title: string, renderedHtml: string, lang: string, font?: string): string {
    const katexTag = KATEX_TAG
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light}</style>
<style>${CHRONICLE_CSS}</style>
<style>${EXPORT_OVERRIDE}</style>
${katexTag}
</head>
<body${font ? ` data-font="${font}"` : ''}>
  ${title ? `<h1 class="article-title">${escapeHtml(title)}</h1>` : ''}
  <div class="chronicle-markdown">${renderedHtml}</div>
</body>
</html>`
  }

  /**
   * 打印预览 — 在当前页创建隐藏 iframe，注入静态 HTML 后直接调用 print()。
   * 不跨窗口，样式在同一 origin 下完整渲染。
   */
  async function openPrintPreview(printOptions?: { autoPrint?: boolean }) {
    // 打印准备遮罩
    const overlay = document.createElement('div')
    overlay.id = 'chronicle-print-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;font-family:var(--app-font-stack)'
    overlay.innerHTML = '<div style="background:#1e1e1e;color:#e5e7eb;padding:24px 40px;border-radius:12px;font-size:16px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)"><div style="width:32px;height:32px;border:3px solid var(--border-color,#444);border-top-color:var(--accent-color,#3b82f6);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px"></div><span>' + (t('editor.printLoading') || 'Preparing print…') + '</span></div>'
    document.body.appendChild(overlay)
    // 注入 spinner 动画
    if (!document.getElementById('chronicle-spin-keyframes')) {
      const kf = document.createElement('style')
      kf.id = 'chronicle-spin-keyframes'
      kf.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
      document.head.appendChild(kf)
    }
    try {
      let printHtml: string
      if (editorType.value === 'slides') {
        const { html, css } = await renderSlidesToHTML(localValue.value || '')
        printHtml = buildSlidesPrintHtml(postTitle.value || '', html, css, locale.value || 'en')
      } else {
        const renderedHtml = await renderStaticHTML(localValue.value || '')
        printHtml = buildStandalonePrintHtml(postTitle.value || '', renderedHtml, locale.value || 'en', postFont.value)
      }
      // 确保页面有 @media print 规则隐藏编辑器，只暴露打印层
      const printStyleId = 'chronicle-print-media-style'
      if (!document.getElementById(printStyleId)) {
        const style = document.createElement('style')
        style.id = printStyleId
        style.textContent = '@media print{body>*:not(#chronicle-print-frame){display:none!important}#chronicle-print-frame{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;border:none!important;z-index:99999!important;background:#fff!important}}'
        document.head.appendChild(style)
      }
      // 移除旧 iframe
      const oldFrame = document.getElementById('chronicle-print-frame') as HTMLIFrameElement | null
      if (oldFrame) oldFrame.remove()
      // 创建打印层 iframe——用户不可见（被编辑器覆盖），打印时才暴露
      const frame = document.createElement('iframe')
      frame.id = 'chronicle-print-frame'
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;z-index:-1;background:#fff'
      document.body.appendChild(frame)
      const doc = frame.contentDocument || frame.contentWindow?.document
      if (!doc) throw new Error('Cannot access iframe document')
      doc.open()
      doc.write(printHtml)
      doc.close()
      // 等图片全部加载完成后打印（防重入）
      let printed = false
      const doPrint = () => {
        if (printed) return
        printed = true
        if (printOptions?.autoPrint !== false) {
          try { frame.contentWindow?.print() } catch {}
        }
        overlay.remove()
      }
      // 监听 iframe 内所有图片加载
      const waitImages = () => {
        const imgs = frame.contentDocument?.querySelectorAll('img')
        if (!imgs || imgs.length === 0) { setTimeout(doPrint, 300); return }
        let pending = imgs.length
        let timeout: ReturnType<typeof setTimeout>
        const done = () => { pending--; if (pending <= 0) { clearTimeout(timeout); doPrint() } }
        timeout = setTimeout(() => doPrint(), 5000) // 5s 兜底
        imgs.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) { done(); return }
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        })
      }
      frame.onload = () => waitImages()
      setTimeout(waitImages, 200)
    } catch (e) { console.error('[useEditorFile] failed to open print preview', e) }
  }

  // ══════════════════════════════════════════════════════
  // 对外 API
  // ══════════════════════════════════════════════════════

  return {
    // 状态
    isSaving,
    isBuilding,
    lastSavedTime,
    tempTitle,
    currentFileHandle,
    currentFilePath,
    // 本地文件操作
    saveFile,
    saveAs,
    saveLocalDirect,
    buildFileContent,
    writeFileHandle,
    exportAsHTML,
    exportAsPPTX,
    // 云端操作
    doSave,
    triggerAstroBuild,
    getAdminAuthToken,
    requireCloudAuth,
    // 模态框
    handleTopRightSave,
    openSaveModal,
    closeModals,
    // 打印
    buildPrintSnapshot,
    buildStandalonePrintHtml,
    openPrintPreview,
    // Mermaid
    renderMermaidBlocksInMarkdown,
  }
}
