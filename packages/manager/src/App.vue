<script setup lang="ts">
import { fetchWithAuth } from './utils/fetchWithAuth';
import { readApiErrorMessage } from './utils/apiError.ts'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ShellIcons } from './utils/shellIcons'
import { ensureNotoLoaded } from './utils/fontLoader'
import { hexToRgbString } from './utils/colorUtils'
import { resolveBackgroundCompression, resolveBackgroundUrl } from './utils/backgroundSettings'
import { useSchemaNav, type NavGroup } from './composables/useSchemaNav'
import { syncSchemas } from './composables/schemaApi'
import { syncSettings, settingsStore } from './composables/settingsApi'
import FilePreviewModal from './components/FilePreviewModal.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'
import Toast from './components/Toast.vue'
import useToast from './composables/useToast'
import { useI18n } from 'vue-i18n'
import TitleBar from './components/TitleBar.vue'
import SafeTeleport from './components/SafeTeleport.vue'

const route = useRoute()
const router = useRouter()
const isPrintPreviewRoute = computed(() => route.path === '/editor/print')
const isBackend = computed(() => {
  // Explicit frontend routes: Home, BlogList, BlogPost, Search, Friends
  const frontendPrefixes = ['/', '/blogs', '/post', '/search', '/friends']
  const p = route.path || ''
  // Root is frontend
  if (p === '/') return false
  // If path starts with any frontend prefix (except root), treat as frontend
  for (const pref of frontendPrefixes) {
    if (pref === '/') continue
    if (p.startsWith(pref)) return false
  }
  // Otherwise treat as backend
  return true
})
document.body.addEventListener('touchstart', (e) => {
  const target = e.target as Element | null;
  if (!target || !target.closest('button, a , select, .btn, .nav-link')) {
    // allow tapping non-interactive elements without delay
    return;
  }
}, { passive: true }) // improve mobile click responsiveness

const { locale, t } = useI18n()
const __VERSION__ = APP_VERSION // Replace with actual version
const __YEAR__ = APP_YEAR // Replace with actual year
let selectObserver: MutationObserver | null = null
let themeAttrObserver: MutationObserver | null = null
let backendThemeAttrObserver: MutationObserver | null = null
let colorSchemeMQL: MediaQueryList | null = null
let bgLcpObserver: PerformanceObserver | null = null
let bgLcpFallbackTimer: number | null = null
let bgLcpActivationScheduled = false
const isCustomBackgroundReady = ref(false)
let bgRenderVersion = 0
const backgroundPreparedCache = new Map<string, Promise<{ ok: boolean; preparedUrl: string }>>()
const backgroundObjectUrls = new Set<string>()
let currentBackgroundUrl = ''
let backgroundSuspended = false
let bgRouteSuspendTimer: number | null = null

function parseBackgroundMeta(raw: any) {
  try {
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return null
  }
}

