<template>
    <div v-if="state.visible" 
         class="image-preview-overlay" 
         @click="closeImagePreview"
         @mousemove="handleMouseMove"
         @mouseup="handleMouseUp"
         @mouseleave="handleMouseUp"
    >
      <div class="actions-group">
          <a :href="state.imageSrc" download target="_blank" class="preview-action-btn download" @click.stop title="Download">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
          <button class="preview-action-btn close" @click.stop="closeImagePreview" title="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      </div>

      <div class="image-preview-container" @click.stop>
        <img 
            :src="state.imageSrc" 
            class="image-preview-content" 
            :class="{ 'is-dragging': imgState.isDragging }"
            :style="{ transform: `translate(${imgState.x}px, ${imgState.y}px) scale(${imgState.scale})` }"
            @wheel="handleWheel"
            @mousedown="handleMouseDown"
            @dragstart.prevent
        />
      </div>
    </div>
</template>

<script setup lang="ts">
import { useImagePreview } from '../composables/useImagePreview'

const { state, imgState, closeImagePreview } = useImagePreview()

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.min(Math.max(0.5, imgState.scale * delta), 5)
  imgState.scale = newScale
}

function handleMouseDown(e: MouseEvent) {
  imgState.isDragging = true
  imgState.startX = e.clientX - imgState.x
  imgState.startY = e.clientY - imgState.y
}

function handleMouseMove(e: MouseEvent) {
  if (!imgState.isDragging) return
  imgState.x = e.clientX - imgState.startX
  imgState.y = e.clientY - imgState.startY
}

function handleMouseUp() {
  imgState.isDragging = false
}
</script>

<style scoped>
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  z-index: 20001; /* Higher than file preview */
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  animation: fadeIn 0.2s ease;
}

.actions-group {
    position: absolute;
    top: 30px;
    right: 30px;
    display: flex;
    gap: 12px;
    z-index: 20002;
}

.preview-action-btn {
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: #fff;
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  text-decoration: none;
}
.preview-action-btn:hover {
  background: rgba(0, 0, 0, 0.8);
  transform: scale(1.05);
}
.preview-action-btn:active {
  transform: scale(0.95);
}

.image-preview-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-content {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  cursor: grab;
  transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  will-change: transform;
}
.image-preview-content.is-dragging {
  transition: none !important;
}
.image-preview-content:active {
  cursor: grabbing;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>