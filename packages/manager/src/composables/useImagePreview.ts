import { reactive, ref } from 'vue'

const state = reactive({
  visible: false,
  imageSrc: '',
})

// Image Zoom/Pan State
const imgState = reactive({
  scale: 1,
  x: 0,
  y: 0,
  isDragging: false,
  startX: 0,
  startY: 0
})

function openImagePreview(src: string) {
  state.imageSrc = src
  state.visible = true
  resetImgState()
}

function closeImagePreview() {
  state.visible = false
  state.imageSrc = ''
  resetImgState()
}

function resetImgState() {
  imgState.scale = 1
  imgState.x = 0
  imgState.y = 0
  imgState.isDragging = false
}

export function useImagePreview() {
  return {
    state,
    imgState,
    openImagePreview,
    closeImagePreview,
    resetImgState
  }
}
