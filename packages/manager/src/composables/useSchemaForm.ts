/**
 * useSchemaForm — shared logic for schema-driven settings pages.
 *
 * Handles:
 *  - Loading schema JSON from the local schema registry or remote fallback
 *  - Loading data from the backend API
 *  - Saving data back to the backend API
 *  - Reset to defaults
 *
 * Usage:
 *   const { schema, data, saving, load, save, reset, setDataValue } = useSchemaForm('chronicle:template-settings')
 *
 * The schema $id must match one of the known schema IDs. For now, schemas are
 * statically imported at build time; remote fetching (GET /api/admin/schemas)
 * is the fallback.
 */

import { ref, type Ref } from 'vue'
import { fetchWithAuth } from '../utils/fetchWithAuth'
import { syncSchemas } from './schemaApi'
import { applyLocalSettings } from './settingsApi'

// Local schema — always available, no API needed for CMS's own settings
import systemSettings from '../../schemas/system-settings.schema.json'
import securitySchema from '../../../host/schemas/security.schema.json'

const LOCAL_REGISTRY: Record<string, any> = {
  'chronicle:system-settings': systemSettings,
  'chronicle:security': securitySchema,
}

// ── Data API mappings: schema $id → endpoint for CRUD ──
const DATA_API_MAP: Record<string, string> = {
  'chronicle:template-settings': '/api/settings',
  'chronicle:system-settings': '/api/settings',
  'chronicle:collections': '/api/collections',
  'chronicle:friends': '/api/friends',
  'chronicle:profile': '/api/profile',
  'chronicle:security': '/api/auth/security',
}

// Endpoints that wrap the payload in a named key (e.g. /api/collections expects { collections: [...] })
const DATA_PAYLOAD_KEY: Record<string, string> = {
  'chronicle:collections': 'collections',
}

/** Build default data object (or array) from schema */
function buildDefaults(schema: Record<string, any>): Record<string, any> {
  if (schema.type === 'array') return []
  const defaults: Record<string, any> = {}
  const props = schema.properties || {}
  for (const [key, prop] of Object.entries(props)) {
    const p = prop as Record<string, any>
    if (p.default !== undefined) {
      defaults[key] = JSON.parse(JSON.stringify(p.default))
    } else if (p.type === 'object') {
      defaults[key] = {}
    } else if (p.type === 'array') {
      defaults[key] = []
    } else if (p.type === 'boolean') {
      defaults[key] = false
    } else if (p.type === 'number' || p.type === 'integer') {
      defaults[key] = 0
    } else {
      defaults[key] = ''
    }
  }
  return defaults
}

export interface SchemaFormState {
  schema: Ref<Record<string, any> | null>
  data: Ref<Record<string, any>>
  defaults: Ref<Record<string, any>>
  loading: Ref<boolean>
  saving: Ref<boolean>
  error: Ref<string>
}

