<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { RouterLink, RouterView, useRoute ,useRouter } from 'vue-router'
import { Icons } from './utils/icons'
import { Globe } from 'lucide-vue-next'
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
  return ['/manage', '/files', '/settings', '/editor'].some(p => route.path.startsWith(p))
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
const showLocaleMenu = ref(false)
const localeBtn = ref<HTMLElement | null>(null)
const menuStyle = reactive<{ top?: string; left?: string; right?: string }>( { top: '0px', left: 'auto', right: '24px' })
let onWindowResize: (() => void) | null = null
let onWindowScroll: (() => void) | null = null
let selectObserver: MutationObserver | null = null

function applyLocale(val: string) {
  selectedLocale.value = val
  showLocaleMenu.value = false
}

function onDocClick(e: MouseEvent) {
  const path = (e.composedPath && e.composedPath()) || (e as any).path || []
  const hit = path.some((el: any) => el && el.classList && (el.classList.contains('locale-menu') || el.classList.contains('locale-btn')))
  if (!hit) showLocaleMenu.value = false
}

function positionLocaleMenu() {
  if (!localeBtn.value) return
  const btnRect = localeBtn.value.getBoundingClientRect()
  // default menu dims
  const margin = 12
  const preferredTop = Math.round(btnRect.bottom + 8 + window.scrollY)
  // we will measure the menu after it's rendered
  nextTick(() => {
    const menuEl = document.querySelector('.locale-menu') as HTMLElement | null
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
        settings = Object.assign(settings, s)
      }
    } catch(e) {}
    
    return settings
  } catch(e) {
    return {}
  }
}

function applySettings() {
  getSettings().then(s => {
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

  }).catch(() => {})
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

onMounted(() => {
  // Always apply settings global (fonts)
  applySettings()

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

  document.addEventListener('click', onDocClick)
  onWindowResize = () => { if (showLocaleMenu.value) positionLocaleMenu() }
  onWindowScroll = () => { if (showLocaleMenu.value) positionLocaleMenu() }
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
watch(showLocaleMenu, (open) => {
  if (open) positionLocaleMenu()
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

            <!-- Locale globe menu (rightmost) -->
            <div style="margin-left:0.2rem; position:relative;">
              <button ref="localeBtn" class="locale-btn" v-if="!isBackend" @click.stop="showLocaleMenu = !showLocaleMenu" :aria-expanded="showLocaleMenu" aria-label="Language">
                <Globe class="locale-icon" stroke-width="1.4" style="height:18px; width:18px;"/>
              </button>
              <div v-if="showLocaleMenu" class="locale-menu" @click.stop :style="menuStyle">
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
  background: rgba(45, 45, 48, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(62, 62, 66, 0.5);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 400;
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
  color: #ffffff;
  margin: 0;
  font-size: 1.6rem;
}

.reading-title {
  color: #ffffff;
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
    color: #fff;
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
        background: #1e1e1e; /* Solid background for menu */
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
      color: #fff;
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
  background: rgba(128,128,128, 0.2);
  color: #ffffff;
}

.new-post-btn {
    background: #2ea35f;
    color: white !important;
    font-weight: 600;
}
.new-post-btn:hover {
    background: #24804a !important;
}

.nav-link:hover {
  background: #3c3c3c;
  color: #ffffff;
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
}

/* Locale menu styles */
.locale-btn {
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
.locale-btn:hover {
  background: transparent; /* hover background should not change */
  border: none; /* remove border on hover */
  color: var(--text-primary);
}
.locale-menu {
      /* reduce opacity to make blur more visible */
      background: var(--component-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      /* Use fixed so the menu overlays page content — allows backdrop-filter to blur underlying page */
      position: fixed;
      color: var(--text-inactive);
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
.locale-item:hover { background: rgba(255,255,255,0.04) }
.locale-label { flex:1; text-align:left }
.locale-check { color: var(--accent); display:inline-flex; align-items:center }


</style>
