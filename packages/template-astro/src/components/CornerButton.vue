<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import tocController, { setTocGetter } from '../utils/tocController';
import type { TocItem } from '../utils/toc';

export interface CornerAction {
  id: string;
  icon: 'menu' | 'arrow-up' | string;
  label?: string;
  menu?: TocItem[];
  onClick?: () => void;
}

const props = withDefaults(defineProps<{
  actions?: CornerAction[];
  side?: 'left' | 'right';
  primary?: boolean;
  closeOnBackdrop?: boolean;
}>(), {
  actions: () => [],
  side: 'right',
  primary: false,
  closeOnBackdrop: true,
});

// ---- Auto-detect variant ----
const isCapsule = computed(() => props.actions.length >= 2);
const capsuleWidth = computed(() => {
  if (!isCapsule.value) return undefined;
  const count = props.actions.length;
  return `${count * 50 + (count - 1) * 1}px`; // icons + dividers
});
const menuActions = computed(() => props.actions.filter(a => a.menu));
const hasMenu = computed(() => menuActions.value.length > 0);

// ---- Panel state ----
const open = ref(false);
const activeActionId = ref<string>('');
const animating = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

// ---- Back-to-top visibility ----
const showBackToTop = computed(() => tocController.state.showBackToTop);
const isBttOnly = computed(() => props.actions.length === 1 && props.actions[0].id === 'btt');

// ---- tocController ----
const liveActiveId = computed(() => tocController.state.liveActiveId);
const tocItems = computed(() => {
  const toc = props.actions.find(a => a.id === 'toc');
  return toc?.menu || [];
});

// ---- DOM relocation ----
let handleAstroPageLoad: (() => void) | null = null;
function moveToBody() {
  const el = rootRef.value;
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
}

// ---- Morph animation ----
/** Safety net in case transitionend fails to fire.
    Respects --transition-duration so debugging slow-mo doesn't cause early cutoff. */
function getSafetyTimeout(): number {
  if (typeof document === 'undefined') return 1000;
  const td = getComputedStyle(document.documentElement).getPropertyValue('--transition-duration').trim();
  return 1000 * (parseFloat(td) || 1);
}
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
/** Stored ref to the current transitionend handler — needed so we can detach it on interrupt. */
let finishHandler: ((e: TransitionEvent) => void) | null = null;
function clearTimers() {
  if (safetyTimer !== null) { clearTimeout(safetyTimer); safetyTimer = null; }
}

function animateOpen() {
  const el = menuRef.value;
  if (!el) return;
  animating.value = true;
  el.style.transition = '';
  el.style.overflow = '';
  open.value = true;

  const onFinish = () => {
    clearTimers();
    animating.value = false;
    finishHandler = null;
    el.removeEventListener('transitionend', onTransitionEnd);
    tocController.computeLiveActiveFromBaseline();
    ensureActiveItemVisible();
  };
  // Wait for max-height, not transform (0.15s) — otherwise onFinish fires
  // long before the morph completes and display:none kills the layout mid-animation.
  function onTransitionEnd(e: TransitionEvent) {
    if (e.propertyName === 'max-height') onFinish();
  }
  finishHandler = onTransitionEnd;
  el.addEventListener('transitionend', onTransitionEnd);
  safetyTimer = setTimeout(() => { safetyTimer = null; onFinish(); }, getSafetyTimeout());
}

function animateClose() {
  const el = menuRef.value;
  if (!el) { open.value = false; return; }
  clearTimers();
  animating.value = true;
  el.style.transition = '';
  el.style.overflow = 'hidden';
  open.value = false;
  const onFinish = () => {
    clearTimers();
    activeActionId.value = ''; // clear AFTER animation, so content stays in layout during shrink
    animating.value = false;
    finishHandler = null;
    el.style.overflow = '';
    el.removeEventListener('transitionend', onTransitionEnd);
  };
  function onTransitionEnd(e: TransitionEvent) {
    if (e.propertyName === 'max-height') onFinish();
  }
  finishHandler = onTransitionEnd;
  el.addEventListener('transitionend', onTransitionEnd);
  safetyTimer = setTimeout(() => { safetyTimer = null; onFinish(); }, getSafetyTimeout());
}

