import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from './fixtures'

test.describe('shell', () => {
  test('boots into a project with the sidebar and composer visible', async ({ window }) => {
    await expect(window.getByRole('heading', { level: 1 })).toHaveText('Untitled Project')
    await expect(window.getByRole('button', { name: 'New project' })).toBeVisible()
    await expect(window.getByRole('textbox', { name: 'Search projects' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Settings' })).toBeVisible()
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toBeVisible()
  })

  test('window title is set', async ({ window }) => {
    await expect(window).toHaveTitle('Flow Workspace')
  })
})

test.describe('projects', () => {
  test('creates a project and makes it active', async ({ window }) => {
    await window.getByRole('button', { name: 'New project' }).click()

    const dialog = window.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Name').fill('Spring campaign')
    await dialog.getByRole('button', { name: 'Create project' }).click()

    await expect(dialog).toBeHidden()
    await expect(window.getByRole('heading', { level: 1 })).toHaveText('Spring campaign')
    await expect(window.getByRole('navigation', { name: 'Projects' })).toContainText('Spring campaign')
  })

  test('filters the sidebar with the search bar', async ({ window }) => {
    await window.getByRole('button', { name: 'New project' }).click()
    await window.getByRole('dialog').getByLabel('Name').fill('Nebula shoot')
    await window.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()

    const projectList = window.getByRole('navigation', { name: 'Projects' })
    await expect(projectList).toContainText('Nebula shoot')
    await expect(projectList).toContainText('Untitled Project')

    await window.getByRole('textbox', { name: 'Search projects' }).fill('nebula')

    await expect(projectList).toContainText('Nebula shoot')
    await expect(projectList).not.toContainText('Untitled Project')

    await window.getByRole('button', { name: 'Clear search' }).click()
    await expect(projectList).toContainText('Untitled Project')
  })

  test('deletes a project after confirmation', async ({ window }) => {
    await window.getByRole('button', { name: 'New project' }).click()
    await window.getByRole('dialog').getByLabel('Name').fill('Scratch')
    await window.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()

    const projectList = window.getByRole('navigation', { name: 'Projects' })
    const row = projectList.getByRole('button', { name: /Scratch/ }).first()
    await row.hover()
    await row.getByRole('button', { name: 'Project options' }).click()
    await window.getByRole('menuitem', { name: 'Delete project' }).click()

    const confirm = window.getByRole('dialog')
    await expect(confirm).toContainText('Delete “Scratch”?')
    await confirm.getByRole('button', { name: 'Delete project' }).click()

    await expect(projectList).not.toContainText('Scratch')
  })
})

test.describe('composer', () => {
  test('generate is disabled until a prompt is written', async ({ window }) => {
    const generate = window.getByRole('button', { name: 'Generate' })
    await expect(generate).toBeDisabled()

    await window.getByRole('textbox', { name: 'Prompt' }).fill('A slow drift over black sand dunes')
    await expect(generate).toBeEnabled()
  })

  test('changes the aspect ratio through the selector', async ({ window }) => {
    await window.getByRole('button', { name: /^Aspect ratio:/ }).click()
    await window.getByRole('menuitem', { name: /9:16/ }).click()

    await expect(window.getByRole('button', { name: 'Aspect ratio: 9:16' })).toBeVisible()
  })

  test('changes the model through the selector', async ({ window }) => {
    await window.getByRole('button', { name: /^Model:/ }).click()
    await window.getByRole('menuitem', { name: /Flow Image Turbo/ }).click()

    await expect(window.getByRole('button', { name: 'Model: Flow Image Turbo' })).toBeVisible()
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toHaveAttribute('placeholder', /Flow Image Turbo/)
  })

  test('shows the empty history state on a fresh project', async ({ window }) => {
    await expect(window.getByText('Nothing generated yet')).toBeVisible()
  })
})

test.describe('accounts', () => {
  test('lists the three profiles and switches between them', async ({ window }) => {
    await expect(window.getByRole('button', { name: 'Active profile: Personal' })).toBeVisible()

    await window.getByRole('button', { name: 'Active profile: Personal' }).click()

    const menu = window.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /Personal/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Client 1/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Client 2/ })).toBeVisible()

    await menu.getByRole('menuitem', { name: /Client 2/ }).click()

    await expect(window.getByRole('button', { name: 'Active profile: Client 2' })).toBeVisible()
  })

  test('persists the selected profile to the workspace file', async ({ window, userDataDir }) => {
    await window.getByRole('button', { name: 'Active profile: Personal' }).click()
    await window.getByRole('menu').getByRole('menuitem', { name: 'Client 1' }).click()
    await expect(window.getByRole('button', { name: 'Active profile: Client 1' })).toBeVisible()

    await expect
      .poll(async () => {
        const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
        return (JSON.parse(raw) as { settings: { activeAccountId: string } }).settings.activeAccountId
      })
      .toBe('client-1')
  })
})

