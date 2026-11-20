/**
 * Ripe: a one-page game where you grow a banana by eating fruit and it browns as you go, with a shared top ten.
 *
 * The page is at `/banana` and the home page carries a widget that links to it. Scores are kept in `banana.json` in the app's home,
 * written whole through a temporary file and a rename, so they survive a restart and a reload.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '@acryldev/blends'
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

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

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

export function apply(ctx: Context): void {
  const file = join(ctx.appInstance.home, 'banana.json')
  let scores = readScores(file)

  const save = (): void => {
    mkdirSync(ctx.appInstance.home, { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(scores, null, 2))
    renameSync(`${file}.tmp`, file)
  }

  const board = (): Score[] => scores.slice(0, TOP)

  const app = new Acryl()
    .get('/', (c) => c.html(bananaPage()))
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
