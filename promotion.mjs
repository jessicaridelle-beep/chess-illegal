import {referenceArt,makeReferenceImage} from './reference-art.mjs?v=cinema-39'
// Promotion splash uses the actual promoted piece, not an assumed queen.
export const PROMOTION_MS=7000
export const AFTERMATH_MS=10000
const orth=[[0,-1],[1,0],[0,1],[-1,0]],diag=[[-1,-1],[1,-1],[1,1],[-1,1]]
export function promotionInfo(type){
  const themes={q:['#b345ff',[...orth,...diag]],r:['#39ed4a',orth],b:['#31d8ff',diag],n:['#ffae43',[]]}
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
// Each imported frame is displayed unmodified. Piece-specific stages never use another piece's artwork.
export function promotionTimeline(type){
  const out=[['promo-awake',0,850],['promo-runes',850,1500],['promo-pawn-burst',1500,2050],['promo-charge',2050,2500],['promo-star',2500,3000]]
  if(type==='q')out.push(['promo-reveal-q',3000,3500],['promo-queen-magic',3500,4100])
  else if(type==='b')out.push(['promo-reveal-b',3000,3550],['promo-reveal-b-alt',3550,4100])
  else out.push(['promo-reveal-'+type,3000,4100])
  out.push(['promotion-'+type,4100,5000],['promo-meteor-runes',5000,5350],['promo-meteor-alt',5350,5600],['promo-meteor',5600,5900],['promo-return',5900,6100],['promo-return-alt',6100,6250],['promo-aftermath',6250,6450])
  return out
}
export function squarePercent(sq,size=8,view='w'){
  const m=/^([a-p])(\d+)$/.exec(sq||'');if(!m)return null
  let x=m[1].charCodeAt(0)-97,y=size-Number(m[2])
  if(x<0||x>=size||y<0||y>=size)return null
  if(view==='b'){x=size-1-x;y=size-1-y}
  return {x:(x+.5)*100/size,y:(y+.5)*100/size}
}
let aftermathTimer=null
export function clearPromotionAftermath(board){
  clearTimeout(aftermathTimer);aftermathTimer=null
  board?.classList.remove('promotion-aftermath')
  if(board){delete board.dataset.promotionSquare;delete board.dataset.promotionColor}
}
export function syncPromotionAftermath(board,size,view){
  const pt=squarePercent(board?.dataset.promotionSquare,size,view)
  if(pt){board.style.setProperty('--after-x',pt.x+'%');board.style.setProperty('--after-y',pt.y+'%')}
}
export function startPromotionAftermath(board,piece,{size=8,view='w'}={}){
  if(!board||!squarePercent(piece.sq,size,view))return false
  clearPromotionAftermath(board)
  board.dataset.promotionSquare=piece.sq;board.dataset.promotionColor=piece.t
  board.style.setProperty('--after-color',promotionInfo(piece.t).color)
  syncPromotionAftermath(board,size,view)
  // Restart only on a new promotion, never on a normal board redraw.
  void board.offsetWidth;board.classList.add('promotion-aftermath')
  aftermathTimer=setTimeout(()=>clearPromotionAftermath(board),AFTERMATH_MS)
  return true
}
function addOriginalFrames(scene,type){
  for(const [slot,start,end] of promotionTimeline(type)){
    const source=referenceArt(slot)
    if(!source)continue
    const frame=el('div','promotion-reference-frame',scene)
    frame.style.setProperty('--ref-start',start+'ms');frame.style.setProperty('--ref-length',(end-start)+'ms')
    makeReferenceImage(frame,source,'promotion-original-image',slot)
  }
}
function addLanding(scene,board,piece,size,view){
  const pt=squarePercent(piece.sq,size,view)
  if(!board||!pt)return
  const rect=board.getBoundingClientRect()
  const landing=el('div','promotion-landing',scene)
  landing.style.setProperty('--land-x',(rect.left+rect.width*pt.x/100)+'px')
  landing.style.setProperty('--land-y',(rect.top+rect.height*pt.y/100)+'px')
  landing.style.setProperty('--land-size',Math.max(28,rect.width/size)+'px')
  el('div','promotion-comet',landing)
  for(let i=0;i<3;i++){const ring=el('span','promotion-land-ring',landing);ring.style.setProperty('--land-delay',(i*85)+'ms')}
  for(let i=0;i<32;i++){const spark=el('i','promotion-land-spark',landing);spark.style.setProperty('--land-angle',(i*137.5)+'deg');spark.style.setProperty('--land-distance',(45+i%7*13)+'px')}
}
export function playPromotion(root,piece,{art,label,preview=false,reduced=false,board=null,size=8,view='w'}){
  if(!root||!piece||!piece.t||!['w','b'].includes(piece.c))return null
  root.querySelector('.promotion-scene')?.remove()
  const info=promotionInfo(piece.t),duration=reduced?1200:PROMOTION_MS
  const scene=el('div','promotion-scene'+(reduced?' promotion-reduced':''),root)
  scene.style.setProperty('--promo-color',info.color);scene.style.setProperty('--promo-ms',duration+'ms')
  scene.setAttribute('role','status');scene.setAttribute('aria-label',(preview?'Preview: ':'')+'Pawn promoted to '+label(piece.t))
  const source=referenceArt('promotion-'+piece.t)
  if(source&&reduced){
    scene.classList.add('promotion-original')
    makeReferenceImage(scene,source,'promotion-original-image','Promotion to '+label(piece.t))
    return {scene,duration}
  }
  if(!reduced)scene.classList.add('promotion-cinema')
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
  if(!reduced){
    const sigil=svgEl('svg',{class:'promotion-sigil',viewBox:'0 0 100 100','aria-hidden':'true'},frame)
    for(const rad of [19,29,39,45])svgEl('circle',{cx:50,cy:48,r:rad,fill:'none',stroke:'currentColor','stroke-width':.5},sigil)
    for(let i=0;i<8;i++){const ang=i*Math.PI/4;svgEl('line',{x1:50+Math.cos(ang)*19,y1:48+Math.sin(ang)*19,x2:50+Math.cos(ang)*45,y2:48+Math.sin(ang)*45,stroke:'currentColor','stroke-width':.7},sigil)}
    const star=el('div','promotion-starburst',frame)
    for(let i=0;i<8;i++){const ray=el('i','promotion-star-ray',star);ray.style.setProperty('--star-rotation',(i*45)+'deg')}
  }
  const title=el('div','promotion-title',scene)
  const top=el('small','promotion-kicker',title);top.textContent=preview?'ANIMATION PREVIEW':'PAWN PROMOTION'
  const name=el('strong','promotion-name',title);name.textContent=label(piece.t)
  if(!reduced){
    const comet=el('div','promo-live-comet',scene);
    for(let i=0;i<5;i++){const trail=el('i','promo-live-trail',comet);trail.style.setProperty('--trail',i)}
    const orbit=el('div','promo-live-orbit',frame);
    for(let i=0;i<3;i++){const ring=el('i','promo-live-ring',orbit);ring.style.setProperty('--orbit',i)}
    addOriginalFrames(scene,piece.t);addLanding(scene,board,piece,size,view)
  }
  return {scene,duration}
}
