import { Chess, validateFen } from './vendor/chess.mjs'
import { names, pieceAbilities, originals } from './ui.mjs?v=boss-11'
export const files = 'abcdefgh'
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1]
export const other = (c) => (c === 'w' ? 'b' : 'w')
export const colorName = (c) => (c === 'w' ? 'White' : 'Black')
const alphabet = 'abcdefghijklmnop'
export const boardSize = s => [8,12,16].includes(s?.size) ? s.size : 8
export const boardFiles = s => alphabet.slice(0,boardSize(s))
export const boardRanks = s => Array.from({length:boardSize(s)},(_,i)=>boardSize(s)-i)
export const REALITY_FLIP_COOLDOWN=10000
export const realityFlipRemaining=(s,now=Date.now())=>Math.max(0,(s.realityFlipUntil||0)-now)
export const canBossFlip=(s,now=Date.now())=>!realityFlipRemaining(s,now)&&!s.realityFlipNeedsAction
// A flip starts a new timeline. Bot rewinds may not cross a flip or a match boundary.
export function beginRealityTimeline(s){
  s.realityTimeline=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2)
  return s
}
export function canBossRewind(s,prev){
  return !!(s.realityTimeline&&prev?.b&&prev.realityTimeline===s.realityTimeline)
}
export function flipCurrentBoard(s){
  // Never read a saved position here: keep only the pieces and squares present now.
  s.b=Object.fromEntries(Object.entries(s.b).filter(([sq])=>!isDestroyed(s,sq)).map(([sq,p])=>[sq,{...p,c:other(p.c)}]))
  s.rights='';s.ep='-';s.last=Object.keys(s.b)
  return s
}
export function markRealityAction(s,kind,now=Date.now()){
  if(kind==='flip'){beginRealityTimeline(s);s.realityFlipUntil=now+REALITY_FLIP_COOLDOWN;s.realityFlipNeedsAction=true}
  else s.realityFlipNeedsAction=false
  return s
}
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
  return beginRealityTimeline({ b, size:8, doubleTurn:0, frozenTurns:0, realityLock:false, side: 'w', view: 'w', rights: 'KQkq', ep: '-', last: [], logs: [], pending: false })
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
      const skills=!s.duelMode&&q.c===s.side?pieceAbilities(q,catalog):[]
      if(movement(s.b,from,sq,boardSize(s),s.destroyed||[],!s.duelMode&&q.c===s.side))return true
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
  return allSquares(state).filter((to) => movement(state.b, from, to,boardSize(state),state.destroyed||[],true))
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
    const noise=({max:.02,beginner:12,easy:5,medium:1.6,hard:.35,master:.08,relaxed:5,balanced:1.6,sharp:.08})[level]??1.6
    ranked.push({a,trial,score:score+Math.random()*noise})
  }
  ranked.sort((a,b)=>b.score-a.score)
  if(!ranked.length)return null
  // Limited one-ply reply search on the strongest candidates. This includes every
  // registered custom ability, and is bounded on larger boards.
  const depth=({max:16,beginner:1,easy:2,medium:4,hard:7,master:12,relaxed:2,balanced:4,sharp:12})[level]??4
  for(const item of ranked.slice(0,depth)){
    const {trial}=item
    let danger=0
    for(const [from,p] of Object.entries(trial.b)){
      if(p.c!==c)continue
      const attacked=Object.entries(trial.b).some(([sq,q])=>q.c===opponent&&(movement(trial.b,sq,from,boardSize(trial),trial.destroyed||[],!trial.duelMode&&q.c===trial.side)||powerTargets(trial,sq,catalog.find(x=>x.id===q.t)?.power).includes(from)&&['nova','radiance','beam'].includes(catalog.find(x=>x.id===q.t)?.power)))
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
    if(s.godFlipped||!canBossFlip(s)||threatenedKings(s,catalog).length)return null
    const kings=['w','b'].every(k=>Object.values(s.b).some(p=>p.c===k&&p.t==='k'))
    if(!kings)return null
    const diff=Object.values(s.b).reduce((n,p)=>n+(p.c===c?1:-1)*(p.t==='k'?0:strategicValue(p,catalog)),0)
    if(diff> -4)return null
    t.side=c;t.view=c;t.ep='-';t.godFlipped=true;t.last=Object.keys(t.b)
    if(threatenedKings(t,catalog).length)return null
    t.godCooldown=4;markRealityAction(t,'flip');return t
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

/* Unrestricted boss engine. The normal-bot legality path remains separate. */
export const BOSS_GRACE=7
export const isBoss=id=>id==='owner'||id==='illegal'||id==='evolution'
export const bossInfo=(s,c)=>s.bossState?.[c]||{turns:0,freeze:0,lock:0,immune:false,used:{}}
// Shared and per-boss anti-spam streaks count only completed actions.
export const bossActionKind=a=>a?.power||(a?.normal?'legal':'move')
export const bossRepeatLimit=kind=>kind==='legal'?Infinity:['move','delete','spawn'].includes(kind)?3:1
// Related abilities share a budget; e.g. cloning and summoning cannot evade the spawn cap.
export const bossFamily=kind=>({
  clone:'spawn',mirror:'spawn',replicate:'spawn',echo:'spawn',
  nova:'delete',shockwave:'delete',beam:'delete',diagonal:'delete',comet:'delete',hole:'delete',destroy:'delete',consume:'delete',
  radiance:'convert',dominion:'convert',
  phase:'move',leap:'move',exchange:'move',control:'move',sidestep:'move',
  decree:'immortal',blessing:'immortal',
  freeze:'turn',double:'turn'
})[kind]||kind
export const bossFamilyLimit=kind=>bossRepeatLimit(bossFamily(kind))
const trailing=(items,key,map=x=>x)=>{let n=0;for(let i=items.length-1;i>=0&&map(items[i])===key;i--)n++;return n}
export const BLACK_HOLE_COOLDOWN=20000
export const BLACK_HOLE_ACTION_GAP=8
export const isBossPieceMove=kind=>kind==='move'||kind==='legal'
export const blackHoleRemaining=(s,now=Date.now())=>Math.max(0,(s.bossHoleUntil||0)-now)
export function blackHoleActionGap(s){
  const i=(s.bossRecentActions||[]).lastIndexOf('hole')
  return i<0?0:Math.max(0,BLACK_HOLE_ACTION_GAP-((s.bossRecentActions||[]).length-1-i))
}
export function bossNeedsMove(s,c){
  const all=s.bossRecentActions||[],mine=bossInfo(s,c).recent||[]
  const tooMany=items=>items.slice(-4).filter(k=>!isBossPieceMove(k)).length>=3
  return tooMany(all)||tooMany(mine)
}
export function canBossRepeat(s,c,kind){
  if(kind==='legal')return true
  if(!isBossPieceMove(kind)&&bossNeedsMove(s,c))return false
  if(kind==='hole'&&(blackHoleRemaining(s)>0||blackHoleActionGap(s)>0))return false
  const m=bossInfo(s,c),shared=s.bossActionStreak,limit=bossRepeatLimit(kind)
  const own=m.last===kind?(m.streak||1):0,global=shared?.kind===kind?(shared.count||1):0
  if(own>=limit||global>=limit)return false
  const family=bossFamily(kind),fLimit=bossFamilyLimit(kind)
  const all=s.bossRecentActions||[],mine=m.recent||[]
  if(trailing(all,family,bossFamily)>=fLimit||trailing(mine,family,bossFamily)>=fLimit)return false
  // Once-only powers cannot be alternated A/B/A; require two intervening actions by the same boss.
  if(limit===1&&(mine.slice(-2).includes(kind)||all.slice(-2).includes(kind)))return false
  // Cap bursts of related powers within the last four actions, even with one unrelated action between them.
  if(family!=='legal'&&fLimit===3&&(all.slice(-4).filter(k=>bossFamily(k)===family).length>=3||mine.slice(-4).filter(k=>bossFamily(k)===family).length>=3))return false
  if(fLimit===1&&(all.slice(-2).some(k=>bossFamily(k)===family)||mine.slice(-2).some(k=>bossFamily(k)===family)))return false
  return true
}
export function markBossStreak(s,kind){
  const prev=s.bossActionStreak
  s.bossRecentActions=[...(s.bossRecentActions||[]),kind].slice(-16)
  if(kind==='hole')s.bossHoleUntil=Date.now()+BLACK_HOLE_COOLDOWN
  s.bossActionStreak=kind==='legal'?null:{kind,count:prev?.kind===kind?(prev.count||1)+1:1}
}
export const bossHasRoyal=(s,c)=>Object.values(s.b).some(p=>p.c===c&&isRoyal(p))
function bossMeta(s,c,changes){s.bossState={...s.bossState,[c]:{...bossInfo(s,c),...changes}}}
export function bossConsumeFreeze(s,c){const m=bossInfo(s,c);if(!m.freeze)return false;bossMeta(s,c,{freeze:m.freeze-1});return true}
export function bossConsumeLock(s,c){const m=bossInfo(s,c);if(m.lock)bossMeta(s,c,{lock:m.lock-1})}
// Bosses may finish only by movement-based checkmate. Active powers never count as legal moves.
function bossMovementChecks(s,color){
  const entries=Object.entries(s.b),opponents=entries.filter(([,p])=>p.c!==color)
  return entries.filter(([sq,p])=>p.c===color&&isRoyal(p)&&!isDivine(p)&&!p.immortal&&opponents.some(([from])=>movement(s.b,from,sq,boardSize(s),s.destroyed||[],true))).map(([sq])=>sq)
}
function bossLegalCandidates(s,c){
  const ch=orthodox(s,c)
  if(ch)return ch.moves({verbose:true}).map(m=>({from:m.from,to:m.to,promotion:m.promotion,normal:true}))
  const out=[],size=boardSize(s),squares=allSquares(s)
  for(const [from,p] of Object.entries(s.b))if(p.c===c)for(const to of squares){
    if(!movement(s.b,from,to,size,s.destroyed||[],true)||isRoyal(s.b[to])||s.b[to]?.immortal)continue
    if(p.t==='p'&&Number(to.slice(1))===(c==='w'?size:1))for(const promotion of ['q','r','b','n'])out.push({from,to,promotion,normal:true})
    else out.push({from,to,normal:true})
  }
  return out
}
export function bossLegalMove(s,a,c){
  if(!a||a.power||a.double||s.b[a.from]?.c!==c||isRoyal(s.b[a.to])||s.b[a.to]?.immortal||isDivine(s.b[a.to]))return null
  const p=s.b[a.from],ch=orthodox(s,c)
  if(ch){
    if(!ch.moves({square:a.from,verbose:true}).some(m=>m.to===a.to&&m.promotion===a.promotion))return null
  }else{
    if(!movement(s.b,a.from,a.to,boardSize(s),s.destroyed||[],true))return null
    const promotes=p.t==='p'&&Number(a.to.slice(1))===(c==='w'?boardSize(s):1)
    if(promotes?!['q','r','b','n'].includes(a.promotion):!!a.promotion)return null
  }
  const trial={...s,b:{...s.b},side:c,last:[]}
  if(!move(trial,a.from,a.to,a.promotion)||bossMovementChecks(trial,c).length)return null
  trial.side=s.side
  return trial
}
export function bossMatePosition(s,c){
  const enemy=other(c),royals=Object.values(s.b).filter(p=>p.c===enemy&&isRoyal(p))
  if(!royals.length||royals.some(p=>isDivine(p)||p.immortal)||bossInfo(s,enemy).immune||(s.checkmateImmunity&&s.side===enemy))return false
  const checks=bossMovementChecks(s,enemy)
  if(!checks.length)return false
  const ch=orthodox(s,enemy)
  if(ch)return ch.isCheckmate()
  // With multiple royals, a surviving unchecked royal prevents a final checkmate.
  if(checks.length!==royals.length)return false
  for(const reply of bossLegalCandidates(s,enemy))if(bossLegalMove(s,reply,enemy))return false
  return true
}
function sameBossBoard(a,b){
  const keys=Object.keys(a.b)
  return keys.length===Object.keys(b.b).length&&keys.every(sq=>JSON.stringify(a.b[sq])===JSON.stringify(b.b[sq]))
}
export function bossOutcome(s,c,catalog=originals,action=null,before=null){
  if(!before||!action||!bossMatePosition(s,c))return null
  const legal=bossLegalMove(before,action,c)
  if(!legal||!sameBossBoard(legal,s))return null
  return {winner:c,reason:orthodox(s,other(c))?'Checkmate':'Sandbox checkmate'}
}
function bossMove(s,from,to,promotion){
  const p=s.b[from],victim=s.b[to]
  if(!p||from===to||!allSquares(s).includes(to)||isDivine(victim))return false
  removeRights(s,from,p);removeRights(s,to,victim)
  delete s.b[from];s.b[to]={...p,t:promotion||p.t}
  if(victim&&(p.t==='devourer'||p.absorbs))s.b[to].traits=[...new Set([...(p.traits||[]),...traits(victim)])]
  s.ep='-';s.last=[from,to];return true
}
// Boss-only restrictions: preserve ordinary sandbox powers, but never manufacture an unmateable royal.
const protectedRoyal=p=>isRoyal(p)&&(isDivine(p)||p.immortal)
const protectedCount=s=>Object.values(s.b).filter(protectedRoyal).length
const divineCount=s=>Object.values(s.b).filter(isDivine).length
export function bossPowerAllowed(s,a,c){
  if(!a)return false
  const k=bossActionKind(a),p=s.b[a.from],q=s.b[a.to]
  if(k==='immunity'||a.type==='godking'||a.promotion==='godking')return false
  if(['clone','replicate','mirror'].includes(k)&&(isDivine(p)||protectedRoyal(p)))return false
  if(['immortal','decree','blessing'].includes(k)&&isRoyal(q))return false
  if(k==='merge'&&(isRoyal(p)||isRoyal(q))&&(isDivine(p)||isDivine(q)||p?.immortal||q?.immortal))return false
  return true
}
export function clearBossImmunity(s,colors){
  for(const c of colors)if(s.bossState?.[c]?.immune)bossMeta(s,c,{immune:false})
  return s
}
export function bossTrial(s,a,c,id,catalog=originals,history=[]){
  if(!isBoss(id)||!bossPowerAllowed(s,a,c))return null
  const kind=bossActionKind(a)
  if(!canBossRepeat(s,c,kind))return null
  const enemy=other(c),m=bossInfo(s,c),n=copy(s),oldSide=s.side,p=s.b[a.from],q=s.b[a.to]
  n.side=c;n.duelMode=false
  clearBossImmunity(n,[c,...(isBoss(s.duel?.[enemy])?[enemy]:[])])
  if(m.lock&&a.power)return null
  if(kind==='legal'){const trial=bossLegalMove(n,a,c);if(!trial)return null;Object.assign(n,trial);n.side=c;n.duelMode=false}
  else if(kind==='move'){if(p?.c!==c)return null;const legal=bossLegalMove(n,a,c);if(legal){Object.assign(n,legal);n.side=c;n.duelMode=false}else if(!bossMove(n,a.from,a.to,a.promotion))return null}
  else if(kind==='control'){if(p?.c!==enemy||!bossMove(n,a.from,a.to,a.promotion))return null}
  else if(kind==='spawn'){if(!allSquares(n).includes(a.to)||q||!([...standardTypes,...catalog.map(x=>x.id)].includes(a.type)))return null;edit(n,a.to,{c,t:a.type,...(a.type==='godking'?{immortal:true}:{})})}
  else if(kind==='delete'){if(!q||q.c!==enemy||!edit(n,a.to,null))return null}
  else if(kind==='convert'){if(q?.c!==enemy||!convertPiece(n,a.to,c))return null}
  else if(kind==='clone'){if(p?.c!==c||q||!clonePiece(n,a.from,a.to))return null}
  else if(kind==='immortal'){if(q?.c!==c||q.immortal||!toggleImmortality(n,a.to))return null}
  else if(kind==='merge'){if(!mergePieces(n,a.from,a.to,catalog))return null}
  else if(kind==='destroy'){if(!destroySquare(n,a.to))return null}
  else if(kind==='hole'){if(!blackHole(n,a.to))return null}
  else if(kind==='expand'){if(!expandBoard(n,a.size))return null}
  else if(kind==='flip'){if(!canBossFlip(s))return null;flipCurrentBoard(n)}
  else if(kind==='rewind'){if(!Number.isInteger(a.steps)||a.steps<1||a.steps>5)return null;const prev=history.at(-a.steps);if(!canBossRewind(s,prev))return null;for(const k of ['b','size','rights','ep','destroyed'])n[k]=copy(prev[k]??(k==='destroyed'?[]:k==='size'?8:k==='ep'?'-':k==='rights'?'':{}));n.last=Object.keys(n.b)}
  else if(kind==='double'){if(m.extra||m.last==='double'||m.last==='freeze')return null;bossMeta(n,c,{extra:true});n.last=[]}
  else if(kind==='freeze'){if(m.extra||m.last==='double'||m.last==='freeze'||bossInfo(n,enemy).freeze)return null;bossMeta(n,enemy,{freeze:1});n.last=[]}
  else if(kind==='lock'){if(bossInfo(n,enemy).lock)return null;bossMeta(n,enemy,{lock:2});n.last=[]}
  else if(kind==='immunity')return null
  else if(kind==='transform'){if(q?.c!==c||isDivine(q)||!catalog.some(x=>x.id===a.type))return null;if(!edit(n,a.to,{c,t:a.type,...(a.type==='godking'?{immortal:true}:{})}))return null}
  else {if(!usePower(n,a.from,a.to,kind,catalog))return null}
  // Reject indirect creation through custom abilities, transformations, rewinds, or fusion.
  if(divineCount(n)>divineCount(s)||protectedCount(n)>protectedCount(s))return null
  // Never erase either side's last royal by capture, conversion, deletion, rewind or any power.
  if(!bossHasRoyal(n,c)||!bossHasRoyal(n,enemy))return null
  const turns=m.turns+1
  if(turns<BOSS_GRACE&&threatenedKings(n,catalog).some(sq=>n.b[sq].c===enemy))return null
  // A power or off-dot move may give check, but may not create the final checkmate.
  if(bossMatePosition(n,c)&&(turns<BOSS_GRACE||!bossOutcome(n,c,catalog,a,s)))return null
  bossMeta(n,c,{turns,extra:kind==='double',last:kind,streak:m.last===kind?(m.streak||1)+1:1,recent:[...(m.recent||[]),kind].slice(-16),used:{...m.used,[kind]:(m.used?.[kind]||0)+1},lock:Math.max(0,m.lock-1)})
  markBossStreak(n,kind)
  markRealityAction(n,kind)
  n.side=oldSide;n.duelMode=s.duelMode
  return n
}
// EVOLUTION: a bounded online opponent model. No fabricated Elo or pretrained learning claims.
const evolutionWeight=p=>!p?0:isRoyal(p)?26:isDivine(p)?30:({p:1,n:3,b:3.2,r:5,q:9,overlord:15,devourer:10,fusion:12}[p.t]||7)
const evolutionMaterial=(s,c)=>Object.values(s.b).reduce((sum,p)=>sum+(p.c===c?1:-1)*evolutionWeight(p),0)
const evolutionCategory=(a,legality)=>a.power||(legality==='illegal'?'move':'legal')
export function observeEvolution(s,actor,action,before,legality,opponent){
  if(opponent!=='evolution')return
  const learner=other(actor),old=s.evolution?.[learner]||{},kind=evolutionCategory(action,legality)
  const counts={...(old.counts||{})},heat={...(old.heat||{})},types={...(old.types||{})}
  counts[kind]=(counts[kind]||0)+1
  if(action.to){heat[action.to]=(heat[action.to]||0)+1}
  const t=before.b[action.from]?.t||action.type
  if(t)types[t]=(types[t]||0)+1
  const damage=Math.max(0,evolutionMaterial(before,learner)-evolutionMaterial(s,learner))
  const losses={...(old.losses||{})};losses[kind]=(losses[kind]||0)+Math.min(30,damage)
  s.evolution={...s.evolution,[learner]:{seen:(old.seen||0)+1,counts,heat,types,losses,recent:[...(old.recent||[]),kind].slice(-8)}}
}
export function evolutionInfo(s,c){
  const m=s.evolution?.[c]||{},turns=bossInfo(s,c).turns||0
  const stage=turns<2?0:turns<4?1:turns<6?2:3
  const counts=m.counts||{},losses=m.losses||{},seen=m.seen||0
  const ranked=Object.keys(counts).filter(k=>k!=='legal').sort((x,y)=>(counts[y]+(losses[y]||0)/5)-(counts[x]+(losses[x]||0)/5))
  return {stage,level:['Seed','Learning','Adaptive','Apex'][stage],seen,counts,losses,heat:m.heat||{},types:m.types||{},recent:m.recent||[],focus:ranked[0]||'movement'}
}
function evolutionPermitted(info,a){
  if(info.stage===0)return !a.power&&!!a.normal
  if(info.stage===1)return !a.power||['spawn','delete','convert','lock','immortal','clone','transform','merge'].includes(a.power)
  return true
}
function evolutionExposure(s,c){
  const enemy=other(c),own=Object.entries(s.b).filter(([,p])=>p.c===c),foes=Object.entries(s.b).filter(([,p])=>p.c===enemy)
  const size=boardSize(s),blocked=s.destroyed||[]
  let largest=0,pressure=0,cluster=0
  for(const [sq,p] of own){
    if(isDivine(p)||p.immortal)continue
    const attacks=foes.filter(([from])=>movement(s.b,from,sq,size,blocked,true))
    if(attacks.length){
      if(isRoyal(p))pressure+=16
      else {
        const cheapest=Math.min(...attacks.map(([,q])=>evolutionWeight(q)))
        const defendBoard={...s.b,[sq]:{...p,c:enemy}}
        const defended=own.some(([from])=>from!==sq&&movement(defendBoard,from,sq,size,blocked,true))
        largest=Math.max(largest,defended?Math.max(0,evolutionWeight(p)-cheapest):evolutionWeight(p))
      }
    }
    const nearby=own.filter(([at])=>neighbors(sq,size).includes(at)).reduce((n,[,q])=>n+Math.min(8,evolutionWeight(q)),0)
    cluster=Math.max(cluster,nearby)
  }
  return {largest,pressure,cluster}
}
function evolutionScore(s,t,c,a,info){
  const k=bossActionKind(a),count=info.counts,loss=info.losses,seen=Math.max(1,info.seen)
  const frequency=(...keys)=>keys.reduce((n,key)=>n+(count[key]||0)+(loss[key]||0)/8,0)/seen
  const disruption=frequency('flip','rewind','double','freeze','lock')
  const conversion=frequency('convert','control','radiance','dominion')
  const area=frequency('hole','nova','shockwave','destroy')
  const attacks=frequency('move','delete','control','beam','comet','consume')
  const e=evolutionExposure(t,c)
  let score=-e.largest*(.8+attacks*.6)-e.pressure*(1+attacks)-e.cluster*Math.min(.7,area*.35)
  if(k==='lock')score+=Math.min(10,disruption*8+conversion*5+area*3)
  if(k==='rewind')score+=Math.max(0,evolutionMaterial(t,c)-evolutionMaterial(s,c))*.45
  if(k==='immortal')score+=Math.min(5,(conversion+attacks)*4)
  if(k==='flip'&&evolutionMaterial(s,c)<0)score+=Math.min(12,-evolutionMaterial(s,c)*.25)
  if(a.to&&t.b[a.to]?.c===c&&!t.b[a.to].immortal)score-=Math.min(4,(info.heat[a.to]||0)*.35)
  if(k==='spawn'||k==='clone')score-=Math.max(0,Object.values(t.b).filter(p=>p.c===c).length-17)*.9
  if(k==='freeze'||k==='double')score+=Math.min(5,disruption*4)
  return score
}
// Bounded opponent lookahead: test checks and capture replies for the shortlist.
function evolutionReplyRisk(s,c,info){
  const enemy=other(c),candidates=bossLegalCandidates(s,enemy),before=evolutionMaterial(s,c)
  const replies=candidates.sort((a,b)=>evolutionWeight(s.b[b.to])-evolutionWeight(s.b[a.to])).slice(0,24)
  let risk=0
  for(const action of replies){
    const t=bossLegalMove(s,action,enemy);if(!t)continue
    if(bossMatePosition(t,enemy))return 500
    risk=Math.max(risk,before-evolutionMaterial(t,c)+bossMovementChecks(t,c).length*6)
  }
  // Opponents frequently teleport or convert. Model the most valuable exposed target.
  if((info.counts.move||0)+(info.counts.convert||0)+(info.counts.delete||0)>0&&!bossInfo(s,enemy).lock){
    const target=Math.max(0,...Object.values(s.b).filter(p=>p.c===c&&!isRoyal(p)&&!isDivine(p)&&!p.immortal).map(evolutionWeight))
    risk+=Math.min(8,target*.35)
  }
  return risk
}
export function bossReply(s,c,id,catalog=originals,history=[],suggested=null){
  const evolving=id==='evolution',info=evolving?evolutionInfo(s,c):null
  const enemy=other(c),m=bossInfo(s,c),squares=allSquares(s),own=Object.entries(s.b).filter(([,p])=>p.c===c),foes=Object.entries(s.b).filter(([,p])=>p.c===enemy),empty=squares.filter(sq=>!s.b[sq]),a=[]
  const val=p=>!p?0:isRoyal(p)?(p.t==='godking'?38:24):p.t==='overlord'?15:p.t==='devourer'?10:p.t==='fusion'?12:(values[p.t]||7)
  const near=sq=>{const [x,y]=xy(sq);return 1-Math.max(Math.abs(x-(boardSize(s)-1)/2),Math.abs(y-(boardSize(s)-1)/2))/boardSize(s)}
  const scoreBoard=b=>Object.values(b).reduce((v,p)=>v+(p.c===c?1:-1)*val(p),0)
  const initial=scoreBoard(s.b),bias=kind=>1.3/(1+(m.used?.[kind]||0))
  const add=(action,score=0)=>{const kind=bossActionKind(action);if((!evolving||evolutionPermitted(info,action))&&bossPowerAllowed(s,action,c)&&canBossRepeat(s,c,kind))a.push({action,score:score+bias(kind)+Math.random()*.15})}
  if(suggested)add({from:suggested.from,to:suggested.to,promotion:suggested.promotion,normal:true},4+val(s.b[suggested.to]))
  const legalCandidates=bossLegalCandidates(s,c)
  if(evolving&&info.stage===0){
    const ordered=legalCandidates.slice().sort((x,y)=>Number(y.from===suggested?.from&&y.to===suggested?.to)-Number(x.from===suggested?.from&&x.to===suggested?.to)||val(s.b[y.to])-val(s.b[x.to]))
    for(const action of ordered){const t=bossTrial(s,action,c,id,catalog,history);if(t)return {action,state:t}}
  }
  // Look at every legal destination for an immediate mate, including inherited custom movement.
  if(m.turns+1>=BOSS_GRACE){
    for(const action of legalCandidates){
      const legal=bossLegalMove(s,action,c)
      if(!legal||!bossMatePosition(legal,c))continue
      const t=bossTrial(s,action,c,id,catalog,history)
      if(t&&bossOutcome(t,c,catalog,action,s))return {action,state:t}
    }
  }
  {for(const action of legalCandidates)add(action,val(s.b[action.to])*.8+near(action.to)-near(action.from))}
  for(const [from,p] of own){
    for(const to of squares){if(to===from||s.b[to]?.c===c||isDivine(s.b[to]))continue;const victim=s.b[to],promotion=p.t==='p'&&Number(to.slice(1))===(c==='w'?boardSize(s):1)?'q':undefined
      add({from,to,promotion},val(victim)*.9+near(to)-near(from)+(promotion?6:0))}
    if(m.lock)continue
    for(const k of pieceAbilities(p,catalog)){
      if(['divine','supremacy','absorption','fusion'].includes(k))continue
      const targets=powerTargets(s,from,k)
      if(['radiance','nova','shockwave'].includes(k)){if(targets.length)add({power:k,from},targets.reduce((v,sq)=>v+val(s.b[sq]),0)*(k==='radiance'?1.5:1))}
      else for(const to of targets)add({power:k,from,to},val(s.b[to])*.7+2)
    }
  }
  if(!m.lock){
    const types=['overlord','devourer','illuminator','nova','phantom','starwalker','echo','prism','q',...catalog.filter(x=>x.id.startsWith('user-')).map(x=>x.id)]
    const spots=empty.slice().sort((x,y)=>near(y)-near(x)).slice(0,8)
    for(const to of spots)for(const type of types)add({power:'spawn',to,type},(type==='overlord'?5:3)+near(to))
    for(const [to,p] of foes){
      add({power:'delete',to},val(p)*.8);add({power:'convert',to},val(p)*1.3);add({power:'destroy',to},val(p)*.9)
      if(canBossRepeat(s,c,'hole')){const affected=[to,...neighbors(to,boardSize(s))];const gain=foes.filter(([sq,p])=>affected.includes(sq)&&!isDivine(p)).reduce((v,[,p])=>v+val(p),0),cost=own.filter(([sq,p])=>affected.includes(sq)&&!isDivine(p)).reduce((v,[,p])=>v+val(p),0);if(gain>cost)add({power:'hole',to},(gain-cost)*.35)}
      const [x,y]=xy(to)
      for(const dest of squares.filter(sq=>!s.b[sq]||s.b[sq]?.c===enemy).slice(0,12))if(dest!==to)add({power:'control',from:to,to:dest},val(s.b[dest])*.8+1)
    }
    for(const [from,p] of own){
      if(!p.immortal&&!isDivine(p)&&!isRoyal(p))add({power:'immortal',to:from},2+val(p)*.12)
      for(const to of spots.slice(0,2))add({power:'clone',from,to},Math.min(7,val(p)*.5))
      for(const [to,q] of own.slice(0,6))if(from!==to)add({power:'merge',from,to},3)
      if(!isRoyal(p))for(const type of ['overlord','devourer','nova','illuminator'])add({power:'transform',to:from,type},4)
    }
    if(boardSize(s)<16)add({power:'expand',size:boardSize(s)===8?12:16},2)
    if(canBossFlip(s))add({power:'flip'},Math.max(0,-initial)*1.2)
    for(let steps=1;steps<=Math.min(5,history.length);steps++){const prev=history.at(-steps);if(canBossRewind(s,prev))add({power:'rewind',steps},Math.max(0,scoreBoard(prev.b)-initial))}
    for(const kind of ['double','freeze','lock'])add({power:kind},kind==='immunity'?4:kind==='lock'?2:3)
  }
  a.sort((x,y)=>y.score-x.score)
  let best=null,bestScore=-Infinity,checked=0
  const evolutionShortlist=[]
  // Try the top tactical candidates plus a few of every available power, so the boss can actually use its full arsenal.
  const groups=new Map();for(const item of a){const k=bossActionKind(item.action);if(!groups.has(k))groups.set(k,[]);if(groups.get(k).length<3)groups.get(k).push(item)}
  const candidates=[...new Set([...a.slice(0,72),...Array.from(groups.values()).flat()])]
  for(const item of candidates){
    const t=bossTrial(s,item.action,c,id,catalog,history);if(!t)continue
    let score=(scoreBoard(t.b)-initial)*.38+item.score
    if(item.action.power==='hole')score-=3
    if(item.action.power==='spawn'||item.action.power==='clone')score-=Math.max(0,own.length-16)*.8
    if(item.action.power==='lock'||item.action.power==='freeze'||item.action.power==='double')score+=1
    if(id==='owner')score+=item.action.power?1.5:0
    if(id==='illegal'&&suggested&&item.action.from===suggested.from&&item.action.to===suggested.to&&!item.action.power)score+=2
    if(m.turns+1>=BOSS_GRACE&&bossOutcome(t,c,catalog,item.action,s))score+=1000
    if(evolving&&info.stage>=1)score+=evolutionScore(s,t,c,item.action,info)*(info.stage===1?.55:1)
    if(evolving&&info.stage>=2)evolutionShortlist.push({action:item.action,state:t,score})
    if(score>bestScore){best={action:item.action,state:t};bestScore=score}
    checked++
  }
  if(evolving&&info.stage>=2&&evolutionShortlist.length){
    const shortlist=evolutionShortlist.sort((x,y)=>y.score-x.score).slice(0,info.stage===3?8:4)
    let top=null,topScore=-Infinity
    for(const item of shortlist){const score=item.score-evolutionReplyRisk(item.state,c,info)*(info.stage===3?1.5:1);if(score>topScore){top=item;topScore=score}}
    if(top)return {action:top.action,state:top.state}
  }
  if(best)return best
  // Exhaust the remaining candidates if the grace filter rejected the top choices.
  for(const item of a){const t=bossTrial(s,item.action,c,id,catalog,history);if(t)return {action:item.action,state:t}}
  // Legal chess is always an available fallback if the position permits it.
  for(const action of legalCandidates){const t=bossTrial(s,action,c,id,catalog,history);if(t)return {action,state:t}}
  return null
}
