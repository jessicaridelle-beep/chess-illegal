// Optional soundtrack player, independent of chess sound effects.
const ID=/^[A-Za-z0-9_-]{11}$/
export function parseMusic(value){
  const s=String(value||'').trim()
  if(!s)return null
  if(ID.test(s)&&!/^\d+$/.test(s))return {kind:'youtube',id:s}
  let u
  try{u=new URL(s)}catch{return null}
  if(u.protocol!=='https:'||u.username||u.password)return null
  const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean)
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','music.youtube.com'].includes(host)){
    const id=host==='youtu.be'?parts[0]:parts[0]==='watch'?u.searchParams.get('v'):['shorts','embed','live'].includes(parts[0])?parts[1]:null
    return ID.test(id||'')?{kind:'youtube',id}:null
  }
  if(/\.(mp3|wav|ogg|opus|m4a|aac|flac|webm)$/i.test(u.pathname))return {kind:'audio',url:u.href}
  return null
}
export function embedMusic(id,loop){
  if(!ID.test(id))return null
  return 'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&controls=1&rel=0'+(loop?'&loop=1&playlist='+id:'')
}
export function initMusic(root){
  if(!root)return
  const $=id=>root.querySelector('#'+id),input=$('music-id'),audio=$('music-audio'),video=$('music-video'),status=$('music-status'),loop=$('music-loop'),volume=$('music-volume'),file=$('music-file')
  let saved={},objectUrl=null,current=null
  try{saved=JSON.parse(localStorage.getItem('chessillegal.music.v1'))||{}}catch{}
  input.value=typeof saved.input==='string'?saved.input:''
  loop.checked=saved.loop!==false
  volume.value=Number.isFinite(saved.volume)?Math.max(0,Math.min(100,saved.volume)):35
  audio.volume=Number(volume.value)/100;audio.loop=loop.checked
  const persist=()=>{try{localStorage.setItem('chessillegal.music.v1',JSON.stringify({input:input.value,loop:loop.checked,volume:Number(volume.value)}))}catch{}}
  function stop(){
    audio.pause();audio.removeAttribute('src');audio.load();audio.hidden=true
    video.replaceChildren();video.hidden=true
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}
    current=null
  }
  function playAudio(url,name){
    audio.src=url;audio.hidden=false;audio.loop=loop.checked;audio.volume=Number(volume.value)/100
    status.textContent='Loaded: '+name
    audio.play().catch(()=>{status.textContent='Track loaded. Press play in the audio player.'})
  }
  function load(){
    const track=parseMusic(input.value)
    if(!track){status.textContent=/^\d+$/.test(input.value.trim())?'Numeric Roblox audio IDs are not supported here. Use a YouTube video ID, audio URL or your own file.':'Enter a YouTube video ID, YouTube link or HTTPS audio-file URL.';return}
    stop();current=track;persist()
    if(track.kind==='youtube'){
      const iframe=document.createElement('iframe')
      iframe.src=embedMusic(track.id,loop.checked);iframe.title='YouTube soundtrack player';iframe.allow='encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin'
      video.append(iframe);video.hidden=false
      status.textContent='Press play in the YouTube player. Use its own volume controls. Some videos cannot be embedded.'
    }else playAudio(track.url,'Custom audio')
  }
  $('music-load').onclick=load
  $('music-stop').onclick=()=>{stop();status.textContent='Music stopped.'}
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load()}})
  volume.oninput=()=>{audio.volume=Number(volume.value)/100;persist()}
  loop.onchange=()=>{audio.loop=loop.checked;persist();if(current?.kind==='youtube')status.textContent='Loop preference saved. Load the video again to apply it.'}
  file.onchange=()=>{
    const track=file.files?.[0]
    if(!track)return
    if(!track.type.startsWith('audio/')&&!/\.(mp3|wav|ogg|opus|m4a|aac|flac)$/i.test(track.name)){status.textContent='Choose an audio file.';return}
    stop();objectUrl=URL.createObjectURL(track);current={kind:'local'};playAudio(objectUrl,track.name);file.value=''
  }
  audio.addEventListener('error',()=>{if(current&&current.kind!=='youtube')status.textContent='Audio could not be played. Try a supported file or a direct audio URL.'})
  root.addEventListener('toggle',()=>{if(!root.open&&current?.kind==='youtube'){stop();status.textContent='Video stopped when player was closed.'}})
  window.addEventListener('pagehide',()=>{audio.pause();if(objectUrl)URL.revokeObjectURL(objectUrl)},{once:true})
}
