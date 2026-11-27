import { Chess, validateFen } from './vendor/chess.mjs'
import { names } from './ui.mjs'
export const files = 'abcdefgh'
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1]
export const other = (c) => (c === 'w' ? 'b' : 'w')
export const colorName = (c) => (c === 'w' ? 'White' : 'Black')
const alphabet = 'abcdefghijklmnop'
export const boardSize = s => [8,12,16].includes(s?.size) ? s.size : 8
export const boardFiles = s => alphabet.slice(0,boardSize(s))
export const boardRanks = s => Array.from({length:boardSize(s)},(_,i)=>boardSize(s)-i)
export const allSquares = s => [...boardFiles(s)].flatMap(f=>boardRanks(s).map(r=>f+r))
export const xy = s => [alphabet.indexOf(s[0]),Number(s.slice(1))-1]
export const at = (x,y,size=8) => x>=0 && x<size && y>=0 && y<size ? alphabet[x]+(y+1):null
export function expandBoard(s,size) {
  if (![12,16].includes(size) || size<=boardSize(s)) return false
  s.size=size; s.rights=''; s.ep='-'; s.last=[]
  return true
}
// One-shot gravity: absorb the center and adjacent pieces, then pull the outer ring inward.
export function blackHole(s,center) {
  if(!allSquares(s).includes(center)) return false
  const size=boardSize(s), [x,y]=xy(center)
  const affected=[center,...neighbors(center,size)]
  const ring=Object.entries(s.b).filter(([sq])=>{const [a,b]=xy(sq);return Math.max(Math.abs(a-x),Math.abs(b-y))===2})
  for(const sq of affected) if(s.b[sq]) edit(s,sq,null)
  // Multiple incoming pieces choose the same cell: the first in coordinate order remains;
  // other pieces stay in their original square.
  for(const [sq,p] of ring.sort(([a],[b])=>a.localeCompare(b))) {
    const [a,b]=xy(sq), dest=at(a+Math.sign(x-a),b+Math.sign(y-b),size)
    if(!dest || s.b[dest]) continue
    edit(s,sq,null); edit(s,dest,p); affected.push(sq,dest)
  }
  s.last=[...new Set(affected)];s.ep='-'
  return true
}
const copy = (value) => JSON.parse(JSON.stringify(value))
export function fresh() {
  const b = {}
  for (let x = 0; x < 8; x++)
    for (const [c, pawn, back] of [
      ['w', 2, 1],
      ['b', 7, 8],
    ]) {
      b[files[x] + pawn] = { c, t: 'p' }
      b[files[x] + back] = { c, t: 'rnbqkbnr'[x] }
    }
  return { b, size:8, doubleTurn:0, side: 'w', view: 'w', rights: 'KQkq', ep: '-', last: [], logs: [], pending: false }
}
export function fen(s, turn) {
  if (boardSize(s)!==8) return null
  let rows = []
  for (const rank of ranks) {
    let row = '',
      gap = 0
    for (const f of files) {
      const p = s.b[f + rank]
      if (!p) {
        gap++
        continue
      }
      if (!names[p.t]) return null
      if (gap) row += gap
      gap = 0
      row += p.c === 'w' ? p.t.toUpperCase() : p.t
    }
    rows.push(row + (gap || ''))
  }
  const ep = s.ep[1] === (turn === 'w' ? '6' : '3') ? s.ep : '-'
  return rows.join('/') + ' ' + turn + ' ' + (s.rights || '-') + ' ' + ep + ' 0 1'
}
// Only pass conventional material and playable king arrangements to Stockfish.
export function orthodox(s, turn) {
  const str = fen(s, turn)
  if (!str) return null
  for (const c of ['w', 'b']) {
    const pieces = Object.values(s.b).filter((p) => p.c === c)
    const count = (t) => pieces.filter((p) => p.t === t).length
    if (count('k') !== 1 || count('p') > 8 || pieces.length > 16) return null
    const extras = ['q', 'r', 'b', 'n'].reduce(
      (n, t) => n + Math.max(0, count(t) - (t === 'q' ? 1 : 2)),
      0,
    )
    if (extras > 8 - count('p')) return null
  }
  if (!validateFen(str).ok) return null
  const ch = new Chess(str)
  const enemyKing = Object.keys(s.b).find((sq) => s.b[sq].c !== turn && s.b[sq].t === 'k')
  if (ch.isAttacked(enemyKing, turn)) return null
  return ch
}
function removeRights(s, sq, p) {
  if (!p) return
  if (p.t === 'k') s.rights = s.rights.replace(p.c === 'w' ? /[KQ]/g : /[kq]/g, '')
  if (p.t === 'r') {
    const file = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' }[sq]
    if (file) s.rights = s.rights.replace(file, '')
  }
}
export function edit(s, sq, p) {
  removeRights(s, sq, s.b[sq])
  s.ep = '-'
  if (p) s.b[sq] = p
  else delete s.b[sq]
  s.last = [sq]
}
// Conversion retains the piece type, including custom pieces, but changes its army.
export function convertPiece(s, sq, color = s.side) {
  const piece = s.b[sq]
  if (!piece || !['w','b'].includes(color) || piece.c === color) return false
  edit(s, sq, { ...piece, c: color })
  return true
}
export function move(s, from, to, promotion) {
  const p = s.b[from]
  if (!p || from === to) return
  const victim = s.b[to]
  const ch = orthodox(s, p.c)
  const normal = ch
    ?.moves({ square: from, verbose: true })
    .find((m) => m.to === to && (!m.promotion || m.promotion === promotion))
  removeRights(s, from, p)
  removeRights(s, to, victim)
  s.ep = '-'
  if (normal) {
    if (normal.isEnPassant()) delete s.b[to[0] + from[1]]
    if (normal.isKingsideCastle() || normal.isQueensideCastle()) {
      const short = normal.isKingsideCastle(),
        rank = from[1],
        rook = (short ? 'h' : 'a') + rank
      s.b[(short ? 'f' : 'd') + rank] = s.b[rook]
      delete s.b[rook]
    }
    if (normal.isBigPawn()) s.ep = from[0] + (Number(from[1]) + Number(to[1])) / 2
  }
  delete s.b[from]
  s.b[to] = { c: p.c, t: promotion || p.t }
  s.last = [from, to]
}
export function neighbors(sq, size=8) {
  const [x, y] = xy(sq)
  return [-1, 0, 1]
    .flatMap((a) => [-1, 0, 1].filter((b) => a || b).map((b) => at(x + a, y + b,size)))
    .filter(Boolean)
}
export function usePower(s, from, to, kind) {
  const p = s.b[from]
  if (!p) return false
  if (kind === 'radiance') {
    const targets = neighbors(from,boardSize(s)).filter((sq) => s.b[sq] && s.b[sq].c !== p.c)
    if (!targets.length) return false
    for (const sq of targets) {
      removeRights(s, sq, s.b[sq])
      s.b[sq] = { ...s.b[sq], c: p.c }
    }
    s.last = [from, ...targets]
  } else if (kind === 'exchange') {
    if (!to || to === from || !s.b[to]) return false
    const q = s.b[to]
    removeRights(s, to, q)
    s.b[from] = q
    s.b[to] = p
    s.last = [from, to]
  } else if (kind === 'leap') {
    if (!to) return false
    const [x, y] = xy(from),
      [a, b] = xy(to),
      dx = Math.abs(x - a),
      dy = Math.abs(y - b)
    if (Math.max(dx, dy) !== 2 || (dx !== 0 && dx !== 2) || (dy !== 0 && dy !== 2)) return false
    const mid = at((x + a) / 2, (y + b) / 2,boardSize(s))
    if (s.b[mid] && s.b[mid].c !== p.c) {
      removeRights(s, mid, s.b[mid])
      s.b[mid] = { ...s.b[mid], c: p.c }
    }
    edit(s, to, p)
    delete s.b[from]
    s.last = [from, mid, to]
  } else if (kind === 'nova' || kind === 'echo' || kind === 'beam') {
    const targets = powerTargets(s, from, kind)
    if (kind === 'nova') {
      if (!targets.length) return false
      for (const sq of targets) edit(s, sq, null)
      s.last = [from, ...targets]
    } else {
      if (!targets.includes(to)) return false
      edit(s, to, kind === 'echo' ? { c: p.c, t: 'p' } : null)
      s.last = [from, to]
    }
  } else return false
  s.ep = '-'
  return true
}
const values = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 14 }
const price = (p) => (p ? values[p.t] || 6 : 0)
export function movement(b, from, to, size=8) {
  const p = b[from],
    [x, y] = xy(from),
    [tx, ty] = xy(to),
    dx = tx - x,
    dy = ty - y,
    ax = Math.abs(dx),
    ay = Math.abs(dy)
  if (!p || from === to || b[to]?.c === p.c || !at(tx,ty,size)) return false
  if (!names[p.t]) return Math.max(ax, ay) < 3
  if (p.t === 'k') return Math.max(ax, ay) === 1
  if (p.t === 'n') return ax * ay === 2
  if (p.t === 'p') {
    const d = p.c === 'w' ? 1 : -1
    if (ax === 1) return dy === d && !!b[to]
    if (ax || b[to]) return false
    return dy === d || (dy === 2 * d && y === (d > 0 ? 1 : size-2) && !b[at(x, y + d,size)])
  }
  const diagonal = ax === ay,
    straight = dx === 0 || dy === 0
  if (
    !(
      (p.t === 'q' && (diagonal || straight)) ||
      (p.t === 'r' && straight) ||
      (p.t === 'b' && diagonal)
    )
  )
    return false
  const sx = Math.sign(dx),
    sy = Math.sign(dy)
  for (let i = 1; i < Math.max(ax, ay); i++) if (b[at(x + sx * i, y + sy * i,size)]) return false
  return true
}
export function powerTargets(s, from, kind) {
  const p = s.b[from]
  if (!p) return []
  if (kind === 'nova' || kind === 'radiance') return neighbors(from,boardSize(s)).filter(sq => s.b[sq] && s.b[sq].c !== p.c)
  if (kind === 'echo') return neighbors(from,boardSize(s)).filter(sq => !s.b[sq] && !['1',String(boardSize(s))].includes(sq.slice(1)))
  if (kind === 'beam') {
    const [x,y] = xy(from), out = []
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (let i=1;i<=4;i++) {
        const to = at(x+dx*i,y+dy*i,boardSize(s))
        if (!to) break
        if (!s.b[to]) continue
        if (s.b[to].c !== p.c) out.push(to)
        break
      }
    }
    return out
  }
  return []
}
// In a nonstandard position this reports geometric attacks, not forced checkmate.
export function threatenedKings(s, catalog = []) {
  const checked = []
  for (const [sq,p] of Object.entries(s.b)) {
    if (p.t !== 'k') continue
    const attacked = Object.entries(s.b).some(([from,q]) => {
      if (q.c === p.c) return false
      const power = catalog.find(k=>k.id===q.t)?.power
      return movement(s.b,from,sq,boardSize(s)) || (['nova','radiance','beam'].includes(power) && powerTargets(s,from,power).includes(sq))
    })
    if (attacked) checked.push(sq)
  }
  return checked
}

