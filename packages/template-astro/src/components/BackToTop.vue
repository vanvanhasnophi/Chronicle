<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const root = ref<HTMLElement | null>(null);

let handleAstroPageLoad: (() => void) | null = null;
let mainContentScrollHandler: ((this: HTMLElement, ev: Event) => any) | null = null;
let backToTopClickHandler: ((this: HTMLElement, ev: Event) => any) | null = null;

function moveToBody() {
  if (typeof document === 'undefined') return;
  const el = root.value;
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
}

function initBackToTop() {
  if (typeof document === 'undefined') return;

  const btn = document.getElementById('back-to-top') as HTMLElement | null;
  const mainContent = document.querySelector('.main-content') as HTMLElement | null;
  if (!btn || !mainContent) return;

  const handleScroll = () => {
    const isVisible = mainContent.scrollTop > 300;
    btn.classList.toggle('visible', isVisible);
  };

  const handleClick = () => {
    mainContent.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // store handlers so they can be removed later
  mainContentScrollHandler = handleScroll;
  backToTopClickHandler = handleClick;

  mainContent.addEventListener('scroll', handleScroll);
  btn.addEventListener('click', handleClick);

  // Initial check
  handleScroll();
}

onMounted(() => {
  // DOM-only initialization
  moveToBody();

  handleAstroPageLoad = () => {
    // Called on astro page-load to ensure element is attached and listeners re-applied
    moveToBody();
    initBackToTop();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('astro:page-load', handleAstroPageLoad as EventListener);
  }

  // Initial setup
  initBackToTop();
});

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;

  if (handleAstroPageLoad) {
    document.removeEventListener('astro:page-load', handleAstroPageLoad as EventListener);
    handleAstroPageLoad = null;
  }

  const btn = document.getElementById('back-to-top') as HTMLElement | null;
  const mainContent = document.querySelector('.main-content') as HTMLElement | null;

  if (mainContent && mainContentScrollHandler) {
    mainContent.removeEventListener('scroll', mainContentScrollHandler as EventListener);
    mainContentScrollHandler = null;
  }

  if (btn && backToTopClickHandler) {
    btn.removeEventListener('click', backToTopClickHandler as EventListener);
    backToTopClickHandler = null;
  }
});
</script>


<template>
  <button ref="root" class="corner-button" id="back-to-top" title="Back to Top">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  </button>
</template>