function writeBackgroundMetaVars(scope: 'frontend' | 'backend', meta: any) {
  if (!meta) return
  const prefix = scope === 'frontend' ? '--frontend' : '--backend'
  try {
    const compression = meta.compressionFactor || meta.compression || meta.bgCompression || meta.scale || 1
    const mode = meta.mode || 'cover'

    document.documentElement.style.setProperty(`${prefix}-bg-mode`, mode)

    switch (mode) {
      case 'cover':
        document.documentElement.style.setProperty(`${prefix}-bg-pos`, 'center')
        document.documentElement.style.setProperty(`${prefix}-bg-size`, 'cover')
        document.documentElement.style.setProperty(`${prefix}-bg-repeat`, 'no-repeat')
        break
      case 'contain':
        document.documentElement.style.setProperty(`${prefix}-bg-pos`, 'center')
        document.documentElement.style.setProperty(`${prefix}-bg-size`, 'contain')
        document.documentElement.style.setProperty(`${prefix}-bg-repeat`, 'no-repeat')
        break
      case 'fill':
        document.documentElement.style.setProperty(`${prefix}-bg-pos`, 'center')
        document.documentElement.style.setProperty(`${prefix}-bg-size`, '100% 100%')
        document.documentElement.style.setProperty(`${prefix}-bg-repeat`, 'no-repeat')
        break
      case 'tile':
        document.documentElement.style.setProperty(`${prefix}-bg-pos`, '0 0')
        const tileSize = (meta.size || 100) * (compression || 1)
        document.documentElement.style.setProperty(`${prefix}-bg-size`, `${tileSize}%`)
        document.documentElement.style.setProperty(`${prefix}-bg-repeat`, 'repeat')
        break
      case 'custom':
        document.documentElement.style.setProperty(`${prefix}-bg-pos`, `${meta.posX || 50}% ${meta.posY || 50}%`)
        const customSize = (meta.size || 100) * (compression || 1)
        document.documentElement.style.setProperty(`${prefix}-bg-size`, `${customSize}%`)
        document.documentElement.style.setProperty(`${prefix}-bg-repeat`, 'no-repeat')
        break
    }

    document.documentElement.style.setProperty(`${prefix}-bg-blur`, `${meta.blur || 0}px`)
    document.documentElement.style.setProperty(`${prefix}-bg-compression`, String(compression || 1))

    const overlayLight = meta.overlayLightColor || meta.overlayColor || 'transparent'
    const overlayLightOpa = (meta.overlayLightOpacity != null) ? ((meta.overlayLightOpacity || 0) / 100) : ((meta.overlayOpacity || 0) / 100)
    const overlayDark = meta.overlayDarkColor || meta.overlayColor || 'transparent'
    const overlayDarkOpa = (meta.overlayDarkOpacity != null) ? ((meta.overlayDarkOpacity || 0) / 100) : ((meta.overlayOpacity || 0) / 100)

    if (overlayLight === 'transparent') {
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-light`, 'transparent')
    } else {
      const rgbL = hexToRgbString(overlayLight)
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-light`, `rgba(${rgbL}, ${overlayLightOpa})`)
    }

    if (overlayDark === 'transparent') {
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-dark`, 'transparent')
    } else {
      const rgbD = hexToRgbString(overlayDark)
      document.documentElement.style.setProperty(`${prefix}-bg-overlay-dark`, `rgba(${rgbD}, ${overlayDarkOpa})`)
    }

    let chosen = ''
    if (scope === 'frontend') {
      const dt = document.documentElement.getAttribute('data-theme')
      if (dt === 'light') chosen = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-light')
      else if (dt === 'dark') chosen = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-dark')
      else {
        try { chosen = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-dark') : getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-light') } catch (e) { chosen = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-light') }
      }
    } else {
      const bt = document.body.getAttribute('data-backend-theme')
      if (bt === 'light') chosen = getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-light')
      else if (bt === 'dark') chosen = getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-dark')
      else {
        try { chosen = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-dark') : getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-light') } catch (e) { chosen = getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-light') }
      }
    }

    if (chosen && chosen.trim()) document.documentElement.style.setProperty(`${prefix}-bg-overlay`, chosen)
  } catch (e) { }
}

function preloadBackgroundImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!url) {
        resolve(false)
        return
      }

      const img = new Image()
      let done = false
      const finish = (ok: boolean) => {
        if (done) return
        done = true
        resolve(ok)
      }

      img.onload = async () => {
        try {
          if ((img as any).decode) await (img as any).decode()
        } catch (e) { }
        finish(true)
      }
      img.onerror = () => finish(false)
        ; (img as any).decoding = 'async'
      img.src = url
    } catch (e) {
      resolve(false)
    }
  })
}

function ensureBackgroundImagePrepared(url: string): Promise<{ ok: boolean; preparedUrl: string }> {
  try {
    const normalizedUrl = String(url || '').trim()
    if (!normalizedUrl) return Promise.resolve({ ok: false, preparedUrl: '' })

    const cached = backgroundPreparedCache.get(normalizedUrl)
    if (cached) return cached

    // (quiet) start preparing background image
    const p = (async () => {
      // Prefer fully downloaded blob url to avoid progressive display artifacts.
      try {
        const resp = await fetchWithAuth(normalizedUrl, { cache: 'force-cache' })
        if (resp.ok) {
          const blob = await resp.blob()
          if (blob && blob.size > 0) {
            const objUrl = URL.createObjectURL(blob)
            try { backgroundObjectUrls.add(objUrl) } catch (e) { }
            const okBlob = await preloadBackgroundImage(objUrl)
            if (okBlob) return { ok: true, preparedUrl: objUrl }
          }
        }
      } catch (e) { }

      const ok = await preloadBackgroundImage(normalizedUrl)
      return { ok, preparedUrl: ok ? normalizedUrl : '' }
    })().then((result) => {
      if (result && result.ok) {
        try { console.info('[bg] image-loaded', normalizedUrl) } catch (e) { }
      } else {
        try { backgroundPreparedCache.delete(normalizedUrl) } catch (e) { }
      }
      return result
    })

    backgroundPreparedCache.set(normalizedUrl, p)
    return p
  } catch (e) {
    return Promise.resolve({ ok: false, preparedUrl: '' })
  }
}

async function stageBackgroundLayer(
  imageUrl: string,
  meta: any,
  overlayValue: string
) {
  try {
    const layer = document.getElementById('chronicle-bg-layer')
    if (!layer) return
    if (backgroundSuspended) return

    const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
    const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
    const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
    const renderId = ++bgRenderVersion

    // stage start

    try {
      // ensure any previous ready state (showing previous image) is cleared;
      // we do not use a layer-level preparing animation so overlay/surface
      // remain visible immediately.
      layer.classList.remove('is-ready')
    } catch (e) { }

    try {
      if (surfaceEl) {
        const root = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || ''
        surfaceEl.style.background = root || 'transparent'
      }
      if (overlayEl) overlayEl.style.background = overlayValue || 'transparent'
      if (imgEl) {
        imgEl.style.backgroundImage = 'none'
        imgEl.style.filter = `blur(${(meta && meta.blur) || 0}px)`

        const mode = meta && meta.mode ? meta.mode : 'cover'
        const compression = (meta && (meta.compressionFactor || meta.compression || meta.bgCompression || meta.scale)) || 1

        switch (mode) {
          case 'cover':
            imgEl.style.backgroundPosition = 'center'
            imgEl.style.backgroundSize = 'cover'
            imgEl.style.backgroundRepeat = 'no-repeat'
            break
          case 'contain':
            imgEl.style.backgroundPosition = 'center'
            imgEl.style.backgroundSize = 'contain'
            imgEl.style.backgroundRepeat = 'no-repeat'
            break
          case 'fill':
            imgEl.style.backgroundPosition = 'center'
            imgEl.style.backgroundSize = '100% 100%'
            imgEl.style.backgroundRepeat = 'no-repeat'
            break
          case 'tile':
            imgEl.style.backgroundPosition = '0 0'
            const tileSize = ((meta && meta.size) || 100) * compression
            imgEl.style.backgroundSize = `${tileSize}%`
            imgEl.style.backgroundRepeat = 'repeat'
            break
          case 'custom':
            imgEl.style.backgroundPosition = `${(meta && meta.posX) || 50}% ${(meta && meta.posY) || 50}%`
            const customSize = ((meta && meta.size) || 100) * compression
            imgEl.style.backgroundSize = `${customSize}%`
            imgEl.style.backgroundRepeat = 'no-repeat'
            break
        }
      }
    } catch (e) { }

    const normalizedUrl = String(imageUrl || '').trim()
    if (!normalizedUrl) {
      if (renderId !== bgRenderVersion) return
      // No image to prepare; keep overlay/surface visible (they are styled directly),
      // but do not mark bg-image as ready so no image fade occurs.
      return
    }

    // Schedule image preparation asynchronously so overlay/surface paint can happen first.
    // Use requestIdleCallback when available to avoid competing with foreground tasks.
    const startPrepare = () => {
      const run = async () => {
        try {
          const prepared = await ensureBackgroundImagePrepared(normalizedUrl)
          if (renderId !== bgRenderVersion) return

          try {
            if (prepared.ok && prepared.preparedUrl) {
              try { console.info('[bg] image-applied', prepared.preparedUrl) } catch (e) { }
              if (imgEl) imgEl.style.backgroundImage = `url(${prepared.preparedUrl})`
              try { currentBackgroundUrl = normalizedUrl } catch (e) { }
            } else {
              if (imgEl) imgEl.style.backgroundImage = 'none'
            }
          } catch (e) { }

          try {
            // Force a reflow so the browser registers the background-image change
            // before we toggle visibility/opactiy classes. This helps ensure the
            // CSS transition for opacity runs reliably across browsers.
            try { void (imgEl && (imgEl as HTMLElement).offsetHeight) } catch (e) { }
            requestAnimationFrame(() => {
              if (renderId !== bgRenderVersion) return
              // Small delay to give browser a moment to settle before starting fade.
              setTimeout(() => {
                if (renderId !== bgRenderVersion) return
                // Add a transitionend listener on the image element to perform cleanup
                const onTransitionEnd = (ev: TransitionEvent) => {
                  try {
                    if (!imgEl) return
                    if (ev.target !== imgEl) return
                    if (ev.propertyName !== 'opacity') return
                    // Keep the currently applied prepared URL, revoke other blob URLs
                    const keep = (prepared && prepared.preparedUrl) ? prepared.preparedUrl : ''
                    backgroundObjectUrls.forEach((u) => {
                      try {
                        if (u && u !== keep) {
                          URL.revokeObjectURL(u)
                          backgroundObjectUrls.delete(u)
                        }
                      } catch (e) { }
                    })
                  } catch (e) { }
                  try { if (imgEl) imgEl.removeEventListener('transitionend', onTransitionEnd as any) } catch (e) { }
                }

                try { if (imgEl) imgEl.addEventListener('transitionend', onTransitionEnd as any) } catch (e) { }
                layer.classList.add('is-ready')
                try { console.info('[bg] fade-start', renderId) } catch (e) { }
              }, 30)
            })
          } catch (e) {
            try {
              layer.classList.add('is-ready')
              try { console.info('[bg] fade-start', renderId) } catch (e) { }
            } catch (err) { }
          }
        } catch (e) { }
      }

      if ((window as any).requestIdleCallback) {
        try { (window as any).requestIdleCallback(() => { void run() }, { timeout: 1000 }) } catch (e) { setTimeout(() => { void run() }, 50) }
      } else {
        setTimeout(() => { void run() }, 50)
      }
    }

    // Allow at least one RAF tick to let overlay/surface paint before preparing image.
    try {
      requestAnimationFrame(() => { requestAnimationFrame(() => { startPrepare() }) })
    } catch (e) {
      startPrepare()
    }
  } catch (e) { }
}

function ensureBackgroundLayer() {
  try {
    let layer = document.getElementById('chronicle-bg-layer')
    if (!layer) {
      // creating layer
      layer = document.createElement('div')
      layer.id = 'chronicle-bg-layer'
      const img = document.createElement('div')
      img.className = 'bg-image'
      const surface = document.createElement('div')
      surface.className = 'bg-surface'
      const overlay = document.createElement('div')
      overlay.className = 'bg-overlay'
      layer.appendChild(img)
      layer.appendChild(surface)
      layer.appendChild(overlay)
      // insert as first child of body so it's under everything
      if (document.body.firstChild) document.body.insertBefore(layer, document.body.firstChild)
      else document.body.appendChild(layer)
    } else {
      // layer exists
    }
  } catch (e) { }
}

function enableCustomBackgroundRendering() {
  if (isCustomBackgroundReady.value) return
  isCustomBackgroundReady.value = true
  try { ensureBackgroundLayer() } catch (e) { }
  // Skip settings/schemas on auth pages (no auth context needed)
  const isAuthPage = route.path === '/' || route.path === '/login' || route.path === '/setup' || route.path === '/recover' || route.path === '/editor'
  if (!isAuthPage) {
    try { void applySettings() } catch (e) { }
  }
  try { updateResolvedOverlays() } catch (e) { }
}

function scheduleCustomBackgroundAfterLcp() {
  if (bgLcpActivationScheduled) return
  bgLcpActivationScheduled = true

  const cleanup = () => {
    try { if (bgLcpObserver) bgLcpObserver.disconnect() } catch (e) { }
    bgLcpObserver = null
    try {
      if (bgLcpFallbackTimer != null) {
        window.clearTimeout(bgLcpFallbackTimer)
        bgLcpFallbackTimer = null
      }
    } catch (e) { }
  }

  const activate = () => {
    cleanup()
    try {
      // LCP observed -> activate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          enableCustomBackgroundRendering()
        })
      })
    } catch (e) {
      enableCustomBackgroundRendering()
    }
  }

  try {
    // Fallback: ensure background is eventually enabled even if LCP entry is unavailable.
    bgLcpFallbackTimer = window.setTimeout(() => {
      activate()
    }, 3000)
  } catch (e) { }

  try {
    if (typeof PerformanceObserver === 'undefined') {
      activate()
      return
    }

    bgLcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      if (!entries || entries.length === 0) return
      activate()
    })
    bgLcpObserver.observe({ type: 'largest-contentful-paint', buffered: true } as any)
  } catch (e) {
    activate()
  }
}

// Resolve and write the effective overlay CSS vars so body::after always reads a concrete rgba value
function updateResolvedOverlays() {
  try {
    // frontend
    try {
      const light = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-light') || ''
      const dark = getComputedStyle(document.documentElement).getPropertyValue('--frontend-bg-overlay-dark') || ''
      let chosen = ''
      const dt = document.documentElement.getAttribute('data-theme')
      if (dt === 'light') chosen = light
      else if (dt === 'dark') chosen = dark
      else {
        try { chosen = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? dark : light } catch (e) { chosen = light }
      }
      if (chosen && chosen.trim()) document.documentElement.style.setProperty('--frontend-bg-overlay', chosen)
    } catch (e) { }

    // backend
    try {
      const light = getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-light') || ''
      const dark = getComputedStyle(document.documentElement).getPropertyValue('--backend-bg-overlay-dark') || ''
      let chosen = ''
      const bt = document.body.getAttribute('data-backend-theme')
      if (bt === 'light') chosen = light
      else if (bt === 'dark') chosen = dark
      else {
        try { chosen = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? dark : light } catch (e) { chosen = light }
      }
      if (chosen && chosen.trim()) document.documentElement.style.setProperty('--backend-bg-overlay', chosen)
    } catch (e) { }
  } catch (e) { }

  // Also apply the resolved overlay color directly to the DOM background layer
  try {
    const layer = document.getElementById('chronicle-bg-layer')
    if (layer) {
      const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
      if (overlayEl) {
        try {
          const overlayVar = isBackend.value ? '--backend-bg-overlay' : '--frontend-bg-overlay'
          const v = getComputedStyle(document.documentElement).getPropertyValue(overlayVar) || ''
          overlayEl.style.background = (v && v.trim()) ? v : 'transparent'
        } catch (e) {
          overlayEl.style.background = 'transparent'
        }
      }
    }
  } catch (e) { }
}

async function getSettings() {
  // Don't request settings without an auth session — no token yet on login/setup.
  try {
    const auth = localStorage.getItem('chronicle_auth')
    if (!auth) return {}
    try { const session = JSON.parse(auth); if (!session.expiry || Date.now() > session.expiry) return {} } catch { return {} }
  } catch { return {} }

  // Fire-and-forget: sync schemas in background (don't block the page)
  syncSchemas()

  // syncSettings handles throttle, dedup, and localStorage persistence
  return await syncSettings()
}


async function applySettings() {
  const s = await getSettings()
  applySettingsFromStore(s)
}

/** Apply visual settings from a given settings object (does NOT fetch). */
function applySettingsFromStore(s: Record<string, any>) {
    try {
      ; (window as any).__CHRONICLE_SETTINGS__ = {
        ...(window as any).__CHRONICLE_SETTINGS__,
        ...s,
        gaMeasurementId: s?.gaMeasurementId || ''
      }
    } catch (e) { }

    // Note: do not inject gtag in the Vue management UI; traffic is only
    // collected for the public Astro site when the feature flag is enabled.
    // Apply Languages
    if (isBackend.value) {
      if (s.backendLocale && s.backendLocale !== 'follow') {
        locale.value = s.backendLocale
        localStorage.setItem('locale', s.backendLocale)
      } else {
        const nav = navigator.language || 'en'
        const resolved = nav.startsWith('zh') ? 'zh-CN' : 'en'
        locale.value = resolved
        localStorage.setItem('locale', resolved)
      }
    } else {
      const userPref = localStorage.getItem('locale')
      if (!userPref) {
        if (s.frontendLocale && s.frontendLocale !== 'follow') {
          locale.value = s.frontendLocale
          localStorage.setItem('locale', s.frontendLocale)
        } else {
          const nav = navigator.language || 'en'
          const resolved = nav.startsWith('zh') ? 'zh-CN' : 'en'
          locale.value = resolved
          localStorage.setItem('locale', resolved)
        }
      }
    }

    // Apply Fonts from server settings only
    try {
      if (s.frontendFont === 'serif') {
        // ensure serif font loaded when requested
        ensureNotoLoaded()
        document.documentElement.style.setProperty('--app-font-stack', "'Noto Serif SC', serif")
      } else {
        // default or sans
        document.documentElement.style.setProperty('--app-font-stack', 'var(--app-font-stack-inter)')
      }

      if (s.backendFont === 'serif') {
        ensureNotoLoaded()
        document.documentElement.style.setProperty('--backend-font-stack', "'Noto Serif SC', serif")
      } else {
        // default or sans
        document.documentElement.style.setProperty('--backend-font-stack', 'var(--app-font-stack-inter)')
      }
    } catch (e) { }

    // Apply Theme & Accent from server settings only
    try {
      if (s.frontendTheme) {
        if (s.frontendTheme === 'follow' || s.frontendTheme === 'system') {
          document.documentElement.removeAttribute('data-theme')
        } else if (s.frontendTheme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light')
        } else if (s.frontendTheme === 'dark') {
          document.documentElement.setAttribute('data-theme', 'dark')
        }
      }

      // Backend theme also comes from server settings.
      if (isBackend.value) {
        if (isPrintPreviewRoute.value) {
          document.body.setAttribute('data-backend-theme', 'light')
        } else if (s.backendTheme) {
          if (s.backendTheme === 'follow' || s.backendTheme === 'system') {
            document.body.removeAttribute('data-backend-theme')
          } else if (s.backendTheme === 'light') {
            document.body.setAttribute('data-backend-theme', 'light')
          } else if (s.backendTheme === 'dark') {
            document.body.setAttribute('data-backend-theme', 'dark')
          }
        }
      }

      if (s.backendAccent || s.frontendAccent) {
        const accent = String(s.backendAccent || s.frontendAccent)
        document.documentElement.style.setProperty('--accent-color', accent)
        // compute a darker variant for hover/active states
        try {
          const dark = (h => {
            // simple hex -> RGB darken by 14% (works for #rgb, #rrggbb)
            try {
              let hex = h.replace('#', '')
              if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
              const r = parseInt(hex.substring(0, 2), 16)
              const g = parseInt(hex.substring(2, 4), 16)
              const b = parseInt(hex.substring(4, 6), 16)
              const factor = 0.86
              const rr = Math.max(0, Math.min(255, Math.round(r * factor)))
              const gg = Math.max(0, Math.min(255, Math.round(g * factor)))
              const bb = Math.max(0, Math.min(255, Math.round(b * factor)))
              return `rgb(${rr}, ${gg}, ${bb})`
            } catch (e) { return accent }
          })(accent)
          document.documentElement.style.setProperty('--accent-color-dark', dark)
        } catch (e) { }
      }



      // Apply background with staged reveal: overlay/blur first, media source after load.
      try {
        const fb = s.frontendBackground
        const bb = s.backendBackground
        const frontendBgUrl = resolveBackgroundUrl(fb, 'frontend')
        const backendBgUrl = resolveBackgroundUrl(bb, 'backend')

        // Preload in advance so reveal can happen immediately once LCP is also ready.
        try {
          if (frontendBgUrl) void ensureBackgroundImagePrepared(frontendBgUrl)
          if (backendBgUrl) void ensureBackgroundImagePrepared(backendBgUrl)
        } catch (e) { }

        // Disable pseudo-element media rendering path; we render media only in #chronicle-bg-layer.
        try {
          document.documentElement.style.setProperty('--frontend-bg-image', 'none')
          document.documentElement.style.setProperty('--backend-bg-image', 'none')
          document.documentElement.style.setProperty('--frontend-bg-opacity', '0')
          document.documentElement.style.setProperty('--backend-bg-opacity', '0')
        } catch (e) { }

        if (!isCustomBackgroundReady.value) {
          try {
            document.documentElement.style.setProperty('--frontend-bg-overlay', 'transparent')
            document.documentElement.style.setProperty('--backend-bg-overlay', 'transparent')
          } catch (e) { }
        } else {
          try { ensureBackgroundLayer() } catch (e) { }

          const fm = parseBackgroundMeta(s.frontendBackgroundMeta)
          const bm = parseBackgroundMeta(s.backendBackgroundMeta)

          try { writeBackgroundMetaVars('frontend', fm) } catch (e) { }
          try { writeBackgroundMetaVars('backend', bm) } catch (e) { }

          const activeUrl = String(isBackend.value ? backendBgUrl : frontendBgUrl)

          let activeOverlay = 'transparent'
          try {
            const overlayVar = isBackend.value ? '--backend-bg-overlay' : '--frontend-bg-overlay'
            const v = getComputedStyle(document.documentElement).getPropertyValue(overlayVar) || ''
            activeOverlay = (v && v.trim()) ? v : 'transparent'
          } catch (e) { }

          const activeMeta = isBackend.value ? bm : fm
          // Logout clears the background — force re-stage on next login
          if ((window as any).__chronicleBgNeedsReset) {
            currentBackgroundUrl = ''
            ;(window as any).__chronicleBgNeedsReset = false
          }
          // Avoid re-staging the same background and don't block navigation.
          try {
            if (!backgroundSuspended && String(activeUrl || '').trim() && String(activeUrl || '').trim() !== currentBackgroundUrl) {
              // Do not await; let background render asynchronously and be cancellable by bgRenderVersion.
              void stageBackgroundLayer(activeUrl, activeMeta, activeOverlay)
            }
          } catch (e) { }
        }
      } catch (e) { }
    } catch (e) { }
  }


function applyFrontendLocaleFromSelection() {
  const storedLocale = localStorage.getItem('locale') || 'follow'
  if (!storedLocale || storedLocale === 'follow') {
    localStorage.setItem('locale', 'follow')
    const nav = navigator.language || 'en'
    locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
  } else {
    locale.value = storedLocale as any
  }
}

function applyBackendLocaleIfNeeded() {
  applySettings()
}

onMounted(async () => {
  // Check auth phase — redirect to setup if first boot (skip on all auth pages)
  if (route.path !== '/' && route.path !== '/login' && route.path !== '/setup' && route.path !== '/recover' && route.path !== '/editor') {
    try {
      const resp = await fetch(`/api/admin/status?t=${Date.now()}`)
      const json = await resp.json()
      const phase = (json.data && json.data.phase) || json.phase
      if (phase === 'setup' || phase === 'token') {
        router.replace('/setup')
        return
      }
    } catch { /* fall through */ }
  }

  const isAuthPage = route.path === '/login' || route.path === '/setup' || route.path === '/recover' || route.path === '/' || route.path === '/editor'

  // Auth pages: force-hide custom background layer on initial load
  try {
    if (isAuthPage) document.body.classList.add('auth-page')
    else document.body.classList.remove('auth-page')
  } catch (e) {}

  // Only load settings/schemas if authenticated (skip on public pages)
  const token = (() => { try { const r = localStorage.getItem('chronicle_auth'); return r ? JSON.parse(r).token : '' } catch { return '' } })()
  if (token && !isAuthPage) {
    await applySettings()
  }

  // Reload settings when navigating from a public page to an authenticated page
  let settingsLoaded = !!token
  watch(() => route.path, async (to) => {
    const pub = to === '/' || to === '/login' || to === '/setup' || to === '/recover' || to === '/editor'
    const tok = (() => { try { const r = localStorage.getItem('chronicle_auth'); return r ? JSON.parse(r).token : '' } catch { return '' } })()
    if (tok && !pub && !settingsLoaded) {
      await applySettings()
      settingsLoaded = true
    }
  })

  // Defer custom background rendering until LCP is finished.
  try { scheduleCustomBackgroundAfterLcp() } catch (e) { }

  // Ensure resolved overlay vars are written after initial settings applied
  try { updateResolvedOverlays() } catch (e) { }

  // Observe attribute changes on <html> and <body> so we can re-resolve overlay vars
  try {
    if (typeof MutationObserver !== 'undefined') {
      themeAttrObserver = new MutationObserver(() => { try { updateResolvedOverlays() } catch (e) { } })
      themeAttrObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      backendThemeAttrObserver = new MutationObserver(() => { try { updateResolvedOverlays() } catch (e) { } })
      backendThemeAttrObserver.observe(document.body, { attributes: true, attributeFilter: ['data-backend-theme'] })
    }
  } catch (e) { }

  // Listen to system color-scheme changes and re-resolve overlays
  try {
    if (window.matchMedia) {
      colorSchemeMQL = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => { try { updateResolvedOverlays() } catch (e) { } }
      // modern API
      if (typeof colorSchemeMQL.addEventListener === 'function') colorSchemeMQL.addEventListener('change', handler)
      else if (typeof colorSchemeMQL.addListener === 'function') colorSchemeMQL.addListener(handler)
    }
  } catch (e) { }

  // initial apply depending on area
  if (isBackend.value) {
    // Locale already applied by await applySettings() above — no need for a second fetch.
    try { document.body.classList.add('backend') } catch (e) { }
  } else {
    // load selected frontend locale from storage if available
    const stored = localStorage.getItem('locale')
    if (stored) {
      applyFrontendLocaleFromSelection()
    } else {
      // No stored preference -> Temporary default to browser language until settings load
      const nav = navigator.language || 'en'
      locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
    }
    try { document.body.classList.remove('backend') } catch (e) { }
  }




  // apply modern-select class to existing select elements site-wide
  try {
    document.querySelectorAll('select').forEach((s) => s.classList.add('modern-select'))
  } catch (e) { }

  // Helper to wrap a select element if not already wrapped
  function wrapSelectElement(el: Element) {
    const parent = el.parentElement
    if (parent && parent.classList && parent.classList.contains('select-wrap')) return
    const wrapper = document.createElement('span')
    wrapper.className = 'select-wrap'
    // Preserve display type so layout stays consistent and allow absolute pseudo
    try {
      const comp = window.getComputedStyle(el as Element)
      wrapper.style.display = (comp.display as string) || 'inline-block'
      wrapper.style.verticalAlign = (comp.verticalAlign as string) || 'middle'
    } catch (e) {
      wrapper.style.display = 'inline-block'
      wrapper.style.verticalAlign = 'middle'
    }
    // apply fixed margins to wrapper instead of reading from select
    wrapper.style.margin = '8px 0 16px 0'
    wrapper.style.position = 'relative'
    // Insert wrapper before select and move select inside
    el.parentNode?.insertBefore(wrapper, el)
    wrapper.appendChild(el)
    // Make select fill wrapper so widths match and pseudo-element overlays correctly
    try {
      (el as HTMLElement).style.margin = '0';
      (el as HTMLElement).style.width = '100%';
      (el as HTMLElement).style.boxSizing = 'border-box';
      (el as HTMLElement).style.display = 'block';
    } catch (e) { }
  }

  // Initial wrap for existing selects
  try {
    document.querySelectorAll('select.modern-select').forEach((sel) => wrapSelectElement(sel))
  } catch (e) { }

  // Observe DOM additions to wrap dynamically inserted selects
  try {
    selectObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return
          if ((n as Element).matches && (n as Element).matches('select.modern-select')) {
            wrapSelectElement(n as Element)
          }
          try {
            ; (n as Element).querySelectorAll && (n as Element).querySelectorAll('select.modern-select').forEach((s) => wrapSelectElement(s))
          } catch (e) { }
        })
      }
    })
    selectObserver.observe(document.body, { childList: true, subtree: true })
  } catch (e) { }

  // Observe <title> changes so `docTitle` stays in sync and UI reacts.
  try {
    if (typeof document !== 'undefined') {
      const titleEl = document.querySelector('title')
      // initial sync
      docTitle.value = document.title || ''
      if (titleEl) {
        titleObserver = new MutationObserver(() => {
          try { docTitle.value = document.title || '' } catch (e) { }
        })
        titleObserver.observe(titleEl, { characterData: true, childList: true, subtree: true })
      }
    }
  } catch (e) { }
})

onBeforeUnmount(() => {
  try { if (bgLcpObserver) bgLcpObserver.disconnect() } catch (e) { }
  bgLcpObserver = null
  try {
    if (bgLcpFallbackTimer != null) {
      window.clearTimeout(bgLcpFallbackTimer)
      bgLcpFallbackTimer = null
    }
  } catch (e) { }
  try {
    backgroundObjectUrls.forEach((u) => {
      try { URL.revokeObjectURL(u) } catch (err) { }
    })
    backgroundObjectUrls.clear()
  } catch (e) { }
  try { if (selectObserver) selectObserver.disconnect() } catch (e) { }
  try { if (titleObserver) titleObserver.disconnect() } catch (e) { }
  try { if (themeAttrObserver) themeAttrObserver.disconnect() } catch (e) { }
  try { if (backendThemeAttrObserver) backendThemeAttrObserver.disconnect() } catch (e) { }
  try {
    if (colorSchemeMQL) {
      if (typeof colorSchemeMQL.removeEventListener === 'function') colorSchemeMQL.removeEventListener('change', updateResolvedOverlays as any)
      else if (typeof colorSchemeMQL.removeListener === 'function') colorSchemeMQL.removeListener(updateResolvedOverlays as any)
    }
  } catch (e) { }
  try {
    if (bgRouteSuspendTimer != null) {
      window.clearTimeout(bgRouteSuspendTimer)
      bgRouteSuspendTimer = null
    }
    backgroundSuspended = false
  } catch (e) { }
})

// when route changes, switch between frontend/backend locale policies
watch(route, () => {
  // navigation happened -> give navigation priority over background rendering
  isMenuOpen.value = false

  // Auth pages (/, /login, /setup, /recover): force-disable background layer
  const isAuth = route.path === '/' || route.path === '/login' || route.path === '/setup' || route.path === '/recover' || route.path === '/editor'
  try {
    if (isAuth) document.body.classList.add('auth-page')
    else document.body.classList.remove('auth-page')
  } catch (e) {}

  // cancel any in-progress background staging
  try { bgRenderVersion++ } catch (e) { }
  try {
    backgroundSuspended = true
    if (bgRouteSuspendTimer != null) {
      window.clearTimeout(bgRouteSuspendTimer)
      bgRouteSuspendTimer = null
    }
    // resume background rendering shortly after navigation settles
    bgRouteSuspendTimer = window.setTimeout(() => {
      try { backgroundSuspended = false } catch (e) { }
      try { bgRouteSuspendTimer = null } catch (e) { }
      // Skip on auth pages — no settings/schema/background requests
      if (!isAuth) {
        try { void applySettings() } catch (e) { }
      }
    }, 250)
  } catch (e) { }

  if (isBackend.value) {
    if (!isAuth) applyBackendLocaleIfNeeded()
    try { document.body.classList.add('backend') } catch (e) { }
  } else {
    applyFrontendLocaleFromSelection()
    try { document.body.classList.remove('backend') } catch (e) { }
  }
})

const isMenuOpen = ref(false)
const isBuildActive = computed(() => route.path.startsWith('/settings/system-build'))
import { APP_VERSION, APP_YEAR } from './version'
const docTitle = ref(typeof document !== 'undefined' ? document.title : '')
let titleObserver: MutationObserver | null = null

const { navTree } = useSchemaNav()

const showBackendShell = computed(() => route.path !== '/editor' && route.path !== '/login' && route.path !== '/setup' && route.path !== '/recover' && !isPrintPreviewRoute.value && isBackend.value)

// ── Schema-driven group open/close state ──
const schemaGroupOpen = ref<Record<string, boolean>>({})

// Auto-expand group when current route matches one of its items
watch(() => route.path, (p) => {
  for (const g of navTree.value) {
    for (const item of g.items) {
      if (p.startsWith(item.route)) {
        schemaGroupOpen.value[g.group] = true
        return
      }
    }
  }
}, { immediate: true })

function toggleSchemaGroup(group: string) {
  schemaGroupOpen.value[group] = !schemaGroupOpen.value[group]
}

function isGroupActive(group: NavGroup): boolean {
  return group.items.some(item => route.path.startsWith(item.route))
}

// When settings are saved (applyLocalSettings), re-apply visuals immediately
// without waiting for the 500ms server reconciliation.
watch(settingsStore, (s) => { applySettingsFromStore(s) })

watch(route, () => {
  isMenuOpen.value = false
})

// Sidebar actions: open frontend and trigger astro rebuild
const { show: showToast } = useToast()
const isRebuilding = ref(false)
const isAvailable = ref(true)

function normalizeFrontendUrl(frontendUrl: string) {
  if (!frontendUrl) return '/'
  if (/^[a-zA-Z]+:\/\//.test(frontendUrl)) return frontendUrl
  return `https://${frontendUrl.replace(/^\/+/, '')}`
}



async function openFrontend() {
  try {
    const settings = await getSettings()
    const frontendUrl = normalizeFrontendUrl(settings.frontendUrl || 'blog.eightyfor.top')
    window.open(frontendUrl, '_blank')
  } catch (e) { }
}

async function rebuildFrontend() {
  if (isRebuilding.value) return
  isRebuilding.value = true
  isAvailable.value = false
  try {
    const authToken = (() => {
      try {
        const raw = localStorage.getItem('chronicle_auth')
        if (!raw) return ''
        const parsed = JSON.parse(raw)
        return typeof parsed?.token === 'string' ? parsed.token : ''
      } catch (e) { return '' }
    })()

    showToast(t('settings.buildTriggering'), { status: 'info', position: 'bottom-center', shape: 'capsule', duration: 2500 })
    const res = await fetchWithAuth(`/api/admin/build/astro?t=${Date.now()}`, {
      method: 'POST',
      headers: authToken ? { 'X-Chronicle-Auth': authToken } : {}
    })
    if (res.ok) {
      const result = await res.json().catch(() => ({}))
      if (result.status === 'timeout') {
        showToast(t('settings.buildTimeout'), { status: 'warning', position: 'bottom-center', shape: 'capsule' })
      } else {
        showToast(t('settings.buildCompleted'), { status: 'success', position: 'bottom-center', shape: 'capsule' })
      }
    } else {
      const message = await readApiErrorMessage(res, t('settings.buildFailed'))
      showToast(`${t('settings.buildErrorPrefix')}${message}`, { status: 'error', position: 'bottom-center', shape: 'capsule' })
    }
  } catch (e) {
    showToast(t('settings.buildFailed'), { status: 'error', position: 'bottom-center', shape: 'capsule' })
  } finally {
    isRebuilding.value = false
    isAvailable.value = true
  }
}
</script>

<template>
  <div id="app" :style="{ '--title-bar-left': showBackendShell ? '256px' : '0px' }" style="height: 100%;">
    <!-- Unified Electron title bar: drag on right side of sidebar, window controls fixed top-right -->
    <TitleBar />

    <!-- Editor: home button injected into TitleBar -->
    <SafeTeleport v-if="route.path === '/editor'" to="#title-bar-back">
      <button
        class="titlebar-btn"
        @click="router.push('/')" title="Home">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        </svg>
      </button>
    </SafeTeleport>

    <template v-if="showBackendShell">
      <button class="menu-toggle backend-menu-toggle" @click="isMenuOpen = !isMenuOpen"
        v-html="isMenuOpen ? null : ShellIcons.menu" aria-label="Toggle backend navigation"></button>

      <aside class="sidebar backend-sidebar" :class="{ 'mobile-open': isMenuOpen }">
        <div class="backend-sidebar-header">
          <div class="backend-brand" @click="router.push('/dashboard'); isMenuOpen = false" style="cursor: pointer;">
            <h1 class="app-title">{{ $t('app.title') }}</h1>
            <span class="backend-brand-subtitle">Manager</span>
          </div>
          <button v-if="isMenuOpen" class="nav-close backend-close" @click="isMenuOpen = false" aria-label="Close menu">
            <span class="nav-close-icon" v-html="ShellIcons.cross"></span>
          </button>
        </div>

        <div class="sidebar-nav">
          <RouterLink to="/dashboard" class="sidebar-items nav-link backend-nav-link" @click="isMenuOpen = false">{{
            $t('nav.dashboard') }}</RouterLink>
          <RouterLink to="/files" class="sidebar-items nav-link backend-nav-link" @click="isMenuOpen = false">{{
            $t('nav.files') }}</RouterLink>
          <RouterLink to="/traffic" class="sidebar-items nav-link backend-nav-link" @click="isMenuOpen = false">{{
            $t('nav.traffic') }}</RouterLink>
          <RouterLink to="/manage" class="sidebar-items nav-link backend-nav-link" @click="isMenuOpen = false">{{
            $t('nav.posts') }}</RouterLink>

          <!-- Schema-driven groups: each x-nav.group = one sidebar tree group -->
          <div
            v-for="group in navTree"
            :key="group.group"
            class="backend-tree-group"
            :class="{ expanded: schemaGroupOpen[group.group], active: isGroupActive(group) }"
          >
            <button type="button" class="sidebar-items nav-link backend-nav-link backend-tree-toggle"
              @click="toggleSchemaGroup(group.group)">
              <span>{{ $t('nav.group.' + group.group, group.label) }}</span>
              <span class="backend-tree-caret" :class="{ open: schemaGroupOpen[group.group] }" v-html="ShellIcons.chevron"></span>
            </button>
            <div v-show="schemaGroupOpen[group.group]" class="backend-tree-children">
              <RouterLink
                v-for="item in group.items"
                :key="item.route"
                :to="item.route"
                class="sidebar-items nav-link backend-nav-link backend-tree-child"
                @click="isMenuOpen = false"
              >{{ item.label }}</RouterLink>
            </div>
          </div>
        </div>
        <div class="backend-sidebar-footer">
          <RouterLink to="/settings/system-build"
            :class="['sidebar-items nav-link backend-nav-link sidebar-footer-item sidebar-footer-link', { 'router-link-active': isBuildActive }]"
            @click="isMenuOpen = false" :aria-current="isBuildActive ? 'page' : undefined">
            <span class="icon-svg footer-icon" v-html="ShellIcons.columns"></span>
            <span class="footer-label">{{ $t('nav.build') }}</span>
          </RouterLink>

          <button class="sidebar-footer-item sidebar-footer-icon-btn" type="button" @click="rebuildFrontend"
            :disabled="!isAvailable" :class="{ 'inprogress': isRebuilding }" :title="$t('nav.buildNow')"
            aria-label="{{ $t('nav.buildNow') }}">
            <span class="icon-svg footer-icon" v-html="ShellIcons.refresh"></span>
          </button>

          <button class="sidebar-footer-item sidebar-footer-icon-btn" type="button" @click="openFrontend"
            :title="$t('nav.openFrontend')" aria-label="{{ $t('nav.openFrontend') }}">
            <span class="icon-svg footer-icon" v-html="ShellIcons.link"></span>
          </button>
        </div>
      </aside>
    </template>

    <main class="main-content"
      :class="{ 'no-nav': route.path === '/editor', 'backend-main': showBackendShell, 'print-preview': isPrintPreviewRoute }">
      <RouterView />
    </main>
    <FilePreviewModal />
    <ImagePreviewModal />
    <Toast />
  </div>
</template>

<style scoped>
#app {
  display: flex;
  flex-direction: column;
  height: var(--app-height);
}

