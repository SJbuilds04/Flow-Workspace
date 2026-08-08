import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import type { ScenePlan } from '@shared/types'
import { expect, test } from './fixtures'

/**
 * Phase 1 covers planning only — nothing here renders or spends credits, so the
 * whole surface is testable without a Groq key or a Flow account.
 */
test.describe('storyboard', () => {
  test('is reachable from the project and asks for a key when none is stored', async ({ window }) => {
    await window.getByRole('radiogroup', { name: 'Project mode' }).getByRole('radio', { name: 'Storyboard' }).click()

    await expect(window.getByText('Connect Groq to plan scenes')).toBeVisible()
    await expect(window.getByRole('button', { name: 'Open Settings' })).toBeVisible()

    // The prompt composer belongs to the other tab and must be out of the way.
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toBeHidden()
  })

  test('the key shortcut lands on Settings', async ({ window }) => {
    await window.getByRole('radiogroup', { name: 'Project mode' }).getByRole('radio', { name: 'Storyboard' }).click()
    await window.getByRole('button', { name: 'Open Settings' }).click()

    await expect(window.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(window.getByLabel('Groq API key')).toBeVisible()
    await expect(window.getByLabel('Planner model')).toHaveValue('llama-3.3-70b-versatile')
  })

  test('switching back to Compose restores the prompt box', async ({ window }) => {
    const tabs = window.getByRole('radiogroup', { name: 'Project mode' })

    await tabs.getByRole('radio', { name: 'Storyboard' }).click()
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toBeHidden()

    await tabs.getByRole('radio', { name: 'Compose' }).click()
    await expect(window.getByRole('textbox', { name: 'Prompt' })).toBeVisible()
  })

  test('the planner model is editable and persists', async ({ window, userDataDir }) => {
    await window.getByRole('button', { name: 'Settings' }).click()

    const model = window.getByLabel('Planner model')
    await model.fill('openai/gpt-oss-120b')
    await model.blur()

    await expect
      .poll(async () => {
        const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
        return (JSON.parse(raw) as { settings: { plannerModel: string } }).settings.plannerModel
      })
      .toBe('openai/gpt-oss-120b')
  })
})

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

const SEEDED_PLAN = {
  id: 'plan-1',
  projectId: PROJECT_ID,
  brief: 'A lighthouse keeper finds something in the fog',
  targetDurationSeconds: 30,
  aspectRatio: '16:9',
  plannerModel: 'llama-3.3-70b-versatile',
  createdAt: '2026-08-08T10:00:00.000Z',
  updatedAt: '2026-08-08T10:00:00.000Z',
  characters: [
    {
      id: 'c1',
      tag: 'keeper',
      name: 'The keeper',
      description: 'Weathered man, sixties, oilskin coat',
      createdAt: '2026-08-08T10:00:00.000Z'
    }
  ],
  scenes: [
    {
      id: 's1',
      title: 'Lamp room at dusk',
      prompt: '@keeper climbs the spiral stair as the lamp turns',
      durationSeconds: 10,
      characterTags: ['keeper'],
      status: 'planned',
      locked: false
    },
    {
      id: 's2',
      title: 'Fog rolls in',
      prompt: 'Thick fog swallows the shoreline below the tower',
      durationSeconds: 8,
      characterTags: [],
      status: 'planned',
      locked: false
    }
  ]
} as unknown as ScenePlan

test.describe('storyboard with a stored plan', () => {
  // The planner reads GROQ_API_KEY before the keychain, so the surface opens
  // without a real secret. Nothing here calls Groq.
  test.use({
    seedEnv: { GROQ_API_KEY: 'test-key-never-sent' },
    seedProjects: [
      {
        id: PROJECT_ID,
        name: 'Lighthouse',
        glyph: '◆',
        createdAt: '2026-08-08T10:00:00.000Z',
        updatedAt: '2026-08-08T10:00:00.000Z'
      }
    ],
    seedPlans: [SEEDED_PLAN]
  })

  async function openStoryboard(window: Page): Promise<void> {
    await window.getByRole('radiogroup', { name: 'Project mode' }).getByRole('radio', { name: 'Storyboard' }).click()
  }

  test('shows the shot list, cast and estimates', async ({ window }) => {
    await openStoryboard(window)

    await expect(window.getByText('Connect Groq to plan scenes')).toBeHidden()
    await expect(window.getByRole('article')).toHaveCount(2)
    await expect(window.getByLabel('Scene 1 title')).toHaveValue('Lamp room at dusk')
    await expect(window.getByLabel('Scene 2 prompt')).toHaveValue(/Thick fog/)

    // 10s + 8s of shots, and the cast the planner extracted.
    await expect(window.getByText('18s', { exact: true })).toBeVisible()
    await expect(window.getByText('@keeper').first()).toBeVisible()
  })

  test('reorders, locks and deletes shots, and persists it', async ({ window, userDataDir }) => {
    await openStoryboard(window)

    await window.getByRole('button', { name: 'Move later' }).first().click()
    await expect(window.getByLabel('Scene 1 title')).toHaveValue('Fog rolls in')

    await window
      .getByRole('button', { name: /Lock scene/ })
      .first()
      .click()
    await expect(window.getByText('Locked', { exact: true })).toHaveCount(1)

    await window.getByRole('button', { name: 'Delete scene' }).last().click()
    await expect(window.getByRole('article')).toHaveCount(1)

    await expect
      .poll(async () => {
        const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
        const parsed = JSON.parse(raw) as { plans: { scenes: { title: string; locked: boolean }[] }[] }
        return parsed.plans[0]?.scenes.map((scene) => `${scene.title}:${scene.locked}`)
      })
      .toEqual(['Fog rolls in:true'])
  })

  test('render is blocked until a profile has a Google account', async ({ window }) => {
    await openStoryboard(window)

    await expect(window.getByText('No profile has a Google account connected yet.')).toBeVisible()
    await expect(window.getByRole('button', { name: /^Render/ })).toBeDisabled()
  })

  test('offers reference slots for the cast and for the overall look', async ({ window }) => {
    await openStoryboard(window)

    // A photo per character, plus look/location references for the whole video.
    await expect(window.getByRole('button', { name: 'Set a reference photo for The keeper' })).toBeVisible()
    await expect(window.getByText('No photo')).toBeVisible()
    await expect(window.getByRole('button', { name: 'Add reference' })).toBeVisible()
  })

  test('joining is offered but blocked until shots are rendered', async ({ window }) => {
    await openStoryboard(window)

    await expect(window.getByText('Join into one video')).toBeVisible()

    // Deliberately not asserting the reason text: it differs by whether the
    // host has FFmpeg, and the behaviour under test is that joining is
    // unavailable, not why.
    await expect(window.getByRole('button', { name: /^Join/ })).toBeDisabled()
  })

  test('offers both planning modes and swaps the wording', async ({ window }) => {
    await openStoryboard(window)

    const modes = window.getByRole('radiogroup', { name: 'Planning mode' })
    await expect(modes.getByRole('radio', { name: 'Generate scenes' })).toBeVisible()

    await modes.getByRole('radio', { name: 'Paste your story' }).click()

    await expect(window.getByText('Your writing is only cut into shots — nothing is invented.')).toBeVisible()
    await expect(window.getByRole('button', { name: 'Split into scenes' })).toBeVisible()
    await expect(window.getByRole('textbox', { name: 'Paste your story' })).toBeVisible()
  })

  test('adds a shot and discards the plan', async ({ window, userDataDir }) => {
    await openStoryboard(window)

    await window.getByRole('button', { name: 'Add a shot' }).click()
    await expect(window.getByRole('article')).toHaveCount(3)

    await window.getByRole('button', { name: 'Discard' }).click()
    await expect(window.getByText('No storyboard yet')).toBeVisible()

    await expect
      .poll(async () => {
        const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
        return (JSON.parse(raw) as { plans: unknown[] }).plans.length
      })
      .toBe(0)
  })
})

test.describe('choosing which profiles render', () => {
  const connectedAt = '2026-08-08T10:00:00.000Z'

  test.use({
    seedEnv: { GROQ_API_KEY: 'test-key-never-sent' },
    seedIdentities: {
      personal: { email: 'personal@sjbuilds.test', connectedAt },
      'client-1': { email: 'client1@sjbuilds.test', connectedAt }
    },
    seedProjects: [
      {
        id: PROJECT_ID,
        name: 'Lighthouse',
        glyph: '◆',
        createdAt: connectedAt,
        updatedAt: connectedAt
      }
    ],
    seedPlans: [SEEDED_PLAN]
  })

  test('picks which profiles render, and keeps at least one', async ({ window, userDataDir }) => {
    await window.getByRole('radiogroup', { name: 'Project mode' }).getByRole('radio', { name: 'Storyboard' }).click()

    // Every connected profile takes part until one is explicitly turned off.
    const personal = window.getByRole('switch', { name: 'Render on Personal' })
    const client1 = window.getByRole('switch', { name: 'Render on Client 1' })

    await expect(personal).toHaveAttribute('aria-checked', 'true')
    await expect(client1).toHaveAttribute('aria-checked', 'true')
    // Client 2 has no account connected, so it is not offered at all.
    await expect(window.getByRole('switch', { name: 'Render on Client 2' })).toHaveCount(0)

    await client1.click()
    await expect(client1).toHaveAttribute('aria-checked', 'false')
    await expect(personal).toHaveAttribute('aria-checked', 'true')

    // The queue reads this from disk, so it has to actually persist.
    await expect
      .poll(async () => {
        const raw = await readFile(join(userDataDir, 'workspace.json'), 'utf-8')
        return (JSON.parse(raw) as { settings: { renderAccountIds: string[] } }).settings.renderAccountIds
      })
      .toEqual(['personal'])

    // Turning the last one off would mean rendering nowhere.
    await personal.click()
    await expect(personal).toHaveAttribute('aria-checked', 'true')
  })
})
