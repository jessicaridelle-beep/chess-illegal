// Real board-state cinematics, not a prerecorded chess position.
export const MATE_MS=1950,BRILLIANT_MS=1800
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
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
    const file=view==='b'?size-1-col:col,rank=view==='b'?row+1:size-row
    const sq=String.fromCharCode(97+file)+rank,p=state.b[sq],cell=node('div','finale-cell'+((file+rank)%2?' finale-dark':''),stage)
    if(path.has(sq))cell.classList.add('finale-path')
    if(danger.has(sq))cell.classList.add('finale-danger')
    if(sq===to)cell.classList.add('finale-attacker')
    if(p){const piece=node('div','finale-piece'+(lostSquares.has(sq)?' finale-losing':''),cell);piece.innerHTML=art(p.t,p.c)
      if(sq===to&&start&&origin!==to){piece.classList.add('finale-moving');vars(piece,{'--mx':((start.x-point.x)*size)+'%','--my':((start.y-point.y)*size)+'%'})}
    }
  }
  const sky=node('div','finale-sky',stage)
  for(let i=0;i<72;i++){
    const star=node('i','finale-star',sky)
    vars(star,{'--sx':((i*37.31)%100)+'%','--sy':((i*61.73)%100)+'%','--ss':(1+i%4)+'px','--sd':(i%9*27)+'ms'})
  }
  const aura=node('div','finale-aura',stage)
  node('div','finale-bloom',aura)
  for(let i=0;i<3;i++){const ring=node('span','finale-ring',aura);vars(ring,{'--rd':(i*100)+'ms'})}
  const orb=node('b','finale-orb',aura);orb.textContent=mate?'#':'!!'
  node('div','finale-ribbon',stage)
  node('div','finale-vignette',layer)
  if(mate){
    for(const p of lost.slice(0,8)){
      const at=scenePoint(p.sq,size,view);if(!at)continue
      const shatter=node('div','finale-shatter',stage);vars(shatter,{'--kx':at.x+'%','--ky':at.y+'%'})
      const markup=art(p.t,p.c)
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