/* Electron: sidebar background bleeds into title bar, content pushed down */
body.is-electron .backend-sidebar {
  top: 8px; /* keep normal position — background extends under title bar */
}


body.is-electron .backend-menu-toggle {
  top: 48px; /* hamburger below title bar */
}

.menu-toggle {
  display: none;
  /* hide on desktop, show on small screens via media query */
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 10002;
  /* Higher than nav-content */
  /* Make the clickable area compact so the hamburger is not too tall */
  width: 40px;
  height: 40px;
  border-radius: 6px;
}

.menu-toggle svg {
  width: 18px;
  height: 18px;
  display: block;
  line-height: 0;
}

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }

  .backend-sidebar {
    transform: translateX(-102%);
    transition: transform 0.3s ease;
    box-shadow: 4px 4px 0 0 rgba(0, 0, 0, 0.28);
  }

  .main-content.backend-main {
    padding-left: 0 !important;
  }

  .backend-sidebar.mobile-open {
    transform: translateX(0);
  }

  .backend-menu-toggle {
    display: flex;
  }

  .main-content.backend-main {
    padding-left: 0;
  }
}

.nav-link {
  padding: 0.5rem 1rem;
}

.backend-nav-link.router-link-active {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-top: 0;
  min-height: 0;
  height: var(--app-height);
}


