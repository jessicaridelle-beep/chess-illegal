// Original procedural sound design and lightweight board effects. No external audio assets.
const destructive=new Set(['delete','destroy','hole','nova','shockwave','beam','diagonal','comet','consume'])
const transfer=new Set(['control','phase','leap','consume','sidestep'])
const signature=p=>p.c+':'+p.t
export function describeEffect(before,after,action,legal){
  const {from,to,power,promotion}=action, mover=before.b[from],victim=before.b[to]
  const moving=!!(from&&to&&from!==to&&mover&&(!power||transfer.has(power))&&after.b[to]?.c===mover.c)
  const travel=moving?[{from,to}]:[]
  const victims=[]
  const add=(sq,p)=>{if(p&&!victims.some(v=>v.sq===sq))victims.push({sq,t:p.t,c:p.c})}
  if(moving&&victim&&(!power||['control','phase','consume','sidestep'].includes(power))&&!['exchange'].includes(power))add(to,victim)
  // En passant has an empty destination, and castling has two sliding pieces.
  if(!power&&moving&&legal==='legal'&&mover.t==='p'&&!victim&&from[0]!==to[0]){
    const sq=to[0]+from.slice(1),p=before.b[sq]
    if(p?.t==='p'&&p.c!==mover.c&&!after.b[sq])add(sq,p)
  }
  if(!power&&moving&&legal==='legal'&&mover.t==='k'&&from[0]==='e'&&['c','g'].includes(to[0])&&from.slice(1)===to.slice(1)){
    const rank=from.slice(1),rf=(to[0]==='g'?'h':'a')+rank,rt=(to[0]==='g'?'f':'d')+rank
    if(before.b[rf]?.t==='r'&&before.b[rf].c===mover.c&&!after.b[rf]&&after.b[rt]?.t==='r'&&after.b[rt].c===mover.c)travel.push({from:rf,to:rt})
  }
  if(destructive.has(power)){
    const remaining=new Map()
    for(const p of Object.values(after.b))remaining.set(signature(p),(remaining.get(signature(p))||0)+1)
    // Match survivors at their original coordinates before accounting for displaced pieces.
    const missing=[]
    for(const [sq,p] of Object.entries(before.b)){
      if(after.b[sq]&&signature(after.b[sq])===signature(p))remaining.set(signature(p),(remaining.get(signature(p))||0)-1)
      else missing.push([sq,p])
    }
    missing.sort(([x],[y])=>Number(y===to)-Number(x===to))
    for(const [sq,p] of missing){const key=signature(p),n=remaining.get(key)||0;if(n>0)remaining.set(key,n-1);else if(sq!==from||!moving)add(sq,p)}
  }
  return {from,to,power,capture:victims.length>0,promotion:!!promotion,travel,victims:victims.slice(0,4),captureCount:victims.length}
}
export function effectDuration(delay=500){return Math.max(420,Math.min(520,Math.round(delay*.85)))}
const powerGroups={hole:'void',rewind:'time',freeze:'time',double:'time',flip:'reality',expand:'reality',lock:'reality',control:'reality',exchange:'reality',phase:'reality',spawn:'summon',clone:'summon',echo:'summon',replicate:'summon',mirror:'summon',merge:'fusion',transform:'fusion',convert:'convert',radiance:'convert',dominion:'convert',immortal:'shield',immunity:'shield',decree:'shield',blessing:'shield',delete:'impact',destroy:'impact',nova:'impact',shockwave:'impact',beam:'impact',diagonal:'impact',comet:'impact',consume:'impact',leap:'leap'}
export function soundKind(fx){return fx?.power?powerGroups[fx.power]||'reality':fx?.capture?'capture':fx?.promotion?'summon':'move'}
let audio=null,noiseBuffer=null
export function unlockSound(){
  try{
    const C=globalThis.AudioContext||globalThis.webkitAudioContext
    if(!C)return null
    audio||=new C()
    if(audio.state==='suspended')audio.resume().catch(()=>{})
    return audio
  }catch{return null}
}
function tone(a,t,f,end,length,volume,type='sine'){
  const o=a.createOscillator(),g=a.createGain()
  o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(25,end),t+length)
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length)
  o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+length+.015)
}
function noise(a,t,length,volume,frequency,type='bandpass'){
  if(!noiseBuffer){noiseBuffer=a.createBuffer(1,Math.ceil(a.sampleRate*.5),a.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1}
  const src=a.createBufferSource(),filter=a.createBiquadFilter(),g=a.createGain()
  src.buffer=noiseBuffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.8
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+length)
  src.connect(filter);filter.connect(g);g.connect(a.destination);src.start(t);src.stop(t+length+.01)
}
export function playEffectSound(fx,{delay=0,check=false,win=false}={}){
  const a=unlockSound();if(!a)return false
  try{
    const start=a.currentTime+.012,kind=soundKind(fx),impact=start+Math.max(0,delay)/1000
    if(fx?.travel?.length)noise(a,start,.075,.035,850,'lowpass')
    if(kind==='move'){tone(a,start,240,100,.07,.07,'triangle');noise(a,start,.045,.045,700)}
    if(kind==='capture'||kind==='impact'||fx?.capture){
      tone(a,impact,155,48,.15,.13,'triangle');noise(a,impact,.09,.18,1500);noise(a,impact+.018,.16,.12,4100,'highpass')
      for(let i=0;i<3;i++)tone(a,impact+.024*i,1300+440*i,600+110*i,.09,.035,'triangle')
    }
    if(kind==='void'){noise(a,start,.28,.09,500,'lowpass');tone(a,start,110,32,.34,.14,'sine');tone(a,start,350,55,.26,.06,'triangle')}
    if(kind==='time'){for(let i=0;i<4;i++)tone(a,start+i*.038,740-i*130,280-i*60,.12,.045,'triangle')}
    if(kind==='reality'){tone(a,start,130,720,.21,.07,'triangle');tone(a,start+.025,620,170,.25,.045,'sine')}
    if(['summon','fusion','convert','shield','leap'].includes(kind)){[330,495,660].forEach((f,i)=>tone(a,start+.035*i,f,f*1.14,.13,.055,'sine'));noise(a,start,.1,.045,2500)}
    if(check&&!win){tone(a,impact+.12,520,490,.09,.045,'triangle');tone(a,impact+.22,650,620,.1,.04,'triangle')}
    if(win)[330,440,554,660].forEach((f,i)=>tone(a,impact+.09+i*.07,f,f,.19,.05,'triangle'))
    return true
  }catch{return false}
}
const polygons=['0% 0%,50% 0%,50% 45%,0% 28%','50% 0%,100% 0%,100% 35%,50% 45%','0% 28%,50% 45%,32% 100%,0% 100%','50% 45%,100% 35%,100% 100%,70% 100%','50% 45%,70% 100%,32% 100%']
const colors={void:'#9f70ff',time:'#65d9ff',reality:'#c18aff',summon:'#67ffd0',fusion:'#b3f6ff',convert:'#53e5aa',shield:'#ffdc77',impact:'#ff7558',leap:'#9ca7ff',capture:'#ffbc79',move:'#ffffff'}
export function effectPoint(sq,size,view){
  if(!sq)return null
  let x=sq.charCodeAt(0)-97,y=size-Number(sq.slice(1))
  if(x<0||x>=size||y<0||y>=size||!Number.isInteger(y))return null
  if(view==='b'){x=size-1-x;y=size-1-y}
  return {left:x*100/size,top:y*100/size,width:100/size}
}
export function renderEffects(board,fx,{size,view,art,delay=500}){
  if(!fx||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return
  const duration=effectDuration(delay),kind=soundKind(fx)
  board.style.setProperty('--slide-ms',duration+'ms')
  for(const {from,to} of fx.travel||[]){
    const start=effectPoint(from,size,view),end=effectPoint(to,size,view),target=board.querySelector('[data-sq="'+to+'"]')
    if(!start||!end||!target)continue
    target.classList.add('piece-arrival')
    const unit=board.getBoundingClientRect().width/size
    target.style.setProperty('--move-x',((start.left-end.left)*size/100*unit)+'px')
    target.style.setProperty('--move-y',((start.top-end.top)*size/100*unit)+'px')
  }
  if(!fx.power&&!fx.capture&&!fx.promotion)return
  const layer=document.createElement('div')
  layer.className='arena-fx-layer';layer.setAttribute('aria-hidden','true')
  layer.style.setProperty('--impact-color',colors[kind]||colors.reality)
  layer.style.setProperty('--impact-delay',(fx.travel?.length?Math.round(duration*.72):0)+'ms')
  function place(sq,className){
    const p=effectPoint(sq,size,view);if(!p)return null
    const node=document.createElement('div');node.className=className
    Object.assign(node.style,{left:p.left+'%',top:p.top+'%',width:p.width+'%',height:p.width+'%'})
    layer.append(node);return node
  }
  for(const victim of fx.victims||[]){
    const node=place(victim.sq,'arena-shatter');if(!node)continue
    const markup=art(victim.t,victim.c)
    if(board.dataset.editGlow==='true'){const fallen=document.createElement('span');fallen.className='arena-fallen';fallen.innerHTML=markup;node.append(fallen)}
    for(let i=0;i<polygons.length;i++){
      const fragment=document.createElement('span'),angle=(i*2*Math.PI/polygons.length)+.2
      fragment.className='arena-shard';fragment.style.clipPath='polygon('+polygons[i]+')'
      fragment.style.setProperty('--shard-x',(Math.cos(angle)*95)+'%');fragment.style.setProperty('--shard-y',(Math.sin(angle)*95)+'%');fragment.style.setProperty('--shard-r',(i%2?-1:1)*(35+i*14)+'deg')
      fragment.innerHTML=markup;node.append(fragment)
    }
    for(let i=0;i<8;i++){const spark=document.createElement('i'),angle=i*Math.PI/4;spark.className='arena-spark';spark.style.setProperty('--spark-x',(Math.cos(angle)*1400)+'%');spark.style.setProperty('--spark-y',(Math.sin(angle)*1400)+'%');node.append(spark)}
    node.append(Object.assign(document.createElement('b'),{className:'arena-impact-ring'}))
  }
  if(fx.power||fx.promotion){
    const node=place(fx.to||fx.from,'arena-power-orb arena-power-'+kind)
    if(node){node.append(Object.assign(document.createElement('b'),{className:'arena-impact-ring'}))}
    if(['flip','rewind','expand','freeze','lock','double','immunity'].includes(fx.power)){const global=document.createElement('div');global.className='arena-global-wave arena-wave-'+kind;layer.append(global)}
  }
  if(layer.childNodes.length){board.append(layer);setTimeout(()=>layer.remove(),duration+650)}
}

export function playFinaleSound(mate){
  const a=unlockSound();if(!a)return false
  try{
    const t=a.currentTime+.015
    tone(a,t,95,180,.7,.06,'sine');tone(a,t+.28,240,880,.95,.04,'triangle')
    tone(a,t+1.15,700,110,.48,.045,'triangle')
    const land=t+1.7;tone(a,land,125,35,.35,.12,'sine');noise(a,land,.22,.07,2500)
    if(mate){const hit=t+2.35;tone(a,hit,130,35,.28,.14,'triangle');noise(a,hit,.24,.14,2200);noise(a,hit+.04,.25,.07,5000,'highpass')}
    const start=t+(mate?2.75:1.9)
    ;[330,440,554,660].forEach((hz,i)=>tone(a,start+i*.085,hz,hz,.26,.055,'triangle'))
    return true
  }catch{return false}
}

export function playPromotionSound(){
  const a=unlockSound();if(!a)return false
  try{const t=a.currentTime+.015;tone(a,t,110,440,.65,.065,'sine');tone(a,t+.35,330,880,.4,.045,'triangle');noise(a,t+.78,.18,.07,3500);tone(a,t+.78,150,55,.28,.10,'sine');[392,523.25,659.25,783.99].forEach((hz,i)=>tone(a,t+.83+i*.10,hz,hz,.45,.05,'triangle'));return true}catch{return false}
}
