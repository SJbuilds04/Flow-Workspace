import type { FlowApi } from './index'

declare global {
  interface Window {
    flow: FlowApi
  }
}

export {}
