<template>
  <div ref="root" class="collection-nav" :class="{ collapsed: isCollapsed, expanded: isExpanded }"
    @pointerenter="onPointerEnter" @pointerleave="onPointerLeave">
    <div class="collection-nav-header">
      <div class="collection-nav-title">
        <span class="collection-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
            <path d="M12 11 Q16 13 20 16 Q16 19 12 21 Q8 19 4 16 Q8 13 12 11 Z" stroke="currentColor" stroke-width="1.5"
              stroke-linejoin="round" stroke-linecap="round" fill="none" />
            <path d="M12 5 Q16 7 20 10 Q16 13 12 15 Q8 13 4 10 Q8 7 12 5 Z" :fill="'var(--component-bg-blur)'"
              stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        </span>
        <select v-if="matchedCollections.length > 1" v-model="activeIndex" class="collection-switcher" @change="onSwitchCollection">
          <option v-for="(c, i) in matchedCollections" :key="c.slug || c.name" :value="i">{{ c.name }}</option>
        </select>
        <span v-else class="collection-title-text">{{ navTitle }}</span>
      </div>
    </div>

    <div class="collection-nav-body">
      <div v-if="loading" class="loading">{{ loadingText }}</div>
      <div v-else-if="!treeHtml" class="empty">{{ emptyText }}</div>
      <div v-else ref="treeRoot" class="collection-tree" @click="onTreeClick" @keydown="onTreeKeydown"
        v-html="treeHtml"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getClientLocale, getTranslation, type Locale } from '../utils/i18n';

type CollectionNode = {
  type: 'group' | 'post';
  id?: string | number;
  title?: string;
  name?: string;
  children?: CollectionNode[];
};

type CollectionItem = {
  name: string;
  slug?: string;
  description?: string;
  nodes?: CollectionNode[];
};

// Dev-only guard: some mixed dev setups may miss Vue HMR runtime global.
if (import.meta.env.DEV) {
  const g = globalThis as any;
  if (!g.__VUE_HMR_RUNTIME__) {
    g.__VUE_HMR_RUNTIME__ = {
      createRecord: () => true,
      rerender: () => { },
      reload: () => { },
    };
  }
}

const props = withDefaults(defineProps<{ postId?: string; mountToBody?: boolean; collections?: CollectionItem[]; postTitles?: Record<string, string> }>(), { mountToBody: true });

const root = ref<HTMLElement | null>(null);
const treeRoot = ref<HTMLElement | null>(null);
const loading = ref(false);
const treeHtml = ref('');
const routePrefix = ref('/zh');
const locale = ref<Locale>('zh-CN');

const currentCollectionName = ref('');
const matchedCollections = ref<CollectionItem[]>([]);
const activeIndex = ref(0);
const postTitleById = ref<Map<string, string>>(new Map());

const NAV_WIDTH = 260;
const VISIBLE_EDGE = 10;

let originalPaddingLeft: string | null = null;
let pushed = false;
let handleAstroPageLoad: (() => void) | null = null;

let collapseTimer: ReturnType<typeof setTimeout> | null = null;
const isCollapsed = ref(false);
const isExpanded = ref(false);

const loadingText = computed(() => getTranslation(locale.value, 'blog.loadingPosts'));
const emptyText = computed(() => getTranslation(locale.value, 'search.noResults'));

const navTitle = computed(() => {
  return formatCollectionName(currentCollectionName.value);
});

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCollectionName(name: string): string {
  const value = String(name || '').replace(/[-_]+/g, ' ').trim();
  return value || getTranslation(locale.value, 'nav.collection');
}

function postUrl(id: string) {
  return `${routePrefix.value}/post/${encodeURIComponent(id)}`;
}

function resolvePostTitle(postId: string | number | undefined): string {
  const id = String(postId || '');
  return postTitleById.value.get(id) || id;
}

function nodeContainsPost(nodes: CollectionNode[] | undefined, postId: string): boolean {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (node?.type === 'post' && String(node.id) === postId) {
      return true;
    }
    if (node?.children?.length && nodeContainsPost(node.children, postId)) {
      return true;
    }
  }
  return false;
}

function findAllCollectionsByPost(collections: CollectionItem[], postId: string): CollectionItem[] {
  const result: CollectionItem[] = [];
  for (const collection of collections) {
    if (nodeContainsPost(collection.nodes || [], postId)) {
      result.push(collection);
    }
  }
  return result;
}