// These are suggested destinations. Freeform moves are still accepted on every other square.
export function destinations(state, from, power) {
  const piece = state.b[from]
  if (!piece) return []
  if (['nova','radiance','echo','beam'].includes(power)) return powerTargets(state, from, power)
  if (power === 'exchange') return allSquares(state).filter((to) => to !== from && state.b[to])
  if (power === 'leap') {
    const [x, y] = xy(from)
    return [-2, 0, 2]
      .flatMap((dx) => [-2, 0, 2].filter((dy) => dx || dy).map((dy) => at(x + dx, y + dy,boardSize(state))))
      .filter(Boolean)
  }
  const chess = orthodox(state, piece.c)
  if (chess)
    return [...new Set(chess.moves({ square: from, verbose: true }).map((move) => move.to))]
  return allSquares(state).filter((to) => movement(state.b, from, to,boardSize(state)))
}

export function matchOutcome(before, after, nextSide) {
  const hasKing = (board, color) =>
    Object.values(board).some((piece) => piece.t === 'k' && piece.c === color)
  if (['w','b'].every(c=>hasKing(before.b,c)&&!hasKing(after.b,c))) return {winner:null,reason:'Both kings lost'}
  for (const color of ['w', 'b']) {
    if (hasKing(before.b, color) && !hasKing(after.b, color)) {
      return { winner: other(color), reason: 'Last king taken' }
    }
  }
  const chess = orthodox(after, nextSide)
  if (chess?.isCheckmate()) return { winner: other(nextSide), reason: 'Checkmate' }
  // A player can move the opposite army and even checkmate their own king.
  if (!chess && orthodox(after, other(nextSide))?.isCheckmate())
    return { winner: nextSide, reason: 'Checkmate' }
  if (chess?.isStalemate()) return { winner: null, reason: 'Stalemate' }
  return null
}
export function sandboxReply(s, catalog, level, cat) {
  const c = other(s.side),
    own = Object.keys(s.b).filter((k) => s.b[k].c === c),
    enemy = Object.keys(s.b).filter((k) => s.b[k].c !== c)
  let best = null,
    maximum = -Infinity
  function consider(action, score) {
    score += Math.random() * (cat ? 3 : level === 'relaxed' ? 4 : level === 'sharp' ? 0.35 : 1)
    if (score > maximum) {
      maximum = score
      best = action
    }
  }
  for (const from of own) {
    const p = s.b[from],
      power = catalog.find((k) => k.id === p.t)?.power
    if (['nova','echo','beam'].includes(power)) {
      const targets = powerTargets(s,from,power)
      if (power === 'nova' && targets.length) consider({from,power},targets.reduce((sum,to)=>sum+price(s.b[to])*1.5,0))
      if (power === 'beam') for (const to of targets) consider({from,to,power},price(s.b[to])*1.5)
      if (power === 'echo') for (const to of targets) consider({from,to,power},1.6)
    }
    if (power === 'radiance') {
      const score = neighbors(from,boardSize(s)).reduce(
        (v, sq) => v + (s.b[sq]?.c === other(c) ? price(s.b[sq]) * 1.65 : 0),
        0,
      )
      if (score) consider({ from, power }, score)
    }
    for (const f of boardFiles(s))
      for (const rank of boardRanks(s)) {
        const to = f + rank
        if (to === from || s.b[to]?.c === c) continue
        if (power === 'exchange' && s.b[to]) {
          const [x, y] = xy(to)
          consider(
            { from, to, power },
            (3.5 - Math.abs(3.5 - x)) * 0.15 + (3.5 - Math.abs(3.5 - y)) * 0.15,
          )
        }
        if (power === 'leap') {
          const [x, y] = xy(from),
            [a, b] = xy(to),
            dx = Math.abs(x - a),
            dy = Math.abs(y - b)
          if (Math.max(dx, dy) === 2 && [0, 2].includes(dx) && [0, 2].includes(dy)) {
            const mid = s.b[at((x + a) / 2, (y + b) / 2,boardSize(s))]
            consider(
              { from, to, power },
              price(s.b[to]) * 1.4 + (mid?.c === other(c) ? price(mid) * 1.6 : 0),
            )
          }
        }
        if (!movement(s.b, from, to,boardSize(s))) continue
        const [x, y] = xy(to),
          b = { ...s.b, [to]: p }
        delete b[from]
        let score = price(s.b[to]) * 1.5 + (7 - Math.abs(x - 3.5) - Math.abs(y - 3.5)) * 0.12
        if (enemy.some((sq) => sq !== to && movement(b, sq, to,boardSize(s)))) score -= price(p) * 0.68
        if (p.t === 'p' && rank === (c === 'w' ? boardSize(s) : 1)) score += 8
        consider(
          { from, to, promotion: p.t === 'p' && rank === (c === 'w' ? boardSize(s) : 1) ? 'q' : undefined },
          score,
        )
      }
  }
  if (best) return best
  if (!own.length) return null
  const to = allSquares(s)
    .find((sq) => s.b[sq]?.c !== c)
  return to ? { from: own[0], to } : null
}
export const clone = copy
