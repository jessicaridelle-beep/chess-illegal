// Real board-state cinematics, not a prerecorded chess position.
export const MATE_MS=4100,BRILLIANT_MS=3200
export const LAND_MS=1700,SHATTER_MS=2350
export const isMate=result=>!!result?.winner&&['Checkmate','Sandbox checkmate'].includes(result.reason)
export const isBrilliant=grade=>['brilliant','illegalBrilliant'].includes(grade?.key)
export const canPlayFinale=(entry,grade,result,prefs)=>!!entry?.id&&prefs.effects&&prefs.cinematic&&(isMate(result)||isBrilliant(grade))
export function defeatedRoyals(state){
  if(!isMate(state.result))return []
  return Object.entries(state.b).filter(([,p])=>p.c!==state.result.winner&&(p.t==='k'||p.t==='godking'||p.royal)).map(([sq,p])=>({sq,t:p.t,c:p.c}))
}
export function scenePoint(sq,size,view){
  if(!sq)return null
  let x=sq.charCodeAt(0)-97,y=size-Number(sq.slice(1))
  if(!Number.isInteger(y)||x<0||x>=size||y<0||y>=size)return null
  if(view==='b'){x=size-1-x;y=size-1-y}
  return {x:(x+.5)*100/size,y:(y+.5)*100/size}
}
// Coordinates are in board percentages, not a fixed prerecorded position.
export function flightArc(start,end,size){
  const cell=100/size,clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n))
  const midX=(start.x+end.x)/2,midY=(start.y+end.y)/2
  const lift=Math.max(cell*2.6,22)
  const control={x:clamp(midX+(Math.abs(start.x-end.x)<cell?.65*cell:0),cell*.5,100-cell*.5),y:Math.max(-8,midY-lift*2)}
  const sample=t=>({x:(1-t)**2*start.x+2*t*(1-t)*control.x+t*t*end.x,y:(1-t)**2*start.y+2*t*(1-t)*control.y+t*t*end.y})
  return {control,points:Array.from({length:6},(_,i)=>sample(i/5))}
}
function flightVisual(stage,start,end,size,markup){
  const arc=flightArc(start,end,size),fly=node('div','finale-flyer',stage)
  vars(fly,{'--landing-x':end.x+'%','--landing-y':end.y+'%'})
  for(const [i,p] of arc.points.entries()){
    vars(fly,{['--fx'+i]:((p.x-end.x)*size)+'%',['--fy'+i]:((p.y-end.y)*size)+'%'})
  }
  fly.innerHTML=markup
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg')
  svg.setAttribute('class','finale-flight-trail');svg.setAttribute('viewBox','0 0 100 100')
  const d='M '+start.x+' '+start.y+' Q '+arc.control.x+' '+arc.control.y+' '+end.x+' '+end.y
  for(const cls of ['flight-halo','flight-core']){
    const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('class',cls);p.setAttribute('pathLength','1');svg.append(p)
  }
  stage.append(svg)
  const launch=node('div','finale-launch',stage)
  vars(launch,{'--launch-x':start.x+'%','--launch-y':start.y+'%'})
  for(let i=0;i<3;i++){const ring=node('span','finale-launch-ring',launch);vars(ring,{'--ld':i*80+'ms'})}
  return fly
}
const clips=['0% 0%,100% 0%,100% 26%,56% 37%,37% 30%,0% 39%','0% 39%,37% 30%,56% 37%,43% 63%,0% 73%','56% 37%,100% 26%,100% 73%,43% 63%','0% 73%,43% 63%,100% 73%,100% 100%,0% 100%']
const offsets=[[-15,-120,-50],[-130,-18,-65],[130,-10,72],[22,125,35]]
function node(tag,cls,parent){const n=document.createElement(tag);n.className=cls;parent.append(n);return n}
function vars(n,obj){for(const [k,v] of Object.entries(obj))n.style.setProperty(k,v)}
export function playFinale(board,state,entry,grade,{size,view,art,attack,paths,preview=false}){
  const mate=isMate(state.result),brilliant=isBrilliant(grade)
  if((!mate&&!brilliant)||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return 0
  board.querySelector('.finale-layer')?.remove()
  const winner=mate?state.result.winner:entry.actor
  const origin=entry?.fx?.from,to=entry?.fx?.to||entry?.sq
  const point=scenePoint(to,size,view)||{x:50,y:50}
  const duration=mate?MATE_MS:BRILLIANT_MS
  const layer=document.createElement('div');layer.className='finale-layer '+(mate?'finale-mate':'finale-brilliant');layer.dataset.action=entry.id;layer.setAttribute('aria-hidden','true')
  vars(layer,{'--finale-ms':duration+'ms','--fx-x':point.x+'%','--fx-y':point.y+'%','--finale-size':size})
  if(preview){const mark=node('small','finale-preview-label',layer);mark.textContent='Animation preview'}
  const stage=node('div','finale-stage',layer)
  const lost=defeatedRoyals(state),lostSquares=new Set(lost.map(p=>p.sq))
  const path=new Set([origin,to,...(paths?.move||[])].filter(Boolean))
  const danger=new Set(paths?.threat||[])
  for(const p of lost){danger.add(p.sq)}
  const start=scenePoint(origin,size,view)
  const mover=state.b[to],flight=!!(start&&origin!==to&&mover&&mover.c===winner)
  if(flight)layer.classList.add('finale-has-flight')
  vars(layer,{'--land-ms':LAND_MS+'ms','--shatter-ms':SHATTER_MS+'ms'})
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const file=view==='b'?size-1-col:col,rank=view==='b'?row+1:size-row
    const sq=String.fromCharCode(97+file)+rank,p=state.b[sq],cell=node('div','finale-cell'+((file+rank)%2?' finale-dark':''),stage)
    if(path.has(sq))cell.classList.add('finale-path')
    if(danger.has(sq))cell.classList.add('finale-danger')
    if(sq===to)cell.classList.add('finale-attacker')
    if(p&&!(flight&&sq===to)){const piece=node('div','finale-piece'+(lostSquares.has(sq)?' finale-losing':''),cell);piece.innerHTML=art(p.t,p.c)}
    if(flight&&sq===to){
      const victim=entry.fx?.victims?.find(v=>v.sq===to)
      if(victim){const old=node('div','finale-piece finale-target-victim',cell);old.innerHTML=art(victim.t,victim.c)}
    }
  }
  if(flight)flightVisual(stage,start,point,size,art(mover.t,mover.c))
  const sky=node('div','finale-sky',stage)
  for(let i=0;i<72;i++){
    const star=node('i','finale-star',sky)
    vars(star,{'--sx':((i*37.31)%100)+'%','--sy':((i*61.73)%100)+'%','--ss':(1+i%4)+'px','--sd':(i%9*27)+'ms'})
  }
  const aura=node('div','finale-aura',stage)
  node('div','finale-bloom',aura)
  const impact=node('div','finale-impact',aura)
  for(let i=0;i<28;i++){const ray=node('i','finale-impact-ray',impact);vars(ray,{'--ray-angle':(i*360/28)+'deg','--ray-length':(22+(i%6)*8)+'%'})}
  for(let i=0;i<3;i++){const ring=node('span','finale-ring',aura);vars(ring,{'--rd':(i*100)+'ms'})}
  const orb=node('b','finale-orb',aura);orb.textContent=mate?'#':'!!'
  node('div','finale-ribbon',stage)
  node('div','finale-vignette',layer)
  if(mate){
    for(const p of lost.slice(0,8)){
      const at=scenePoint(p.sq,size,view);if(!at)continue
      const shatter=node('div','finale-shatter',stage);vars(shatter,{'--kx':at.x+'%','--ky':at.y+'%'})
      const markup=art(p.t,p.c)
      const fracture=node('span','finale-fracture',shatter);fracture.innerHTML='<svg viewBox="0 0 100 100"><path d="M50 8 L42 31 L61 44 L35 62 L56 73 L45 93 M61 44 L83 36 M35 62 L12 55" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'
      for(let i=0;i<clips.length;i++){
        const wrap=node('span','finale-chunk',shatter),part=node('span','finale-clip',wrap)
        part.style.clipPath='polygon('+clips[i]+')';part.innerHTML=markup
        vars(wrap,{'--cx':offsets[i][0]+'%','--cy':offsets[i][1]+'%','--cr':offsets[i][2]+'deg'})
      }
      for(let i=0;i<40;i++){
        const chip=node('i','finale-chip',shatter),angle=i*2.399963,dist=100+(i%7)*24
        vars(chip,{'--cx':Math.cos(angle)*dist+'%','--cy':Math.sin(angle)*dist+'%','--cr':(i*71)+'deg','--cs':(4+i%7)+'%'})
      }
      node('span','finale-crack-ring',shatter)
    }
  }
  board.append(layer)
  setTimeout(()=>layer.remove(),duration+40)
  return duration
}
