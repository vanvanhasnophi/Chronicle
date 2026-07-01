/**
 * useEditorSession — 编辑器生命周期与数据加载
 *
 * 职责：
 *   1. initLoad() — 根据 URL query 参数决定加载路径（7 种场景）
 *   2. loadPostById() — 从云端 API 加载文章详情
 *   3. applyLoadedPost() — 将加载的数据填充到所有 frontmatter refs
 *   4. 版本冲突检测 — 比较 localStorage 草稿 vs 云端版本
 *   5. 骨架屏状态管理 — skeletonStatus 驱动 TextEditor 的加载动画
 *
 * initLoad 的 7 条分支：
 *   1. 未认证 → 跳转登录
 *   2. id=new → 分配云端 ID
 *   3. id=new-<uuid> → 验证 ID 有效性 → 恢复草稿或新建
 *   4. 无效 ID 格式 → 本地模式
 *   5. id=__about__ → 加载关于页面
 *   6. id=<uuid> → 加载已有文章
 *   7. 无 ID → 本地模式
 *
 * 依赖：useEditorFrontmatter（所有 frontmatter refs + 解析函数）
 */
import { ref, watch, type Ref, type ComputedRef } from 'vue'
import type { SavedFm } from './useFileProperties'
import {
  localFileToApiFormat,
  cloudDetailToApiPost,
  aboutToApiPost,
  detectType,
  resolveEditorPayload,
  extractEditorFm,
  normalizeBody,
  parseFrontmatter,
  type ApiPost,
} from './useFileProperties'

export interface EditorSessionOptions {
  // 核心类型/路由
  editorType: Ref<'article' | 'slides'>
  editorQueryId: ComputedRef<string | undefined>
  route: any
  router: any
  // i18n / 通知 / 网络
  t: (key: string) => string
  showToast: (msg: string, opts?: any) => void
  fetchWithAuth: any
  // 认证
  isCloudAuthenticated: () => boolean
  refreshCloudAuthState: () => boolean
  goToLogin: (nextUrl: string) => void
  // Frontmatter state（会被 initLoad 写入）
  postId: Ref<string | null>
  postTitle: Ref<string>
  isDefaultTitle: Ref<boolean>
  postStatus: Ref<'local' | 'draft' | 'published' | 'modifying' | 'building'>
  postDate: Ref<string>
  postUpdated: Ref<string>
  postTags: Ref<string[]>
  postFont: Ref<string>
  postAuthor: Ref<string>
  postAIGenerated: Ref<boolean>
  slideshowConfig: Ref<Record<string, any>>
  localValue: Ref<string>
  savedContent: Ref<string>
  savedFm: Ref<SavedFm>
  buildSavedFm: () => SavedFm
  readAuthorFromDetail: (detail: any) => string
  readAiGeneratedFromDetail: (detail: any) => boolean
  currentFileHandle: Ref<any>
  currentFilePath: Ref<string | null>
  // 杂项
  activeModal: Ref<string>
  editorBodyRef: Ref<any>
  dataReady: Ref<boolean>
  bodyKey: Ref<number>
  skeletonStatus: Ref<string>
  skeletonShowDirectEntry: Ref<boolean>
  skeletonTimer: { current: ReturnType<typeof setTimeout> | null }
  CHRONICLE_FM_KEYS: Set<string>
}

