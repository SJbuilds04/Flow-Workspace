import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * These exercise the real pipeline: a persistent Playwright browser context is
 * launched for the selected profile, the composition is rendered inside it, and
 * the artifact is written to disk. They need a Chromium-family browser on the
 * machine, so they skip rather than fail when none is installed.
 */
test.describe('generation', () => {
  test.slow()

  test('renders an image and adds it to history', async ({ window }) => {
    const available = await profileCanLaunch(window)
    test.skip(!available, 'No Chromium-family browser available for the profile.')

    await window.getByRole('textbox', { name: 'Prompt' }).fill('Molten glass ribbons over a dark sea')
    await window.getByRole('button', { name: 'Model: Flow Image v2' }).click()
    await window.getByRole('menuitem', { name: /Flow Image Turbo/ }).click()

    await window.getByRole('button', { name: 'Generate' }).click()

    // The composer swaps Generate for Stop while a run is in flight.
    await expect(window.getByRole('button', { name: 'Stop' })).toBeVisible()

    const card = window.locator('article').first()
    await expect(card).toBeVisible({ timeout: 120_000 })
    await expect(card).toContainText('Molten glass ribbons over a dark sea')
    await expect(card.locator('img')).toBeVisible()

    // The prompt clears but the model choice is deliberately preserved.
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toHaveValue('')
    await expect(window.getByRole('button', { name: 'Model: Flow Image Turbo' })).toBeVisible()
  })

  test('writes the artifact to the project output folder', async ({ window, userDataDir }) => {
    const available = await profileCanLaunch(window)
    test.skip(!available, 'No Chromium-family browser available for the profile.')

    await window.getByRole('textbox', { name: 'Prompt' }).fill('Chrome monolith at dusk')
    await window.getByRole('button', { name: 'Generate' }).click()

    await expect(window.locator('article').first()).toBeVisible({ timeout: 120_000 })

    const root = join(userDataDir, 'outputs')
    const files: string[] = []
    for (const project of await readdir(root)) {
      files.push(...(await readdir(join(root, project))))
    }

    expect(files.some((file) => file.endsWith('.png'))).toBe(true)
  })

  test('opens a finished generation in the viewer', async ({ window }) => {
    const available = await profileCanLaunch(window)
    test.skip(!available, 'No Chromium-family browser available for the profile.')

    await window.getByRole('textbox', { name: 'Prompt' }).fill('Aurora over a frozen lake')
    await window.getByRole('button', { name: 'Generate' }).click()

    const card = window.locator('article').first()
    await expect(card).toBeVisible({ timeout: 120_000 })

    await card.getByRole('button', { name: /^Open generation:/ }).click()

    const viewer = window.getByRole('dialog', { name: 'Generation preview' })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole('button', { name: 'Download' })).toBeVisible()
    await expect(viewer.getByRole('img', { name: 'Aurora over a frozen lake' })).toBeVisible()

    await viewer.getByRole('button', { name: 'Close preview' }).click()
    await expect(viewer).toBeHidden()
  })

  test('surfaces a recovery banner when the profile cannot start', async ({ window, userDataDir }) => {
    // Occupy the Client 2 profile path with a regular file so the context can
    // never be created — the same dead end a locked or missing profile hits.
    const profiles = join(userDataDir, 'profiles')
    await mkdir(profiles, { recursive: true })
    await rm(join(profiles, 'client-2'), { recursive: true, force: true })
    await writeFile(join(profiles, 'client-2'), 'not a directory')

    await window.getByRole('button', { name: 'Active profile: Personal' }).click()
    await window.getByRole('menu').getByRole('menuitem', { name: 'Client 2' }).click()

    const banner = window.getByRole('alert')
    await expect(banner).toBeVisible({ timeout: 45_000 })
    await expect(banner).toContainText(/isn’t available right now/)
    await expect(banner).toContainText(/Choose a different profile/)

    // The banner must offer a one-click way out to another profile.
    await expect(banner.getByRole('button', { name: /^Personal$/ })).toBeVisible()
    await banner.getByRole('button', { name: /^Personal$/ }).click()

    await expect(window.getByRole('button', { name: 'Active profile: Personal' })).toBeVisible()
  })
})

/** Probes whether a browser can actually be launched on this machine. */
async function profileCanLaunch(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      flow: { accounts: { launch(input: { accountId: string }): Promise<{ ok: boolean }> } }
    }
    const result = await bridge.flow.accounts.launch({ accountId: 'personal' })
    return result.ok
  })
}
