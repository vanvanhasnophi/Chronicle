<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { RouterLink, RouterView, useRoute ,useRouter } from 'vue-router'
import { Icons } from './utils/icons'
import { Settings } from 'lucide-vue-next'
import { ensureNotoLoaded } from './utils/fontLoader'
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
const menuStyle = reactive<{ top?: string; left?: string; right?: string }>( { top: '0px', left: 'auto', right: '24px' })
let onWindowResize: (() => void) | null = null
let onWindowScroll: (() => void) | null = null
let selectObserver: MutationObserver | null = null

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
  } catch(e) {}
  // apply immediately
  try { applySettings() } catch(e) {}
  showSettingsMenu.value = false
}

async function getSettings() {
  try {
    let settings: any = {}
    try {
      const stored = localStorage.getItem('chronicle.settings')
      if (stored) settings = JSON.parse(stored)
    } catch(e) {}
    
    try {
      const resp = await fetch('/api/settings')
      if (resp.ok) {
        const s = await resp.json()
        // 保持本地设置优先：先以服务器设置为基础，再让本地设置覆盖它
        settings = Object.assign({}, s, settings)
      }
    } catch(e) {}
    
    return settings
  } catch(e) {
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
    } catch(e) {}

    // Apply Theme & Accent (if provided by server settings)
    try {
      // Respect local user settings stored in chronicle.settings first (mirror locale logic)
      let localCfg: any = null
      try {
        const raw = localStorage.getItem('chronicle.settings')
        if (raw) localCfg = JSON.parse(raw)
      } catch(e) { localCfg = null }

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
              let hex = h.replace('#','')
              if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('')
              const r = parseInt(hex.substring(0,2),16)
              const g = parseInt(hex.substring(2,4),16)
              const b = parseInt(hex.substring(4,6),16)
              const factor = 0.86
              const rr = Math.max(0,Math.min(255,Math.round(r*factor)))
              const gg = Math.max(0,Math.min(255,Math.round(g*factor)))
              const bb = Math.max(0,Math.min(255,Math.round(b*factor)))
              return `rgb(${rr}, ${gg}, ${bb})`
            } catch(e) { return accent }
          })(accent)
          document.documentElement.style.setProperty('--accent-color-dark', dark)
        } catch(e) {}
        }

        // Apply background images: prefer local settings, fall back to server values
        try {
          const fb = (localCfg && localCfg.frontendBackground) ? localCfg.frontendBackground : s.frontendBackground
          const bb = (localCfg && localCfg.backendBackground) ? localCfg.backendBackground : s.backendBackground
          // Always write CSS vars for background images (so they persist on <html> and survive refresh)
          try {
            if (fb) document.documentElement.style.setProperty('--frontend-bg-image', `url(${fb})`)
            else document.documentElement.style.setProperty('--frontend-bg-image', 'none')
            if (bb) document.documentElement.style.setProperty('--backend-bg-image', `url(${bb})`)
            else document.documentElement.style.setProperty('--backend-bg-image', 'none')
          } catch(e) {}

          // If a dedicated bg layer exists, also update its children directly (ensures it's the lowest DOM layer)
          try {
            const layer = document.getElementById('chronicle-bg-layer')
            if (layer) {
              const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
              const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
              const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
              if (imgEl) {
                const useImg = (isBackend.value) ? bb : fb
                imgEl.style.backgroundImage = useImg ? `url(${useImg})` : 'none'
              }
              if (overlayEl) overlayEl.style.background = 'transparent'
              if (surfaceEl) {
                try {
                  const root = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || ''
                  surfaceEl.style.background = root || 'transparent'
                } catch(e) {}
              }
            }
          } catch(e) {}

          // Apply background meta (position/size/blur/overlay) if present
          try {
            const fmRaw = (localCfg && localCfg.frontendBackgroundMeta) ? localCfg.frontendBackgroundMeta : s.frontendBackgroundMeta
            if (fmRaw) {
              const fm = typeof fmRaw === 'string' ? JSON.parse(fmRaw) : fmRaw
              // Always set CSS vars so they appear on <html> and persist across refresh
              try {
                document.documentElement.style.setProperty('--frontend-bg-pos', `${fm.posX || 50}% ${fm.posY || 50}%`)
                document.documentElement.style.setProperty('--frontend-bg-size', `${fm.size || 100}%`)
                document.documentElement.style.setProperty('--frontend-bg-blur', `${fm.blur || 0}px`)
                const overlay = fm.overlayColor || 'transparent'
                const opa = (fm.overlayOpacity || 0) / 100
                if (overlay === 'transparent') {
                  document.documentElement.style.setProperty('--frontend-bg-overlay-dark', 'transparent')
                  document.documentElement.style.setProperty('--frontend-bg-overlay-light', 'transparent')
                } else {
                  const rgb = (function(){ try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map((c:any)=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
                  document.documentElement.style.setProperty('--frontend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
                  document.documentElement.style.setProperty('--frontend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
                }
              } catch(e) {}

              // Also update DOM layer if present for immediate render
              try {
                const layer = document.getElementById('chronicle-bg-layer')
                if (layer) {
                  const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
                  const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
                  if (imgEl) {
                    imgEl.style.backgroundPosition = `${fm.posX || 50}% ${fm.posY || 50}%`
                    imgEl.style.backgroundSize = `${fm.size || 100}%`
                    imgEl.style.filter = `blur(${fm.blur || 0}px)`
                  }
                  if (overlayEl) {
                    if (fm.overlayColor) {
                      const opa = (fm.overlayOpacity || 0) / 100
                      try {
                        let h = fm.overlayColor.replace('#','')
                        if (h.length === 3) h = h.split('').map((c:any)=>c+c).join('')
                        const r = parseInt(h.substring(0,2),16)
                        const g = parseInt(h.substring(2,4),16)
                        const b = parseInt(h.substring(4,6),16)
                        overlayEl.style.background = `rgba(${r}, ${g}, ${b}, ${opa})`
                      } catch(e) { overlayEl.style.background = 'transparent' }
                    }
                  }
                }
              } catch(e) {}
            }
          } catch(e) {}
          try {
            const bmRaw = (localCfg && localCfg.backendBackgroundMeta) ? localCfg.backendBackgroundMeta : s.backendBackgroundMeta
            if (bmRaw) {
              const bm = typeof bmRaw === 'string' ? JSON.parse(bmRaw) : bmRaw
              // Always set CSS vars for backend meta
              try {
                document.documentElement.style.setProperty('--backend-bg-pos', `${bm.posX || 50}% ${bm.posY || 50}%`)
                document.documentElement.style.setProperty('--backend-bg-size', `${bm.size || 100}%`)
                document.documentElement.style.setProperty('--backend-bg-blur', `${bm.blur || 0}px`)
                const overlay = bm.overlayColor || 'transparent'
                const opa = (bm.overlayOpacity || 0) / 100
                if (overlay === 'transparent') {
                  document.documentElement.style.setProperty('--backend-bg-overlay-dark', 'transparent')
                  document.documentElement.style.setProperty('--backend-bg-overlay-light', 'transparent')
                } else {
                  const rgb = (function(){ try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map((c:any)=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
                  document.documentElement.style.setProperty('--backend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
                  document.documentElement.style.setProperty('--backend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
                }
              } catch(e) {}

              // Also update DOM layer if present for immediate render
              try {
                const layer = document.getElementById('chronicle-bg-layer')
                if (layer) {
                  const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
                  const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
                  if (imgEl) {
                    imgEl.style.backgroundPosition = `${bm.posX || 50}% ${bm.posY || 50}%`
                    imgEl.style.backgroundSize = `${bm.size || 100}%`
                    imgEl.style.filter = `blur(${bm.blur || 0}px)`
                  }
                  if (overlayEl) {
                    if (bm.overlayColor) {
                      const opa = (bm.overlayOpacity || 0) / 100
                      try {
                        let h = bm.overlayColor.replace('#','')
                        if (h.length === 3) h = h.split('').map((c:any)=>c+c).join('')
                        const r = parseInt(h.substring(0,2),16)
                        const g = parseInt(h.substring(2,4),16)
                        const b = parseInt(h.substring(4,6),16)
                        overlayEl.style.background = `rgba(${r}, ${g}, ${b}, ${opa})`
                      } catch(e) { overlayEl.style.background = 'transparent' }
                    }
                  }
                }
              } catch(e) {}
            }
          } catch(e) {}
        } catch(e) {}
    } catch(e) {}

  } catch(e) {}
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
  // Ensure a global background layer element exists at the lowest z-index (create early)
  try {
    let layer = document.getElementById('chronicle-bg-layer')
    if (!layer) {
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
    }
  } catch(e) {}

  // Always apply settings global (fonts)
  await applySettings()

  // Global mobile detection: set a root class (`is-mobile`) based on initial window width.
  // This is done once at startup (per requirement) and does not follow subsequent resizes.
  try {
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 720
    if (mobile) document.documentElement.classList.add('is-mobile')
    else document.documentElement.classList.remove('is-mobile')
      // keep a component-local copy for template conditions
      isMobileRoot.value = mobile
  } catch (e) {}
  

  // initial apply depending on area
  if (isBackend.value) {
    applyBackendLocaleIfNeeded()
    try { document.body.classList.add('backend') } catch(e) {}
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
    try { document.body.classList.remove('backend') } catch(e) {}
  }

  // initialize selectedTheme from local settings if available
  try {
    const raw = localStorage.getItem('chronicle.settings')
    if (raw) {
      const cfg = JSON.parse(raw)
      if (cfg && cfg.frontendTheme) selectedTheme.value = cfg.frontendTheme
    }
  } catch(e) {}

  

  document.addEventListener('click', onDocClick)
  onWindowResize = () => { if (showSettingsMenu.value) positionSettingsMenu() }
  onWindowScroll = () => { if (showSettingsMenu.value) positionSettingsMenu() }
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('scroll', onWindowScroll, true)
  // apply modern-select class to existing select elements site-wide
  try {
    document.querySelectorAll('select').forEach((s) => s.classList.add('modern-select'))
  } catch (e) {}

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
    } catch (e) {}
  }

  // Initial wrap for existing selects
  try {
    document.querySelectorAll('select.modern-select').forEach((sel) => wrapSelectElement(sel))
  } catch (e) {}

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
            ;(n as Element).querySelectorAll && (n as Element).querySelectorAll('select.modern-select').forEach((s) => wrapSelectElement(s))
          } catch (e) {}
        })
      }
    })
    selectObserver.observe(document.body, { childList: true, subtree: true })
  } catch (e) {}

  // Observe <title> changes so `docTitle` stays in sync and UI reacts.
  try {
    if (typeof document !== 'undefined') {
      const titleEl = document.querySelector('title')
      // initial sync
      docTitle.value = document.title || ''
      if (titleEl) {
        titleObserver = new MutationObserver(() => {
          try { docTitle.value = document.title || '' } catch (e) {}
        })
        titleObserver.observe(titleEl, { characterData: true, childList: true, subtree: true })
      }
    }
  } catch (e) {}
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  try { if (onWindowResize) window.removeEventListener('resize', onWindowResize) } catch (e) {}
  try { if (onWindowScroll) window.removeEventListener('scroll', onWindowScroll, true) } catch (e) {}
  try { if (selectObserver) selectObserver.disconnect() } catch (e) {}
  try { if (titleObserver) titleObserver.disconnect() } catch (e) {}
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
  isMenuOpen.value = false
  if (isBackend.value) {
    applyBackendLocaleIfNeeded()
    try { document.body.classList.add('backend') } catch(e) {}
  } else {
    applyFrontendLocaleFromSelection()
    try { document.body.classList.remove('backend') } catch(e) {}
  }
})

