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
const ROOM_SIZE = 24
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

/** One banana another player is steering, as the shared counter knows it. */
interface Peer {
  readonly id: string
  readonly name: string
  readonly cells: readonly { readonly x: number; readonly y: number }[]
  readonly score: number
  readonly ripe: number
  at: number
}

const PEER_ID = /^[A-Za-z0-9_-]{4,40}$/

/** One update from a page, or nothing when it is not something the counter can draw. */
function readPeer(value: unknown): Peer | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !PEER_ID.test(row.id)) return undefined
  if (typeof row.name !== 'string') return undefined
  const name = row.name.trim().slice(0, NAME_MAX)
  if (name.length < 1) return undefined
  if (typeof row.score !== 'number' || !Number.isInteger(row.score)) return undefined
  if (row.score < 0 || row.score > SCORE_MAX) return undefined
  if (typeof row.ripe !== 'number' || !Number.isFinite(row.ripe)) return undefined
  if (row.ripe < 0 || row.ripe > 100) return undefined
  if (!Array.isArray(row.cells) || row.cells.length > 200) return undefined
  const cells: { x: number; y: number }[] = []
  for (const cell of row.cells) {
    if (!Array.isArray(cell) || cell.length !== 2) return undefined
    const [x, y] = cell as [unknown, unknown]
    if (typeof x !== 'number' || typeof y !== 'number') return undefined
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return undefined
    cells.push({ x, y })
  }
  return { id: row.id, name, cells, score: row.score, ripe: row.ripe, at: Date.now() }
}

export function apply(ctx: Context): void {
  const file = join(ctx.appInstance.home, 'banana.json')
  let scores = readScores(file)
  /** Who is on the counter right now. It is a live room, so it starts empty at every reload and is never written. */
  const peers = new Map<string, Peer>()

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
    // The shared counter: a page listens here for every other banana, and pushes its own through /room/state.
    .get('/room/events', (c) => {
      const id = (c.req.query('id') ?? '').trim()
      if (!PEER_ID.test(id))
        return c.json(
          { error: 'the counter needs an id of 4 to 40 letters, digits, dashes or underscores' },
          400,
        )
      return streamSSE(c, async (stream) => {
        const leave = (): void => {
          peers.delete(id)
        }
        stream.onAbort(leave)
        try {
          await stream.writeSSE({ event: 'hello', data: JSON.stringify({ id }) })
          while (!stream.aborted) {
            const now = Date.now()
            for (const [key, peer] of peers) if (now - peer.at > ROOM_TTL) peers.delete(key)
            await stream.writeSSE({
              event: 'room',
              data: JSON.stringify({
                peers: [...peers.values()].map((peer) => ({
                  id: peer.id,
                  name: peer.name,
                  score: peer.score,
                  ripe: Math.round(peer.ripe),
                  cells: peer.cells.map((cell) => [cell.x, cell.y]),
                })),
              }),
            })
            await stream.sleep(120)
          }
        } finally {
          leave()
        }
      })
    })
    .post('/room/state', async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'invalid json' }, 400)
      }
      const peer = readPeer(body)
      if (!peer)
        return c.json(
          {
            error:
              `a banana needs an id, a name, a score, a ripeness from 0 to 100 and its cells on a ${GRID} by ${GRID} board`,
          },
          400,
        )
      if (!peers.has(peer.id) && peers.size >= ROOM_SIZE)
        return c.json({ error: 'the counter is full right now, try again in a moment' }, 429)
      peers.set(peer.id, peer)
      return c.body(null, 204)
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
