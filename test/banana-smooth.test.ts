import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { bananaPage } from '../plugins/banana/page.ts'

type Advance = (clock: number, dt: number, latest: number, age: number, estimate: number, margin: number) => number

const source = /function advanceClock\([^]*?\n      }/.exec(bananaPage({ size: 30 }))?.[0]
const advance = runInNewContext('(' + source + ')') as Advance

/** Plays 60 frames a second against updates that arrive after the given gaps; the size of every frame's advance, in steps. */
function play(gaps: number[], estimate: number, margin: number): { moves: number[]; behind: number } {
  const arrivals: number[] = []
  let at = 0
  for (const gap of gaps) arrivals.push((at += gap))
  const moves: number[] = []
  let clock = -margin
  let latest = 0
  let received = 0
  for (let now = 0; now < at; now += 1000 / 60) {
    while (latest < arrivals.length && arrivals[latest]! <= now) received = arrivals[latest++]!
    if (latest < 2) {
      clock = latest - 1 - margin
      continue
    }
    const next = advance(clock, 1000 / 60, latest, now - received, estimate, margin)
    moves.push(next - clock)
    clock = next
  }
  return { moves: moves.slice(60), behind: latest - clock }
}

const unevenness = (moves: number[]): number => {
  const mean = moves.reduce((sum, move) => sum + move, 0) / moves.length
  return Math.max(...moves.map((move) => Math.abs(move / mean - 1)))
}
const repeat = (gaps: number[], times: number): number[] => Array.from({ length: times }, () => gaps).flat()

test('the picture advances evenly on even updates and on the timer that alternates 109 and 125 ms', () => {
  // The page raises its margin with the measured jitter: about 0.2 for the second beat.
  assert.ok(unevenness(play(repeat([120], 100), 120, 0.15).moves) < 0.1)
  assert.ok(unevenness(play(repeat([109, 125, 125], 40), 120, 0.2).moves) < 0.1)
})

test('40 ms of jitter never stalls the picture, and a long gap is caught up without going backwards', () => {
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  // Each update is late by its own 0 to 40 ms against a steady beat.
  const late = Array.from({ length: 121 }, () => random() * 40)
  const jitter = late.slice(1).map((delay, i) => 120 + delay - late[i]!)
  assert.ok(unevenness(play(jitter, 120, 0.5).moves) < 0.25)

  const gap = play([...repeat([120], 60), 300, ...repeat([120], 60)], 120, 0.15)
  assert.ok(gap.moves.every((move) => move >= 0))
  assert.ok(gap.behind < 1.6, `still ${gap.behind} steps behind`)
})

test('the clock starts again after a restart of the counter or a hidden tab', () => {
  assert.ok(advance(500, 16, 3, 0, 120, 0.15) <= 3)
  assert.ok(advance(10, 16, 400, 0, 120, 0.15) > 398)
})
