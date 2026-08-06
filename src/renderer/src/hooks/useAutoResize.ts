import { useEffect, type RefObject } from 'react'

/**
 * Grows a textarea with its content up to `maxHeight`, then lets it scroll —
 * the behaviour that makes the ChatGPT composer feel like a document rather
 * than a form field.
 */
export function useAutoResize(ref: RefObject<HTMLTextAreaElement>, value: string, maxHeight = 320): void {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    element.style.height = 'auto'
    const next = Math.min(element.scrollHeight, maxHeight)
    element.style.height = `${next}px`
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [ref, value, maxHeight])
}
