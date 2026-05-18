<template>
  <section class="card-list-editor card">
    <div class="card-list-editor__toolbar">
      <div class="card-list-editor__text">
        <strong>{{ t('settings.cardListTitle') }}</strong>
        <p>{{ t('settings.cardListHint') }}</p>
      </div>

      <button class="primary" type="button" style="flex-shrink: 0;" @click="emit('add')">
        {{ t('settings.friendCardAdd') }}
      </button>
    </div>

    <div v-if="cards.length === 0" class="empty-state">
      {{ t('settings.friendCardEmpty') }}
    </div>

    <ul v-else class="card-list">
      <li v-for="(card, index) in cards" :key="card._localId || `${card.name}-${index}`" class="card-list__item"
        :class="{ dragging: draggingIndex === index }" draggable="true" @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index, $event)" @drop.prevent="onDrop(index)" @dragend="onDragEnd">
        <button type="button" class="drag-handle" :title="t('settings.friendCardDragHint')"
          :aria-label="t('settings.friendCardDragHint')" @mousedown.stop>
          <svg class="handle-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div class="card-list__item-content">
          <div class="card-list__preview">
            <div v-if="props.showImage" class="card-list__media">
              <img v-if="card.avatar" :src="card.avatar" :alt="card.name || ''" loading="lazy" />
              <div v-else class="card-list__media-placeholder"></div>
            </div>
            <div class="card-list__content">
              <div class="card-list__heading">
                <strong>{{ card.name || t('settings.friendCardUnnamed') }}</strong>
              </div>
              <p class="card-list__intro">
                <a v-if="card.homeUrl" :href="card.homeUrl" target="_blank" rel="noopener noreferrer">{{ card.homeUrl
                  }}</a>
                <span v-else>{{ card.intro || t('settings.friendCardNoIntro') }}</span>
              </p>
              <div class="card-list__meta">
                <span v-if="card.storyPostId" class="card-list__story">{{ t('settings.friendCardStoryBound') }}</span>
              </div>
            </div>
          </div>

          <div class="card-list__actions">
            <button type="button" class="icon-btn edit-btn" @click="emit('edit', index)"
              :title="t('settings.friendCardEdit')" :aria-label="t('settings.friendCardEdit')" v-html="Icons.edit">

            </button>
            <button type="button" class="icon-btn delete-btn" @click="emit('remove', index)"
              :title="t('settings.friendCardRemove')" :aria-label="t('settings.friendCardRemove')" v-html="Icons.trash">

            </button>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icons } from '../../utils/icons'

type FriendCardStyle = 'left-sm' | 'left-lg' | 'top-lg'

type FriendCard = {
  _localId: string
  style: FriendCardStyle
  name: string
  avatar: string
  intro: string
  homeUrl: string
  storyPostId: string
}

const props = withDefaults(defineProps<{
  cards: FriendCard[]
  showImage?: boolean
  primaryRequired?: boolean
  secondaryOptional?: boolean
}>(), {
  showImage: true,
  primaryRequired: false,
  secondaryOptional: true,
})

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', index: number): void
  (e: 'remove', index: number): void
  (e: 'move', from: number, to: number): void
}>()

const { t } = useI18n()
const draggingIndex = ref<number | null>(null)


// Preview style for list is fixed and does not reflect per-card or global styles
function getPreviewStyle(_: FriendCard): FriendCardStyle {
  return 'left-sm'
}

function onDragStart(index: number, event: DragEvent) {
  draggingIndex.value = index
  try {
    event.dataTransfer?.setData('text/plain', String(index))
    const target = event.currentTarget as HTMLElement | null
    if (target) event.dataTransfer?.setDragImage(target, 24, 24)
  } catch (e) { }
}

function onDragOver(index: number, event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.dropEffect = 'move'
  if (draggingIndex.value === null || draggingIndex.value === index) return
}

function onDrop(index: number) {
  if (draggingIndex.value === null || draggingIndex.value === index) return
  const from = draggingIndex.value
  draggingIndex.value = null
  if (!Number.isInteger(from)) return
  if (from < 0 || from >= props.cards.length) return
  emit('move', from, index)
}

function onDragEnd() {
  draggingIndex.value = null
}
</script>

