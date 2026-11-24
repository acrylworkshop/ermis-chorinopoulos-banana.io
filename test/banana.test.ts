import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext, Script } from 'node:vm'
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
      assert.equal((await send('join', { key: 'one_more_key_123456', name: 'C' })).status, 201)
      assert.equal((await (await send('resume', { key: 'another_key_00000000' })).json() as { reason: string }).reason, 'Replaced')
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

test('a disconnected banana keeps moving and its ending can be resumed', () =>
  withApp(async (app) => {
    const send = (path: string, body: unknown) => app.root.router.request('/banana/room/' + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const key = 'player_key_123456789'
    assert.equal((await send('resume', { key: 'bad' })).status, 400)
    assert.deepEqual(await (await send('resume', { key })).json(), { state: 'none' })
    const { id } = await (await send('join', { key, name: 'Ada' })).json() as { id: string }
    const player = (await app.root.router.request('/banana/room/events?key=' + key)).body!.getReader()
    assert.deepEqual(await (await send('resume', { key })).json(), { state: 'playing', id, step: 0, name: 'Ada', connected: true })
    await player.cancel()
    await new Promise(resolve => setTimeout(resolve, 5100))
    const playing = await (await send('resume', { key })).json() as { state: string; step: number; connected: boolean }
    assert.equal(playing.state, 'playing')
    assert.ok(playing.step > 0, 'the world advanced while disconnected')
    assert.equal(playing.connected, false)
    const spectator = (await app.root.router.request('/banana/room/events?key=spectator_key_123456')).body!.getReader()
    for (const [x, y] of [[0, 1], [-1, 0], [0, -1]]) {
      await send('turn', { key, x, y })
      await new Promise(resolve => setTimeout(resolve, 125))
    }
    await new Promise(resolve => setTimeout(resolve, 130))
    const result = await (await send('resume', { key })).json() as { state: string; reason: string; score: number; length: number; name: string }
    assert.equal(result.state, 'ended')
    assert.equal(result.reason, 'Tangle!')
    assert.equal(result.name, 'Ada')
    let text = ''
    while (!text.includes('Tangle!')) text += new TextDecoder().decode((await spectator.read()).value)
    assert.ok(!text.includes(key))
    await send('join', { key, name: 'Ada' })
    assert.equal((await (await send('resume', { key })).json() as { state: string }).state, 'playing')
    await spectator.cancel()
  }))

test('growth keeps bodies contiguous across either old edge and preserves ordinary bodies', () => {
  for (const direction of ['x', 'y', 'none']) {
    let values: number[] = []
    const world = createWorld({ random: () => values.shift() ?? 0.5 })
    values = direction === 'x' ? [2 / 30, 15 / 30] : direction === 'y' ? [15 / 30, 2 / 30] : [15 / 30, 15 / 30]
    world.join('first', 'Ada')
    if (direction === 'y') {
      world.turn('first', 0, -1)
      for (let i = 0; i < 3; i++) world.step()
    }
    const before = world.snapshot().players[0].cells
    world.join('second', 'Bela')
    const after = world.snapshot().players[0].cells
    if (direction === 'none') assert.deepEqual(after, before)
    else {
      assert.deepEqual(after[0], before[0])
      for (let i = 1; i < after.length; i++) {
        const dx = Math.abs(after[i][0] - after[i - 1][0]), dy = Math.abs(after[i][1] - after[i - 1][1])
        assert.equal(Math.min(dx, world.size - dx) + Math.min(dy, world.size - dy), 1)
      }
    }
    world.step()
    assert.equal(world.resume('first').state, 'playing')
  }
})


test('browser digestion detects gains and moves a smooth bump from mouth to tail', () =>
  withApp(async (app) => {
    const html = await (await app.root.router.request('/banana')).text()
    function pageFunction(name: string): (...args: unknown[]) => number {
      const source = html.match(new RegExp('function ' + name + '\\([^]*?\\n      }'))?.[0]
      assert.ok(source, name + ' is present in the page')
      return runInNewContext('(' + source + ')') as (...args: unknown[]) => number
    }
    const detect = pageFunction('detectBulge')
    const bump = pageFunction('bulgeBump')
    const before = { id: 'a', score: 10, cells: [1, 2, 3] }
    assert.equal(detect(before, { ...before, score: 20 }), 0.35)
    assert.equal(detect(before, { ...before, score: 60 }), 0.35, 'a doubled sugar is food')
    assert.equal(detect(before, { ...before, score: 70 }), 0.7, 'the smallest eaten banana')
    assert.equal(detect(before, { ...before, cells: [1, 2, 3, 4] }), 0, 'growing over the next steps is not another meal')
    assert.equal(detect(before, { ...before, id: 'b', score: 50 }), 0)
    assert.equal(detect(before, { ...before, score: 0, cells: [1, 2, 3, 4] }), 0)
    assert.equal(detect(undefined, before), 0)
    assert.equal(bump(0, 0), 1)
    assert.equal(bump(0.5, 750), 1)
    assert.equal(bump(0, 750), 0)
    assert.ok(bump(0.6, 750) > 0 && bump(0.6, 750) < 1)
    assert.equal(bump(1, 1500), 0)
  }))


test('websocket room validates, joins, turns and disconnects', async () => {
  const { testWebSocket } = await import('../plugins/node-server/src/test-websocket.ts')
  const home = await mkdtemp(join(scratch, 'banana-socket-'))
  // This app listens, and the app running from this folder holds its door.
  const door = process.env.ACRYL_DOOR
  process.env.ACRYL_DOOR = 'off'
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0))
  const fetch = (request: Request, env: object) => app.root.router.fetch(request, {}, env)
  const key = 'socket_player_123456789'
  try {
    assert.equal((await testWebSocket(fetch, '/banana/room/socket?key=bad')).status, 400)
    assert.equal((await testWebSocket(fetch, '/banana/room/socket?key=' + key, { headers: { host: 'example.com', origin: 'http://evil.com' } })).status, 403)
    const result = await testWebSocket(fetch, '/banana/room/socket?key=' + key)
    assert.equal(result.status, 101)
    const { socket } = result
    assert.ok(socket)
    assert.ok(JSON.parse(socket.received[0]).players)
    socket.send('bad json')
    socket.send('x'.repeat(65537))
    socket.send(JSON.stringify({ type: 'join', name: 'Ada' }))
    const joined = JSON.parse(socket.received.at(-1)!)
    assert.equal(joined.type, 'joined')
    socket.send(JSON.stringify({ type: 'turn', x: 0, y: 1 }))
    socket.send(JSON.stringify({ type: 'turn', x: 1, y: 1 }))
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.ok(socket.received.some(text => JSON.parse(text).players?.some((p: { id: string }) => p.id === joined.id)))
    socket.close()
    const response = await app.root.router.request('/banana/room/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) })
    assert.equal((await response.json() as { connected: boolean }).connected, false)
    const next = await testWebSocket(fetch, '/banana/room/socket?key=' + key)
    assert.ok(next.socket)
    await app.stop()
    assert.equal(next.socket.closed?.code, 1001)
  } finally {
    if (door === undefined) delete process.env.ACRYL_DOOR
    else process.env.ACRYL_DOOR = door
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})



test('the page script is valid JavaScript', () =>
  withApp(async (app) => {
    const html = await (await app.root.router.request('/banana')).text()
    const script = html.match(/<script type="module">([^]*?)<\/script>/)?.[1] ?? ''
    assert.ok(script.length > 1000)
    // A module may await at the top level; an async function body parses the same statements.
    new Script('(async () => {' + script + '\n})')
  }))
test('trail interpolation travels evenly through an edge and a corner', async () => {
  await withApp(async app => {
    const html = await (await app.root.router.request('/banana')).text()
    const source = html.match(/function trailCells\([^]*?\n      }/)?.[0]
    assert.ok(source)
    const trail = runInNewContext('(' + source + ')') as (p: unknown, b: unknown, size: number, blend: number) => { x: number; y: number }[]
    const row = (from: number, count: number) => Array.from({ length: count }, (_, i) => [from - i, 5])
    const before = { moved: 4, credit: .75, lag: 1, cells: row(29, 24) }
    const player = { moved: 6, credit: 0, lag: 1, cells: [[0, 6], [0, 5], ...row(29, 22)] }
    const short = trail({ moved: 5, credit: 0, lag: 0, cells: [[8, 5], [7, 5]] }, { moved: 4, credit: 0, lag: 0, cells: [[7, 5], [6, 5]] }, 30, 1)
    assert.equal(short[0].x, 8, 'a short banana is drawn without delay')
    const midCell = [0, .25, .5, .75, 1].map(t => trail({ moved: 5, credit: .5, lag: 1, cells: row(20, 24) }, { moved: 4, credit: .25, lag: 1, cells: row(19, 24) }, 30, t)[0].x)
    // Growing past 20 cells eases the lag in: the head keeps moving forward at every step.
    const ease = runInNewContext('(' + html.match(/function nextLag\([^]*?\n      }/)?.[0] + ')') as (b: unknown, length: number) => number
    let from = { moved: 0, credit: 0, lag: ease(undefined, 20), cells: row(10, 20) }
    let head = 10
    for (let i = 1; i <= 15; i++) {
      const to = { moved: i, credit: i * .003, lag: ease(from, 21), cells: row(10 + i, 21) }
      const x = trail(to, from, 168, 1)[0].x
      assert.ok(x - head > .85 && x - head < 1.15, 'step ' + i + ' moved ' + (x - head))
      head = x
      from = to
    }
    assert.equal(from.lag, 1)
    for (let i = 1; i < midCell.length; i++) assert.ok(Math.abs(midCell[i] - midCell[i - 1] - .3125) < 1e-9, 'a long banana never stalls mid-cell')
    const heads = [0, .2, .4, .6, .8, 1].map(t => trail(player, before, 30, t)[0])
    for (let i = 1; i < heads.length; i++) assert.ok(Math.abs(Math.abs(heads[i].x - heads[i-1].x) + Math.abs(heads[i].y - heads[i-1].y) - .25) < 1e-9)
  })
})

test('the counter steps every 120 ms on average, not a little slower', () =>
  withApp(async (app) => {
    const post = (path: string, body: unknown) =>
      app.root.router.request('/banana/room/' + path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
    const key = 'beat_key_1234567890'
    const step = async () => ((await (await post('resume', { key })).json()) as { step: number }).step
    assert.equal((await post('join', { key, name: 'Beat' })).status, 201)
    while ((await step()) < 2) await new Promise((resolve) => setTimeout(resolve, 5))
    // A busy machine can delay one run, never hasten it: a drifting timer is late in every one.
    const runs: number[] = []
    while (runs.length < 3 && !runs.some((ms) => Math.abs(ms - 120) < 2.5)) {
      const first = await step()
      const start = performance.now()
      while ((await step()) < first + 25) await new Promise((resolve) => setTimeout(resolve, 3))
      runs.push((performance.now() - start) / 25)
    }
    assert.ok(runs.some((ms) => Math.abs(ms - 120) < 2.5), runs.map((ms) => ms.toFixed(1)).join(', ') + ' ms per step')
  }))
