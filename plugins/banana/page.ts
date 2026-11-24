/**
 * The page of the banana game: one HTML document, its look and its script, with no build step.
 *
 * The script talks to its own routes by the app's paths (`/banana/scores`), never the frame's canvas prefix: on `npm start` they
 * are at the root and in the frame the canvas page sends them to the same routes. Every value it puts on the page is set with
 * `textContent`, so a score or a name can never become markup.
 */
export interface BananaPageOptions {
  /** How many cells the board has each way; the server checks a shared banana against the same number. */
  readonly size: number
  /** This machine's address on the network, so the page can offer other people a link to join with. */
  readonly lanAddress?: string
  /** True while the app listens on this machine only, so that link works only once it listens on the network. */
  readonly localOnly?: boolean
}

export function bananaPage(options: BananaPageOptions): string {
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
      .wrap{max-width:900px;margin:0 auto}
      header{text-align:center;margin-bottom:18px}
      h1{margin:0;font-size:2.1rem;letter-spacing:.04em}
      h1 span{color:var(--gold)}
      .tag{margin:4px 0 0;color:var(--dim);font-size:.9rem}
      .hud{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
      .hud div{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:8px 10px;text-align:center}
      .label{display:block;color:var(--dim);font-size:.68rem;text-transform:uppercase;letter-spacing:.14em}
      .hud strong{font-size:1.35rem;font-variant-numeric:tabular-nums}
      .room{margin:0 0 10px;text-align:center;color:var(--dim);font-size:.8rem}
      .join{margin:0 0 10px;text-align:center;color:var(--dim);font-size:.76rem;overflow-wrap:anywhere}
      .join a{color:var(--gold)}
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
      .overlay input{min-width:0;padding:8px 11px;border-radius:9px;border:1px solid var(--edge);background:#120d08;color:var(--text);font:inherit}
      .overlay form input{flex:1}
      #banana-nick{width:100%;max-width:20rem;text-align:center}
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
        <p class="tag">Grow the banana. Bigger bananas eat smaller ones. Stay golden. Do not go brown.</p>
      </header>
      <section class="hud" aria-label="Score">
        <div><span class="label">Score</span><strong id="banana-score">0</strong></div>
        <div><span class="label">Length</span><strong id="banana-length">3</strong></div>
        <div><span class="label">Best</span><strong id="banana-best">-</strong></div>
      </section>
      <p class="room" id="banana-room">Nobody else on the counter yet. Send a friend the join link below.</p>
      <p class="join" id="banana-join" hidden></p>
      <section class="ripeness" aria-label="Ripeness">
        <div class="ripeness-head"><span class="label">Ripeness</span><span id="banana-ripeness">0%</span></div>
        <div class="bar"><div id="banana-fill"></div></div>
        <p class="band" id="banana-band">Golden band: ripeness 25% to 60%, doubled points</p>
      </section>
      <div class="stage">
        <canvas id="banana-canvas" width="900" height="900" aria-label="The banana game board"></canvas>
        <div class="overlay" id="banana-connection" hidden role="status">Connection lost. Your banana keeps going. Reconnecting...</div>
        <div class="overlay" id="banana-overlay">
          <h2 id="banana-overlay-title">Ripe</h2>
          <p id="banana-overlay-text">Arrows, WASD or swipe. It wraps around the counter, ripens on its own, and eating makes it fresh again before it moulds over. A bigger banana ripens faster and moves a little faster. Other players on this counter show up live, with their names above them.</p>
          <input id="banana-nick" maxlength="16" placeholder="Your name" autocomplete="nickname" aria-label="Your name">
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
      <p class="legend">Bigger bananas eat smaller ones, ripen faster and move a little faster. Eating makes the banana fresher. Grape +10 points, -8 ripeness. Sugar +25 points, -15 ripeness. Frost +5 points, -28 ripeness, no growth.</p>
    </main>
    <script type="module">
      const canvas = document.getElementById('banana-canvas')
      const view = canvas.getContext('2d')
      if (!view) throw new Error('this browser has no 2d canvas')
      const COLS = 30
      const ROWS = 30
      // This machine's network address and whether the server listens on this machine only: together they make the join link.
      const LAN_ADDRESS = ${JSON.stringify(options.lanAddress ?? null)}
      const LOCAL_ONLY = ${options.localOnly === true}
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
      const nickInput = document.getElementById('banana-nick')
      const joinEl = document.getElementById('banana-join')
      const savedEl = document.getElementById('banana-saved')
      const boardEl = document.getElementById('banana-board')

      const game = {
        snake: [],
        ripeness: 0,
        score: 0,
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

      function hud() {
        scoreEl.textContent = String(game.score)
        lengthEl.textContent = String(game.snake.length)
        ripenessEl.textContent = Math.round(game.ripeness) + '%'
        fillEl.style.width = Math.min(100, game.ripeness) + '%'
        fillEl.style.background = bananaColor(game.ripeness)
        bandEl.textContent =
          game.ripeness > 60
            ? 'Rotting. Mould is spreading along the peel.'
            : isGolden()
              ? 'Golden. Every point counts double.'
              : 'Golden band: ripeness 25% to 60%, doubled points'
      }

      let turns = Promise.resolve()
      function queueDir(x, y) {
        if (!game.running) return
        if (socket && socket.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'turn', x, y })); return }
        if (!fallback) return
        turns = turns.then(() => fetch('/banana/room/turn', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: secret, x: x, y: y }), signal: AbortSignal.timeout(2000),
        })).catch(() => { statusEl.textContent = 'Could not send direction.' })
      }

      async function start() {
        if (joining || game.running) return
        joining = true
        myName = nickInput.value.trim().slice(0, 16) || myName
        try {
          let joined
          if (socket && socket.readyState === WebSocket.OPEN) {
            joined = await new Promise((resolve, reject) => {
              const request = pendingJoin = { resolve, reject }
              socket.send(JSON.stringify({ type: 'join', name: myName }))
              setTimeout(() => {
                if (pendingJoin !== request) return
                // A fresh socket, so a late answer to this join cannot answer the next one.
                pendingJoin = null
                connect()
                reject(new Error('The counter did not answer. Press Start again.'))
              }, 5000)
            })
          } else {
            if (!fallback) throw new Error('Connecting to the counter...')
            const response = await fetch('/banana/room/join', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ key: secret, name: myName }),
            })
            if (!response.ok) throw new Error('Join failed (' + response.status + ').')
            joined = await response.json()
          }
          try { sessionStorage.setItem('banana-key', secret); localStorage.setItem('banana-key', secret) } catch {}
          myId = joined.id
          joinStep = joined.step
          seenPlayer = false
          game.score = 0
          game.snake = []
          game.ripeness = 0
          game.running = true
          overlay.hidden = true
          saveForm.hidden = true
          savedEl.hidden = true
          statusEl.textContent = 'Playing. Eat fruit, stay golden.'
        } catch (error) { statusEl.textContent = error.message || 'Could not join.' }
        finally { joining = false }
      }

      function finish(title, text) {
        game.running = false
        overlayTitle.textContent = title
        overlayText.textContent = text + ' You scored ' + game.score + ' with a banana ' + game.snake.length + ' long.'
        startBtn.textContent = 'Play again'
        saveForm.hidden = game.score <= 0
        const nick = nickInput.value.trim().slice(0, 16)
        if (nick) nameInput.value = nick
        savedEl.hidden = true
        overlay.hidden = false
        statusEl.textContent = title + ' ' + text + ' Score ' + game.score + '.'
        refreshBoard()
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

      function bulgeBump(position, elapsed) {
        if (elapsed < 0 || elapsed >= 1500) return 0
        const distance = Math.abs(position - elapsed / 1500)
        return distance < 0.2 ? (1 + Math.cos(Math.PI * distance / 0.2)) / 2 : 0
      }

      function detectBulge(before, player) {
        if (!before || before.id !== player.id || player.score < before.score) return 0
        const gain = player.score - before.score
        // The smallest banana is 6 cells, worth 60 points; the best food is worth 50.
        return gain > 0 ? (gain >= 60 ? 0.7 : 0.35) : 0
      }

      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
      const bulges = new Map()

      function drawBanana(cells, ripe, alpha, label, player, time) {
        if (!cells.length) return
        view.globalAlpha = alpha
        const points = []
        for (const cell of cells) points.push({ x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 })
        points.reverse()
        const runs = bodyRuns(points)
        let total = 0
        for (const run of runs) total += runLength(run)
        if (total < 1) total = 1

        const active = bulges.get(player.id) || []
        function widthAt(t) {
          let bump = 0
          for (const bulge of active) {
            const elapsed = time - bulge.start
            if (elapsed < 1500) bump += bulge.amount * bulgeBump(1 - t, reducedMotion.matches ? 0 : elapsed)
          }
          return radiusAt(t) * (1 + bump)
        }
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
            const r = widthAt(sample.t)
            lit.push({ x: sample.x + sample.nx * r * 0.6, y: sample.y + sample.ny * r * 0.6 })
            shaded.push({ x: sample.x - sample.nx * r * 0.78, y: sample.y - sample.ny * r * 0.78 })
          }
          ridgeLight.push(lit)
          ridgeShade.push(shaded)
          walked += runLength(run)
        }

        const shine = bananaColor(Math.min(100, ripe + 8), 14, 2)
        // Rot begins before the end, so the mould is visible for the last part of a run.
        const rot = Math.max(0, Math.min(1, (ripe - 60) / 40))

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
          bases.push(bananaColor(local, -9 * rot, -11 * rot))
          edges.push(bananaColor(local, -15 - 6 * rot, -9))
        }

        for (let i = 0; i < samples.length; i += 1) {
          view.fillStyle = edges[i]
          view.beginPath()
          view.arc(samples[i].x, samples[i].y, widthAt(samples[i].t) + 1.6 * UNIT, 0, Math.PI * 2)
          view.fill()
        }
        for (let i = 0; i < samples.length; i += 1) {
          view.fillStyle = bases[i]
          view.beginPath()
          view.arc(samples[i].x, samples[i].y, widthAt(samples[i].t), 0, Math.PI * 2)
          view.fill()
        }

        view.globalAlpha = alpha * 0.4 * (1 - rot * 0.75)
        view.fillStyle = shine
        for (const sample of samples) {
          const r = radiusAt(sample.t)
          view.beginPath()
          view.arc(sample.x + sample.nx * r * 0.36, sample.y + sample.ny * r * 0.36, r * 0.54, 0, Math.PI * 2)
          view.fill()
        }
        view.globalAlpha = alpha

        // The two long ridges a banana has, one lit and one in shade, so the peel reads as round.
        view.lineCap = 'round'
        view.globalAlpha = alpha * 0.5
        view.strokeStyle = shine
        view.lineWidth = 1.1 * UNIT
        for (const ridge of ridgeLight) {
          if (ridge.length > 1 && smoothPath(ridge)) view.stroke()
        }
        view.globalAlpha = alpha * 0.22
        view.strokeStyle = '#2a1a06'
        view.lineWidth = 1.6 * UNIT
        for (const ridge of ridgeShade) {
          if (ridge.length > 1 && smoothPath(ridge)) view.stroke()
        }
        view.globalAlpha = alpha

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

        // Rot: dark sunken patches, then mould colonies with a pale fuzzy edge, anchored along the peel.
        const sampleAt = (t) => {
          let lo = 0
          let hi = samples.length - 1
          while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (samples[mid].t < t) lo = mid + 1
            else hi = mid
          }
          return samples[lo]
        }

        if (rot > 0) {
          const patches = Math.round(rot * 5)
          for (let p = 0; p < patches; p += 1) {
            const sample = sampleAt(0.08 + 0.86 * ((p + 0.5) / Math.max(1, patches)) + noise(p * 4.7) * 0.06)
            const r = radiusAt(sample.t)
            view.fillStyle = 'rgba(40, 24, 7, ' + (0.16 + rot * 0.34).toFixed(3) + ')'
            view.beginPath()
            view.ellipse(
              sample.x + sample.nx * r * 0.12,
              sample.y + sample.ny * r * 0.12,
              r * (0.55 + noise(p * 1.3) * 0.35),
              r * 0.5,
              sample.t * 4,
              0,
              Math.PI * 2,
            )
            view.fill()
          }

          // Mould starts near the stem, where a banana keeps its moisture, and spreads along the peel.
          const colonies = Math.floor(rot * 7)
          for (let c = 0; c < colonies; c += 1) {
            const path = (c + 0.5) / colonies
            const sample = sampleAt(Math.min(0.96, 0.04 + 0.92 * Math.pow(path, 1.3)))
            const r = radiusAt(sample.t)
            const side = noise(c * 3.7) > 0.5 ? 1 : -1
            const mx = sample.x + sample.nx * r * 0.42 * side
            const my = sample.y + sample.ny * r * 0.42 * side
            const size = r * (0.2 + noise(c * 1.9) * 0.2)

            view.save()
            view.shadowColor = 'rgba(214, 228, 186, 0.55)'
            view.shadowBlur = 6 * UNIT
            view.fillStyle = 'rgba(208, 220, 178, 0.88)'
            for (const blob of [[-0.55, -0.3, 1], [0.45, -0.45, 0.82], [0.1, 0.5, 0.92]]) {
              view.beginPath()
              view.arc(mx + blob[0] * size, my + blob[1] * size, size * blob[2], 0, Math.PI * 2)
              view.fill()
            }
            view.restore()

            view.fillStyle = 'rgba(62, 76, 38, 0.6)'
            view.beginPath()
            view.arc(mx, my, size * 0.32, 0, Math.PI * 2)
            view.fill()

            view.strokeStyle = 'rgba(196, 210, 166, 0.75)'
            view.lineWidth = 0.8 * UNIT
            for (let hair = 0; hair < 8; hair += 1) {
              const angle = (hair / 8) * Math.PI * 2 + noise(c + hair * 1.7) * 0.7
              const from = size * 0.9
              const to = size * (1.35 + noise(c * 2 + hair) * 0.75)
              view.beginPath()
              view.moveTo(mx + Math.cos(angle) * from, my + Math.sin(angle) * from)
              view.lineTo(mx + Math.cos(angle) * to, my + Math.sin(angle) * to)
              view.stroke()
            }
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

        if (label) {
          // The player's name sits above the head in small letters, over a dark halo so it reads on the wood.
          view.globalAlpha = 1
          const size = Math.max(9, Math.round(9 * UNIT))
          view.font = '600 ' + size + 'px system-ui, -apple-system, sans-serif'
          view.textAlign = 'center'
          const half = view.measureText(label).width / 2
          const x = Math.min(canvas.width - half - 2, Math.max(half + 2, head.x))
          const y = Math.max(size, head.y - 12 * UNIT)
          view.lineWidth = 3
          view.strokeStyle = 'rgba(12, 8, 4, 0.85)'
          view.strokeText(label, x, y)
          view.fillStyle = 'rgba(255, 246, 220, 0.95)'
          view.fillText(label, x, y)
          view.textAlign = 'left'
        }
        if (ripe > 85) {
          const seed = Array.from(player.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
          const center = samples[Math.floor(samples.length / 2)]
          for (let i = 0; i < 4; i++) {
            const angle = seed + i * Math.PI / 2 + (reducedMotion.matches ? 0 : time * (0.001 + i * 0.0003))
            const x = center.x + Math.cos(angle) * (20 + i * 5) * UNIT
            const y = center.y + Math.sin(angle) * (14 + i * 4) * UNIT
            const wing = reducedMotion.matches ? 2 : 1 + Math.abs(Math.sin(time * 0.02 + i)) * 2
            view.fillStyle = 'rgba(225, 230, 218, 0.75)'
            view.beginPath(); view.ellipse(x - 2 * UNIT, y - 2 * UNIT, 2 * UNIT, wing * UNIT, -0.5, 0, Math.PI * 2); view.fill()
            view.beginPath(); view.ellipse(x + 2 * UNIT, y - 2 * UNIT, 2 * UNIT, wing * UNIT, 0.5, 0, Math.PI * 2); view.fill()
            view.fillStyle = '#211b14'
            view.beginPath(); view.arc(x, y, 1.6 * UNIT, 0, Math.PI * 2); view.fill()
          }
        }
        view.globalAlpha = 1
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

      function delta(a, b, size) {
        return (((a - b + size / 2) % size + size) % size) - size / 2
      }

      /** Up to 20 cells a banana moves exactly one cell per step and is drawn without delay; a faster one needs one cell of lag to glide evenly, eased in. */
      function nextLag(before, length) {
        const target = length > 20 ? 1 : 0
        return before ? Math.max(before.lag - 0.1, Math.min(before.lag + 0.1, target)) : target
      }

      function trailCells(player, before, size, blend) {
        const wrapDelta = (a, b) => (((a - b + size / 2) % size + size) % size) - size / 2
        const raw = player.cells.map(c => ({ x: c[0], y: c[1] }))
        if (!before || player.moved < before.moved) {
          for (let i = 1; i < raw.length; i++) {
            raw[i].x = raw[i - 1].x + wrapDelta(player.cells[i][0], player.cells[i - 1][0])
            raw[i].y = raw[i - 1].y + wrapDelta(player.cells[i][1], player.cells[i - 1][1])
          }
          return raw
        }
        const moves = player.moved - before.moved
        const trail = player.cells.concat(before.cells.slice(Math.max(0, player.cells.length - moves)))
        const points = trail.map((c, i) => i ? {
          x: 0, y: 0
        } : { x: c[0], y: c[1] })
        for (let i = 1; i < points.length; i++) {
          points[i].x = points[i - 1].x + wrapDelta(trail[i][0], trail[i - 1][0])
          points[i].y = points[i - 1].y + wrapDelta(trail[i][1], trail[i - 1][1])
        }
        const position = before.moved + before.credit + (player.moved + player.credit - before.moved - before.credit) * Math.max(0, Math.min(1, blend))
        const lag = before.lag + (player.lag - before.lag) * Math.max(0, Math.min(1, blend))
        const offset = Math.max(0, player.moved - position + lag)
        return raw.map((cell, i) => {
          const at = i + offset, index = Math.floor(at), fraction = at - index
          const from = points[Math.min(index, points.length - 1)], to = points[Math.min(index + 1, points.length - 1)]
          return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }
        })
      }

      function smoothCells(player) {
        const before = previous.size === latest.size && previous.players.find(p => p.id === player.id)
        return trailCells(player, before, latest.size, (performance.now() - receivedAt) / 120)
      }

      let camera = { x: 15, y: 15 }
      // The wood and its mirror images in one tile, so it repeats without a seam.
      const floorTile = document.createElement('canvas')
      floorTile.width = wood.width * 2
      floorTile.height = wood.height * 2
      const floorView = floorTile.getContext('2d')
      for (const fx of [1, -1]) for (const fy of [1, -1]) {
        floorView.setTransform(fx, 0, 0, fy, fx < 0 ? floorTile.width : 0, fy < 0 ? floorTile.height : 0)
        floorView.drawImage(wood, 0, 0)
      }
      function draw(time) {
        const size = latest.size
        const own = latest.players.find(p => p.id === myId)
        if (own) {
          const head = smoothCells(own)[0]
          camera.x += delta(head.x, camera.x, size)
          camera.y += delta(head.y, camera.y, size)
        }
        const left = camera.x - COLS / 2, top = camera.y - ROWS / 2
        const w = floorTile.width, h = floorTile.height
        const wx = ((-left * CELL) % w + w) % w
        const wy = ((-top * CELL) % h + h) % h
        for (const x of [wx - w, wx]) for (const y of [wy - h, wy]) view.drawImage(floorTile, x, y)
        for (const food of latest.foods) {
          const x = camera.x + delta(food.x, camera.x, size) - left
          const y = camera.y + delta(food.y, camera.y, size) - top
          for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size])
            if (x + dx > -1 && x + dx < COLS && y + dy > -1 && y + dy < ROWS)
              drawFood({ ...food, x: x + dx, y: y + dy }, time)
        }
        for (const player of latest.players) {
          const cells = smoothCells(player)
          if (!cells.length) continue
          const shiftX = camera.x + delta(cells[0].x, camera.x, size) - cells[0].x - left
          const shiftY = camera.y + delta(cells[0].y, camera.y, size) - cells[0].y - top
          for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
            const shown = cells.map(c => ({ x: c.x + shiftX + dx, y: c.y + shiftY + dy }))
            if (shown.some(c => c.x >= -1 && c.x < COLS + 1 && c.y >= -1 && c.y < ROWS + 1))
              drawBanana(shown, player.ripe, player.safe ? 0.5 : 1, player.name + ' (' + player.cells.length + ')', player, time)
          }
          const dx = delta(cells[0].x, camera.x, size), dy = delta(cells[0].y, camera.y, size)
          if (size > 30 && player.id !== myId && (Math.abs(dx) > 15 || Math.abs(dy) > 15)) {
            const scale = 13.8 / Math.max(Math.abs(dx), Math.abs(dy))
            view.save()
            view.translate((15 + dx * scale) * CELL, (15 + dy * scale) * CELL)
            view.rotate(Math.atan2(dy, dx))
            view.fillStyle = '#fff'
            view.beginPath(); view.moveTo(8, 0); view.lineTo(-6, -5); view.lineTo(-6, 5); view.fill()
            view.restore()
          }
        }
        const map = 110, pad = 12
        view.fillStyle = 'rgba(0,0,0,.7)'
        view.fillRect(canvas.width - map - pad, pad, map, map)
        for (const player of latest.players) {
          const head = player.cells[0]
          if (!head) continue
          view.fillStyle = player.id === myId ? '#ffd45c' : '#fff'
          view.beginPath()
          view.arc(canvas.width - map - pad + head[0] / size * map, pad + head[1] / size * map, player.id === myId ? 4 : 3, 0, Math.PI * 2)
          view.fill()
        }
      }

      function frame(now) {
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

      const roomEl = document.getElementById('banana-room')
      let myId = null
      let joinStep = 0
      let seenPlayer = false
      let joining = false
      const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('')
      let secret = newKey()
      const resume = async (key) => {
        const response = await fetch('/banana/room/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }), signal: AbortSignal.timeout(3000) })
        return response.ok ? response.json() : { state: 'none' }
      }
      /** The banana keeps going on the server, so a resume that cannot get through is tried again rather than given up. */
      const resumeSoon = async (key) => {
        for (;;) {
          try { return await resume(key) } catch {
            statusEl.textContent = 'Reconnecting to your banana...'
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }
      let restored = { state: 'none' }
      // A banana still held by another page: perhaps a second tab, perhaps a page that just closed.
      let elsewhere = null
      try {
        const sessionKey = sessionStorage.getItem('banana-key')
        const stored = sessionKey || localStorage.getItem('banana-key')
        if (stored) {
          const result = await resumeSoon(stored)
          const reload = sessionKey && performance.getEntriesByType('navigation')[0]?.type === 'reload'
          if ((sessionKey && result.state === 'none') || result.state === 'ended' || (result.state === 'playing' && (!result.connected || reload))) { secret = stored; restored = result }
          else if (result.state === 'playing') elsewhere = stored
        }
      } catch { secret = newKey() }
      // Start works at once; the banana is taken back in the background if its page turns out to be gone.
      if (elsewhere) {
        let tries = 5
        const check = setInterval(async () => {
          if (game.running || joining || nickInput.value || tries-- <= 0) { clearInterval(check); return }
          const result = await resume(elsewhere).catch(() => null)
          if (result && result.state === 'playing' && !result.connected && !game.running && !joining && !nickInput.value) {
            clearInterval(check)
            try { sessionStorage.setItem('banana-key', elsewhere) } catch { return }
            location.reload()
          }
        }, 400)
      }
      const connection = document.getElementById('banana-connection')
      function endingText(reason, away, by) {
        const text = reason === 'Eaten!' ? 'Your banana was eaten by ' + by : reason === 'Tangle!' ? 'Your banana tied itself in a knot' : reason === 'Replaced' ? 'Your place was given to someone else because the counter was full' : 'Your banana went rotten'
        return text + (away ? ' while you were away.' : '.')
      }
      function endedWhileAway(result) {
        game.score = result.score
        game.snake = Array(result.length)
        finish('While you were away', endingText(result.reason, true, result.by))
        saveForm.hidden = false
        startBtn.textContent = 'Start over'
        hud()
      }
      let myName = restored.name || 'Guest ' + Array.from(crypto.getRandomValues(new Uint8Array(3)), n => n.toString(16).padStart(2, '0')).join('')
      if (restored.name && !restored.name.startsWith('Guest ')) nickInput.value = restored.name
      if (restored.state === 'playing') {
        myId = restored.id
        joinStep = restored.step
        game.running = true
        overlay.hidden = true
        statusEl.textContent = 'Welcome back. Your banana kept going.'
      } else if (restored.state === 'ended') endedWhileAway(restored)
      let latest = { size: 30, players: [], foods: [] }
      let previous = latest
      let receivedAt = 0
      let growthMessage = ''

      // The link other people open to join the same counter: this machine's network address plus the path of this page.
      if (LAN_ADDRESS) {
        const port = location.port ? ':' + location.port : ''
        const link = document.createElement('a')
        link.href = 'http://' + LAN_ADDRESS + port + location.pathname
        link.textContent = link.href
        joinEl.append(
          'Others can join at ',
          link,
          LOCAL_ONLY
            ? ' once the app is started on the network (ACRYLBLENDS_HOST=0.0.0.0).'
            : ' - send them the link.',
        )
        joinEl.hidden = false
      }

      let wasDisconnected = false
      let checkingResume = false
      function onRoom(event) {
        const data = JSON.parse(event.data)
        connection.hidden = true
        previous = latest
        latest = data
        receivedAt = performance.now()
        const players = new Map(data.players.map(p => [p.id, p]))
        for (const p of data.players) p.lag = nextLag(previous.players.find(q => q.id === p.id && q.moved <= p.moved), p.cells.length)
        for (const id of bulges.keys()) {
          const before = previous.players.find(p => p.id === id)
          const current = players.get(id)
          if (!current || !before || current.score < before.score || data.ended.some(p => p.id === id)) bulges.delete(id)
        }
        for (const current of data.players) {
          const before = previous.players.find(p => p.id === current.id)
          const amount = data.ended.some(p => p.id === current.id) ? 0 : detectBulge(before, current)
          const active = (bulges.get(current.id) || []).filter(b => receivedAt - b.start < 1500)
          if (amount) active.push({ start: receivedAt, amount: amount })
          if (active.length) bulges.set(current.id, active.slice(-6))
          else bulges.delete(current.id)
        }
        const player = data.players.find(p => p.id === myId)
        const ended = data.ended.find(p => p.id === myId)
        if (game.running && player) {
          seenPlayer = true
          if (wasDisconnected) statusEl.textContent = 'Welcome back. Your banana kept going.'
          wasDisconnected = false
          game.score = player.score
          game.ripeness = player.ripe
          game.snake = player.cells
          hud()
        } else if (game.running && !joining && (seenPlayer || data.step > joinStep)) {
          if (ended) {
            if (wasDisconnected) endedWhileAway(ended)
            else { game.score = ended.score; game.snake = Array(ended.length); finish(ended.reason, endingText(ended.reason, false, ended.by)) }
            wasDisconnected = false
          } else if (!checkingResume) {
            checkingResume = true
            resume(secret).then(result => {
              if (!game.running) return
              if (result.state === 'ended') endedWhileAway(result)
              else if (result.state === 'none') { finish('The counter restarted', 'Your banana is no longer on the counter.'); saveForm.hidden = true; startBtn.textContent = 'Start over' }
            }).catch(() => { connection.hidden = false }).finally(() => { checkingResume = false })
          }
        }
        if (data.size > previous.size) growthMessage = ' The counter grew to ' + data.size + ' x ' + data.size + '.'
        else if (data.size < previous.size) growthMessage = ''
        const others = data.players.filter(p => p.id !== myId).length
        roomEl.textContent = others ? others + (others === 1 ? ' other banana' : ' other bananas') + ' on the counter right now.' : 'Nobody else on the counter right now.'
        roomEl.textContent += growthMessage
      }
      function lostConnection() {
        if (game.running) { wasDisconnected = true; connection.hidden = false } else statusEl.textContent = 'Connecting to the counter...'
      }
      let source, socket, pendingJoin
      let fallback = false, receivedSocket = false, reconnectTimer, openTimer
      let openedAt = 0
      function connect() {
        clearTimeout(reconnectTimer)
        clearTimeout(openTimer)
        if (source) { source.close(); source = null }
        if (socket) { socket.onclose = null; socket.close(); socket = null }
        openedAt = performance.now()
        if (fallback) {
          source = new EventSource('/banana/room/events?key=' + encodeURIComponent(secret))
          source.addEventListener('room', onRoom)
          source.onerror = lostConnection
          return
        }
        const url = new URL(location.pathname + '/room/socket', location.href)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('key', secret)
        try { socket = new WebSocket(url) } catch { fallback = true; connect(); return }
        const current = socket
        const useFallback = () => { fallback = true; connect() }
        openTimer = setTimeout(() => { if (current.readyState !== WebSocket.OPEN) useFallback() }, 3000)
        current.onmessage = event => {
          receivedSocket = true
          clearTimeout(openTimer)
          let data
          try { data = JSON.parse(event.data) } catch { return }
          if (data.type === 'joined' && pendingJoin) { pendingJoin.resolve(data); pendingJoin = null }
          else if (data.type === 'error' && pendingJoin) { pendingJoin.reject(new Error(data.error)); pendingJoin = null }
          else if (data.players) onRoom(event)
        }
        current.onclose = () => {
          clearTimeout(openTimer)
          if (pendingJoin) { pendingJoin.reject(new Error('Connection lost.')); pendingJoin = null }
          lostConnection()
          if (!receivedSocket) useFallback()
          else reconnectTimer = setTimeout(connect, 500)
        }
      }
      connect()
      // A dropped network can leave the stream open but silent for minutes: while playing, updates come several times a second.
      setInterval(() => {
        const silence = performance.now() - Math.max(receivedAt, openedAt)
        if (game.running && performance.now() - receivedAt > 2000 && silence > 1000) lostConnection()
        if (game.running && silence > 4000) connect()
      }, 500)

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
          myName = name
          savedEl.textContent = 'Saved. You are on the board.'
        } catch (error) {
          savedEl.textContent = 'The score could not be saved.'
        }
      })

      hud()
      draw(0)
      requestAnimationFrame(frame)
      refreshBoard()
    </script>
  </body>
</html>`
}
