<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TocItem } from '../utils/toc';
import tocController, { initController, setTocGetter } from '../utils/tocController';

const props = withDefaults(defineProps<{
  toc: TocItem[];
  navLabel?: string;
  containerSelector?: string;
  inlineSelector?: string;
  baselineOffset?: number;
  mountToBody?: boolean;
}>(), {
  navLabel: 'Table of contents',
  containerSelector: '.main-content',
  inlineSelector: '.markdown-toc',
  baselineOffset: 85,
  mountToBody: false,
});

const islandRoot = ref<HTMLElement | null>(null);
const tocNav = ref<HTMLElement | null>(null);
let floatCollapseTimer: number | undefined;
let handleAstroRouteSync: (() => void) | null = null;

const state = tocController.state;
const liveActiveId = computed(() => state.liveActiveId);
const showTOCandBTT = computed(() => state.showTOCandBTT);
const floatCollapsed = computed(() => state.floatCollapsed);

function ensureActiveItemVisible() {
  const nav = tocNav.value;
  if (!nav) return;

  const activeItem = nav.querySelector('.toc-float-item.active') as HTMLElement | null;
  if (!activeItem) return;

  const navRect = nav.getBoundingClientRect();
  const activeRect = activeItem.getBoundingClientRect();
  const upperBand = navRect.top + navRect.height * 0.25;
  const lowerBand = navRect.bottom - navRect.height * 0.25;

  if (activeRect.top >= upperBand && activeRect.bottom <= lowerBand) return;

  const targetTop =
    nav.scrollTop
    + (activeRect.top - navRect.top)
    - (nav.clientHeight / 2)
    + (activeRect.height / 2);

  const maxTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
  nav.scrollTo({
    top: Math.min(maxTop, Math.max(0, targetTop)),
    behavior: 'smooth',
  });
}

function lineWidth(level: number) {
  const max = Math.max(1, props.toc.length ? Math.max(...props.toc.map((i) => i.level)) : 1);
  const maxPx = 20;
  const minPx = 10;
  if (max <= 1) return `${maxPx}px`;
  const ratio = (max - level) / (max - 1);
  return `${Math.round(minPx + ratio * (maxPx - minPx))}px`;
}

function onTocClick(id: string) {
  // update controller state and perform scroll
  state.liveActiveId = id;
  try { history.pushState(null, '', `#${id}`); } catch (e) { window.location.hash = `#${id}`; }
  tocController.pauseLiveSync(1500);
  tocController.scrollToHeading(id);
}

function syncActiveIdWithToc() {
  const toc = props.toc || [];
  if (!toc.length) {
    state.liveActiveId = '';
    return;
  }

  const hashId = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
  if (hashId && toc.some((item) => item.id === hashId)) {
    state.liveActiveId = hashId;
    return;
  }

  if (!toc.some((item) => item.id === state.liveActiveId)) {
    state.liveActiveId = toc[0].id;
  }
}

function syncControllerForRoute() {
  moveIslandToBody();
  setTocGetter(() => props.toc || []);
  initController({ containerSelector: props.containerSelector, inlineSelector: props.inlineSelector, baselineOffset: props.baselineOffset });
  syncActiveIdWithToc();
  void nextTick(() => {
    tocController.computeLiveActiveFromBaseline();
    ensureActiveItemVisible();
  });
}

function moveIslandToBody() {
  if (!props.mountToBody) return;
  const root = islandRoot.value;
  if (!root) return;
  if (root.parentElement !== document.body) document.body.appendChild(root);
}

onMounted(() => {
  handleAstroRouteSync = () => {
    syncControllerForRoute();
  };
  document.addEventListener('astro:page-load', handleAstroRouteSync);
  document.addEventListener('astro:after-swap', handleAstroRouteSync);
  syncControllerForRoute();
});

onBeforeUnmount(() => {
  if (handleAstroRouteSync) {
    document.removeEventListener('astro:page-load', handleAstroRouteSync);
    document.removeEventListener('astro:after-swap', handleAstroRouteSync);
    handleAstroRouteSync = null;
  }
  if (floatCollapseTimer) {
    clearTimeout(floatCollapseTimer);
    floatCollapseTimer = undefined;
  }

  const root = islandRoot.value;
  if (root && root.parentElement) {
    root.parentElement.removeChild(root);
  }
});

