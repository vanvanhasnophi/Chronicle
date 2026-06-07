/**
 * schemaApi — single-entry schema sync with localStorage-persisted version cache.
 *
 * syncSchemas() is the only public fetch function. It deduplicates in-flight
 * requests, throttles via localStorage timestamp, validates remote data before
 * writing, and updates a reactive store consumed by the rest of the app.
 */

import { ref } from 'vue'
import { fetchWithAuth } from '../utils/fetchWithAuth'

const LS_KEY = 'chronicle_schema_store'

// ── Reactive store ──

/** Reactive mirror of cached schemas. Module-load restores from localStorage. */
export const schemaStore = ref<Record<string, any>>(loadFromLocal())

// ── Internal state ──

let inflight: Promise<Record<string, any>> | null = null

// ── Local persistence ──

interface Stored {
  schemas: Record<string, any>
  fetchedAt: number
}

function loadFromLocal(): Record<string, any> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const stored: Stored = JSON.parse(raw)
    return stored.schemas && typeof stored.schemas === 'object' ? stored.schemas : {}
  } catch {
    return {}
  }
}

function savedAt(): number {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return 0
    const stored: Stored = JSON.parse(raw)
    return stored.fetchedAt || 0
  } catch {
    return 0
  }
}

function saveToLocal(schemas: Record<string, any>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ schemas, fetchedAt: Date.now() }))
  } catch { /* quota exceeded — not critical, memory cache still works */ }
}

// ── Validation ──

function isValidBundle(schemas: unknown): schemas is Record<string, any> {
  if (!schemas || typeof schemas !== 'object') return false
  const entries = Object.entries(schemas as Record<string, any>)
  if (entries.length === 0) return false
  return entries.some(
    ([id, s]) =>
      typeof id === 'string' &&
      id.startsWith('chronicle:') &&
      s &&
      typeof s === 'object',
  )
}

// ── Version helpers ──

function versionMap(schemas: Record<string, any>): Record<string, string> {
  const vers: Record<string, string> = {}
  for (const [id, schema] of Object.entries(schemas)) {
    vers[id] = schema?.['x-version'] || '0'
  }
  return vers
}

// ── Public API ──

const THROTTLE_MS = 60_000

/** Module-load marker — confirms schemaApi is loaded before any call happens. */
console.log('[schemaApi] module loaded — schemaStore has', Object.keys(schemaStore.value).length, 'local schemas')

/**
 * Synchronise schemas with the server.
 *
 * Always resolves — throttle → cache, network → validate → commit, error → keep local.
 */
export async function syncSchemas(force = false): Promise<Record<string, any>> {
  const T = '[syncSchemas]'
  console.log(T, `called — force=${force}`)

  // 1. Throttle (skip when forced)
  const last = savedAt()
  const age = last > 0 ? Date.now() - last : Infinity
  if (!force && last > 0 && age < THROTTLE_MS) {
    console.log(T, `throttled → returning ${Object.keys(schemaStore.value).length} cached schemas`)
    return schemaStore.value
  }

  // 2. Deduplicate
  if (inflight) {
    console.log(T, 'reusing in-flight request')
    return inflight
  }

  // 3. Start network request
  console.log(T, '→ creating fetch promise')
  inflight = (async () => {
    try {
      try {
        const url = `/api/admin/schemas?t=${Date.now()}`
        console.log(T, '→ fetchWithAuth', url)
        const res = await fetchWithAuth(url)
        console.log(T, `← ${res.status} ${res.statusText}`)

        if (!res.ok) {
          console.warn(T, `HTTP ${res.status} — returning ${Object.keys(schemaStore.value).length} local schemas`)
          return schemaStore.value
        }

        const envelope = await res.json()
        const remote = envelope?.data ?? envelope ?? {}
        const remoteIds = Object.keys(remote)
        console.log(T, `parsed ${remoteIds.length} remote schemas: ${remoteIds.join(', ') || '(none)'}`)

        if (!isValidBundle(remote)) {
          console.warn(T, 'bundle invalid (no chronicle: prefix) — rejected')
          return schemaStore.value
        }

        // Compare versions (skip when forced — always overwrite)
        const remoteVers = versionMap(remote)
        const localVers = versionMap(schemaStore.value)
        let changed = force
        if (!changed && Object.keys(remoteVers).length !== Object.keys(localVers).length) {
          changed = true
        }
        if (!changed) {
          for (const id of Object.keys(remoteVers)) {
            if (remoteVers[id] !== localVers[id]) { changed = true; break }
          }
        }

        // Commit — always persist on force refresh
        schemaStore.value = remote
        if (changed) {
          saveToLocal(remote)
          console.log(T, force ? 'forced → localStorage overwritten' : 'versions changed → localStorage updated')
          for (const id of Object.keys(remoteVers)) {
            if (remoteVers[id] !== localVers[id]) {
              console.log(T, `  ${id}: ${localVers[id] || 'none'} → ${remoteVers[id]}`)
            }
          }
        } else {
          console.log(T, 'versions unchanged')
        }
      } finally {
        // ALWAYS clear inflight so retries are possible
        inflight = null
      }
    } catch (err) {
      console.warn(T, 'error, keeping local data —', err)
    }
    console.log(T, 'complete → resolved with', Object.keys(schemaStore.value).length, 'schemas')
    return schemaStore.value
  })()

  console.log(T, 'returning inflight promise')
  return inflight
}

// ── Locales ──

let localeCache: Record<string, Record<string, any>> | null = null
let localeInflight: Promise<Record<string, Record<string, any>>> | null = null

export async function fetchLocales(langs: string[]): Promise<Record<string, Record<string, any>>> {
  const key = langs.sort().join(',')
  if (localeCache) return localeCache
  if (localeInflight) return localeInflight

  localeInflight = (async () => {
    try {
      const res = await fetchWithAuth(
        `/api/admin/schema/locale?langs=${encodeURIComponent(key)}&t=${Date.now()}`,
      )
      if (res.ok) {
        const envelope = await res.json()
        localeCache = envelope?.data ?? envelope ?? {}
      }
    } catch (e) {
      console.warn('[fetchLocales] Failed', e)
    }
    localeInflight = null
    return localeCache ?? {}
  })()

  return localeInflight
}
