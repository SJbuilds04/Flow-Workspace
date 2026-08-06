import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type Side = 'top' | 'bottom' | 'right' | 'left'

interface TooltipProps {
  label: ReactNode
  side?: Side
  delayMs?: number
  children: ReactElement
  className?: string
}

interface Position {
  top: number
  left: number
}

const OFFSET = 10

/**
 * Portal-rendered tooltip positioned from the trigger's viewport rect, so it is
 * never clipped by a scroll container or an `overflow-hidden` panel.
 */
export function Tooltip({ label, side = 'top', delayMs = 320, children, className }: TooltipProps): ReactNode {
  const [position, setPosition] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  const clearTimer = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const show = (): void => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      const element = triggerRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()

      const anchors: Record<Side, Position> = {
        top: { top: rect.top - OFFSET, left: rect.left + rect.width / 2 },
        bottom: { top: rect.bottom + OFFSET, left: rect.left + rect.width / 2 },
        left: { top: rect.top + rect.height / 2, left: rect.left - OFFSET },
        right: { top: rect.top + rect.height / 2, left: rect.right + OFFSET }
      }
      setPosition(anchors[side])
    }, delayMs)
  }

  const hide = (): void => {
    clearTimer()
    setPosition(null)
  }

  const translate: Record<Side, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)'
  }

  const trigger = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      const forwarded = (children as unknown as { ref?: unknown }).ref
      if (typeof forwarded === 'function') forwarded(node)
      else if (forwarded && typeof forwarded === 'object') {
        ;(forwarded as { current: HTMLElement | null }).current = node
      }
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': position ? id : undefined
  } as never)

  return (
    <>
      {trigger}
      {createPortal(
        <AnimatePresence>
          {position && (
            <motion.div
              id={id}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              style={{ top: position.top, left: position.left, transform: translate[side] }}
              className={cn(
                'pointer-events-none fixed z-[999] rounded-lg px-2.5 py-1.5',
                'glass-raised text-2xs font-medium text-ink',
                className
              )}
            >
              {label}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
