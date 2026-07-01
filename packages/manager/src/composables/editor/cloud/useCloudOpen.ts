/**
 * useCloudOpen — Cloud 入站编排（contract 接收者）
 *
 * 从 useEditorLifecycle 中抽取云端加载逻辑。
 * 不预设 editorType，只调 contract 函数获取原始数据，
 * 标准化由调用方（lifecycle）的 xxxToApiFormat 完成。
 */

export interface CloudOpenContract {
  fetchPost: (fetchWithAuth: any, id: string) => Promise<Record<string, any> | null>
  fetchAbout: (fetchWithAuth: any) => Promise<{ content: string; lastModified: string } | null>
  allocateId: (fetchWithAuth: any) => Promise<string | null>
  getDraft: (id: string) => { content: string; meta: Record<string, any> } | null
  getHistory: (id: string) => Record<string, any> | null
  fetchWithAuth: any
}

export interface CloudOpenResult {
  /** 云端文章详情（原始 API 响应） */
  detail: Record<string, any>
  /** 本地草稿内容（如果存在） */
  draftContent: string | null
  /** 本地历史记录（如果存在） */
  history: Record<string, any> | null
}

export function createCloudOpen(c: CloudOpenContract) {
  const { fetchPost, fetchAbout, allocateId, getDraft, getHistory, fetchWithAuth } = c

  /** 加载云端文章 + 草稿 + 历史 */
  async function openPost(id: string): Promise<CloudOpenResult | null> {
    const detail = await fetchPost(fetchWithAuth, id)
    if (!detail) return null

    const draft = getDraft(id)
    const history = getHistory(id)

    return {
      detail,
      draftContent: draft?.content ?? null,
      history,
    }
  }

  /** 加载关于页 */
  async function openAbout(): Promise<{ content: string; lastModified: string } | null> {
    return fetchAbout(fetchWithAuth)
  }

  /** 分配云端 UUID */
  async function createPost(): Promise<string | null> {
    return allocateId(fetchWithAuth)
  }

  return { openPost, openAbout, createPost }
}
