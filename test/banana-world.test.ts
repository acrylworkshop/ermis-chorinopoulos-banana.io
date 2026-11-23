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
