// A worker belongs to one job. Reuse it for both root searches in a move review.
function engineJob(requests, skill, onComplete) {
  let worker, timer, finish
  const result = new Promise((resolve) => {
    let done = false,
      index = 0,
      score = null
    const answers = []
    finish = (value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      worker?.terminate()
      resolve(value)
    }
    const start = () => {
      score = null
      worker.postMessage('position fen ' + requests[index].fen)
      worker.postMessage(requests[index].go)
    }
    try {
      worker = new Worker(new URL('./vendor/stockfish.wasm.js', import.meta.url))
      worker.onerror = () => finish(null)
      worker.onmessage = ({ data }) => {
        const line = String(data).trim()
        if (line === 'uciok') {
          worker.postMessage('setoption name Skill Level value ' + skill)
          worker.postMessage('isready')
        } else if (line === 'readyok') start()
        else if (line.startsWith('info ') && !/\b(lowerbound|upperbound)\b/.test(line)) {
          const match = line.match(/\bscore (cp|mate) (-?\d+)\b/)
          if (match) score = { type: match[1], value: Number(match[2]) }
        } else if (line.startsWith('bestmove ')) {
          answers.push({ move: line.split(/\s+/)[1], score })
          if (++index < requests.length) start()
          else finish(onComplete(answers))
        }
      }
      timer = setTimeout(() => finish(null), 7000 * requests.length)
      worker.postMessage('uci')
    } catch {
      finish(null)
    }
  })
  return { result, cancel: () => finish(null) }
}

export function stockfishMove(fen, level, allowed) {
  const depths = { beginner:1,easy:3,medium:7,hard:12,master:18,relaxed:3,balanced:8,sharp:12 }
  const skills = { beginner:0,easy:3,medium:9,hard:16,master:20,relaxed:1,balanced:9,sharp:20 }
  const go = 'go depth ' + depths[level] + ' movetime ' + (['master','sharp'].includes(level) ? 1600 : level==='hard'?700:350)
  return engineJob(
    [{ fen, go }],
    skills[level],
    ([answer]) => allowed.find((m) => m.from + m.to + (m.promotion || '') === answer.move) || null,
  )
}

export function compareMove(fen, played, alternatives = []) {
  const go = 'go depth 16 movetime 1250'
  const requests = [{fen,go},{fen,go:go+' searchmoves '+played}]
  const valid = alternatives.filter(m=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)&&m!==played)
  if(valid.length) requests.push({fen,go:go+' searchmoves '+valid.join(' ')})
  return engineJob(requests,20,([best,actual,alternative]) =>
    best.score && actual.score && actual.move===played ? {best,actual,alternative:alternative?.score?alternative:null}:null
  )
}
