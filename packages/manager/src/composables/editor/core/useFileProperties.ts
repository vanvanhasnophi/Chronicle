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

// Re-export from markdown/useFrontmatter for other composables that import from this file
import {
  parseFrontmatter,
  stringifyFrontmatter,
  type SavedFm,
  type ApiPost,
  CHRONICLE_FM_KEYS,
  normalizeBody,
  localFileToApiFormat,
  detectType,
  extractEditorFm,
  cloudDetailToApiPost,
  aboutToApiPost,
  resolveEditorPayload,
  isSlidesMeta,
  buildLocalDetail,
} from '../markdown/useFrontmatter'
export {
  parseFrontmatter,
  stringifyFrontmatter,
  CHRONICLE_FM_KEYS,
  normalizeBody,
  localFileToApiFormat,
  detectType,
  extractEditorFm,
  cloudDetailToApiPost,
  aboutToApiPost,
  resolveEditorPayload,
  isSlidesMeta,
  buildLocalDetail,
}
export type { SavedFm, ApiPost }

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
