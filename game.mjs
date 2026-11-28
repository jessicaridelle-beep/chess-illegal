import { Chess, validateFen } from './vendor/chess.mjs'
import { names, pieceAbilities, originals } from './ui.mjs?v=reality-4'
export const files = 'abcdefgh'
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1]
export const other = (c) => (c === 'w' ? 'b' : 'w')
export const colorName = (c) => (c === 'w' ? 'White' : 'Black')
const alphabet = 'abcdefghijklmnop'
export const boardSize = s => [8,12,16].includes(s?.size) ? s.size : 8
export const boardFiles = s => alphabet.slice(0,boardSize(s))
export const boardRanks = s => Array.from({length:boardSize(s)},(_,i)=>boardSize(s)-i)
export const isDestroyed = (s,sq) => (s.destroyed||[]).includes(sq)
export const allSquares = s => [...boardFiles(s)].flatMap(f=>boardRanks(s).map(r=>f+r)).filter(sq=>!isDestroyed(s,sq))
export const isDivine = p => !!p && (p.t==='godking'||p.divine===true)
export const isRoyal = p => !!p && (p.t==='k'||p.t==='godking'||p.royal===true)
const standardTypes=['p','n','b','r','q','k']
const traits = p => !p?[]:p.t==='overlord'?standardTypes:p.t==='godking'?['k']:p.t==='devourer'?['k',...(p.traits||[])]:p.t==='fusion'?(p.traits||['k']):standardTypes.includes(p.t)?[p.t]:['k']
export function mergePieces(s,from,to,catalog=originals){
  const p=s.b[from],q=s.b[to];if(!p||!q||from===to||p.c!==s.side||q.c!==s.side||isDestroyed(s,to))return false
  removeRights(s,from,p);removeRights(s,to,q);delete s.b[from];s.b[to]={c:p.c,t:'fusion',traits:[...new Set([...traits(p),...traits(q)])],royal:isRoyal(p)||isRoyal(q),divine:isDivine(p)||isDivine(q),immortal:!!(p.immortal||q.immortal||isDivine(p)||isDivine(q)),extraPowers:[...new Set([...pieceAbilities(p,catalog),...pieceAbilities(q,catalog)].filter(k=>!['divine','supremacy','absorption','fusion'].includes(k)))],absorbs:p.t==='devourer'||q.t==='devourer'||!!p.absorbs||!!q.absorbs};s.ep='-';s.last=[from,to];return true
}
export function destroySquare(s,sq){if(!allSquares(s).includes(sq)||isDivine(s.b[sq]))return false;edit(s,sq,null);s.destroyed=[...(s.destroyed||[]),sq];s.last=[sq];return true}
export function toggleCheckmateImmunity(s){s.checkmateImmunity=!s.checkmateImmunity;s.last=[];return s.checkmateImmunity}
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
  for(const sq of affected) if(s.b[sq]&&!isDivine(s.b[sq])) edit(s,sq,null)
  // Multiple incoming pieces choose the same cell: the first in coordinate order remains;
  // other pieces stay in their original square.
  for(const [sq,p] of ring.sort(([a],[b])=>a.localeCompare(b))) {
    const [a,b]=xy(sq), dest=at(a+Math.sign(x-a),b+Math.sign(y-b),size)
    if(!dest || s.b[dest] || isDestroyed(s,dest)||isDivine(p)) continue
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
  return { b, size:8, doubleTurn:0, frozenTurns:0, realityLock:false, side: 'w', view: 'w', rights: 'KQkq', ep: '-', last: [], logs: [], pending: false }
}
export function fen(s, turn) {
  if (boardSize(s)!==8 || (s.destroyed||[]).length || Object.values(s.b).some(p=>p.immortal)) return null
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
  if(isDestroyed(s,sq)||isDivine(s.b[sq]))return false
  removeRights(s, sq, s.b[sq])
  s.ep = '-'
  if (p) s.b[sq] = p
  else delete s.b[sq]
  s.last = [sq]
  return true
}
// Conversion retains the piece type, including custom pieces, but changes its army.
export function convertPiece(s, sq, color = s.side) {
  const piece = s.b[sq]
  if (!piece || isDivine(piece) || !['w','b'].includes(color) || piece.c === color) return false
  edit(s, sq, { ...piece, c: color })
  return true
}
export function move(s, from, to, promotion) {
  const p = s.b[from]
  if (!p || from === to || isDestroyed(s,to)||isDivine(s.b[to])) return false
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
  s.b[to] = { ...p, t: promotion || p.t }
  if(victim&&p.c===s.side&&(p.t==='devourer'||p.absorbs))s.b[to].traits=[...new Set([...(p.traits||[]),...traits(victim)])]
  s.last = [from, to]
  return true
}
// Human-only, unlimited reality powers; no cooldowns or king exclusions.
export function clonePiece(s,from,to){
  if(!s.b[from]||from===to||!allSquares(s).includes(to)||isDivine(s.b[to]))return false
  edit(s,to,{...s.b[from]});s.last=[from,to];return true
}
export function toggleImmortality(s,sq){
  if(!s.b[sq]||isDivine(s.b[sq]))return false
  s.b[sq]={...s.b[sq],immortal:!s.b[sq].immortal};s.last=[sq];return true
}
export function freezeBot(s,turns=3){
  s.frozenTurns=(s.frozenTurns||0)+turns;s.last=[];return s.frozenTurns
}
export function toggleRealityLock(s){
  s.realityLock=!s.realityLock;s.last=[];return s.realityLock
}
export function consumeBotFreeze(s){
  if(!(s.frozenTurns>0))return false
  s.frozenTurns--;return true
}
export function neighbors(sq, size=8) {
  const [x, y] = xy(sq)
  return [-1, 0, 1]
    .flatMap((a) => [-1, 0, 1].filter((b) => a || b).map((b) => at(x + a, y + b,size)))
    .filter(Boolean)
}
export function usePower(s,from,to,kind,catalog=originals){
  const p=s.b[from]
  if(!p||p.c!==s.side||!pieceAbilities(p,catalog).includes(kind))return false
  const targets=powerTargets(s,from,kind)
  if(['radiance','nova','shockwave'].includes(kind)){
    if(!targets.length)return false
    for(const sq of targets){
      if(kind==='radiance'){removeRights(s,sq,s.b[sq]);s.b[sq]={...s.b[sq],c:p.c}}
      else edit(s,sq,null)
    }
    s.last=[from,...targets]
  }else{
    if(!targets.includes(to))return false
    if(kind==='exchange'){
      const q=s.b[to];removeRights(s,to,q);removeRights(s,from,p);s.b[from]=q;s.b[to]=p
    }else if(kind==='leap'){
      const [x,y]=xy(from),[a,b]=xy(to),mid=at((x+a)/2,(y+b)/2,boardSize(s))
      if(s.b[mid]&&s.b[mid].c!==p.c&&!isDivine(s.b[mid])){removeRights(s,mid,s.b[mid]);s.b[mid]={...s.b[mid],c:p.c}}
      move(s,from,to);s.last=[from,mid,to];s.ep='-';return true
    }else if(kind==='echo')edit(s,to,{c:p.c,t:'p'})
    else if(['beam','diagonal','comet'].includes(kind))edit(s,to,null)
    else if(['decree','blessing'].includes(kind))s.b[to]={...s.b[to],immortal:true}
    else if(kind==='dominion'){removeRights(s,to,s.b[to]);s.b[to]={...s.b[to],c:p.c}}
    else if(kind==='consume'){
      const victim=s.b[to],inherited=[...new Set([...traits(p),...traits(victim)])]
      move(s,from,to);s.b[to]={...s.b[to],traits:inherited,absorbs:true};s.last=[from,to];s.ep='-';return true
    }else if(kind==='phase'){move(s,from,to);s.ep='-';return true}
    else if(['replicate','mirror'].includes(kind))edit(s,to,copy(p))
    else return false
    s.last=[from,to]
  }
  s.ep='-';return true
}
const values = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 14 }
const price = (p) => (p ? values[p.t] || 6 : 0)
export function movement(b, from, to, size=8, blocked=[], special=true) {
  const p = b[from],
    [x, y] = xy(from),
    [tx, ty] = xy(to),
    dx = tx - x,
    dy = ty - y,
    ax = Math.abs(dx),
    ay = Math.abs(dy)
  if (!p || from === to || b[to]?.c === p.c || isDivine(b[to]) || blocked.includes(to)|| !at(tx,ty,size)) return false
  if (['godking','overlord','devourer','fusion'].includes(p.t)) {
    const types=special?traits(p):p.t==='godking'?['k']:['k'];
    return types.some(t=>movement({...b,[from]:{c:p.c,t}},from,to,size,blocked,false))
  }
  if(special&&p.absorbs&&p.traits?.length&&p.traits.some(t=>movement({...b,[from]:{c:p.c,t}},from,to,size,blocked,false)))return true
  if (!names[p.t]) return Math.max(ax, ay) < 3
  if (p.t === 'k') return Math.max(ax, ay) === 1
  if (p.t === 'n') return ax * ay === 2
  if (p.t === 'p') {
    const d = p.c === 'w' ? 1 : -1
    if (ax === 1) return dy === d && !!b[to]
    if (ax || b[to]) return false
    return dy === d || (dy === 2 * d && y === (d > 0 ? 1 : size-2) && !b[at(x, y + d,size)]&&!blocked.includes(at(x,y+d,size)))
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
  for (let i = 1; i < Math.max(ax, ay); i++) if (b[at(x + sx * i, y + sy * i,size)]||blocked.includes(at(x+sx*i,y+sy*i,size))) return false
  return true
}
export function powerTargets(s,from,kind){
  const p=s.b[from];if(!p)return []
  const size=boardSize(s),squares=allSquares(s),adj=neighbors(from,size).filter(sq=>!isDestroyed(s,sq))
  const enemy=sq=>s.b[sq]&&s.b[sq].c!==p.c&&!isDivine(s.b[sq]),empty=sq=>!s.b[sq],ally=sq=>s.b[sq]?.c===p.c&&sq!==from&&!s.b[sq].immortal&&!isDivine(s.b[sq])
  const [x,y]=xy(from),dist=sq=>{const [a,b]=xy(sq);return Math.max(Math.abs(a-x),Math.abs(b-y))}
  if(['nova','radiance','consume'].includes(kind))return adj.filter(enemy)
  if(kind==='shockwave')return squares.filter(sq=>dist(sq)<=2&&enemy(sq))
  if(kind==='dominion')return squares.filter(sq=>enemy(sq)&&!isRoyal(s.b[sq]))
  if(kind==='decree')return squares.filter(ally)
  if(kind==='blessing')return adj.filter(ally)
  if(kind==='phase')return squares.filter(empty)
  if(['replicate','mirror'].includes(kind))return adj.filter(empty)
  if(kind==='echo')return adj.filter(sq=>empty(sq)&&!['1',String(size)].includes(sq.slice(1)))
  if(kind==='exchange')return squares.filter(sq=>sq!==from&&s.b[sq]&&!isDivine(s.b[sq]))
  if(kind==='leap')return squares.filter(sq=>{const [a,b]=xy(sq),dx=Math.abs(a-x),dy=Math.abs(b-y);return Math.max(dx,dy)===2&&[0,2].includes(dx)&&[0,2].includes(dy)&&!isDivine(s.b[sq])})
  if(kind==='comet')return squares.filter(sq=>{const [a,b]=xy(sq);return Math.abs(a-x)*Math.abs(b-y)===2&&enemy(sq)})
  if(kind==='beam'||kind==='diagonal'){
    const out=[],dirs=kind==='beam'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[-1,-1],[1,-1],[-1,1]]
    for(const [dx,dy] of dirs)for(let i=1;i<=4;i++){
      const to=at(x+dx*i,y+dy*i,size);if(!to||isDestroyed(s,to))break
      if(!s.b[to])continue
      if(enemy(to))out.push(to);break
    }return out
  }
  return []
}
// In a nonstandard position this reports geometric attacks, not forced checkmate.
export function threatenedKings(s, catalog = []) {
  const checked = []
  for (const [sq,p] of Object.entries(s.b)) {
    if (!isRoyal(p) || isDivine(p) || (p.immortal && p.c===s.side)) continue
    const attacked = Object.entries(s.b).some(([from,q]) => {
      if (q.c === p.c) return false
      const skills=q.c===s.side?pieceAbilities(q,catalog):[]
      if(movement(s.b,from,sq,boardSize(s),s.destroyed||[],q.c===s.side))return true
      for(const power of skills){
        if(['nova','radiance','beam','diagonal','comet','shockwave','consume'].includes(power)&&powerTargets(s,from,power).includes(sq))return true
        if(power==='leap'){
          const [x,y]=xy(from),[a,b]=xy(sq),dx=a-x,dy=b-y
          if(powerTargets(s,from,'leap').includes(sq)||Math.max(Math.abs(dx),Math.abs(dy))===1&&powerTargets(s,from,'leap').includes(at(x+2*dx,y+2*dy,boardSize(s))))return true
        }
      }
      return false
    })
    if (attacked) checked.push(sq)
  }
  return checked
}