/** Cancel any in-flight morph animation, clean up listeners/timers, and swap content immediately. */
function interruptAndSwap(nextActionId: string) {
  const el = menuRef.value;
  if (el && finishHandler) {
    el.removeEventListener('transitionend', finishHandler);
    finishHandler = null;
    el.style.transition = '';
    el.style.overflow = '';
  }
  clearTimers();
  animating.value = false;
  activeActionId.value = nextActionId;
  open.value = true;
}

// ---- Interaction ----
function onSlotClick(action: CornerAction, event: MouseEvent) {
  if (action.menu) {
    if (open.value && activeActionId.value === action.id) {
      // Toggle close — same menu
      animateClose();
    } else if (animating.value) {
      // Interrupt in-flight animation: another menu wants to open (or same menu
      // was clicked while closing → cancel the close). Swap content immediately
      // and reverse the morph direction from wherever it is.
      event.stopPropagation();
      interruptAndSwap(action.id);
    } else {
      // Normal open
      event.stopPropagation();
      activeActionId.value = action.id;
      if (!open.value) animateOpen();
    }
  } else if (action.onClick) {
    action.onClick();
  }
}

function onMenuClick(event: MouseEvent) {
  if (animating.value) {
    // Mid-open → close; mid-close → reverse to open
    if (open.value) {
      animateClose();
    } else {
      interruptAndSwap(activeActionId.value);
    }
    return;
  }
  if (!open.value) {
    event.stopPropagation();
    animateOpen();
  }
}

function onBackdropClick() {
  if (!open.value) return; // closed or mid-close — nothing to do
  if (!props.closeOnBackdrop) return;
  animateClose();
}

function onContentClick(event: MouseEvent) {
  event.stopPropagation();
}

function onItemClick(id: string) {
  animateClose();
  scrollToHeading(id);
}

function scrollToHeading(id: string) {
  try {
    tocController.state.liveActiveId = id;
    const desired = `#${id}`;
    if (typeof window === 'undefined') return;
    const current = window.location.hash || '';
    if (current !== desired) {
      try { history.pushState(null, '', desired); } catch (e) { window.location.hash = desired; }
      setTimeout(() => window.dispatchEvent(new Event('hashchange')), 0);
    } else {
      setTimeout(() => window.dispatchEvent(new Event('hashchange')), 0);
    }
    try { tocController.scrollToHeading(id); } catch (e) { /* ignore */ }
    tocController.pauseLiveSync(1200);
  } catch (_error) { /* ignore */ }
}

// ---- Lifecycle ----
onMounted(() => {
  moveToBody();
  handleAstroPageLoad = () => moveToBody();
  document.addEventListener('astro:page-load', handleAstroPageLoad);
  setTocGetter(() => tocItems.value);
});

onBeforeUnmount(() => {
  clearTimers();
  if (menuRef.value && finishHandler) {
    menuRef.value.removeEventListener('transitionend', finishHandler);
    finishHandler = null;
  }
  if (handleAstroPageLoad) {
    document.removeEventListener('astro:page-load', handleAstroPageLoad);
    handleAstroPageLoad = null;
  }
});

function ensureActiveItemVisible() {
  const nav = listRef.value;
  if (!nav) return;
  const el = nav.querySelector('li.active') as HTMLElement | null;
  if (!el) return;
  const nr = nav.getBoundingClientRect();
  const ar = el.getBoundingClientRect();
  if (ar.top >= nr.top + nr.height * 0.2 && ar.bottom <= nr.bottom - nr.height * 0.2) return;
  const t = nav.scrollTop + (ar.top - nr.top) - nav.clientHeight / 2 + ar.height / 2;
  nav.scrollTo({ top: Math.min(Math.max(0, nav.scrollHeight - nav.clientHeight), Math.max(0, t)), behavior: 'smooth' });
}

// ---- Icon render helpers ----
function iconSvg(name: string) {
  if (name === 'menu' || name === 'toc') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  }
  if (name === 'arrow-up' || name === 'btt') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
  }
  if (name === 'collection' || name === 'book') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 12 2 L 21 8 L 12 14 L 3 8 Z"/><path d="M 18 14 L 21 16 L 12 22 L 3 16 L 6 14"/></svg>`;
  }
  return '';
}
</script>

