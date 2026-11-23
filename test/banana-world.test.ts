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
  const start = world.snapshot().players[0].cells[0]
  for (let i = 0; i < 168; i++) world.step()
  assert.deepEqual(world.snapshot().players[0].cells[0], start)
  world.leave('0')
  assert.equal(world.size, 168)
  for (let i = 1; i < 24; i++) world.leave(String(i))
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
