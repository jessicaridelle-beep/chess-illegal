import { Chess } from './vendor/chess.mjs'
import { orthodox, movement, other, boardSize, destinations, isRoyal, isDivine } from './game.mjs?v=evolution-24'

const value = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 }
const worth = (piece) => (piece ? (value[piece.t] ?? 6) : 0)
const points = (board, side) =>
  Object.values(board).reduce((n, p) => n + worth(p) * (p.c === side ? 1 : -1), 0)

export const grades = {
  book: ['Book move', '▣'],
  brilliant: ['Brilliant', '!!'],
  great: ['Great', '!'],
  illegalBrilliant: ['Illegal brilliant', '!!'],
  illegalGood: ['Illegal good', '✓'],
  illegalExcellent: ['Illegal excellent', '✧'],
  illegalInaccuracy: ['Illegal inaccuracy', '?!'],
  illegalMiss: ['Illegal miss', '❌'],
  illegalGreat: ["Illegal great","!"],
  illegalBest: ["Illegal best","★"],
  illegalMove: ["Illegal move","✦"],
  illegalMistake: ["Illegal mistake","?!"],
  illegalBlunder: ["Illegal blunder","??"],
  illegalMate: ["Illegal victory","♛"],
  reality: ["Reality break","⇄"],
  time: ["Time distortion","↶"],
  void: ["Void strike","◉"],
  summon: ["Summoning","+"],
  fusion: ["Fusion","◇"],
  divine: ["Divine protection","♜"],
  conversion: ["Conversion","⇆"],
  destruction: ["Board destruction","×"],
  chaos: ["Chaos strike","✸"],
  customPower: ["Custom power","✧"],
  miss: ['Miss', '❌'],
  sandbox: ['Sandbox move', '✦'],
  best: ['Best', '★'],
  excellent: ['Excellent', '✦'],
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

// Fast one-ply positional judge. No network/engine wait and no random grade rotation.
// Evaluate material, development, central control and the biggest immediate capture risk.
function fastBoard(fen){
  const b={};fen.split(' ')[0].split('/').forEach((row,i)=>{
    let x=0;for(const t of row){if(/[1-8]/.test(t))x+=Number(t);else{b['abcdefgh'[x++]+(8-i)]={c:t===t.toUpperCase()?'w':'b',t:t.toLowerCase()}}}
  });return b
}
function fastPosition(b,actor,size=8,blocked=[]){
  const entries=Object.entries(b),own=entries.filter(([,p])=>p.c===actor),enemy=entries.filter(([,p])=>p.c!==actor)
  const center=(size-1)/2
  let score=0,risk=0,pressure=0
  for(const [sq,p] of entries){
    const x=sq.charCodeAt(0)-97,y=Number(sq.slice(1))-1,advance=p.c==='w'?y:size-1-y
    const central=(size-1-Math.abs(x-center)-Math.abs(y-center))/(size-1)
    let pos=0
    if(p.t==='p')pos=.09*Math.max(0,advance-1)+.26*central
    else if(['n','b'].includes(p.t))pos=.46*central+.23*(advance>0)
    else if(p.t==='r')pos=.12*central+.08*(advance>0)
    else if(p.t==='q')pos=.13*central
    else if(p.t==='k')pos=(entries.length>14?-.30:.25)*central+.22*(advance===0&&[2,size-2].includes(x))
    else pos=.20*central
    score+=(p.c===actor?1:-1)*(worth(p)+pos)
  }
  const riskFor=(victims,attackers)=>{
    let max=0
    for(const [sq,p] of victims){
      if(p.t==='godking'||p.divine||p.immortal)continue
      const attacks=attackers.filter(([at])=>movement(b,at,sq,size,blocked,true))
      if(!attacks.length)continue
      if(p.t==='k'){max=Math.max(max,1.3);continue}
      const targetAsEnemy={...b,[sq]:{...p,c:other(p.c)}}
      const defended=victims.some(([at])=>at!==sq&&movement(targetAsEnemy,at,sq,size,blocked,true))
      const least=Math.min(...attacks.map(([,q])=>q.t==='k'?20:worth(q)))
      max=Math.max(max,defended?Math.max(0,worth(p)-least):worth(p))
    }return max
  }
  risk=riskFor(own,enemy);pressure=riskFor(enemy,own)
  return score-.94*risk+.14*pressure
}
export function instantLegalGrade(moves,played,actor,offer=false){
  if(!moves.length)return null
  const ranked=moves.map(m=>({m,score:fastPosition(fastBoard(m.after),actor)+(/#$/.test(m.san)?1000:/\+$/.test(m.san)?.18:0)})).sort((x,y)=>y.score-x.score)
  const actual=ranked.find(x=>x.m.lan===played)
  if(!actual)return null
  const best=ranked[0].score,loss=Math.max(0,best-actual.score),runner=ranked.find(x=>x.m.lan!==played)
  const margin=runner?actual.score-runner.score:0
  let key,detail
  if(loss>=3.5){key='blunder';detail='The quick comparison finds a major missed gain or material risk.'}
  else if(loss>=1.55){key='mistake';detail='A materially safer or stronger move was available.'}
  else if(loss>=.75){key='inaccuracy';detail='A stronger immediate continuation was available.'}
  else if(loss<=.08&&margin>=1.3&&!offer){key='great';detail='Stands out clearly from the other immediate alternatives.'}
  else if(loss<=.06){key='best';detail='Top-ranked by the instant positional comparison.'}
  else if(loss<=.30){key='excellent';detail='Very close to the top instant evaluation.'}
  else {key='good';detail='Reasonable move with a modest difference from the top candidate.'}
  // A shallow positional comparison cannot establish a sound sacrifice.
  return grade(key,detail,'Instant positional estimate')
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
  const sandbox = { grade: {...grade('sandbox', quick.detail, 'Sandbox estimate · ' + grades[quick.key][0]), visualKey:quick.key} }
  if (power || !mover || mover.c !== actor || before.doubleTurn) return sandbox
  const chess = orthodox(before, actor)
  const candidate = chess
    ?.moves({ square: from, verbose: true })
    .find((m) => m.to === to && m.promotion === promotion)
  if (!candidate) return sandbox
  const uci=from+to+(promotion||'')
  const book=isBookMove(chess,uci)
  const fen = chess.fen()
  const allMoves=chess.moves({verbose:true})
  const alternatives = allMoves.map(m=>m.from+m.to+(m.promotion||'')).filter(m=>m!==from+to+(promotion||''))
  chess.move(candidate)
  const expectedBoard=chess.board().flat().filter(Boolean)
  if(expectedBoard.length!==Object.keys(after.b).length||expectedBoard.some(p=>after.b[p.square]?.c!==p.color||after.b[p.square]?.t!==p.type))return sandbox
  if(book)return {grade:grade('book','Recognized move in the built-in opening book.','Opening book · curated lines')}
  const captured = value[candidate.captured] || 0
  const offer = worth(mover) >= 3 && exchangeGain(chess, to) - captured >= 1.75
  // Orthodox moves are rated only after a real engine comparison. Never display a guessed grade.
  return { grade: grade('unrated','Stockfish is comparing the played move with the best available move.','Engine analysis pending'), search: { fen, played: uci, offer, alternatives } }
}
function scoreInPawns(score) {
  if (score.type === 'cp') return score.value / 100
  return Math.sign(score.value) * (100 - Math.min(Math.abs(score.value), 90) / 100)
}
// Elo-independent expected-points approximation, not Chess.com's private model.
export const expected = score => score.type === 'mate' ? (score.value > 0 ? 1 : 0) : 1/(1+Math.exp(-score.value/155))
export function expectedClass(loss){
  if(loss<=1e-8)return 'best'
  if(loss<=.02+1e-8)return 'excellent'
  if(loss<=.05+1e-8)return 'good'
  if(loss<=.10+1e-8)return 'inaccuracy'
  if(loss<=.20+1e-8)return 'mistake'
  return 'blunder'
}
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
  // A missed win is a special classification, not a blanket penalty for quiet moves.
  if (best>=.78 && played<=.58 && loss>=.15) return result('miss','Missed a strong winning opportunity.'+explanation)
  const key=expectedClass(loss)
  const descriptions={best:'Matches the strongest engine evaluation.',excellent:'Very close to the strongest engine line.',good:'Retains most of the expected score.',inaccuracy:'A stronger continuation was available.',mistake:'A significant drop in expected score.',blunder:'A major loss of expected score.'}
  return result(key,descriptions[key]+explanation)
}

// One immutable presentation snapshot per action; later engine analysis is independent.
export function lockBadge(entry){
  if(!entry?.grade)return null
  if(entry.badge)return entry.badge
  if(entry.search||entry.grade.key==='unrated')return null
  const key=entry.grade.visualKey||entry.grade.key
  const [title,mark]=grades[key]||grades.sandbox
  return entry.badge={key,title,mark,estimated:entry.grade.key==='sandbox'&&!entry.grade.powerCategory,pending:false,power:entry.grade.powerCategory||null}
}
export function displayGrade(entry){return lockBadge(entry)}
export function badgeEffect(key){
  if(['brilliant','illegalBrilliant','winning','illegalMate'].includes(key))return 'spectacular'
  if(['blunder','illegalBlunder','mistake','illegalMistake','miss','illegalMiss'].includes(key))return 'impact'
  if(['best','great','illegalGreat','illegalBest','excellent','illegalExcellent'].includes(key))return 'spark'
  if(['void','reality','time','chaos','fusion','customPower','divine','summon','conversion','destruction'].includes(key))return 'power'
  return 'standard'
}
export function badgePulseKey(entry){const badge=lockBadge(entry);return entry?.id&&badge?entry.id+':'+badge.key:null}
export const waitingForRating=entry=>Boolean(entry?.search&&!entry.badge)
export function finishRating(entry,finalGrade){
  entry.grade=finalGrade;delete entry.search;lockBadge(entry);return entry
}

export const illegalPowerGrades={"flip":"reality","expand":"reality","lock":"reality","rewind":"time","freeze":"time","double":"time","hole":"void","spawn":"summon","clone":"summon","echo":"summon","mirror":"summon","replicate":"summon","merge":"fusion","transform":"fusion","immortal":"divine","immunity":"divine","decree":"divine","blessing":"divine","convert":"conversion","dominion":"conversion","radiance":"conversion","destroy":"destruction","delete":"destruction","nova":"chaos","shockwave":"chaos","beam":"chaos","diagonal":"chaos","comet":"chaos","consume":"chaos","phase":"illegalMove","exchange":"illegalMove","leap":"illegalMove","control":"illegalMove","sidestep":"illegalMove"}
export function classifyAction(before,action,actor){
  if(action.power)return {kind:'power',reason:'Sandbox ability: '+action.power}
  const mover=before.b[action.from]
  if(!mover||mover.c!==actor)return {kind:'illegal',reason:'Moving the other army or a missing piece.'}
  if(!destinations(before,action.from,null).includes(action.to))return {kind:'illegal',reason:'Destination was outside the highlighted legal targets.'}
  const ch=orthodox(before,actor)
  if(ch&&action.promotion&&!ch.moves({square:action.from,verbose:true}).some(m=>m.to===action.to&&m.promotion===action.promotion))
    return {kind:'illegal',reason:'Nonstandard promotion.'}
  return {kind:'legal',reason:ch?'Highlighted legal chess move.':'Highlighted legal sandbox movement (including custom pieces).'}
}
const illegalQuality={brilliant:'illegalBrilliant',great:'illegalGreat',best:'illegalBest',excellent:'illegalExcellent',good:'illegalGood',inaccuracy:'illegalInaccuracy',mistake:'illegalMistake',blunder:'illegalBlunder',miss:'illegalMiss',winning:'illegalMate',drawn:'drawn'}
// Bounded tactical exchange evaluator. Only completed calculations establish safe captures.
const tacticalContext=s=>({size:boardSize(s),blocked:s.destroyed||[],nodes:0,limit:1800,complete:true})
function tacticalKingDanger(b,color,ctx){
  const foes=Object.entries(b).filter(([,p])=>p.c!==color)
  return Object.entries(b).filter(([sq,p])=>p.c===color&&isRoyal(p)&&!isDivine(p)&&!p.immortal&&foes.some(([from])=>movement(b,from,sq,ctx.size,ctx.blocked,true))).map(([sq])=>sq)
}
function tacticalCapture(b,from,to,ctx,ep=false){
  const p=b[from],victim=ep?b[to[0]+from.slice(1)]:b[to]
  if(!p||!victim||victim.c===p.c||isRoyal(victim)||isDivine(victim)||victim.immortal)return null
  const next={...b};delete next[from];if(ep)delete next[to[0]+from.slice(1)]
  const promo=p.t==='p'&&Number(to.slice(1))===(p.c==='w'?ctx.size:1)
  next[to]=promo?{...p,t:'q'}:{...p}
  if(tacticalKingDanger(next,p.c,ctx).length)return null
  return {b:next,gain:worth(victim)+(promo?8:0),from,to}
}
function tacticalCaptures(b,color,ctx,target=null){
  const entries=Object.entries(b),own=entries.filter(([,p])=>p.c===color),foes=target?[[target,b[target]]]:entries.filter(([,p])=>p.c!==color)
  const out=[]
  for(const [to,p] of foes){
    if(!p||p.c===color||isRoyal(p)||isDivine(p)||p.immortal)continue
    for(const [from] of own){
      if(!movement(b,from,to,ctx.size,ctx.blocked,true))continue
      if(++ctx.nodes>ctx.limit){ctx.complete=false;return out}
      const cap=tacticalCapture(b,from,to,ctx);if(cap)out.push(cap)
    }
  }
  return out
}
function tacticalExchange(b,to,color,ctx,depth=0){
  const caps=tacticalCaptures(b,color,ctx,to)
  if(!ctx.complete)return null
  if(!caps.length)return 0
  if(depth>=7){ctx.complete=false;return null}
  let best=0
  for(const cap of caps){
    const reply=tacticalExchange(cap.b,to,other(color),ctx,depth+1)
    if(reply===null)return null
    best=Math.max(best,cap.gain-reply)
  }
  return best
}
export function staticExchangeEval(state,square,attacker){
  const ctx=tacticalContext(state),gain=tacticalExchange(state.b,square,attacker,ctx)
  return ctx.complete?gain:null
}
function tacticalThreats(b,color,ctx){
  const out=new Map()
  for(const cap of tacticalCaptures(b,color,ctx)){
    const reply=tacticalExchange(cap.b,cap.to,other(color),ctx)
    if(reply===null||!ctx.complete)break
    const net=cap.gain-reply
    if(net>(out.get(cap.to)?.net||0))out.set(cap.to,{...cap,net})
  }
  return out
}
const topThreat=map=>[...map.values()].sort((a,b)=>b.net-a.net)[0]||null
function tacticalSafeCaptures(state,color,ctx){
  const caps=tacticalCaptures(state.b,color,ctx),out=[]
  if(state.ep&&state.ep!=='-'){
    const ch=orthodox(state,color)
    if(ch)for(const m of ch.moves({verbose:true}).filter(m=>m.isEnPassant())){
      const cap=tacticalCapture(state.b,m.from,m.to,ctx,true);if(cap)caps.push(cap)
    }
  }
  for(const cap of caps){
    if(!ctx.complete)break
    const replies=tacticalThreats(cap.b,other(color),ctx)
    if(!ctx.complete)break
    const net=cap.gain-(topThreat(replies)?.net||0)
    if(net>=.99)out.push({...cap,net})
  }
  return out.sort((a,b)=>b.net-a.net)
}
export function tacticalAssessment(before,after,action,actor){
  if(action.power||!action.from||!action.to)return null
  const foe=other(actor),bc=tacticalContext(before),ac=tacticalContext(after)
  const oldDanger=tacticalKingDanger(before.b,actor,bc),newDanger=tacticalKingDanger(after.b,actor,ac)
  const result=(key,detail)=>grade(key,detail,'Instant tactical estimate · capture exchange and king safety')
  if(newDanger.length)return result('blunder','Your king is exposed on '+newDanger.join(', ')+'.')
  const oldThreat=tacticalThreats(before.b,foe,bc),newThreat=tacticalThreats(after.b,foe,ac)
  if(!bc.complete||!ac.complete)return null
  const material=points(after.b,actor)-points(before.b,actor)
  let exposed=null
  for(const [sq,t] of newThreat){
    const moved=sq===action.to&&after.b[sq]?.c===actor
    const extra=moved?t.net:Math.max(0,t.net-(oldThreat.get(sq)?.net||0))
    if(extra>=.99&&(!exposed||extra>exposed.extra))exposed={...t,extra,moved}
  }
  if(exposed&&exposed.extra-Math.max(0,material)>=.99)
    return result('blunder',(exposed.moved?'The moved piece':'Another piece')+' on '+exposed.to+' can be captured by '+exposed.from+' for a net loss of about '+exposed.extra.toFixed(1)+' pawn units after recaptures.')
  if(material<=-1)return result('blunder','The move directly loses '+(-material).toFixed(1)+' pawn units of material.')
  const opportunity=tacticalSafeCaptures(before,actor,bc)[0]
  if(!bc.complete)return null
  const playedNet=material-(topThreat(newThreat)?.net||0)
  if(opportunity&&opportunity.net-playedNet>=.95&&!(action.from===opportunity.from&&action.to===opportunity.to))
    return result('miss','Missed safe capture: '+opportunity.from+' × '+opportunity.to+' could gain about '+opportunity.net.toFixed(1)+' pawn units after immediate replies.')
  if(newFork(before,after,action.from,action.to,actor)&&!exposed&&material>=0)
    return result('great','Creates a new fork of major enemy pieces without an immediate material loss.')
  if(oldDanger.length&&!newDanger.length&&material>=0)
    return result('great','Removes an attack on your king while preserving material.')
  if(material>=3&&playedNet>=2)
    return result(material>=8?'great':'best','Wins material after accounting for immediate capture and recapture sequences.')
  if(tacticalKingDanger(after.b,foe,ac).length>tacticalKingDanger(before.b,foe,bc).length&&playedNet>=0)
    return result('excellent','Creates a new attack on the opposing king without an immediate material loss.')
  if((topThreat(oldThreat)?.net||0)-(topThreat(newThreat)?.net||0)>=2&&material>=0)
    return result('excellent','Blocks or escapes a dangerous capture threat.')
  return null
}
export function reviewAction(before,after,action,actor,outcome){
  const legality=classifyAction(before,action,actor)
  const result=reviewMove(before,after,action,actor,outcome)
  result.legality=legality
  // The actual engine takes precedence over every shallow tactical or material rule.
  if(legality.kind==='legal'&&(result.search||result.grade.key==='book'))return result
  const tactical=outcome?null:tacticalAssessment(before,after,action,actor)
  if(tactical){
    result.grade={...grade('sandbox',tactical.detail,tactical.source),visualKey:tactical.key}
    if(legality.kind==='illegal')result.grade.visualKey=illegalQuality[tactical.key]||'illegalMove'
    if(legality.kind!=='legal')delete result.search
    return result
  }
  if(legality.kind!=='legal')delete result.search
  const gained=points(after.b,actor)-points(before.b,actor)
  const quick=result.grade.visualKey||result.grade.key
  let quality=result.grade.key!=='sandbox'?quick:
    ['blunder','mistake','inaccuracy','miss'].includes(quick)?quick:
    quick==='brilliant'||gained>=12?'brilliant':gained>=5?'best':gained>=2?'great':gained>0?'excellent':'good'
  if(result.grade.key==='sandbox'&&quality==='good'&&!action.power){
    const delta=fastPosition(after.b,actor,boardSize(after),after.destroyed||[])-fastPosition(before.b,actor,boardSize(before),before.destroyed||[])
    if(delta>=1.4)quality='great';else if(delta>=.20)quality='excellent';else if(delta<=-2.5)quality='blunder';else if(delta<=-.9)quality='mistake';else if(delta<=-.28)quality='inaccuracy'
    result.grade.detail+=' Quick positional change: '+(delta>=0?'+':'')+delta.toFixed(2)+'.'
  }
  if(legality.kind==='power'){
    const category=illegalPowerGrades[action.power]||'customPower'
    result.grade.powerCategory=category
    result.grade.quality=illegalQuality[quality]||'illegalMove'
    result.grade.visualKey=outcome?.winner===actor?'illegalMate':outcome?.winner===other(actor)?'illegalBlunder':outcome?.winner===null?'drawn':category
    result.grade.source=(outcome?'Game result · ':'Sandbox power · ')+grades[category][0]
    return result
  }
  result.grade.visualKey=legality.kind==='illegal'?(quality==='good'?'illegalMove':illegalQuality[quality]||'illegalMove'):quality
  if(result.grade.key==='sandbox')result.grade.source='Sandbox estimate · '+grades[result.grade.visualKey][0]
  return result
}
export function trackerSummary(logs){
  const out={tracked:0,legal:0,illegal:0,power:0,pending:0,brilliant:0}
  for(const entry of logs){
    if(!entry.grade)continue
    out.tracked++
    const kind=entry.legality?.kind
    if(['legal','illegal','power'].includes(kind))out[kind]++
    if(entry.search)out.pending++
    if(['brilliant','illegalBrilliant'].includes(lockBadge(entry)?.key))out.brilliant++
  }
  return out
}
export function nextTrackerReview(logs){return logs.find(waitingForRating)||logs.find(entry=>entry.search)||null}
export function latestBoardGrade(logs){
  const entry=logs.at(-1)
  if(!entry?.grade||!entry.fx||(!entry.sq&&!entry.fx.power)||!displayGrade(entry))return null
  return entry
}

export function sacrificeCandidates(fen){
  const ch=new Chess(fen),out=[]
  for(const m of ch.moves({verbose:true})){
    if((value[m.piece]||0)<3)continue
    ch.move(m)
    const offered=exchangeGain(ch,m.to)-(value[m.captured]||0)
    ch.undo()
    if(offered>=1.75)out.push(m.from+m.to+(m.promotion||''))
  }
  return out
}
export function chooseHunterMove(best,offer,alternative){
  if(!best?.move||!best?.score)return null
  if(offer?.move&&offer.score&&alternative?.score){
    const rating=engineGrade({played:offer.move,offer:true},{best,actual:offer,alternative})
    if(rating.key==='brilliant')return {uci:offer.move,grade:{...rating,source:'Stockfish · Brilliant Hunter sacrifice search'}}
  }
  return {uci:best.move}
}
