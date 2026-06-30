/**
 * useEditorFrontmatter — 文章元数据状态管理与脏检测
 *
 * 职责：
 *   1. 持有所有 frontmatter 字段的响应式状态（title, date, tags, author...）
 *   2. 提供脏检测（fmChanged computed）—— 当前值 vs savedFm 基线
 *   3. 标签管理（addTag, removeTag, toggleFeatured）
 *   4. 重导出 shared frontmatter 解析工具（parseFrontmatter, stringifyFrontmatter）
 *
 * 依赖：useFrontmatter（YAML 解析/序列化）
 */
import { ref, computed, watch } from 'vue'

// Re-export from useFrontmatter for other composables that import from this file
import {
  parseFrontmatter,
  serializeFrontmatter as stringifyFrontmatter,
} from '../useFrontmatter'
export { parseFrontmatter, stringifyFrontmatter }

// ══════════════════════════════════════════════════════
// API 标准格式 — 云端和本地数据源统一收敛到此
// ══════════════════════════════════════════════════════

/**
 * 统一的文章数据格式——无论从云端 API 拉取还是本地文件解析，
 * 最终都收敛到此形状。这是"编辑器友好化"的输入。
 *
 * cloud 路径：GET /api/post?id= → 原生就是此形状（+ 额外字段）
 * local 路径：parseFrontmatter(text) → localFileToApiFormat() → 此形状
 */
export interface ApiPost {
  id: string | null
  title: string
  date: string
  updatedAt: string
  tags: string[]
  font: string
  author: string
  aiGenerated: boolean
  status: 'local' | 'draft' | 'published' | 'modifying'
  type?: string
  slideshow?: Record<string, any>
  /** Marp 透传键（theme, size, paginate 等），不含 marp:true（Chronicle 层管） */
  marp: Record<string, any>
  /** 剥离 FM 后的正文 */
  content: string
  /** 数据来源标记 */
  _source: 'cloud' | 'local'
  /** 本地文件的 File System Access API 句柄 */
  _fileHandle?: any
}

/**
 * 将本地 .md 文件解析为 API 标准格式。
 *
 * 输入：parseFrontmatter 产出的 raw meta + filename
 * 输出：ApiPost — 与云端 API 返回形状一致
 *
 * @param text   原始 .md 文件全文
 * @param filename 文件名（用于回退标题 + 记录来源）
 * @param fileHandle 可选的 File System Access API 句柄
 */
