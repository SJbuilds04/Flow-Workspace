import { create } from 'zustand'

export type ToastTone = 'neutral' | 'success' | 'danger'

export interface Toast {
  id: string
  title: string
  description?: string
  tone: ToastTone
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'> & { id?: string; durationMs?: number }) => string
  dismiss: (id: string) => void
}

const DEFAULT_DURATION = 5000
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: ({ id, durationMs = DEFAULT_DURATION, ...toast }) => {
    const toastId = id ?? crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts.filter((item) => item.id !== toastId), { ...toast, id: toastId }]
    }))

    const existing = timers.get(toastId)
    if (existing) clearTimeout(existing)

    if (durationMs > 0) {
      timers.set(
        toastId,
        setTimeout(() => get().dismiss(toastId), durationMs)
      )
    }

    return toastId
  },

  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }
}))

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, tone: 'success', ...(description ? { description } : {}) }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, tone: 'danger', durationMs: 8000, ...(description ? { description } : {}) }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ title, tone: 'neutral', ...(description ? { description } : {}) })
}
