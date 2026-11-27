export function stockfishMove(fen, level, allowed) {
  const depths = { relaxed: 3, balanced: 8, sharp: 12 },
    skills = { relaxed: 1, balanced: 9, sharp: 20 }
  let worker,
    timer,
    done = false,
    finish
  const result = new Promise((resolve) => {
    finish = (move) => {
      if (done) return
      done = true
      clearTimeout(timer)
      worker?.terminate()
      resolve(move)
    }
    try {
      worker = new Worker(new URL('./vendor/stockfish.wasm.js', import.meta.url))
    } catch {
      finish(null)
      return
    }
    worker.onerror = () => finish(null)
    worker.onmessage = (e) => {
      const line = String(e.data)
      if (line === 'uciok') {
        worker.postMessage('setoption name Skill Level value ' + skills[level])
        worker.postMessage('isready')
      } else if (line === 'readyok') {
        worker.postMessage('position fen ' + fen)
        worker.postMessage(
          'go depth ' + depths[level] + ' movetime ' + (level === 'sharp' ? 1000 : 350),
        )
      } else if (line.startsWith('bestmove ')) {
        const uci = line.split(/\s+/)[1]
        finish(allowed.find((m) => m.from + m.to + (m.promotion || '') === uci) || null)
      }
    }
    timer = setTimeout(() => finish(null), 7000)
    worker.postMessage('uci')
  })
  return { result, cancel: () => finish(null) }
}
