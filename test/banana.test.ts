import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** Boot the app in a throwaway home on any free port, run the test, always stop it and remove the home. */
async function withApp(run: (app: App) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'banana-test-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    listen: false,
  })
  try {
    await run(app)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
}

interface Board {
  scores: { name: string; score: number }[]
  rank?: number | null
}

const board = async (app: App): Promise<Board> => {
  const response = await app.root.router.request('/banana/scores')
  assert.equal(response.status, 200)
  return (await response.json()) as Board
}

const post = (app: App, body: unknown): Promise<Response> =>
  app.root.router.request('/banana/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

test('serves the game page and an empty board', () =>
  withApp(async (app) => {
    const page = await app.root.router.request('/banana')
    assert.equal(page.status, 200)
    assert.match(page.headers.get('content-type') ?? '', /text\/html/)
    const html = await page.text()
    assert.ok(html.includes('<title>Ripe, a banana game</title>'), 'the page names the game')
    assert.ok(html.includes('id="banana-canvas"'), 'the page carries the board')
    assert.ok(html.includes("fetch('/banana/scores')"), 'the page asks its own route for the board')
    assert.deepEqual(await board(app), { scores: [] })
  }))

test('keeps a posted score, trims the name and ranks the board', () =>
  withApp(async (app) => {
    const first = await post(app, { name: '  Ada  ', score: 40 })
    assert.equal(first.status, 201)
    assert.equal(((await first.json()) as Board).rank, 1)
    assert.equal((await post(app, { name: 'Bela', score: 90 })).status, 201)
    assert.equal((await post(app, { name: 'Cem', score: 12 })).status, 201)

    const ranked = await board(app)
    assert.deepEqual(
      ranked.scores.map((row) => `${row.name}:${row.score}`),
      ['Bela:90', 'Ada:40', 'Cem:12'],
    )
  }))

test('refuses a name or a score the board cannot keep', () =>
  withApp(async (app) => {
    for (const body of [
      { name: '', score: 10 },
      { name: '   ', score: 10 },
      { name: 'x'.repeat(17), score: 10 },
      { name: 'Ada' },
      { name: 'Ada', score: -1 },
      { name: 'Ada', score: 1.5 },
      { name: 'Ada', score: 1_000_001 },
      { name: 42, score: 10 },
      {},
    ]) {
      const response = await post(app, body)
      assert.equal(response.status, 400, JSON.stringify(body))
      assert.match(((await response.json()) as { error: string }).error, /name of 1 to 16/)
    }
    const broken = await app.root.router.request('/banana/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    assert.equal(broken.status, 400)
    assert.deepEqual(await board(app), { scores: [] })
  }))

test('puts the game on the home page as a widget, and it leaves with the plugin', () =>
  withApp(async (app) => {
    const home = async () =>
      (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
    assert.match(await home(), /data-widget="banana"[\s\S]*href="\.\/banana"[\s\S]*Play Ripe/)
    await post(app, { name: 'Ada', score: 77 })
    assert.match(await home(), /<strong>77<\/strong> by Ada/)
  }))

test('keeps the board in a file across a restart', async () => {
  const home = await mkdtemp(join(scratch, 'banana-test-'))
  try {
    const first = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
      listen: false,
    })
    try {
      await post(first, { name: 'Ada', score: 61 })
    } finally {
      await first.stop()
    }
    assert.ok(existsSync(join(home, 'banana.json')), 'the board is a file in the app home')

    const second = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
      listen: false,
    })
    try {
      assert.deepEqual(
        (await board(second)).scores.map((row) => `${row.name}:${row.score}`),
        ['Ada:61'],
      )
    } finally {
      await second.stop()
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