watch(
  () => props.toc,
  () => {
    syncControllerForRoute();
  },
  { deep: true }
);

watch(
  liveActiveId,
  () => {
    void nextTick(() => {
      ensureActiveItemVisible();
    });
  },
  { flush: 'post' }
);

watch(
  floatCollapsed,
  () => {
    void nextTick(() => {
      ensureActiveItemVisible();
    });
  },
  { flush: 'post' }
);

function onFloatMouseEnter() {
  if (floatCollapseTimer) {
    clearTimeout(floatCollapseTimer);
    floatCollapseTimer = undefined;
  }
  tocController.state.floatCollapsed = false;
}

function onFloatMouseLeave() {
  if (floatCollapseTimer) clearTimeout(floatCollapseTimer);
  floatCollapseTimer = window.setTimeout(() => {
    tocController.state.floatCollapsed = true;
  }, 1000);
}
</script>

<template>
  <div ref="islandRoot" data-floating-toc-island="true">
    <nav
      ref="tocNav"
      v-if="toc.length"
      class="toc-float"
      :class="{ collapsed: floatCollapsed, visible: showTOCandBTT }"
      :aria-label="navLabel"
      @mouseenter="onFloatMouseEnter"
      @mouseleave="onFloatMouseLeave"
    >
      <ul>
        <li
          v-for="item in toc"
          :key="item.id"
          :class="[`toc-float-item`, `toc-level-${item.level}`, { active: item.id === liveActiveId }]"
        >
          <a :href="`#${item.id}`" @click.prevent="onTocClick(item.id)" class="toc-link">
            <span class="toc-text">{{ item.text }}</span>
            <span class="toc-line" :style="{ width: lineWidth(item.level) }"></span>
          </a>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.toc-float{
  font-size:0.8em;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  background-clip: padding-box;
  margin-right: 10px;
}

.toc-float-item{
    margin-left: 10px;
}

.toc-float-item:hover{
    color: var(--text-primary) !important;
}


.toc-float ul { list-style: none; margin: 0; padding: 4px }
.toc-float li { margin: 1px 0; }
.toc-float a { text-decoration: none; display: block; box-sizing: border-box; }
.toc-float .toc-text { display: block; width: 100%; padding: 3px 6px 3px 6px; padding-right: 10px; box-sizing: border-box; border-radius: 6px; transition: background 0.12s, color 0.12s; color: var(--component-text-secondary-disabled); }
.toc-float:not(.collapsed) .toc-level-1 { padding-left: 1px !important; }
.toc-float:not(.collapsed) .toc-level-2 { padding-left: 6px !important; }
.toc-float:not(.collapsed) .toc-level-3 { padding-left: 12px !important; }
.toc-float:not(.collapsed) .toc-level-4 { padding-left: 18px !important; }
.toc-float:not(.collapsed) .toc-level-5 { padding-left: 24px !important; }
.toc-float:not(.collapsed) .toc-level-6 { padding-left: 30px !important; }
.toc-float.collapsed .toc-level-1 { padding-left: 0 !important; }
.toc-float.collapsed .toc-level-2 { padding-left: 5px !important; }
.toc-float.collapsed .toc-level-3 { padding-left: 8px !important; }
.toc-float.collapsed .toc-level-4 { padding-left: 10px !important; }
.toc-float.collapsed .toc-level-5 { padding-left: 11px !important; }
.toc-float.collapsed .toc-level-6 { padding-left: 12px !important; }
.toc-float li:hover .toc-text { background: var(--component-bg-hover); color: var(--component-text-primary-hover) }
.toc-float li:active .toc-text { background: var(--component-bg-highlight); color: var(--component-text-primary-highlight); }
.toc-float li:focus .toc-text { background: var(--component-bg-highlight); color: var(--component-text-primary-highlight); }

