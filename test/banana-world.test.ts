import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorld } from '../plugins/banana/world.ts'

test('world restarts a player with the same public id, wraps, tangles and removes leavers', () => {
  const world = createWorld({ random: () => 0 })
  const id = world.join('secret', 'Ada')
  assert.ok(id)
  assert.notEqual(id, 'secret')
  assert.equal(world.join('secret', 'Ada'), id)
  const start = world.snapshot().players[0].cells[0]
  for (let i = 0; i < 30; i++) world.step()
  assert.deepEqual(world.snapshot().players[0].cells[0], start)
  world.turn('secret', 0, 1); world.step()
  world.turn('secret', -1, 0); world.step()
  world.turn('secret', 0, -1); world.step()
  assert.equal(world.snapshot().ended[0].reason, 'Tangle!')
  assert.equal(world.count, 0)
  world.join('secret', 'Ada')
  world.leave('secret')
  assert.equal(world.count, 0)
})

test('a banana eventually rots without food', () => {
  // The food lies on row 0 and the banana glides along row 15, so it never eats.
  let roll = 0
  const world = createWorld({ random: () => roll })
  roll = 0.5
  world.join('secret', 'Ada')
  for (let i = 0; i < 3000 && world.count; i++) world.step()
  assert.equal(world.snapshot().ended[0].reason, 'Rotten!')
})


test('food never appears on a banana', () => {
  const world = createWorld()
  for (let i = 0; i < 24; i++) world.join(String(i), 'Player')
  for (let i = 0; i < 100; i++) {
    const { players, foods } = world.snapshot()
    const cells = new Set(players.flatMap(p => p.cells.map(([x, y]) => `${x},${y}`)))
    for (const food of foods) assert.ok(!cells.has(`${food.x},${food.y}`))
    world.step()
  }
})

test('grape and sugar make the banana fresher and never below 0', () => {
  let roll = 0.5
  const world = createWorld({ random: () => roll })
  world.join('a', 'a')
  const drop = { grape: 8, sugar: 15, ice: 28 }
  const seen = new Set<string>()
  // Two laps round every row of the board: right along a row, one down, right again. It meets every food and never itself.
  for (let i = 0; i < 6000 && seen.size < 3; i++) {
    roll = [0.5, 0.8, 0.95][Math.floor(i / 7) % 3] as number
    world.turn('a', i % 30 === 29 ? 0 : 1, i % 30 === 29 ? 1 : 0)
    const before = world.snapshot()
    world.step()
    const after = world.snapshot()
    const me = after.players[0]
    if (!me) {
      world.join('a', 'a')
      continue
    }
    const [x, y] = me.cells[0]!
    const food = before.foods.find((f) => f.x === x && f.y === y)
    if (!food) continue
    const expected = Math.max(0, before.players[0]!.ripe + 0.042 - drop[food.kind])
    assert.ok(Math.abs(me.ripe - expected) < 1e-6, `${food.kind}: ${before.players[0]!.ripe} -> ${me.ripe}`)
    if (before.players[0]!.ripe > 0) seen.add(food.kind)
  }
  // Frost only appears on a ripe counter, which this well-fed banana never makes; its -28 is checked when it is met.
  assert.ok(seen.has('grape') && seen.has('sugar'), [...seen].join())
})

test('the counter grows with its peak, preserves bodies, wraps and resets when empty', () => {
  const world = createWorld({ random: () => 0 })
  for (let i = 0; i < 24; i++) {
    const before = world.snapshot().players.map(p => p.cells)
    assert.ok(world.join(String(i), 'Player'))
    const snapshot = world.snapshot()
    assert.equal(snapshot.size, 30 + 6 * i)
    for (let j = 0; j < i; j++) {
      const cells = snapshot.players[j].cells
      assert.deepEqual(cells[0], before[j][0])
      for (let k = 1; k < cells.length; k++) {
        const dx = Math.abs(cells[k][0] - cells[k - 1][0]), dy = Math.abs(cells[k][1] - cells[k - 1][1])
        assert.equal(Math.min(dx, snapshot.size - dx) + Math.min(dy, snapshot.size - dy), 1)
      }
    }
    assert.equal(snapshot.foods.length, Math.max(3, Math.round(snapshot.size ** 2 / 150)))
    const added = snapshot.players[i]
    for (const cell of added.cells) for (const other of snapshot.players.slice(0, i)) for (const c of other.cells) {
      const dx = Math.min(Math.abs(cell[0] - c[0]), snapshot.size - Math.abs(cell[0] - c[0]))
      const dy = Math.min(Math.abs(cell[1] - c[1]), snapshot.size - Math.abs(cell[1] - c[1]))
      assert.ok(dx * dx + dy * dy >= 64)
    }
  }
  for (let i = 1; i < 24; i++) world.leave(String(i))
  assert.equal(world.size, 168)
  world.leave('0')
  const empty = world.snapshot()
  assert.equal(empty.size, 30)
  assert.equal(empty.foods.length, 6)
  assert.ok(empty.foods.every(f => f.x < 30 && f.y < 30))
  world.join('new', 'Player')
  world.join('next', 'Player')
  assert.equal(world.size, 36)
})