function findCollectionByPost(collections: CollectionItem[], postId: string): CollectionItem | null {
  for (const collection of collections) {
    if (nodeContainsPost(collection.nodes, postId)) {
      return collection;
    }
  }
  return null;
}

function renderTreeNodes(nodes: CollectionNode[] | undefined, path = 'r', activePostId = ''): string {
  if (!Array.isArray(nodes) || nodes.length === 0) return '';
  const items = nodes.map((node, index) => {
    const nodePath = `${path}-${index}`;
    if (node.type === 'post') {
      const postId = String(node.id || '');
      const title = escapeHtml(resolvePostTitle(postId));
      const isActive = activePostId && postId === activePostId;
      return `
        <li class="node-post">
          <div class="mini-card post${isActive ? ' active' : ''}" tabindex="0" role="link" data-post-id="${escapeHtml(postId)}"${isActive ? ' aria-current="true"' : ''}>
            <span class="mini-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg>
            </span>
            <span class="mini-title">${title}</span>
          </div>
        </li>
      `;
    }

    const groupTitle = escapeHtml(String(node.title || node.name || 'Group'));
    const childrenHtml = renderTreeNodes(node.children, nodePath, activePostId);
    const shouldExpand = Boolean(activePostId && nodeContainsPost(node.children, activePostId));
    const headerActiveClass = shouldExpand ? ' active' : '';
    const caretExpandedClass = shouldExpand ? ' expanded' : '';
    const childrenHiddenAttr = shouldExpand ? '' : ' hidden';
    return `
      <li class="node-group">
        <div class="mini-card group-header${headerActiveClass}" tabindex="0" role="button" data-group-key="${escapeHtml(nodePath)}">
          <span class="mini-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="mini-title">${groupTitle}</span>
          <button class="caret${caretExpandedClass}" type="button" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
        <div class="children-container"${childrenHiddenAttr}>
          ${childrenHtml}
        </div>
      </li>
    `;
  });
  return `<ul>${items.join('')}</ul>`;
}

function buildTreeHtml(nodes: CollectionNode[] | undefined, activePostId = '') {
  treeHtml.value = renderTreeNodes(nodes, 'r', activePostId);
}

function onSwitchCollection() {
  const c = matchedCollections.value[activeIndex.value];
  if (c) {
    currentCollectionName.value = c.name || '';
    buildTreeHtml(c.nodes || [], props.postId);
  }
}

function onTreeClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target) return;

  const header = target.closest('.group-header') as HTMLElement | null;
  if (header) {
    const li = header.parentElement;
    const children = li?.querySelector(':scope > .children-container') as HTMLElement | null;
    if (!children) return;
    const wasHidden = children.hidden;
    children.hidden = !wasHidden;
    const expanded = !children.hidden;
    const caret = header.querySelector('.caret');
    if (caret) caret.classList.toggle('expanded', expanded);
    header.classList.toggle('active', expanded);
    return;
  }

  const postCard = target.closest('.mini-card.post') as HTMLElement | null;
  if (postCard) {
    const id = postCard.dataset.postId;
    if (!id) return;
    window.location.href = postUrl(id);
  }
}

function onTreeKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target as HTMLElement;
  if (!target) return;

  const header = target.closest('.group-header') as HTMLElement | null;
  if (header) {
    event.preventDefault();
    header.click();
    return;
  }

  const postCard = target.closest('.mini-card.post') as HTMLElement | null;
  if (postCard) {
    event.preventDefault();
    postCard.click();
  }
}