.toc-float { 
    right: calc(10px + 2vw); 
    position: fixed; 
    top: calc(10px + 20vh); 
    /* remove fixed bottom so height can shrink to content; constrain via max-height */
    z-index: 1199; 
    overflow-x: hidden;
    transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.3s ease; 
    box-sizing: border-box; 
    border-radius: 8px;
    /* Ensure toc grows to fit content but never extends past the visual bottom (80px)
       calc(100vh - top - bottom) keeps its bottom <= previous bottom value */
    max-height: calc(70vh - 80px);
    height: auto;
}
.toc-float.collapsed { overflow-y: auto; width: 38px; padding: 4px 8px; border:none; background-color: transparent; border-radius: 10px; scrollbar-width: none; }
.toc-float.collapsed::-webkit-scrollbar { width: 0; height: 0; }
.toc-float:not(.collapsed) { overflow-y: auto; width: 220px; background-color: var(--component-bg-blur); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 1px solid var(--border-color); }

.toc-float ul { padding: 4px; list-style: none; margin: 0; transition: padding 0.3s ease; }
.toc-float.collapsed ul {padding: 0;}

.toc-float li { display: flex; align-items: center; transition: justify-content 0.3s ease; min-height: 20px; position: relative; }
.toc-float.collapsed li { justify-content: center; margin: 0; }
.toc-float:not(.collapsed) li { justify-content: flex-start; }

.toc-link {
    display: flex;
    align-items: center;
    width: 100%;
    text-decoration: none;
    position: relative;
    /* Ensure link covers area */
    justify-content: inherit; 
}

.toc-float.collapsed .toc-link {
    width: 100%;
    padding: 0;
}

/* Line style (collapsed state) */
.toc-float .toc-line { 
    display:block; 
    height:3px; 
    background: var(--border-color-blur); 
    border-radius:1.5px; 
    transition: opacity 0.2s ease, transform 0.3s ease, background-color 0.3s ease; 
    position: absolute;
    right: 0;
    width: 100% !important;
}

/* Expanded State: Hide Line */
.toc-float:not(.collapsed) .toc-line {
    opacity: 0;
    transform: translateX(10px);
    pointer-events: none;
}

/* Collapsed State: Show Line */
.toc-float.collapsed .toc-line {
    opacity: 1;
    transform: translateX(0);
    position: relative; /* In flow when collapsed */
    /* ensure the small bar hugs its content and doesn't stretch
       or offset from the right due to the full-width link */
    margin: 0;
}

/* Active State for Line */
.toc-float li.active .toc-line {
    background: var(--component-text-primary-highlight);
    box-shadow: 0 0 4px color-mix(in srgb, var(--component-text-primary-highlight) 70%, transparent), 0 0 8px color-mix(in srgb, var(--component-text-primary) 20%, transparent);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--component-text-primary-highlight) 45%, transparent));
    transition: box-shadow 0.18s ease, background 0.18s ease, filter 0.18s ease;
}
.toc-float li:hover .toc-line { background: var(--component-text-primary-hover); }


/* Text style (expanded state) */
.toc-float .toc-text { 
    display: block; 
    width: 100%; 
    padding: 3px 6px; 
    padding-right: 10px; 
    box-sizing: border-box; 
    border-radius: 6px; 
    color: var(--component-text-secondary); 
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: opacity 0.2s ease, transform 0.3s ease, background-color 0.2s, color 0.2s;
}

/* Collapsed State: Hide Text */
.toc-float.collapsed .toc-text { 
    opacity: 0;
    transform: translateX(10px);
    position: absolute; /* Take out of flow */
    pointer-events: none;
}

/* expanded scrollbar styling */
.toc-float:not(.collapsed)::-webkit-scrollbar { width: 6px; }
.toc-float:not(.collapsed)::-webkit-scrollbar-thumb { background: var(--component-bg-hover); border-radius: 3px; }
.toc-float:not(.collapsed)::-webkit-scrollbar-track { background: inherit; border-radius: 3px;}

/* Expanded State: Show Text */
.toc-float:not(.collapsed) .toc-text {
    opacity: 1;
    transform: translateX(0);
}

/* Hover/Active states for Text */
.toc-float:not(.collapsed) li:hover .toc-text { background: var(--component-bg-hover); color: var(--component-text-primary-hover) }
.toc-float:not(.collapsed) li.active .toc-text { background: var(--component-bg-highlight); color: var(--component-text-primary-highlight); font-weight: 500; font-variation-settings: 'wght' 500; }

</style>