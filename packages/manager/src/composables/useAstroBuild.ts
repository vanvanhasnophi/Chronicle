/**
 * useAstroBuild — Unified Astro build trigger shared by BlogEditor & ManagerLayout.
 *
 * All build entry points call triggerBuild(). It manages the notification
 * centre lifecycle (start → progress → completed / failed) and returns
 * the build promise so callers can optionally await.
 */
import { getNotificationCenter } from './useNotificationCenter'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { readApiErrorMessage } from '../utils/apiError'

export interface BuildOptions {
  /** Human-readable trigger source, e.g. "Publish · Post Title" */
  source: string
  /** Optional post ID that triggered the build */
  postId?: string
  /** i18n translator function */
  t: (key: string) => string
  /** Optional key for sidebar-triggered builds */
  reason?: string
}

export async function triggerBuild(opts: BuildOptions): Promise<void> {
  const nc = getNotificationCenter()
  const { t } = opts

  const detailLabels = {
    id: t('notification.detailId'),
    trigger: t('notification.detailTrigger'),
    time: t('notification.detailTime'),
  }

  const bt = nc.startBuild(`${t('settings.building')} · ${opts.source}`)
  if (!bt) return
  const { nid, clientBuildId } = bt
  nc.update(nid, { message: nc.buildDetail(detailLabels, clientBuildId, opts.source) })

  try {
    const token = (() => {
      try {
        const raw = localStorage.getItem('chronicle_auth')
        if (!raw) return ''
        const parsed = JSON.parse(raw)
        return typeof parsed?.token === 'string' ? parsed.token : ''
      } catch { return '' }
    })()

    if (!token) throw new Error('Missing auth token')

    const res = await fetchWithAuth(`/api/admin/build/astro?t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chronicle-Auth': token,
      },
      body: JSON.stringify({
        postId: opts.postId,
        reason: opts.reason || 'publish',
        clientBuildId,
        source: opts.source,
      }),
    })

    if (!res.ok) {
      throw new Error(await readApiErrorMessage(res, `HTTP ${res.status}`))
    }

    const data = await res.json().catch(() => ({}))
    const baseMsg = nc.buildDetail(detailLabels, clientBuildId, opts.source)
    if (data.status === 'timeout') {
      nc.update(nid, { state: 'completed', level: 'warning', title: t('settings.buildTimeout'), message: baseMsg })
    } else {
      nc.update(nid, { state: 'completed', level: 'success', title: t('settings.buildCompleted'), message: baseMsg })
    }
  } catch (e: any) {
    nc.update(nid, {
      state: 'failed',
      level: 'error',
      title: t('settings.buildFailed'),
      message: `${nc.buildDetail(detailLabels, clientBuildId, opts.source)}\n${t('notification.detailError')}: ${e?.message || ''}`,
      actions: [{ label: t('nav.buildNow'), handler: 'retry-build' }],
    })
    throw e
  }
}
