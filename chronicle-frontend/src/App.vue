<script setup lang="ts">
import { fetchWithAuth } from './utils/fetchWithAuth';
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Icons } from './utils/icons'
import { ensureNotoLoaded } from './utils/fontLoader'
import { hexToRgbString } from './utils/colorUtils'
import { resolveBackgroundCompression, resolveBackgroundUrl } from './utils/backgroundSettings'
import FilePreviewModal from './components/FilePreviewModal.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'
import Toast from './components/Toast.vue'
import useToast from './composables/useToast'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()
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
    const compression = resolveBackgroundCompression(meta, scope)
    document.documentElement.style.setProperty(`${prefix}-bg-pos`, `${meta.posX || 50}% ${meta.posY || 50}%`)
    document.documentElement.style.setProperty(`${prefix}-bg-size`, `${meta.size || 100}%`)
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
        imgEl.style.backgroundPosition = `${(meta && meta.posX) || 50}% ${(meta && meta.posY) || 50}%`
        imgEl.style.backgroundSize = `${(meta && meta.size) || 100}%`
        imgEl.style.filter = `blur(${(meta && meta.blur) || 0}px)`
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
  // enable custom background rendering
  isCustomBackgroundReady.value = true
  try { ensureBackgroundLayer() } catch (e) { }
  // Re-apply settings once unlocked so custom background image/meta are rendered.
  try { void applySettings() } catch (e) { }
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
  try {
    try {
      const resp = await fetchWithAuth(`/api/settings?t=${Date.now()}`)
      if (resp.ok) {
        const s = await resp.json()
        return s || {}
      }
    } catch (e) { }

    return {}
  } catch (e) {
    return {}
  }
}

async function applySettings() {
  try {
    const s = await getSettings()
    // Apply Languages
    if (isBackend.value) {
      if (s.backendLocale && s.backendLocale !== 'follow') {
        locale.value = s.backendLocale
      } else {
        const nav = navigator.language || 'en'
        locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
      }
    } else {
      // For frontend:
      // 1. If user has NO preference (first visit), respect server default locale.
      // 2. If user explicitly chose 'follow' (in localStorage), they mean "Follow Browser", so stick to navigator.
      const userPref = localStorage.getItem('locale')
      if (!userPref) {
        if (s.frontendLocale && s.frontendLocale !== 'follow') {
          locale.value = s.frontendLocale
        } else {
          const nav = navigator.language || 'en'
          locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
        }
      }
      // If userPref exists (including 'follow' or 'zh-CN'), we respect it (already applied by applyFrontendLocaleFromSelection)
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
        if (s.backendTheme) {
          if (s.backendTheme === 'follow' || s.backendTheme === 'system') {
            document.body.removeAttribute('data-backend-theme')
          } else if (s.backendTheme === 'light') {
            document.body.setAttribute('data-backend-theme', 'light')
          } else if (s.backendTheme === 'dark') {
            document.body.setAttribute('data-backend-theme', 'dark')
          }
        }
      }

      if (s.frontendAccent) {
        const accent = String(s.frontendAccent)
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
  // Always apply settings global (fonts)
  await applySettings()

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
    applyBackendLocaleIfNeeded()
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
      try { void applySettings() } catch (e) { }
    }, 250)
  } catch (e) { }

  if (isBackend.value) {
    applyBackendLocaleIfNeeded()
    try { document.body.classList.add('backend') } catch (e) { }
  } else {
    applyFrontendLocaleFromSelection()
    try { document.body.classList.remove('backend') } catch (e) { }
  }
})

const isMenuOpen = ref(false)
const isBuildActive = computed(() => route.path.startsWith('/settings/build'))
import { APP_VERSION, APP_YEAR } from './version'
const docTitle = ref(typeof document !== 'undefined' ? document.title : '')
let titleObserver: MutationObserver | null = null

const showBackendShell = computed(() => route.path !== '/editor' && route.path !== '/login' && isBackend.value)
const isContentRoute = computed(() => route.path.startsWith('/manage') || route.path.startsWith('/settings/homepage') || route.path.startsWith('/settings/friends'))
const isSettingsRoute = computed(() => route.path.startsWith('/settings/appearance') || route.path.startsWith('/settings/security'))
const backendContentOpen = ref(isContentRoute.value)
const backendSettingsOpen = ref(isSettingsRoute.value)

