<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import tocController from '../utils/tocController';
import CornerButton from './CornerButton.vue';
import MobileCollectionNav from './MobileCollectionNav.vue';
import type { CornerAction } from './CornerButton.vue';
import type { TocItem } from '../utils/toc';

const props = withDefaults(defineProps<{
  toc?: TocItem[];
  closeOnBackdrop?: boolean;
  collections?: any[];
  postTitles?: Record<string, string>;
  postId?: string;
}>(), {
  toc: () => [],
  closeOnBackdrop: true,
  collections: () => [],
  postTitles: () => ({}),
  postId: undefined,
});

function backToTop() {
  tocController.backToTop();
}

const isMobile = ref(false);
function checkMobile() {
  isMobile.value = typeof document !== 'undefined' && document.documentElement.classList.contains('is-mobile');
}
onMounted(() => { checkMobile(); });

// Check if current post actually belongs to any collection
function nodeContains(nodes: any[] | undefined, postId: string): boolean {
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (node?.type === 'post' && String(node.id) === postId) return true;
    if (node?.children?.length && nodeContains(node.children, postId)) return true;
  }
  return false;
}
const postInCollection = computed(() => {
  if (!props.postId || !props.collections.length) return false;
  return props.collections.some((c: any) => nodeContains(c.nodes, props.postId!));
});

const leftActions = computed<CornerAction[]>(() => {
  const list: CornerAction[] = [];
  if (props.toc.length > 0) {
    list.push({ id: 'toc', icon: 'menu', menu: props.toc, label: '目录' });
  }
  if (postInCollection.value) {
    list.push({ id: 'collection', icon: 'book', menu: [], label: '合集' });
  }
  return list;
});

const bttAction = (): CornerAction[] => [
  { id: 'btt', icon: 'arrow-up', label: '回到顶部', onClick: backToTop },
];
</script>

<template>
  <CornerButton v-if="isMobile && leftActions.length" :actions="leftActions" side="left" primary :closeOnBackdrop="closeOnBackdrop">
    <template v-if="postInCollection" #collectionPanel>
      <MobileCollectionNav :postId="postId" :collections="collections" :postTitles="postTitles" />
    </template>
  </CornerButton>
  <CornerButton :actions="bttAction()" side="right" />
</template>
