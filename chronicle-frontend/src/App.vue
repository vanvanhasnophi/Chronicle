<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Icons } from './utils/icons'
import { Settings } from 'lucide-vue-next'
import { ensureNotoLoaded } from './utils/fontLoader'
import { hexToRgbString } from './utils/colorUtils'
import FilePreviewModal from './components/FilePreviewModal.vue'
import ImagePreviewModal from './components/ImagePreviewModal.vue'
import Toast from './components/Toast.vue'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const router = useRouter()

function openNewEditor() {
  router.push('/editor?id=new')
}
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
const selectedLocale = ref<string>(localStorage.getItem('locale') || 'follow')
const isMobileRoot = ref(false)
const showSettingsMenu = ref(false)
const navSettingBtn = ref<HTMLElement | null>(null)
const menuStyle = reactive<{ top?: string; left?: string; right?: string }>({ top: '0px', left: 'auto', right: '24px' })
const __VERSION__ = APP_VERSION // Replace with actual version
const __YEAR__ = APP_YEAR // Replace with actual year
let onWindowResize: (() => void) | null = null
let onWindowScroll: (() => void) | null = null
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
    document.documentElement.style.setProperty(`${prefix}-bg-pos`, `${meta.posX || 50}% ${meta.posY || 50}%`)
    document.documentElement.style.setProperty(`${prefix}-bg-size`, `${meta.size || 100}%`)
    document.documentElement.style.setProperty(`${prefix}-bg-blur`, `${meta.blur || 0}px`)

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
        const resp = await fetch(normalizedUrl, { cache: 'force-cache' })
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

function applyLocale(val: string) {
  selectedLocale.value = val
  showSettingsMenu.value = false
}

function onDocClick(e: MouseEvent) {
  const path = (e.composedPath && e.composedPath()) || (e as any).path || []
  const hit = path.some((el: any) => el && el.classList && (el.classList.contains('nav-settings-menu') || el.classList.contains('nav-setting-btn')))
  if (!hit) showSettingsMenu.value = false
}

function positionSettingsMenu() {
  if (!navSettingBtn.value) return
  const btnRect = navSettingBtn.value.getBoundingClientRect()
  // default menu dims
  const margin = 12
  const preferredTop = Math.round(btnRect.bottom + 8 + window.scrollY)
  // we will measure the menu after it's rendered
  nextTick(() => {
    const menuEl = document.querySelector('.nav-settings-menu') as HTMLElement | null
    if (!menuEl) return
    const menuRect = menuEl.getBoundingClientRect()
    let left = Math.round(btnRect.left + window.scrollX)
    // prefer aligning right edge of menu to button right if it overflows
    if (left + menuRect.width + margin > window.innerWidth) {
      left = Math.max(margin, Math.round(btnRect.right - menuRect.width + window.scrollX))
    }
    // ensure left not out of viewport
    if (left < margin) left = margin
    // ensure top fits vertically, otherwise flip above button
    let top = preferredTop
    if (top + menuRect.height > window.scrollY + window.innerHeight - margin) {
      // place above button
      top = Math.max(margin, Math.round(btnRect.top - menuRect.height - 8 + window.scrollY))
    }
    menuStyle.top = `${top}px`
    menuStyle.left = `${left}px`
    menuStyle.right = 'auto'
  })
}

// selected theme for the nav menu (frontend theme control)
const selectedTheme = ref('follow')

