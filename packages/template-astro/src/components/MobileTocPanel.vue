<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, nextTick } from 'vue';
import tocController, { setTocGetter } from '../utils/tocController';
import type { TocItem } from '../utils/toc';

const props = withDefaults(defineProps<{ toc?: TocItem[] }>(), {
  toc: () => [],
});

const open = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const state = tocController.state;
const liveActiveId = computed(() => state.liveActiveId);

function toggleMobileToc() {
  // use normal toggle logic: set open state and, when opened, read current position and adjust once
  open.value = !open.value;
  if (open.value) {
    void nextTick().then(() => {
      tocController.computeLiveActiveFromBaseline();
      ensureActiveItemVisible();
    });
  }
}

function close() {
  open.value = false;
}

function onBackdropClick() {
  close();
}

function onPanelClick(event: MouseEvent) {
  event.stopPropagation();
}

function onMobileTocItemClick(id: string) {
  // close immediately, then scroll
  close();
  setTimeout(() => onTocClick(id), 0);
}

function onTocClick(id: string) {
  try {
    state.liveActiveId = id;
    const desired = `#${id}`;
    if (typeof window === 'undefined') return;
    const current = window.location.hash || '';
    if (current !== desired) {
      try { history.pushState(null, '', desired); } catch (e) { window.location.hash = desired; }
      setTimeout(() => { window.dispatchEvent(new Event('hashchange')); }, 0);
    } else {
      setTimeout(() => { window.dispatchEvent(new Event('hashchange')); }, 0);
    }
    // ensure immediate scroll on mobile by invoking controller directly
    try { tocController.scrollToHeading(id); } catch (e) {}
    tocController.pauseLiveSync(1200);
  } catch (_error) {}
}

function handleOpenEvent() {
  toggleMobileToc();
}

onMounted(() => {
  window.addEventListener('open-mobile-toc', handleOpenEvent as EventListener);
  setTocGetter(() => props.toc || []);
});

onBeforeUnmount(() => {
  window.removeEventListener('open-mobile-toc', handleOpenEvent as EventListener);
});

// keep mobile panel auto-scrolling the active item into view like FloatingToc
function ensureActiveItemVisible() {
  const nav = listRef.value;
  if (!nav) return;

  const activeItem = nav.querySelector('li.active') as HTMLElement | null;
  if (!activeItem) return;

  const navRect = nav.getBoundingClientRect();
  const activeRect = activeItem.getBoundingClientRect();

  const upperBand = navRect.top + navRect.height * 0.2;
  const lowerBand = navRect.bottom - navRect.height * 0.2;

  if (activeRect.top >= upperBand && activeRect.bottom <= lowerBand) return;

  const targetTop =
    nav.scrollTop
    + (activeRect.top - navRect.top)
    - (nav.clientHeight / 2)
    + (activeRect.height / 2);

  const maxTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
  nav.scrollTo({ top: Math.min(maxTop, Math.max(0, targetTop)), behavior: 'smooth' });
}

// removed reactive watchers; behaviour now runs once at open time
</script>

<template>
  <div v-if="toc.length" ref="panelRef" class="mobile-toc-panel" :class="{ open }" v-show="open" role="dialog" aria-label="目录" @click="onBackdropClick">
    <div class="mobile-toc-panel-inner" @click="onPanelClick">
      <ul ref="listRef" class="mobile-toc-list">
        <li
          v-for="item in toc"
          :key="item.id"
          :class="[`toc-level-${item.level}`, { active: item.id === liveActiveId }]"
        >
          <a href="#" @click.prevent="onMobileTocItemClick(item.id)">
            <span class="toc-text">{{ item.text }}</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* Mobile TOC fly-in animation and fixed header */
.mobile-toc-panel {
  transform-origin: left bottom;
  opacity: 0;
  transform: translateY(10px) scale(0.96);
  transition: opacity 220ms ease, transform 260ms cubic-bezier(.22,.9,.36,1);
}
.mobile-toc-panel.open {
  opacity: 1;
  transform: translateY(0) scale(1);
  /* ensure panel is above corner button */
  z-index: 1400;
}

.mobile-toc-panel.open { animation: mobileTocFlyIn 140ms ease-out both; }

@keyframes mobileTocFlyIn {
  from { opacity: 0; transform: translateY(18px) scale(0.5); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Make header sticky inside the panel so it stays visible while the list scrolls */
.mobile-toc-panel-inner { padding: 0; }
.mobile-toc-panel .mobile-toc-list { padding: 8px; max-height: calc(60vh - 56px); overflow: auto; }

.mobile-toc-panel {
    position: fixed;
    left: 12px;
    right: 20px;
    bottom: 80px;
    z-index: 1400;
    background: var(--component-bg);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    max-height: 60vh;
    overflow: auto;
    box-shadow: var(--shadow-elev-3);
}
.mobile-toc-panel-inner { padding: 8px }
  .mobile-toc-header { display:flex; align-items:center; justify-content:space-between; padding: 6px 8px; border-bottom: 1px solid var(--toc-divider-color) }
.mobile-toc-title { font-weight:600 }
.mobile-toc-close { background: transparent; border: none; color: inherit; padding: 6px }
.mobile-toc-list { list-style:none; margin:0; padding:6px }
.mobile-toc-list li { padding: 6px 4px; border-radius: 6px }
.mobile-toc-list li.active { background: var(--component-bg-hover); }
.mobile-toc-list li a { color: inherit; text-decoration: none; display:block }

.mobile-toc-list::-webkit-scrollbar{
    background: transparent;
    width: 3px;
    height: 3px;
}

.mobile-toc-list::-webkit-scrollbar-thumb{
    background: var(--component-text-secondary);
    border-radius: 2px;
}

.mobile-toc-list::-webkit-scrollbar-thumb:hover{
    background: var(--component-text-primary);
}

.mobile-toc-list::-webkit-scrollbar-track{
    background: inherit;
    width: 5px;
    height: 5px;
}

</style>