watch(isContentRoute, (open) => {
  if (open) backendContentOpen.value = true
})

watch(isSettingsRoute, (open) => {
  if (open) backendSettingsOpen.value = true
})

function toggleBackendContent() {
  backendContentOpen.value = !backendContentOpen.value
}

function toggleBackendSettings() {
  backendSettingsOpen.value = !backendSettingsOpen.value
}

watch(route, () => {
  isMenuOpen.value = false
})

// Sidebar actions: open frontend and trigger astro rebuild
const { show: showToast } = useToast()
const isRebuilding = ref(false)

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
      showToast(t('settings.buildCompleted'), { status: 'success', position: 'bottom-center', shape: 'capsule' })
    } else {
      showToast(t('settings.buildFailed'), { status: 'error', position: 'bottom-center', shape: 'capsule' })
    }
  } catch (e) {
    showToast(t('settings.buildFailed'), { status: 'error', position: 'bottom-center', shape: 'capsule' })
  } finally {
    isRebuilding.value = false
  }
}
</script>

<template>
  <div id="app">
    <template v-if="showBackendShell">
      <button class="menu-toggle backend-menu-toggle" @click="isMenuOpen = !isMenuOpen" 
        v-html="isMenuOpen ? null : Icons.menu" aria-label="Toggle backend navigation"></button>

      <aside class="backend-sidebar" :class="{ 'mobile-open': isMenuOpen }">
        <div class="backend-sidebar-header">
          <div class="backend-brand" @click="router.push('/manage')">
            <h1 class="app-title">{{ $t('app.title') }}</h1>
            <span class="backend-brand-subtitle">Manager</span>
          </div>
          <button v-if="isMenuOpen" class="nav-close backend-close" @click="isMenuOpen = false" aria-label="Close menu">
            <span class="nav-close-icon" v-html="Icons.cross"></span>
          </button>
        </div>

          <div class="sidebar-nav">
          <RouterLink to="/dashboard" class="nav-link backend-nav-link" @click="isMenuOpen = false">{{ $t('nav.dashboard') }}</RouterLink>
          <RouterLink to="/files" class="nav-link backend-nav-link" @click="isMenuOpen = false">{{ $t('nav.files') }}</RouterLink>
          <RouterLink to="/traffic" class="nav-link backend-nav-link" @click="isMenuOpen = false">{{ $t('nav.traffic') }}</RouterLink>
          <div class="backend-tree-group" :class="{ expanded: backendContentOpen, active: isContentRoute }">
            <button type="button" class="nav-link backend-nav-link backend-tree-toggle"
              @click="toggleBackendContent">
              <span>{{ $t('nav.content') }}</span>
              <span class="backend-tree-caret" :class="{ open: backendContentOpen }" v-html="Icons.chevron"></span>
            </button>
            <div v-show="backendContentOpen" class="backend-tree-children">
              <RouterLink to="/manage" class="nav-link backend-nav-link backend-tree-child" @click="isMenuOpen = false">{{ $t('nav.posts') }}</RouterLink>
              <RouterLink to="/settings/homepage" class="nav-link backend-nav-link backend-tree-child" @click="isMenuOpen = false">{{ $t('settings.shortHome') }}</RouterLink>
              <RouterLink to="/settings/friends" class="nav-link backend-nav-link backend-tree-child" @click="isMenuOpen = false">{{ $t('settings.friends') }}</RouterLink>
            </div>
          </div>
          <div class="backend-tree-group" :class="{ expanded: backendSettingsOpen, active: isSettingsRoute }">
            <button type="button" class="nav-link backend-nav-link backend-tree-toggle"
              @click="toggleBackendSettings">
              <span>{{ $t('nav.settings') }}</span>
              <span class="backend-tree-caret" :class="{ open: backendSettingsOpen }" v-html="Icons.chevron"></span>
            </button>
            <div v-show="backendSettingsOpen" class="backend-tree-children">
              <RouterLink to="/settings/appearance" class="nav-link backend-nav-link backend-tree-child" @click="isMenuOpen = false">{{ $t('settings.appearance') }}</RouterLink>
              <RouterLink to="/settings/security" class="nav-link backend-nav-link backend-tree-child" @click="isMenuOpen = false">{{ $t('settings.security') }}</RouterLink>
            </div>
          </div>
        </div>
        <div class="backend-sidebar-footer">
          <RouterLink to="/settings/build" :class="['nav-link backend-nav-link sidebar-footer-item sidebar-footer-link', { 'router-link-active': isBuildActive }]" @click="isMenuOpen = false" :aria-current="isBuildActive ? 'page' : null">
            <span class="icon-svg footer-icon" v-html="Icons.columns"></span>
            <span class="footer-label">{{ $t('nav.build') }}</span>
          </RouterLink>

          <button class="sidebar-footer-item sidebar-footer-icon-btn" type="button" @click="rebuildFrontend" :disabled="isRebuilding" :title="$t('nav.buildNow')" aria-label="{{ $t('nav.buildNow') }}">
            <span class="icon-svg footer-icon" v-html="Icons.refresh"></span>
          </button>

          <button class="sidebar-footer-item sidebar-footer-icon-btn" type="button" @click="openFrontend" :title="$t('nav.openFrontend')" aria-label="{{ $t('nav.openFrontend') }}">
            <span class="icon-svg footer-icon" v-html="Icons.link"></span>
          </button>
        </div>
      </aside>
    </template>

    <main class="main-content" :class="{ 'no-nav': route.path === '/editor', 'backend-main': showBackendShell }">
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
  height: 100vh;
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
  z-index: 102;
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
  color: var(--text-inactive);
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.backend-nav-link.router-link-active {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.nav-link:hover {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}


.main-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-top: 0;
  height: 100vh;
  box-sizing: border-box;
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

.backend-menu-toggle {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 1100;
}

.backend-sidebar {
  position: fixed;
  top: 8px;
  left: 8px;
  bottom: 8px;
  width: 240px;
  padding: 0.6rem 0.5rem;
  box-sizing: border-box;
  background: var(--component-bg-blur-alt);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-color-blur);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  z-index: 1090;
  border-radius: 12px;
  box-shadow: 4px 0 10px 0 rgba(0, 0, 0, 0.05);
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
}