<template>
  <div v-if="actions.length" ref="rootRef" class="corner-button-root">
    <!-- Backdrop (only when menu panel is open) -->
    <div v-if="hasMenu" v-show="open" class="cb-backdrop" @click="onBackdropClick"></div>

    <!-- The morphing button/capsule element -->
    <div
      ref="menuRef"
      class="corner-button"
      :class="{
        'is-primary': primary,
        'is-capsule': isCapsule,
        'has-menu': hasMenu,
        'is-btt-only': isBttOnly,
        'btt-visible': isBttOnly && showBackToTop,
        open,
        'side-left': side === 'left',
        'side-right': side === 'right',
      }"
      :style="capsuleWidth && !open ? { width: capsuleWidth } : undefined"
      @click="hasMenu && !isCapsule ? onMenuClick($event) : undefined"
      role="dialog"
      :aria-label="open ? '目录' : undefined"
      :aria-expanded="open ? 'true' : undefined"
    >
      <!-- Layer 1: Icon face (absolute, fades out when open) -->
      <div class="cb-icons" :class="{ 'is-capsule': isCapsule }">
        <template v-for="(action, i) in actions" :key="action.id">
          <div v-if="i > 0 && isCapsule" class="cb-divider"></div>
          <button
            class="cb-slot"
            :title="action.label"
            @click="onSlotClick(action, $event)"
          >
            <span v-html="iconSvg(action.icon)"></span>
          </button>
        </template>
      </div>

      <!-- Layer 2: Content face — always in DOM (v-show, not v-if) so height:auto
           resolves to a stable value and content switches don't cause layout jumps. -->
      <div v-show="hasMenu" class="cb-content" @click="onContentClick">
        <ul v-show="activeActionId === 'toc'" ref="listRef" class="cb-menu-list">
          <li
            v-for="item in tocItems"
            :key="item.id"
            :class="[`toc-level-${item.level}`, { active: item.id === liveActiveId }]"
          >
            <a href="#" @click.prevent="onItemClick(item.id)">
              <span class="toc-text">{{ item.text }}</span>
            </a>
          </li>
        </ul>
        <div v-show="activeActionId === 'collection'">
          <slot name="collectionPanel" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- Backdrop ---- */
.cb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1399;
  background: transparent;
  pointer-events: auto;
}



