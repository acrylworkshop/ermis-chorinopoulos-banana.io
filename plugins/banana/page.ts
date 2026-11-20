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
      :root{color-scheme:dark;--bg:#0f1108;--panel:#191d10;--edge:#2c331c;--text:#f3f1e4;--dim:#a5ab8d;--gold:#ffd45c;--leaf:#8bd450;--bad:#c96a3c}
      *{box-sizing:border-box}
      body{margin:0;padding:22px 14px 40px;background:radial-gradient(120% 80% at 50% 0%,#1b2011 0%,var(--bg) 60%);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
      .wrap{max-width:540px;margin:0 auto}
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
      .bar{height:10px;border-radius:999px;background:#0b0d06;overflow:hidden;border:1px solid var(--edge)}
      #banana-fill{height:100%;width:0%;background:#8bd450;transition:width .12s linear,background .3s linear}
      .band{margin:7px 0 0;color:var(--dim);font-size:.78rem}
      .stage{position:relative;border-radius:16px;overflow:hidden;border:1px solid var(--edge);box-shadow:0 18px 40px rgba(0,0,0,.45)}
      canvas{display:block;width:100%;height:auto;background:#12140f;touch-action:none}
      .overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:24px;text-align:center;background:rgba(9,11,5,.82);backdrop-filter:blur(3px)}
      .overlay[hidden]{display:none}
      .overlay h2{margin:0;font-size:1.6rem;letter-spacing:.03em}
      .overlay p{margin:0;max-width:22rem;color:var(--dim);font-size:.9rem}
      .overlay form{display:flex;gap:8px;width:100%;max-width:20rem}
      .overlay form[hidden]{display:none}
      .overlay input{flex:1;min-width:0;padding:8px 11px;border-radius:9px;border:1px solid var(--edge);background:#0b0d06;color:var(--text);font:inherit}
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
        <canvas id="banana-canvas" width="480" height="480" aria-label="The banana game board"></canvas>
        <div class="overlay" id="banana-overlay">
          <h2 id="banana-overlay-title">Ripe</h2>
          <p id="banana-overlay-text">Arrows, WASD or swipe. Every fruit you eat ripens you a little. Frost cools you down.</p>
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

      function bananaColor(r) {
        const t = Math.max(0, Math.min(1, r / 100))
        const hue = Math.round(72 - 44 * t)
        const sat = Math.round(62 - 32 * t)
        const light = Math.round(60 - 26 * t)
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
        const head = { x: game.snake[0].x + game.dir.x, y: game.snake[0].y + game.dir.y }
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
          finish('Crash!', 'You ran into the edge of the counter.')
          return
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

      function drawBoard() {
        view.fillStyle = '#12140f'
        view.fillRect(0, 0, canvas.width, canvas.height)
        view.strokeStyle = 'rgba(255,255,255,0.045)'
        view.lineWidth = 1
        for (let i = 1; i < COLS; i += 1) {
          view.beginPath()
          view.moveTo(i * CELL, 0)
          view.lineTo(i * CELL, canvas.height)
          view.stroke()
          view.beginPath()
          view.moveTo(0, i * CELL)
          view.lineTo(canvas.width, i * CELL)
          view.stroke()
        }
      }

      function drawFood(food) {
        const cx = food.x * CELL + CELL / 2
        const cy = food.y * CELL + CELL / 2
        if (food.kind === 'sugar') {
          view.fillStyle = '#f4f1ff'
          view.beginPath()
          view.roundRect(cx - 7, cy - 6, 14, 12, 3)
          view.fill()
          view.fillStyle = 'rgba(120,110,160,0.4)'
          view.beginPath()
          view.roundRect(cx - 5, cy - 1, 10, 2, 1)
          view.fill()
        } else if (food.kind === 'ice') {
          view.fillStyle = '#8fd8ff'
          view.beginPath()
          view.moveTo(cx, cy - 9)
          view.lineTo(cx + 9, cy)
          view.lineTo(cx, cy + 9)
          view.lineTo(cx - 9, cy)
          view.closePath()
          view.fill()
          view.fillStyle = 'rgba(255,255,255,0.75)'
          view.beginPath()
          view.arc(cx - 2, cy - 2, 2, 0, Math.PI * 2)
          view.fill()
        } else {
          view.fillStyle = '#8bd450'
          for (const dot of [[-3, -1], [3, -2], [0, 3]]) {
            view.beginPath()
            view.arc(cx + dot[0], cy + dot[1], 4, 0, Math.PI * 2)
            view.fill()
          }
          view.strokeStyle = '#4d7a2a'
          view.lineWidth = 1.5
          view.beginPath()
          view.moveTo(cx, cy - 5)
          view.lineTo(cx + 2, cy - 10)
          view.stroke()
        }
      }

      function drawSegment(part, index) {
        const ripe = Math.max(0, game.ripeness - index * 1.1)
        const pad = index === game.snake.length - 1 ? 5 : 2.5
        const x = part.x * CELL + pad
        const y = part.y * CELL + pad
        const size = CELL - pad * 2
        view.fillStyle = bananaColor(ripe)
        view.beginPath()
        view.roundRect(x, y, size, size, index === 0 ? 10 : 8)
        view.fill()
        if (ripe > 45) {
          view.fillStyle = 'rgba(58,36,10,0.5)'
          view.beginPath()
          view.arc(x + size * 0.34, y + size * 0.38, 1.8, 0, Math.PI * 2)
          view.fill()
          view.beginPath()
          view.arc(x + size * 0.66, y + size * 0.64, 1.4, 0, Math.PI * 2)
          view.fill()
        }
      }

      function drawHead() {
        const part = game.snake[0]
        const x = part.x * CELL
        const y = part.y * CELL
        view.fillStyle = bananaColor(game.ripeness)
        view.beginPath()
        view.roundRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3, 12)
        view.fill()
        if (isGolden()) {
          view.strokeStyle = 'rgba(255,212,92,0.85)'
          view.lineWidth = 2
          view.beginPath()
          view.roundRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3, 12)
          view.stroke()
        }
        const cx = x + CELL / 2
        const cy = y + CELL / 2
        const px = -game.dir.y
        const py = game.dir.x
        for (const side of [-1, 1]) {
          const ex = cx + game.dir.x * 3 + px * 4 * side
          const ey = cy + game.dir.y * 3 + py * 4 * side
          view.fillStyle = '#ffffff'
          view.beginPath()
          view.arc(ex, ey, 3.2, 0, Math.PI * 2)
          view.fill()
          view.fillStyle = '#1b1b1f'
          view.beginPath()
          view.arc(ex + game.dir.x * 1.2, ey + game.dir.y * 1.2, 1.7, 0, Math.PI * 2)
          view.fill()
        }
      }

      function draw() {
        drawBoard()
        if (game.food) drawFood(game.food)
        for (let i = game.snake.length - 1; i >= 0; i -= 1) drawSegment(game.snake[i], i)
        drawHead()
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
        draw()
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
      draw()
      requestAnimationFrame(frame)
      refreshBoard()
    </script>
  </body>
</html>`
}
