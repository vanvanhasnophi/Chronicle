<script setup lang="ts">
import { computed, ref } from 'vue';

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

const props = withDefaults(defineProps<{
  postId?: string;
  collections?: CollectionItem[];
  postTitles?: Record<string, string>;
}>(), {
  collections: () => [],
  postTitles: () => ({}),
});

const treeHtml = ref('');
const routePrefix = typeof window !== 'undefined'
  ? (window.location.pathname.startsWith('/en') ? '/en' : '/zh')
  : '/zh';

const matchedCollections = ref<CollectionItem[]>([]);
const activeIndex = ref(0);
const currentCollectionName = ref('');
const postTitleById = ref<Map<string, string>>(new Map());

// ---- Init data ----
function escapeHtml(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatCollectionName(name: string): string {
  const v = String(name || '').replace(/[-_]+/g, ' ').trim();
  return v || '合集';
}

function postUrl(id: string) {
  return `${routePrefix}/post/${encodeURIComponent(id)}`;
}

function resolvePostTitle(postId: string | number | undefined): string {
  return postTitleById.value.get(String(postId || '')) || String(postId || '');
}

function nodeContainsPost(nodes: CollectionNode[] | undefined, postId: string): boolean {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (node?.type === 'post' && String(node.id) === postId) return true;
    if (node?.children?.length && nodeContainsPost(node.children, postId)) return true;
  }
  return false;
}

function findAllCollectionsByPost(collections: CollectionItem[], postId: string): CollectionItem[] {
  const result: CollectionItem[] = [];
  for (const c of collections) {
    if (nodeContainsPost(c.nodes || [], postId)) result.push(c);
  }
  return result;
}

