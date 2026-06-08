/**
 * settingsApi — reactive settings store with localStorage persistence.
 *
 * Same pattern as schemaApi: single sync entry, throttle, in-flight dedup,
 * localStorage recovery on reload. Unlike schemas, settings change frequently
 * so the throttle window is shorter (2s).
 */

import { ref } from 'vue'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const LS_KEY = 'chronicle_settings'

// ── Reactive store ──

/** Reactive mirror of cached settings. Module-load restores from localStorage. */
export const settingsStore = ref<Record<string, any>>(loadFromLocal())

// ── Internal state ──

let inflight: Promise<Record<string, any>> | null = null

// ── Local persistence ──

interface Stored {
  settings: Record<string, any>
  savedAt: number
}

function loadFromLocal(): Record<string, any> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const stored: Stored = JSON.parse(raw)
    return stored.settings && typeof stored.settings === 'object' ? stored.settings : {}
  } catch {
    return {}
  }
}

function lastSaved(): number {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return 0
    const stored: Stored = JSON.parse(raw)
    return stored.savedAt || 0
  } catch {
    return 0
  }
}

function persist(settings: Record<string, any>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ settings, savedAt: Date.now() }))
  } catch { /* quota exceeded — not critical */ }
}

// ── Public API ──

const THROTTLE_MS = 2_000

/** Module-load marker */
console.log('[settingsApi] module loaded — store has', Object.keys(settingsStore.value).length, 'keys')

/**
 * Synchronise settings with the server.
 *
 * - Throttled to 2s — repeated calls within the window return the same cached data.
 * - In-flight calls are deduplicated.
 * - Always resolves; returns settingsStore.value on failure.
 */
export async function syncSettings(): Promise<Record<string, any>> {
  const T = '[syncSettings]'

  // 1. Throttle
  const last = lastSaved()
  const age = last > 0 ? Date.now() - last : Infinity
  if (last > 0 && age < THROTTLE_MS) {
    console.log(T, `throttled (${Math.round(age / 1000)}s < ${THROTTLE_MS / 1000}s)`)
    return settingsStore.value
  }

  // 2. Deduplicate
  if (inflight) {
    console.log(T, 'reusing in-flight request')
    return inflight
  }

  // 3. Fetch
  console.log(T, '→ GET /api/settings')
  inflight = (async () => {
    try {
      try {
        const res = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
        console.log(T, `← ${res.status}`)

        if (!res.ok) {
          return settingsStore.value
        }

        const data = await res.json()
        const settings = (data && typeof data === 'object' && !Array.isArray(data))
          ? data
          : {}

        if (Object.keys(settings).length > 0) {
          settingsStore.value = settings
          persist(settings)
          console.log(T, `saved ${Object.keys(settings).length} keys`)
        }
      } finally {
        inflight = null
      }
    } catch (err) {
      console.warn(T, 'network error — keeping local data', err)
    }
    return settingsStore.value
  })()

  return inflight
}

let _reconcileTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Optimistic update after POST /api/settings succeeds.
 * - Immediately merges the payload into settingsStore (instant UI feedback).
 * - Schedules a background server fetch (500ms debounced) to reconcile with
 *   the authoritative server state (handles server-side transforms, defaults).
 */
export function applyLocalSettings(patch: Record<string, any>) {
  settingsStore.value = { ...settingsStore.value, ...patch }
  persist(settingsStore.value)

  // Debounced reconciliation — fetch server truth shortly after the last write.
  if (_reconcileTimer !== null) clearTimeout(_reconcileTimer)
  _reconcileTimer = setTimeout(async () => {
    _reconcileTimer = null
    // Bypass throttle & inflight: force a fresh server fetch.
    const saved = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
    if (saved.ok) {
      try {
        const data = await saved.json()
        if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
          settingsStore.value = data
          persist(data)
        }
      } catch { /* keep optimistic value */ }
    }
  }, 500)
}