const isScrolled = ref(false)
const isMenuOpen = ref(false)

// Reactive mirror of document.title so Vue can react to title changes
import { onMounted as _onMounted } from 'vue'
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
    <nav class="nav-header" 
         v-if="route.path !== '/editor' && route.path !== '/login'"
         :class="{ 'at-top': !isScrolled }"
    >
        <div class="nav-content">
        <div style="display:flex; align-items:center; cursor: default;">
          <transition name="header-swap" mode="out-in">
            <div v-if="! (isMobileRoot && route.path.startsWith('/post') && isScrolled)" key="site" class="site-header entering-up" @click="router.push('/')" style="cursor: pointer !important;">
              <h1 class="app-title">{{ $t('app.title') }}</h1>
            </div>
            <div v-else key="reading" class="reading-header entering-down">
              <button class="mobile-title-back" @click="router.back()" aria-label="Back">
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
            <button class="menu-toggle" @click="isMenuOpen = !isMenuOpen" v-html="isMenuOpen ? Icons.cross : Icons.menu"></button>

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
              <RouterLink to="/settings/homepage" class="nav-link" @click="isMenuOpen = false">{{ $t('nav.settings') }}</RouterLink>
                <a href="#" @click.prevent="(openNewEditor(), isMenuOpen = false)" class="nav-link new-post-btn">{{ $t('nav.newPost') }}</a>
            </div>

            <!-- Nav settings menu (theme + language) -->
            <div style="margin-left:0.2rem; position:relative;">
              <button ref="navSettingBtn" class="nav-setting-btn" v-if="!isBackend" @click.stop="showSettingsMenu = !showSettingsMenu" :aria-expanded="showSettingsMenu" aria-label="Settings">
                <Settings class="locale-icon" stroke-width="1.4" style="height:18px; width:18px;"/>
              </button>
              <div v-if="showSettingsMenu" class="nav-settings-menu" @click.stop :style="menuStyle">
                <!-- Theme controls (top) -->
                <button class="locale-item" @click="applyTheme('follow')">
                  <span class="locale-label">Follow System</span>
                  <span class="locale-check" v-if="selectedTheme === 'follow'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
                <button class="locale-item" @click="applyTheme('light')">
                  <span class="locale-label">Light</span>
                  <span class="locale-check" v-if="selectedTheme === 'light'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
                <button class="locale-item" @click="applyTheme('dark')">
                  <span class="locale-label">Dark</span>
                  <span class="locale-check" v-if="selectedTheme === 'dark'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
                <hr style="margin:6px 0; border:none; border-top:1px solid var(--border-color);" />
                <!-- Language controls (below) -->
                <button class="locale-item" @click="applyLocale('follow')">
                  <span class="locale-label">{{ $t('settings.locale.follow') }}</span>
                  <span class="locale-check" v-if="selectedLocale === 'follow'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
                <button class="locale-item" @click="applyLocale('zh-CN')">
                  <span class="locale-label">中文（简体）</span>
                  <span class="locale-check" v-if="selectedLocale === 'zh-CN'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
                <button class="locale-item" @click="applyLocale('en')">
                  <span class="locale-label">English</span>
                  <span class="locale-check" v-if="selectedLocale === 'en'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
            </div>
          </div>
      </div>
    </nav>
    <main class="main-content" 
        :class="{ 'no-nav': route.path === '/editor' }"
        @scroll="handleScroll"
    >
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
.mobile-title-back span { display:inline-flex; transform: rotate(-90deg); width:24px; height:24px }


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

