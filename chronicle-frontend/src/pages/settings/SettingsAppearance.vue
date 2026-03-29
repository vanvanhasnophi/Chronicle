<template>
  <div class="appearance-page">
    <h2>{{ $t('settings.appearance') }}</h2>
    <p class="hint">{{ $t('settings.appearanceHint') }}</p>

    <div class="appearance-layout">
      <section class="appearance-controls">
        <div class="group-card">
          <h3>Language</h3>
          <div class="form-row">
            <label>Frontend default language</label>
            <select v-model="uiFrontendLocale" class="modern-select">
              <option value="follow">Follow Browser</option>
              <option value="zh-CN">中文 (简体)</option>
              <option value="en">English</option>
            </select>
          </div>

          <div class="form-row">
            <label>Backend language</label>
            <select v-model="uiBackendLocale" class="modern-select">
              <option value="follow">Follow Browser</option>
              <option value="zh-CN">中文 (简体)</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div class="group-card">
          <h3>Typography</h3>
          <div class="form-row">
            <label>Frontend font</label>
            <select v-model="uiFrontendFont" class="modern-select">
              <option value="sans">Sans-serif</option>
              <option value="serif">Serif</option>
            </select>
          </div>

          <div class="form-row">
            <label>Backend font</label>
            <select v-model="uiBackendFont" class="modern-select">
              <option value="sans">Sans-serif</option>
              <option value="serif">Serif</option>
            </select>
          </div>
        </div>

        <div class="group-card">
          <h3>Theme</h3>
          <div class="form-row">
            <label>Frontend default mode</label>
            <select v-model="uiThemeMode" class="modern-select">
              <option value="follow">Follow System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div class="form-row">
            <label>Backend mode</label>
            <select v-model="uiBackendTheme" class="modern-select">
              <option value="follow">Follow System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div class="form-row">
            <label>Accent color</label>
            <div class="color-row">
              <input type="color" v-model="uiAccentColor" class="color-picker" />
              <span class="color-text">{{ uiAccentColor }}</span>
            </div>
          </div>
          
          <div class="form-row">
            <label>Frontend background</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <div v-if="uiFrontendBackground" class="bg-preview" :style="{ backgroundImage: `url(${uiFrontendBackground})` }"></div>
              <button class="secondary" @click.prevent="(bgPickerTarget='frontend', bgPickerOpen=true, fetchServerImages())">Choose from uploads</button>
              <button class="secondary" @click.prevent="(uiFrontendBackground='')">Clear</button>
              <button v-if="uiFrontendBackground" class="secondary" @click.prevent="openBackgroundEditor('frontend')">Edit</button>
            </div>
          </div>

          <div class="form-row">
            <label>Backend background</label>
            <div style="display:flex; gap:8px; align-items:center;">
              <div v-if="uiBackendBackground" class="bg-preview" :style="{ backgroundImage: `url(${uiBackendBackground})` }"></div>
              <button class="secondary" @click.prevent="(bgPickerTarget='backend', bgPickerOpen=true, fetchServerImages())">Choose from uploads</button>
              <button class="secondary" @click.prevent="(uiBackendBackground='')">Clear</button>
              <button v-if="uiBackendBackground" class="secondary" @click.prevent="openBackgroundEditor('backend')">Edit</button>
            </div>
          </div>
        </div>

        <div class="actions">
          <button @click="save" class="primary">Save Appearance</button>
          <button class="secondary" @click="reset">Reset</button>
        </div>
      </section>

      <aside class="appearance-preview" :style="previewVars">
        <h3>Preview</h3>
        <div class="preview-panel">
          <div class="preview-header">
            <span class="preview-title">Chronicle</span>
            <button class="preview-chip">Theme</button>
          </div>
          <div class="preview-tags">
            <span class="preview-tag">#design</span>
            <span class="preview-tag featured">#featured</span>
          </div>
          <div class="preview-card">
            <h4>Sample Content Card</h4>
            <p>
              This block previews your current appearance setup. Accent, text contrast, panel
              hierarchy and button readability should all remain clear in both dark and light mode.
            </p>
            <div class="preview-actions">
              <button class="primary">Primary</button>
              <button class="secondary">Secondary</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
  <!-- Background picker modal -->
  <div v-if="bgPickerOpen" class="modal-overlay" @click.self="bgPickerOpen = false">
    <div class="modal-content large-modal">
      <div class="modal-header">
        <h3>Choose background image</h3>
        <button class="close-btn" @click="bgPickerOpen = false">×</button>
      </div>
      <div class="modal-body">
        <div class="library-section">
          <div v-if="uploadedImagesLocal.length > 0" class="image-grid">
            <div v-for="(img, idx) in uploadedImagesLocal" :key="idx" class="library-item" @click="chooseBackgroundImage(img)">
              <div class="img-thumb" v-if="img.thumb || img.url" :style="{ backgroundImage: `url(${img.thumb || img.url})` }"></div>
              <span class="img-name">{{ img.name }}</span>
            </div>
          </div>
          <div v-else class="empty-library">
            <p>No images found.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
    <!-- Background editor modal -->
    <BackgroundEditorModal
      v-if="bgEditorOpen"
      :url="(bgEditorTarget === 'frontend' ? uiFrontendBackground : uiBackendBackground)"
      :initial="(bgEditorTarget === 'frontend' ? uiFrontendBackgroundMeta : uiBackendBackgroundMeta)"
      @save="(m) => { if (bgEditorTarget === 'frontend') uiFrontendBackgroundMeta = m; else uiBackendBackgroundMeta = m; bgEditorOpen = false }"
      @close="bgEditorOpen = false"
    />
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useToast from '../../composables/useToast'
import BackgroundEditorModal from '../../components/BackgroundEditorModal.vue'

