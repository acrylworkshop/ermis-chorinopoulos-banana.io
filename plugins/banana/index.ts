/**
 * Ripe: a one-page game where you grow a banana by eating fruit and it browns as you go, with a shared top ten.
 *
 * The page is at `/banana` and the home page carries a widget that links to it. Scores are kept in `banana.json` in the app's home,
 * written whole through a temporary file and a rename, so they survive a restart and a reload.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl, type MiddlewareHandler } from '@acryldev/blends'
import { streamSSE } from '@acryldev/blends/streaming'
import type {} from '@acryldev/instance'
import type {} from '../home/index.ts'
import { bananaPage } from './page.ts'
import { createWorld, STEP_MS } from './world.ts'

export const name = 'banana'
export const inject = ['router', 'home', 'appInstance']

/** One row of the board. */
interface Score {
  readonly name: string
  readonly score: number
  readonly at: number
}

/** How many rows the file keeps, and how many the page shows. */
const KEEP = 50
const TOP = 10
const NAME_MAX = 16
const SCORE_MAX = 1_000_000
/** The board every page draws on, so a cell another player sends lands where this page draws it. */
const GRID = 30

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** A home network's address first, so a friend on the same Wi-Fi gets the plain address rather than a VPN's. */
function addressRank(address: string): number {
  if (address.startsWith('192.168.')) return 0
  if (address.startsWith('10.')) return 1
  return /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2 : 3
}

/** A virtual adapter (Hyper-V, Docker, a virtual machine) is not an address a friend on the network can reach. */
const VIRTUAL = /vEthernet|Hyper-?V|Docker|WSL|VirtualBox|VMware|Loopback|Bluetooth/i

/** This machine's address on the network, which the page turns into the link other people join with; nothing when it has none. */
function lanAddress(): string | undefined {
  const candidates: { name: string; address: string }[] = []
  for (const [name, nets] of Object.entries(networkInterfaces()))
    for (const net of nets ?? [])
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address })
  // A real adapter first, then the home ranges, so the link is the one a person on the network can actually open.
  candidates.sort(
    (a, b) =>
      Number(VIRTUAL.test(a.name)) - Number(VIRTUAL.test(b.name)) ||
      addressRank(a.address) - addressRank(b.address),
  )
  return candidates[0]?.address
}

/** True while the app listens on this machine only: the join link works once it listens on the network. */
function localOnly(ctx: Context): boolean {
  const hostname = (ctx.get('nodeServer') as unknown as { hostname?: string } | undefined)?.hostname
  return hostname === undefined || hostname === 'localhost' || hostname.startsWith('127.')
}
const byRank = (a: Score, b: Score): number => b.score - a.score || a.at - b.at

function isScore(value: unknown): value is Score {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.name === 'string' &&
    row.name.length >= 1 &&
    row.name.length <= NAME_MAX &&
    typeof row.score === 'number' &&
    Number.isInteger(row.score) &&
    row.score >= 0 &&
    row.score <= SCORE_MAX &&
    typeof row.at === 'number'
  )
}

function readScores(file: string): Score[] {
  if (!existsSync(file)) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isScore).slice(0, KEEP) : []
  } catch {
    // A file a person edited by hand, or a half write: start the board empty rather than refuse to start.
    return []
  }
}

/** What a request may send, or nothing when it is not a score the board can keep. */
function readScore(value: unknown): Score | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.name !== 'string') return undefined
  const name = row.name.trim()
  if (name.length < 1 || name.length > NAME_MAX) return undefined
  if (typeof row.score !== 'number' || !Number.isInteger(row.score)) return undefined
  if (row.score < 0 || row.score > SCORE_MAX) return undefined
  return { name, score: row.score, at: Date.now() }
}

const KEY = /^[A-Za-z0-9_-]{16,64}$/

type Snapshot = ReturnType<ReturnType<typeof createWorld>['snapshot']>

export function mergeSnapshots(previous: Snapshot | undefined, next: Snapshot): Snapshot {
  return previous ? { ...next, ended: [...previous.ended, ...next.ended] } : next
}

