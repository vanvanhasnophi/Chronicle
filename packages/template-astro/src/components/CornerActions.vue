<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import tocController from '../utils/tocController';

const props = withDefaults(defineProps<{ hasToc?: boolean }>(), {
  hasToc: true,
});

const root = ref<HTMLElement | null>(null);
let handleAstroPageLoad: (() => void) | null = null;
const showBackToTop = computed(() => tocController.state.showBackToTop);

function openMobile() {
  window.dispatchEvent(new CustomEvent('open-mobile-toc'));
}

function backToTop() {
  tocController.backToTop();
}

function moveToBody() {
  const el = root.value;
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
}

onMounted(() => {
  moveToBody();
  handleAstroPageLoad = () => moveToBody();
  document.addEventListener('astro:page-load', handleAstroPageLoad);
});

onBeforeUnmount(() => {
  if (handleAstroPageLoad) {
    document.removeEventListener('astro:page-load', handleAstroPageLoad);
    handleAstroPageLoad = null;
  }
});
</script>

<template>
  <div ref="root" class="corner-actions" data-corner-actions="true">
    <button v-if="props.hasToc" class="corner-button primary mobile-toggle" id="mobile-toc-trigger" @click="openMobile" title="目录"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button>
    <button class="corner-button btt" :class="{ visible: showBackToTop }" id="back-to-top" @click="backToTop" title="回到顶部"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></button>
  </div>
</template>

<style scoped>
.corner-actions { position: static; }

.corner-actions :global(.corner-button) {
  bottom: 30px;
}

.corner-actions :global(.corner-button.mobile-toggle) {
  left: 30px;
  right: auto;
  display: inline-flex;
}

.corner-actions :global(.corner-button.btt) {
  right: 30px;
  left: auto;
  display: inline-flex;
}


</style>
