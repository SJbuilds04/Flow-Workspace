const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const ABSOLUTE = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** "just now" / "12m ago" / "Mar 4, 2026" depending on distance. */
export function formatRelative(iso: string): string {
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return ''

  const delta = Date.now() - timestamp
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return RELATIVE.format(-Math.floor(delta / MINUTE), 'minute')
  if (delta < DAY) return RELATIVE.format(-Math.floor(delta / HOUR), 'hour')
  if (delta < WEEK) return RELATIVE.format(-Math.floor(delta / DAY), 'day')
  return ABSOLUTE.format(timestamp)
}

export function formatDateTime(iso: string): string {
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return ''
  return `${ABSOLUTE.format(timestamp)} · ${TIME.format(timestamp)}`
}

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`
}

export function truncate(input: string, max: number): string {
  const trimmed = input.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`
}
