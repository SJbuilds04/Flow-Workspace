import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToastStore, type ToastTone } from '@/store/toast-store'
import { IconButton } from './IconButton'

const ICONS: Record<ToastTone, ReactNode> = {
  neutral: <Info className="size-4 text-ink-muted" />,
  success: <CheckCircle2 className="size-4 text-success" />,
  danger: <AlertTriangle className="size-4 text-danger" />
}

const ACCENTS: Record<ToastTone, string> = {
  neutral: 'border-edge',
  success: 'border-success/25',
  danger: 'border-danger/30'
}

export function Toaster(): ReactNode {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[970] flex w-[360px] max-w-[calc(100vw-3rem)] flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3',
              'glass-raised shadow-pop',
              ACCENTS[toast.tone]
            )}
          >
            <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-1 break-words text-xs leading-relaxed text-ink-muted">{toast.description}</p>
              )}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="mt-2 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  {toast.action.label}
                </button>
              )}
            </div>

            <IconButton
              icon={<X className="size-3.5" />}
              label="Dismiss"
              tooltip={false}
              size="sm"
              onClick={() => dismiss(toast.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