/* ---- Base: single circle button (matches old .corner-button, non-primary) ---- */
.corner-button {
  position: fixed;
  bottom: 30px;
  width: 50px;
  height: 50px;
  max-height: 50px;
  border-radius: 50px;
  background: var(--component-bg-blur-alt);
  border: 1px solid var(--border-color-blur);
  color: var(--component-text-primary);
  box-shadow: var(--shadow-elev-2);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  z-index: 300;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  pointer-events: auto;
  transform: translateZ(0);
  line-height: normal;
  text-align: left;
  height: auto !important;
  min-height: 50px;
  /* GPU layer promotion: translateZ(0) creates a compositor layer so
     backdrop-filter runs on the GPU instead of forcing CPU repaints.
     contain: layout style isolates layout changes to this subtree —
     when width/height morph, the browser doesn't re-layout the whole page. */
  will-change: transform;
  contain: layout style;
  /* Morph transition */
  transition: left calc(700ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              bottom calc(600ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              width calc(300ms * var(--transition-duration)) cubic-bezier(0.12, 0.9, 0.24, 1),
              height calc(200ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              max-height calc(200ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              border-radius calc(300ms * var(--transition-duration)) cubic-bezier(0.1, 0.2, 0.36, 1),
              background calc(360ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              border-color calc(700ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              transform 0.15s ease-out;
  display: block;
  overflow: hidden;
  max-height: 50px;

}

.corner-button.side-left  { left: 30px; right: auto; }
.corner-button.side-right { right: 30px; left: auto; }

/* Primary variant — accent colors, matches old .corner-button.primary */
.corner-button.is-primary {
  background: var(--component-bg-accent-ghost);
  border: 1px solid var(--component-bg-accent-ghost);
  color: var(--component-text-accent-ghost);
}

/* Hover — desktop only */
html:not(.is-mobile) .corner-button:not(.open):hover {
  transform: scale(1.1);
}
html:not(.is-mobile) .corner-button.is-primary:not(.open):hover {
  background: var(--component-bg-accent-hover);
  border-color: var(--component-bg-accent-hover);
  color: var(--component-text-accent-hover);
}

/* Active — mobile only */
html.is-mobile .corner-button:not(.open):active {
  transform: scale(1.3);
  filter: brightness(1.5);
}
html.is-mobile .corner-button.is-primary:not(.open):active {
  border-color: color-mix(in srgb, var(--component-bg-accent-ghost) 80%, #fff6);
  background: color-mix(in srgb, var(--component-bg-accent-ghost) 80%, #fff6);
}

/* ---- Open state: full panel ---- */
.corner-button.open {
  left: 30px;
  bottom: 90px;
  width: calc(100vw - 60px) !important;
  max-height: 60vh;
  border-radius: 12px;
  background: var(--component-bg-blur);
  border-color: var(--border-color);
  color: var(--component-text-primary);
  box-shadow: var(--shadow-elev-3);
  z-index: 1400 !important;
  cursor: default;
  overflow: auto;
  /* Morph transition (open) */
  transition: left calc(700ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              bottom calc(600ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              width calc(360ms * var(--transition-duration)) cubic-bezier(0.22, 0.3, 0.36, 1),
              height calc(500ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              max-height calc(500ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              border-radius calc(360ms * var(--transition-duration)) cubic-bezier(0.1, 0.9, 0.36, 1),
              background calc(360ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              border-color calc(700ms * var(--transition-duration)) cubic-bezier(0.22, 0.9, 0.36, 1),
              transform 0.15s ease-out;

}
.corner-button.open:hover,
.corner-button.open:active {
  transform: none !important;
  filter: none !important;
  background: var(--component-bg-blur);
  border-color: var(--border-color);
  color: var(--component-text-primary);
}

.corner-button .toc-text {
  text-align: left;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--component-text-primary);
  padding: 0 .5rem;
}

/* ---- Capsule hover/active ---- */
html.is-mobile .corner-button.is-capsule:not(.open):active{
  transform: scale(1.15);
}
html:not(.is-mobile) .corner-button.is-capsule:not(.open):hover{
  transform: scale(1.1);
}

/* ---- BTT: entire button slides down out of view when at top ---- */
.corner-button.is-btt-only {
  opacity: 0;
  pointer-events: none;
  transform: translateY(20px);
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.corner-button.is-btt-only.btt-visible {
  opacity: 1;
  pointer-events: auto;
  transform: none;
}

/* ---- Slots ---- */
.cb-slot {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  line-height: 0;
}

/* ---- Layer 1 (top): Icon face — absolute overlay, fills container, fades out when open ---- */
.cb-icons {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  pointer-events: auto;
  transition: opacity calc(200ms * var(--transition-duration))  ease;
  z-index: 1;
}
.corner-button.open .cb-icons {
  opacity: 0;
  pointer-events: none;
}

/* ---- Layer 0 (bottom): Content face — in flow, sizes the container, fades in when open ---- */
.cb-content {
  position: relative;
  opacity: 0;
  pointer-events: none;
  transition: opacity calc(120ms * var(--transition-duration)) ease;
  padding: 8px;
  z-index: 0;
}
.corner-button.open .cb-content {
  opacity: 1;
  pointer-events: auto;
  transition: opacity calc(600ms * var(--transition-duration)) ease;
}

/* Capsule: icon row always fills container (absolute), content drives height (relative).
   Capsule width is set via inline :style, so icons don't need to be in-flow. */
.corner-button.is-capsule .cb-icons {
  flex-direction: row;
}

/* ---- Menu list ---- */
.cb-menu-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cb-menu-list li {
  padding: 6px 4px;
  border-radius: 6px;
}
.cb-menu-list li.active {
  background: var(--component-bg-hover);
}
.cb-menu-list li a {
  color: inherit;
  text-decoration: none;
  display: block;
}
.cb-menu-list::-webkit-scrollbar {
  background: transparent;
  width: 3px;
  height: 3px;
}
.cb-menu-list::-webkit-scrollbar-track {
  background: inherit;
  width: 5px;
  height: 5px;
}


</style>