test('a full room with long bananas steps quickly', async () => {
  const { readFile } = await import('node:fs/promises')
  const { stripTypeScriptTypes } = await import('node:module')
  const source = await readFile(new URL('../plugins/banana/world.ts', import.meta.url), 'utf8')
  const instrumented = source.replace('    get size() {', '    get fixturePlayers() { return players },\n    get size() {')
  const module = await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(instrumented)))
  const world = module.createWorld({ random: () => 0 })
  for (let i = 0; i < 24; i++) world.join(String(i), 'Player')
  for (const [i, player] of [...world.fixturePlayers.values()].entries()) {
    player.cells = Array.from({ length: 200 }, (_, n) => [(100 - n % 100 + 168) % 168, i * 7 + Math.floor(n / 100)])
  }
  const times: number[] = []
  for (let i = 0; i < 50; i++) {
    const start = performance.now()
    world.step()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  assert.ok((times[24] + times[25]) / 2 < 30)
})

test('the board keeps its size when a player rejoins after others left, and resets when the last banana ends', () => {
  const world = createWorld({ random: () => 0.5 })
  for (const key of ['a', 'b', 'c']) world.join(key, key)
  assert.equal(world.size, 42)
  world.leave('b')
  world.leave('c')
  world.join('a', 'a')
  assert.equal(world.size, 42, 'a rejoin does not shrink the board')
  for (const [x, y] of [[0, 1], [-1, 0], [0, -1]]) {
    world.turn('a', x, y)
    world.step()
  }
  assert.equal(world.snapshot().ended[0]?.reason, 'Tangle!')
  assert.equal(world.count, 0)
  assert.equal(world.size, 30, 'an empty room starts small again')
  assert.ok(world.snapshot().foods.every((food) => food.x < 30 && food.y < 30))
})

async function fixture() {
  const { readFile } = await import('node:fs/promises')
  const { stripTypeScriptTypes } = await import('node:module')
  const source = await readFile(new URL('../plugins/banana/world.ts', import.meta.url), 'utf8')
  const code = source.replace('    get size() {', '    get fixturePlayers() { return players },\n    get fixtureFoods() { return foods },\n    get size() {')
  return (await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(code)))).createWorld({ random: () => 0 })
}

function place(world: any, key: string, id: string, cells: number[][], dir: number[], ripe = 0) {
  world.join(key, key)
  const p = world.fixturePlayers.get(key)
  Object.assign(p, { id, cells, dir, ripe, safeUntil: 0, growth: 0 })
  return p
}

test('contacts resolve by start length for body, head, swap, and equal lengths', async () => {
  for (const kind of ['long-body', 'short-body', 'head', 'swap', 'equal']) {
    const world = await fixture()
    const long = place(world, 'long', 'a', [[4, 5], [3, 5], [2, 5], [1, 5]], [1, 0])
    const short = place(world, 'short', 'b', [[6, 4], [6, 3], [6, 2]], [0, 1])
    if (kind === 'long-body') Object.assign(short, { cells: [[5, 4], [5, 5], [5, 6]], dir: [1, 0] })
    if (kind === 'short-body') Object.assign(short, { cells: [[3, 4], [3, 3], [3, 2]], dir: [0, 1] })
    if (kind === 'head' || kind === 'equal') Object.assign(short, { cells: [[5, 4], [5, 3], [5, 2]], dir: [0, 1] })
    if (kind === 'swap') Object.assign(short, { cells: [[5, 5], [6, 5], [7, 5]], dir: [-1, 0] })
    if (kind === 'equal') long.cells.pop()
    world.step()
    if (kind === 'equal') assert.equal(world.count, 2)
    else {
      assert.equal(world.resume('short').reason, 'Eaten!', kind)
      assert.equal(world.resume('short').by, 'long')
      assert.equal(world.snapshot().ended[0].by, 'long')
    }
  }
})

test('longest contact wins independently of join order and an eaten player cannot eat', async () => {
  for (const order of [['a', 'b', 'c'], ['c', 'b', 'a']]) {
    const world = await fixture()
    const defs: Record<string, [number[][], number[]]> = {
      a: [[[4, 5], [3, 5], [2, 5], [1, 5], [0, 5]], [1, 0]],
      b: [[[5, 4], [5, 3], [5, 2], [5, 1]], [0, 1]],
      c: [[[6, 5], [7, 5], [8, 5]], [-1, 0]],
    }
    for (const key of order) place(world, key, key, ...defs[key])
    world.step()
    assert.equal(world.resume('b').by, 'a')
    assert.equal(world.resume('c').by, 'a')
  }
})