function renderTreeNodes(nodes: CollectionNode[] | undefined, path = 'r', activePostId = ''): string {
  if (!Array.isArray(nodes) || nodes.length === 0) return '';
  const items = nodes.map((node, index) => {
    const nodePath = `${path}-${index}`;
    if (node.type === 'post') {
      const pid = String(node.id || '');
      const title = escapeHtml(resolvePostTitle(pid));
      const isActive = activePostId && pid === activePostId;
      return `
        <li class="mcn-node-post">
          <div class="mini-card post${isActive ? ' active' : ''}" tabindex="0" role="link" data-post-id="${escapeHtml(pid)}"${isActive ? ' aria-current="true"' : ''}>
            <span class="mini-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg>
            </span>
            <span class="mini-title">${title}</span>
          </div>
        </li>`;
    }
    const groupTitle = escapeHtml(String(node.title || node.name || 'Group'));
    const childrenHtml = renderTreeNodes(node.children, nodePath, activePostId);
    const shouldExpand = Boolean(activePostId && nodeContainsPost(node.children, activePostId));
    return `
      <li class="mcn-node-group">
        <div class="mini-card group-header${shouldExpand ? ' active' : ''}" tabindex="0" role="button" data-group-key="${escapeHtml(nodePath)}">
          <span class="mini-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="mini-title">${groupTitle}</span>
          <span class="caret${shouldExpand ? ' expanded' : ''}" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        <div class="children-container"${shouldExpand ? '' : ' hidden'}>${childrenHtml}</div>
      </li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function buildTreeHtml(nodes: CollectionNode[] | undefined, activePostId = '') {
  treeHtml.value = renderTreeNodes(nodes, 'r', activePostId);
}

function initData() {
  const map = new Map<string, string>();
  if (props.postTitles) Object.entries(props.postTitles).forEach(([id, t]) => map.set(id, t));
  postTitleById.value = map;

  const matches = props.postId ? findAllCollectionsByPost(props.collections, props.postId) : [];
  matchedCollections.value = matches;
  activeIndex.value = 0;
  const active = matches.length > 0 ? matches[0] : (props.collections.length > 0 ? props.collections[0] : null);
  currentCollectionName.value = active?.name || '';
  if (active) buildTreeHtml(active.nodes || [], props.postId);
}
initData();

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
    children.hidden = !children.hidden;
    const expanded = !children.hidden;
    const caret = header.querySelector('.caret');
    if (caret) caret.classList.toggle('expanded', expanded);
    header.classList.toggle('active', expanded);
    return;
  }
  const postCard = target.closest('.mini-card.post') as HTMLElement | null;
  if (postCard) {
    const id = postCard.dataset.postId;
    if (id) window.location.href = postUrl(id);
  }
}

const navTitle = computed(() => formatCollectionName(currentCollectionName.value));
const hasCollection = computed(() => matchedCollections.value.length > 0);
</script>

<template>
  <div v-if="hasCollection" class="mcn-root">
    <!-- Header -->
    <div class="mcn-header">
      <span class="mcn-header-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M 12 2 L 21 8 L 12 14 L 3 8 Z"/>
          <path d="M 18 14 L 21 16 L 12 22 L 3 16 L 6 14"/>
        </svg>
      </span>
      <select v-if="matchedCollections.length > 1" v-model="activeIndex" class="mcn-switcher" @change="onSwitchCollection">
        <option v-for="(c, i) in matchedCollections" :key="c.slug || c.name" :value="i">{{ c.name }}</option>
      </select>
      <span v-else class="mcn-title">{{ navTitle }}</span>
    </div>

    <!-- Body -->
    <div class="mcn-body">
      <div v-if="!treeHtml" class="mcn-empty">无内容</div>
      <div v-else class="mcn-tree" @click="onTreeClick" v-html="treeHtml"></div>
    </div>
  </div>
</template>

<style scoped>
/* ---- Root (inside CornerButton panel, no fixed positioning) ---- */
.mcn-root {
  width: 100%;
}

/* ---- Header ---- */
.mcn-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px 12px;
  border-bottom: 1px solid var(--border-color-blur);
  margin-bottom: 8px;
}
.mcn-header-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  color: var(--component-text-secondary);
  flex-shrink: 0;
}
.mcn-title {
  font-weight: 600;
  font-variation-settings: 'wght' 600;
  font-size: 1rem;
  color: var(--component-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mcn-switcher {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  flex: 1;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right center;
  background-size: 14px;
}

/* ---- Body ---- */
.mcn-body {
  max-height: 44vh;
  overflow: auto;
  padding: 0 2px;
}

/* ---- Tree ---- */
.mcn-tree :deep(ul) {
  list-style: none;
  margin: 0;
  padding: 0;
}
.mcn-tree :deep(li) {
  margin: 7px 0;
}
.mcn-tree :deep(.mini-card) {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 8px;
  border-radius: 8px;
  font-size: 0.95rem;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s ease;
}
.mcn-tree :deep(.mini-card.post) {
  background: transparent;
}
.mcn-tree :deep(.mini-card.group-header) {
  font-weight: 600;
  color: var(--component-text-primary);
}
.mcn-tree :deep(.mini-title) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}
.mcn-tree :deep(.mini-icon) {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  color: var(--component-text-secondary);
  flex-shrink: 0;
}
.mcn-tree :deep(.mini-icon svg) {
  display: block;
  width: 16px;
  height: 16px;
}
.mcn-tree :deep(.caret) {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--component-text-secondary);
  margin-left: auto;
  flex-shrink: 0;
}
.mcn-tree :deep(.caret svg) {
  transition: transform 120ms linear;
  transform-origin: center;
  display: block;
  width: 16px;
  height: 16px;
}
.mcn-tree :deep(.caret.expanded svg) {
  transform: rotate(180deg);
}
.mcn-tree :deep(.children-container) {
  margin-left: 12px;
  padding-left: 12px;
}
.mcn-tree :deep(.children-container[hidden]) {
  display: none;
}
.mcn-tree :deep(.mini-card:hover) {
  background: var(--component-bg-hover);
}
.mcn-tree :deep(.mini-card.group-header.active) {
  background: var(--component-bg-active);
}
.mcn-tree :deep(.mini-card.post.active) {
  background: var(--component-bg-active);
  color: var(--component-text-primary-hover);
  border-color: var(--component-text-primary-hover);
}
.mcn-empty {
  color: var(--component-text-secondary);
  font-size: 0.95rem;
  padding: 4px 0;
}
</style>
