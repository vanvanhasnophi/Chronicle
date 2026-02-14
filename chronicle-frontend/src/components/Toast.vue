<template>
  <transition name="toast-fade">
    <div v-if="visible" class="global-toast" role="status" aria-live="polite">
      {{ message }}
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast'

const { toastState } = useToast()
const { visible, message } = toastState
</script>

<style scoped>
.global-toast {
  position: fixed;
  /* move slightly inward from the viewport edge */
  right: 2.25rem;
  bottom: 2rem;
  /* gentle translucent background so it doesn't fully cover content */
  background: rgba(46,163,95,0.12);
  color: var(--text-primary, #fff);
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(46,163,95,0.22);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 20px rgba(11,22,40,0.12);
  z-index: 9999;
  font-weight: 600;
  max-width: 420px;
  word-break: break-word;
}

.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 220ms cubic-bezier(.2,.9,.2,1), transform 220ms cubic-bezier(.2,.9,.2,1) }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateY(10px) scale(0.98) }
</style>