async function loadCollections() {
  loading.value = true;

  // Use build-time embedded data if provided (SSG), otherwise fetch from API
  if (props.collections) {
    const postMap = new Map<string, string>();
    if (props.postTitles) {
      Object.entries(props.postTitles).forEach(([id, title]) => postMap.set(id, title));
    }
    postTitleById.value = postMap;
    // Find all collections containing this post (for multi-collection support)
    const matches = props.postId ? findAllCollectionsByPost(props.collections, props.postId) : [];
    matchedCollections.value = matches;
    activeIndex.value = 0;
    const active = matches.length > 0 ? matches[0] : (props.collections.length > 0 ? props.collections[0] : null);
    currentCollectionName.value = active?.name || '';
    if (active) { buildTreeHtml(active.nodes || [], props.postId); }
    else { treeHtml.value = ''; }
    loading.value = false;
    return;
  }

  // Runtime fallback: fetch from API
  try {
    const [collectionRes, postsRes] = await Promise.all([
      fetch(`/api/collections?t=${Date.now()}`, { cache: 'no-store' }),
      fetch(`/api/posts?t=${Date.now()}`, { cache: 'no-store' }),
    ]);

    const postMap = new Map<string, string>();
    if (postsRes.ok) {
      const postsData = await postsRes.json();
      const posts = Array.isArray(postsData)
        ? postsData
        : Array.isArray(postsData?.posts)
          ? postsData.posts
          : [];
      posts.forEach((post: any) => {
        const id = String(post?.id || '');
        const title = String(post?.title || '').trim();
        if (id) postMap.set(id, title || id);
      });
    }
    postTitleById.value = postMap;

    if (!collectionRes.ok) {
      throw new Error('fetch collections failed');
    }

    const collectionData = await collectionRes.json();
    const collections: CollectionItem[] = Array.isArray(collectionData?.collections)
      ? collectionData.collections
      : Array.isArray(collectionData)
        ? collectionData
        : [];

    const postId = String(props.postId || '');
    const matches = postId ? findAllCollectionsByPost(collections, postId) : [];
    matchedCollections.value = matches;
    activeIndex.value = 0;
    const found = matches.length > 0 ? matches[0] : null;
    currentCollectionName.value = found?.name || '';
    buildTreeHtml(found?.nodes, postId);
  } catch (e) {
    currentCollectionName.value = '';
    treeHtml.value = '';
  } finally {
    loading.value = false;
    updatePlacement();
  }
}

function updatePlacement() {
  const w = window.innerWidth;
  if (w >= 1200) {
    isCollapsed.value = false;
    isExpanded.value = true;
    const container = document.querySelector('.post-detail-container') as HTMLElement | null;
    if (container && !pushed) {
      originalPaddingLeft = container.style.paddingLeft || '';
      container.style.paddingLeft = `${NAV_WIDTH + 20}px`;
      pushed = true;
    }
  } else {
    isCollapsed.value = true;
    isExpanded.value = false;
    const container = document.querySelector('.post-detail-container') as HTMLElement | null;
    if (container && pushed) {
      container.style.paddingLeft = originalPaddingLeft || '';
      pushed = false;
      originalPaddingLeft = null;
    }
  }
}

function onPointerEnter() {
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }
  isCollapsed.value = false;
  isExpanded.value = true;
}

function onPointerLeave() {
  if (window.innerWidth < 1200) {
    collapseTimer = setTimeout(() => {
      isCollapsed.value = true;
      isExpanded.value = false;
    }, 700);
  }
}

function handleResize() {
  updatePlacement();
}

function detectLocaleAndPrefix() {
  const path = window.location.pathname;
  if (path.startsWith('/en/')) {
    locale.value = 'en';
    routePrefix.value = '/en';
    return;
  }
  if (path.startsWith('/zh/')) {
    locale.value = 'zh-CN';
    routePrefix.value = '/zh';
    return;
  }
  locale.value = getClientLocale();
  routePrefix.value = locale.value === 'en' ? '/en' : '/zh';
}

function moveToBody() {
  if (!props.mountToBody) return;
  const el = root.value;
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
}

onMounted(() => {
  detectLocaleAndPrefix();
  moveToBody();
  loadCollections();
  window.addEventListener('resize', handleResize);
  handleAstroPageLoad = () => moveToBody();
  document.addEventListener('astro:page-load', handleAstroPageLoad);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  if (handleAstroPageLoad) {
    document.removeEventListener('astro:page-load', handleAstroPageLoad);
    handleAstroPageLoad = null;
  }
  if (collapseTimer) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  const container = document.querySelector('.post-detail-container') as HTMLElement | null;
  if (container && pushed) {
    container.style.paddingLeft = originalPaddingLeft || '';
    pushed = false;
    originalPaddingLeft = null;
  }
  // if we mounted the root to body, remove it to avoid leaving orphaned nodes
  try {
    const el = root.value;
    if (el && el.parentElement === document.body) {
      document.body.removeChild(el);
    }
  } catch (e) { }
});
</script>