.main-content::-webkit-scrollbar {
  width: 10px;
}

.main-content::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--component-text-secondary) 50%, transparent);
  border-radius: 5px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--component-text-primary) 50%, transparent);

}


.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content.no-nav {
  padding-top: 0;
  overflow: hidden;
  z-index: 0;
}

.main-content.backend-main {
  padding-top: 0;
  padding-left: 256px;
}

.main-content.print-preview {
  padding: 0;
  background: #fff;
}

/* Electron: margin-top pushes .main-content below the 40px TitleBar.
   flex:1 naturally fills remaining space (100vh - 40px in Electron, 100vh in browser). */
body.is-electron .main-content {
  margin-top: 40px !important;
}

body.is-electron .main-content.print-preview {
  padding-top: 0; /* print preview stays full-screen */
}

@media print {
  .main-content.print-preview {
    overflow: visible !important;
    height: auto !important;
    min-height: auto !important;
  }
}

.backend-menu-toggle {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 10001;
}

.backend-sidebar {
  position: fixed;
  top: 8px;
  left: 8px;
  bottom: 8px;
  width: 240px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  gap: 1rem;
  z-index: 10000;
}

.backend-sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.7rem 0.9rem;
  border-bottom: 1px solid var(--border-color);
}

.backend-close {
  background: transparent;
  border: none;
  color: var(--text-primary);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
}