<style scoped>
.card {
  display: grid;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: var(--component-bg-blur);
  border: 1px solid var(--border-color);
}

.card-list-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.card-list-editor__text strong {
  display: block;
  margin-bottom: .15rem;
}

.card-list-editor__text p {
  margin: 0;
  color: var(--component-text-secondary);
  font-size: .9rem;
}

.empty-state {
  padding: 1rem;
  border-radius: 12px;
  border: 1px dashed var(--border-color);
  color: var(--component-text-secondary);
  text-align: center;
}

.card-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: .85rem;
}

.card-list__item {
  display: grid;
  grid-template-columns: auto 1fr;
  flex-wrap: nowrap;
  gap: .5rem;
  align-items: center;
  padding: .6rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  /* card height is determined by content (text lines) */
  height: auto;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  min-height: var(--card-min-height);
}

.card-list__item-content {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: .5rem;
  align-items: center;
  height: auto;
}

.card-list__item.dragging {
  opacity: .65;
  transform: scale(.995);
  box-shadow: var(--shadow-elev-1);
}

.drag-handle {
  width: 36px;
  border: none;
  background: transparent;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--component-text-secondary);
  cursor: grab;
  align-self: stretch;
  /* let the handle fill the row height */
  padding: 0;
}

.drag-handle svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}


.card-list__preview {
  min-width: 0;
  display: grid;
  gap: .5rem;
  /* Fixed compact preview: do not reflect per-card/global styles */
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.card-list__preview--left-sm,
.card-list__preview--left-lg {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}

.card-list__preview--top-lg {
  grid-template-columns: 1fr;
}

.card-list__media {
  overflow: hidden;
  border-radius: 14px;
  background: var(--component-bg-blur-alt);
  border: 1px solid var(--border-color);
}

.card-list__preview .card-list__media {
  width: 64px;
  aspect-ratio: 1 / 1;
  flex-shrink: 0;
  /* constrain media height so it doesn't expand the card beyond min-height */
  max-height: calc(var(--card-min-height) - 20px);
}

.card-list__preview--left-lg .card-list__media {
  width: 96px;
  aspect-ratio: 1 / 1;
}

.card-list__preview--top-lg .card-list__media {
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: 160px;
}

.card-list__media img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.card-list__media-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--component-text-secondary);
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 16%, transparent), transparent);
  font-size: .82rem;
}

.card-list__content {
  min-width: 0;
  display: grid;
}

.card-list__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
}

.card-list__heading strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-badge {
  flex: none;
  padding: .18rem .55rem;
  border-radius: 999px;
  font-size: .76rem;
  color: var(--component-text-secondary);
  background: var(--component-bg-blur-alt);
  border: 1px solid var(--border-color);
}

.card-list__intro {
  margin: 0;
  color: var(--component-text-secondary);
  line-height: 1.65;
}

.card-list__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  flex-wrap: wrap;
}

.card-list__home,
.card-list__story {
  color: var(--component-text-secondary);
  font-size: .84rem;
}

.card-list__story {
  color: var(--accent-color);
}

.card-list__actions {
  display: flex;
  align-items: center;
  gap: .45rem;
  flex-wrap: wrap;
}

.danger-btn {
  border: none;
  background: transparent;
  color: var(--status-error);
  padding: .55rem .8rem;
  border-radius: 10px;
}

.danger-btn:hover {
  background: color-mix(in srgb, var(--status-error) 10%, transparent);
}

.icon-btn {
  padding: 0.4rem;
  font-size: 1rem;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn :deep(svg) {
  width: 1.2rem;
  height: 1.2rem;
}

.icon-btn:hover {
  background: var(--component-bg-hover);
}

.delete-btn {
  color: var(--status-error);
}

.delete-btn:hover {
  background: var(--component-bg-hover);
}

.edit-btn {
  color: var(--component-text-secondary);
}

.field-required {
  display: inline-block;
  margin-left: .45rem;
  padding: .08rem .32rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--status-error) 12%, transparent);
  color: var(--status-error);
  font-size: .72rem;
}

@media (max-width: 980px) {

  .card-list__actions {
    justify-content: flex-start;
  }
}
</style>