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

  /** 导出为自包含 HTML 文件（无外部依赖） */
  async function exportAsHTML() {
    try {
      const html = convertToHtml(localValue.value, { wrapBlocks: true })
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(postTitle.value || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`
      a.click()
      URL.revokeObjectURL(url)
      activeModal.value = 'none'
    } catch (e) { console.error('exportAsHTML failed', e) }
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
    }
  }

  /**
   * 构建独立打印 HTML — 内联所有样式，无外部资源依赖。
   * Electron 下通过 IPC 发送到系统浏览器打印；Web 下在新标签页中打开。
   */
  function buildStandalonePrintHtml(title: string, renderedHtml: string, lang: string): string {
    return `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'InterVariable','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Noto Sans SC','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.7;color:#111;background:#fff;max-width:860px;margin:0 auto;padding:40px 48px}
  h1{font-size:2.4rem;line-height:1.25;font-weight:700;margin:0 0 28px;padding:0 0 20px;border-bottom:1px solid rgba(0,0,0,.08)}
  h2{font-size:1.6rem;line-height:1.35;font-weight:600;margin:36px 0 12px}
  h3{font-size:1.25rem;line-height:1.4;font-weight:600;margin:28px 0 8px}
  h4,h5,h6{font-size:1.05rem;font-weight:600;margin:22px 0 6px}
  p{margin:0 0 14px}a{color:#2563eb;text-decoration:underline}
  blockquote{margin:14px 0;padding:8px 16px;border-left:3px solid #d1d5db;color:#4b5563;background:#f9fafb}
  ul,ol{margin:8px 0 14px;padding-left:24px}li{margin:4px 0}
  hr{border:none;border-top:1px solid #e5e7eb;margin:28px 0}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
  th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}th{background:#f3f4f6;font-weight:600}
  pre{background:#f5f5f5;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;overflow-x:auto;font-size:13.5px;line-height:1.55;margin:14px 0}
  code{font-family:monospace;font-size:.875em}p code,li code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:.85em}
  pre code{background:none;padding:0;font-size:inherit}
  img{max-width:100%;height:auto;border-radius:4px}
  .md-image-container{margin:14px 0}.md-image-caption{font-size:13px;color:#6b7280;text-align:center;margin-top:6px}
  .file-card{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:10px 0}
  .file-card svg{width:22px;height:22px;flex-shrink:0;color:#6b7280}
  .file-card-title{font-weight:500;font-size:14px}.file-card-subtitle{font-size:12px;color:#9ca3af}
  .katex-placeholder{font-family:'KaTeX_Main','Times New Roman',serif;font-size:1.05em}
  @media print{body{padding:16px;max-width:none}h1{border-bottom:none}pre{white-space:pre-wrap;word-break:break-all}.no-print{display:none!important}}
  @media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#111}h1{border-color:rgba(255,255,255,.08)}blockquote{background:#1f1f1f;border-color:#374151;color:#9ca3af}pre{background:#1a1a1a;border-color:#333}p code,li code{background:#1f1f1f}th{background:#1f1f1f}th,td{border-color:#333}.file-card{background:#1a1a1a;border-color:#333}}
</style>
</head>
<body>
  ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
  ${renderedHtml}
</body>
</html>`
  }

  /**
   * 打开打印预览。
   * Electron: 内联 CSS → IPC 发送到系统浏览器。
   * Web: localStorage token → 新标签页 /editor/print。
   */
  function openPrintPreview(printOptions?: { autoPrint?: boolean }) {
    try {
      const isElectronEnv = typeof window !== 'undefined' && window.location.protocol === 'file:'
      if (isElectronEnv) {
        const renderedHtml = renderPreview(localValue.value || '')
        const printHtml = buildStandalonePrintHtml(postTitle.value || '', renderedHtml, locale.value || 'en')
        ;(window as any).chronicleElectron?.openPrintInBrowser(printHtml, postTitle.value || 'Chronicle Print')
        return
      }
      const token = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `print-${Math.random().toString(36).slice(2, 10)}`
      const storageKey = `chronicle_print_preview_${token}`
      localStorage.setItem(storageKey, JSON.stringify(buildPrintSnapshot()))
      const query = printOptions?.autoPrint ? { token, autoPrint: '1' } : { token }
      const url = router.resolve({ path: '/editor/print', query }).href
      const openedWindow = window.open(url, '_blank')
      if (!openedWindow) { router.push({ path: '/editor/print', query }) }
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
