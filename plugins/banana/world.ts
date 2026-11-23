export const STEP_MS = 120
const SIZE = 30
type Cell = [number, number]
type Food = { x: number; y: number; kind: 'grape' | 'sugar' | 'ice' }
type Player = { id: string; name: string; cells: Cell[]; score: number; ripe: number; dir: Cell; queue: Cell[] }

export function createWorld({ random = Math.random }: { random?: () => number } = {}) {
  const players = new Map<string, Player>()
  let foods: Food[] = []
  let tick = 0
  let ended: { id: string; reason: string; score: number; length: number }[] = []
  const taken = (except?: string) => new Set([...players.entries()].filter(([key]) => key !== except).flatMap(([, p]) => p.cells.map(([x, y]) => y * SIZE + x)).concat(foods.map(f => f.y * SIZE + f.x)))
  const refill = () => {
    const occupied = taken()
    while (foods.length < Math.max(3, 2 * players.size)) {
      const free: Cell[] = []
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++)
        if (!occupied.has(y * SIZE + x)) free.push([x, y])
      if (!free.length) break
      const [x, y] = free[Math.floor(random() * free.length)]
      const roll = random()
      const average = [...players.values()].reduce((sum, p) => sum + p.ripe, 0) / (players.size || 1)
      occupied.add(y * SIZE + x)
      foods.push({ x, y, kind: average > 22 && roll > .93 ? 'ice' : roll > .7 ? 'sugar' : 'grape' })
    }
    foods = foods.slice(0, Math.max(3, 2 * players.size))
  }
  refill()
  return {
    get size() { return SIZE },
    get count() { return players.size },
    join(key: string, name: string) {
      const old = players.get(key)
      if (!old && players.size >= 24) return undefined
      const occupied = taken(key)
      const fits = (x: number, y: number) => Array.from({ length: 6 }, (_, i) => (x - i + SIZE) % SIZE)
        .every(cx => !occupied.has(y * SIZE + cx))
      let spot: Cell | undefined
      for (let i = 0; i < 100 && !spot; i++) {
        const x = Math.floor(random() * SIZE), y = Math.floor(random() * SIZE)
        if (fits(x, y)) spot = [x, y]
      }
      for (let y = 0; y < SIZE && !spot; y++) for (let x = 0; x < SIZE && !spot; x++) if (fits(x, y)) spot = [x, y]
      if (!spot) return undefined
      const [x, y] = spot
      const id = old?.id ?? crypto.randomUUID()
      players.set(key, { id, name, cells: Array.from({ length: 6 }, (_, i) => [(x - i + SIZE) % SIZE, y]), score: 0, ripe: 0, dir: [1, 0], queue: [] })
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
    leave(key: string) { players.delete(key); refill() },
    step() {
      tick++
      ended = []
      for (const [key, p] of players) {
        p.ripe = Math.min(100, p.ripe + .00035 * STEP_MS)
        p.dir = p.queue.shift() ?? p.dir
        const head: Cell = [(p.cells[0][0] + p.dir[0] + SIZE) % SIZE, (p.cells[0][1] + p.dir[1] + SIZE) % SIZE]
        let reason = p.cells.some(c => c[0] === head[0] && c[1] === head[1]) ? 'Tangle!' : ''
        if (!reason) {
          p.cells.unshift(head)
          const index = foods.findIndex(f => f.x === head[0] && f.y === head[1])
          if (index < 0) p.cells.pop()
          else {
            const [food] = foods.splice(index, 1)
            const multiplier = p.ripe >= 25 && p.ripe <= 60 ? 2 : 1
            if (food.kind === 'ice') { p.score += 5 * multiplier; p.ripe = Math.max(0, p.ripe - 28); p.cells.pop() }
            else { p.score += (food.kind === 'sugar' ? 25 : 10) * multiplier; p.ripe = Math.min(100, p.ripe + (food.kind === 'sugar' ? 13 : 5)); if (p.cells.length > 200) p.cells.pop() }
          }
          if (p.ripe >= 100) reason = 'Rotten!'
        }
        if (reason) { ended.push({ id: p.id, reason, score: p.score, length: p.cells.length }); players.delete(key) }
      }
      refill()
    },
    snapshot() { return { step: tick, size: SIZE, foods: foods.map(f => ({ ...f })), players: [...players.values()].map(p => ({ id: p.id, name: p.name, cells: p.cells.map(c => [...c]), score: p.score, ripe: p.ripe })), ended: ended.map(e => ({ ...e })) } },
  }
}
