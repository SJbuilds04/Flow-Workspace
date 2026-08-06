import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export type PopoverAlign = 'start' | 'center' | 'end'
export type PopoverSide = 'top' | 'bottom'

interface PopoverProps {
  trigger: ReactElement
  children: ReactNode | ((api: { close: () => void }) => ReactNode)
  align?: PopoverAlign
  side?: PopoverSide
  /** Gap between trigger and panel, in px. */
  offset?: number
  matchTriggerWidth?: boolean
  className?: string
  contentClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface Rect {
  top: number
  left: number
  width: number
}

const VIEWPORT_PADDING = 12

/**
 * Anchored floating panel with outside-click and Escape dismissal, arrow-key
 * roving between `[data-menu-item]` descendants, and viewport flipping so a
 * panel near the bottom edge opens upward instead of being cut off.
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  offset = 8,
  matchTriggerWidth = false,
  className,
  contentClassName,
  open: controlledOpen,
  onOpenChange
}: PopoverProps): ReactNode {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [resolvedSide, setResolvedSide] = useState<PopoverSide>(side)

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlledOpen, onOpenChange]
  )

  const close = useCallback(() => setOpen(false), [setOpen])

  const reposition = useCallback(() => {
    const element = triggerRef.current
    const panel = panelRef.current
    if (!element) return

    const triggerRect = element.getBoundingClientRect()
    const panelHeight = panel?.offsetHeight ?? 0
    const panelWidth = matchTriggerWidth ? triggerRect.width : (panel?.offsetWidth ?? 0)

    const spaceBelow = window.innerHeight - triggerRect.bottom
    const nextSide: PopoverSide =
      side === 'bottom' && panelHeight > 0 && spaceBelow < panelHeight + offset + VIEWPORT_PADDING ? 'top' : side

    const top = nextSide === 'bottom' ? triggerRect.bottom + offset : triggerRect.top - offset - panelHeight

    let left: number
    if (align === 'start') left = triggerRect.left
    else if (align === 'end') left = triggerRect.right - panelWidth
    else left = triggerRect.left + triggerRect.width / 2 - panelWidth / 2

    const maxLeft = window.innerWidth - panelWidth - VIEWPORT_PADDING
    left = Math.max(VIEWPORT_PADDING, Math.min(left, Math.max(VIEWPORT_PADDING, maxLeft)))

    setResolvedSide(nextSide)
    setRect({ top, left, width: triggerRect.width })
  }, [align, matchTriggerWidth, offset, side])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    // A second pass once the panel has measured itself, so flipping and
    // end-alignment settle before the first painted frame.
    const frame = requestAnimationFrame(reposition)
    return () => cancelAnimationFrame(frame)
  }, [open, reposition])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      close()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        triggerRef.current?.focus()
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const items = panelRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])')
      if (!items?.length) return

      event.preventDefault()
      const list = [...items]
      const currentIndex = list.indexOf(document.activeElement as HTMLElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex =
        currentIndex === -1 ? (delta === 1 ? 0 : list.length - 1) : (currentIndex + delta + list.length) % list.length
      list[nextIndex]?.focus()
    }

    const onViewportChange = (): void => reposition()

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, close, reposition])

  const triggerElement = cloneElement(trigger, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
    },
    onClick: (event: MouseEvent) => {
      ;(trigger.props as { onClick?: (event: MouseEvent) => void }).onClick?.(event)
      setOpen(!open)
    },
    'aria-expanded': open,
    'aria-haspopup': 'menu'
  } as never)

  return (
    <>
      {triggerElement}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: resolvedSide === 'bottom' ? -6 : 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: resolvedSide === 'bottom' ? -4 : 4 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{
                top: rect?.top ?? -9999,
                left: rect?.left ?? -9999,
                ...(matchTriggerWidth && rect ? { width: rect.width } : {}),
                transformOrigin: resolvedSide === 'bottom' ? 'top center' : 'bottom center'
              }}
              className={cn(
                'fixed z-[900] overflow-hidden rounded-2xl p-1.5',
                'glass-raised shadow-pop',
                className,
                contentClassName
              )}
            >
              {typeof children === 'function' ? children({ close }) : children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
