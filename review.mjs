import { orthodox, movement, other } from './game.mjs'

const value = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 }
const worth = (piece) => (piece ? (value[piece.t] ?? 6) : 0)
const points = (board, side) =>
  Object.values(board).reduce((n, p) => n + worth(p) * (p.c === side ? 1 : -1), 0)

export const grades = {
  brilliant: ['Brilliant', '!!'],
  best: ['Best', '★'],
  excellent: ['Excellent', '!'],
  good: ['Good', '✓'],
  inaccuracy: ['Inaccuracy', '?!'],
  mistake: ['Mistake', '?'],
  blunder: ['Blunder', '??'],
  winning: ['Winning move', '♛'],
  drawn: ['Draw', '½'],
}
function grade(key, detail, source) {
  return { key, detail, source }
}

// Measure an actual material offer after immediate legal recaptures on the landing square.
function exchangeGain(chess, target, depth = 0) {
  const victim = chess.get(target)
  if (!victim || depth >= 6 || !chess.isAttacked(target, chess.turn())) return 0
  const replies = chess.moves({ verbose: true }).filter((m) => m.to === target && m.isCapture())
  let gain = 0
  for (const move of replies) {
    chess.move(move)
    const promotionGain = move.promotion ? value[move.promotion] - 1 : 0
    gain = Math.max(
      gain,
      value[victim.type] + promotionGain - exchangeGain(chess, target, depth + 1),
    )
    chess.undo()
  }
  return gain
}
function newFork(before, after, from, to, actor) {
  const majorTargets = (board, origin) =>
    Object.entries(board)
      .filter(
        ([square, piece]) =>
          piece.c !== actor && ['k', 'q', 'r'].includes(piece.t) && movement(board, origin, square),
      )
      .map(([square]) => square)
  const targets = majorTargets(after.b, to)
  if (targets.length < 2) return false
  const oldTargets = majorTargets(before.b, from)
  return targets.some((square) => !oldTargets.includes(square))
}

export function reviewMove(before, after, action, actor, outcome) {
  const { from, to, promotion, power } = action,
    mover = before.b[from]
  if (outcome) {
    if (outcome.winner === null)
      return {
        grade: grade(
          'drawn',
          'The side to move has no legal move and is outside check.',
          'Game result',
        ),
      }
    if (outcome.winner !== actor)
      return { grade: grade('blunder', 'This move gave the other side the win.', 'Game result') }
    return {
      grade: grade(
        'winning',
        outcome.reason === 'Checkmate'
          ? 'The king is in check with no legal escape.'
          : 'The opposing side lost its last king.',
        'Game result',
      ),
    }
  }
  const change = points(after.b, actor) - points(before.b, actor)
  const threatened =
    to &&
    after.b[to]?.c === actor &&
    Object.entries(after.b).some(([sq, p]) => p.c !== actor && movement(after.b, sq, to))
  const defended =
    threatened &&
    Object.entries(after.b).some(
      ([sq, p]) =>
        sq !== to &&
        p.c === actor &&
        movement({ ...after.b, [to]: { ...after.b[to], c: other(actor) } }, sq, to),
    )
  const source = 'Sandbox estimate'
  let quick
  if (change <= -4.5) quick = grade('blunder', 'The move costs your side major material.', source)
  else if (change < -0.5) quick = grade('mistake', 'Your side loses material on this move.', source)
  else if (threatened && !defended && worth(after.b[to]) - change >= 4.5)
    quick = grade('blunder', 'A major piece is exposed to a capture on ' + to + '.', source)
  else if (threatened && !defended && worth(after.b[to]) - change >= 2.5)
    quick = grade(
      'mistake',
      'The piece on ' + to + ' can be taken without an immediate recapture.',
      source,
    )
  else if (
    !power &&
    mover.c === actor &&
    !threatened &&
    change >= 0 &&
    to &&
    newFork(before, after, from, to, actor)
  )
    quick = grade(
      'brilliant',
      'Your piece creates a double attack on two major targets while staying out of immediate danger.',
      source,
    )
  else if (change >= 3) quick = grade('excellent', 'Your side gains material on this move.', source)
  else
    quick = grade(
      'good',
      change > 0.5 ? 'Your side gains material.' : 'The material balance holds.',
      'Sandbox estimate',
    )
  if (power || mover.c !== actor) return { grade: quick }
  const chess = orthodox(before, actor)
  const candidate = chess
    ?.moves({ square: from, verbose: true })
    .find((m) => m.to === to && m.promotion === promotion)
  if (!candidate) return { grade: quick }
  const fen = chess.fen()
  chess.move(candidate)
  const captured = value[candidate.captured] || 0
  const offer = worth(mover) >= 3 && exchangeGain(chess, to) - captured >= 1.75
  return { grade: quick, search: { fen, played: from + to + (promotion || ''), offer } }
}
function scoreInPawns(score) {
  if (score.type === 'cp') return score.value / 100
  return Math.sign(score.value) * (100 - Math.min(Math.abs(score.value), 90) / 100)
}
export function engineGrade(search, answer) {
  const best = scoreInPawns(answer.best.score),
    played = scoreInPawns(answer.actual.score)
  const top = answer.best.move === search.played,
    loss = top ? 0 : Math.max(0, best - played)
  const source = 'Stockfish review'
  if (
    search.offer &&
    loss <= 0.35 &&
    played >= -0.45 &&
    (best < 5 || answer.actual.score.type === 'mate')
  )
    return grade(
      'brilliant',
      'A sound material sacrifice. Stockfish still puts the move close to its first choice.',
      source,
    )
  if (top) return grade('best', 'Stockfish chose the same move in this position.', source)
  if (loss <= 0.3)
    return grade('excellent', 'The evaluation stays close to the engine’s top line.', source)
  if (loss <= 0.8) return grade('good', 'The move keeps most of the position’s value.', source)
  if (loss <= 1.6) return grade('inaccuracy', 'Stockfish found a stronger continuation.', source)
  if (loss <= 3)
    return grade('mistake', 'The engine sees a significant drop after this move.', source)
  return grade(
    'blunder',
    'Stockfish finds a much stronger continuation than the move played.',
    source,
  )
}
