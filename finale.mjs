import {referenceArt,referenceMate,makeReferenceImage} from './reference-art.mjs?v=cinema-39'
// Real board-state cinematics, not a prerecorded chess position.
export const MATE_MS=4750,BRILLIANT_MS=3200
export const LAND_MS=1700,SHATTER_MS=2350
export const isMate=result=>!!result?.winner&&['Checkmate','Sandbox checkmate'].includes(result.reason)
export const isBrilliant=grade=>['brilliant','illegalBrilliant'].includes(grade?.key)
export const isGreat=grade=>['great','illegalGreat'].includes(grade?.key)
export const canPlayFinale=(entry,grade,result,prefs)=>!!entry?.id&&prefs.effects&&prefs.cinematic&&(isMate(result)||isBrilliant(grade)||isGreat(grade))
export function defeatedRoyals(state){
  if(!isMate(state.result))return []
  return Object.entries(state.b).filter(([,p])=>p.c!==state.result.winner&&(p.t==='k'||p.t==='godking'||p.royal)).map(([sq,p])=>({sq,t:p.t,c:p.c}))
}
// A finisher is attributed to a piece actually attacking a defeated royal.
export function mateFinisher(state,entry,attack){
  const kings=defeatedRoyals(state),winner=state.result?.winner,to=entry?.fx?.to||entry?.sq
  if(!kings.length)return null
  const allies=Object.entries(state.b).filter(([,p])=>p.c===winner)
  const pairs=[]
  for(const king of kings)for(const [sq,p] of allies){
    if(attack?.(sq,king.sq))pairs.push({attacker:{sq,t:p.t,c:p.c},king})
  }
  return pairs.find(x=>x.attacker.sq===to)||pairs[0]||{attacker:null,king:kings[0]}
}
export function finisherStyle(type){
  return ({q:{color:'#bb62ff',name:'Queen',pattern:'burst'},r:{color:'#57f482',name:'Rook',pattern:'straight'},b:{color:'#22f3d9',name:'Bishop',pattern:'beam'},n:{color:'#ffb34e',name:'Knight',pattern:'leap'},p:{color:'#ffd96a',name:'Pawn',pattern:'spark'},k:{color:'#f9eaff',name:'King',pattern:'ring'}})[type]||{color:'#c6a2ff',name:type?'Custom piece':'Checkmate',pattern:'ring'}
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
function renderMateCutaway(layer,match,art){
  if(!match)return
  const {attacker,king}=match,theme=finisherStyle(attacker?.t)
  const cut=node('div','mate-cutaway mate-'+theme.pattern,layer)
  cut.dataset.finisher=attacker?.t||'neutral'
  vars(cut,{'--mate-accent':theme.color})
  node('div','mate-cutaway-haze',cut)
  const title=node('div','mate-cutaway-title',cut)
  title.textContent=attacker?theme.name+' · '+(theme.pattern==='beam'?'Diagonal beam':'Checkmate'):'Checkmate'
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg')
  svg.setAttribute('class','mate-cutaway-paths');svg.setAttribute('viewBox','0 0 100 100')
  if(attacker&&theme.pattern==='beam'){
    // Stylized chess magic: a charging orb and a luminous diagonal pulse.
    for(const cls of ['bishop-beam-halo','bishop-beam-core','bishop-beam-edge']){
      const p=document.createElementNS(ns,'path');p.setAttribute('class',cls);p.setAttribute('d','M 25 68 L 75 28');p.setAttribute('pathLength','1');svg.append(p)
    }
    const hero=node('div','mate-cutaway-hero',cut);hero.innerHTML=art(attacker.t,attacker.c)
    const charge=node('div','bishop-charge',cut)
    for(let i=0;i<3;i++){const ring=node('span','bishop-charge-ring',charge);vars(ring,{'--charge-delay':i*65+'ms'})}
    const pulse=node('span','bishop-pulse',cut)
    const impact=node('div','bishop-impact',cut)
    for(let i=0;i<20;i++){const ray=node('i','bishop-impact-ray',impact);vars(ray,{'--angle':i*18+'deg','--length':(25+i%5*12)+'%'})}
    node('span','bishop-impact-ring',impact)
  }else if(attacker){
    const paths=theme.pattern==='leap'?['M 25 52 Q 34 8 52 24 T 75 52','M 25 52 L 25 24 L 75 24 L 75 52']:theme.pattern==='diagonal'?['M 25 70 L 75 30','M 25 78 L 75 38']:theme.pattern==='burst'?['M 25 52 L 75 52','M 25 52 L 71 31','M 25 52 L 71 73']:theme.pattern==='straight'?['M 25 52 L 75 52','M 25 48 L 75 48','M 25 56 L 75 56']:theme.pattern==='spark'?['M 25 64 L 75 40']:['M 25 52 Q 50 22 75 52','M 25 52 Q 50 82 75 52']
    for(const d of paths)for(const cls of ['mate-path-halo','mate-path-core']){
      const p=document.createElementNS(ns,'path');p.setAttribute('class',cls);p.setAttribute('d',d);p.setAttribute('pathLength','1');svg.append(p)
    }
    const hero=node('div','mate-cutaway-hero',cut);hero.innerHTML=art(attacker.t,attacker.c)
  }
  cut.append(svg)
  const target=node('div','mate-cutaway-target',cut),markup=art(king.t,king.c)
  const intact=node('div','mate-cutaway-intact',target);intact.innerHTML=markup
  for(let i=0;i<clips.length;i++){
    const wrap=node('span','mate-cutaway-chunk',target),part=node('span','finale-clip',wrap)
    part.style.clipPath='polygon('+clips[i]+')';part.innerHTML=markup
    vars(wrap,{'--cx':offsets[i][0]*1.3+'%','--cy':offsets[i][1]*1.3+'%','--cr':offsets[i][2]+'deg'})
  }
  for(let i=0;i<44;i++){
    const chip=node('i','mate-cutaway-chip',target),angle=i*2.399963,dist=100+(i%7)*25
    vars(chip,{'--cx':Math.cos(angle)*dist+'%','--cy':Math.sin(angle)*dist+'%','--cr':(i*67)+'deg','--cs':(4+i%6)+'%'})
  }
  for(let i=0;i<3;i++){const ring=node('span','mate-cutaway-ring',target);vars(ring,{'--ring-delay':i*110+'ms'})}
  for(let i=0;i<30;i++){const spark=node('i','mate-cutaway-star',cut);vars(spark,{'--sx':(i*37.31%100)+'%','--sy':(i*61.73%100)+'%','--sd':i%8*55+'ms'})}
}
export function playFinale(board,state,entry,grade,{size,view,art,attack,paths,preview=false}){
  const mate=isMate(state.result),brilliant=isBrilliant(grade),great=isGreat(grade)
  if((!mate&&!brilliant&&!great)||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return 0
  board.querySelector('.finale-layer')?.remove()
  const winner=mate?state.result.winner:entry.actor
  const origin=entry?.fx?.from,to=entry?.fx?.to||entry?.sq
  const point=scenePoint(to,size,view)||{x:50,y:50}
  const duration=mate?MATE_MS:BRILLIANT_MS
  const layer=document.createElement('div');layer.className='finale-layer '+(mate?'finale-mate':great?'finale-great':'finale-brilliant');layer.dataset.action=entry.id;layer.setAttribute('aria-hidden','true')
  vars(layer,{'--finale-ms':duration+'ms','--fx-x':point.x+'%','--fx-y':point.y+'%','--finale-size':size})
  if(preview){const mark=node('small','finale-preview-label',layer);mark.textContent='Animation preview'}
  const stage=node('div','finale-stage',layer)
  const lost=defeatedRoyals(state),lostSquares=new Set(lost.map(p=>p.sq))
  const path=new Set([origin,to,...(paths?.move||[])].filter(Boolean))
  const danger=new Set(paths?.threat||[])
  const links=(paths?.links||[]).filter(l=>scenePoint(l.from,size,view)&&scenePoint(l.to,size,view))
  const supports=new Set(),exposed=new Set()
  for(const l of links){if(l.kind==='threat')danger.add(l.to);if(l.kind==='support')supports.add(l.from);if(l.kind==='exposure')exposed.add(l.from)}
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
    if(supports.has(sq)&&!danger.has(sq))cell.classList.add('finale-support')
    if(exposed.has(sq)&&!danger.has(sq))cell.classList.add('finale-exposure')
    if(sq===to)cell.classList.add('finale-attacker')
    if(p&&!(flight&&sq===to)){const piece=node('div','finale-piece'+(lostSquares.has(sq)?' finale-losing':''),cell);piece.innerHTML=art(p.t,p.c)}
    if(flight&&sq===to){
      const victim=entry.fx?.victims?.find(v=>v.sq===to)
      if(victim){const old=node('div','finale-piece finale-target-victim',cell);old.innerHTML=art(victim.t,victim.c)}
    }
  }
  if(flight)flightVisual(stage,start,point,size,art(mover.t,mover.c))
  if(links.length){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg')
    svg.setAttribute('class','finale-tactics');svg.setAttribute('viewBox','0 0 100 100')
    for(const l of links){
      const p=scenePoint(l.from,size,view),q=scenePoint(l.to,size,view)
      const line=document.createElementNS(ns,'path');line.setAttribute('class','tactical-line tactical-'+l.kind);line.setAttribute('d','M '+p.x+' '+p.y+' L '+q.x+' '+q.y);line.setAttribute('pathLength','1');svg.append(line)
      const dot=document.createElementNS(ns,'circle');dot.setAttribute('class','tactical-dot tactical-'+l.kind);dot.setAttribute('cx',q.x);dot.setAttribute('cy',q.y);dot.setAttribute('r',100/size*.27);svg.append(dot)
    }
    stage.append(svg)
    const legend=node('div','finale-tactical-legend',layer)
    for(const [kind,label] of [['threat','Attacks'],['support','Support'],['exposure','Capture pressure']]){
      if(links.some(l=>l.kind===kind)){const item=node('span','tactical-'+kind,legend);item.textContent=label}
    }
  }
  const sky=node('div','finale-sky',stage)
  for(let i=0;i<72;i++){
    const star=node('i','finale-star',sky)
    vars(star,{'--sx':((i*37.31)%100)+'%','--sy':((i*61.73)%100)+'%','--ss':(1+i%4)+'px','--sd':(i%9*27)+'ms'})
  }
  const aura=node('div','finale-aura',stage)
  node('div','finale-bloom',aura)
  const impact=node('div','finale-impact',aura)
  for(let i=0;i<44;i++){const ray=node('i','finale-impact-ray',impact);vars(ray,{'--ray-angle':(i*360/44)+'deg','--ray-length':(22+(i%6)*8)+'%'})}
  const ground=node('div','finale-ground',aura)
  for(let i=0;i<3;i++){const wave=node('span','finale-ground-wave',ground);vars(wave,{'--wave-delay':i*120+'ms'})}
  for(let i=0;i<36;i++){const spark=node('i','finale-land-spark',aura),angle=i*2.399963,dist=45+(i%9)*11;vars(spark,{'--spark-x':Math.cos(angle)*dist+'%','--spark-y':Math.sin(angle)*dist+'%','--spark-delay':(i%4)*25+'ms'})}
  for(let i=0;i<3;i++){const ring=node('span','finale-ring',aura);vars(ring,{'--rd':(i*100)+'ms'})}
  const orb=node('b','finale-orb',aura);orb.textContent=mate?'#':great?'!':'!!'
  node('div','finale-ribbon',stage)
  node('div','finale-vignette',layer)
  const detail=node('div','finale-reason',layer)
  detail.textContent=preview?'Visual preview · colored lines show board geometry':(entry.grade?.detail|| (mate?'Checkmate':great?'Great move':'Brilliant move')).split(' Best line:')[0]
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
  if(mate){
    const match=mateFinisher(state,entry,attack),source=referenceMate(match?.attacker?.t)
    if(source)makeReferenceImage(layer,source,'finale-reference-image finale-reference-mate','Checkmate reference artwork')
    else renderMateCutaway(layer,match,art)
  }else{
    const source=referenceArt(great?'great':'brilliant')
    if(source)makeReferenceImage(layer,source,'finale-reference-image finale-reference-grade',great?'Great move reference artwork':'Brilliant move reference artwork')
  }
  board.append(layer)
  setTimeout(()=>layer.remove(),duration+40)
  return duration
}