export function useSchemaForm(schemaId: string) {
  const schema = ref<Record<string, any> | null>(null)
  const defaults = ref<Record<string, any>>({})
  const data = ref<Record<string, any>>({})
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const metaRefs = ref<Record<string, any>>({})
  const activeSchemaId = ref(schemaId)

  // ── Load schema: local for system-settings, API for template/host ──
  async function loadSchema(id: string): Promise<Record<string, any> | null> {
    // Local source (instant, no network)
    if (LOCAL_REGISTRY[id]) {
      schema.value = LOCAL_REGISTRY[id]
      defaults.value = buildDefaults(LOCAL_REGISTRY[id])
      return LOCAL_REGISTRY[id]
    }
    // API source (template-astro + host schemas)
    try {
      const allSchemas = await syncSchemas()
      const sch = allSchemas[id]
      if (sch) {
        schema.value = sch
        defaults.value = buildDefaults(sch)
        return sch
      }
    } catch (_) { /* network error */ }
    error.value = `Schema not found: ${id}`
    return null
  }

  // ── Load data from server ──
  async function load(schemaIdOverride?: string) {
    const id = schemaIdOverride || schemaId
    activeSchemaId.value = id
    loading.value = true
    error.value = ''

    const sch = await loadSchema(id)
    if (!sch) { loading.value = false; return }

    const endpoint = DATA_API_MAP[id]
    if (!endpoint) { loading.value = false; return }

    try {
      const res = await fetchWithAuth(`${endpoint}?t=${Date.now()}`)
      if (res.ok) {
        const serverData = await res.json()
        // Some APIs wrap the data in a named key — unwrap it.
        const payloadKey = DATA_PAYLOAD_KEY[id]
        const unwrapped = payloadKey && serverData && typeof serverData === 'object' && !Array.isArray(serverData)
          ? serverData[payloadKey]
          : serverData
        // Array schemas: store the array directly
        if (sch.type === 'array') {
          data.value = Array.isArray(unwrapped) ? unwrapped : (defaults.value as any[])
        } else {
          const merged = { ...defaults.value as Record<string, any> }
          if (serverData && typeof serverData === 'object' && !Array.isArray(serverData)) {
            for (const [key, val] of Object.entries(serverData as Record<string, any>)) {
              if (val !== undefined && val !== null) merged[key] = val
            }
          }
          // Pre-populate metaRefs from *Meta fields so that field
          // components (e.g. BackgroundEditorField) can read initial values.
          for (const key of Object.keys(merged)) {
            if (key.endsWith('Meta') && merged[key]) {
              const baseKey = key.replace(/Meta$/, '')
              try {
                metaRefs.value[baseKey] = typeof merged[key] === 'string'
                  ? JSON.parse(merged[key])
                  : merged[key]
              } catch { metaRefs.value[baseKey] = merged[key] }
            }
          }
          data.value = merged
        }
      } else {
        data.value = { ...defaults.value }
      }
    } catch (e: any) {
      data.value = { ...defaults.value }
      if (e?.message) error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // ── Save data to server ──
  async function save(): Promise<boolean> {
    saving.value = true
    const endpoint = DATA_API_MAP[activeSchemaId.value]
    if (!endpoint) { saving.value = false; return false }

    try {
      // Array schemas send the array; wrap in payload key if the API expects it
      const isArraySchema = schema.value?.type === 'array'
      let payload: any = isArraySchema
        ? (Array.isArray(data.value) ? data.value : [])
        : { ...data.value as Record<string, any> }
      // Wrap in named key (e.g. /api/collections expects { collections: [...] })
      const wrapKey = DATA_PAYLOAD_KEY[activeSchemaId.value]
      if (wrapKey) {
        payload = { [wrapKey]: payload }
      }
      if (!isArraySchema) {
        for (const [key, meta] of Object.entries(metaRefs.value)) {
          if (meta) {
            const metaKey = `${key}Meta`
            payload[metaKey] = typeof meta === 'string' ? meta : JSON.stringify(meta)
          }
        }
      }
      const res = await fetchWithAuth(`${endpoint}?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok && endpoint === '/api/settings') {
        applyLocalSettings(payload)
      }
      return res.ok
    } catch (e) {
      return false
    } finally {
      saving.value = false
    }
  }

  function reset() {
    data.value = Array.isArray(defaults.value) ? [...defaults.value] : { ...defaults.value }
    metaRefs.value = {}
  }

  function setDataValue(key: string, val: any) {
    if (Array.isArray(data.value)) {
      data.value = val // array schemas: replace entire array
    } else {
      data.value = { ...data.value, [key]: val }
    }
  }

  function setMeta(key: string, val: any) {
    metaRefs.value = { ...metaRefs.value, [key]: val }
  }

  return {
    schema, data, defaults, loading, saving, error,
    load, save, reset, setDataValue, setMeta, metaRefs,
    dataEndpoint: DATA_API_MAP[activeSchemaId.value] || '',
  }
}
