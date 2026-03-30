<template>
  <div class="bg-editor-overlay" @click.self="close">
    <div class="bg-editor-modal">
      <div class="bg-editor-header">
        <h5>Background Editor</h5>
        <button class="close-btn" v-html="Icons.close" @click="close"></button>
      </div>
      <div class="bg-editor-body">
        <div class="preview-area">
          <div class="preview">
            <div class="preview-inner" :style="previewInnerStyle"></div>
            <div class="overlay" :style="overlayStyle"></div>
            <div class="preview-theme-toggle">
              <button :class="{ 'active': previewTheme === 'light' }" @click.prevent="previewTheme = 'light'">Light</button>
              <button :class="{ 'active': previewTheme === 'dark' }" @click.prevent="previewTheme = 'dark'">Dark</button>
            </div>
          </div>
        </div>
        <div class="controls">
          <div class="control-row">
            <label>Position X</label>
            <input type="range" min="0" max="100" v-model.number="meta.posX" />
            <span>{{ meta.posX }}%</span>
          </div>
          <div class="control-row">
            <label>Position Y</label>
            <input type="range" min="0" max="100" v-model.number="meta.posY" />
            <span>{{ meta.posY }}%</span>
          </div>
          <div class="control-row">
            <label>Size (%)</label>
            <input type="range" min="10" max="300" v-model.number="meta.size" />
            <span>{{ meta.size }}%</span>
          </div>
          <div class="control-row">
            <label>Blur (px)</label>
            <input type="range" min="0" max="60" v-model.number="meta.blur" />
            <span>{{ meta.blur }}px</span>
          </div>
          <div class="overlay-controls">
            <div class="overlay-control control-row">
              <label>Overlay (Light)</label>
              <input type="color" v-model="meta.overlayLightColor" />
              <label class="small" >Opacity</label>
              <input type="range" min="0" max="100" v-model.number="meta.overlayLightOpacity" />
              <span>{{ meta.overlayLightOpacity }}%</span>
            </div>
            <div class="clone-buttons" role="group" aria-label="Clone overlay settings">
                <button class="clone-button" :title="t('settings.copy_to_light')" @click.prevent="copyDarkToLight" v-html="Icons.arrowUp"></button>
                <button class="clone-button rotated" :title="t('settings.copy_to_dark')" @click.prevent="copyLightToDark" v-html="Icons.arrowUp"></button>
            </div>
            <div class="overlay-control control-row">
              <label>Overlay (Dark)</label>
              <input type="color" v-model="meta.overlayDarkColor" />
              <label class="small" >Opacity</label>
              <input type="range" min="0" max="100" v-model.number="meta.overlayDarkOpacity" />
              <span>{{ meta.overlayDarkOpacity }}%</span>
            </div>
          </div>
        </div>
      </div>
      <div class="bg-editor-actions">
        <button class="secondary" @click="close">Cancel</button>
        <button class="secondary" @click.prevent="openPicker">Choose Image</button>
        <button class="primary" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, toRefs, watch, computed, ref } from 'vue'
import { Icons } from '../utils/icons';
import { hexToRgbString } from '../utils/colorUtils'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
const props = defineProps<{ url: string; initial?: any }>()
const emit = defineEmits<{
  (e: 'save', meta: any): void
  (e: 'close'): void
  (e: 'open-picker'): void
}>()


const defaultMeta = {
  posX: 50,
  posY: 50,
  size: 100,
  blur: 0,
  // new: support separate light/dark overlay
  overlayLightColor: '#000000',
  overlayLightOpacity: 0,
  overlayDarkColor: '#000000',
  overlayDarkOpacity: 0,
  // backward compat
  overlayColor: undefined,
  overlayOpacity: undefined
}

const meta = reactive(Object.assign({}, defaultMeta, props.initial || {}))

watch(() => props.initial, (v) => {
  if (v) Object.assign(meta, v)
})

function close() { emit('close') }

function save() {
  const out = {
    posX: Number(meta.posX),
    posY: Number(meta.posY),
    size: Number(meta.size),
    blur: Number(meta.blur),
    // emit both new light/dark and legacy fields for compatibility
    overlayLightColor: meta.overlayLightColor || '#000000',
    overlayLightOpacity: Number(meta.overlayLightOpacity || 0),
    overlayDarkColor: meta.overlayDarkColor || '#000000',
    overlayDarkOpacity: Number(meta.overlayDarkOpacity || 0),
    overlayColor: meta.overlayDarkColor || meta.overlayLightColor || undefined,
    overlayOpacity: Number(meta.overlayDarkOpacity || meta.overlayLightOpacity || 0)
  }
  emit('save', out)
}