// These are suggested destinations. Freeform moves are still accepted on every other square.
export function destinations(state, from, power) {
  const piece = state.b[from]
  if (!piece) return []
  if(power)return powerTargets(state,from,power)
  const chess = orthodox(state, piece.c)
  if (chess)
    return [...new Set(chess.moves({ square: from, verbose: true }).map((move) => move.to))]
  return allSquares(state).filter((to) => movement(state.b, from, to,boardSize(state),state.destroyed||[],piece.c===state.side))
}

export function matchOutcome(before, after, nextSide) {
  const hasKing = (board, color) =>
    Object.values(board).some((piece) => isRoyal(piece) && piece.c === color)
  if (['w','b'].every(c=>hasKing(before.b,c)&&!hasKing(after.b,c))) return {winner:null,reason:'Both kings lost'}
  for (const color of ['w', 'b']) {
    if (hasKing(before.b, color) && !hasKing(after.b, color)) {
      return { winner: other(color), reason: 'Last king taken' }
    }
  }
  if(nextSide===after.side && (after.frozenTurns>0||after.realityLock))return null
  const chess = orthodox(after, nextSide)
  if (chess?.isCheckmate() && !(after.checkmateImmunity&&nextSide===after.side)) return { winner: other(nextSide), reason: 'Checkmate' }
  // A player can move the opposite army and even checkmate their own king.
  if (!chess && !(after.checkmateImmunity&&other(nextSide)===after.side) && orthodox(after, other(nextSide))?.isCheckmate())
    return { winner: nextSide, reason: 'Checkmate' }
  if (chess?.isStalemate()) return { winner: null, reason: 'Stalemate' }
  return null
}
// Shared power rules are used for both simulation and execution, including custom creations.
export function applyBotAction(s,a,color=other(s.side)) {
  if(!a||a.power||a.double||!s.b[a.from]||s.b[a.from].c!==color||!a.to||(s.b[a.to]?.immortal||isDivine(s.b[a.to])))return false
  return move(s,a.from,a.to,a.promotion)===true
}
// The same hard legality filter is applied before ranking AND before execution.
// Sandbox players retain free moves; bots may not leave any of their kings in check.
export function botKingSafe(before,after,color,catalog=[]){
  const count=s=>Object.values(s.b).filter(p=>p.c===color&&isRoyal(p)).length
  if(count(after)<count(before))return false
  return !threatenedKings(after,catalog).some(sq=>after.b[sq]?.c===color)
}
export function legalBotTrial(s,a,c=other(s.side),catalog=[],standard=orthodox(s,c)){
  if(!a||a.power||a.double||(s.b[a.to]?.immortal||isDivine(s.b[a.to])))return null
  if(!a.power){
    if(s.b[a.from]?.c!==c||!allSquares(s).includes(a.to)||a.from===a.to)return null
    if(standard){
      const legal=standard.moves({square:a.from,verbose:true}).some(m=>m.to===a.to&&(!m.promotion||m.promotion===a.promotion))
      if(!legal)return null
    }else if(!movement(s.b,a.from,a.to,boardSize(s),s.destroyed||[],false))return null
  }
  const trial={...s,b:{...s.b},last:[]}
  if(!applyBotAction(trial,a,c)||!botKingSafe(s,trial,c,catalog))return null
  return trial
}
export function sandboxNoMove(s,catalog,color=other(s.side)){
  const kings=Object.entries(s.b).filter(([,p])=>p.c===color&&isRoyal(p))
  if(!kings.length||color===s.side&&s.checkmateImmunity)return null
  return threatenedKings(s,catalog).some(sq=>s.b[sq].c===color)
    ?{winner:other(color),reason:'Sandbox checkmate'}
    :{winner:null,reason:'Sandbox stalemate'}
}
const botValues={p:1,n:3,b:3.2,r:5,q:9,k:1000}
const strategicValue=(p,catalog)=>p?(botValues[p.t]??({radiance:8,nova:8,beam:7,exchange:6,leap:6,echo:5}[catalog.find(x=>x.id===p.t)?.power]||6)):0
function botPosition(s,c,catalog,profile){
  const n=boardSize(s), center=(n-1)/2, entries=Object.entries(s.b), kings=threatenedKings(s,catalog)
  let score=0
  for(const [sq,p] of entries){
    const sign=p.c===c?1:-1,[x,y]=xy(sq),v=strategicValue(p,catalog)
    score+=sign*(v+(p.t==='k'?0:.06*(n-Math.abs(x-center)-Math.abs(y-center)))+(p.t==='p'?.055*(p.c==='w'?y:n-1-y):0))
    if(p.t==='k'&&kings.includes(sq))score-=sign*(profile==='guardian'?18:11)
  }
  return score
}
function botCandidates(s,c,catalog){
  const out=[],size=boardSize(s), squares=allSquares(s), standard=orthodox(s,c)
  if(standard)for(const m of standard.moves({verbose:true}))out.push({from:m.from,to:m.to,promotion:m.promotion})
  for(const [from,p] of Object.entries(s.b)){
    if(p.c!==c)continue
    for(const to of squares){
      if(standard||!movement(s.b,from,to,size,s.destroyed||[],false))continue
      out.push({from,to,promotion:p.t==='p'&&Number(to.slice(1))===(c==='w'?size:1)?'q':undefined})
    }
  }
  return out
}
export function sandboxReply(s,catalog,level,profile='adaptive',options={}){
  const c=other(s.side),opponent=other(c),size=boardSize(s),own=Object.entries(s.b).filter(([,p])=>p.c===c),enemy=Object.entries(s.b).filter(([,p])=>p.c===opponent)
  if(!own.length)return null
  const actions=botCandidates(s,c,catalog)
  const base=botPosition(s,c,catalog,profile)
  const ranked=[], standard=orthodox(s,c)
  // Evaluate the actual resulting board instead of inventing a score for each power.
  for(const a of actions){
    const trial=legalBotTrial(s,a,c,catalog,standard)
    if(!trial)continue
    let score=botPosition(trial,c,catalog,profile)-base
    const noise=({beginner:12,easy:5,medium:1.6,hard:.35,master:.08,relaxed:5,balanced:1.6,sharp:.08})[level]??1.6
    ranked.push({a,trial,score:score+Math.random()*noise})
  }
  ranked.sort((a,b)=>b.score-a.score)
  if(!ranked.length)return null
  // Limited one-ply reply search on the strongest candidates. This includes every
  // registered custom ability, and is bounded on larger boards.
  const depth=({beginner:1,easy:2,medium:4,hard:7,master:12,relaxed:2,balanced:4,sharp:12})[level]??4
  for(const item of ranked.slice(0,depth)){
    const {trial}=item
    let danger=0
    for(const [from,p] of Object.entries(trial.b)){
      if(p.c!==c)continue
      const attacked=Object.entries(trial.b).some(([sq,q])=>q.c===opponent&&(movement(trial.b,sq,from,boardSize(trial),trial.destroyed||[],q.c===trial.side)||powerTargets(trial,sq,catalog.find(x=>x.id===q.t)?.power).includes(from)&&['nova','radiance','beam'].includes(catalog.find(x=>x.id===q.t)?.power)))
      if(attacked)danger=Math.max(danger,strategicValue(p,catalog))
    }
    item.final=item.score-danger*(profile==='guardian'?.95:['beginner','easy','relaxed'].includes(level)?.2:level==='master'?.9:.65)
  }
  const best=ranked.slice(0,depth).sort((a,b)=>b.final-a.final)[0]
  return best.a
}
export const clone = copy