function applyTheme(val: string) {
  selectedTheme.value = val
  // merge into chronicle.settings in localStorage
  try {
    const key = 'chronicle.settings'
    const raw = localStorage.getItem(key)
    let cfg: any = {}
    if (raw) cfg = JSON.parse(raw)
    cfg.frontendTheme = val
    localStorage.setItem(key, JSON.stringify(cfg))
  } catch (e) { }
  // apply immediately
  try { applySettings() } catch (e) { }
  showSettingsMenu.value = false
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
    let settings: any = {}
    try {
      const stored = localStorage.getItem('chronicle.settings')
      if (stored) settings = JSON.parse(stored)
    } catch (e) { }

    try {
      const resp = await fetch('/api/settings')
      if (resp.ok) {
        const s = await resp.json()
        // 保持本地设置优先：先以服务器设置为基础，再让本地设置覆盖它
        settings = Object.assign({}, s, settings)
      }
    } catch (e) { }

    return settings
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

    // Apply Fonts
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

    // Apply Theme & Accent (if provided by server settings)
    try {
      // Respect local user settings stored in chronicle.settings first (mirror locale logic)
      let localCfg: any = null
      try {
        const raw = localStorage.getItem('chronicle.settings')
        if (raw) localCfg = JSON.parse(raw)
      } catch (e) { localCfg = null }

      // Frontend theme: only apply server-provided frontendTheme if user has no local frontendTheme
      if (!localCfg || !localCfg.frontendTheme) {
        if (s.frontendTheme) {
          if (s.frontendTheme === 'follow' || s.frontendTheme === 'system') {
            document.documentElement.removeAttribute('data-theme')
          } else if (s.frontendTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light')
          } else if (s.frontendTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark')
          }
        }
      } else {
        // local preference exists -> apply it
        const lf = String(localCfg.frontendTheme)
        if (lf === 'follow' || lf === 'system') document.documentElement.removeAttribute('data-theme')
        else if (lf === 'light') document.documentElement.setAttribute('data-theme', 'light')
        else if (lf === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
      }

      // Backend theme: prefer local setting, otherwise use server value when in backend area
      if (isBackend.value) {
        const backendThemeToApply = (localCfg && localCfg.backendTheme) ? localCfg.backendTheme : s.backendTheme
        if (backendThemeToApply) {
          if (backendThemeToApply === 'follow' || backendThemeToApply === 'system') {
            document.body.removeAttribute('data-backend-theme')
          } else if (backendThemeToApply === 'light') {
            document.body.setAttribute('data-backend-theme', 'light')
          } else if (backendThemeToApply === 'dark') {
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
        const fb = (localCfg && localCfg.frontendBackground) ? localCfg.frontendBackground : s.frontendBackground
        const bb = (localCfg && localCfg.backendBackground) ? localCfg.backendBackground : s.backendBackground

        // Preload in advance so reveal can happen immediately once LCP is also ready.
        try {
          if (fb) void ensureBackgroundImagePrepared(String(fb))
          if (bb) void ensureBackgroundImagePrepared(String(bb))
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

          const fm = parseBackgroundMeta((localCfg && localCfg.frontendBackgroundMeta) ? localCfg.frontendBackgroundMeta : s.frontendBackgroundMeta)
          const bm = parseBackgroundMeta((localCfg && localCfg.backendBackgroundMeta) ? localCfg.backendBackgroundMeta : s.backendBackgroundMeta)

          try { writeBackgroundMetaVars('frontend', fm) } catch (e) { }
          try { writeBackgroundMetaVars('backend', bm) } catch (e) { }

          const activeUrl = String((isBackend.value ? bb : fb) || '')

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

// re-export helper from utils
const ensureNotoLoadedLocal = ensureNotoLoaded

function applyFrontendLocaleFromSelection() {
  if (!selectedLocale.value || selectedLocale.value === 'follow') {
    // If 'follow' is explicitly selected by user or restored from localStorage, persist it.
    localStorage.setItem('locale', 'follow')
    const nav = navigator.language || 'en'
    locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
  } else {
    localStorage.setItem('locale', selectedLocale.value)
    locale.value = selectedLocale.value as any
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

  // Global mobile detection: set a root class (`is-mobile`) based on initial window width.
  // This is done once at startup (per requirement) and does not follow subsequent resizes.
  try {
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 720
    if (mobile) document.documentElement.classList.add('is-mobile')
    else document.documentElement.classList.remove('is-mobile')
    // keep a component-local copy for template conditions
    isMobileRoot.value = mobile
  } catch (e) { }


  // initial apply depending on area
  if (isBackend.value) {
    applyBackendLocaleIfNeeded()
    try { document.body.classList.add('backend') } catch (e) { }
  } else {
    // load selected frontend locale from storage if available
    const stored = localStorage.getItem('locale')
    if (stored) {
      selectedLocale.value = stored
      applyFrontendLocaleFromSelection()
    } else {
      // No stored preference -> Temporary default to browser language until settings load
      const nav = navigator.language || 'en'
      locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
    }
    try { document.body.classList.remove('backend') } catch (e) { }
  }

  // initialize selectedTheme from local settings if available
  try {
    const raw = localStorage.getItem('chronicle.settings')
    if (raw) {
      const cfg = JSON.parse(raw)
      if (cfg && cfg.frontendTheme) selectedTheme.value = cfg.frontendTheme
    }
  } catch (e) { }



  document.addEventListener('click', onDocClick)
  onWindowResize = () => { if (showSettingsMenu.value) positionSettingsMenu() }
  onWindowScroll = () => { if (showSettingsMenu.value) positionSettingsMenu() }
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('scroll', onWindowScroll, true)
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
  document.removeEventListener('click', onDocClick)
  try { if (onWindowResize) window.removeEventListener('resize', onWindowResize) } catch (e) { }
  try { if (onWindowScroll) window.removeEventListener('scroll', onWindowScroll, true) } catch (e) { }
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

// when selectedLocale changes (frontend language chooser)
watch(selectedLocale, (v) => {
  if (!isBackend.value) applyFrontendLocaleFromSelection()
})

// when menu opens, position it
watch(showSettingsMenu, (open) => {
  if (open) positionSettingsMenu()
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

const isScrolled = ref(false)
const isMenuOpen = ref(false)

// Reactive mirror of document.title so Vue can react to title changes
import { onMounted as _onMounted } from 'vue'
import { APP_VERSION, APP_YEAR } from './version'
const docTitle = ref(typeof document !== 'undefined' ? document.title : '')
let titleObserver: MutationObserver | null = null

const handleScroll = (e: Event) => {
  const target = e.target as HTMLElement
  // User requested ~30px
  isScrolled.value = target.scrollTop > 30
}

// Compute the article title from reactive `docTitle` when on a blog post route.
const articleTitle = computed(() => {
  try {
    if (!route.path.startsWith('/post')) return t('app.title')
    const dt = docTitle.value || ''
    if (!dt) return t('app.title')
    // Common pattern: "Post Title - Chronicle"; prefer left side
    const parts = dt.split(' - ')
    return parts.length > 1 ? parts[0] : dt
  } catch (e) {
    return t('app.title')
  }
})

watch(route, () => {
  isMenuOpen.value = false
})
</script>

<template>
  <div id="app">
    <nav class="nav-header" v-if="route.path !== '/editor' && route.path !== '/login'"
      :class="{ 'at-top': !isScrolled }">
      <div class="nav-content">
        <div style="display:flex; align-items:center; cursor: default;">
          <transition name="header-swap" mode="out-in">
            <div v-if="!(isMobileRoot && route.path.startsWith('/post') && isScrolled)" key="site"
              class="site-header entering-up" @click="router.push('/')" style="cursor: pointer !important;">
              <h1 class="app-title">{{ $t('app.title') }}</h1>
            </div>
            <div v-else key="reading" class="reading-header entering-down">
              <button class="mobile-title-back" @click="router.push('/blogs')" aria-label="Back">
                <span v-html="Icons.arrowUp"></span>
              </button>
              <div class="reading-title">
                {{ articleTitle }}
              </div>
            </div>
          </transition>
        </div>


        <div class="nav-actions">
          <!-- Mobile Menu Toggle -->
          <button class="menu-toggle" @click="isMenuOpen = !isMenuOpen"
            v-html="isMenuOpen ? Icons.cross : Icons.menu"></button>

          <!-- Frontend Nav -->
          <div class="nav-links" :class="{ 'mobile-open': isMenuOpen }" v-if="!isBackend">
            <button v-if="isMenuOpen" class="nav-close" @click="isMenuOpen = false" aria-label="Close menu">
              <span class="nav-close-icon" v-html="Icons.cross"></span>
            </button>
            <RouterLink to="/" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.home') }}</RouterLink>
            <RouterLink to="/blogs" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.blogs') }}</RouterLink>
            <RouterLink to="/search" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.search') }}</RouterLink>
            <RouterLink to="/friends" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.friends') }}</RouterLink>
          </div>

          <!-- Backend Nav -->
          <div class="nav-links" :class="{ 'mobile-open': isMenuOpen }" v-else>
            <button v-if="isMenuOpen" class="nav-close" @click="isMenuOpen = false" aria-label="Close menu">
              <span class="nav-close-icon" v-html="Icons.cross"></span>
            </button>
            <RouterLink to="/manage" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.posts') }}</RouterLink>
            <RouterLink to="/files" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.files') }}</RouterLink>
            <RouterLink to="/settings/homepage" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.settings') }}
            </RouterLink>
            <a href="#" @click.prevent="(openNewEditor(), isMenuOpen = false)" class="nav-link new-post-btn">{{
              $t('nav.newPost') }}</a>
          </div>

          <!-- Nav settings menu (theme + language) -->
          <div style="margin-left:0.2rem; position:relative;">
            <button ref="navSettingBtn" class="nav-setting-btn" v-if="!isBackend"
              @click.stop="showSettingsMenu = !showSettingsMenu" :aria-expanded="showSettingsMenu"
              aria-label="Settings">
              <Settings class="locale-icon" stroke-width="1.4" style="height:18px; width:18px;" />
            </button>
            <div v-if="showSettingsMenu" class="nav-settings-menu" @click.stop :style="menuStyle">
              <!-- Theme controls (top) -->
              <button class="popup-item" @click="applyTheme('follow')">
                <span class="popup-label">Follow System</span>
                <span class="popup-check" v-if="selectedTheme === 'follow'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <button class="popup-item" @click="applyTheme('light')">
                <span class="popup-label">Light</span>
                <span class="popup-check" v-if="selectedTheme === 'light'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <button class="popup-item" @click="applyTheme('dark')">
                <span class="popup-label">Dark</span>
                <span class="popup-check" v-if="selectedTheme === 'dark'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-color);" />
              <!-- Language controls (below) -->
              <button class="popup-item" @click="applyLocale('follow')">
                <span class="popup-label">{{ $t('settings.locale.follow') }}</span>
                <span class="popup-check" v-if="selectedLocale === 'follow'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <button class="popup-item" @click="applyLocale('zh-CN')">
                <span class="popup-label">中文（简体）</span>
                <span class="popup-check" v-if="selectedLocale === 'zh-CN'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <button class="popup-item" @click="applyLocale('en')">
                <span class="popup-label">English</span>
                <span class="popup-check" v-if="selectedLocale === 'en'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </span>
              </button>
              <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-color);" />
              <!-- About -->
               <button class="popup-item" @click="router.push('/about')">
                <span class="popup-label">{{ $t('nav.about') }}</span>
              </button>
              <div style="font-size: 0.8em; padding: 2px 10px 0 10px; color: var(--component-text-secondary);">
                Chronicle {{ __VERSION__ }}<br>
                &copy; {{ __YEAR__ }} Eightyfor All Rights Reserved.
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
    <main class="main-content" :class="{ 'no-nav': route.path === '/editor' }" @scroll="handleScroll">
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

.nav-header {
  background: var(--component-bg-blur);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-color-blur);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  height: 70px;
  box-sizing: border-box;
  transition: background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
}

.nav-header.at-top {
  background: transparent;
  border-bottom-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  height: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

/* Mobile title back button (left of app title) */
.mobile-title-back {
  background: transparent;
  border: none;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-right: 12px;
  padding: 0;
}

.mobile-title-back span {
  display: inline-flex;
  transform: rotate(-90deg);
  width: 24px;
  height: 24px
}


.app-title {
  color: var(--text-primary);
  margin: 0;
  font-size: 1.6rem;
}

.reading-title {
  color: var(--text-primary);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1;
}

.site-header {
  display: flex;
  align-items: center
}

.reading-header {
  display: flex;
  align-items: center
}

/* Ensure reading-title shrinks in flex layout and shows ellipsis when too long */
.reading-header {
  gap: 8px
}

.reading-title {
  cursor: default;
  flex: 1 1 auto;
  min-width: 0;
  /* allow flex children to shrink below content width */
  max-width: calc(100vw - 220px);
  /* prevent overflow beyond viewport (accounting for back button and padding) */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Unified header-swap transition: out-in mode ensures leave completes before enter starts.
  Enter animations differ by element via .entering-up / .entering-down classes. Leave has no animation. */
.header-swap-enter-from {
  opacity: 0
}

.header-swap-enter-to {
  opacity: 1
}

.header-swap-enter-active {
  transition: transform 190ms cubic-bezier(.2, .9, .3, 1), opacity 160ms ease
}

.header-swap-leave-active {
  transition: none
}

/* entering-up: site title enters from slightly above */
.entering-up.header-swap-enter-from {
  transform: translateY(-8px)
}

.entering-up.header-swap-enter-to {
  transform: translateY(0)
}

/* entering-down: reading header enters from slightly below */
.entering-down.header-swap-enter-from {
  transform: translateY(8px)
}

.entering-down.header-swap-enter-to {
  transform: translateY(0)
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

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }

  .nav-links {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    height: 100vh;
    background: var(--app-bg-secondary);
    /* Solid background for menu */
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transform: translateY(-100%);
    transition: transform 0.3s ease;
    z-index: 101;
    /* Behind toggle, above content */
    gap: 30px;
  }

  .nav-links .nav-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: transparent;
    border: none;
    color: var(--text-primary);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
  }

  .nav-links .nav-close .nav-close-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center
  }

  .nav-links .nav-close .nav-close-icon svg {
    width: 18px;
    height: 18px;
    display: block;
    stroke: currentColor
  }

  .nav-links.mobile-open {
    transform: translateY(0);
    z-index: 999;
  }

  .nav-link {
    font-size: 1.5em;
  }
}

.nav-link {
  color: var(--text-inactive);
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.nav-link.router-link-active {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.new-post-btn {
  background: var(--accent-color);
  color: white !important;
  font-weight: 600;
}

.new-post-btn:hover {
  background: var(--accent-color-hover) !important;
}

.nav-link:hover {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}


.main-content {
  flex: 1;
  overflow-y: auto;
  /* Changed to auto to allow scrolling under nav */
  overflow-x: hidden;
  padding-top: 70px;
  /* Use padding instead of margin */
  height: 100vh;
  box-sizing: border-box;
}

.main-content.no-nav {
  padding-top: 0;
  overflow: hidden;
  /* Restore hidden for editor */
  z-index: 0;
}

.nav-setting-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 0 8px;
  margin-left: 0;
  border-radius: 6px;
  color: var(--text-inactive);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  /* remove border on hover */
}

.nav-setting-btn:hover {
  background: transparent;
  /* hover background should not change */
  border: none;
  /* remove border on hover */
  color: var(--text-primary);
}

.nav-settings-menu {
  /* reduce opacity to make blur more visible */
  background: var(--component-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  /* Use fixed so the menu overlays page content — allows backdrop-filter to blur underlying page */
  position: fixed;
  color: var(--component-text-secondary);
  top: 70px;
  /* immediately under the header */
  right: 24px;
  /* align near the nav padding on desktop */
  left: auto;
  border: 1px solid var(--border-color);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  min-width: 160px;
  max-width: calc(100vw - 24px);
  max-height: 70vh;
  box-sizing: border-box;
  overflow: auto;

  /* allow internal scrolling instead of overflowing viewport */
  /* keep icon sizing inline */
  .locale-icon {
    width: 14px;
    height: 14px;
    display: inline-block;
    vertical-align: middle
  }

  display: flex;
  flex-direction: column;
  padding: 6px;
  z-index: 1200;
  font-size: 0.9rem;
}

.popup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 6px
}

.popup-item:hover {
  background: var(--component-bg-hover);
  color: var(--component-text-primary-hover);
}

.popup-label {
  flex: 1;
  text-align: left
}

.popup-check {
  color: var(--accent);
  display: inline-flex;
  align-items: center
}
</style>