function openPicker() { emit('open-picker') }

const previewInnerStyle = computed(() => {
  const url = props.url ? `url(${props.url})` : 'none'
  const pos = `${meta.posX}% ${meta.posY}%`
  const size = `${meta.size}%`
  const blur = `${meta.blur}px`
  return {
    backgroundImage: url,
    backgroundPosition: pos,
    backgroundSize: size,
    backgroundRepeat: 'no-repeat',
    filter: `blur(${blur})`
  }
})

const previewTheme = ref<'light' | 'dark'>('light')

const overlayStyle = computed(() => {
  const c = (previewTheme.value === 'light') ? (meta.overlayLightColor || '#000') : (meta.overlayDarkColor || '#000')
  const o = (previewTheme.value === 'light') ? ((meta.overlayLightOpacity || 0) / 100) : ((meta.overlayDarkOpacity || 0) / 100)
  return { background: `rgba(${hexToRgbString(c)}, ${o})` }
})

function copyLightToDark() {
  meta.overlayDarkColor = meta.overlayLightColor
  meta.overlayDarkOpacity = meta.overlayLightOpacity
}

function copyDarkToLight() {
  meta.overlayLightColor = meta.overlayDarkColor
  meta.overlayLightOpacity = meta.overlayDarkOpacity
}

// use shared helper
</script>

<style scoped>
.bg-editor-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  z-index: 10050
}

.bg-editor-modal {
  width: 92%;
  max-width: 900px;
  background: var(--component-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column
}

.bg-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color)
}

.bg-editor-body {
  display: flex;
  gap: 12px;
  padding: 12px
}

.preview-area {
  flex: 1 1 40%;
  display: flex;
  align-items: center;
  justify-content: center
}

.preview {
  width: 100%;
  height: 320px;
  border-radius: 8px;
  overflow: hidden;
  background-size: cover;
  background-position: center center;
  position: relative;
  box-shadow: var(--shadow-elev-1)
}

.preview-inner {
  position: absolute;
  inset: 0;
  z-index: 0
}

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1
}

.preview-theme-toggle {
  position: absolute;
  right: 12px;
  top: 12px;
  display: flex;
  gap: 6px;
  z-index: 2
}

.preview-theme-toggle button {
  background: rgba(0, 0, 0, 0.12);
  border: none;
  color: var(--text-primary);
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer
}

.preview-theme-toggle button.active {
  background: var(--accent-color);
  color: var(--text-on-accent)
}
.overlay-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}
.overlay-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clone-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
}
.clone-button {
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 6px;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.clone-button:hover {
  opacity: 0.9;
}
.clone-button svg {
  width: 18px;
  height: 18px;
}
.clone-button.rotated {
  transform: rotate(180deg);
}

.controls {
  flex: 1 1 60%;
  display: flex;
  flex-direction: column;
  gap: 10px
}

.control-row {
  display: flex;
  align-items: center;
  gap: 8px
}

.control-row label {
  width: 120px
}

.control-row input[type=range] {
  flex: 1
}

.control-row input[type=color] {
  width: 48px;
  height: 32px;
  border: none
}

.overlay-controls {
  display: flex;
  gap: 8px;
}

.overlay-control {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px
}

.clone-buttons {
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: left;
  justify-content: center;
  margin: -10px 0;
}

.clone-button {
  background: transparent;
  border: none;
  padding: 0 2px;
  
  cursor: pointer;
  color: var(--text-primary)
}

.clone-button:hover {
  color: var(--accent-color);
}

.bg-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-color)
}

.primary {
  background: var(--accent-color);
  color: var(--text-on-accent);
  padding: 8px 12px;
  border-radius: 6px;
  border: none
}

.secondary {
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  border-radius: 6px
}

.close-btn {
  background: none;
  border: none;
  color: var(--component-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}
label.small {
  max-width: fit-content;
  margin-left:30px;
}


h5 {
  margin: 0;
  color: var(--text-primary);
}
</style>
