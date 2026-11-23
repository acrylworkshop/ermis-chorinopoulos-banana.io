import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, createApp } from '../src/app.ts'
import { mergeSnapshots } from '../plugins/banana/index.ts'
import { createWorld } from '../plugins/banana/world.ts'

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

test('the room validates requests and broadcasts the same world', () =>
  withApp(async (app) => {
    const send = (path: string, body: unknown) => app.root.router.request('/banana/room/' + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const key = 'secret_key_123456789'
    assert.equal((await send('join', { key: 'short', name: 'Ada' })).status, 400)
    for (const [x, y] of [[1, 1], [0, 0], [2, 0], [-1, -1], [0.5, 0]])
      assert.equal((await send('turn', { key, x, y })).status, 400)
    const joined = await send('join', { key, name: 'Ada' })
    assert.equal(joined.status, 201)
    const { id, step } = await joined.json() as { id: string; step: number }
    assert.equal(step, 0)
    assert.notEqual(id, key)
    assert.equal((await send('turn', { key: id, x: 0, y: 1 })).status, 404)
    const one = await app.root.router.request('/banana/room/events?key=' + key)
    const two = await app.root.router.request('/banana/room/events?key=' + key)
    const readers = [one.body!.getReader(), two.body!.getReader()]
    async function readRoom(reader: ReadableStreamDefaultReader<Uint8Array>) {
      let text = ''
      while (!text.includes('event: room')) {
        const chunk = await reader.read()
        assert.equal(chunk.done, false)
        text += new TextDecoder().decode(chunk.value)
      }
      assert.ok(!text.includes(key))
      return JSON.parse(text.match(/event: room\ndata: (.*)/)![1])
    }
    try {
      assert.deepEqual(await readRoom(readers[0]), await readRoom(readers[1]))
      await readers[0].cancel()
      assert.equal((await send('turn', { key, x: 0, y: 1 })).status, 204)
      for (let i = 0; i < 23; i++) assert.equal((await send('join', { key: 'another_key_' + String(i).padStart(8, '0'), name: 'B' })).status, 201)
      assert.equal((await send('join', { key: 'one_more_key_123456', name: 'C' })).status, 429)
    } finally { await readers[1].cancel() }
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


test('a slow stream keeps the newest snapshot and every pending ending', () => {
  const world = createWorld()
  const first = world.snapshot()
  const ending = { id: 'player', reason: 'Tangle!', score: 10, length: 7 }
  const merged = mergeSnapshots({ ...first, ended: [ending] }, { ...first, step: 2 })
  assert.equal(merged.step, 2)
  assert.deepEqual(merged.ended, [ending])
})

test('spectators see the last player leave and unload closes streams', () =>
  withApp(async (app) => {
    const key = 'player_key_123456789'
    const spectator = await app.root.router.request('/banana/room/events?key=spectator_key_123456')
    const reader = spectator.body!.getReader()
    const player = await app.root.router.request('/banana/room/events?key=' + key)
    const playerReader = player.body!.getReader()
    const joined = await app.root.router.request('/banana/room/join', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, name: 'Ada' }),
    })
    assert.equal(joined.status, 201)
    let text = ''
    while (!text.includes('"name":"Ada"')) text += new TextDecoder().decode((await reader.read()).value)
    // A short drop keeps the game: back within the grace period, the same banana is still there after it has passed.
    await playerReader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const back = (await app.root.router.request('/banana/room/events?key=' + key)).body!.getReader()
    const until = Date.now() + 4500
    while (Date.now() < until) text = new TextDecoder().decode((await reader.read()).value)
    assert.ok(text.includes('"name":"Ada"'), 'a short drop does not end the game')
    await back.cancel()
    text = ''
    while (!text.includes('"players":[]')) text += new TextDecoder().decode((await reader.read()).value)
    await app.stop()
    while (!(await reader.read()).done) { /* drain the stream */ }
  }))
