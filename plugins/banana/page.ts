/**
 * The page of the banana game: one HTML document, its look and its script, with no build step.
 *
 * The script talks to its own routes by the app's paths (`/banana/scores`), never the frame's canvas prefix: on `npm start` they
 * are at the root and in the frame the canvas page sends them to the same routes. Every value it puts on the page is set with
 * `textContent`, so a score or a name can never become markup.
 */
export function bananaPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ripe, a banana game</title>
    <style>
      :root{color-scheme:dark;--bg:#0e0b08;--panel:#1b1510;--edge:#33281c;--text:#f3eee2;--dim:#a89a86;--gold:#ffd45c;--leaf:#8bd450;--bad:#c96a3c}
      *{box-sizing:border-box}
      body{margin:0;padding:22px 14px 40px;background:radial-gradient(120% 80% at 50% 0%,#221a12 0%,var(--bg) 62%);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
      .wrap{max-width:680px;margin:0 auto}
      header{text-align:center;margin-bottom:18px}
      h1{margin:0;font-size:2.1rem;letter-spacing:.04em}
      h1 span{color:var(--gold)}
      .tag{margin:4px 0 0;color:var(--dim);font-size:.9rem}
      .hud{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
      .hud div{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:8px 10px;text-align:center}
      .label{display:block;color:var(--dim);font-size:.68rem;text-transform:uppercase;letter-spacing:.14em}
      .hud strong{font-size:1.35rem;font-variant-numeric:tabular-nums}
      .ripeness{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:10px 12px;margin-bottom:12px}
      .ripeness-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
      .bar{height:10px;border-radius:999px;background:#120d08;overflow:hidden;border:1px solid var(--edge)}
      #banana-fill{height:100%;width:0%;background:#8bd450;transition:width .12s linear,background .3s linear}
      .band{margin:7px 0 0;color:var(--dim);font-size:.78rem}
      .stage{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--edge);box-shadow:0 18px 40px rgba(0,0,0,.45)}
      canvas{display:block;width:100%;height:auto;background:#12140f;touch-action:none}
      .overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:24px;text-align:center;background:rgba(12,8,4,.84);backdrop-filter:blur(3px)}
      .overlay[hidden]{display:none}
      .overlay h2{margin:0;font-size:1.6rem;letter-spacing:.03em}
      .overlay p{margin:0;max-width:22rem;color:var(--dim);font-size:.9rem}
      .overlay form{display:flex;gap:8px;width:100%;max-width:20rem}
      .overlay form[hidden]{display:none}
      .overlay input{flex:1;min-width:0;padding:8px 11px;border-radius:9px;border:1px solid var(--edge);background:#120d08;color:var(--text);font:inherit}
      .overlay .saved{margin:0;color:var(--leaf)}
      button{padding:9px 18px;border:0;border-radius:10px;background:var(--gold);color:#20180a;font:inherit;font-weight:700;cursor:pointer}
      button:hover{filter:brightness(1.07)}
      .overlay form button{padding:8px 14px;font-weight:600}
      .pad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
      .pad button{background:var(--panel);border:1px solid var(--edge);color:var(--text);font-weight:500;padding:9px 0}
      #banana-status{margin:0 0 16px;text-align:center;color:var(--gold);font-size:.85rem;min-height:1.4em}
      .board{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:12px 14px}
      .board h2{margin:0 0 8px;font-size:.72rem;text-transform:uppercase;letter-spacing:.14em;color:var(--dim)}
      .board ol{list-style:none;margin:0;padding:0;counter-reset:rank}
      .board li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid var(--edge);font-variant-numeric:tabular-nums}
      .board li:first-child{border-top:0}
      .board li span{overflow-wrap:anywhere}
      .legend{margin:14px 0 0;color:var(--dim);font-size:.76rem;text-align:center}
    </style>
  </head>
  <body>
    <main class="wrap">
      <header>
        <h1>Ripe<span>.</span></h1>
        <p class="tag">Grow the banana. Stay golden. Do not go brown.</p>
      </header>
      <section class="hud" aria-label="Score">
        <div><span class="label">Score</span><strong id="banana-score">0</strong></div>
        <div><span class="label">Length</span><strong id="banana-length">3</strong></div>
        <div><span class="label">Best</span><strong id="banana-best">-</strong></div>
      </section>
      <section class="ripeness" aria-label="Ripeness">
        <div class="ripeness-head"><span class="label">Ripeness</span><span id="banana-ripeness">0%</span></div>
        <div class="bar"><div id="banana-fill"></div></div>
        <p class="band" id="banana-band">Golden band: ripeness 25% to 60%, doubled points</p>
      </section>
      <div class="stage">
        <canvas id="banana-canvas" width="640" height="640" aria-label="The banana game board"></canvas>
        <div class="overlay" id="banana-overlay">
          <h2 id="banana-overlay-title">Ripe</h2>
          <p id="banana-overlay-text">Arrows, WASD or swipe. The banana wraps around the counter, so only its own body and the ripening can stop it.</p>
          <button id="banana-start" type="button">Start</button>
          <form id="banana-save" hidden>
            <input id="banana-name" maxlength="16" placeholder="Your name" autocomplete="nickname" required>
            <button type="submit">Save score</button>
          </form>
          <p class="saved" id="banana-saved" hidden>Saved.</p>
        </div>
      </div>
      <div class="pad" aria-label="Steer">
        <button type="button" data-dir="up">Up</button>
        <button type="button" data-dir="left">Left</button>
        <button type="button" data-dir="down">Down</button>
        <button type="button" data-dir="right">Right</button>
      </div>
      <p id="banana-status" role="status">Ready. Press Start.</p>
      <section class="board" aria-label="Top bananas">
        <h2>Top bananas</h2>
        <ol id="banana-board"><li>No scores yet.</li></ol>
      </section>
      <p class="legend">Grape +10 points, a little riper. Sugar +25 points, a lot riper. Frost -28 ripeness, no growth.</p>
    </main>
    <script type="module">
      const canvas = document.getElementById('banana-canvas')
      const view = canvas.getContext('2d')
      if (!view) throw new Error('this browser has no 2d canvas')
      const COLS = 20
      const ROWS = 20
      const CELL = canvas.width / COLS
      // Everything drawn on the peel and the fruit is sized against this, so a bigger board scales the whole picture with it.
      const UNIT = CELL / 24
      const scoreEl = document.getElementById('banana-score')
      const lengthEl = document.getElementById('banana-length')
      const bestEl = document.getElementById('banana-best')
      const fillEl = document.getElementById('banana-fill')
      const ripenessEl = document.getElementById('banana-ripeness')
      const bandEl = document.getElementById('banana-band')
      const statusEl = document.getElementById('banana-status')
      const overlay = document.getElementById('banana-overlay')
      const overlayTitle = document.getElementById('banana-overlay-title')
      const overlayText = document.getElementById('banana-overlay-text')
      const startBtn = document.getElementById('banana-start')
      const saveForm = document.getElementById('banana-save')
      const nameInput = document.getElementById('banana-name')
      const savedEl = document.getElementById('banana-saved')
      const boardEl = document.getElementById('banana-board')

      const game = {
        snake: [],
        dir: { x: 1, y: 0 },
        queue: [],
        food: null,
        ripeness: 0,
        score: 0,
        acc: 0,
        last: 0,
        running: false,
      }

      function bananaColor(r, lift, deepen) {
        const t = Math.max(0, Math.min(1, r / 100))
        const hue = Math.round(82 - 54 * t)
        const sat = Math.round(Math.max(0, Math.min(100, 58 - 24 * t + (deepen || 0))))
        const light = Math.round(Math.max(0, Math.min(100, 57 - 24 * t + (lift || 0))))
        return 'hsl(' + hue + ' ' + sat + '% ' + light + '%)'
      }

      function isGolden() {
        return game.ripeness >= 25 && game.ripeness <= 60
      }

      function freeCell() {
        const taken = new Set()
        for (const part of game.snake) taken.add(part.x + ',' + part.y)
        const open = []
        for (let y = 0; y < ROWS; y += 1) {
          for (let x = 0; x < COLS; x += 1) {
            if (!taken.has(x + ',' + y)) open.push({ x: x, y: y })
          }
        }
        return open.length ? open[Math.floor(Math.random() * open.length)] : { x: 0, y: 0 }
      }

      function spawnFood() {
        const cell = freeCell()
        const roll = Math.random()
        let kind = 'grape'
        if (game.ripeness > 22 && roll > 0.93) kind = 'ice'
        else if (roll > 0.7) kind = 'sugar'
        game.food = { x: cell.x, y: cell.y, kind: kind }
      }

      function reset() {
        game.snake = [
          { x: 5, y: 10 },
          { x: 4, y: 10 },
          { x: 3, y: 10 },
        ]
        game.dir = { x: 1, y: 0 }
        game.queue = []
        game.ripeness = 0
        game.score = 0
        game.acc = 0
        game.food = null
        spawnFood()
        hud()
      }

      function hud() {
        scoreEl.textContent = String(game.score)
        lengthEl.textContent = String(game.snake.length)
        ripenessEl.textContent = Math.round(game.ripeness) + '%'
        fillEl.style.width = Math.min(100, game.ripeness) + '%'
        fillEl.style.background = bananaColor(game.ripeness)
        bandEl.textContent = isGolden()
          ? 'Golden. Every point counts double.'
          : 'Golden band: ripeness 25% to 60%, doubled points'
      }

      function queueDir(nx, ny) {
        const last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir
        if (nx === -last.x && ny === -last.y) return
        if (nx === last.x && ny === last.y) return
        if (game.queue.length < 2) game.queue.push({ x: nx, y: ny })
      }

      function start() {
        reset()
        game.running = true
        game.last = 0
        overlay.hidden = true
        saveForm.hidden = true
        savedEl.hidden = true
        statusEl.textContent = 'Playing. Eat fruit, stay golden.'
      }

      function finish(title, text) {
        game.running = false
        overlayTitle.textContent = title
        overlayText.textContent = text + ' You scored ' + game.score + ' with a banana ' + game.snake.length + ' long.'
        startBtn.textContent = 'Play again'
        saveForm.hidden = game.score <= 0
        savedEl.hidden = true
        overlay.hidden = false
        statusEl.textContent = title + ' ' + text + ' Score ' + game.score + '.'
        refreshBoard()
      }

      function eat(food) {
        const multiplier = isGolden() ? 2 : 1
        if (food.kind === 'sugar') {
          game.score += 25 * multiplier
          game.ripeness = Math.min(100, game.ripeness + 13)
        } else if (food.kind === 'ice') {
          game.score += 5 * multiplier
          game.ripeness = Math.max(0, game.ripeness - 28)
          game.snake.pop()
        } else {
          game.score += 10 * multiplier
          game.ripeness = Math.min(100, game.ripeness + 5)
        }
        spawnFood()
        hud()
      }

      function tickFor() {
        return 150 - Math.min(55, (game.snake.length - 3) * 5)
      }

      function step() {
        if (!game.running) return
        if (game.queue.length) game.dir = game.queue.shift()
        const head = {
          x: (game.snake[0].x + game.dir.x + COLS) % COLS,
          y: (game.snake[0].y + game.dir.y + ROWS) % ROWS,
        }
        for (const part of game.snake) {
          if (part.x === head.x && part.y === head.y) {
            finish('Tangle!', 'The banana tied itself in a knot.')
            return
          }
        }
        game.snake.unshift(head)
        const food = game.food
        if (food && head.x === food.x && head.y === food.y) eat(food)
        else game.snake.pop()
      }

      function makeRandom(seed) {
        let state = seed >>> 0
        return function () {
          state = (state * 1664525 + 1013904223) >>> 0
          return state / 4294967296
        }
      }

      function noise(n) {
        const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
        return x - Math.floor(x)
      }

      // The counter is painted once into an offscreen canvas: planks, grain, a warm light and a dark edge around the board.
      const wood = document.createElement('canvas')
      wood.width = canvas.width
      wood.height = canvas.height
      const woodView = wood.getContext('2d')
      const random = makeRandom(20260114)

      function paintCounter() {
        const base = woodView.createLinearGradient(0, 0, wood.width * 0.7, wood.height)
        base.addColorStop(0, '#5a3d26')
        base.addColorStop(0.45, '#43301d')
        base.addColorStop(1, '#241a10')
        woodView.fillStyle = base
        woodView.fillRect(0, 0, wood.width, wood.height)

        const plankHeight = wood.height / 4
        for (let y = 0; y < wood.height; y += plankHeight) {
          woodView.fillStyle = 'rgba(255, 214, 160, ' + (0.02 + random() * 0.05).toFixed(3) + ')'
          woodView.fillRect(0, y, wood.width, plankHeight)
          woodView.fillStyle = 'rgba(0, 0, 0, 0.4)'
          woodView.fillRect(0, y, wood.width, 2)
          for (let line = 0; line < 24; line += 1) {
            const ly = y + 6 + random() * (plankHeight - 12)
            woodView.strokeStyle = line % 2 === 0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,226,180,0.05)'
            woodView.lineWidth = 0.6 + random() * 1.3
            woodView.beginPath()
            woodView.moveTo(0, ly)
            woodView.bezierCurveTo(
              wood.width * 0.33, ly + (random() - 0.5) * 9,
              wood.width * 0.66, ly + (random() - 0.5) * 9,
              wood.width, ly + (random() - 0.5) * 4,
            )
            woodView.stroke()
          }
        }

        const light = woodView.createRadialGradient(
          wood.width * 0.28, wood.height * 0.12, 30,
          wood.width * 0.28, wood.height * 0.12, wood.width * 1.05,
        )
        light.addColorStop(0, 'rgba(255, 226, 168, 0.18)')
        light.addColorStop(0.55, 'rgba(255, 200, 140, 0.03)')
        light.addColorStop(1, 'rgba(0, 0, 0, 0.32)')
        woodView.fillStyle = light
        woodView.fillRect(0, 0, wood.width, wood.height)
      }
      paintCounter()

      /** The banana as one smooth curve through the middle of its cells, so a turn bends the peel instead of showing squares. */
      function smoothPath(points) {
        view.beginPath()
        if (points.length === 0) return false
        view.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length - 1; i += 1) {
          const mx = (points[i].x + points[i + 1].x) / 2
          const my = (points[i].y + points[i + 1].y) / 2
          view.quadraticCurveTo(points[i].x, points[i].y, mx, my)
        }
        const last = points[points.length - 1]
        view.lineTo(last.x, last.y)
        return true
      }

      /**
       * Points along one run of the body every few pixels, each with the normal of the peel there and how far along the whole
       * banana it sits (0 stem, 1 tip). The banana is drawn in runs because it wraps: the part that left one edge is not joined
       * to the part that came back on the other.
       */
      function ribbonPoints(points, step, start, total) {
        const out = []
        const span = total > 0 ? total : 1
        if (points.length === 0) return out
        if (points.length === 1) {
          out.push({ x: points[0].x, y: points[0].y, nx: 0, ny: -1, t: Math.min(1, start / span) })
          return out
        }
        const lengths = []
        let runLength = 0
        for (let i = 1; i < points.length; i += 1) {
          const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
          lengths.push(d)
          runLength += d
        }
        if (runLength === 0) runLength = 0.001
        let walked = 0
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1]
          const b = points[i]
          const seg = lengths[i - 1]
          if (seg === 0) continue
          const ux = (b.x - a.x) / seg
          const uy = (b.y - a.y) / seg
          for (let d = 0; d < seg; d += step) {
            out.push({
              x: a.x + ux * d,
              y: a.y + uy * d,
              nx: -uy,
              ny: ux,
              t: Math.min(1, (start + walked + d) / span),
            })
          }
          walked += seg
        }
        const last = points[points.length - 1]
        const prev = points[points.length - 2]
        const lx = last.x - prev.x
        const ly = last.y - prev.y
        const ll = Math.hypot(lx, ly) || 1
        out.push({
          x: last.x,
          y: last.y,
          nx: -ly / ll,
          ny: lx / ll,
          t: Math.min(1, (start + runLength) / span),
        })
        return out
      }

      /** The body split where it left one edge and came back on the other, so a wrap never draws a line across the counter. */
      function bodyRuns(points) {
        const runs = []
        let run = [points[0]]
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1]
          const b = points[i]
          if (Math.abs(a.x - b.x) > CELL * 1.5 || Math.abs(a.y - b.y) > CELL * 1.5) {
            runs.push(run)
            run = [b]
          } else {
            run.push(b)
          }
        }
        runs.push(run)
        return runs
      }

      function runLength(run) {
        let total = 0
        for (let i = 1; i < run.length; i += 1) {
          total += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y)
        }
        return total
      }

      /** A banana is thin at the stem, thick in the middle and thin at the tip. */
      function radiusAt(t) {
        const tuck = Math.max(0, Math.min(1, t))
        return CELL * (0.2 + 0.29 * Math.sin(Math.PI * Math.pow(tuck, 0.85)))
      }

      function drawBanana() {
        const parts = game.snake
        if (!parts.length) return
        const points = []
        for (const part of parts) points.push({ x: part.x * CELL + CELL / 2, y: part.y * CELL + CELL / 2 })
        points.reverse()
        const runs = bodyRuns(points)
        let total = 0
        for (const run of runs) total += runLength(run)
        if (total < 1) total = 1

        const samples = []
        const ridgeLight = []
        const ridgeShade = []
        let walked = 0
        for (const run of runs) {
          const runSamples = ribbonPoints(run, 4, walked, total)
          const lit = []
          const shaded = []
          for (const sample of runSamples) {
            samples.push(sample)
            const r = radiusAt(sample.t)
            lit.push({ x: sample.x + sample.nx * r * 0.6, y: sample.y + sample.ny * r * 0.6 })
            shaded.push({ x: sample.x - sample.nx * r * 0.78, y: sample.y - sample.ny * r * 0.78 })
          }
          ridgeLight.push(lit)
          ridgeShade.push(shaded)
          walked += runLength(run)
        }

        const ripe = game.ripeness
        const shine = bananaColor(Math.min(100, ripe + 8), 14, 2)

        view.save()
        view.shadowColor = 'rgba(0, 0, 0, 0.55)'
        view.shadowBlur = 12 * UNIT
        view.shadowOffsetX = 4 * UNIT
        view.shadowOffsetY = 8 * UNIT
        view.strokeStyle = 'rgba(26, 15, 5, 0.5)'
        view.lineWidth = 22 * UNIT
        view.lineCap = 'round'
        view.lineJoin = 'round'
        for (const run of runs) {
          if (smoothPath(run)) view.stroke()
        }
        view.restore()

        // Every part of the peel has its own ripeness: greener at the stem, riper toward the tip, as a real banana does.
        const bases = []
        const edges = []
        for (const sample of samples) {
          const local = Math.max(0, Math.min(100, ripe - (1 - sample.t) * 15))
          bases.push(bananaColor(local))
          edges.push(bananaColor(local, -15, -9))
        }

        for (let i = 0; i < samples.length; i += 1) {
          view.fillStyle = edges[i]
          view.beginPath()
          view.arc(samples[i].x, samples[i].y, radiusAt(samples[i].t) + 1.6 * UNIT, 0, Math.PI * 2)
          view.fill()
        }
        for (let i = 0; i < samples.length; i += 1) {
          view.fillStyle = bases[i]
          view.beginPath()
          view.arc(samples[i].x, samples[i].y, radiusAt(samples[i].t), 0, Math.PI * 2)
          view.fill()
        }

        view.globalAlpha = 0.4
        view.fillStyle = shine
        for (const sample of samples) {
          const r = radiusAt(sample.t)
          view.beginPath()
          view.arc(sample.x + sample.nx * r * 0.36, sample.y + sample.ny * r * 0.36, r * 0.54, 0, Math.PI * 2)
          view.fill()
        }
        view.globalAlpha = 1

        // The two long ridges a banana has, one lit and one in shade, so the peel reads as round.
        view.lineCap = 'round'
        view.globalAlpha = 0.5
        view.strokeStyle = shine
        view.lineWidth = 1.1 * UNIT
        for (const ridge of ridgeLight) {
          if (ridge.length > 1 && smoothPath(ridge)) view.stroke()
        }
        view.globalAlpha = 0.22
        view.strokeStyle = '#2a1a06'
        view.lineWidth = 1.6 * UNIT
        for (const ridge of ridgeShade) {
          if (ridge.length > 1 && smoothPath(ridge)) view.stroke()
        }
        view.globalAlpha = 1

        if (ripe > 24) {
          const strength = Math.min(1, (ripe - 24) / 62)
          for (let i = 2; i < samples.length; i += 5) {
            const sample = samples[i]
            const r = radiusAt(sample.t)
            const spot = noise(i * 7.31)
            const size = noise(i * 2.17)
            if (spot > 0.35 + (1 - strength) * 0.5) continue
            const side = noise(i * 5.53) > 0.5 ? 1 : -1
            const spread = 0.15 + size * 0.45
            view.fillStyle = 'rgba(74, 45, 12, ' + (0.22 + strength * 0.5).toFixed(3) + ')'
            view.beginPath()
            view.ellipse(
              sample.x + sample.nx * r * spread * side,
              sample.y + sample.ny * r * spread * side,
              r * (0.13 + size * 0.14),
              r * (0.09 + size * 0.1),
              spot * 3.1,
              0,
              Math.PI * 2,
            )
            view.fill()
          }
        }

        // The stem: a short stalk with a pale cut end, at the tail of the banana.
        const tailRun = runs[0]
        const tail = tailRun[0]
        const tailNext = tailRun[1] || tail
        const tx = tail.x - tailNext.x
        const ty = tail.y - tailNext.y
        const tl = Math.hypot(tx, ty) || 1
        const sx = tx / tl
        const sy = ty / tl
        view.strokeStyle = '#71592a'
        view.lineWidth = 4.2 * UNIT
        view.lineCap = 'round'
        view.beginPath()
        view.moveTo(tail.x, tail.y)
        view.lineTo(tail.x + sx * 8 * UNIT, tail.y + sy * 8 * UNIT)
        view.stroke()
        view.fillStyle = '#c9b37a'
        view.beginPath()
        view.ellipse(tail.x + sx * 9.5 * UNIT, tail.y + sy * 9.5 * UNIT, 2.4 * UNIT, 1.6 * UNIT, Math.atan2(sy, sx), 0, Math.PI * 2)
        view.fill()

        const head = samples[samples.length - 1]
        const ux = head.ny
        const uy = -head.nx
        const angle = Math.atan2(uy, ux)
        view.fillStyle = '#3f2b0f'
        view.beginPath()
        view.ellipse(head.x + ux * 3.2 * UNIT, head.y + uy * 3.2 * UNIT, 3.1 * UNIT, 2.2 * UNIT, angle, 0, Math.PI * 2)
        view.fill()
        view.fillStyle = 'rgba(255, 240, 200, 0.5)'
        view.beginPath()
        view.arc(head.x + ux * 4.6 * UNIT, head.y + uy * 4.6 * UNIT, 0.9 * UNIT, 0, Math.PI * 2)
        view.fill()

        for (const side of [-1, 1]) {
          const ex = head.x + head.nx * 2.9 * UNIT * side - ux * 1.6 * UNIT
          const ey = head.y + head.ny * 2.9 * UNIT * side - uy * 1.6 * UNIT
          view.fillStyle = '#ffffff'
          view.beginPath()
          view.ellipse(ex, ey, 2.3 * UNIT, 2 * UNIT, angle, 0, Math.PI * 2)
          view.fill()
          view.fillStyle = '#20180c'
          view.beginPath()
          view.arc(ex + ux * 0.8 * UNIT, ey + uy * 0.8 * UNIT, 1.15 * UNIT, 0, Math.PI * 2)
          view.fill()
          view.fillStyle = 'rgba(255,255,255,0.9)'
          view.beginPath()
          view.arc(ex + ux * 0.8 * UNIT - 0.45 * UNIT, ey + uy * 0.8 * UNIT - 0.55 * UNIT, 0.42 * UNIT, 0, Math.PI * 2)
          view.fill()
        }
      }

      function drawFood(food, time) {
        const bob = Math.sin(time * 0.0032 + food.x * 0.9 + food.y * 1.3) * 1.6 * UNIT
        const cx = food.x * CELL + CELL / 2
        const cy = food.y * CELL + CELL / 2 + bob

        view.fillStyle = 'rgba(0, 0, 0, 0.35)'
        view.beginPath()
        view.ellipse(cx + UNIT, cy + 9 * UNIT - bob, 7.5 * UNIT, 3 * UNIT, 0, 0, Math.PI * 2)
        view.fill()

        if (food.kind === 'sugar') {
          const h = 7 * UNIT
          view.beginPath()
          view.moveTo(cx, cy - h)
          view.lineTo(cx + h, cy - h / 2)
          view.lineTo(cx, cy)
          view.lineTo(cx - h, cy - h / 2)
          view.closePath()
          view.fillStyle = '#fdfbff'
          view.fill()
          view.beginPath()
          view.moveTo(cx - h, cy - h / 2)
          view.lineTo(cx, cy)
          view.lineTo(cx, cy + h)
          view.lineTo(cx - h, cy + h / 2)
          view.closePath()
          view.fillStyle = '#dcd6ea'
          view.fill()
          view.beginPath()
          view.moveTo(cx + h, cy - h / 2)
          view.lineTo(cx, cy)
          view.lineTo(cx, cy + h)
          view.lineTo(cx + h, cy + h / 2)
          view.closePath()
          view.fillStyle = '#bdb5d1'
          view.fill()
          view.fillStyle = 'rgba(255,255,255,0.9)'
          view.beginPath()
          view.arc(cx - 2 * UNIT, cy - 4.4 * UNIT, 1.1 * UNIT, 0, Math.PI * 2)
          view.fill()
          return
        }

        if (food.kind === 'ice') {
          view.save()
          view.strokeStyle = '#d6f1ff'
          view.lineWidth = 1.9 * UNIT
          view.lineCap = 'round'
          view.shadowColor = 'rgba(126, 214, 255, 0.9)'
          view.shadowBlur = 9 * UNIT
          for (let arm = 0; arm < 6; arm += 1) {
            const armAngle = (arm * Math.PI) / 3
            const ax = Math.cos(armAngle)
            const ay = Math.sin(armAngle)
            view.beginPath()
            view.moveTo(cx, cy)
            view.lineTo(cx + ax * 8.5 * UNIT, cy + ay * 8.5 * UNIT)
            view.stroke()
            view.beginPath()
            view.moveTo(cx + ax * 4.6 * UNIT, cy + ay * 4.6 * UNIT)
            view.lineTo(cx + ax * 7 * UNIT + ay * 3 * UNIT, cy + ay * 7 * UNIT - ax * 3 * UNIT)
            view.stroke()
          }
          view.restore()
          view.fillStyle = '#ffffff'
          view.beginPath()
          view.arc(cx, cy, 1.8 * UNIT, 0, Math.PI * 2)
          view.fill()
          return
        }

        for (const grape of [[-4.5, -3], [3, -4.5], [-1, 1.5], [5, 1], [-6, 3], [1, 7]]) {
          const gx = cx + grape[0] * UNIT
          const gy = cy + grape[1] * UNIT
          view.fillStyle = '#7fae4a'
          view.beginPath()
          view.arc(gx, gy, 4.1 * UNIT, 0, Math.PI * 2)
          view.fill()
          view.fillStyle = '#a9d274'
          view.beginPath()
          view.arc(gx - 0.6 * UNIT, gy - 0.8 * UNIT, 3.2 * UNIT, 0, Math.PI * 2)
          view.fill()
          view.fillStyle = 'rgba(255,255,255,0.7)'
          view.beginPath()
          view.arc(gx - 1.4 * UNIT, gy - 1.8 * UNIT, 0.9 * UNIT, 0, Math.PI * 2)
          view.fill()
        }
        view.strokeStyle = '#6b5426'
        view.lineWidth = 1.6 * UNIT
        view.beginPath()
        view.moveTo(cx, cy - 6 * UNIT)
        view.lineTo(cx + UNIT, cy - 11 * UNIT)
        view.stroke()
        view.fillStyle = '#6f9c3c'
        view.beginPath()
        view.ellipse(cx + 3.4 * UNIT, cy - 11 * UNIT, 3.4 * UNIT, 1.9 * UNIT, -0.5, 0, Math.PI * 2)
        view.fill()
      }

      function draw(time) {
        view.drawImage(wood, 0, 0)
        if (game.food) drawFood(game.food, time)
        drawBanana()
      }

      function frame(now) {
        const dt = game.last ? Math.min(120, now - game.last) : 0
        game.last = now
        if (game.running) {
          game.ripeness = Math.min(100, game.ripeness + dt * 0.0014)
          game.acc += dt
          const tick = tickFor()
          while (game.acc >= tick && game.running) {
            game.acc -= tick
            step()
          }
          if (game.running && game.ripeness >= 100) {
            finish('Rotten!', 'The banana went brown before it got big.')
          }
          hud()
        }
        draw(now)
        requestAnimationFrame(frame)
      }

      function renderBoard(scores) {
        boardEl.textContent = ''
        if (!scores || scores.length === 0) {
          const empty = document.createElement('li')
          empty.textContent = 'No scores yet.'
          boardEl.append(empty)
          bestEl.textContent = '-'
          return
        }
        bestEl.textContent = String(scores[0].score)
        for (const entry of scores.slice(0, 10)) {
          const row = document.createElement('li')
          const who = document.createElement('span')
          who.textContent = entry.name
          const what = document.createElement('strong')
          what.textContent = String(entry.score)
          row.append(who, what)
          boardEl.append(row)
        }
      }

      async function refreshBoard() {
        try {
          const response = await fetch('/banana/scores')
          if (!response.ok) return
          const data = await response.json()
          renderBoard(data.scores)
        } catch (error) {
          // Offline, or the plugin is off: keep what the page already shows.
        }
      }

      const KEYS = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
      }

      window.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLInputElement) return
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
        const vector = KEYS[key]
        if (vector) {
          event.preventDefault()
          queueDir(vector[0], vector[1])
          if (!game.running) start()
          return
        }
        if (event.key === ' ' || event.key === 'Enter') {
          if (!game.running) {
            event.preventDefault()
            start()
          }
        }
      })

      for (const button of document.querySelectorAll('[data-dir]')) {
        button.addEventListener('click', () => {
          const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
          const vector = vectors[button.dataset.dir]
          if (!vector) return
          queueDir(vector[0], vector[1])
          if (!game.running) start()
        })
      }

      let touchStart = null
      canvas.addEventListener('touchstart', (event) => {
        const touch = event.changedTouches[0]
        touchStart = { x: touch.clientX, y: touch.clientY }
      }, { passive: true })
      canvas.addEventListener('touchend', (event) => {
        if (!touchStart) return
        const touch = event.changedTouches[0]
        const dx = touch.clientX - touchStart.x
        const dy = touch.clientY - touchStart.y
        touchStart = null
        if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return
        if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? 1 : -1, 0)
        else queueDir(0, dy > 0 ? 1 : -1)
        if (!game.running) start()
      }, { passive: true })

      startBtn.addEventListener('click', start)

      saveForm.addEventListener('submit', async (event) => {
        event.preventDefault()
        const name = nameInput.value.trim()
        if (!name) return
        saveForm.hidden = true
        savedEl.hidden = false
        savedEl.textContent = 'Saving...'
        try {
          const response = await fetch('/banana/scores', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: name, score: game.score }),
          })
          if (!response.ok) throw new Error('refused')
          const data = await response.json()
          renderBoard(data.scores)
          savedEl.textContent = 'Saved. You are on the board.'
        } catch (error) {
          savedEl.textContent = 'The score could not be saved.'
        }
      })

      reset()
      draw(0)
      requestAnimationFrame(frame)
      refreshBoard()
    </script>
  </body>
</html>`
}
