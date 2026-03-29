<template>
  <div class="bg-editor-overlay" @click.self="close">
    <div class="bg-editor-modal">
      <div class="bg-editor-header">
        <h5>Background Editor</h5>
        <button class="close-btn" v-html="Icons.close" @click="close"></button>
      </div>
      <div class="bg-editor-body">
        <div class="preview-area">
          <div class="preview" :style="previewStyle">
            <div class="overlay" :style="overlayStyle"></div>
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
          <div class="control-row">
            <label>Overlay color</label>
            <input type="color" v-model="meta.overlayColor" />
            <label class="small">Opacity</label>
            <input type="range" min="0" max="100" v-model.number="meta.overlayOpacity" />
            <span>{{ meta.overlayOpacity }}%</span>
          </div>
        </div>
      </div>
      <div class="bg-editor-actions">
        <button class="secondary" @click="close">Cancel</button>
        <button class="primary" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, toRefs, watch, computed } from 'vue'
import { Icons } from '../utils/icons';
const props = defineProps<{ url: string; initial?: any }>()
const emit = defineEmits<{
  (e: 'save', meta: any): void
  (e: 'close'): void
}>()

const defaultMeta = {
  posX: 50,
  posY: 50,
  size: 100,
  blur: 0,
  overlayColor: '#000000',
  overlayOpacity: 0
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
    overlayColor: meta.overlayColor || '#000000',
    overlayOpacity: Number(meta.overlayOpacity || 0)
  }
  emit('save', out)
}

const previewStyle = computed(() => {
  const url = props.url ? `url(${props.url})` : 'none'
  const pos = `${meta.posX}% ${meta.posY}%`
  const size = `${meta.size}%`
  const blur = `${meta.blur}px`
  return {
    backgroundImage: url,
    backgroundPosition: pos,
    backgroundSize: size,
    filter: `blur(${blur})`
  }
})

const overlayStyle = computed(() => {
  const c = meta.overlayColor || '#000'
  const o = (meta.overlayOpacity || 0) / 100
  return { background: `rgba(${hexToRgb(c)}, ${o})` }
})

function hexToRgb(hex: string) {
  try {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    const r = parseInt(h.substring(0,2),16)
    const g = parseInt(h.substring(2,4),16)
    const b = parseInt(h.substring(4,6),16)
    return `${r}, ${g}, ${b}`
  } catch (e) { return '0,0,0' }
}
</script>

<style scoped>
.bg-editor-overlay { position: fixed; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(0,0,0,0.45); z-index:1400 }
.bg-editor-modal { width: 92%; max-width: 900px; background: var(--component-bg); border: 1px solid var(--border-color); border-radius:10px; overflow:hidden; display:flex; flex-direction:column }
.bg-editor-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border-color) }
.bg-editor-body { display:flex; gap:12px; padding:12px }
.preview-area { flex: 1 1 40%; display:flex; align-items:center; justify-content:center }
.preview { width:100%; height:320px; border-radius:8px; overflow:hidden; background-size:cover; background-position:center center; position:relative; box-shadow: var(--shadow-elev-1) }
.overlay { position:absolute; inset:0; pointer-events:none }
.controls { flex:1 1 60%; display:flex; flex-direction:column; gap:10px }
.control-row { display:flex; align-items:center; gap:8px }
.control-row label { width:120px }
.control-row input[type=range] { flex:1 }
.control-row input[type=color] { width:48px; height:32px; border:none }
.bg-editor-actions { display:flex; justify-content:flex-end; gap:8px; padding:12px; border-top:1px solid var(--border-color) }
.primary { background: var(--accent-color); color: var(--text-on-accent); padding:8px 12px; border-radius:6px; border:none }
.secondary { background: transparent; border:1px solid var(--border-color); padding:8px 12px; border-radius:6px }
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
h5 {
    margin: 0;
    color: var(--text-primary);
}
</style>
