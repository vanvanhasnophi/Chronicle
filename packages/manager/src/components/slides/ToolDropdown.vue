<template>
  <Teleport to="body">
    <Transition name="td">
      <div v-if="show" class="tool-dropdown-backdrop" @click="close()">
        <div class="tool-dropdown" :style="posStyle" @click.stop>
          <template v-for="item in items" :key="item.action || item.type">
            <hr v-if="item.type === 'separator'" class="tool-dropdown-sep">
            <button v-else class="tool-dropdown-item" :class="{ active: item.active }" @click="emit('select', item.action!)">
              <span v-if="item.icon" class="icon-svg" v-html="item.icon"></span>
              <span class="tool-dropdown-label">{{ item.label }}</span>
              <span v-if="item.active" class="tool-dropdown-check icon-svg" v-html="checkIcon"></span>
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icons } from '../../utils/icons'

const checkIcon = Icons.check as string

defineProps<{
  items: Array<{ label?: string; action?: string; icon?: string; type?: string; active?: boolean }>
}>()

const emit = defineEmits<{ select: [action: string] }>()

const show = ref(false)
const anchor = ref<{ x: number; y: number }>({ x: 0, y: 80 })

const posStyle = computed(() => {
  // 防左右溢出 + 8px 安全边距
  const x = `clamp(98px, ${anchor.value.x}px, calc(100vw - 98px))`
  return `top:${anchor.value.y}px;left:${x};transform:translateX(-50%)`
})

function open(x: number, y: number) {
  anchor.value = { x, y }
  show.value = true
}

function close() { show.value = false }

defineExpose({ open, close })
</script>

<style scoped>
.tool-dropdown-backdrop {
  position: fixed; inset: 0; z-index: 9997; background: transparent;
}
.tool-dropdown {
  position: fixed; z-index: 9998;
  background: var(--component-bg-blur);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border-color);
  border-radius: 8px; padding: 4px;
  box-shadow: var(--shadow-elev-2);
  display: flex; flex-direction: column; gap: 2px;
  min-width: 180px;
}
.tool-dropdown-item {
  background: transparent; border: none;
  color: var(--component-text-primary); cursor: pointer;
  padding: 7px 12px; text-align: left; border-radius: 6px;
  font-family: var(--app-font-stack); font-size: 14px;
  display: flex; align-items: center; gap: 8px;
  transition: background .15s ease, color .15s ease;
}
.tool-dropdown-item:hover { background: var(--component-bg-hover); }
.tool-dropdown-item .icon-svg { width: 16px; height: 16px; display: flex; align-items: center; }
.tool-dropdown-item .icon-svg :deep(svg) { width: 16px; height: 16px; }
.tool-dropdown-label { white-space: nowrap; flex: 1; }
.tool-dropdown-item.active { color: var(--accent-color); font-weight: 500; background: var(--component-bg-accent-blur); }
.tool-dropdown-check { margin-left: auto; width: 14px; height: 14px; }
.tool-dropdown-check.icon-svg :deep(svg) { width: 14px; height: 14px; }
.tool-dropdown-sep { margin: 4px 8px; border: none; border-top: 1px solid var(--border-color); }

/* Transition */
.td-enter-active, .td-leave-active {
  transition: opacity .15s ease, transform .15s ease;
}
.td-enter-from, .td-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