.site-header { display:flex; align-items:center }
.reading-header { display:flex; align-items:center }

/* Ensure reading-title shrinks in flex layout and shows ellipsis when too long */
.reading-header { gap: 8px }
.reading-title {
  cursor: default;
  flex: 1 1 auto;
  min-width: 0; /* allow flex children to shrink below content width */
  max-width: calc(100vw - 220px); /* prevent overflow beyond viewport (accounting for back button and padding) */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Unified header-swap transition: out-in mode ensures leave completes before enter starts.
  Enter animations differ by element via .entering-up / .entering-down classes. Leave has no animation. */
.header-swap-enter-from { opacity: 0 }
.header-swap-enter-to { opacity: 1 }
.header-swap-enter-active { transition: transform 190ms cubic-bezier(.2,.9,.3,1), opacity 160ms ease }
.header-swap-leave-active { transition: none }

/* entering-up: site title enters from slightly above */
.entering-up.header-swap-enter-from { transform: translateY(-8px) }
.entering-up.header-swap-enter-to { transform: translateY(0) }

/* entering-down: reading header enters from slightly below */
.entering-down.header-swap-enter-from { transform: translateY(8px) }
.entering-down.header-swap-enter-to { transform: translateY(0) }

.menu-toggle {
    display: none; /* hide on desktop, show on small screens via media query */
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    padding: 0;
    z-index: 102; /* Higher than nav-content */
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
        background: var(--app-bg-secondary); /* Solid background for menu */
        flex-direction: column;
        justify-content: center;
        align-items: center;
        transform: translateY(-100%);
        transition: transform 0.3s ease;
        z-index: 101; /* Behind toggle, above content */
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

    .nav-links .nav-close .nav-close-icon { display: inline-flex; align-items: center; justify-content: center }
    .nav-links .nav-close .nav-close-icon svg { width: 18px; height: 18px; display: block; stroke: currentColor }

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
  overflow-y: auto; /* Changed to auto to allow scrolling under nav */
  overflow-x: hidden;
  padding-top: 70px; /* Use padding instead of margin */
  height: 100vh;
  box-sizing: border-box;
}

.main-content.no-nav {
  padding-top: 0;
  overflow: hidden; /* Restore hidden for editor */
  z-index: 0;
}

.nav-setting-btn {
  background: transparent;
  border: 1px solid transparent;
  padding: 0 8px;
  margin-left:0;
  border-radius: 6px;
  color: var(--text-inactive);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none; /* remove border on hover */
}
.nav-setting-btn:hover {
  background: transparent; /* hover background should not change */
  border: none; /* remove border on hover */
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
      top: 70px; /* immediately under the header */
      right: 24px; /* align near the nav padding on desktop */
      left: auto;
      border: 1px solid var(--border-color);
      box-shadow: 0 6px 18px rgba(0,0,0,0.4);
      border-radius: 8px;
      min-width: 160px;
      max-width: calc(100vw - 24px);
      max-height: 70vh;
      box-sizing: border-box;
      overflow: auto; /* allow internal scrolling instead of overflowing viewport */
      /* keep icon sizing inline */
    .locale-icon { width: 14px; height: 14px; display: inline-block; vertical-align: middle }
      display: flex;
      flex-direction: column;
      padding: 6px;
      z-index: 1200;
      font-size: 0.9rem;
  }
.locale-item { display:flex; justify-content:space-between; align-items:center; text-align:left; padding:6px 10px; background:transparent; border:none; color:var(--text-primary); cursor:pointer; border-radius:6px }
.locale-item:hover { background: var(--component-bg-hover); color: var(--component-text-primary-hover); }
.locale-label { flex:1; text-align:left }
.locale-check { color: var(--accent); display:inline-flex; align-items:center }


</style>