export function apply(ctx: Context): void {
  const file = join(ctx.appInstance.home, 'banana.json')
  let scores = readScores(file)
  const world = createWorld()
  const streams = new Map<string, Set<(snapshot?: ReturnType<typeof world.snapshot>) => void>>()
  const disconnected = new Map<string, true>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const stopIfEmpty = () => { if (!world.count && timer) { clearTimeout(timer); timer = undefined } }
  const startTimer = () => {
    if (!timer) {
      let next = performance.now() + STEP_MS
      const tick = () => {
        world.step()
        for (const key of disconnected.keys()) if (world.resume(key).state !== 'playing') disconnected.delete(key)
        const snapshot = world.snapshot()
        for (const group of streams.values()) for (const send of group) send(snapshot)
        stopIfEmpty()
        if (!timer) return
        next += STEP_MS
        const now = performance.now()
        if (now - next > 3 * STEP_MS) next = now + STEP_MS
        timer = setTimeout(tick, Math.max(0, next - now))
        timer.unref()
      }
      timer = setTimeout(tick, STEP_MS)
      timer.unref()
    }
  }
  ctx.effect(() => () => {
    if (timer) clearTimeout(timer)
    for (const group of streams.values()) for (const close of group) close()
    streams.clear()
  })

  const attach = (key: string, send: (snapshot?: Snapshot) => void) => {
    const group = streams.get(key) ?? new Set<typeof send>()
    group.add(send)
    streams.set(key, group)
    disconnected.delete(key)
    return () => {
      group.delete(send)
      if (!group.size) {
        streams.delete(key)
        if (world.resume(key).state === 'playing') { disconnected.delete(key); disconnected.set(key, true) }
      }
    }
  }
  const joinRoom = (key: string, body: unknown) => {
    if (!body || typeof body !== 'object' || !('name' in body) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > NAME_MAX) return { error: 'invalid body', status: 400 } as const
    if (world.count >= 24 && world.resume(key).state !== 'playing') {
      const oldest = [...disconnected.keys()].find(key => world.resume(key).state === 'playing')
      if (oldest) {
        world.end(oldest, 'Replaced')
        disconnected.delete(oldest)
        const snapshot = world.snapshot()
        for (const group of streams.values()) for (const send of group) send(snapshot)
      }
    }
    const id = world.join(key, body.name.trim())
    if (!id) return { error: 'the counter is full', status: 429 } as const
    if (!streams.has(key)) { disconnected.delete(key); disconnected.set(key, true) }
    startTimer()
    return { id, step: world.snapshot().step } as const
  }
  const turnRoom = (key: string, body: unknown) => {
    if (!body || typeof body !== 'object' || !('x' in body) || !('y' in body) || typeof body.x !== 'number' || typeof body.y !== 'number' || !Number.isInteger(body.x) || !Number.isInteger(body.y) || Math.abs(body.x) + Math.abs(body.y) !== 1) return 400
    return world.turn(key, body.x, body.y) ? 204 : 404
  }

  const save = (): void => {
    mkdirSync(ctx.appInstance.home, { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(scores, null, 2))
    renameSync(`${file}.tmp`, file)
  }

  const board = (): Score[] => scores.slice(0, TOP)

  const app = new Acryl()
    .get('/', (c) =>
      c.html(bananaPage({ size: GRID, lanAddress: lanAddress(), localOnly: localOnly(ctx) })),
    )
    .get('/scores', (c) => c.json({ scores: board() }))
    .post('/scores', async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'invalid json' }, 400)
      }
      const score = readScore(body)
      if (!score)
        return c.json(
          {
            error: `a score needs a name of 1 to ${NAME_MAX} characters and a whole number from 0 to ${SCORE_MAX}`,
          },
          400,
        )
      scores = [...scores, score].sort(byRank).slice(0, KEEP)
      save()
      const rank = scores.indexOf(score) + 1
      return c.json({ scores: board(), rank: rank <= TOP ? rank : null }, 201)
    })
    .get('/room/events', (c) => {
      const key = c.req.query('key') ?? ''
      if (!KEY.test(key)) return c.json({ error: 'invalid key' }, 400)
      return streamSSE(c, async (stream) => {
        let resolve: (() => void) | undefined
        let pending: Snapshot | undefined
        let closed = false
        const send = (snapshot?: ReturnType<typeof world.snapshot>) => {
          if (snapshot) pending = mergeSnapshots(pending, snapshot)
          else closed = true
          resolve?.()
        }
        const detach = attach(key, send)
        const close = () => {
          if (closed) return
          closed = true
          detach()
          resolve?.()
        }
        stream.onAbort(close)
        try {
          await stream.writeSSE({ event: 'hello', data: '{}', retry: 500 })
          await stream.writeSSE({ event: 'room', data: JSON.stringify(world.snapshot()) })
          while (!closed && !stream.aborted) {
            if (!pending) await new Promise<void>(r => { resolve = r })
            resolve = undefined
            if (pending && !closed) {
              const snapshot = pending
              pending = undefined
              await stream.writeSSE({ event: 'room', data: JSON.stringify(snapshot) })
            }
          }
        } finally { close() }
      })
    })
    .post('/room/resume', async (c) => {
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'invalid body' }, 400) }
      if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !KEY.test(body.key)) return c.json({ error: 'invalid body' }, 400)
      const result = world.resume(body.key)
      return c.json({ ...result, connected: streams.has(body.key) })
    })
    .post('/room/join', async (c) => {
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'invalid body' }, 400) }
      if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !KEY.test(body.key)) return c.json({ error: 'invalid body' }, 400)
      const result = joinRoom(body.key, body)
      return 'error' in result ? c.json({ error: result.error }, result.status) : c.json(result, 201)
    })
    .post('/room/turn', async (c) => {
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'invalid body' }, 400) }
      if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !KEY.test(body.key)) return c.json({ error: 'invalid body' }, 400)
      const status = turnRoom(body.key, body)
      return status === 204 ? c.body(null, 204) : c.json({ error: status === 400 ? 'invalid body' : 'not playing' }, status)
    })

  ctx.router.route('/banana', app)

  ctx.inject(['nodeServer'], (scope) => {
    const upgrade = scope.nodeServer.upgrades()
    const sockets = new Acryl().get('/room/socket', (c, next) => {
      const key = c.req.query('key') ?? ''
      if (!KEY.test(key)) return c.json({ error: 'invalid key' }, 400)
      const origin = c.req.header('origin')
      if (origin) {
        try { if (new URL(origin).host !== c.req.header('host')) return c.body(null, 403) }
        catch { return c.body(null, 403) }
      }
      return next()
    }, upgrade((c) => {
      const key = c.req.query('key') ?? ''
      let detach = () => {}
      let pending: Snapshot | undefined
      return {
        onOpen(_event, socket) {
          const send = (snapshot?: Snapshot) => {
            if (!snapshot) { socket.close(1001, 'Plugin unloaded'); return }
            pending = mergeSnapshots(pending, snapshot)
            if (socket.bufferedAmount > 256 * 1024) return
            socket.send(JSON.stringify(pending))
            pending = undefined
          }
          detach = attach(key, send)
          send(world.snapshot())
        },
        onMessage(event, socket) {
          if (typeof event.data !== 'string' || Buffer.byteLength(event.data) > 65536) return
          let body: unknown
          try { body = JSON.parse(event.data) } catch { return }
          if (!body || typeof body !== 'object' || !('type' in body)) return
          if (body.type === 'join') {
            const result = joinRoom(key, body)
            socket.send(JSON.stringify('error' in result ? { type: 'error', error: result.error } : { type: 'joined', ...result }))
          } else if (body.type === 'turn') turnRoom(key, body)
        },
        onClose() { detach() },
      }
    }, { textOnly: true }) as unknown as MiddlewareHandler)
    scope.router.route('/banana', sockets)
  })

  ctx.effect(() =>
    ctx.home.widget({
      id: 'banana',
      title: 'Ripe',
      render: () => {
        const best = scores[0]
        const line = best
          ? `Best: <strong>${best.score}</strong> by ${escapeHtml(best.name)}`
          : 'Nobody has played yet. The banana browns fast.'
        return `<p>Eat fruit, grow the banana, and hold it in the golden band before it rots.</p>\n<p>${line}</p>\n<p><a href="./banana">Play Ripe</a></p>`
      },
    }),
  )
}
