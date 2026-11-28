// Chess-edit-inspired lighting; purely visual, never changes moves or ratings.
const palette={brilliant:'#38e5e2',illegalBrilliant:'#38e5e2',great:'#67c8ff',illegalGreat:'#b68aff',best:'#9fe56a',illegalBest:'#bd89ff',excellent:'#a4ed83',illegalExcellent:'#ae8af8',good:'#87cc72',illegalGood:'#a58ae7',inaccuracy:'#ffd76b',illegalInaccuracy:'#ffd76b',mistake:'#ffad55',illegalMistake:'#ffad55',blunder:'#ff505d',illegalBlunder:'#ff505d',miss:'#ff505d',illegalMiss:'#ff505d',winning:'#a0f16e',illegalMate:'#ffdc75',book:'#bc9b72',reality:'#bf8cff',time:'#78d6ff',void:'#a381ff',summon:'#72eec7',fusion:'#8cecff',divine:'#ffe07a',conversion:'#59e5b3',destruction:'#ff8a75',chaos:'#ff9870',customPower:'#c794ff'}
export const editColor=key=>palette[key]||'#b7d9de'
export function lineSquares(from,to,size=8){
  if(!from||!to||from===to)return []
  const x=from.charCodeAt(0)-97,y=Number(from.slice(1)),u=to.charCodeAt(0)-97,v=Number(to.slice(1)),dx=u-x,dy=v-y
  if(![x,u,y,v].every(Number.isInteger)||x<0||u<0||x>=size||u>=size||y<1||v<1||y>size||v>size)return []
  if(dx&&dy&&Math.abs(dx)!==Math.abs(dy))return []
  const out=[],n=Math.max(Math.abs(dx),Math.abs(dy))
  for(let i=1;i<n;i++)out.push(String.fromCharCode(97+x+i*Math.sign(dx))+(y+i*Math.sign(dy)))
  return out
}
export function editPaths(state,entry,attack){
  const fx=entry?.fx,size=state.size||8
  if(!fx)return {move:[],threat:[]}
  const move=!fx.power&&entry.legality?.kind==='legal'?lineSquares(fx.from,fx.to,size):[]
  const threat=new Set()
  if(!fx.power&&fx.to&&state.b[fx.to]?.c===entry.actor){
    for(const [sq,p] of Object.entries(state.b)){
      if(p.c===entry.actor||!['k','godking'].includes(p.t)&&!p.royal)continue
      if(attack(fx.to,sq)){for(const at of lineSquares(fx.to,sq,size))threat.add(at);threat.add(sq)}
    }
  }
  return {move,threat:[...threat]}
}
const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export function clearEditPaths(board){
  board.querySelectorAll('.edit-trail,.edit-threat,.edit-focus').forEach(n=>{n.classList.remove('edit-trail','edit-threat','edit-focus');n.style.removeProperty('--edit-accent')})
}
export function paintEditPaths(board,state,entry,grade,attack){
  clearEditPaths(board)
  if(!entry||!grade)return
  const paths=editPaths(state,entry,attack),color=editColor(grade.key)
  for(const [list,kind] of [[paths.move,'edit-trail'],[paths.threat,'edit-threat']]){
    for(const sq of list){const n=board.querySelector('[data-sq="'+sq+'"]');if(n){n.classList.add(kind);n.style.setProperty('--edit-accent',kind==='edit-threat'?'#ff5368':color)}}
  }
  for(const sq of [entry.fx?.from,entry.sq]){if(!sq)continue;const n=board.querySelector('[data-sq="'+sq+'"]');if(n){n.classList.add('edit-focus');n.style.setProperty('--edit-accent',color)}}
}
export function burstEdit(board,entry,grade,effect){
  if(reduced()||!entry||!grade)return false
  const color=editColor(grade.key),target=board.querySelector('[data-sq="'+entry.sq+'"]'),pin=target?.querySelector('.grade-pin')||board.querySelector('.grade-global')
  const root=board.getBoundingClientRect(),at=(pin||target)?.getBoundingClientRect()
  if(!root.width||!root.height)return false
  const x=at?Math.max(3,Math.min(97,(at.left+at.width/2-root.left)/root.width*100)):50
  const y=at?Math.max(3,Math.min(97,(at.top+at.height/2-root.top)/root.height*100)):50
  const layer=document.createElement('div')
  layer.className='edit-burst edit-burst-'+effect;layer.setAttribute('aria-hidden','true')
  layer.style.setProperty('--edit-accent',color);layer.style.setProperty('--edit-x',x+'%');layer.style.setProperty('--edit-y',y+'%')
  for(let i=0;i<2;i++){const ring=document.createElement('span');ring.className='edit-energy-ring';ring.style.setProperty('--ring-delay',i*95+'ms');layer.append(ring)}
  const amount=effect==='spectacular'?32:effect==='impact'?22:effect==='standard'?10:18
  for(let i=0;i<amount;i++){
    const dot=document.createElement('i'),angle=i*2.399963,dist=35+(i%7)*10
    dot.className='edit-stardust';dot.style.setProperty('--dust-x',Math.cos(angle)*dist+'px');dot.style.setProperty('--dust-y',Math.sin(angle)*dist+'px');dot.style.setProperty('--dust-size',(2+i%4)+'px');dot.style.setProperty('--dust-delay',(i%5)*12+'ms');layer.append(dot)
  }
  if(effect==='spectacular'||effect==='impact'||effect==='power'){
    const wave=document.createElement('div');wave.className='edit-screen-wave';layer.append(wave)
  }
  board.append(layer);setTimeout(()=>layer.remove(),950)
  return true
}