test.describe('settings', () => {
  test('opens settings and toggles a preference', async ({ window }) => {
    await window.getByRole('button', { name: 'Settings' }).click()

    await expect(window.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

    const toggle = window.getByRole('switch', { name: 'Reduce motion' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await window.getByRole('button', { name: 'Back to workspace' }).click()
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toBeVisible()
  })

  test('lists every browser profile with a start control', async ({ window }) => {
    await window.getByRole('button', { name: 'Settings' }).click()

    for (const name of ['Personal', 'Client 1', 'Client 2']) {
      await expect(window.getByText(name, { exact: true })).toBeVisible()
    }
    await expect(window.getByRole('button', { name: 'Start' })).toHaveCount(3)
  })

  test('offers to connect a Google account on every unconnected profile', async ({ window }) => {
    await window.getByRole('button', { name: 'Settings' }).click()

    await expect(window.getByRole('button', { name: 'Connect Google' })).toHaveCount(3)
    await expect(window.getByText('No Google account connected').first()).toBeVisible()

    // Nothing is connected yet, so no profile should claim otherwise.
    await expect(window.getByText('Connected', { exact: true })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  })
})

test.describe('google sign-in', () => {
  test('account menu offers the connect action and reports it is not connected', async ({ window }) => {
    await window.getByRole('button', { name: 'Active profile: Personal' }).click()

    const menu = window.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Connect a Google account' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Sign out of Google' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Personal' })).toContainText('Not connected')
  })

  test.describe('with Personal already connected', () => {
    test.use({
      seedIdentities: {
        personal: { email: 'studio@sjbuilds.test', connectedAt: '2026-08-06T12:00:00.000Z' }
      }
    })

    test('shows the connected identity in settings and in the account menu', async ({ window }) => {
      await window.getByRole('button', { name: 'Settings' }).click()

      await expect(window.getByText('studio@sjbuilds.test')).toBeVisible()
      await expect(window.getByRole('button', { name: 'Sign out' })).toHaveCount(1)
      await expect(window.getByRole('button', { name: 'Connect Google' })).toHaveCount(2)

      await window.getByRole('button', { name: 'Back to workspace' }).click()
      await window.getByRole('button', { name: 'Active profile: Personal' }).click()

      const menu = window.getByRole('menu')
      await expect(menu.getByRole('menuitem', { name: 'Personal' })).toContainText('studio@sjbuilds.test')
      await expect(menu.getByRole('menuitem', { name: 'Sign out of Google' })).toBeVisible()
      await expect(menu.getByRole('menuitem', { name: 'Connect a Google account' })).toHaveCount(0)
    })

    test('signing out clears the identity and persists that', async ({ window, userDataDir }) => {
      await window.getByRole('button', { name: 'Settings' }).click()
      await window.getByRole('button', { name: 'Sign out' }).click()

      await expect(window.getByRole('button', { name: 'Connect Google' })).toHaveCount(3)
      await expect(window.getByText('studio@sjbuilds.test')).toHaveCount(0)

      await expect
        .poll(async () => {
          const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
          const parsed = JSON.parse(raw) as { accounts: { id: string; identity?: unknown }[] }
          return parsed.accounts.find((account) => account.id === 'personal')?.identity
        })
        .toBeNull()
    })
  })
})