test('eating grows gradually, rounds up, scores in the golden band and cools', async () => {
  for (const ripe of [40, 0]) {
    const world = await fixture()
    const eater = place(world, 'eater', 'a', [[4, 5], [3, 5], [2, 5], [1, 5]], [1, 0], ripe)
    place(world, 'victim', 'b', [[5, 4], [5, 3], [5, 2]], [0, 1])
    world.step()
    assert.equal(eater.score, ripe ? 60 : 30)
    assert.ok(Math.abs(eater.ripe - (ripe ? 10.042 : 0)) < 1e-6)
    assert.equal(eater.cells.length, 4)
    world.step(); assert.equal(eater.cells.length, 5)
    world.step(); assert.equal(eater.cells.length, 6)
    world.step(); assert.equal(eater.cells.length, 6)
  }
})

test('new and restarted players are safe for 25 moves', async () => {
  const world = await fixture()
  world.join('a', 'a')
  assert.equal(world.snapshot().players[0].safe, true)
  for (let i = 0; i < 25; i++) world.step()
  assert.equal(world.snapshot().players[0].safe, true, 'the 25th move is still protected, and shown so')
  world.step()
  assert.equal(world.snapshot().players[0].safe, false)
  world.join('a', 'a')
  assert.equal(world.snapshot().players[0].safe, true)
})

test('frost appears on a ripe board and cools by 28; food growth is capped', async () => {
  const world = await fixture()
  const p = place(world, 'a', 'a', [[10, 10], [9, 10], [8, 10]], [1, 0], 40)
  world.fixtureFoods.splice(0, world.fixtureFoods.length, { x: 11, y: 10, kind: 'ice' })
  world.step()
  assert.ok(Math.abs(p.ripe - 12.042) < 1e-6)
  const capped = await fixture()
  const body = Array.from({ length: 200 }, (_, i) => [10 - i % 10, 10 + Math.floor(i / 10)])
  const q = place(capped, 'a', 'a', body, [1, 0])
  capped.fixtureFoods.splice(0, capped.fixtureFoods.length, { x: 11, y: 10, kind: 'grape' })
  capped.step()
  assert.equal(q.cells.length, 200)
})


test('eating growth is capped and protected players cannot participate', async () => {
  const world = await fixture()
  const body = Array.from({ length: 199 }, (_, i) => [10 - i % 10, 10 + Math.floor(i / 10)])
  const eater = place(world, 'eater', 'a', body, [1, 0])
  const victim = place(world, 'victim', 'b', [[11, 9], [11, 8], [11, 7]], [0, 1])
  victim.safeUntil = 1
  world.step()
  assert.equal(world.count, 2)
  Object.assign(victim, { cells: [[12, 9], [12, 8], [12, 7]], dir: [0, 1] })
  world.step()
  assert.equal(world.resume('victim').reason, 'Eaten!')
  world.step(); world.step()
  assert.equal(eater.cells.length, 200)
})

test('a banana eaten in a step eats nobody in it', async () => {
  const world = await fixture()
  place(world, 'a', 'a', [[4, 5], [3, 5], [2, 5], [1, 5], [0, 5]], [1, 0])
  place(world, 'b', 'b', [[5, 4], [5, 5], [5, 6], [5, 7]], [0, -1])
  place(world, 'c', 'c', [[6, 3], [7, 3], [8, 3]], [-1, 0])
  world.step()
  assert.equal(world.resume('b').by, 'a')
  assert.equal(world.resume('c').state, 'playing')
})

test('food eaten in the same step does not decide who is bigger', async () => {
  const world = await fixture()
  place(world, 'a', 'a', [[4, 5], [3, 5], [2, 5]], [1, 0])
  place(world, 'b', 'b', [[5, 4], [5, 3], [5, 2]], [0, 1])
  world.fixtureFoods.unshift({ x: 5, y: 5, kind: 'grape' })
  world.step()
  assert.deepEqual(world.snapshot().players.map((p: any) => p.cells.length).sort(), [3, 4])
})

test('a ripe board spawns frost', async () => {
  const world = await fixture()
  place(world, 'a', 'a', [[10, 10], [9, 10], [8, 10]], [1, 0], 40)
  // Refill chooses frost when its random roll exceeds .93.
  const { readFile } = await import('node:fs/promises')
  const { stripTypeScriptTypes } = await import('node:module')
  const source = (await readFile(new URL('../plugins/banana/world.ts', import.meta.url), 'utf8')).replace('    get size() {', '    get fixturePlayers() { return players },\n    get fixtureFoods() { return foods },\n    get size() {')
  const ripeWorld = (await import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(source)))).createWorld({ random: () => 0.99 })
  place(ripeWorld, 'a', 'a', [[10, 10], [9, 10], [8, 10]], [1, 0], 40)
  ripeWorld.fixtureFoods.splice(0)
  ripeWorld.step()
  assert.ok(ripeWorld.snapshot().foods.some((f: { kind: string }) => f.kind === 'ice'))
})
