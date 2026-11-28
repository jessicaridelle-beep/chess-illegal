import { Chess } from './vendor/chess.mjs'
import { orthodox, movement, other, boardSize } from './game.mjs?v=boss-11'

const value = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 }
const worth = (piece) => (piece ? (value[piece.t] ?? 6) : 0)
const points = (board, side) =>
  Object.values(board).reduce((n, p) => n + worth(p) * (p.c === side ? 1 : -1), 0)

export const grades = {
  book: ['Book move', '▣'],
  brilliant: ['Brilliant', '!!'],
  great: ['Great', '!'],
  illegalBrilliant: ['Illegal brilliant', '!!'],
  miss: ['Miss', '×'],
  sandbox: ['Sandbox move', '✦'],
  best: ['Best', '★'],
  excellent: ['Excellent', '!'],
  good: ['Good', '✓'],
  inaccuracy: ['Inaccuracy', '?!'],
  mistake: ['Mistake', '?'],
  blunder: ['Blunder', '??'],
  winning: ['Winning move', '♛'],
  drawn: ['Draw', '½'],
}
// A deliberately small, local opening book. Only exact known positions and moves get the book icon.
const openingLines=[
 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',
 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5',
 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4',
 'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6',
 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4',
 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',
 'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6',
 'd2d4 d7d5 g1f3 g8f6 c1f4',
 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4',
 'c2c4 e7e5 b1c3 g8f6',
 'g1f3 d7d5 d2d4 g8f6'
]
const openingBook=new Map()
const bookKey=ch=>ch.fen().split(' ').slice(0,4).join(' ')
for(const line of openingLines){
  const ch=new Chess()
  for(const uci of line.split(' ')){
    const k=bookKey(ch),moves=openingBook.get(k)||new Set()
    moves.add(uci);openingBook.set(k,moves)
    ch.move({from:uci.slice(0,2),to:uci.slice(2,4)})
  }
}
export function isBookMove(ch,uci){return !!openingBook.get(bookKey(ch))?.has(uci)}
export function gradeSquares(entry){
  if(!entry?.grade||!entry.sq||!entry.fx)return []
  const from=entry.fx.from
  return [...(from&&from!==entry.sq?[{sq:from,role:'origin'}]:[]),{sq:entry.sq,role:'destination'}]
}
export function grade(key, detail, source) {
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
  const majorTargets = (board, origin, size) =>
    Object.entries(board)
      .filter(
        ([square, piece]) =>
          piece.c !== actor && ['k', 'q', 'r'].includes(piece.t) && movement(board, origin, square, size),
      )
      .map(([square]) => square)
  const targets = majorTargets(after.b, to, boardSize(after))
  if (targets.length < 2) return false
  const oldTargets = majorTargets(before.b, from, boardSize(before))
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
          outcome.reason === 'Both kings lost' ? 'Both armies lost their final king.' : 'The side to move has no legal move and is outside check.',
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
    Object.entries(after.b).some(([sq, p]) => p.c !== actor && movement(after.b, sq, to, boardSize(after)))
  const defended =
    threatened &&
    Object.entries(after.b).some(
      ([sq, p]) =>
        sq !== to &&
        p.c === actor &&
        movement({ ...after.b, [to]: { ...after.b[to], c: other(actor) } }, sq, to, boardSize(after)),
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
    mover?.c === actor &&
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
  const sandbox = { grade: {...grade('sandbox', quick.detail, 'Sandbox estimate · ' + grades[quick.key][0]), visualKey:quick.key==='brilliant'?'illegalBrilliant':quick.key} }
  if (power || !mover || mover.c !== actor || before.doubleTurn) return sandbox
  const chess = orthodox(before, actor)
  const candidate = chess
    ?.moves({ square: from, verbose: true })
    .find((m) => m.to === to && m.promotion === promotion)
  if (!candidate) return sandbox
  const uci=from+to+(promotion||'')
  if(isBookMove(chess,uci))return {grade:grade('book','Recognized move in the built-in opening book.','Opening book · curated lines')}
  const fen = chess.fen()
  const alternatives = chess.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).filter(m=>m!==from+to+(promotion||''))
  chess.move(candidate)
  const captured = value[candidate.captured] || 0
  const offer = worth(mover) >= 3 && exchangeGain(chess, to) - captured >= 1.75
  return { grade: sandbox.grade, search: { fen, played: from + to + (promotion || ''), offer, alternatives } }
}
function scoreInPawns(score) {
  if (score.type === 'cp') return score.value / 100
  return Math.sign(score.value) * (100 - Math.min(Math.abs(score.value), 90) / 100)
}
// Elo-independent expected-points approximation, not Chess.com's private model.
const expected = score => score.type === 'mate' ? (score.value > 0 ? 1 : 0) : 1/(1+Math.exp(-score.value/155))
export function engineGrade(search, answer) {
  const best = expected(answer.best.score), played = expected(answer.actual.score)
  const top = answer.best.move === search.played
  const loss = top ? 0 : Math.max(0,best-played)
  const source = 'Stockfish review · expected-points estimate'
  const result = (key,detail) => ({...grade(key,detail,source),loss,accuracy: Math.max(0,100*(1-loss)),bestMove:answer.best.move})
  const explanation = ' Best line: ' + answer.best.move + '. Expected score loss: ' + (loss*100).toFixed(1) + ' points.'
  const alternative = answer.alternative?.score ? expected(answer.alternative.score) : null
  if (search.offer && loss<=.02 && played>=.48 && alternative!==null && alternative<.93)
    return result('brilliant','Sound material sacrifice with a strong engine evaluation.'+explanation)
  if (top && alternative!==null && best-alternative>=.18 && best>=.35 && alternative<.75)
    return result('great','A critical move substantially stronger than every searched alternative.'+explanation)
  if (top || loss<.001) return result('best','Matches the best engine evaluation.'+explanation)
  if (loss<=.02) return result('excellent','Very close to the engine’s best line.'+explanation)
  if (loss<=.05) return result('good','Retains most of the expected score.'+explanation)
  if (best>=.78 && played<=.58 && loss>=.15) return result('miss','Missed a strong winning opportunity.'+explanation)
  if (loss<=.10) return result('inaccuracy','A stronger continuation was available.'+explanation)
  if (loss<=.20) return result('mistake','A significant drop in expected score.'+explanation)
  return result('blunder','A major loss of expected score.'+explanation)
}

export function displayGrade(entry){
  if(!entry?.grade)return null
  const key=entry.grade.visualKey||entry.grade.key
  const [title,mark]=grades[key]||grades.sandbox
  return {key,title,mark,estimated:entry.grade.key==='sandbox',pending:!!entry.search}
}
export function reviewAction(before,after,action,actor,outcome){
  const result=reviewMove(before,after,action,actor,outcome)
  if(result.grade?.key==='sandbox'&&!result.search){
    const gained=points(after.b,actor)-points(before.b,actor)
    if(gained>=9)result.grade.visualKey='illegalBrilliant'
  }
  return result
}
export function latestBoardGrade(logs){
  const entry=logs.at(-1)
  if(!entry?.grade||!entry.sq||!entry.fx)return null
  return entry
}