const { locale } = useI18n()
const key = 'chronicle.settings'
const uiFrontendLocale = ref('follow')
const uiBackendLocale = ref('follow')
const uiFrontendFont = ref('sans')
const uiBackendFont = ref('sans')
const uiThemeMode = ref('follow')
const uiBackendTheme = ref('follow')
const uiAccentColor = ref('#2ea35f')
const uiFrontendBackground = ref('')
const uiBackendBackground = ref('')
const uiFrontendBackgroundMeta = ref<any>(null)
const uiBackendBackgroundMeta = ref<any>(null)

// Media picker state for background selection
const bgPickerOpen = ref(false)
const bgPickerTarget = ref<'frontend'|'backend'>('frontend')
const bgEditorOpen = ref(false)
const bgEditorTarget = ref<'frontend'|'backend'>('frontend')
const uploadedImagesLocal = ref<Array<any>>([])
const bgSelectedCategory = ref('pic')

const { show } = useToast()

const previewVars = computed(() => ({
  '--preview-accent': uiAccentColor.value,
  '--preview-accent-dark': buildDarkerColor(uiAccentColor.value)
}))

function buildDarkerColor(accent: string) {
  try {
    let hex = accent.replace('#', '')
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const factor = 0.86
    const rr = Math.max(0, Math.min(255, Math.round(r * factor)))
    const gg = Math.max(0, Math.min(255, Math.round(g * factor)))
    const bb = Math.max(0, Math.min(255, Math.round(b * factor)))
    return `rgb(${rr}, ${gg}, ${bb})`
  } catch (e) {
    return accent
  }
}

