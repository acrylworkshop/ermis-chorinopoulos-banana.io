export const STEP_MS = 120
const MIN_SIZE = 30
type Cell = [number, number]
type Food = { x: number; y: number; kind: 'grape' | 'sugar' | 'ice' }
type Player = { id: string; name: string; cells: Cell[]; score: number; ripe: number; dir: Cell; queue: Cell[] }

export function createWorld({ random = Math.random }: { random?: () => number } = {}) {
  const players = new Map<string, Player>()
  let foods: Food[] = []
  let size = MIN_SIZE
  let peak = 0
  let tick = 0
  let ended: { id: string; reason: string; score: number; length: number }[] = []
  const taken = (except?: string) => new Set([...players.entries()].filter(([key]) => key !== except).flatMap(([, p]) => p.cells.map(([x, y]) => y * size + x)).concat(foods.map(f => f.y * size + f.x)))
  const refill = () => {
    const occupied = taken()
    const target = Math.max(3, Math.round(size * size / 150))
    if (foods.length >= target) { foods = foods.slice(0, target); return }
    const free: Cell[] = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (!occupied.has(y * size + x)) free.push([x, y])
    const average = [...players.values()].reduce((sum, p) => sum + p.ripe, 0) / (players.size || 1)
    while (foods.length < target && free.length) {
      const index = Math.floor(random() * free.length)
      const [x, y] = free[index]
      free[index] = free[free.length - 1]
      free.pop()
      const roll = random()
      foods.push({ x, y, kind: average > 22 && roll > .93 ? 'ice' : roll > .7 ? 'sugar' : 'grape' })
    }
  }
  refill()
  return {
    get size() { return size },
    get count() { return players.size },
    join(key: string, name: string) {
      const old = players.get(key)
      if (!old && players.size >= 24) return undefined
      const oldSize = size
      const nextPeak = Math.max(peak, players.size + (old ? 0 : 1))
      size = MIN_SIZE + 6 * (nextPeak - 1)
      const occupied = taken(key)
      const near = new Set<number>()
      for (const [otherKey, player] of players) if (otherKey !== key) for (const [x, y] of player.cells)
        for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++)
          if (dx * dx + dy * dy < 64) near.add(((y + dy + size) % size) * size + (x + dx + size) % size)
      const fits = (x: number, y: number) => Array.from({ length: 6 }, (_, i) => (x - i + size) % size)
        .every(cx => !occupied.has(y * size + cx))
      const distant = (x: number, y: number) => Array.from({ length: 6 }, (_, i) => (x - i + size) % size)
        .every(cx => !near.has(y * size + cx))
      let spot: Cell | undefined
      for (let i = 0; i < 100 && !spot; i++) {
        const x = Math.floor(random() * size), y = Math.floor(random() * size)
        if (fits(x, y) && distant(x, y)) spot = [x, y]
      }
      for (let y = 0; y < size && !spot; y++) for (let x = 0; x < size && !spot; x++) if (fits(x, y) && distant(x, y)) spot = [x, y]
      for (let y = 0; y < size && !spot; y++) for (let x = 0; x < size && !spot; x++) if (fits(x, y)) spot = [x, y]
      if (!spot) { size = oldSize; return undefined }
      peak = nextPeak
      const [x, y] = spot
      const id = old?.id ?? crypto.randomUUID()
      players.set(key, { id, name, cells: Array.from({ length: 6 }, (_, i) => [(x - i + size) % size, y]), score: 0, ripe: 0, dir: [1, 0], queue: [] })
      refill()
      return id
    },
    turn(key: string, x: number, y: number) {
      const p = players.get(key)
      if (!p) return false
      if (Math.abs(x) + Math.abs(y) !== 1 || !Number.isInteger(x) || !Number.isInteger(y)) return true
      const last = p.queue.at(-1) ?? p.dir
      if ((x === last[0] && y === last[1]) || (x === -last[0] && y === -last[1])) return true
      if (p.queue.length < 2) p.queue.push([x, y])
      return true
    },
    leave(key: string) { players.delete(key); if (!players.size) { size = MIN_SIZE; peak = 0; foods = foods.filter(f => f.x < size && f.y < size) }; refill() },
    step() {
      tick++
      ended = []
      for (const [key, p] of players) {
        p.ripe = Math.min(100, p.ripe + .00035 * STEP_MS)
        p.dir = p.queue.shift() ?? p.dir
        const head: Cell = [(p.cells[0][0] + p.dir[0] + size) % size, (p.cells[0][1] + p.dir[1] + size) % size]
        let reason = p.cells.some(c => c[0] === head[0] && c[1] === head[1]) ? 'Tangle!' : ''
        if (!reason) {
          p.cells.unshift(head)
          const index = foods.findIndex(f => f.x === head[0] && f.y === head[1])
          if (index < 0) p.cells.pop()
          else {
            const [food] = foods.splice(index, 1)
            const multiplier = p.ripe >= 25 && p.ripe <= 60 ? 2 : 1
            if (food.kind === 'ice') { p.score += 5 * multiplier; p.ripe = Math.max(0, p.ripe - 28); p.cells.pop() }
            else { p.score += (food.kind === 'sugar' ? 25 : 10) * multiplier; p.ripe = Math.max(0, p.ripe - (food.kind === 'sugar' ? 15 : 8)); if (p.cells.length > 200) p.cells.pop() }
          }
          if (p.ripe >= 100) reason = 'Rotten!'
        }
        if (reason) { ended.push({ id: p.id, reason, score: p.score, length: p.cells.length }); players.delete(key) }
      }
      if (!players.size) { size = MIN_SIZE; peak = 0; foods = foods.filter(f => f.x < size && f.y < size) }
      refill()
    },
    snapshot() { return { step: tick, size: size, foods: foods.map(f => ({ ...f })), players: [...players.values()].map(p => ({ id: p.id, name: p.name, cells: p.cells.map(c => [...c]), score: p.score, ripe: p.ripe })), ended: ended.map(e => ({ ...e })) } },
  }
}