export function useEditorSession(options: EditorSessionOptions) {
  const {
    editorType, editorQueryId, route, router, t, showToast,
    isCloudAuthenticated, refreshCloudAuthState, goToLogin, fetchWithAuth,
    postId, postTitle, isDefaultTitle, postStatus, postDate, postUpdated,
    postTags, postFont, postAuthor, postAIGenerated, slideshowConfig,
    localValue, savedContent, savedFm, buildSavedFm,
    readAuthorFromDetail, readAiGeneratedFromDetail,
    currentFileHandle, currentFilePath,
    activeModal, editorBodyRef, dataReady, bodyKey, skeletonStatus,
    skeletonShowDirectEntry, skeletonTimer, CHRONICLE_FM_KEYS,
  } = options

  // ══════════════════════════════════════════════════════
  // 版本冲突状态
  // ══════════════════════════════════════════════════════

  const pendingConflictDetail = ref<any>(null)
  const pendingConflictDraft = ref('')
  const pendingConflictSessionHistory = ref<string | null>(null)

  let pendingRedirect: { path?: string; query?: Record<string, any> } | null = null

  const canonicalPath = () =>
    editorType.value === 'slides' ? '/editor/slides' : '/editor/article'

  function normalizeContentForCompare(content: string) {
    return String(content || '').replace(/\r\n/g, '\n')
  }

  function clearVersionConflictState() {
    pendingConflictDetail.value = null
    pendingConflictDraft.value = ''
    pendingConflictSessionHistory.value = null
  }

  // ══════════════════════════════════════════════════════
  // 本地模式 / 路由跳转
  // ══════════════════════════════════════════════════════

  /** 进入本地编辑模式——清空所有云端状态 */
  function enterLocalMode() {
    postId.value = null
    postTitle.value = t('editor.untitled')
    isDefaultTitle.value = true
    postStatus.value = 'local'
    postDate.value = ''
    postUpdated.value = ''
    postAuthor.value = ''
    postAIGenerated.value = false
    localValue.value = ''
    savedContent.value = ''
    savedFm.value = buildSavedFm()
  }

  /** 本地模式 + 补全路径（/editor → /editor/article） */
  function finishLocal() {
    enterLocalMode()
    if (route.path === '/editor') go(canonicalPath())
    else dataReady.value = true
  }

  /** 累积跳转——在 initLoad 末尾统一执行 */
  function go(path: string, query?: Record<string, any>) {
    pendingRedirect = { path, query }
    /**suppressQueryWatch = true */
    dataReady.value = true
    finalizeRedirect()
  }

  function finalizeRedirect() {
    if (!pendingRedirect) return
    const target = pendingRedirect
    pendingRedirect = null
    router.replace(target)
  }

  function resetEditor() {
    const basePath = editorType.value === 'slides' ? '/editor/slides' : '/editor/article'
    router.push({ path: basePath })
  }

  /** 通过路由 query 切换文章 */
  function loadPost(id: string) {
    if (id === postId.value) return
    router.push({ query: { id } })
  }

  // ══════════════════════════════════════════════════════
  // 核心操作 — initEditor / createPost / openPost
  // ══════════════════════════════════════════════════════

  /**
   * 编辑器壳初始化的唯一入口。
   * createPost 和 openPost 最后一步都调它。
   */
  function initEditor(
    metadata: {
      title: string; date: string; tags: string[]; author: string
      aiGenerated: boolean; font: string; type: 'article' | 'slides'
      slideshow: Record<string, any>
      postId: string | null; postStatus: string
      fileHandle?: any
    },
    content: string,
    extra?: { filePath?: string | null },
  ) {
    if (metadata.type !== editorType.value) {
      editorType.value = metadata.type
      bodyKey.value++
    }
    postId.value = metadata.postId
    postTitle.value = metadata.title || t('editor.untitled')
    isDefaultTitle.value = !metadata.title
    postStatus.value = metadata.postStatus as any
    postDate.value = metadata.date || ''
    postUpdated.value = ''
    postTags.value = metadata.tags || []
    postFont.value = metadata.type === 'slides' ? 'sans' : (metadata.font || 'sans')
    postAuthor.value = metadata.author || ''
    postAIGenerated.value = metadata.aiGenerated || false
    try {
      slideshowConfig.value = typeof metadata.slideshow === 'object'
        ? metadata.slideshow
        : JSON.parse((metadata.slideshow as any) || '{}')
    } catch { slideshowConfig.value = {} }
    localValue.value = content
    currentFileHandle.value = metadata.fileHandle || null
    currentFilePath.value = extra?.filePath || null
    savedContent.value = metadata.type === 'slides' ? content : normalizeBody(content)
    savedFm.value = buildSavedFm()
    dataReady.value = true
  }

  /**
   * 新建文章。本地直接空白 metadata；云端先申请 UUID。
   * @returns { id, type } 供编排器同步 URL
   */
  async function createPost(params: { source: 'local' | 'cloud'; type: 'article' | 'slides'; preAllocatedId?: string }) {
    let pid: string | null = null
    let pstatus = 'local'
    if (params.source === 'cloud') {
      if (params.preAllocatedId) {
        pid = params.preAllocatedId; pstatus = 'draft'
      } else {
        skeletonStatus.value = 'editor.skeletonAllocatingId'
        try {
          const res = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
          if (res.ok) { const data = await res.json(); if (data?.id) { pid = data.id; pstatus = 'draft' } }
        } catch {}
        if (!pid) { showToast(t('editor.allocateFailed')); pstatus = 'local' }
      }
    }
    const initContent = params.type === 'slides'
      ? '---\nmarp: true\n\n---\n\n# Slide 1\n'
      : ''
    initEditor({
      title: '', date: '', tags: [], author: '', aiGenerated: false,
      font: 'sans', type: params.type, slideshow: {},
      postId: pid, postStatus: pstatus,
    }, initContent)
    return { id: pid, type: params.type }
  }

  /**
   * 打开已有文章。按 source 分发数据获取，走 xxxToApiFormat →
   * resolveEditorPayload → initEditor。
   * @returns { type } 供编排器同步 URL（可能与 URL 不同）
   */
  async function openPost(params: {
    source: 'cloud' | 'local' | 'about'
    id?: string; text?: string; filename?: string; handle?: any
  }): Promise<{ type: 'article' | 'slides' }> {
    let apiPost: ApiPost
    if (params.source === 'cloud') {
      if (!params.id) throw new Error('openPost cloud requires id')
      const detailRes = await fetchWithAuth(`/api/post?id=${params.id}&mode=edit&t=${Date.now()}`)
      if (!detailRes.ok) { skeletonStatus.value = 'editor.skeletonValidatingId'; throw new Error('POST_NOT_FOUND') }
      const detail = await detailRes.json()
      // 版本冲突
      const draft = localStorage.getItem(`chronicle_draft_${params.id}`)
      const sessionHistory = sessionStorage.getItem(`chronicle_history_${params.id}`)
      if (draft && normalizeContentForCompare(draft) !== normalizeContentForCompare(detail.content || '')) {
        pendingConflictDetail.value = detail
        pendingConflictDraft.value = draft
        pendingConflictSessionHistory.value = sessionHistory
        activeModal.value = 'syncConflict'
        dataReady.value = true
        return { type: detectType({ type: detail.type || detail.meta?.type } as any) }
      }
      apiPost = cloudDetailToApiPost(detail)
      if (draft) {
        // draft 可能含旧 Chronicle FM，剥掉只取正文
        const draftParsed = parseFrontmatter(draft)
        apiPost.content = draftParsed.content
      }
    } else if (params.source === 'local') {
      if (!params.text) throw new Error('openPost local requires text')
      apiPost = localFileToApiFormat(params.text, params.filename || 'untitled.md', params.handle)
    } else {
      const res = await fetchWithAuth('/api/admin/about')
      const data = await res.json()
      apiPost = aboutToApiPost(data)
    }
    const { metadata, content } = resolveEditorPayload(apiPost)
    initEditor(metadata, content, { filePath: params.filename || null })
    return { type: metadata.type }
  }

  // ══════════════════════════════════════════════════════
  // 数据填充（旧，由 initEditor 替代，保留供外部兼容）
  // ══════════════════════════════════════════════════════

  /**
   * 将已加载的文章数据填充到所有 frontmatter refs。
   *
   * 幻灯片特殊处理：
   *   - 提取正文中的 Marp YAML（theme, size 等）作为独立 frontmatter 块
   *   - Chronicle 专属键（title, date, tags 等）不纳入 Marp FM
   */
  function applyLoadedPost(
    detail: any,
    content: string,
    sessionHistory: string | null,
    syncLocalCache = false,
  ) {
    if (!detail) return
    postId.value = detail.id
    postTitle.value = detail.title
    isDefaultTitle.value = false
    postStatus.value = detail.status || 'draft'
    postDate.value = detail.date || ''
    postUpdated.value = detail.updatedAt || detail.date || ''
    postTags.value = detail.tags || []
    postFont.value = detail.type === 'slides' ? 'sans' : (detail.font || 'sans')
    postAuthor.value = readAuthorFromDetail(detail)
    postAIGenerated.value = readAiGeneratedFromDetail(detail)
    try {
      slideshowConfig.value = typeof detail.slideshow === 'object'
        ? detail.slideshow
        : JSON.parse(detail.slideshow || '{}')
    } catch { slideshowConfig.value = {} }

    const postType = detail.type || detail.meta?.type
    if (postType === 'slides') {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)
      if (fmMatch) {
        const styleLines: string[] = []
        fmMatch[1].split('\n').forEach((line: string) => {
          const c = line.indexOf(':')
          if (c < 0) return
          const k = line.slice(0, c).trim()
          if (!CHRONICLE_FM_KEYS.has(k)) styleLines.push(line)
        })
        if (styleLines.length > 0) {
          localValue.value = `---\n${styleLines.join('\n')}\n---\n\n${content.slice(fmMatch[0].length)}`
        } else { localValue.value = content }
      } else { localValue.value = content }
    } else { localValue.value = content }

    // 设置脏检测基线
    savedContent.value =
      postType === 'slides' ? localValue.value : normalizeBody(localValue.value)

    let parsedSlideshow: Record<string, any> | undefined = undefined
    if (postType === 'slides') {
      try {
        parsedSlideshow = typeof detail.slideshow === 'object'
          ? detail.slideshow
          : JSON.parse(detail.slideshow || '{}')
      } catch { parsedSlideshow = {} }
    }
    savedFm.value = {
      title: detail.title,
      tags: detail.tags || [], author: readAuthorFromDetail(detail),
      aiGenerated: readAiGeneratedFromDetail(detail),
      font: postType === 'slides' ? undefined : (detail.font || 'sans'),
      slideshow: parsedSlideshow,
    }

    if (syncLocalCache) {
      localStorage.setItem(`chronicle_draft_${detail.id}`, content)
      sessionStorage.setItem(`chronicle_history_${detail.id}`, JSON.stringify({
        stack: [content], index: 0,
      }))
    }
    dataReady.value = true
  }

  // ══════════════════════════════════════════════════════
  // 云端加载
  // ══════════════════════════════════════════════════════

  /**
   * 根据 ID 从服务器加载文章。
   * 检测 localStorage 草稿版本冲突 → 弹出 syncConflict 弹窗。
   * 检测文章类型 → 自动纠正路由（/editor/article vs /editor/slides）。
   */
  async function loadPostById(id: string) {
    try {
      postAuthor.value = ''
      postAIGenerated.value = false
      const detailRes = await fetchWithAuth(`/api/post?id=${id}&mode=edit&t=${Date.now()}`)
      if (!detailRes.ok) {
        skeletonStatus.value = 'editor.skeletonValidatingId'
        await handleLoad404Fallback(id)
        return true
      }
      const detail = await detailRes.json()
      const draft = localStorage.getItem(`chronicle_draft_${id}`)
      const sessionHistory = sessionStorage.getItem(`chronicle_history_${id}`)

      // 类型纠正 — 如果实际是幻灯片但路由是文章（或反之），修正路由
      const postType = (detail.type || detail.meta?.type) as string
      const cp = postType === 'slides' ? '/editor/slides' : '/editor/article'
      if (route.path !== cp) {
        editorType.value = postType === 'slides' ? 'slides' : 'article'
        bodyKey.value++
        window.history.replaceState(null, '', cp + '?id=' + id)
      }

      // 版本冲突检测：本地草稿 ≠ 云端内容
      if (draft && normalizeContentForCompare(draft) !== normalizeContentForCompare(detail.content || '')) {
        pendingConflictDetail.value = detail
        pendingConflictDraft.value = draft
        pendingConflictSessionHistory.value = sessionHistory
        activeModal.value = 'syncConflict'
        dataReady.value = true
        return true
      }

      applyLoadedPost(detail, draft || detail.content || '', sessionHistory, false)
      return true
    } catch (e) {
      console.error('Failed to load post', e)
      showToast(t('editor.loadFailed'))
      enterLocalMode(); finishLocal()
      if (!pendingRedirect) dataReady.value = true
      return false
    }
  }

  /**
   * 加载 404 时的回退处理。
   * 验证 UUID 有效性 → 有效则转到 new-<uuid>，无效则重新分配。
   */
  async function handleLoad404Fallback(uuid: string) {
    try {
      const res = await fetchWithAuth('/api/post/validate-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uuid }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.valid) { go(canonicalPath(), { id: `new-${uuid}` }); return }
        else if (data?.reason === 'invalid-format') { go(canonicalPath(), { id: 'new' }); return }
        else if (data?.reason === 'conflict') {
          const detailRes2 = await fetchWithAuth(`/api/post?id=${uuid}&mode=edit&t=${Date.now()}`)
          if (detailRes2.ok) {
            applyLoadedPost(await detailRes2.json(), '', null, false)
            return
          }
        }
      }
    } catch (e) {}
    showToast(t('editor.loadFailed'))
    enterLocalMode(); finishLocal()
    if (!pendingRedirect) dataReady.value = true
  }

  // ══════════════════════════════════════════════════════
  // 主初始化入口
  // ══════════════════════════════════════════════════════

  /**
   * 编辑器初始化——根据 URL query 参数决定加载路径。
   *
   * 骨架屏计时器：5 秒后显示"直接进入编辑器"按钮。
   */
  async function initLoad() {
    refreshCloudAuthState()
    const queryId = editorQueryId.value

    // 启动骨架屏计时器
    skeletonStatus.value = 'editor.skeletonLoading'
    skeletonShowDirectEntry.value = false
    if (skeletonTimer.current) clearTimeout(skeletonTimer.current)
    skeletonTimer.current = setTimeout(() => { skeletonShowDirectEntry.value = true }, 5000)

    // ── Query 格式校验（只允许 id 键） ──
    try {
      const qkeys = Object.keys(route.query || {})
      if (qkeys.length > 0 && !(qkeys.length === 1 && qkeys[0] === 'id')) {
        await createPost({ source: 'local', type: editorType.value })
        router.replace(canonicalPath())
        return
      }
    } catch {
      await createPost({ source: 'local', type: editorType.value })
      router.replace(canonicalPath())
      return
    }

    const cp = canonicalPath()

    // 1. 未认证 → 登录（保留当前 URL 作为 redirect target）
    if (queryId && !isCloudAuthenticated()) {
      goToLogin(route.fullPath || canonicalPath())
      return
    }

    try {
      // 2. id=new → createPost（cloud，分配 ID）
      if (queryId === 'new') {
        const { id } = await createPost({ source: 'cloud', type: editorType.value })
        if (id) { router.replace({ path: cp, query: { id: `new-${id}` } }); return }
        await createPost({ source: 'local', type: editorType.value })
        router.replace(cp)
        return
      }

      // 3. id=new-<uuid> → 验证 ID → createPost（预分配）或 openPost（冲突）
      if (queryId && /^new-([a-zA-Z0-9\-_]+)$/.test(queryId)) {
        skeletonStatus.value = 'editor.skeletonValidatingId'
        const candidateId = queryId.match(/^new-([a-zA-Z0-9\-_]+)$/)?.[1]
        if (!candidateId) {
          await createPost({ source: 'local', type: editorType.value })
          router.replace(cp); return
        }
        try {
          const res = await fetchWithAuth('/api/post/validate-id', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: candidateId }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data?.reason === 'conflict') {
              const { type: actualType } = await openPost({ source: 'cloud', id: candidateId })
              const targetPath = actualType === 'slides' ? '/editor/slides' : '/editor/article'
              router.replace({ path: targetPath, query: { id: candidateId } })
              return
            }
            if (data?.valid) {
              await createPost({ source: 'cloud', type: editorType.value, preAllocatedId: candidateId })
              router.replace({ path: cp, query: { id: candidateId } })
              return
            }
          }
        } catch {}
        showToast(t('editor.validateFailed'))
        router.replace({ path: cp, query: { id: 'new' } })
        return
      }

      // 4. 无效 ID 格式 → 本地模式
      if (queryId && !/^[a-zA-Z0-9\-_]+$/.test(queryId)) {
        await createPost({ source: 'local', type: editorType.value })
        router.replace(cp)
        return
      }

      // 5. id=__about__ → 打开关于页面
      if (queryId === '__about__') {
        await openPost({ source: 'about' })
        router.replace('/editor/article?id=__about__')
        return
      }

      // 6. id=<uuid> → 打开已有文章
      if (queryId) {
        skeletonStatus.value = 'editor.skeletonLoadingPost'
        const { type: actualType } = await openPost({ source: 'cloud', id: queryId })
        const targetPath = actualType === 'slides' ? '/editor/slides' : '/editor/article'
        router.replace({ path: targetPath, query: { id: queryId } })
        return
      }

    // 7. 无 ID → 本地空白编辑器
    await createPost({ source: 'local', type: editorType.value })
    if (route.path === '/editor') router.replace(cp)
  } catch (e) {
    console.error('initLoad failed', e)
    showToast(t('editor.loadFailed'))
    await createPost({ source: 'local', type: editorType.value })
    router.replace(cp)
  }
}

  // ══════════════════════════════════════════════════════
  // 版本冲突解决
  // ══════════════════════════════════════════════════════

  function resolveVersionConflict(choice: 'cloud' | 'local') {
    const detail = pendingConflictDetail.value
    if (!detail) return
    const draft = pendingConflictDraft.value
    const sessionHistory = pendingConflictSessionHistory.value
    if (choice === 'cloud') {
      applyLoadedPost(detail, detail.content || '', null, true)
    } else {
      applyLoadedPost(detail, draft || detail.content || '', sessionHistory, false)
    }
    clearVersionConflictState()
    activeModal.value = 'none'
  }

  // ══════════════════════════════════════════════════════
  // 对外 API
  // ══════════════════════════════════════════════════════

  return {
    pendingConflictDetail, pendingConflictDraft, pendingConflictSessionHistory,
    initLoad, createPost, openPost, initEditor,
    loadPost, canonicalPath,
    // @deprecated — 旧代码兼容（BlogEditor/useFileMenu 迁移中）
    loadPostById, applyLoadedPost,
    enterLocalMode, finishLocal, go, finalizeRedirect,
    resetEditor,
    resolveVersionConflict, clearVersionConflictState,
    handleLoad404Fallback,
  }
}
