import { ref } from 'vue'

export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
export type ToastShape = 'capsule' | 'rounded'
export type ToastStatus = 'default' | 'success' | 'error' | 'info' | 'warning'

const visible = ref(false)
const message = ref('')
const position = ref<ToastPosition>('bottom-right')
const shape = ref<ToastShape>('rounded')
const status = ref<ToastStatus>('default')
const opacity = ref<number>(1)
let timer: ReturnType<typeof setTimeout> | null = null

export interface ToastOptions {
  position?: ToastPosition
  shape?: ToastShape
  status?: ToastStatus
  opacity?: number // 0..1
  duration?: number // ms
}

function show(msg = '', opts: ToastOptions = {}) {
  message.value = msg
  if (opts.position) position.value = opts.position
  if (opts.shape) shape.value = opts.shape
  if (opts.status) status.value = opts.status
  if (typeof opts.opacity === 'number') opacity.value = Math.max(0, Math.min(1, opts.opacity))

  visible.value = true
  if (timer) clearTimeout(timer)
  const dur = typeof opts.duration === 'number' ? opts.duration : 3000
  timer = setTimeout(() => {
    visible.value = false
    timer = null
  }, dur)
}

function hide() {
  visible.value = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function useToast() {
  return {
    show,
    hide,
    toastState: { visible, message, position, shape, status, opacity }
  }
}

export default useToast