<style scoped>
.collection-nav {
  --nav-width: 260px;
  --visible-edge: 0px;
  width: var(--nav-width);
  border-radius: 8px;
  min-height: 200px;
  overflow: auto;
  transition: transform 280ms ease, opacity 280ms ease;
  z-index: 1200;
}

.collection-nav .collection-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.8rem;
  min-height: 32px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.collection-nav .collection-nav-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-variation-settings: 'wght' 700;
  color: var(--component-text-primary);
}

.collection-nav .collection-title-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--component-text-secondary);
  flex: 0 0 20px;
  transform: translateY(-1px);
}

.collection-nav .collection-title-icon svg {
  width: 20px;
  height: 20px;
  display: block;
}

.collection-nav .collection-switcher {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  color: inherit;
  font-size: inherit;
  font-family: inherit;
  font-weight: inherit;
  cursor: pointer;
  min-width: 0;
  width: 200px;
  outline: none;
  padding: 0 10px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: translateY(1px);
  transition: color 0.15s;
  /* Chevron arrow */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 16px;
}

.collection-nav .collection-switcher:hover {
  color: var(--accent-color);
}


.collection-nav .collection-title-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collection-nav .collection-nav-body {
  padding: 0.6rem;
  max-height: 66vh;
  overflow: auto;
}

.collection-tree :deep(ul) {
  list-style: none;
  margin: 0;
  padding: 0;
}

.collection-tree :deep(li) {
  margin: 8px 0;
  position: relative;
}

.collection-tree :deep(.mini-card) {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.9rem;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s ease, transform 0.08s ease, border-color 0.12s ease;
}

.collection-tree :deep(.mini-card.post) {
  background: transparent;
}

.collection-tree :deep(.mini-card.group-header) {
  font-weight: 700;
  color: var(--component-text-primary);
}

.collection-tree :deep(.mini-title) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}

.collection-tree :deep(.mini-icon) {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--component-text-secondary);
  flex: 0 0 16px;
}

.collection-tree :deep(.mini-icon svg) {
  display: block;
  width: 16px;
  height: 16px;
}

.collection-tree :deep(.caret) {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: transparent;
  border: 0;
  color: var(--component-text-secondary);
  margin-left: auto;
  min-width: 16px;
  min-height: 16px;
  padding: 0;
}

.collection-tree :deep(.caret svg) {
  transition: transform 120ms linear;
  transform-origin: center;
  display: block;
  width: 16px;
  height: 16px;
}

.collection-tree :deep(.caret.expanded svg) {
  transform: rotate(180deg);
}

.collection-tree :deep(.children-container) {
  margin-left: 12px;
  padding-left: 12px;
}

.collection-tree :deep(.children-container[hidden]) {
  display: none;
}

.collection-tree :deep(.mini-card.group-header:hover) {
  background: var(--component-bg-hover);
}

.collection-tree :deep(.mini-card.group-header.active) {
  background: var(--component-bg-active);
}

.collection-tree :deep(.mini-card.post:hover) {
  background: var(--component-bg-hover);
}

.collection-tree :deep(.mini-card.post.active) {
  background: var(--component-bg-active);
  color: var(--component-text-primary-hover);
  border-color: var(--component-text-primary-hover);
}

.collection-tree :deep(.mini-card.post.active .caret svg) {
  color: var(--component-text-primary-hover);
}

.collection-tree :deep(.mini-card.post.active .mini-icon svg) {
  color: var(--component-text-primary-hover);
}

.loading,
.empty {
  padding: 0.5rem 0.35rem;
  color: var(--component-text-secondary);
  font-size: 0.92rem;
}

@media (min-width: 1200px) {
  .collection-nav {
    position: fixed;
    top: 120px;
    left: calc(15vw - 160px);
    transform: translateX(0);
  }
}

@media (max-width: 1199px) {
  .collection-nav {
    position: fixed;
    top: 90px;
    left: 20px;
    background: var(--component-bg-blur);
    backdrop-filter: blur(12px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);

  }

  .collection-nav.collapsed {
    opacity: 0.5;
    transform: translateX(calc(-1 * (var(--nav-width) - var(--visible-edge))));
  }

  .collection-nav.expanded {
    transform: translateX(0);
  }
}
</style>

