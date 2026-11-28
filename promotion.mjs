import {referenceArt,makeReferenceImage} from './reference-art.mjs?v=reference-38'
// Promotion splash uses the actual promoted piece, not an assumed queen.
export const PROMOTION_MS=2400
const orth=[[0,-1],[1,0],[0,1],[-1,0]],diag=[[-1,-1],[1,-1],[1,1],[-1,1]]
export function promotionInfo(type){
  const themes={q:['#b345ff',[...orth,...diag]],r:['#39ed4a',orth],b:['#31d8ff',diag],n:['#ff4054',[]]}
  const [color,dirs]=themes[type]||['#ffce70',[]]
  const arrows=dirs.map(([x,y])=>[[50,48],[50+x*37,48+y*37]])
  if(type==='n')for(const [x,y] of [[1,2],[-1,2],[1,-2],[-1,-2],[2,1],[-2,1],[2,-1],[-2,-1]]){
    const dx=x*17,dy=y*17
    arrows.push([[50,48],Math.abs(x)>Math.abs(y)?[50+dx,48]:[50,48+dy],[50+dx,48+dy]])
  }
  return {color,arrows}
}
export function promotedPiece(before,after,action){
  const {from,to,promotion}=action||{},old=before?.b?.[from],next=after?.b?.[to]
  return promotion&&from!==to&&old?.t==='p'&&next?.t===promotion&&old.c===next.c&&next.t!=='p'?{t:next.t,c:next.c,sq:to}:null
}
const ns='http://www.w3.org/2000/svg'
function el(tag,cls,parent){const n=document.createElement(tag);n.className=cls;parent.append(n);return n}
function svgEl(tag,attrs,parent){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n}
export function playPromotion(root,piece,{art,label,preview=false,reduced=false}){
  if(!root||!piece||!piece.t||!['w','b'].includes(piece.c))return null
  root.querySelector('.promotion-scene')?.remove()
  const info=promotionInfo(piece.t),duration=reduced?1200:PROMOTION_MS
  const scene=el('div','promotion-scene'+(reduced?' promotion-reduced':''),root)
  scene.style.setProperty('--promo-color',info.color);scene.style.setProperty('--promo-ms',duration+'ms')
  scene.setAttribute('role','status');scene.setAttribute('aria-label',(preview?'Preview: ':'')+'Pawn promoted to '+label(piece.t))
  const source=referenceArt('promotion-'+piece.t)
  if(source){
    scene.classList.add('promotion-original')
    makeReferenceImage(scene,source,'promotion-original-image','Promotion to '+label(piece.t))
    return {scene,duration}
  }
  const floor=el('div','promotion-floor',scene)
  for(let i=0;i<64;i++)el('i','promotion-tile'+((Math.floor(i/8)+i%8)%2?' promo-dark':''),floor)
  const lineup=el('div','promotion-lineup',scene)
  for(const t of ['q','r','b','n']){const item=el('span','promotion-small-piece',lineup);item.innerHTML=art(t,piece.c)}
  const frame=el('div','promotion-frame',scene)
  const aura=el('div','promotion-aura',frame)
  for(let i=0;i<24;i++){const spark=el('i','promotion-particle',aura),angle=i*2.399963;for(const [k,v] of Object.entries({'--px':Math.cos(angle)*(130+i%6*20)+'%','--py':Math.sin(angle)*(130+i%6*20)+'%','--pd':(i%8*45)+'ms'}))spark.style.setProperty(k,v)}
  const arrows=svgEl('svg',{class:'promotion-arrows',viewBox:'0 0 100 100','aria-hidden':'true'},frame)
  for(const [i,points] of info.arrows.entries()){
    const last=points.at(-1),prev=points.at(-2),dx=last[0]-prev[0],dy=last[1]-prev[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len
    const base=[last[0]-ux*9,last[1]-uy*9],side=5.5
    const path=points.slice(0,-1).concat([base]).map(v=>v.join(' ')).join(' ')
    const group=svgEl('g',{class:'promotion-arrow',style:'--arrow-delay:'+(i*32)+'ms'},arrows)
    svgEl('polyline',{points:path,fill:'none',stroke:'#fff','stroke-width':5.5,'stroke-linejoin':'round'},group)
    svgEl('polygon',{points:[last,[base[0]-uy*side,base[1]+ux*side],[base[0]+uy*side,base[1]-ux*side]].map(v=>v.join(',')).join(' '),fill:'#fff'},group)
  }
  const pawn=el('div','promotion-pawn',frame);pawn.innerHTML=art('p',piece.c)
  const hero=el('div','promotion-hero',frame);hero.innerHTML=art(piece.t,piece.c)
  const ring=el('div','promotion-ring',frame)
  const title=el('div','promotion-title',scene)
  const top=el('small','promotion-kicker',title);top.textContent=preview?'ANIMATION PREVIEW':'PAWN PROMOTION'
  const name=el('strong','promotion-name',title);name.textContent=label(piece.t)
  return {scene,duration}
}