.backend-brand-subtitle {
  font-size: 0.82rem;
  color: var(--component-text-secondary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  flex: 1;
  padding: 0.2rem 0.2rem 0;
  overflow-y:auto;
}

.sidebar-nav::-webkit-scrollbar {
  width: 4px;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--component-text-secondary) 50%, transparent);
  border-radius: 4px;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--component-text-primary) 50%, transparent);

}


.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}



.backend-tree-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border-radius:12px;
}

.backend-tree-group.active,
.backend-tree-group.expanded  {
  background: var(--component-bg-blur-alt);
  color: var(--component-text-primary-hover);
}

.backend-tree-group.active:not(.expanded) .backend-tree-toggle{
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.backend-tree-toggle {
  display: flex;
  background: transparent;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  border: none;
  cursor: pointer;
  text-align: left;
  line-height: 24px;
}

.backend-tree-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  transition: transform 0.18s ease;
  transform: rotate(0deg); /* closed = down */
  flex: 0 0 auto;
}

.backend-tree-caret.open {
  transform: rotate(180deg); /* open = up */
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

.backend-nav-link, .sidebar-footer-link {
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
  margin-top: auto; /* stick to bottom */
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


.sidebar-footer-icon-btn { justify-content: center; width: 44px; height: 36px; }
.sidebar-footer-item:disabled { opacity: 0.6; cursor: not-allowed; }
.sidebar-footer-item:hover { background: var(--component-bg-hover); color: var(--component-text-primary-hover); }

/* Ensure v-html injected SVGs are vertically centered inside footer items */
.footer-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; line-height: 0; }
/* scoped styles need :deep to target injected SVG elements */
:deep(.footer-icon) svg { width: 20px !important; height: 20px !important; display: block !important; vertical-align: middle !important; }
.footer-label { font-size: 1rem; }

</style>