onMounted(() => {
  const raw = localStorage.getItem(key)
  if (raw) {
    try {
      const cfg = JSON.parse(raw)
      uiFrontendLocale.value = cfg.frontendLocale || 'follow'
      uiBackendLocale.value = cfg.backendLocale || 'follow'
      uiFrontendFont.value = cfg.frontendFont || 'sans'
      uiBackendFont.value = cfg.backendFont || 'sans'
        uiThemeMode.value = cfg.frontendTheme || 'follow'
        uiBackendTheme.value = cfg.backendTheme || 'follow'
      uiAccentColor.value = cfg.frontendAccent || '#2ea35f'
      uiFrontendBackground.value = cfg.frontendBackground || ''
      uiBackendBackground.value = cfg.backendBackground || ''
      try { uiFrontendBackgroundMeta.value = cfg.frontendBackgroundMeta ? JSON.parse(cfg.frontendBackgroundMeta) : null } catch(e) { uiFrontendBackgroundMeta.value = null }
      try { uiBackendBackgroundMeta.value = cfg.backendBackgroundMeta ? JSON.parse(cfg.backendBackgroundMeta) : null } catch(e) { uiBackendBackgroundMeta.value = null }
    } catch(e) {}
  }
  // try to load server-side persisted settings (merge)
  try {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((s: any) => {
        if (!s) return
        if (s.backendLocale) uiBackendLocale.value = s.backendLocale
        if (s.frontendLocale) uiFrontendLocale.value = s.frontendLocale
        if (s.frontendFont) uiFrontendFont.value = s.frontendFont
        if (s.backendFont) uiBackendFont.value = s.backendFont
          if (s.frontendTheme) uiThemeMode.value = s.frontendTheme
          if (s.backendTheme) uiBackendTheme.value = s.backendTheme
        if (s.frontendAccent) uiAccentColor.value = s.frontendAccent
        if (s.frontendBackground) uiFrontendBackground.value = s.frontendBackground
        if (s.backendBackground) uiBackendBackground.value = s.backendBackground
        try { uiFrontendBackgroundMeta.value = s.frontendBackgroundMeta ? JSON.parse(s.frontendBackgroundMeta) : uiFrontendBackgroundMeta.value } catch(e) {}
        try { uiBackendBackgroundMeta.value = s.backendBackgroundMeta ? JSON.parse(s.backendBackgroundMeta) : uiBackendBackgroundMeta.value } catch(e) {}
      })
      .catch(() => {})
  } catch(e) {}
})
// apply meta changes live for immediate preview
try {
  watch(uiFrontendBackgroundMeta, (m) => {
    try {
      if (!m) return
      document.documentElement.style.setProperty('--frontend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
      document.documentElement.style.setProperty('--frontend-bg-size', `${m.size || 100}%`)
      document.documentElement.style.setProperty('--frontend-bg-blur', `${m.blur || 0}px`)
      try {
        const layer = document.getElementById('chronicle-bg-layer')
        if (layer) {
          const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
          const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
          const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
          if (imgEl) {
            imgEl.style.backgroundPosition = `${m.posX || 50}% ${m.posY || 50}%`
            imgEl.style.backgroundSize = `${m.size || 100}%`
            imgEl.style.filter = `blur(${m.blur || 0}px)`
          }
          if (overlayEl) {
            const opa = (m.overlayOpacity || 0) / 100
            try {
              let h = String(m.overlayColor || '#000').replace('#','')
              if (h.length === 3) h = h.split('').map((c:any)=>c+c).join('')
              const r = parseInt(h.substring(0,2),16)
              const g = parseInt(h.substring(2,4),16)
              const b = parseInt(h.substring(4,6),16)
              overlayEl.style.background = `rgba(${r}, ${g}, ${b}, ${opa})`
            } catch(e) { overlayEl.style.background = 'transparent' }
          }
          if (surfaceEl) {
            try { surfaceEl.style.background = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || 'transparent' } catch(e) {}
          }
        }
      } catch(e) {}
      if (m.overlayColor) {
        const opa = (m.overlayOpacity || 0) / 100
        let h = String(m.overlayColor).replace('#','')
        if (h.length === 3) h = h.split('').map(c=>c+c).join('')
        const r = parseInt(h.substring(0,2),16)
        const g = parseInt(h.substring(2,4),16)
        const b = parseInt(h.substring(4,6),16)
        const rgba = `rgba(${r}, ${g}, ${b}, ${opa})`
        document.documentElement.style.setProperty('--frontend-bg-overlay-dark', rgba)
        document.documentElement.style.setProperty('--frontend-bg-overlay-light', rgba)
      }
    } catch(e) {}
  }, { deep: true })
  watch(uiBackendBackgroundMeta, (m) => {
    try {
      if (!m) return
      document.documentElement.style.setProperty('--backend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
      document.documentElement.style.setProperty('--backend-bg-size', `${m.size || 100}%`)
      document.documentElement.style.setProperty('--backend-bg-blur', `${m.blur || 0}px`)
      try {
        const layer = document.getElementById('chronicle-bg-layer')
        if (layer) {
          const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
          const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
          const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
          if (imgEl) {
            imgEl.style.backgroundPosition = `${m.posX || 50}% ${m.posY || 50}%`
            imgEl.style.backgroundSize = `${m.size || 100}%`
            imgEl.style.filter = `blur(${m.blur || 0}px)`
          }
          if (overlayEl) {
            const opa = (m.overlayOpacity || 0) / 100
            try {
              let h = String(m.overlayColor || '#000').replace('#','')
              if (h.length === 3) h = h.split('').map((c:any)=>c+c).join('')
              const r = parseInt(h.substring(0,2),16)
              const g = parseInt(h.substring(2,4),16)
              const b = parseInt(h.substring(4,6),16)
              overlayEl.style.background = `rgba(${r}, ${g}, ${b}, ${opa})`
            } catch(e) { overlayEl.style.background = 'transparent' }
          }
          if (surfaceEl) {
            try { surfaceEl.style.background = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || 'transparent' } catch(e) {}
          }
        }
      } catch(e) {}
      if (m.overlayColor) {
        const opa = (m.overlayOpacity || 0) / 100
        let h = String(m.overlayColor).replace('#','')
        if (h.length === 3) h = h.split('').map(c=>c+c).join('')
        const r = parseInt(h.substring(0,2),16)
        const g = parseInt(h.substring(2,4),16)
        const b = parseInt(h.substring(4,6),16)
        // 设置为深色/浅色两套变量以兼容新主题遮罩变体
        document.documentElement.style.setProperty('--backend-bg-overlay-dark', `rgba(${r}, ${g}, ${b}, ${opa})`)
        document.documentElement.style.setProperty('--backend-bg-overlay-light', `rgba(${r}, ${g}, ${b}, ${opa})`)
      }
    } catch(e) {}
  }, { deep: true })
} catch(e) {}
  // apply current background vars so preview is immediate
  try {
    if (uiFrontendBackground.value) document.documentElement.style.setProperty('--frontend-bg-image', `url(${uiFrontendBackground.value})`)
    else document.documentElement.style.setProperty('--frontend-bg-image', 'none')
    if (uiBackendBackground.value) document.documentElement.style.setProperty('--backend-bg-image', `url(${uiBackendBackground.value})`)
    else document.documentElement.style.setProperty('--backend-bg-image', 'none')
    // apply meta if present
    try {
      if (uiFrontendBackgroundMeta.value) {
        const m = uiFrontendBackgroundMeta.value
        document.documentElement.style.setProperty('--frontend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
        document.documentElement.style.setProperty('--frontend-bg-size', `${m.size || 100}%`)
        document.documentElement.style.setProperty('--frontend-bg-blur', `${m.blur || 0}px`)
        const overlay = m.overlayColor || 'transparent'
        const opa = (m.overlayOpacity || 0) / 100
        if (overlay === 'transparent') {
          document.documentElement.style.setProperty('--frontend-bg-overlay-dark', 'transparent')
          document.documentElement.style.setProperty('--frontend-bg-overlay-light', 'transparent')
        } else {
          const rgb = (function(){ try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map((c:any)=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
          document.documentElement.style.setProperty('--frontend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
          document.documentElement.style.setProperty('--frontend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
        }
      }
    } catch(e) {}
    try {
      if (uiBackendBackgroundMeta.value) {
        const m = uiBackendBackgroundMeta.value
        document.documentElement.style.setProperty('--backend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
        document.documentElement.style.setProperty('--backend-bg-size', `${m.size || 100}%`)
        document.documentElement.style.setProperty('--backend-bg-blur', `${m.blur || 0}px`)
        const overlay = m.overlayColor || 'transparent'
        const opa = (m.overlayOpacity || 0) / 100
        if (overlay === 'transparent') {
          document.documentElement.style.setProperty('--backend-bg-overlay-dark', 'transparent')
          document.documentElement.style.setProperty('--backend-bg-overlay-light', 'transparent')
        } else {
          const rgb = (function(){ try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map((c:any)=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
          document.documentElement.style.setProperty('--backend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
          document.documentElement.style.setProperty('--backend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
        }
        try {
          const layer = document.getElementById('chronicle-bg-layer')
            if (layer) {
            const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
            const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
            if (imgEl) imgEl.style.backgroundImage = uiBackendBackground.value ? `url(${uiBackendBackground.value})` : 'none'
            if (overlayEl) overlayEl.style.background = (overlay === 'transparent') ? 'transparent' : (function(){ try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map((c:any)=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `rgba(${r}, ${g}, ${b}, ${opa})` } catch(e){ return 'transparent' } })()
          }
        } catch(e) {}
      }
    } catch(e) {}
  } catch(e) {}

async function fetchServerImages() {
  try {
    const res = await fetch(`/api/files?path=pic`)
    if (!res.ok) return
    const items = await res.json()
    uploadedImagesLocal.value = items
      .filter((i:any) => i.type === 'file')
      .map((i:any) => ({
        name: i.name,
        url: i.url || `/server/data/upload/${i.path}`,
        path: i.url || `/server/data/upload/${i.path}`,
        thumb: (i.url || `/server/data/upload/${i.path}`).replace('/server/data/upload/', '/server/data/upload/.thumbs/')
      }))
  } catch(e) { uploadedImagesLocal.value = [] }
}

function chooseBackgroundImage(img: any) {
  if (bgPickerTarget.value === 'frontend') uiFrontendBackground.value = img.path || img.url
  else uiBackendBackground.value = img.path || img.url
  ensureMetaForTarget(bgPickerTarget.value)
  bgPickerOpen.value = false
  try {
    const layer = document.getElementById('chronicle-bg-layer')
      if (layer) {
        const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
        const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
        if (imgEl) {
          if (bgPickerTarget.value === 'frontend') imgEl.style.backgroundImage = uiFrontendBackground.value ? `url(${uiFrontendBackground.value})` : 'none'
          else imgEl.style.backgroundImage = uiBackendBackground.value ? `url(${uiBackendBackground.value})` : 'none'
        }
        if (surfaceEl) {
          try { surfaceEl.style.background = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || 'transparent' } catch(e) {}
        }
      }
  } catch(e) {}
}

// Ensure meta exists when choosing a new image
function ensureMetaForTarget(target:'frontend'|'backend') {
  if (target === 'frontend') {
    if (!uiFrontendBackgroundMeta.value) uiFrontendBackgroundMeta.value = { posX: 50, posY: 50, size: 100, blur: 0, overlayColor: '#000000', overlayOpacity: 0 }
  } else {
    if (!uiBackendBackgroundMeta.value) uiBackendBackgroundMeta.value = { posX: 50, posY: 50, size: 100, blur: 0, overlayColor: '#000000', overlayOpacity: 0 }
  }
}

function openBackgroundEditor(target:'frontend'|'backend') {
  bgEditorTarget.value = target
  bgEditorOpen.value = true
}

async function save() {
  const cfg = {
    frontendLocale: uiFrontendLocale.value,
    backendLocale: uiBackendLocale.value,
    frontendFont: uiFrontendFont.value,
    backendFont: uiBackendFont.value,
    frontendTheme: uiThemeMode.value,
    frontendAccent: uiAccentColor.value,
    backendTheme: uiBackendTheme.value,
    frontendBackground: uiFrontendBackground.value,
    backendBackground: uiBackendBackground.value,
    frontendBackgroundMeta: uiFrontendBackgroundMeta.value ? JSON.stringify(uiFrontendBackgroundMeta.value) : undefined,
    backendBackgroundMeta: uiBackendBackgroundMeta.value ? JSON.stringify(uiBackendBackgroundMeta.value) : undefined
  }

  // persist locally
  localStorage.setItem(key, JSON.stringify(cfg))

  // persist to backend
  try {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
  } catch(e) {}

  // Apply frontend font immediately after Save
  try {
    if (uiFrontendFont.value === 'sans') {
      document.documentElement.style.setProperty('--app-font-stack', 'var(--app-font-stack-inter)')
    } else if (uiFrontendFont.value === 'serif') {
      // load serif font on demand
      try { (await import('../../utils/fontLoader')).ensureNotoLoaded() } catch(e) {}
      document.documentElement.style.setProperty('--app-font-stack', "'Noto Serif SC', serif")
    }
    // Also persist backend font into CSS var so backend UI (editor) can reflect immediately
    if (uiBackendFont.value === 'sans') {
      document.documentElement.style.setProperty('--backend-font-stack', 'var(--app-font-stack-inter)')
    } else if (uiBackendFont.value === 'serif') {
      try { (await import('../../utils/fontLoader')).ensureNotoLoaded() } catch(e) {}
      document.documentElement.style.setProperty('--backend-font-stack', "'Noto Serif SC', serif")
    }
    // Apply theme immediately
    try {
      if (uiThemeMode.value === 'follow') {
        document.documentElement.removeAttribute('data-theme')
      } else if (uiThemeMode.value === 'light') {
        document.documentElement.setAttribute('data-theme', 'light')
      } else if (uiThemeMode.value === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark')
      }
    } catch(e) {}
      // Apply backend theme immediately
      try {
        if (uiBackendTheme.value === 'follow') {
          document.body.removeAttribute('data-backend-theme')
        } else if (uiBackendTheme.value === 'light') {
          document.body.setAttribute('data-backend-theme', 'light')
        } else if (uiBackendTheme.value === 'dark') {
          document.body.setAttribute('data-backend-theme', 'dark')
        }
      } catch(e) {}

    // Apply accent color immediately
    try {
      const accent = uiAccentColor.value || '#2ea35f'
      document.documentElement.style.setProperty('--accent-color', accent)
      document.documentElement.style.setProperty('--accent-color-dark', buildDarkerColor(accent))
    } catch(e) {}
    // Apply background images immediately
    try {
      if (uiFrontendBackground.value) document.documentElement.style.setProperty('--frontend-bg-image', `url(${uiFrontendBackground.value})`)
      else document.documentElement.style.setProperty('--frontend-bg-image', 'none')
      if (uiBackendBackground.value) document.documentElement.style.setProperty('--backend-bg-image', `url(${uiBackendBackground.value})`)
      else document.documentElement.style.setProperty('--backend-bg-image', 'none')
      // apply meta settings
      try {
        if (uiFrontendBackgroundMeta.value) {
          const m = uiFrontendBackgroundMeta.value
          document.documentElement.style.setProperty('--frontend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
          document.documentElement.style.setProperty('--frontend-bg-size', `${m.size || 100}%`)
          document.documentElement.style.setProperty('--frontend-bg-blur', `${m.blur || 0}px`)
          const overlay = m.overlayColor || 'transparent'
          const opa = (m.overlayOpacity || 0) / 100
          if (overlay === 'transparent') {
            document.documentElement.style.setProperty('--frontend-bg-overlay-dark', 'transparent')
            document.documentElement.style.setProperty('--frontend-bg-overlay-light', 'transparent')
          } else {
            const rgb = (() => { try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
            document.documentElement.style.setProperty('--frontend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
            document.documentElement.style.setProperty('--frontend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
          }
          try {
            const layer = document.getElementById('chronicle-bg-layer')
            if (layer) {
              const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
              const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
              const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
              if (imgEl) {
                imgEl.style.backgroundPosition = `${m.posX || 50}% ${m.posY || 50}%`
                imgEl.style.backgroundSize = `${m.size || 100}%`
                imgEl.style.filter = `blur(${m.blur || 0}px)`
              }
              if (overlayEl) {
                if (overlay === 'transparent') overlayEl.style.background = 'transparent'
                else overlayEl.style.background = `rgba(${rgb}, ${opa})`
              }
              if (surfaceEl) {
                try { surfaceEl.style.background = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || 'transparent' } catch(e) {}
              }
            }
          } catch(e) {}
        }
      } catch(e) {}
      try {
        if (uiBackendBackgroundMeta.value) {
          const m = uiBackendBackgroundMeta.value
          document.documentElement.style.setProperty('--backend-bg-pos', `${m.posX || 50}% ${m.posY || 50}%`)
          document.documentElement.style.setProperty('--backend-bg-size', `${m.size || 100}%`)
          document.documentElement.style.setProperty('--backend-bg-blur', `${m.blur || 0}px`)
          const overlay = m.overlayColor || 'transparent'
          const opa = (m.overlayOpacity || 0) / 100
          if (overlay === 'transparent') {
            document.documentElement.style.setProperty('--backend-bg-overlay-dark', 'transparent')
            document.documentElement.style.setProperty('--backend-bg-overlay-light', 'transparent')
          } else {
            const rgb = (() => { try { let h=overlay.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const r=parseInt(h.substring(0,2),16); const g=parseInt(h.substring(2,4),16); const b=parseInt(h.substring(4,6),16); return `${r}, ${g}, ${b}` } catch(e) { return '0,0,0' } })()
            document.documentElement.style.setProperty('--backend-bg-overlay-dark', `rgba(${rgb}, ${opa})`)
            document.documentElement.style.setProperty('--backend-bg-overlay-light', `rgba(${rgb}, ${opa})`)
          }
          try {
            const layer = document.getElementById('chronicle-bg-layer')
            if (layer) {
              const imgEl = layer.querySelector('.bg-image') as HTMLElement | null
              const surfaceEl = layer.querySelector('.bg-surface') as HTMLElement | null
              const overlayEl = layer.querySelector('.bg-overlay') as HTMLElement | null
              if (imgEl) {
                imgEl.style.backgroundPosition = `${m.posX || 50}% ${m.posY || 50}%`
                imgEl.style.backgroundSize = `${m.size || 100}%`
                imgEl.style.filter = `blur(${m.blur || 0}px)`
              }
              if (overlayEl) {
                if (overlay === 'transparent') overlayEl.style.background = 'transparent'
                else overlayEl.style.background = `rgba(${rgb}, ${opa})`
              }
              if (surfaceEl) {
                try { surfaceEl.style.background = getComputedStyle(document.documentElement).getPropertyValue('--app-bg-primary') || 'transparent' } catch(e) {}
              }
            }
          } catch(e) {}
        }
      } catch(e) {}
    } catch(e) {}
  } catch(e) {}

  // Apply language settings immediately for current session (Settings is backend):
  try {
    if (uiBackendLocale.value && uiBackendLocale.value !== 'follow') {
      locale.value = uiBackendLocale.value as any
    } else {
      // Backend is follow: use browser default
      const nav = navigator.language || 'en'
      locale.value = nav.startsWith('zh') ? 'zh-CN' : 'en'
    }
    // ensure frontend clients pick up the frontend locale choice on reload/first visit
    // Do NOT forcefully overwrite localStorage for existing clients who might have a preference.
    // The frontend logic in App.vue should respect this setting for new/default visitors.
  } catch(e) {}

  try { show('Saved') } catch(e) {}
}

function reset() {
  localStorage.removeItem(key)
  uiFrontendLocale.value = 'follow'
  uiBackendLocale.value = 'follow'
  uiFrontendFont.value = 'sans'
  uiBackendFont.value = 'sans'
  uiThemeMode.value = 'follow'
  uiAccentColor.value = '#2ea35f'
}

// Optional: watch frontendLocale and apply as default for i18n on frontend
// NOTE: frontend locale will be applied only when the user clicks Save.
// Do not apply or reload on select change to avoid surprising behavior for current sessions.

// NOTE: backend locale will be persisted on Save; do not apply immediately on change.
</script>

<style scoped>
.appearance-page { max-width: 800px; margin:auto; padding: 2rem; }
.hint { color: var(--text-secondary); margin-top: -4px; margin-bottom: 12px; }

.appearance-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
}

.appearance-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-card {
  padding: 16px;
  border-radius: 10px;
  background: var(--component-bg);
  border: 1px solid var(--border-color);
}

.group-card h3 {
  margin: 0 0 10px;
  font-size: 1rem;
  color: var(--text-primary);
}

.form-row {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row:last-child { margin-bottom: 0; }

.actions { margin-top: 4px; display: flex; gap: 8px; }

.appearance-preview {
  --preview-accent: var(--accent-color);
  --preview-accent-dark: var(--accent-color-dark);
  background: var(--component-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 16px;
  position: sticky;
  top: 86px;
}

.appearance-preview h3 {
  margin: 0 0 10px;
  font-size: 1rem;
}

.preview-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.preview-title { font-weight: 600; color: var(--text-primary); }

.preview-chip {
  background: color-mix(in srgb, var(--preview-accent) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--preview-accent) 38%, transparent);
  color: var(--preview-accent);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.preview-tags { display: flex; gap: 8px; margin-bottom: 10px; }

.preview-tag {
  background: var(--component-bg-alt);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.82rem;
}

.preview-tag.featured {
  background: var(--featured-bg);
  color: var(--featured);
  border-color: color-mix(in srgb, var(--featured) 45%, transparent);
}

.preview-card {
  background: var(--component-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
}

.preview-card h4 { margin: 0 0 8px; font-size: 1rem; }
.preview-card p { margin: 0; color: var(--text-secondary); line-height: 1.55; }

.preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.preview-actions .primary {
  background: var(--preview-accent);
  border-color: var(--preview-accent);
  color: var(--text-on-accent);
}

.preview-actions .primary:hover { background: var(--preview-accent-dark); }

.preview-actions .secondary {
  border-color: var(--preview-accent);
  color: var(--preview-accent);
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-picker {
  width: 64px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
}

.color-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.bg-preview { width: 72px; height: 44px; background-size: cover; background-position: center; border-radius: 6px; border: 1px solid var(--border-color); }

.modal-overlay { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.4); z-index:1200 }
.modal-content { background: var(--component-bg); border: 1px solid var(--border-color); border-radius: 10px; width: 90%; max-width: 900px; max-height: 80vh; overflow:auto }
.modal-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom: 1px solid var(--border-color) }
.modal-body { padding:12px }
.image-grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(120px,1fr)); gap:12px }
.library-item { cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px; border-radius:8px; transition:all .12s }
.library-item:hover { background: var(--component-bg-hover) }
.img-thumb { width:100%; padding-top:66%; background-size:cover; background-position:center; border-radius:6px }
.img-name { font-size:0.85rem; color:var(--text-secondary); text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100% }
@media (max-width: 980px) {
  .appearance-layout {
    grid-template-columns: 1fr;
  }

  .appearance-preview {
    position: static;
  }
}

</style>
