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
import { Acryl } from '@acryldev/blends'
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
/** The shared counter: at most this many bananas at once, and one nobody has updated for this long has left. */
const ROOM_TTL = 4000
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
  const expiry = new Map<string, ReturnType<typeof setTimeout>>()
  let timer: ReturnType<typeof setInterval> | undefined
  const stopIfEmpty = () => { if (!world.count && timer) { clearInterval(timer); timer = undefined } }
  const startTimer = () => {
    if (!timer) {
      timer = setInterval(() => {
        world.step()
        const snapshot = world.snapshot()
        for (const group of streams.values()) for (const send of group) send(snapshot)
        stopIfEmpty()
      }, STEP_MS)
      timer.unref()
    }
  }
  /** Gives a player with no open stream ROOM_TTL to come back, so a short network drop does not end the game. */
  const expire = (key: string) => {
    clearTimeout(expiry.get(key))
    const timeout = setTimeout(() => { expiry.delete(key); world.leave(key) }, ROOM_TTL)
    timeout.unref()
    expiry.set(key, timeout)
  }
  ctx.effect(() => () => {
    if (timer) clearInterval(timer)
    for (const timeout of expiry.values()) clearTimeout(timeout)
    for (const group of streams.values()) for (const close of group) close()
    streams.clear()
  })

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
        const group = streams.get(key) ?? new Set<typeof send>()
        group.add(send)
        streams.set(key, group)
        const timeout = expiry.get(key)
        if (timeout) clearTimeout(timeout)
        expiry.delete(key)
        const close = () => {
          if (closed) return
          closed = true
          group.delete(send)
          if (!group.size) { streams.delete(key); expire(key) }
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
    .post('/room/join', async (c) => {
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'invalid body' }, 400) }
      if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !KEY.test(body.key) || !('name' in body) || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > NAME_MAX) return c.json({ error: 'invalid body' }, 400)
      const id = world.join(body.key, body.name.trim())
      if (!id) return c.json({ error: 'the counter is full' }, 429)
      if (!streams.has(body.key)) expire(body.key)
      startTimer()
      return c.json({ id, step: world.snapshot().step }, 201)
    })
    .post('/room/turn', async (c) => {
      let body: unknown
      try { body = await c.req.json() } catch { return c.json({ error: 'invalid body' }, 400) }
      if (!body || typeof body !== 'object' || !('key' in body) || typeof body.key !== 'string' || !KEY.test(body.key) || !('x' in body) || !('y' in body) || typeof body.x !== 'number' || typeof body.y !== 'number' || !Number.isInteger(body.x) || !Number.isInteger(body.y) || Math.abs(body.x) + Math.abs(body.y) !== 1) return c.json({ error: 'invalid body' }, 400)
      return world.turn(body.key, body.x, body.y) ? c.body(null, 204) : c.json({ error: 'not playing' }, 404)
    })

  ctx.router.route('/banana', app)

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
