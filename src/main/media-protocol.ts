import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { MEDIA_PROTOCOL } from '@shared/ipc'
import { fromMediaUrl } from './services/media-url'

/**
 * Must run before `app.whenReady()`. Registering the scheme as standard and
 * secure lets the renderer treat generated media like any other asset while
 * keeping it out of reach of remote content.
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    const filePath = fromMediaUrl(request.url)
    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
