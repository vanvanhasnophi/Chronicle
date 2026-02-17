import { reactive } from 'vue'

const state = reactive({
  visible: false,
  x: 0,
  y: 0,
  tex: '',
  originalTex: '',
  uniqueId: '',
  blockIndex: -1,
  copied: false,
  timer: null as any,
  isEditing: false,
  error: '',
  onSave: null as null | ((tex: string, uniqueId: string, blockIndex: number) => void)
})

function show(opts: Partial<typeof state> & { onSave?: typeof state.onSave }) {
  if (opts.tex !== undefined) state.tex = opts.tex as string
  if (opts.originalTex !== undefined) state.originalTex = opts.originalTex as string
  if (opts.uniqueId !== undefined) state.uniqueId = opts.uniqueId as string
  if (opts.blockIndex !== undefined) state.blockIndex = opts.blockIndex as number
  if (opts.x !== undefined) state.x = opts.x as number
  if (opts.y !== undefined) state.y = opts.y as number
  if (opts.isEditing !== undefined) state.isEditing = opts.isEditing as boolean
  if (opts.onSave !== undefined) state.onSave = opts.onSave as any
  state.copied = false
  state.error = ''
  state.visible = true
}

function hide() { state.visible = false }

export function useMathTooltip() {
  return { state, show, hide }
}

export default useMathTooltip