.backend-close .nav-close-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.backend-close .nav-close-icon svg {
  width: 32px;
  height: 32px;
  display: block;
  stroke: currentColor;
}

.backend-brand {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  cursor: pointer;
}

.backend-brand .app-title {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.1;
  padding: 0;
}

.backend-brand-subtitle {
  font-size: 0.82rem;
  color: var(--component-text-secondary);
}



.backend-tree-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border-radius: 12px;
}

.backend-tree-group.active,
.backend-tree-group.expanded {
  background: var(--component-bg-blur-alt);
  color: var(--component-text-primary-hover);
}

.backend-tree-group.active:not(.expanded) .backend-tree-toggle {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.backend-tree-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  cursor: pointer;
  line-height: 24px;
}


.backend-tree-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  transition: transform 0.18s ease;
  transform: rotate(0deg);
  /* closed = down */
  flex: 0 0 auto;
}

.backend-tree-caret.open {
  transform: rotate(180deg);
  /* open = up */
}

.backend-tree-caret svg {
  width: 14px;
  height: 14px;
}

.backend-tree-children {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.8rem;
}

.backend-tree-child {
  padding: 0.65rem 0.85rem;
  font-size: 0.92rem;
  opacity: 0.96;
}

.backend-tree-child.router-link-active {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.backend-nav-link,
.sidebar-footer-link {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 0.4rem 0.8rem;
  border-radius: 10px;
}

.backend-sidebar-footer {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem 0.6rem 0.6rem;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  margin-top: auto;
  /* stick to bottom */
}

.sidebar-footer-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text-inactive);
  cursor: pointer;
  transition: all 0.3s ease;
}


@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.sidebar-footer-icon-btn {
  justify-content: center;
  width: 44px;
  height: 36px;
}

.sidebar-footer-item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sidebar-footer-item:disabled:hover {
  background: transparent;
  color: var(--text-inactive);
}

:deep(.sidebar-footer-icon-btn.inprogress svg) {
  animation: spin 5s linear infinite;
}

.sidebar-footer-item:hover {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}


/* Ensure v-html injected SVGs are vertically centered inside footer items */
.footer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  line-height: 0;
}

/* scoped styles need :deep to target injected SVG elements */
:deep(.footer-icon) svg {
  width: 20px !important;
  height: 20px !important;
  display: block !important;
}

.footer-label {
  font-size: 1rem;
}
</style>