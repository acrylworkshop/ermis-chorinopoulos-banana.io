export const STEP_MS = 120
export const ripenFactor = (length: number) => Math.max(1, Math.min(6, 1 + (length - 6) / 12))
export const speedFactor = (length: number) => 1 + 0.25 * (Math.min(Math.max(length, 20), 100) - 20) / 80
const MIN_SIZE = 30
type Cell = [number, number]
type Food = { x: number; y: number; kind: 'grape' | 'sugar' | 'ice' }
type Player = { id: string; name: string; cells: Cell[]; score: number; ripe: number; dir: Cell; queue: Cell[]; safeUntil: number; growth: number; credit: number; moved: number }

export function createWorld({ random = Math.random }: { random?: () => number } = {}) {
  const players = new Map<string, Player>()
  let foods: Food[] = []
  let size = MIN_SIZE
  let peak = 0
  let tick = 0
  let ended: { id: string; reason: string; score: number; length: number; by?: string }[] = []
  const endings = new Map<string, { reason: string; score: number; length: number; name: string; by?: string }>()
  const end = (key: string, reason: string, by?: string) => {
    const p = players.get(key)
    if (!p) return
    const result = { reason, score: p.score, length: p.cells.length, name: p.name, ...(by === undefined ? {} : { by }) }
    endings.delete(key)
    endings.set(key, result)
    if (endings.size > 200) endings.delete(endings.keys().next().value!)
    ended.push({ id: p.id, ...result })
    players.delete(key)
  }
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
      const remapped = new Map([...players].map(([k, p]) => {
        const cells: Cell[] = [p.cells[0]]
        for (let i = 1; i < p.cells.length; i++) {
          const previous = p.cells[i - 1], cell = p.cells[i], last = cells[i - 1]
          cells.push([0, 1].map(axis => (last[axis] + ((cell[axis] - previous[axis] + oldSize + oldSize / 2) % oldSize - oldSize / 2) + size) % size) as Cell)
        }
        return [k, cells] as const
      }))
      const occupied = new Set([...remapped].filter(([k]) => k !== key).flatMap(([, cells]) => cells.map(([x, y]) => y * size + x)).concat(foods.map(f => f.y * size + f.x)))
      const near = new Set<number>()
      for (const [otherKey, cells] of remapped) if (otherKey !== key) for (const [x, y] of cells)
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
      for (const [k, cells] of remapped) players.get(k)!.cells = cells
      endings.delete(key)
      peak = nextPeak
      const [x, y] = spot
      const id = old?.id ?? crypto.randomUUID()
      players.set(key, { id, name, cells: Array.from({ length: 6 }, (_, i) => [(x - i + size) % size, y]), score: 0, ripe: 0, dir: [1, 0], queue: [], safeUntil: tick + 25, growth: 0, credit: 0, moved: 0 })
      refill()
      return id
    },
    resume(key: string) {
      const player = players.get(key)
      if (player) return { state: 'playing' as const, id: player.id, step: tick, name: player.name }
      const result = endings.get(key)
      return result ? { state: 'ended' as const, ...result } : { state: 'none' as const }
    },
    end,
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
      for (const p of players.values()) {
        p.ripe = Math.min(100, p.ripe + .00035 * STEP_MS * ripenFactor(p.cells.length))
        p.credit += speedFactor(p.cells.length)
      }
      for (let round = 0; round < 2; round++) {
      if (![...players.values()].some(p => p.credit >= 1 - 1e-9)) break
      const starts = new Map([...players].map(([key, p]) => [key, { length: p.cells.length }] as const))
      for (const [key, p] of [...players].sort((a, b) => a[1].id < b[1].id ? -1 : a[1].id > b[1].id ? 1 : 0)) {
        if (p.credit < 1 - 1e-9) continue
        p.credit = Math.max(0, p.credit - 1)
        p.moved++
        p.dir = p.queue.shift() ?? p.dir
        const head: Cell = [(p.cells[0][0] + p.dir[0] + size) % size, (p.cells[0][1] + p.dir[1] + size) % size]
        let reason = p.cells.some(c => c[0] === head[0] && c[1] === head[1]) ? 'Tangle!' : ''
        if (!reason) {
          p.cells.unshift(head)
          const index = foods.findIndex(f => f.x === head[0] && f.y === head[1])
          if (index < 0) { if (p.growth > 0 && p.cells.length <= 200) p.growth--; else p.cells.pop() }
          else {
            const [food] = foods.splice(index, 1)
            const multiplier = p.ripe >= 25 && p.ripe <= 60 ? 2 : 1
            if (food.kind === 'ice') { p.score += 5 * multiplier; p.ripe = Math.max(0, p.ripe - 28); p.cells.pop() }
            else { p.score += (food.kind === 'sugar' ? 25 : 10) * multiplier; p.ripe = Math.max(0, p.ripe - (food.kind === 'sugar' ? 15 : 8)); if (p.cells.length > 200) p.cells.pop() }
          }
          if (p.ripe >= 100) reason = 'Rotten!'
        }
        if (reason) end(key, reason)
      }
      const cells = new Map<number, string[]>()
      for (const [key, p] of players) if (tick > p.safeUntil) for (const [x, y] of p.cells) {
        const cell = y * size + x
        const occupants = cells.get(cell) ?? []
        occupants.push(key)
        cells.set(cell, occupants)
      }
      const contacts: { eater: string; victim: string; length: number; id: string }[] = []
      const contact = (a: string, b: string) => {
        if (a === b) return
        const pa = players.get(a)!, pb = players.get(b)!
        const la = starts.get(a)!.length, lb = starts.get(b)!.length
        if (la === lb) return
        const eater = la > lb ? a : b, victim = la > lb ? b : a
        contacts.push({ eater, victim, length: Math.max(la, lb), id: (la > lb ? pa : pb).id })
      }
      for (const [key, p] of players) if (tick > p.safeUntil) {
        const [x, y] = p.cells[0]
        for (const other of cells.get(y * size + x) ?? []) contact(key, other)
      }
      contacts.sort((a, b) => b.length - a.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || (players.get(a.victim)!.id < players.get(b.victim)!.id ? -1 : 1))
      for (const { eater, victim } of contacts) {
        const p = players.get(eater), v = players.get(victim)
        if (!p || !v) continue
        const length = starts.get(victim)!.length
        p.growth += Math.ceil(length / 2)
        p.score += 10 * length * (p.ripe >= 25 && p.ripe <= 60 ? 2 : 1)
        p.ripe = Math.max(0, p.ripe - 30)
        end(victim, 'Eaten!', p.name)
      }
      }
      if (!players.size) { size = MIN_SIZE; peak = 0; foods = foods.filter(f => f.x < size && f.y < size) }
      refill()
    },
    snapshot() { return { step: tick, size: size, foods: foods.map(f => ({ ...f })), players: [...players.values()].map(p => ({ id: p.id, name: p.name, cells: p.cells.map(c => [...c]), score: p.score, ripe: p.ripe, moved: p.moved, credit: Math.round(p.credit * 1000) / 1000, safe: tick <= p.safeUntil })), ended: ended.map(e => ({ ...e })) } },
  }
}