export function localFileToApiFormat(
  text: string,
  filename: string,
  fileHandle?: any,
): ApiPost {
  const { meta, content } = parseFrontmatter(text)
  const now = new Date().toISOString()

  // 从 meta 和正文中分离非白名单 FM 键（Marp 透传）
  // 情况 A：文件有两个 --- 块 → Marp 键在 body 的第二个块中
  // 情况 B：文件只有一个 --- 块 → Marp 键混在 Chronicle FM 的 meta 中
  const marp: Record<string, any> = {}
  // 先从 meta 中提取（兼容单块 Marp 文件）
  for (const [k, v] of Object.entries(meta)) {
    if (!CHRONICLE_FM_KEYS.has(k) && !DISCARD_FM_KEYS.has(k)) {
      marp[k] = v === true ? true : v === 'true' ? true : v === 'false' ? false : v
    }
  }
  let bodyContent = content
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (fmMatch) {
    const rawFm = fmMatch[1]
    const marpKeyRe = /^(marp|theme|size|footer|paginate|header|class|backgroundColor|backgroundImage|color|style):/m
    if (marpKeyRe.test(rawFm)) {
      rawFm.split('\n').forEach((line) => {
        const c = line.indexOf(':')
        if (c < 0) return
        const k = line.slice(0, c).trim()
        const v = line.slice(c + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
        if (!CHRONICLE_FM_KEYS.has(k) && !DISCARD_FM_KEYS.has(k)) {
          marp[k] = v === 'true' ? true : v === 'false' ? false : v
        }
      })
      bodyContent = content.slice(fmMatch[0].length)
    }
  }

  const type = detectType(meta)

  return {
    id: null,
    title: meta.title || filename.replace(/\.[^/.]+$/, ''),
    date: meta.date || now,
    updatedAt: '',
    tags: meta.tags || [],
    font: meta.font || 'sans',
    author: meta.author || '',
    aiGenerated: meta.aiGenerated === true,
    status: 'local',
    type,
    slideshow: meta.slideshow || {},
    marp,
    content: bodyContent,
    _source: 'local',
    _fileHandle: fileHandle,
  }
}

// ══════════════════════════════════════════════════════
// 数据标准化函数（openPost 内部使用）
// ══════════════════════════════════════════════════════

/**
 * 将云端 API 返回的文章详情标准化为 ApiPost。
 *
 * 云端 API（GET /api/post?id=xxx&mode=edit）返回的 detail 已接近 ApiPost 形状，
 * 但 type 可能缺失、content 可能仍含 Marp YAML、字段可能有缺省值。
 *
 * @param detail 云端 API 返回的文章详情 JSON
 */
export function cloudDetailToApiPost(detail: Record<string, any>): ApiPost {
  const rawContent: string = String(detail.content || '')
  const rawMeta: Record<string, any> = {
    type: detail.type || detail.meta?.type,
    marp: detail.marp,
    ...detail.slideshow ? { slideshow: detail.slideshow } : {},
  }

  // API 响应中的元数据字段（非 frontmatter），不应进入 marp
  const API_META_KEYS = new Set([
    'id', '_id', '__v', 'status', 'createdAt', 'updatedAt', 'date',
    'content', 'compiledHtml', 'toc', 'hasHtml', 'hadContent',
    'meta', 'filename', 'dir', 'summary', 'draft',
    'collection', 'collectionPath',
  ])

  // 从 detail 字段和正文中分离非白名单 FM 键（Marp 透传）
  const marp: Record<string, any> = {}
  // 先从 detail 顶层提取（兼容单块 Marp 文件，Marp 键混在 Chronicle FM 中）
  for (const [k, v] of Object.entries(detail)) {
    if (!CHRONICLE_FM_KEYS.has(k) && !API_META_KEYS.has(k)) {
      marp[k] = v === true ? true : v === 'true' ? true : v === 'false' ? false : v
    }
  }
  let bodyContent = rawContent
  const fmMatch = rawContent.match(/^---\n([\s\S]*?)\n---\n?/)
  if (fmMatch) {
    const rawFm = fmMatch[1]
    const marpKeyRe = /^(marp|theme|size|footer|paginate|header|class|backgroundColor|backgroundImage|color|style):/m
    if (marpKeyRe.test(rawFm)) {
      rawFm.split('\n').forEach((line) => {
        const c = line.indexOf(':')
        if (c < 0) return
        const k = line.slice(0, c).trim()
        const v = line.slice(c + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
        if (!CHRONICLE_FM_KEYS.has(k) && !DISCARD_FM_KEYS.has(k)) {
          marp[k] = v === 'true' ? true : v === 'false' ? false : v
        }
      })
      bodyContent = rawContent.slice(fmMatch[0].length)
    }
  }

  const type = detectType(rawMeta)

  return {
    id: detail.id || null,
    title: detail.title || '',
    date: detail.date || '',
    updatedAt: detail.updatedAt || '',
    tags: Array.isArray(detail.tags) ? detail.tags : [],
    font: detail.font || 'sans',
    author: detail.author || detail.meta?.author || '',
    aiGenerated: detail.aiGenerated === true || detail.aiGenerated === 'true' || detail.aiGenerated === '1',
    status: detail.status || 'draft',
    type,
    slideshow: detail.slideshow || {},
    marp,
    content: bodyContent,
    _source: 'cloud',
  }
}

/**
 * 将关于页 API 返回的数据标准化为 ApiPost。
 *
 * 关于页（GET /api/admin/about）返回 { content, lastModified }。
 * type 固定为 'article'，不需要启发式判定。
 *
 * @param data 关于页 API 返回的数据
 */
export function aboutToApiPost(data: { content?: string; lastModified?: string }): ApiPost {
  const content = String(data.content || '')
  return {
    id: '__about__',
    title: 'About',
    date: data.lastModified || '',
    updatedAt: data.lastModified || '',
    tags: [],
    font: 'sans',
    author: '',
    aiGenerated: false,
    status: 'published',
    type: 'article',
    slideshow: {},
    marp: {},
    content,
    _source: 'cloud',
  }
}

/**
 * 从 ApiPost 拆出壳元数据和 body 内容。
 *
 * 这是 openPost 内部的最后一步变换——输入已标准化的 ApiPost，
 * 输出 metadata（壳消费）和 content（body 消费）。
 *
 * slides 模式下，apiPost.marp 中的非白名单键序列化为 YAML 写回 content 头部。
 *
 * @param apiPost 已标准化的 ApiPost（类型已判定、Marp 已分离、默认值已填）
 */
export function resolveEditorPayload(apiPost: ApiPost): {
  metadata: {
    title: string; date: string; tags: string[]; author: string
    aiGenerated: boolean; font: string; type: 'article' | 'slides'
    slideshow: Record<string, any>
    postId: string | null; postStatus: ApiPost['status']
    fileHandle?: any
  }
  content: string
} {
  let content = apiPost.content

  // slides 模式：序列化 marp 回 content 头部
  if (apiPost.type === 'slides' && Object.keys(apiPost.marp).length > 0) {
    const lines = Object.entries(apiPost.marp).map(([k, v]) =>
      typeof v === 'boolean' ? `${k}: ${v}` : `${k}: ${v}`)
    content = `---\n${lines.join('\n')}\n---\n\n${content}`
  }

  return {
    metadata: {
      title: apiPost.title,
      date: apiPost.date,
      tags: apiPost.tags,
      author: apiPost.author,
      aiGenerated: apiPost.aiGenerated,
      font: apiPost.font,
      type: apiPost.type as 'article' | 'slides',
      slideshow: apiPost.slideshow || {},
      postId: apiPost.id,
      postStatus: apiPost.status,
      fileHandle: apiPost._fileHandle,
    },
    content,
  }
}

// ══════════════════════════════════════════════════════
// @deprecated EditorFm — 新代码使用 ApiPost + resolveEditorPayload
// ══════════════════════════════════════════════════════

/**
 * @deprecated 新代码使用 ApiPost + resolveEditorPayload(apiPost).metadata 替代。
 *             壳消费的元数据现在直接从 resolveEditorPayload 的返回值获取，
 *             不再需要独立的 EditorFm 类型。
 */
export interface EditorFm {
  type: 'article' | 'slides'
  title: string
  date: string
  tags: string[]
  author: string
  aiGenerated: boolean
  font: string
  slideshow: Record<string, any>
  /** Marp 专属配置（theme, size, paginate 等），仅 slides 类型有值 */
  marp: Record<string, any>
}

/** 保存基线快照——用于与当前值比较判断 fmChanged */
export interface SavedFm {
  title: string
  date: string
  tags: string[]
  author: string
  aiGenerated: boolean
  font?: string
  slideshow?: Record<string, any>
}

/**
 * Chronicle 专属 frontmatter 键集合。
 * 解析 Marp 正文 YAML 时，这些键保留在 Chronicle FM 块中，
 * 其余键（如 marp, theme, size）被视为 Marp 配置。
 */
export const CHRONICLE_FM_KEYS = new Set([
  'title', 'date', 'updatedAt', 'tags', 'font', 'author',
  'aiGenerated', 'type', 'slideshow',
])

/** 既非 Chronicle FM 也非 Marp FM 的元数据键——解析时直接丢弃，不进入 marp 记录 */
const DISCARD_FM_KEYS = new Set([
  'collection', 'collectionPath',
])


// ══════════════════════════════════════════════════════
// 类型检测（启发式 → 一等公民）
// ══════════════════════════════════════════════════════

/**
 * 从 raw frontmatter 提取文档类型。
 *
 * 判定规则（仅显式声明）：
 *   1. meta.type === 'slides'     → 显式声明
 *   2. meta.marp === true         → Marp 标记
 *   3. 以上都不满足               → article
 *
 * 注意：不再根据 Marp 专属键（theme, size 等）启发式推断——
 *       这些键名太通用，在 article 自定义 frontmatter 中容易误判。
 */
export function detectType(meta: Record<string, any>): 'article' | 'slides' {
  if (meta.type === 'slides') return 'slides'
  if (meta.marp === true || meta.marp === 'true') return 'slides'
  return 'article'
}

/**
 * 从 API 标准格式提取结构化 EditorFm。
 *
 * @deprecated 新代码使用 resolveEditorPayload(apiPost) 替代。
 *             extractEditorFm 的职责已拆分：
 *             - 类型判定 + Marp 分离 + 默认值 → 上移到 xxxToApiFormat
 *             - 拆包 → resolveEditorPayload
 *
 * 输入：ApiPost（来自云端 API 或 localFileToApiFormat）
 * 输出：EditorFm — 类型已判定、所有字段有默认值、Marp 键已分离
 *
 * 使用场景：
 *   - 云端加载 → applyLoadedPost 调用
 *   - 本地打开 → updateEditor 调用
 *   - 草稿恢复 → restoreDraft 调用
 */
export function extractEditorFm(api: ApiPost): EditorFm {
  // 从 content 中提取 Marp YAML（仅 slides 类型可能存在）
  const marp: Record<string, any> = {}
  const fmMatch = api.content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (fmMatch) {
    const rawFm = fmMatch[1]
    if (/^(marp|theme|size|footer|paginate|header|class|backgroundColor|backgroundImage|color):/m.test(rawFm)) {
      rawFm.split('\n').forEach((line) => {
        const c = line.indexOf(':')
        if (c < 0) return
        const k = line.slice(0, c).trim()
        const v = line.slice(c + 1).trim().replace(/^"(.*)"$/, '$1')
        if (!CHRONICLE_FM_KEYS.has(k)) {
          marp[k] = v === 'true' ? true : v === 'false' ? false : v
        }
      })
    }
  }

  // 类型判定：显式 type > Marp 键启发式
  const meta: Record<string, any> = {
    type: api.type,
    marp: Object.keys(marp).length > 0 ? true : undefined,
    ...marp,
  }
  // 如果有 slideshow 配置也作为判定依据
  if (api.slideshow && Object.keys(api.slideshow).length > 0) {
    meta.slideshow = api.slideshow
  }
  const type = detectType(meta)

  return {
    type,
    title: api.title || '',
    date: api.date || '',
    tags: api.tags || [],
    author: api.author || '',
    aiGenerated: api.aiGenerated || false,
    font: type === 'slides' ? 'sans' : (api.font || 'sans'),
    slideshow: api.slideshow || {},
    marp,
  }
}

/** @deprecated 使用 detectType(meta) === 'slides' 替代 */
export function isSlidesMeta(meta: Record<string, any>) {
  return detectType(meta) === 'slides'
}

/**
 * 从解析出的 meta + 正文构建本地文件详情对象。
 * 用于本地打开文件时生成 PostMeta 结构。
 *
 * @deprecated 新代码应使用 extractEditorFm() + 直接构建 detail
 */
export function buildLocalDetail(
  meta: Record<string, any>,
  content: string,
  filename: string,
  type: 'article' | 'slides',
) {
  return {
    id: null,
    title: meta.title || filename.replace(/\.[^/.]+$/, ''),
    date: meta.date || '',
    updatedAt: '',
    status: 'local' as const,
    tags: meta.tags || [],
    font: meta.font || 'sans',
    author: meta.author || '',
    aiGenerated: meta.aiGenerated || false,
    type,
    content,
  }
}

/**
 * 剥离 frontmatter 块并规范化换行符。
 * 脏检测时用于比较正文部分（排除 frontmatter）。
 */
export function normalizeBody(raw: string): string {
  let body = raw.replace(/\r\n/g, '\n')
  const m = body.match(/^---\n[\s\S]*?\n---\n\n?/)
  if (m) body = body.slice(m[0].length)
  return body
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
}

export interface EditorFrontmatterOptions {
  editorType: ReturnType<typeof ref<'article' | 'slides'>>
  t: (key: string) => string
}

export function useEditorFrontmatter(options: EditorFrontmatterOptions) {
  const { editorType, t } = options

  // ══════════════════════════════════════════════════════
  // 文章元数据（响应式状态）
  // ══════════════════════════════════════════════════════

  const postTitle = ref('')
  const isDefaultTitle = ref(true)
  /** 标题变更时同步 document.title，并跟踪是否为默认标题 */
  watch(
    postTitle,
    (val) => {
      if (val) document.title = `${val} - Chronicle Workdown`
      else document.title = 'Chronicle Workdown'
      if (val && val !== t('editor.untitled')) isDefaultTitle.value = false
    },
    { immediate: true },
  )

  const postId = ref<string | null>(null)
  const postStatus = ref<
    'local' | 'draft' | 'published' | 'modifying' | 'building'
  >('local')
  const postTags = ref<string[]>([])
  const postFont = ref<string>('sans')
  const postAuthor = ref<string>('')
  /** 幻灯片专属配置（theme, ratio, footer 等） */
  const slideshowConfig = ref<Record<string, any>>({})
  const postAIGenerated = ref<boolean>(false)
  const postDate = ref<string>('')
  const postUpdated = ref<string>('')

  /** 标签输入框的当前文本 */
  const tagInput = ref('')

  // ══════════════════════════════════════════════════════
  // 字段读取工具
  // ══════════════════════════════════════════════════════

  /** 从 API 返回的 detail 对象中提取 author（兼容 meta.author 嵌套） */
  function readAuthorFromDetail(detail: any): string {
    const raw = detail?.author ?? detail?.meta?.author ?? ''
    return String(raw || '').trim()
  }

  /** 从 API 返回的 detail 对象中提取 aiGenerated（兼容多种存储格式） */
  function readAiGeneratedFromDetail(detail: any): boolean {
    const raw =
      detail?.aiGenerated ??
      detail?.ai_generated ??
      detail?.meta?.aiGenerated ??
      detail?.meta?.ai_generated
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'number') return raw === 1
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase()
      return normalized === 'true' || normalized === '1' || normalized === 'yes'
    }
    return false
  }

  // ══════════════════════════════════════════════════════
  // 标签管理
  // ══════════════════════════════════════════════════════

  function addTag() {
    const val = tagInput.value.trim()
    if (val && !postTags.value.includes(val)) {
      postTags.value.push(val)
    }
    tagInput.value = ''
  }

  function removeTag(tag: string) {
    postTags.value = postTags.value.filter((t) => t !== tag)
  }

  /** 切换 'featured' 标签（精选标记） */
  function toggleFeatured() {
    if (postTags.value.includes('featured')) {
      removeTag('featured')
    } else {
      postTags.value.push('featured')
    }
  }

  // ══════════════════════════════════════════════════════
  // 脏检测基线
  // ══════════════════════════════════════════════════════

  /**
   * 构建当前前端状态的 SavedFm 快照。
   * 幻灯片模式：font 不参与比较（幻灯片字体由 Marp 主题控制），
   * 但 slideshowConfig 参与比较。
   */
  function buildSavedFm(): SavedFm {
    return {
      title: postTitle.value,
      date: postDate.value,
      tags: [...postTags.value],
      author: postAuthor.value,
      aiGenerated: postAIGenerated.value,
      font:
        editorType.value === 'slides' ? undefined : postFont.value,
      slideshow:
        editorType.value === 'slides'
          ? { ...slideshowConfig.value }
          : undefined,
    }
  }

  /** 正文的保存基线（保存时更新，用于 bodyChanged 比较） */
  const savedContent = ref('')

  /** frontmatter 字段的保存基线（保存时更新，用于 fmChanged 比较） */
  const savedFm = ref<SavedFm>({
    title: '',
    date: '',
    tags: [],
    author: '',
    aiGenerated: false,
  })

  /**
   * frontmatter 是否已修改。
   * 比较 7 个字段：title, date, tags, author, aiGenerated, font, slideshowConfig。
   * slides 模式下 font 不参与比较。
   */
  const fmChanged = computed(() => {
    const s = savedFm.value
    const isSlides = editorType.value === 'slides'
    return (
      postTitle.value !== s.title ||
      postDate.value !== s.date ||
      JSON.stringify(postTags.value.slice().sort()) !==
        JSON.stringify((s.tags || []).slice().sort()) ||
      postAuthor.value !== s.author ||
      postAIGenerated.value !== s.aiGenerated ||
      (!isSlides && postFont.value !== (s.font || 'sans')) ||
      (isSlides &&
        JSON.stringify(slideshowConfig.value || {}) !==
          JSON.stringify(s.slideshow || {}))
    )
  })

  // ══════════════════════════════════════════════════════
  // 对外 API
  // ══════════════════════════════════════════════════════

  return {
    // 状态
    postTitle, isDefaultTitle,
    postDate, postUpdated,
    postTags, postFont, postAuthor, postAIGenerated,
    slideshowConfig, tagInput,
    postId, postStatus,
    savedContent, savedFm,
    // 计算属性
    fmChanged,
    // 函数
    buildSavedFm, addTag, removeTag, toggleFeatured,
    readAuthorFromDetail, readAiGeneratedFromDetail,
    normalizeBody,
    // 重导出（其他 composable 和 BlogEditor 通过此文件使用）
    parseFrontmatter, stringifyFrontmatter,
    localFileToApiFormat, detectType, extractEditorFm,
    cloudDetailToApiPost, aboutToApiPost, resolveEditorPayload,
    isSlidesMeta, buildLocalDetail,
    CHRONICLE_FM_KEYS,
  }
}
