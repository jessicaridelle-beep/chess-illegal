// Private browser-local art. No files are uploaded to a server.
const KEY='chessillegal.referenceart.v1'
export const slots={'promotion-b':'Bishop promotion','promotion-r':'Rook promotion','promotion-n':'Knight promotion','promotion-q':'Queen promotion','brilliant':'Brilliant !!','great':'Great !','mate-b':'Bishop checkmate','mate':'Any other checkmate'}
const names={'7979':'promotion-b','7981':'promotion-r','7980':'promotion-n','7982':'promotion-q','7985':'brilliant','7984':'mate-b','7983':'mate'}
export function referenceSlot(filename){return names[String(filename).replace(/\.[^.]+$/,'')]||null}
const validImage=value=>typeof value==='string'&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
let art={}
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');for(const k of Object.keys(slots))if(validImage(saved?.[k]))art[k]=saved[k]}catch{}
export function referenceArt(slot){return art[slot]||null}
export function referenceMate(type){return referenceArt('mate-'+type)||referenceArt('mate')}
function readImage(file){
  return new Promise((resolve,reject)=>{
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>1000000){reject(new Error('Choose a JPG, PNG or WebP under 1 MB.'));return}
    const reader=new FileReader()
    reader.onerror=()=>reject(new Error('Could not read the file.'))
    reader.onload=()=>validImage(reader.result)?resolve(reader.result):reject(new Error('Invalid image.'))
    reader.readAsDataURL(file)
  })
}
function persist(next){
  const json=JSON.stringify(next)
  if(json.length>3500000)throw Error('Image collection is too large. Choose smaller files.')
  localStorage.setItem(KEY,json);art=next
}
export function makeReferenceImage(root,src,cls,alt){
  if(!validImage(src))return null
  const img=document.createElement('img');img.className=cls;img.src=src;img.alt=alt;img.draggable=false
  root.append(img);return img
}
export function initReferenceArt(root){
  if(!root)return
  const $=id=>root.querySelector('#'+id),select=$('reference-slot'),single=$('reference-single'),batch=$('reference-batch'),status=$('reference-status')
  for(const [key,label] of Object.entries(slots)){const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option)}
  function refresh(msg=''){const active=Object.keys(slots).filter(k=>art[k]);status.textContent=(msg?msg+' ':'')+active.length+' of '+Object.keys(slots).length+' images saved on this browser. '+active.map(k=>slots[k]).join(' · ')}
  single.onchange=async()=>{const file=single.files?.[0],slot=select.value;if(!file)return
    try{const data=await readImage(file);persist({...art,[slot]:data});refresh('Saved '+slots[slot]+'.')}catch(e){refresh(e.message)}finally{single.value=''}
  }
  batch.onchange=async()=>{const files=[...batch.files];batch.disabled=true
    try{let next={...art},count=0,skipped=0
      for(const file of files){const slot=referenceSlot(file.name);if(!slot){skipped++;continue}next[slot]=await readImage(file);count++}
      persist(next);refresh('Imported '+count+' reference images.'+(skipped?' '+skipped+' unrecognized filenames skipped.':''))
    }catch(e){refresh(e.message)}finally{batch.value='';batch.disabled=false}
  }
  $('reference-remove').onclick=()=>{try{const next={...art};delete next[select.value];persist(next);refresh('Image removed.')}catch(e){refresh(e.message)}}
  refresh()
}
