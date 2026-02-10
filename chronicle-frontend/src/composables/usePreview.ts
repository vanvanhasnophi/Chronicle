import { reactive } from 'vue'

export interface PreviewFile {
  name: string
  path: string
  type: string
}

const state = reactive({
  visible: false,
  file: null as PreviewFile | null,
})

export function usePreview() {
  function openPreview(file: PreviewFile) {
    state.file = file
    state.visible = true
  }

  function closePreview() {
    state.visible = false
    state.file = null
  }

  return {
    state,
    openPreview,
    closePreview
  }
}
