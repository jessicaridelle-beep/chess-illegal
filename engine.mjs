import { sacrificeCandidates, chooseHunterMove } from './review.mjs?v=evolution-24'
// A worker belongs to one job. Reuse it for both root searches in a move review.
function engineJob(requests, skill, onComplete, multiPV=1) {
  let worker, timer, finish
  const result = new Promise((resolve) => {
    let done = false,
      index = 0,
      score = null, pvByDepth=new Map()
    const answers = []
    finish = (value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      worker?.terminate()
      resolve(value)
    }
    const start = () => {
      score = null;pvByDepth=new Map()
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
          if(multiPV>1)worker.postMessage('setoption name MultiPV value '+multiPV)
          worker.postMessage('isready')
        } else if (line === 'readyok') start()
        else if (line.startsWith('info ') && !/\b(lowerbound|upperbound)\b/.test(line)) {
          const match = line.match(/\bscore (cp|mate) (-?\d+)\b/)
          if(match){
            const parsed={type:match[1],value:Number(match[2])},depth=Number(line.match(/\bdepth (\d+)/)?.[1]||0),pv=Number(line.match(/\bmultipv (\d+)/)?.[1]||1),move=line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/)?.[1]
            if(pv===1)score=parsed
            if(move&&depth){const row=pvByDepth.get(depth)||new Map();row.set(pv,{move,score:parsed});pvByDepth.set(depth,row)}
          }
        } else if (line.startsWith('bestmove ')) {
          const bestmove=line.split(/\s+/)[1]
          const depths=[...pvByDepth.keys()].sort((a,b)=>b-a),depth=depths.find(d=>pvByDepth.get(d).size>=multiPV&&pvByDepth.get(d).get(1)?.move===bestmove)||depths.find(d=>pvByDepth.get(d).get(1)?.move===bestmove)||0
          const lines=depth?[...pvByDepth.get(depth)].sort((a,b)=>a[0]-b[0]).map(([,line])=>line):[]
          answers.push({move:bestmove,score:lines[0]?.score||score,depth,lines})
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
  const depths = { max:23,beginner:1,easy:3,medium:7,hard:12,master:18,relaxed:3,balanced:8,sharp:12 }
  const skills = { max:20,beginner:0,easy:3,medium:9,hard:16,master:20,relaxed:1,balanced:9,sharp:20 }
  const go = 'go depth ' + depths[level] + ' movetime ' + (level==='max'?3000:['master','sharp'].includes(level) ? 1600 : level==='hard'?700:350)
  return engineJob(
    [{ fen, go }],
    skills[level],
    ([answer]) => allowed.find((m) => m.from + m.to + (m.promotion || '') === answer.move) || null,
  )
}

// Bounded parallel agents; exact-position caches never contain guessed grades.
const ROOT_GO='go depth 16 movetime 1250',MIN_DEPTH=9,MAX_CACHE=48
const roots=new Map(),focused=new Map()
let prediction=null,focusPrediction=null
const diagnostics={cacheHits:0,parallelChecks:0,predictions:0,alternativeChecks:0,reviewWorkers:3}
const uciValid=m=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)
function trimCache(cache){
  for(const [key,item] of cache){if(cache.size<=MAX_CACHE)break;if(item.done)cache.delete(key)}
}
function searchCached(cache,key,fen,moves,multi){
  if(cache.has(key))return cache.get(key)
  const job=engineJob([{fen,go:ROOT_GO+(moves.length?' searchmoves '+moves.join(' '):'')}],20,([answer])=>answer,multi)
  const item={key,fen,moves,job,done:false,value:null,users:0}
  cache.set(key,item)
  item.result=job.result.then(answer=>{item.done=true;item.value=answer;if(!answer?.score||answer.depth<MIN_DEPTH){if(cache.get(key)===item)cache.delete(key)}trimCache(cache);return answer})
  return item
}
const rootSearch=(fen,count)=>searchCached(roots,fen,fen,[],Math.max(1,Math.min(4,count)))
const focusedSearch=(fen,moves)=>searchCached(focused,fen+'|'+moves.slice().sort().join(' '),fen,moves,Math.max(1,Math.min(4,moves.length)))
function cancelIdle(item){if(item&&!item.done&&!item.users)item.job.cancel()}
export function preanalyzePosition(fen,legalCount,selectedMoves=[]){
  if(!fen||!legalCount){cancelIdle(prediction);cancelIdle(focusPrediction);prediction=null;focusPrediction=null;return}
  if(prediction?.fen!==fen){cancelIdle(prediction);prediction=rootSearch(fen,legalCount);diagnostics.predictions++}
  const moves=[...new Set(selectedMoves.filter(uciValid))]
  if(!moves.length||moves.length>4){cancelIdle(focusPrediction);focusPrediction=null;return}
  const key=fen+'|'+moves.slice().sort().join(' ')
  if(focusPrediction?.key===key)return
  cancelIdle(focusPrediction);focusPrediction=focusedSearch(fen,moves)
}
export function analysisStats(){return {...diagnostics,rootCached:[...roots.values()].filter(x=>x.done&&x.value?.depth>=MIN_DEPTH).length}}
const lineFor=(answer,move)=>answer?.lines?.find(x=>x.move===move)||(answer?.move===move&&answer.score?{move,score:answer.score}:null)
export function cachedComparison(root,played,actual=null){
  if(!root?.score||root.depth<MIN_DEPTH)return null
  const best={move:root.move,score:root.score},chosen=lineFor(root,played)||actual
  if(!chosen?.score||chosen.move!==played)return null
  return {best,actual:chosen,alternative:root.move!==played?best:root.lines?.find(x=>x.move!==played)||null}
}
export function getCachedComparison(fen,played,alternatives=[]){
  let actual=null
  for(const item of focused.values())if(item.fen===fen&&item.done&&item.value?.depth>=MIN_DEPTH){actual=lineFor(item.value,played);if(actual)break}
  const result=cachedComparison(roots.get(fen)?.value,played,actual)
  if(!result||(!result.alternative&&alternatives.length))return null
  diagnostics.cacheHits++;return result
}
export function compareMove(fen,played,alternatives=[]){
  const valid=[...new Set(alternatives.filter(m=>uciValid(m)&&m!==played))]
  if(!uciValid(played))return {result:Promise.resolve(null),cancel:()=>{}}
  const cached=getCachedComparison(fen,played,valid)
  if(cached)return {result:Promise.resolve(cached),cancel:()=>{}}
  let cancelled=false
  const root=rootSearch(fen,valid.length+1);root.users++
  if(prediction!==root)cancelIdle(prediction)
  const focus=focusPrediction?.fen===fen&&focusPrediction.moves.includes(played)?focusPrediction:null
  if(!focus)cancelIdle(focusPrediction)
  const playedJob=focus||focusedSearch(fen,[played]);playedJob.users++;diagnostics.parallelChecks++
  // Third reviewer starts immediately instead of waiting for the best-move search.
  // Search only alternatives to the actual move, using one PV and the same search budget.
  const rootKnown=root.done&&root.value?.score
  const needAlt=valid.length&&(!rootKnown||root.value.move===played&&!root.value.lines?.some(x=>x.move!==played))
  const alternativeJob=needAlt?engineJob([{fen,go:ROOT_GO+' searchmoves '+valid.join(' ')}],20,([x])=>x):null
  if(alternativeJob)diagnostics.alternativeChecks++
  const result=(async()=>{
    const best=await root.result
    if(cancelled||!best?.score||!uciValid(best.move))return null
    let comparison=cachedComparison(best,played)
    if(!comparison){
      const answer=await playedJob.result
      if(cancelled)return null
      const chosen=lineFor(answer,played)
      if(!chosen?.score)return null
      comparison={best:{move:best.move,score:best.score},actual:chosen,alternative:best.move!==played?{move:best.move,score:best.score}:best.lines?.find(x=>x.move!==played)||null}
    }
    if(comparison.best.move===played&&!comparison.alternative&&valid.length){
      const alt=await alternativeJob?.result
      if(cancelled)return null
      if(alt?.score&&valid.includes(alt.move))comparison.alternative={move:alt.move,score:alt.score}
    }
    return cancelled?null:comparison
  })().catch(()=>null).finally(()=>{root.users--;playedJob.users--;cancelIdle(root);cancelIdle(playedJob);alternativeJob?.cancel()})
  return {result,cancel:()=>{cancelled=true;alternativeJob?.cancel();if(root.users===1&&!root.done)root.job.cancel();if(playedJob.users===1&&!playedJob.done)playedJob.job.cancel()}}
}

export function brilliantHunterMove(fen,allowed){
  let active=null,cancelled=false
  const byUci=new Map(allowed.map(m=>[m.from+m.to+(m.promotion||''),m]))
  const go='go depth 18 movetime 1600'
  const result=(async()=>{
    const offers=sacrificeCandidates(fen).filter(x=>byUci.has(x))
    const requests=[{fen,go}]
    if(offers.length)requests.push({fen,go:go+' searchmoves '+offers.join(' ')})
    active=engineJob(requests,20,answers=>answers)
    const answers=await active.result
    if(cancelled||!answers)return null
    const [best,offer]=answers
    if(!best?.score||!byUci.has(best.move))return null
    let alternative=null
    if(offer?.score&&offers.includes(offer.move)){
      const remaining=[...byUci.keys()].filter(m=>m!==offer.move)
      if(remaining.length){
        if(best.move!==offer.move)alternative=best
        else{
          active=engineJob([{fen,go:go+' searchmoves '+remaining.join(' ')}],20,([answer])=>answer)
          alternative=await active.result
          if(cancelled)return null
        }
      }
    }
    const selected=chooseHunterMove(best,offers.includes(offer?.move)?offer:null,alternative)
    if(!selected||!byUci.has(selected.uci))return null
    return {...byUci.get(selected.uci),...(selected.grade?{hunterGrade:selected.grade}:{})}
  })().catch(()=>null)
  return {result,cancel:()=>{cancelled=true;active?.cancel()}}
}
