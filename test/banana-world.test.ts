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
  const world = createWorld({ random: () => 0 })
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
