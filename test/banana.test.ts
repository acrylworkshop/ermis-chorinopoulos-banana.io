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
    assert.ok(html.includes('const COLS = 30'), 'the board is 30 cells across')
    assert.ok(html.includes('id="banana-nick"'), 'the page asks for the name it shows above the banana')
    assert.ok(
      html.includes('drawBanana(smoothCells(), game.ripeness, 1, myName)'),
      'every banana is drawn with its player’s name',
    )
    assert.ok(html.includes('id="banana-join"'), 'the page has a line for the link others join with')
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

test('the shared counter takes a banana and hands the room to a reader', () =>
  withApp(async (app) => {
    const state = (body: unknown) =>
      app.root.router.request('/banana/room/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

    assert.equal(
      (
        await state({ id: 'peer-one', name: 'Ada', score: 30, ripe: 40, cells: [[3, 4], [2, 4]] })
      ).status,
      204,
    )
    assert.equal(
      (await state({ id: 'peer-one', name: '', score: 30, ripe: 40, cells: [] })).status,
      400,
    )
    assert.equal(
      (await state({ id: 'peer-one', name: 'Ada', score: 30, ripe: 40, cells: [[99, 4]] })).status,
      400,
    )
    // The board is 30 by 30, so its last cell is drawn and the cell past it is not.
    assert.equal(
      (await state({ id: 'peer-one', name: 'Ada', score: 30, ripe: 40, cells: [[29, 29]] })).status,
      204,
    )
    assert.equal(
      (await state({ id: 'peer-one', name: 'Ada', score: 30, ripe: 40, cells: [[30, 0]] })).status,
      400,
    )

    const stream = await app.root.router.request('/banana/room/events?id=reader-one')
    assert.equal(stream.status, 200)
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/)
    const reader = stream.body?.getReader()
    assert.ok(reader, 'the room answers a body')
    const decoder = new TextDecoder()
    let text = ''
    try {
      for (let round = 0; round < 20 && !text.includes('peer-one'); round += 1) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('the room sent nothing in 3 seconds')), 3000)
          }),
        ]).finally(() => clearTimeout(timer))
        if (chunk.done) break
        text += decoder.decode(chunk.value, { stream: true })
      }
    } finally {
      await reader.cancel()
    }
    assert.match(text, /event: hello/)
    assert.match(text, /"peer-one"/)
    assert.match(text, /"Ada"/)
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