// AI GOD is the sole opponent allowed these bounded sandbox actions.
export function godTrial(s,a,c=other(s.side),catalog=[]){
  if(!a?.power)return legalBotTrial(s,a,c,catalog)
  if(s.realityLock||s.godCooldown>0||a.double)return null
  const t={...s,b:{...s.b},last:[]}, size=boardSize(s)
  if(a.power==='spawn'){
    if((s.godSpawns||0)>=2||a.type!=='p'||!allSquares(s).includes(a.to)||s.b[a.to])return null
    const rank=Number(a.to.slice(1))
    if(rank!==(c==='w'?2:size-1))return null
    edit(t,a.to,{c,t:'p'});t.godSpawns=(s.godSpawns||0)+1
  }else if(a.power==='sidestep'){
    const p=s.b[a.from]
    if(!p||p.c!==c||p.t==='k'||s.b[a.to]||!allSquares(s).includes(a.to)||!neighbors(a.from,size).includes(a.to)||movement(s.b,a.from,a.to,size,s.destroyed||[],false))return null
    if(p.t==='p'&&[1,size].includes(Number(a.to.slice(1))))return null
    move(t,a.from,a.to)
  }else if(a.power==='flip'){
    if(s.godFlipped||threatenedKings(s,catalog).length)return null
    const kings=['w','b'].every(k=>Object.values(s.b).some(p=>p.c===k&&p.t==='k'))
    if(!kings)return null
    const diff=Object.values(s.b).reduce((n,p)=>n+(p.c===c?1:-1)*(p.t==='k'?0:strategicValue(p,catalog)),0)
    if(diff> -4)return null
    t.side=c;t.view=c;t.ep='-';t.godFlipped=true;t.last=Object.keys(t.b)
    if(threatenedKings(t,catalog).length)return null
    t.godCooldown=4;return t
  }else return null
  if(!botKingSafe(s,t,c,catalog))return null
  // No power can directly check the opponent or remove any piece.
  if(threatenedKings(t,catalog).some(sq=>t.b[sq].c!==c))return null
  t.godCooldown=4
  return t
}
export function godPower(s,catalog=[]){
  if(s.realityLock||s.godCooldown>0)return null
  const c=other(s.side),size=boardSize(s),base=botPosition(s,c,catalog,'guardian')
  const flip={power:'flip'}
  if(godTrial(s,flip,c,catalog))return flip
  const options=[]
  if((s.godSpawns||0)<2&&base< -1.5){
    for(const f of boardFiles(s))options.push({power:'spawn',type:'p',to:f+(c==='w'?2:size-1)})
  }
  for(const [from,p] of Object.entries(s.b)){
    if(p.c!==c||p.t==='k')continue
    for(const to of neighbors(from,size))if(!s.b[to])options.push({power:'sidestep',from,to})
  }
  let best=null,score=0
  for(const a of options){
    const t=godTrial(s,a,c,catalog)
    if(!t)continue
    const next=botPosition(t,c,catalog,'guardian')-base
    const exposed=Object.entries(t.b).some(([sq,p])=>p.c!==c&&movement(t.b,sq,a.to,size,t.destroyed||[],p.c===t.side))
    const previouslyExposed=a.power==='sidestep'&&Object.entries(s.b).some(([sq,p])=>p.c!==c&&movement(s.b,sq,a.from,size,s.destroyed||[],p.c===s.side))
    const canRetreat=a.power==='sidestep'&&neighbors(a.from,size).some(to=>!s.b[to]&&movement(s.b,a.from,to,size,s.destroyed||[],false)&&!Object.entries(s.b).some(([sq,p])=>p.c!==c&&movement({...s.b,[to]:s.b[a.from]},sq,to,size,s.destroyed||[],p.c===s.side)))
    const escapeBonus=previouslyExposed&&!exposed&&!canRetreat?Math.min(3,strategicValue(s.b[a.from],catalog)*.6):0
    const v=next+escapeBonus-(exposed?strategicValue(t.b[a.to],catalog):0)
    const threshold=a.power==='spawn'?.5:1.6
    if(v>threshold&&v>score){best=a;score=v}
  }
  return best
}
