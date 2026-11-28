import {initReferenceArt} from './reference-art.mjs?v=cinema-39'
import { promotedPiece, playPromotion, startPromotionAftermath, clearPromotionAftermath, syncPromotionAftermath } from './promotion.mjs?v=cinema-40'
import { initMusic } from './music.mjs?v=music-40'
import { actionHold, delayForPresentation, extendPresentation, preparedRatingMatches } from './presentation.mjs?v=tempo-28'
import { isMate, isBrilliant, isGreat, canPlayFinale, playFinale } from './finale.mjs?v=cinema-39'
import { paintEditPaths, clearEditPaths, burstEdit, editPaths, syncBadgeTint, tacticalTrails, geometryAttack } from './editfx.mjs?v=impact-34'
import { describeEffect, effectDuration, unlockSound, playEffectSound, renderEffects, playFinaleSound, playPromotionSound } from './effects.mjs?v=cinema-39'
import { icon, names, abilities, powers, originals, pieceArt, pieceAbilities, movementDescription, passiveAbilities, areaAbilities, escapeHtml as esc } from './ui.mjs?v=boss-11'
import {
  fresh,
  beginRealityTimeline,
  realityFlipRemaining, markRealityAction, canBossFlip, bossActionKind, bossRepeatLimit, markBossStreak, canBossRepeat, bossFamily, blackHoleRemaining, blackHoleActionGap, bossNeedsMove,
  isBoss, BOSS_GRACE, bossInfo, evolutionInfo, observeEvolution, bossReply, bossOutcome, clearBossImmunity, bossConsumeFreeze, bossConsumeLock, bossHasRoyal,
  isDivine, isDestroyed, mergePieces, destroySquare, toggleCheckmateImmunity,
  clone,
  files,
  ranks,
  other,
  colorName,
  orthodox,
  move,
  movement,
  edit,
  usePower,
  sandboxReply,
  matchOutcome,
  destinations,
  threatenedKings,
  convertPiece,
  boardSize, boardFiles, boardRanks, allSquares, expandBoard, blackHole, xy, legalBotTrial, sandboxNoMove, clonePiece, toggleImmortality, freezeBot, toggleRealityLock, consumeBotFreeze, godTrial, godPower,
} from './game.mjs?v=evolution-24'
import { stockfishMove, compareMove, brilliantHunterMove, preanalyzePosition, analysisStats, getCachedComparison } from './engine.mjs?v=tempo-28'
import { grades, reviewAction, engineGrade, displayGrade, latestBoardGrade, gradeSquares, trackerSummary, nextTrackerReview, classifyAction, lockBadge, badgeEffect, badgePulseKey, waitingForRating, finishRating } from './review.mjs?v=evolution-24'
const $ = (id) => document.getElementById(id),
  modal = $('modal'),
  board = $('board')
const key = 'chessbotillegal.arena.v1'
let saved = {}
try {
  saved = JSON.parse(localStorage.getItem(key)) || {}
} catch {}
let game = saved.game?.b ? saved.game : fresh(),
  custom = saved.custom || [],
  undoStack = saved.undo || [],
  redoStack = saved.redo || []
// Older saves have no reliable flip boundary. Start a new one without altering the board.
if(!game.realityTimeline)beginRealityTimeline(game)
let prefs = {
  bot: 'fish',
  level: 'balanced',
  auto: true,
  coords: true,
  sound: true,
  effects: true,
  cinematic: true,
  editGlow: true,
  badgeTint: true,
  marks: true,
  theme: 'green',
  ...saved.prefs,
}
let mode = 'move',
  selected = null,
  powerTarget = null,
  spawnType = 'p',
  spawnColor = game.side,
  notice = '',
  epoch = 0,
  engine = null,
  timer = null,
  dialogPage = '',
  storageIssue = false
let lastGradePulse=null,lastEditBurst=game.logs.at(-1)?.id
let lastFinale=game.logs.at(-1)?.id,finaleUntil=0,finaleResultTimer=null
let lastPromotion=game.logs.at(-1)?.id,promotionTimer=null,promotionActive=null
let presentationUntil=0,presentationTimer=null
let lastAnimated = game.logs.at(-1)?.id, annotations = [], arrowStart = null, revealed = new Set(game.logs.filter(x=>!x.search).map(x=>x.id))
const catalog = () => [...originals, ...custom]
const label = (t) => names[t] || catalog().find((x) => x.id === t)?.name || 'Custom piece'
const botProfiles = {"rookie":["Rookie","chaos",200,"beginner"],"cat":["Bytecat","chaos",400,"beginner"],"scout":["Scout","adaptive",650,"easy"],"architect":["Architect","adaptive",900,"easy"],"trickster":["Trickster","chaos",1200,"medium"],"guardian":["Aegis","guardian",1500,"medium"],"tactician":["Tactician","adaptive",1800,"medium"],"sentinel":["Sentinel","guardian",2000,"hard"],"adaptive":["Nexus","adaptive",2200,"hard"],"oracle":["Oracle","guardian",2500,"master"],"fishlite":["Stockfish Lite","adaptive",1200,"easy","stockfish"],"fishclub":["Stockfish Club","adaptive",1800,"medium","stockfish"],"fishstrong":["Stockfish Expert","adaptive",2600,"hard","stockfish"],"fish":["Stockfish","adaptive",3200,"master","stockfish"],"fishmax":["Stockfish Max","adaptive",3500,"max","stockfish"],"gpt":["GPT / AI GOD","guardian",9999,"master","stockfish"],"owner":["OWNER","guardian","∞","max"],"illegal":["Illegal Stockfish","adaptive","ILLEGAL","max","stockfish"],"hunter":["Brilliant Hunter","adaptive","TACTICAL","max","stockfish"],"evolution":["EVOLUTION","adaptive","EVOLVING","max","stockfish"]}
const isHunter=id=>id==='hunter'
const isEngine=id=>botProfiles[id]?.[4]==='stockfish'
const duelProfile=c=>botProfiles[game.duel?.[c]]||botProfiles.fish
let duelRunning=false,duelBusy=false
if(game.duel)game.pending=false
const evolutionLabel=c=>{const x=evolutionInfo(game,c);return x.level+' · '+x.seen+' observed · counter: '+(actionNames[x.focus]||abilities[x.focus]||x.focus)}
const duelName=c=>duelProfile(c)[0]
const duelOptions=()=>Object.entries(botProfiles).map(([id,p])=>[id,p[0]+' · '+(isBoss(id)||isHunter(id)?p[2]:p[2]+' est. Elo')])
function duelKey(s,turn){return JSON.stringify([turn,s.rights,s.ep,s.size,(s.destroyed||[]).slice().sort(),Object.entries(s.b).sort(([a],[b])=>a.localeCompare(b))])}
function duelAfter(s,turn,actor,action,before){
  if(isBoss(s.duel?.[actor]))return bossInfo(s,actor).turns>=BOSS_GRACE?bossOutcome(s,actor,catalog(),action,before):null
  if(isBoss(s.duel?.[turn])&&bossInfo(s,turn).immune&&bossHasRoyal(s,turn))return null
  const has=c=>Object.values(s.b).some(p=>p.c===c&&(p.t==='k'||p.t==='godking'||p.royal))
  if(!has(turn)&&has(actor))return {winner:actor,reason:'Last king taken'}
  const ch=orthodox(s,turn)
  if(ch?.isCheckmate())return {winner:actor,reason:'Checkmate'}
  if(ch?.isStalemate())return {winner:null,reason:'Stalemate'}
  if(ch?.isInsufficientMaterial())return {winner:null,reason:'Insufficient material'}
  const d=s.duel
  d.half=before.b[action.from]?.t==='p'||before.b[action.to]||Object.keys(before.b).length!==Object.keys(s.b).length?0:(d.half||0)+1
  const key=duelKey(s,turn)
  d.positions=[...(d.positions||[]),key].slice(-150)
  if(d.positions.filter(k=>k===key).length>=3)return {winner:null,reason:'Threefold repetition'}
  if(d.half>=100)return {winner:null,reason:'50-move rule'}
  return null
}
function pauseDuel(){
  if(!game.duel)return
  duelRunning=false;duelBusy=false;cancelBot();game.pending=false
}
function updateFlipCooldown(){
  const ms=realityFlipRemaining(game),secs=Math.ceil(ms/1000),tool=document.querySelector('[data-tool="flip"] small'),status=$('duel-flip-cooldown')
  const detail=secs?'Reality switch cooldown · '+secs+'s':game.realityFlipNeedsAction?'Reality switch · another action required':'Reality switch ready'
  if(tool)tool.textContent=secs?'Cooldown · '+secs+'s':'Shared 10s cooldown'
  if(status&&status.textContent!==detail)status.textContent=detail
  const hole=$('duel-hole-cooldown');if(hole){const seconds=Math.ceil(blackHoleRemaining(game)/1000),actions=blackHoleActionGap(game);const label='Black Hole · '+(seconds||actions?[seconds?seconds+'s':'',actions?actions+' intervening actions':''].filter(Boolean).join(' + '):'Ready');if(hole.textContent!==label)hole.textContent=label}
}
const presenting=()=>Date.now()<presentationUntil
const nextDelay=base=>delayForPresentation(Date.now(),Math.max(presentationUntil,finaleUntil),base)
function lockPresentation(duration){
  if(!duration)return
  presentationUntil=extendPresentation(Date.now(),presentationUntil,duration)
  clearTimeout(presentationTimer)
  presentationTimer=setTimeout(()=>{if(!presenting()){board.dataset.presenting='false';renderStatus()}},Math.max(0,presentationUntil-Date.now())+10)
  board.dataset.presenting='true'
}
function resetPresentation(){
  clearPromotionAftermath(board)
  clearTimeout(promotionTimer);promotionActive?.remove();promotionActive=null
  presentationUntil=finaleUntil=0;clearTimeout(presentationTimer);clearTimeout(finaleResultTimer);board.dataset.presenting='false';board.querySelector('.finale-layer')?.remove()
}
function renderDuel(){
  const d=game.duel,panel=$('duel-panel')
  panel.hidden=!d
  updateFlipCooldown()
  if(!d)return
  $('duel-state').textContent=game.result?resultTitle():waitingForRating(game.logs.at(-1))?'Reviewing last move · Stockfish':presenting()?'Animation playing · bots waiting':duelBusy?(isHunter(d[d.turn])?'Hunting for a brilliant move · ':'Thinking · ')+duelName(d.turn):duelRunning?'Playing · '+colorName(d.turn):'Paused · '+colorName(d.turn)+' to move'
  $('duel-toggle').textContent=duelRunning?'Pause':'Resume'
  $('duel-toggle').disabled=!!game.result
  $('duel-step').disabled=duelRunning||duelBusy||!!game.result||presenting()||waitingForRating(game.logs.at(-1))
  $('duel-white').textContent=duelName('w')+' · '+duelProfile('w')[2]
  $('duel-black').textContent=duelName('b')+' · '+duelProfile('b')[2]
  const streak=game.bossActionStreak,anti=$('duel-repeat-status');if(anti){const kinds=(game.bossRecentActions||[]).slice(-4);anti.textContent='Anti-spam v3 · '+(bossNeedsMove(game,d.turn)&&isBoss(d[d.turn])?'Piece move required · ':'')+(kinds.length?kinds.map(k=>k==='move'?'Illegal move':k==='legal'?'Legal move':actionNames[k]||abilities[k]||k).join(' → '):'Ready')}
  $('duel-count').textContent=(d.plies||0)+' moves'+['w','b'].filter(c=>d[c]==='evolution').map(c=>' · '+colorName(c)+' '+evolutionLabel(c)).join('')+['w','b'].filter(c=>isBoss(d[c])).map(c=>' · '+colorName(c)+' grace '+Math.min(BOSS_GRACE,bossInfo(game,c).turns)+'/'+BOSS_GRACE).join('')
}
function scheduleDuel(){
  if(!game.duel||!duelRunning||game.result||duelBusy||waitingForRating(game.logs.at(-1)))return
  clearTimeout(timer)
  const token=epoch
  timer=setTimeout(()=>{if(token===epoch&&duelRunning)duelStep()},nextDelay(game.duel.delay||500))
}
async function duelStep(){
  if(!game.duel||duelBusy||game.result||waitingForRating(game.logs.at(-1)))return
  if(presenting()){if(duelRunning)scheduleDuel();return}
  cancelBot();const token=epoch,d=game.duel,actor=d.turn,id=d[actor],p=duelProfile(actor)
  duelBusy=true;renderStatus()
  try{
    const before=clone(game), sim={...game,side:other(actor),duelMode:true}, ch=orthodox(sim,actor)
    if(bossConsumeFreeze(game,actor)){d.turn=other(actor);log(colorName(actor)+' skipped by Time freeze',p[0]);return}
    let action=null,source=p[0],bossResult=null
    if(ch&&isEngine(id)){
      const moves=ch.moves({verbose:true})
      if(moves.length){engine=isHunter(id)?brilliantHunterMove(ch.fen(),moves):stockfishMove(ch.fen(),id==='evolution'?['beginner','medium','hard','max'][evolutionInfo(game,actor).stage]:p[3],moves);action=await engine.result;if(epoch!==token)return;engine=null;if(isHunter(id)&&!action){engine=stockfishMove(ch.fen(),'master',moves);action=await engine.result;if(epoch!==token)return;engine=null}}
    }
    if(isBoss(id)){bossResult=bossReply(game,actor,id,catalog(),undoStack,action);action=bossResult?.action;source=p[0]+(id==='illegal'&&ch?' · Stockfish + illegal search':' · sandbox')}
    else if(!action){action=sandboxReply(sim,[],p[3]==='max'?'master':p[3],p[1]);if(isEngine(id))source+=' · sandbox fallback'}
    if(epoch!==token)return
    const safe=isBoss(id)?(action&&canBossRepeat(game,actor,bossActionKind(action))?bossResult?.state:null):action&&legalBotTrial(sim,action,actor,[])
    if(!safe){
      if(isBoss(id)&&bossInfo(game,actor).turns<BOSS_GRACE){d.turn=other(actor);log('Grace period · no allowed move',source);return}
      // A boss cannot win merely because the opposing bot has no available action.
      game.result=isBoss(d[other(actor)])?{winner:null,reason:'No available action · no legal boss checkmate'}:ch?.isCheckmate()?{winner:other(actor),reason:'Checkmate'}:ch?.isStalemate()?{winner:null,reason:'Stalemate'}:sandboxNoMove(sim,[],actor)||{winner:null,reason:'No legal move'}
      duelRunning=false;return
    }
    const prepared=await prepareBotRating(before,safe,action,actor,token)
    if(epoch!==token)return
    undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack=[]
    const next=isBoss(id)&&action.power==='double'?actor:other(actor)
    Object.assign(game,{b:safe.b,rights:safe.rights,ep:safe.ep,last:safe.last,size:safe.size,destroyed:safe.destroyed,bossState:safe.bossState})
    if(isBoss(id)){game.bossActionStreak=safe.bossActionStreak;game.bossRecentActions=safe.bossRecentActions;game.bossHoleUntil=safe.bossHoleUntil;game.realityTimeline=safe.realityTimeline;game.realityFlipUntil=safe.realityFlipUntil;game.realityFlipNeedsAction=safe.realityFlipNeedsAction}else{markBossStreak(game,'legal');markRealityAction(game,'move')}
    if(!isBoss(id))bossConsumeLock(game,actor)
    d.turn=next;d.plies=(d.plies||0)+1
    game.result=duelAfter(game,next,actor,action,before)
    const entry=log(colorName(actor)+' · '+(action.power||isBoss(id)&&!action.normal?bossDescription(action,before,actor):label(before.b[action.from]?.t)+' '+action.from+(before.b[action.to]?' × ':' → ')+action.to+(action.promotion?' = '+label(action.promotion):'')),source)
    annotateAction(entry,before,action,actor,undefined,prepared)
    resetSelection()
    if(game.result)duelRunning=false
  }catch(err){if(epoch===token){duelRunning=false;notice='Bot match paused: '+String(err.message||err)}}
  finally{if(epoch===token){duelBusy=false;save();render();chime(true);if(game.result)showResultAfterFinale();else scheduleDuel()}}
}
function duelDialog(){
  pauseDuel();renderStatus()
  const old=game.duel
  dialog('Bot vs Bot','<p class="dialog-copy">Choose either bot for either color. Ordinary bots use normal moves. OWNER, Illegal Stockfish and EVOLUTION cannot activate Checkmate Immunity, create God Kings, or make royal pieces immortal. All other sandbox powers remain available, but they cannot take or erase the opponent’s last king. After their seventh move they may win only with a legal checkmate, including custom-piece movement dots. Active powers cannot deliver the final mate. Flip protection: only surviving pieces switch sides; boss rewinds cannot cross a flip or restore an older match. Anti-spam v3: at most three special powers in any five completed actions; actual piece moves are required between bursts. Black Hole has a shared 20-second cooldown and eight intervening actions. Illegal moves, delete and spawn retain their three-use caps. Pause to edit the board with sandbox tools.</p><label class="form-field">White bot<select id="duel-w">'+selectOptions(duelOptions(),old?.w||'fish')+'</select></label><label class="form-field">Black bot<select id="duel-b">'+selectOptions(duelOptions(),old?.b||'fishmax')+'</select></label><label class="form-field">Move delay<select id="duel-delay">'+selectOptions([['150','Fast'],['500','Normal'],['1200','Slow'],['2500','Very slow']],String(old?.delay||500))+'</select></label><label class="check-row"><input id="duel-current" type="checkbox" '+(old?'checked':'')+'> Use current board (keep custom pieces)</label><label class="form-field">Side to move on current board<select id="duel-turn">'+selectOptions([['w','White'],['b','Black']],old?.turn||'w')+'</select></label><label class="check-row"><input id="duel-marks" type="checkbox" '+(prefs.marks?'checked':'')+'> On-board move rating badges</label><label class="check-row"><input id="duel-sound" type="checkbox" '+(prefs.sound?'checked':'')+'> Capture and power sounds</label><label class="check-row"><input id="duel-effects" type="checkbox" '+(prefs.effects?'checked':'')+'> Animated movement and shattering pieces</label><label class="check-row"><input id="duel-badge-tint" type="checkbox" '+(prefs.badgeTint?'checked':'')+'> Persistent screen tint matching the badge</label><label class="check-row"><input id="duel-edit-glow" type="checkbox" '+(prefs.editGlow?'checked':'')+'> Chess edit glow, trails and particles</label><label class="check-row"><input id="duel-cinematic" type="checkbox" '+(prefs.cinematic?'checked':'')+'> Cinematic move effects</label><label class="form-field">Board theme<select id="duel-theme">'+selectOptions([['green','Classic green'],['wood','Warm wood'],['blue','Midnight blue'],['mono','Monochrome'],['editgray','Chess edits · grayscale'],['editcinema','Chess edits · high contrast']],prefs.theme)+'</select></label><p class="dialog-note">EVOLUTION starts with weak legal moves, learns from opponent actions, unlocks powers and adds reply search over six turns. Its displayed stage is not a measured Elo. Brilliant Hunter can play either color and searches for engine-supported sacrifices on standard boards. Ratings are illustrative difficulty labels, not measured Elo. Stockfish variants use the bundled engine on compatible boards; other profiles use the sandbox engine.</p><div class="dialog-actions"><button class="secondary" id="duel-cancel">Cancel</button><button class="primary" id="duel-start">Start match</button></div>','duel')
  $('duel-cancel').onclick=()=>modal.close()
  $('duel-start').onclick=()=>{
    const keep=$('duel-current').checked,w=$('duel-w').value,b=$('duel-b').value,delay=Number($('duel-delay').value),turn=keep?$('duel-turn').value:'w'
    prefs.badgeTint=$('duel-badge-tint').checked;prefs.editGlow=$('duel-edit-glow').checked;prefs.sound=$('duel-sound').checked;prefs.effects=$('duel-effects').checked;if(prefs.sound)unlockSound();prefs.marks=$('duel-marks').checked;prefs.cinematic=$('duel-cinematic').checked;prefs.theme=$('duel-theme').value
    checkpoint();resetPresentation();if(!keep)game=fresh();else beginRealityTimeline(game)
    game.result=null;game.pending=false;game.doubleTurn=0;game.frozenTurns=0;game.checkmateImmunity=false;game.bossState={};game.evolution={};game.bossActionStreak=null;game.bossRecentActions=[];game.bossHoleUntil=0;game.realityFlipUntil=0;game.realityFlipNeedsAction=false
    game.duel={w,b,delay,turn,plies:0,half:0,positions:[duelKey(game,turn)]};game.view='w';game.side='w';spawnColor='w';mode='move';resetSelection();modal.close();duelRunning=true;save();render();scheduleDuel()
  }
}
function stopDuel(){
  if(!game.duel)return
  pauseDuel();checkpoint();delete game.duel;game.result=null;game.pending=false;game.side='w';spawnColor='w';resetSelection();save();render()
}
const profile = () => botProfiles[prefs.bot] || botProfiles.fish
const botTitle = () => profile()[0]
const globalPowers = new Set(['hole','convert','delete','control','spawn','expand','rewind'])
const actionNames = {flip:'Reality flip',sidestep:'Illegal sidestep',hole:'Black hole',convert:'Conversion',delete:'Delete',control:'Control',spawn:'Spawn',expand:'Board expansion',rewind:'Time reversal'}
const toolInfo = [
  ['move', 'Move', 'Any square'],
  ['spawn', 'Spawn', 'Add a piece'],
  ['delete', 'Delete', 'Remove piece'],
  ['flip', 'Reality flip', 'Shared 10s cooldown'],
  ['control', 'Control', 'Command enemy pieces'],
  ['convert', 'Conversion', 'Turn enemies into allies'],
  ['double', 'Double turn', 'Two moves before bot'],
  ['rewind', 'Time reversal', 'Rewind up to 5 actions'],
  ['hole', 'Black hole', 'Bend the board'],
  ['expand', 'Board expansion', 'Up to 16 × 16'],
  ['lock','Reality lock','Disable enemy abilities'],
  ['clone','Cloning','Copy any piece anywhere'],
  ['immortal','Immortality','Toggle invincibility'],
  ['freeze','Time freeze','Add 3 skipped bot turns'],
  ['merge','Reality merge','Combine two allies'],
  ['destroy','Board destruction','Remove a square'],
  ['immunity','Checkmate immunity','Keep playing after mate'],
]
const classicOrder = ['p', 'n', 'b', 'r', 'q', 'k']
function save() {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ game, custom, prefs, undo: undoStack, redo: redoStack }),
    )
    storageIssue = false
  } catch {
    storageIssue = true
  }
}
function decorate(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.innerHTML = icon(el.dataset.icon)
}
function cancelBot() {
  epoch++
  clearTimeout(timer)
  engine?.cancel()
  engine = null
}
function resetSelection() {
  selected = null
  powerTarget = null
  notice = ''
}
function checkpoint() {
  pauseDuel()
  annotations = []
  cancelBot()
  undoStack.push(clone(game))
  if (undoStack.length > 60) undoStack.shift()
  redoStack = []
  game.pending = false
  game.botFollowup = false
}
function log(text, by = 'You') {
  const entry = { text, by }
  game.logs.push(entry)
  if (game.logs.length > 300) game.logs.shift()
  return entry
}
// Migrate retained moves before an asynchronous review can update their visible rating.
for(const state of [game,...undoStack,...redoStack])for(const entry of state.logs||[])lockBadge(entry)
let activeReview = null
function warmReview(){
  if(game.result){preanalyzePosition(null,0);return}
  if(activeReview||waitingForRating(game.logs.at(-1)))return
  const actor=game.duel?game.duel.turn:game.pending?other(game.side):game.side
  const ch=orthodox(game,actor)
  if(!ch){preanalyzePosition(null,0);return}
  const moves=ch.moves({verbose:true}),chosen=mode==='move'&&game.b[selected]?.c===actor?moves.filter(m=>m.from===selected).map(m=>m.from+m.to+(m.promotion||'')):[]
  preanalyzePosition(ch.fen(),moves.length,chosen)
}
async function reviewQueue() {
  if (activeReview) return
  const next = nextTrackerReview(game.logs)
  if (!next) return
  const { id, search } = next
  activeReview = compareMove(search.fen, search.played, search.alternatives)
  try {
    const answer = await activeReview.result
    const finalGrade = answer ? engineGrade(search, answer) : {key:'unrated',detail:'Stockfish could not complete its comparison. No rating was guessed.',source:'Engine unavailable'}
    const wasWaiting=game.logs.at(-1)?.id===id&&waitingForRating(game.logs.at(-1))
    for (const snapshot of [game, ...undoStack, ...redoStack]) {
      const entry = snapshot.logs.find((item) => item.id === id)
      if (entry) {
        finishRating(entry,finalGrade)
      }
    }
    save()
    paintReview()
    renderStatus()
    if(game.logs.at(-1)?.id===id){revealGrade(game.logs.at(-1));maybeFinale(game.logs.at(-1))}
    if (modal.open && dialogPage === 'history') showHistory()
    // Hold automatic moves until the previous real rating has appeared.
    if(wasWaiting&&!game.result){
      if(game.duel&&duelRunning)scheduleDuel()
      else if(!game.duel&&game.pending&&!engine)scheduleBot()
    }
  } finally {
    activeReview = null
    if (game.logs.some((item) => item.search)) queueMicrotask(reviewQueue)
    else warmReview()
  }
}

function recordPly(before, action, actor, nextSide, text, by, prepared=null) {
  game.result = game.duel?null:matchOutcome(before, game, actor===game.side && game.doubleTurn ? actor : nextSide)
  if(!game.duel&&isBoss(prefs.bot)&&game.result?.winner===other(game.side)&&bossInfo(game,other(game.side)).turns<BOSS_GRACE)game.result=null
  if(!game.duel&&isBoss(prefs.bot)&&game.result?.winner===game.side&&bossInfo(game,other(game.side)).immune&&bossHasRoyal(game,other(game.side)))game.result=null
  const entry = log(text, by)
  const assessment = reviewAction(before, game, action, actor, game.result)
  annotateAction(entry,before,action,actor,assessment,prepared)
}
// Analyze a chosen bot move while it is still off-screen. Publish only one immutable rating.
async function prepareBotRating(before,after,action,actor,token){
  if(action.power||action.hunterGrade||!orthodox(before,actor))return null
  const assessment=reviewAction(before,after,action,actor,null),search=assessment.search
  if(!search)return null
  const cached=getCachedComparison(search.fen,search.played,search.alternatives)
  if(cached)return {fen:search.fen,played:search.played,grade:engineGrade(search,cached)}
  const job=compareMove(search.fen,search.played,search.alternatives)
  engine=job
  const answer=await job.result
  if(epoch!==token)return null
  if(engine===job)engine=null
  return {fen:search.fen,played:search.played,grade:answer?engineGrade(search,answer):{key:'unrated',detail:'Stockfish review unavailable; no rating was guessed.',source:'Engine unavailable'}}
}
function annotateAction(entry,before,action,actor,assessment=reviewAction(before,game,action,actor,game.result),prepared=null){
  const opponent=game.duel?game.duel[other(actor)]:actor===game.side?prefs.bot:null
  observeEvolution(game,actor,action,before,assessment.legality?.kind,opponent)
  const sq=action.to||action.from||null
  if(action.hunterGrade?.key==='brilliant'&&assessment.search&&assessment.legality?.kind==='legal')assessment={grade:action.hunterGrade,legality:assessment.legality}
  Object.assign(entry,assessment,{id:crypto.randomUUID(),sq,actor,fx:describeEffect(before,game,action,assessment.legality?.kind)})
  entry.fx.promoted=promotedPiece(before,game,action)
  if(preparedRatingMatches(prepared,entry.search))finishRating(entry,prepared.grade)
  if(entry.search){const cached=getCachedComparison(entry.search.fen,entry.search.played,entry.search.alternatives);if(cached)finishRating(entry,engineGrade(entry.search,cached))}
  lockBadge(entry)
  if(entry.search||isBrilliant(entry.badge)||isGreat(entry.badge)||isMate(game.result))entry.tactical=tacticalTrails(before,game,entry,(s,x,y,support)=>geometryAttack(s,x,y,support,movement))
  if(entry.search)reviewQueue()
}
function markEdit(text,action,before=undoStack.at(-1),actor=game.side){
  const entry=log(text);if(before)annotateAction(entry,before,action,actor,reviewAction(before,game,action,actor,null));return entry
}
function gradeChip(entry){
  const d=displayGrade(entry)
  if(!d)return entry?.search?'<span class="grade-chip grade-pending">Analyzing…</span>':entry?.grade?.key==='unrated'?'<span class="grade-chip grade-pending">Unrated</span>':''
  return '<span class="grade-chip grade-'+d.key+'"><i>'+d.mark+'</i>'+esc(d.title)+(d.estimated?' · estimate':'')+'</span>'
}

function startPromotion(piece,id,preview=false){
  const reduced=!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  clearPromotionAftermath(board)
  const result=playPromotion(document.body,piece,{art:(t,c)=>pieceArt(t,c,catalog()),label,preview,reduced,board,size:boardSize(game),view:game.view})
  if(!result)return false
  promotionActive=result.scene
  if(!preview)lastPromotion=id
  finaleUntil=Date.now()+result.duration
  lockPresentation(result.duration+100)
  if(prefs.sound)playPromotionSound(reduced)
  clearTimeout(promotionTimer)
  promotionTimer=setTimeout(()=>{
    result.scene.remove()
    if(promotionActive!==result.scene)return
    promotionActive=null
    if(!reduced&&(preview||game.logs.at(-1)?.id===id))startPromotionAftermath(board,piece,{size:boardSize(game),view:game.view})
    if(!preview&&game.logs.at(-1)?.id===id){
      // Promotion itself is the complete move cinematic; only a terminal mate gets its separate finisher.
      if(!isMate(game.result))lastFinale=id
      maybeFinale(game.logs.at(-1))
      if(game.result)showResultAfterFinale()
      else if(game.duel&&duelRunning)scheduleDuel()
      else if(!game.duel&&game.pending&&!engine)scheduleBot()
    }
  },result.duration)
  return true
}
function maybeFinale(entry=game.logs.at(-1)){
  if(!entry?.id||promotionActive)return
  if(entry.fx?.promoted&&lastPromotion!==entry.id&&prefs.effects&&prefs.cinematic){
    if(startPromotion(entry.fx.promoted,entry.id))return
  }
  if(lastFinale===entry.id)return
  const grade=displayGrade(entry),mate=isMate(game.result)
  if(!canPlayFinale(entry,grade,game.result,prefs))return
  const attack=(from,to)=>movement(game.b,from,to,boardSize(game),game.destroyed||[],true)
  const duration=playFinale(board,game,entry,grade,{size:boardSize(game),view:game.view,art:(t,c)=>pieceArt(t,c,catalog()),attack,paths:{...editPaths(game,entry,attack),links:entry.tactical||tacticalTrails(null,game,entry,(s,x,y,support)=>geometryAttack(s,x,y,support,movement))}})
  if(duration){lastFinale=entry.id;finaleUntil=Date.now()+duration;lockPresentation(duration+40);if(prefs.sound)playFinaleSound(mate)}
}
function previewPromotion(type){
  if(duelBusy||game.pending||waitingForRating(game.logs.at(-1))||promotionActive||Date.now()<finaleUntil){$('preview-status').textContent='Wait for the current move to finish.';return}
  if(game.duel)pauseDuel()
  board.scrollIntoView({block:'nearest',behavior:'instant'})
  startPromotion({t:type,c:game.view,sq:'e'+(game.view==='w'?boardSize(game):1)},'preview-promotion',true)
  $('preview-status').textContent='Promotion preview only; your game is unchanged.'
}
function previewFinale(mate=false,great=false,type='q'){
  if(duelBusy||game.pending||promotionActive||waitingForRating(game.logs.at(-1))||Date.now()<finaleUntil){$('preview-status').textContent='Wait for the current move to finish.';return}
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){$('preview-status').textContent='Your device requests reduced motion. Cinematics are disabled by that accessibility setting.';return}
  if(game.duel)pauseDuel()
  const demo={q:['g4','g7'],r:['h3','h6'],b:['c3','f6'],n:['d6','f7'],p:['g6','g7']}[type]||['g4','g7']
  const state={b:mate?{h8:{c:'b',t:'k'},e5:{c:'w',t:'k'},[demo[1]]:{c:'w',t:type}}:{h8:{c:'b',t:'k'},e2:{c:'w',t:'k'},e8:{c:'b',t:'r'},e7:{c:'w',t:'q'},f2:{c:'w',t:'p'},g7:{c:'b',t:'p'}},result:mate?{winner:'w',reason:'Checkmate'}:null,size:8}
  const entry={id:'preview',actor:'w',sq:mate?demo[1]:'e7',fx:{from:mate?demo[0]:'b4',to:mate?demo[1]:'e7'}}
  const duration=playFinale(board,state,entry,{key:great?'great':'brilliant'},{size:8,view:'w',art:(t,c)=>pieceArt(t,c,catalog()),attack:(from,to)=>movement(state.b,from,to,8,[],true),paths:{move:mate?[]:['c5','d6'],threat:mate?['h8']:['e8'],links:tacticalTrails(null,state,entry,(s,x,y,support)=>geometryAttack(s,x,y,support,movement))},preview:true})
  if(duration){finaleUntil=Date.now()+duration;lockPresentation(duration+40);if(prefs.sound)playFinaleSound(mate);board.scrollIntoView({block:'nearest'});$('preview-status').textContent='Playing a visual demo; your real position and rating are unchanged.'}
}
function showResultAfterFinale(){
  const result=game.result,id=game.logs.at(-1)?.id
  if(!result)return
  clearTimeout(finaleResultTimer)
  const wait=Math.max(0,Math.max(finaleUntil,presentationUntil)-Date.now())
  if(!wait){showResult();return}
  finaleResultTimer=setTimeout(()=>{if(game.result===result&&game.logs.at(-1)?.id===id&&!modal.open)showResult()},wait+30)
}
function revealGrade(entry) {
  if (!entry?.id || !entry.grade || revealed.has(entry.id)) return
  const d=displayGrade(entry);if(!d)return
  revealed.add(entry.id)
  const k=d.key
  if (!prefs.effects || !prefs.cinematic || !['brilliant','illegalBrilliant','illegalMate','winning'].includes(k)) return
  // The chess-edit mode uses the on-square badge burst rather than a large text overlay.
  if(isBrilliant(d)||isMate(game.result)||prefs.editGlow)return
  const {title,mark}=d
  board.querySelector('.grade-cinematic')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'grade-cinematic grade-' + k
  overlay.innerHTML = '<div class="grade-hero"><span>'+mark+'</span><strong>'+title+'</strong>'+(d.estimated?'<small>Sandbox estimate</small>':'')+'</div>'
  board.append(overlay)
  setTimeout(()=>overlay.remove(),1400)
  if (prefs.sound) {
    try {
      const a=unlockSound();if(!a)return
      const notes=k==='blunder'||k==='miss'?[220,140]:[440,660,880]
      notes.forEach((hz,i)=>{
        const o=a.createOscillator(),g=a.createGain(),t=a.currentTime+i*.09
        o.type='triangle';o.frequency.value=hz;o.connect(g);g.connect(a.destination)
        g.gain.setValueAtTime(.055,t);g.gain.exponentialRampToValueAtTime(.001,t+.2)
        o.start(t);o.stop(t+.21)
      })
    } catch {}
  }
}
function gradeGlyph(d){
  // Vector symbols stay crisp and centered at any board size.
  const svg=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+path+'</svg>'
  if(d.key==='best'||d.key==='illegalBest')return svg('<path fill="currentColor" d="m12 1.8 3.2 6.6 7.3 1-5.3 5.2 1.3 7.3-6.5-3.5-6.5 3.5 1.3-7.3L1.5 9.4l7.3-1z"/>')
  if(['excellent','illegalExcellent'].includes(d.key))return svg('<path fill="currentColor" d="M12 1 14.5 9.5 23 12 14.5 14.5 12 23 9.5 14.5 1 12 9.5 9.5Z"/>')
  if(d.key==='book')return svg('<path fill="currentColor" d="M2 4c3-1 6-.6 9 1.4v15c-3-2-6-2.4-9-1.4zm20 0c-3-1-6-.6-9 1.4v15c3-2 6-2.4 9-1.4z"/>')
  if(d.key==='miss'||d.key==='illegalMiss')return svg('<path d="m5 5 14 14M19 5 5 19" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>')
  if(['good','illegalGood'].includes(d.key))return svg('<path d="m4 12 5 5L20 6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>')
  return '<span class="grade-symbol">'+esc(d.mark)+'</span>'
}
function updateBadgeTint(marked){
  const badge=marked&&displayGrade(marked),pin=board.querySelector('.grade-pin,.grade-global')
  const visible=!!(badge&&pin?.dataset.badgeId===marked.id)
  const color=visible?(getComputedStyle(pin).getPropertyValue(prefs.editGlow&&prefs.effects?'--edit-accent':'--grade-bg').trim()||getComputedStyle(pin).getPropertyValue('--grade-bg').trim()):null
  syncBadgeTint($('badge-tint'),visible?badge:null,prefs.badgeTint,color)
}
function paintReview(){
  const last=[...game.logs].reverse().find(item=>item.grade),summary=trackerSummary(game.logs)
  const status=$('tracker-status');if(status)status.textContent='Move Tracker · '+summary.tracked+' tracked · '+summary.legal+' legal · '+summary.illegal+' illegal · '+summary.power+' powers · '+summary.pending+' pending · '+analysisStats().cacheHits+' cached reviews · up to '+analysisStats().reviewWorkers+' parallel reviewers'
  const box=$('move-review')
  box.hidden=!last
  if(last){
    box.innerHTML=gradeChip(last)+'<div><strong>'+esc(last.by+' · '+last.text+(last.legality?' · '+last.legality.kind.toUpperCase():''))+'</strong><p>'+esc(last.search?'Stockfish is reviewing the move.':last.grade.detail+(last.legality?' '+last.legality.reason:'')+(last.grade.quality?' Tactical mark: '+grades[last.grade.quality][0]+'.':''))+'</p></div><small>'+esc(last.search?'Stockfish comparing moves · badge appears when ready':'Detailed review: '+(grades[last.grade.visualKey||last.grade.key]?.[0]||last.grade.key)+' · '+last.grade.source+(Number.isFinite(last.grade.accuracy)?' · '+last.grade.accuracy.toFixed(1)+'% expected-score retention':''))+'</small>'
  }
  const marked=prefs.marks?latestBoardGrade(game.logs):null
  const pulseKey=badgePulseKey(marked)
  // An engine reply must not remove/recreate a visible badge or restart its animation.
  const existing=board.querySelector('.grade-pin,.grade-global')
  if(marked&&existing?.dataset.badgeId===marked.id){updateBadgeTint(marked);return}
  board.querySelectorAll('.grade-pin,.grade-global').forEach(pin=>pin.remove())
  board.querySelectorAll('.rated-square,.rated-origin').forEach(s=>{s.classList.remove('rated-square','rated-origin','rating-edge-top','rating-edge-right');for(const k of Object.keys(grades))s.classList.remove('grade-'+k)})
  clearEditPaths(board)
  if(!prefs.marks||!marked){updateBadgeTint(null);return}
  const d=displayGrade(marked)
  if(!d){updateBadgeTint(null);return}
  const pulse=prefs.effects&&prefs.cinematic&&lastGradePulse!==pulseKey
  lastGradePulse=pulseKey
  const effect=badgeEffect(d.key)
  const latest=game.logs.at(-1)?.id===marked.id
  if(pulse&&latest&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)lockPresentation(1000)
  const editOn=prefs.editGlow&&prefs.effects&&latest
  if(editOn)paintEditPaths(board,game,marked,d,(from,to)=>movement(game.b,from,to,boardSize(game),game.destroyed||[],true))
  const doBurst=()=>{if(editOn&&prefs.cinematic&&lastEditBurst!==marked.id){lastEditBurst=marked.id;burstEdit(board,marked,d,effect)}}
  if(!marked.sq&&marked.fx.power){board.insertAdjacentHTML('beforeend','<div data-badge-id="'+esc(marked.id)+'" class="grade-global grade-'+d.key+' badge-effect-'+effect+(pulse?' grade-global-pulse':'')+'"><b>'+gradeGlyph(d)+'</b><span>'+esc(d.title)+'</span></div>');doBurst();updateBadgeTint(marked);return}
  for(const target of gradeSquares(marked)){
    const square=board.querySelector('[data-sq="'+target.sq+'"]')
    if(!square)continue
    square.classList.add(target.role==='origin'?'rated-origin':'rated-square','grade-'+d.key)
    if(target.role==='origin')continue
    const index=[...board.querySelectorAll('.square')].indexOf(square),size=boardSize(game)
    if(index>=0&&index<size)square.classList.add('rating-edge-top')
    if(index>=0&&index%size===size-1)square.classList.add('rating-edge-right')
    const title=d.title+(d.estimated?' · instant tactical estimate':'')
    square.insertAdjacentHTML('beforeend','<span data-badge-id="'+esc(marked.id)+'" class="grade-pin grade-'+d.key+' badge-effect-'+effect+(pulse?' grade-pulse':'')+'" title="'+esc(title)+'" aria-label="'+esc(title)+'">'+gradeGlyph(d)+'</span>')
  }
  doBurst()
  updateBadgeTint(marked)
}

function resultTitle() {
  if (!game.result.winner) return 'Draw'
  if(game.duel)return duelName(game.result.winner)+' wins!'
  return game.result.winner === game.side ? 'You win!' : 'Bot wins'
}
function showResult() {
  if (!game.result) return
  const result = game.result,
    won = game.duel?!!result.winner:result.winner === game.side
  const last = game.logs.at(-1)
  const detail =
    result.reason === 'Last king taken'
      ? colorName(other(result.winner)) + ' lost its final king.'
      : ['Checkmate','Sandbox checkmate'].includes(result.reason)
        ? colorName(other(result.winner)) + ' has no legal escape from check.'
        : result.reason === 'Both kings lost' ? 'Both sides lost their last king.' : result.reason === 'Resignation' ? 'You resigned the game.' : 'The side to move has no legal move and is outside check.'
  dialog(
    'Game result',
    '<div class="finish-card ' +
      (won ? 'victory' : '') +
      '"><span class="finish-icon" aria-hidden="true">' +
      (result.winner ? '♛' : '½') +
      '</span><h3>' +
      resultTitle() +
      '</h3><strong>' +
      result.reason +
      '</strong><p>' +
      detail +
      '</p>' +
      (last ? '<small>' + esc(last.text) + '</small>' : '') +
      '</div><div class="dialog-actions"><button class="secondary" id="view-board">View board</button><button class="primary" id="rematch">New game ' +
      icon('arrow', 16) +
      '</button></div>',
    'result',
  )
  $('rematch').onclick = game.duel?duelDialog:newGame
  $('view-board').onclick = () => modal.close()
}

// A sound plays once per committed action, not once per repaint or engine badge update.
let lastSounded=game.logs.at(-1)?.id
function chime(){
  const entry=game.logs.at(-1)
  if(!entry?.fx||entry.id===lastSounded)return
  lastSounded=entry.id
  if(!prefs.sound)return
  playEffectSound(entry.fx,{delay:prefs.effects&&entry.fx.travel?.length?Math.round(effectDuration(game.duel?.delay||500)*.72):0,check:!!threatenedKings(game,catalog()).length,win:!!game.result?.winner&&!(prefs.effects&&prefs.cinematic&&isMate(game.result)&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)})
}
function syncSoundButton(){
  const b=$('sound-toggle');if(!b)return
  b.setAttribute('aria-pressed',String(!!prefs.sound));b.setAttribute('aria-label',prefs.sound?'Mute game sound':'Enable game sound');b.title=prefs.sound?'Mute sounds':'Enable sounds'
  b.innerHTML=prefs.sound?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h4l5-4v14l-5-4H3zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h4l5-4v14l-5-4H3zM16 9l5 6m0-6-5 6"/></svg>'
}
function endAction(reply = false) {
  if(reply)markRealityAction(game,'move')
  if(game.duel){pauseDuel();game.duel.positions=[duelKey(game,game.duel.turn)];game.duel.half=0;resetSelection();save();render();return}
  resetSelection()
  const extra = Boolean(reply && game.doubleTurn && !game.result)
  if (extra) {game.doubleTurn--; notice='Extra turn! Make another move before the bot.'}
  if(reply)bossConsumeLock(game,game.side)
  game.pending = Boolean(reply && !extra && prefs.auto && !game.result)
  save()
  render()
  chime()
  if (game.result) showResultAfterFinale()
  else if (game.pending) scheduleBot()
}
function travel(from, to, promotion) {
  const p = game.b[from],
    q = game.b[to]
  if (!p || (mode === 'control' && p.c === game.side)) return
  if(isDestroyed(game,to)||isDivine(q)){notice='That square is destroyed or protected by divine power.';renderStatus();return}
  const possessed = mode === 'control'
  checkpoint()
  move(game, from, to, promotion)
  recordPly(
    undoStack.at(-1),
    { from, to, promotion, ...(possessed ? { power: 'control' } : {}) },
    game.side,
    other(game.side),
    (possessed ? 'Control · ' : '') + label(p.t) +
      ' ' +
      from +
      (q ? ' × ' : ' → ') +
      to +
      (promotion ? ' = ' + label(promotion) : '') +
      (q?.c === p.c ? ' · own capture' : ''),
  )
  endAction(true)
}
function convertAt(sq) {
  const p = game.b[sq]
  if (!p || p.c === game.side||isDivine(p)) {
    notice = 'Choose an enemy piece to convert to your army.'
    renderStatus()
    return
  }
  checkpoint()
  convertPiece(game,sq,game.side)
  recordPly(undoStack.at(-1),{from:sq,to:sq,power:'convert'},game.side,other(game.side),
    'Conversion · '+label(p.t)+' on '+sq+' joins '+colorName(game.side))
  endAction(true)
}
function activateDouble() {
  checkpoint();game.doubleTurn=(game.doubleTurn||0)+1;markEdit('Extra turn added · '+game.doubleTurn+' banked',{power:'double'})
  mode='move';endAction();notice='Double turn armed. Make your first move.';renderStatus()
}
function rewindDialog() {
  if(!undoStack.length){notice='Nothing to reverse yet.';renderStatus();return}
  dialog('Time reversal','<p class="dialog-copy">Restore an earlier board, including captured pieces and board size. Your custom library is kept. The reversal itself can be undone.</p><div class="promos">'+Array.from({length:Math.min(5,undoStack.length)},(_,i)=>'<button data-rewind="'+(i+1)+'">'+(i+1)+' action'+(i?'s':'')+' back</button>').join('')+'</div>','rewind')
  modal.querySelectorAll('[data-rewind]').forEach(b=>b.onclick=()=>{
    const prior=clone(game),old=clone(undoStack.at(-Number(b.dataset.rewind)));checkpoint();game=old;beginRealityTimeline(game);game.pending=false;game.doubleTurn=0;spawnColor=game.side;mode='move';markEdit('Time reversal · restored '+b.dataset.rewind+' action(s)',{power:'rewind'},prior);modal.close();endAction();notice='Timeline restored.';renderStatus();reviewQueue()
  })
}
function expandDialog() {
  const size=boardSize(game)
  dialog('Board expansion','<p class="dialog-copy">Keep every piece on its existing square. Add empty files and ranks to the right and above. Expanded boards use the sandbox bot, not standard Stockfish.</p><div class="promos">'+[12,16].filter(n=>n>size).map(n=>'<button data-expand="'+n+'">'+n+' × '+n+'</button>').join('')+(size===16?'<p>Maximum size reached. Undo to shrink the board.</p>':'')+'</div>','expand')
  modal.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{checkpoint();expandBoard(game,Number(b.dataset.expand));mode='move';markEdit('Board expanded · '+b.dataset.expand+' × '+b.dataset.expand,{power:'expand'});modal.close();endAction()})
}
function castHole(sq) {
  checkpoint()
  blackHole(game,sq)
  recordPly(undoStack.at(-1),{from:sq,to:sq,power:'hole'},game.side,other(game.side),'Black hole · '+sq)
  endAction(true)
}
function selectMode(value) {
  if(Date.now()<finaleUntil||(prefs.effects&&prefs.cinematic&&waitingForRating(game.logs.at(-1))))return
  if(!game.duel&&bossInfo(game,game.side).lock&&value!=='move'){notice='Reality lock · your special tools are temporarily disabled.';renderStatus();return}
  if(game.duel){pauseDuel();if(['double','freeze','lock','immunity','flip'].includes(value)){notice='This turn power is only available in human vs bot mode.';renderStatus();return}}
  if (value === 'rewind') return rewindDialog()
  if(value==='immunity'&&(!game.result||game.result.winner===other(game.side)&&['Checkmate','Sandbox checkmate'].includes(game.result.reason))){checkpoint();const on=toggleCheckmateImmunity(game);if(on&&game.result)game.result=null;mode='move';markEdit('Checkmate immunity · '+(on?'enabled':'disabled'),{power:'immunity'});endAction();return}
  if (game.result) return showResult()
  if (value === 'double') return activateDouble()
  if(value==='freeze'||value==='lock'){
    checkpoint();mode='move'
    const detail=value==='freeze'?'Time freeze · '+freezeBot(game)+' bot turns frozen': 'Reality lock · '+(toggleRealityLock(game)?'active':'disabled')
    markEdit(detail,{power:value});endAction();notice=detail;renderStatus();return
  }
  if (value === 'expand') return expandDialog()
  if (value === 'flip') {
    const remaining=realityFlipRemaining(game);if(remaining){notice='Reality switch cooldown · '+Math.ceil(remaining/1000)+'s';renderStatus();return}
    checkpoint();markRealityAction(game,'flip')
    game.side = other(game.side)
    game.view = game.side
    spawnColor = game.side
    markEdit('Reality flip · now ' + colorName(game.side),{power:'flip'},undoStack.at(-1),other(game.side))
    mode = 'move'
    endAction()
    return
  }
  if (['control','convert','hole','clone','immortal','merge','destroy'].includes(value) && game.pending) {
    cancelBot()
    game.pending = false
    save()
  }
  mode = value
  resetSelection()
  render()
}
function chooseSpawn(t) {
  if (game.result) return showResult()
  spawnType = t
  selectMode('spawn')
  if (modal.open) modal.close()
}
function actOn(sq) {
  if(Date.now()<finaleUntil||(prefs.effects&&prefs.cinematic&&waitingForRating(game.logs.at(-1)))){notice='Finishing move review or cinematic…';renderStatus();return}
  if(game.duel&&(duelRunning||duelBusy)){pauseDuel();renderStatus()}
  if (game.result) return showResult()
  if(isDestroyed(game,sq)){notice='This square has been destroyed. Undo to restore it.';renderStatus();return}
  if(mode==='merge'){
    if(!selected){if(game.b[sq]?.c===game.side){selected=sq;notice='Choose a second friendly piece.';render()}return}
    if(selected===sq){resetSelection();render();return}
    const from=selected,trial=clone(game);if(!mergePieces(trial,from,sq,catalog())){notice='Choose another friendly piece.';renderStatus();return}
    checkpoint();Object.assign(game,{b:trial.b,rights:trial.rights,ep:trial.ep,last:trial.last});markEdit('Reality merge · '+from+' + '+sq,{power:'merge',from,to:sq});endAction();return
  }
  if(mode==='destroy'){
    if(isDivine(game.b[sq])){notice='The God King cannot be destroyed.';renderStatus();return}
    checkpoint();destroySquare(game,sq);recordPly(undoStack.at(-1),{from:sq,to:sq,power:'destroy'},game.side,other(game.side),'Board destruction · '+sq);endAction(true);return
  }
  if(isDivine(game.b[sq])&&(['delete','spawn','immortal','convert'].includes(mode)||(mode==='clone'&&selected))){notice='Divine protection prevents this action.';renderStatus();return}
  if (powerTarget) {
    activatePower(selected, sq, powerTarget)
    return
  }
  if(mode==='immortal'){
    if(!game.b[sq]){notice='Choose any piece, even a king.';renderStatus();return}
    checkpoint();toggleImmortality(game,sq);markEdit('Immortality · '+label(game.b[sq].t)+' '+(game.b[sq].immortal?'protected':'unprotected')+' on '+sq,{power:'immortal',to:sq});endAction();return
  }
  if(mode==='clone'){
    if(!selected){if(game.b[sq]){selected=sq;notice='Choose any other square to clone the piece.';render()}return}
    if(selected===sq){resetSelection();render();return}
    const from=selected;checkpoint();clonePiece(game,from,sq);markEdit('Cloning · '+label(game.b[sq].t)+' '+from+' → '+sq,{power:'clone',from,to:sq});endAction();return
  }
  if (mode === 'hole') return castHole(sq)
  if (mode === 'convert') return convertAt(sq)
  if (mode === 'spawn') {
    checkpoint()
    edit(game, sq, { c: ['godking','overlord','devourer','fusion'].includes(spawnType)?game.side:spawnColor, t: spawnType, ...(spawnType==='godking'?{immortal:true}: {}) })
    markEdit('Spawn ' + colorName(game.b[sq].c).toLowerCase() + ' ' + label(spawnType) + ' · ' + sq,{power:'spawn',to:sq})
    endAction()
    return
  }
  if (mode === 'delete') {
    if (!game.b[sq]) {
      notice = 'Choose an occupied square to delete.'
      renderStatus()
      return
    }
    const name = label(game.b[sq].t)
    checkpoint()
    edit(game, sq, null)
    markEdit('Delete ' + name + ' · ' + sq,{power:'delete',to:sq})
    endAction()
    return
  }
  if (!selected) {
    if (mode === 'control' && game.b[sq]?.c !== other(game.side)) {
      notice = 'Choose an enemy piece to control.'
      renderStatus()
      return
    }
    if (game.b[sq]) {
      selected = sq
      notice = ''
      render()
    }
    return
  }
  if (selected === sq) {
    resetSelection()
    render()
    return
  }
  const from = selected,
    p = game.b[from]
  if (!p) {
    resetSelection()
    render()
    return
  }
  if (p.t === 'p' && sq.slice(1) === (p.c === 'w' ? String(boardSize(game)) : '1')) {
    piecePicker('Promote pawn', 'Choose what your pawn becomes.', p.c, (t) => travel(from, sq, t))
    return
  }
  travel(from, sq)
}
function activatePower(from, to, kind) {
  const trial = clone(game)
  if (!usePower(trial, from, to, kind,catalog())) {
    notice='No valid target for '+(abilities[kind]||kind)+'. '+(powers[kind]||'Choose a highlighted square.')
    renderStatus()
    return
  }
  checkpoint()
  game.b = trial.b
  game.rights = trial.rights
  game.ep = trial.ep
  game.last = trial.last
  recordPly(
    undoStack.at(-1),
    { from, to, power: kind },
    game.side,
    other(game.side),
    abilities[kind] + ' · ' + from + (to ? ' → ' + to : ''),
  )
  endAction(true)
}
function renderBoard() {
  const size=boardSize(game), fs=boardFiles(game), rs=boardRanks(game)
  const order = game.view === 'w' ? [...fs] : [...fs].reverse(),
    rows = game.view === 'w' ? rs : [...rs].reverse()
  board.style.setProperty('--board-size',size)
  board.dataset.size=String(size)
  const checked = new Set(threatenedKings(game,catalog()))
  const entry = game.logs.at(-1)
  const animate = prefs.effects && entry?.fx && entry.id !== lastAnimated
  lastAnimated = entry?.id
  board.dataset.theme = prefs.theme
  board.dataset.editGlow=String(!!(prefs.editGlow&&prefs.effects))
  board.dataset.frozen=String(game.frozenTurns||0)
  board.dataset.locked=String(!!game.realityLock)
  let html = ''
  for (const [ri, r] of rows.entries())
    for (const [fi, f] of order.entries()) {
      const sq = f + r,
        p = game.b[sq],
        dark = (fs.indexOf(f) + r) % 2 === 1
      const title = sq + (p ? ' · ' + colorName(p.c) + ' ' + label(p.t) : ' · empty')
      html +=
        '<button class="square ' +
        (dark ? 'dark ' : '') +
        (selected === sq ? 'selected ' : '') +
        (game.last.includes(sq) ? 'last ' : '') +
        (checked.has(sq) ? 'king-check ' : '') +
        (isDestroyed(game,sq)?'destroyed-square ':'') +
        (p?.immortal||isDivine(p)?'immortal-piece ':'') +
        (p?.c!==game.side && p && game.frozenTurns>0?'frozen-piece ':'') +
        (p?.c!==game.side && p && game.realityLock?'locked-piece ':'') +
        (animate && entry.fx.power && game.last.includes(sq) ? 'power-flash fx-' + entry.fx.power + ' ' : '') +
        (animate && !entry.fx.power && entry.fx.to === sq ? 'piece-arrival ' + (entry.fx.capture ? 'capture-flash ' : '') + (entry.fx.promotion ? 'promotion-flash ' : '') : '') +
        '" aria-label="' +
        esc(title) +
        '" aria-pressed="' +
        (sq === selected) +
        '" data-sq="' +
        sq +
        '" draggable="' +
        Boolean(p && !game.result && (mode === 'move' || (mode === 'control' && p.c !== game.side))) +
        '">' +
        (prefs.coords && fi === 0 ? '<span class="coord rank">' + r + '</span>' : '') +
        (p ? pieceArt(p.t, p.c, catalog()) : '') +
        (prefs.coords && ri === size-1 ? '<span class="coord file">' + f + '</span>' : '') +
        '</button>'
    }
  const scene=board.querySelector('.finale-layer')
  if(scene&&(scene.dataset.action===entry?.id||scene.dataset.action==='preview')&&Date.now()<finaleUntil){
    // Keep the live animation attached so its CSS timeline is not restarted.
    for(const child of [...board.children])if(child!==scene)child.remove()
    board.insertAdjacentHTML('afterbegin',html)
  }else{board.innerHTML=html;if(scene)finaleUntil=0}
  board.dataset.mode = mode
  syncPromotionAftermath(board,size,game.view)
  paintDestinations()
  if(animate){lockPresentation(actionHold(entry.fx,{effects:prefs.effects,reduced:!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}));renderEffects(board,entry.fx,{size,view:game.view,art:(t,c)=>pieceArt(t,c,catalog()),delay:game.duel?.delay||500})}
  paintAnnotations()
}
function paintAnnotations() {
  board.querySelector('.annotations')?.remove()
  if (!annotations.length) return
  const xy = sq => {
    const size=boardSize(game), x=boardFiles(game).indexOf(sq[0]), y=size-Number(sq.slice(1))
    return game.view === 'w' ? [x*100+50,y*100+50] : [(size-1-x)*100+50,(size-1-y)*100+50]
  }
  const lines = annotations.map(([a,b]) => {
    const [x,y]=xy(a), [u,v]=xy(b)
    if(a===b) return '<circle cx="'+x+'" cy="'+y+'" r="41" fill="none" stroke="#f59e0b" stroke-width="9"/>'
    return '<line x1="'+x+'" y1="'+y+'" x2="'+u+'" y2="'+v+'" stroke="#f59e0b" stroke-width="13" stroke-linecap="round" marker-end="url(#arrowhead)"/>'
  }).join('')
  board.insertAdjacentHTML('beforeend','<svg class="annotations" aria-hidden="true" viewBox="0 0 '+boardSize(game)*100+' '+boardSize(game)*100+'"><defs><marker id="arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0 0L4 2L0 4Z" fill="#f59e0b"/></marker></defs>'+lines+'</svg>')
}
function paintDestinations() {
  warmReview()
  const targets = new Set(
    selected && ['move','control'].includes(mode) && !game.result ? destinations(game, selected, powerTarget) : [],
  )
  for (const square of board.children) {
    if (!square.dataset.sq) continue
    const sq = square.dataset.sq,
      piece = game.b[sq],
      target = targets.has(sq)
    square.classList.toggle('selected', sq === selected)
    square.setAttribute('aria-pressed', String(sq === selected))
    square.classList.toggle('move-dot', target && !piece)
    square.classList.toggle('capture-ring', target && !!piece)
    const eligible = !game.result && !!piece && piece.c !== game.side && (mode === 'convert' || (mode === 'control' && !selected))
    square.classList.toggle('convert-target', eligible && mode === 'convert')
    square.classList.toggle('control-target', eligible && mode === 'control')
    square.classList.toggle('possessed', mode === 'control' && sq === selected)

    square.setAttribute(
      'aria-label',
      sq +
        ' · ' +
        (isDestroyed(game,sq)?'destroyed':piece ? colorName(piece.c) + ' ' + label(piece.t) : 'empty') +
        (eligible ? ' · eligible enemy target' : '') + (target ? ' · suggested target' : '') + (square.classList.contains('king-check') ? ' · king under attack' : ''),
    )
  }
}

function abilityCards(p,interactive=false){
  return pieceAbilities(p,catalog()).map(k=>{
    const passive=passiveAbilities.includes(k)
    const active=interactive&&!passive
    return '<div class="ability-card"><div class="ability-head"><strong>'+esc(abilities[k])+'</strong><span class="ability-type">'+(passive?'PASSIVE':'ACTIVE')+'</span></div><p>'+esc(powers[k]||'')+'</p>'+(active?'<button class="power-btn" data-special="use" data-power="'+esc(k)+'">'+icon('star',16)+(powerTarget===k?'Choose target':'Use ability')+'</button>':'')+'</div>'
  }).join('')
}
function renderStatus() {
  const selectedPiece = game.b[selected]
  const hint =
    (game.result ? game.result.reason + ' · Undo to keep playing.' : '') ||
    notice ||
    (powerTarget
      ? 'Choose a highlighted target for ' + abilities[powerTarget] + '. ' + powers[powerTarget]
      : mode === 'merge' ? (selectedPiece?'Choose another friendly piece to fuse.':'Select your first friendly piece.')
      : mode === 'destroy' ? 'Tap a square to permanently remove it. Undo to restore.'
      : mode === 'clone' ? selectedPiece?'Choose any destination, including occupied squares.':'Select any piece to duplicate, including kings.'
      : mode === 'immortal' ? 'Tap any piece to toggle permanent protection from bot captures.'
      : mode === 'hole'
        ? 'Choose any square. Pieces in the center and adjacent squares vanish; the outer ring moves inward. Allies are affected too.'
      : mode === 'control'
        ? selectedPiece ? 'Controlling '+label(selectedPiece.t)+' · choose any destination, even its allies.' : 'Select a highlighted enemy piece to command it for one move.'
        : mode === 'convert'
          ? 'Tap a highlighted enemy to permanently change its color to yours.'
      : mode === 'delete'
        ? 'Tap any piece to remove it.'
        : mode === 'spawn'
          ? 'Tap a square to spawn ' + label(spawnType) + '.'
          : selectedPiece
            ? label(selectedPiece.t) + ' on ' + selected + '. Follow a marker or tap any square.'
            : 'Select a piece to see its moves.')
  $('hint').innerHTML =
    icon(mode === 'move' ? 'move' : mode, 15) +
    '<span>' +
    esc(storageIssue ? 'Device storage is full. This game is playing in memory.' : hint) +
    '</span>'
  const checked = threatenedKings(game,catalog())
  const ownCheck = checked.some(sq=>game.b[sq].c===game.side)
  const enemyCheck = checked.some(sq=>game.b[sq].c!==game.side)
  $('turn').textContent = game.result ? resultTitle() : game.pending ? (presenting()?'Animation playing · bot waiting':'Bot thinking…') : game.frozenTurns>0 ? 'Bot frozen · '+game.frozenTurns+' turns' : game.doubleTurn ? 'Double turn armed' : game.checkmateImmunity?'Checkmate immunity active':ownCheck ? 'Your king in check!' : enemyCheck ? 'Enemy king in check!' : 'Your turn'
  $('turn').parentElement.classList.toggle('check-turn', !!checked.length && !game.result)
  $('match-result').hidden = !game.result
  if (game.result) $('result-summary').textContent = resultTitle() + ' · ' + game.result.reason
  $('bot-name').textContent = botTitle()+' ('+profile()[2]+')'
  $('bot-avatar').src = prefs.bot === 'cat' ? 'art/cat.svg' : prefs.bot === 'gpt' ? 'art/ai-god.svg' : 'art/bot.svg'
  document.querySelector('.bot-tag').textContent = isBoss(prefs.bot)?'UNRESTRICTED':prefs.bot === 'gpt' ? 'AI GOD' : 'BOT'
  const compatible = isEngine(prefs.bot) && orthodox(game, other(game.side))
  $('bot-detail').textContent = (compatible?'Stockfish':'Sandbox engine')+' · '+colorName(other(game.side))+(prefs.bot==='gpt'?' · Limited powers · '+(game.godCooldown>0?'Cooldown '+game.godCooldown:'Ready'):' · No powers')+(game.realityLock?' · Locked':'')+(game.frozenTurns>0?' · Frozen '+game.frozenTurns:'')
  if(isBoss(prefs.bot)){const m=bossInfo(game,other(game.side));$('bot-detail').textContent=(prefs.bot==='evolution'?evolutionLabel(other(game.side)):prefs.bot==='illegal'?'Stockfish + illegal search':'Full sandbox boss')+' · '+(m.turns<BOSS_GRACE?'Grace '+m.turns+'/'+BOSS_GRACE:'Finish unlocked')}
  $('player-side').textContent = colorName(game.side) + ' pieces'
  $('player-name-label').textContent='You';$('player-rating').hidden=false
  if(game.duel){const top=other(game.view),bottom=game.view; $('bot-name').textContent=duelName(top)+' ('+duelProfile(top)[2]+')';$('bot-detail').textContent=colorName(top)+' · '+(game.duel[top]==='evolution'?evolutionLabel(top):isEngine(game.duel[top])?'Stockfish compatible':'Sandbox engine');$('player-name-label').textContent=duelName(bottom)+' ('+duelProfile(bottom)[2]+')';$('player-rating').hidden=true;$('player-side').textContent=colorName(bottom)+' bot'+(game.duel[bottom]==='evolution'?' · '+evolutionLabel(bottom):'');document.querySelector('.bot-tag').textContent='BOT';$('turn').textContent=game.result?resultTitle():colorName(game.duel.turn)+' to move'}
  renderDuel()
  $('side-dot').classList.toggle('black', (game.duel?game.view:game.side) === 'b')
  $('undo').disabled = !undoStack.length
  $('redo').disabled = !redoStack.length
  const infoPiece=selectedPiece||(mode==='spawn'?{t:spawnType,c:spawnColor}:null)
  $('power-area').innerHTML=infoPiece?'<section class="piece-inspector"><div class="inspector-head"><div class="art-box">'+pieceArt(infoPiece.t,infoPiece.c,catalog())+'</div><div><h3>'+esc(label(infoPiece.t))+'</h3><p>'+esc(movementDescription(infoPiece.t))+'</p>'+(infoPiece.traits?.length?'<p>Inherited movement: '+esc(infoPiece.traits.map(t=>names[t]||t).join(', '))+'</p>':'')+'</div></div>'+abilityCards(infoPiece,!!selectedPiece&&selectedPiece.c===game.side&&!game.result)+'<div class="form-row">'+(selectedPiece?'<button class="power-btn" data-special="transform">'+icon('rotate',16)+'Transform piece</button>':'')+(selectedPiece&&selectedPiece.c!==game.side?'<button class="power-btn quick-convert" data-special="convert">'+icon('convert',16)+'Convert to my side</button>':'')+'</div></section>':''
}
function render() {
  clearBossImmunity(game,game.duel?['w','b'].filter(c=>isBoss(game.duel[c])):isBoss(prefs.bot)?[other(game.side)]:[])
  renderBoard()
  renderStatus()
  syncSoundButton()
  chime()
  paintReview()
  const latest = game.logs.at(-1)
  revealGrade(latest)
  maybeFinale(latest)
  $('tool-grid').innerHTML = toolInfo
    .map(
      ([key, name, desc]) =>
        '<button class="tool ' +
        ((key === mode || (key==='double'&&game.doubleTurn)||(key==='immunity'&&game.checkmateImmunity)||(key==='lock'&&game.realityLock)||(key==='freeze'&&game.frozenTurns>0)) ? 'active' : '') +
        '" aria-pressed="' +
        (key === mode || (key==='double'&&!!game.doubleTurn)||(key==='immunity'&&game.checkmateImmunity)||(key==='lock'&&!!game.realityLock)||(key==='freeze'&&game.frozenTurns>0)) +
        '" data-tool="' +
        key +
        '">' +
        icon(key) +
        '<span><strong>' +
        name +
        '</strong><small>' +
        desc +
        '</small></span></button>',
    )
    .join('')
  updateFlipCooldown()
  $('tray').innerHTML = [...classicOrder, ...catalog().filter(item=>item.id!=='fusion').map(item=>item.id)]
    .map(
      (t) =>
        '<button data-spawn="' +
        t +
        '" aria-label="Spawn ' +
        colorName(spawnColor) +
        ' ' +
        label(t) +
        '" title="'+esc(movementDescription(t)+' '+pieceAbilities({t},catalog()).map(k=>abilities[k]+': '+powers[k]).join(' | '))+'" class="' +
        (mode === 'spawn' && spawnType === t ? 'chosen' : '') +
        '">' +
        pieceArt(t, spawnColor, catalog()) +
        esc(label(t)) +
        '</button>',
    )
    .join('')
  document.querySelectorAll('[data-color]').forEach((b) => {
    const on = b.dataset.color === spawnColor
    b.classList.toggle('chosen', on)
    b.setAttribute('aria-pressed', on)
  })
}
async function botMove(token) {
  if (epoch !== token || !game.pending || game.result) return
  if(presenting()||waitingForRating(game.logs.at(-1))){scheduleBot();return}
  if(isBoss(prefs.bot))return bossTurn(token)
  if(consumeBotFreeze(game)){game.pending=false;game.botFollowup=false;log('Time freeze · bot skips turn ('+game.frozenTurns+' remaining)');notice='Bot turn skipped';save();render();return}
  const c = other(game.side), followup=false,
    ch = isEngine(prefs.bot) && !followup ? orthodox(game, c) : null
  let action = prefs.bot==='gpt' ? godPower(game,catalog()) : null,
    by = botTitle(),
    pass = ''
  if (action) { /* validated limited power candidate */ }
  else if (ch) {
    const moves = ch.moves({ verbose: true })
    if (!moves.length) {
      game.result = matchOutcome(game, game, c)
      pass = game.result?.reason || 'No legal move'
    } else {
      engine = isHunter(prefs.bot)?brilliantHunterMove(ch.fen(),moves):stockfishMove(ch.fen(), profile()[3], moves)
      action = await engine.result
      if (epoch !== token) return
      engine = null
      if(isHunter(prefs.bot)&&!action){engine=stockfishMove(ch.fen(),'master',moves);action=await engine.result;if(epoch!==token)return;engine=null}
      if (!action) {
        action = moves.slice().sort((a, b) => Number(b.isCapture()) - Number(a.isCapture()))[0]
        by = 'Reserve bot'
      }
    }
  } else {
    action = sandboxReply(game,catalog(),profile()[3],profile()[1])
    if (isEngine(prefs.bot)) by = botTitle()+' · sandbox fallback'
    if (!action) {
      game.result=sandboxNoMove(game,catalog(),c)
      pass=game.result?.reason||'Pass · no safe moves available'
    }
  }
  if (epoch !== token) return
  let extra=false
  if(action){
    const before={...game,b:{...game.b}}, {from,to,promotion,power}=action, p=game.b[from], q=game.b[to]
    const safe=prefs.bot==='gpt'?godTrial(game,action,c,catalog()):legalBotTrial(game,action,c,catalog())
    if(safe){
      const prepared=await prepareBotRating(before,safe,action,c,token)
      if(epoch!==token)return
      Object.assign(game,safe)
      markRealityAction(game,power||'move')
      extra=false
      if(prefs.bot==='gpt'&&!power&&game.godCooldown>0)game.godCooldown--
      if(globalPowers.has(power)||extra)game.botCooldown=3
      else if(!followup&&game.botCooldown>0)game.botCooldown--
      if(extra)log('Double turn activated',by)
      const description=power
        ? (actionNames[power]||abilities[power]||power)+' · '+(power==='expand'?action.size+' × '+action.size:power==='rewind'?'restored earlier board':power==='spawn'?label(action.type)+' at '+to:from||to||'')+(to&&to!==from&&power!=='spawn'?' → '+to:'')
        : label(p.t)+' '+from+(q?' × ':' → ')+to+(promotion?' = '+label(promotion):'')
      if(power==='flip'){
        spawnColor=game.side;annotations=[]
        annotateAction(log('Reality flip · you now play '+colorName(game.side),by),before,{power:'flip'},c)
      }else recordPly(before,action,c,extra?c:game.side,description,by,prepared)
    }else{pass='Bot action rejected';log(pass,by)}
  }else{log(pass,by);if(!followup&&game.botCooldown>0)game.botCooldown--}
  game.botFollowup=extra&&!game.result
  game.pending=game.botFollowup
  resetSelection()
  notice = pass
  save()
  render()
  chime(true)
  if (game.result) showResultAfterFinale()
  else if(game.botFollowup){notice='Opponent activated Double turn!';renderStatus();scheduleBot()}
  else if (dialogPage === 'history' && modal.open) showHistory()
}
function bossDescription(a,before=game,actor=before.b[a.from]?.c||game.side){const title=({clone:'Cloning',immortal:'Immortality',double:'Double turn',freeze:'Time freeze',lock:'Reality lock',merge:'Reality merge',destroy:'Board destruction',immunity:'Checkmate immunity',transform:'Transform',...actionNames})[a.power]||abilities[a.power]||a.power;return a.power?(title+(a.type?' · '+label(a.type):'')+(a.size?' · '+a.size+' × '+a.size:'')+(a.steps?' · '+a.steps+' actions':'')+(a.from?' · '+a.from:'')+(a.to?' → '+a.to:'')):(classifyAction(before,a,actor).kind==='legal'?'Legal move · ':'Illegal move · ')+a.from+' → '+a.to+(a.promotion?' = '+label(a.promotion):'')}
async function bossTurn(token){
  const id=prefs.bot,actor=other(game.side)
  if(consumeBotFreeze(game)||bossConsumeFreeze(game,actor)){game.pending=false;log('Boss turn frozen',botTitle());save();render();return}
  let suggestion=null
  const ch=['illegal','evolution'].includes(id)?orthodox(game,actor):null
  if(ch){const moves=ch.moves({verbose:true});if(moves.length){engine=stockfishMove(ch.fen(),id==='evolution'?['beginner','medium','hard','max'][evolutionInfo(game,actor).stage]:'max',moves);suggestion=await engine.result;if(epoch!==token)return;engine=null}}
  const before=clone(game)
  const chosen=bossReply(game,actor,id,catalog(),undoStack,suggestion)
  if(epoch!==token)return
  if(!chosen||!canBossRepeat(game,actor,bossActionKind(chosen.action))){game.pending=false;notice='Boss has no available action';save();render();return}
  const action=chosen.action
  const prepared=await prepareBotRating(before,chosen.state,action,actor,token)
  if(epoch!==token)return
  Object.assign(game,chosen.state)
  const count=bossInfo(game,actor).turns
  game.result=count>=BOSS_GRACE?bossOutcome(game,actor,catalog(),action,before):null
  const entry=log(bossDescription(action,before,actor),botTitle()+(id==='illegal'&&suggestion?' · Stockfish-assisted':''))
  annotateAction(entry,before,action,actor,undefined,prepared)
  const extra=action.power==='double'||bossConsumeFreeze(game,game.side)
  game.pending=!!(extra&&!game.result)
  resetSelection();notice=count<BOSS_GRACE?'Boss grace period · '+count+'/'+BOSS_GRACE+' moves':extra?'Boss takes another turn':''
  save();render();chime(true);if(game.result)showResultAfterFinale();else if(game.pending)scheduleBot()
}
function scheduleBot() {
  if(game.duel||waitingForRating(game.logs.at(-1)))return
  cancelBot()
  const token = epoch
  timer = setTimeout(() => {
    botMove(token).catch(() => {
      if (epoch !== token) return
      game.pending = false
      notice = 'Bot turn interrupted. Use Bot move in settings to retry.'
      save()
      render()
    })
  }, nextDelay(440))
}
function restore(direction) {
  const back = direction === 'undo',
    source = back ? undoStack : redoStack,
    destination = back ? redoStack : undoStack
  if (!source.length) return
  pauseDuel();cancelBot()
  annotations = []
  destination.push(clone(game))
  game = source.pop()
  lastAnimated=lastSounded=lastEditBurst=lastFinale=lastPromotion=game.logs.at(-1)?.id
  resetPresentation()
  if(!game.realityTimeline)beginRealityTimeline(game)
  if(game.duel){game.pending=false;duelRunning=false;duelBusy=false}
  spawnColor = game.side
  resetSelection()
  save()
  render()
  if (game.pending && !game.result && !game.duel) scheduleBot()
  reviewQueue()
}
function dialog(title, body, page) {
  dialogPage = page
  $('dialog-title').textContent = title
  $('dialog-content').innerHTML = body
  modal.setAttribute('aria-labelledby', 'dialog-title')
  if (!modal.open) modal.showModal()
  for (const b of document.querySelectorAll('nav [data-nav]'))
    b.classList.toggle(
      'active',
      b.dataset.nav === (['library', 'history'].includes(page) ? page : 'arena'),
    )
}
function piecePicker(title, description, c, onChoose) {
  pauseDuel()
  if (game.pending) cancelBot()
  const types = [...classicOrder, ...catalog().map((k) => k.id)]
  dialog(
    title,
    '<p class="dialog-copy">' +
      esc(description) +
      '</p><div class="promos">' +
      types
        .map(
          (t) =>
            '<button data-pick="' +
            esc(t) +
            '">' +
            pieceArt(t, c, catalog()) +
            esc(label(t)) +
            '</button>',
        )
        .join('') +
      '</div>',
    'pick',
  )
  $('dialog-content')
    .querySelectorAll('[data-pick]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          modal.close()
          onChoose(b.dataset.pick)
        }),
    )
}
function showLibrary() {
  dialog('Piece codex','<p class="dialog-copy">Inspect every custom piece. Active abilities are player-only and unlimited. Passive abilities apply automatically.</p><label class="form-field">Find a piece or ability<input id="codex-search" type="search" placeholder="Search pieces, powers, movement"></label><div class="codex-list" id="codex-list"></div><button class="primary full" id="forge">'+icon('plus',16)+'Create custom piece</button>','library')
  function populate(){
    const query=$('codex-search').value.trim().toLowerCase()
    const rows=catalog().filter(item=>[item.name,movementDescription(item.id),...pieceAbilities({t:item.id},catalog()).flatMap(k=>[abilities[k],powers[k]])].join(' ').toLowerCase().includes(query))
    $('codex-list').innerHTML=rows.map(item=>'<article class="codex-piece"><div class="inspector-head"><div class="art-box">'+pieceArt(item.id,spawnColor,catalog())+'</div><div><h3>'+esc(item.name)+'</h3><p>'+esc(movementDescription(item.id))+'</p></div></div>'+abilityCards({t:item.id})+(item.id==='fusion'?'<p class="dialog-note">Create using Reality merge.</p>':'<button class="option" data-pick="'+esc(item.id)+'">Spawn</button>')+'</article>').join('')||'<p class="dialog-note">No matching pieces.</p>'
    $('codex-list').querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>chooseSpawn(b.dataset.pick))
  }
  $('codex-search').oninput=populate;populate();$('forge').onclick=forge
}
function showHistory() {
  const expanded = new Set(
    [...modal.querySelectorAll('details[open]')].map((el) => el.dataset.entry),
  )
  const rows = game.logs.map((entry, index) => {
    const number = String(index + 1).padStart(2, '0')
    const line =
      '<small>' +
      number +
      '</small><span>' +
      esc(entry.text) +
      '</span>' +
      gradeChip(entry) +
      '<b>' +
      esc(entry.by) +
      '</b>'
    if (!entry.grade) return '<li>' + line + '</li>'
    const detail = entry.search
      ? 'Stockfish is analyzing this position before assigning a badge.'
      : 'Detailed review: '+(grades[entry.grade.visualKey||entry.grade.key]?.[0]||entry.grade.key)+' · '+entry.grade.detail + ' · ' + entry.grade.source+(entry.legality?' · '+entry.legality.kind.toUpperCase()+': '+entry.legality.reason:'')+(entry.grade.quality?' · Tactical mark: '+grades[entry.grade.quality][0]:'')
    return (
      '<li><details data-entry="' +
      esc(entry.id) +
      '" ' +
      (expanded.has(entry.id) ? 'open' : '') +
      '><summary>' +
      line +
      '</summary><p>' +
      esc(detail) +
      '</p></details></li>'
    )
  })
  dialog(
    'Move history',
    rows.length
      ? '<p class="dialog-copy">'+ (()=>{const verified=game.logs.filter(x=>x.by==='You'&&Number.isFinite(x.grade?.accuracy));return verified.length?'Average expected-score retention: '+(verified.reduce((n,x)=>n+x.grade.accuracy,0)/verified.length).toFixed(1)+'% · '+verified.length+' engine-reviewed moves':'No engine-reviewed moves yet.'})() + '</p><ol class="logs">' + rows.reverse().join('') + '</ol>'
      : '<p class="dialog-copy">Your first move or board edit will appear here.</p>',
    'history',
  )
}
function showHelp() {
  const items = [
    [
      'How to win',
      'Checkmate the other side on a standard board, or take its last king with a move or power. If your own last king falls, the bot wins. Spawning, deleting and transforming pieces are setup edits.',
    ],
    [
      'Move review',
      'Stockfish compares ordinary moves with its best line. A brilliant move offers material while keeping a strong evaluation. Move Tracker automatically reviews every completed move by either side. Standard moves are rated by Stockfish before any badge appears. A predictor searches up to four leading moves in advance; a selected-piece agent and a parallel played-move agent reuse exact-position results when available. Cached ratings may appear immediately; uncached ratings wait for the engine. The published expected-points loss bands used by Chess.com are applied to an approximate score conversion. Automatic bot play waits for the badge; the rating is locked once displayed. Custom and illegal positions still use bounded tactical estimates because standard Stockfish cannot understand their rules. Dots and capture rings are legal destinations even for custom pieces; off-target moves get illegal variants. Stockfish reviews compatible legal positions, while legal custom moves use ordinary rating colors with a sandbox estimate. Powers retain distinct event marks and a tactical assessment. Sandbox estimates are labeled separately from verified engine grades. Brilliant engine grades require an engine-supported sacrifice. Illegal tactical ratings are sandbox estimates. Special powers have unique event marks for summoning, time, reality, void, fusion, protection and more. A small built-in opening book identifies common known opening moves. Open Move history for both sides’ grades.',
    ],
    [
      'Move anywhere',
      'Tap a piece to show its usual destinations. Dots mark open squares and rings mark occupied targets. Tap or drag to any square, including unmarked ones. Landing on an occupied square captures its piece, even your own.',
    ],
    [
      'Spawn and delete',
      'Choose a color and a piece in the palette, then tap a square. Delete clears any occupied square. Board edits give you time to set up before the bot replies.',
    ],
    [
      'Reality flip',
      'Trade colors with the bot and put your new army at the bottom. Use the rotate icon under the board to change the view only.',
    ],
    [
      'Custom abilities',
      'Select a custom piece and use its ability under the board. Promote a pawn on its far rank, or use Transform piece to change any piece at any time.',
    ],
    ['Sandbox powers','Double turn skips one automatic bot reply. Time reversal restores an earlier snapshot. Black hole removes the center and surrounding pieces and pulls the outer ring inward. Expand the board to 12 or 16 squares per side; Stockfish is replaced by the sandbox bot.'],
    ['Control & Conversion','Control an enemy piece for one move without changing its color, or convert it permanently to your army. Converting the last enemy king wins. Both actions can be undone.'],
    ['Board effects','Red highlights identify attacked kings. Right-click a square to mark it, or right-drag to draw an arrow. Customize board colors and animations in settings.'],
    [
      'Bot turns',
      'Ordinary bots never use powers, even when controlling a custom piece. They must move legally and protect their king. Each opponent has a different estimated Elo and search strength. OWNER, Illegal Stockfish and EVOLUTION can move illegally and use sandbox powers except Checkmate Immunity, God King creation, and royal immortality. They must win with a legal checkmate after the grace period. GPT (AI GOD) is another exception: up to two pawn spawns, one reality flip, and limited non-capturing sidesteps with a four-turn cooldown. It cannot check a king directly using a power. All other ordinary bots have no powers.'
    ],
  ]
  dialog(
    'How to play',
    '<div class="rules-list">' +
      items.map((v) => '<article><h3>' + v[0] + '</h3><p>' + v[1] + '</p></article>').join('') +
      '</div><h3 class="section-sub">Illegal mark guide</h3><div class="illegal-legend">'+Object.keys(grades).filter(k=>k.startsWith('illegal')||['reality','time','void','summon','fusion','divine','conversion','destruction','chaos','customPower'].includes(k)).map(k=>'<div class="grade-chip grade-'+k+'"><i>'+esc(grades[k][1])+'</i>'+esc(grades[k][0])+'</div>').join('')+'</div><h3 class="section-sub">Keyboard</h3><p class="dialog-note">M move · S spawn · D delete · F reality flip · C control · V conversion · Esc cancel · Ctrl/⌘ Z undo</p><a class="credit-link" href="credits.html" target="_blank" rel="noopener">Game credits ↗</a>',
    'help',
  )
}
function selectOptions(values, current) {
  return values
    .map(
      ([v, name]) =>
        '<option value="' + v + '" ' + (current === v ? 'selected' : '') + '>' + name + '</option>',
    )
    .join('')
}
function botFields(){
  return '<label class="form-field">Opponent · estimated Elo<select id="opponent">'+selectOptions(Object.entries(botProfiles).map(([id,p])=>[id,p[0]+' · '+(isHunter(id)?'Sacrifice search':p[2]+' Elo')+(id==='gpt'?' · AI GOD':'')]),prefs.bot)+'</select></label><p class="dialog-copy">OWNER, Illegal Stockfish and EVOLUTION use sandbox powers except Checkmate Immunity, God King creation and royal immortality, with a seven-boss-move grace period and legal checkmate required. EVOLUTION tracks opponent tactics during the match and evolves from Seed to Apex. GPT / AI GOD has limited powers. Brilliant Hunter searches for sound sacrifices, then plays its best legal move if no brilliant candidate qualifies. Other bots have no powers. Ratings are fictional difficulty targets, not measured Elo.</p>'
}
function readBotFields(){prefs.bot=$('opponent').value;prefs.level=profile()[3]}
function settings() {
  if(game.duel){duelDialog();return}
  dialog(
    'Game settings',
    botFields() +
      [
        ['auto', 'Automatic bot replies'],
        ['coords', 'Board coordinates'],
        ['sound', 'Capture, movement and power sounds'],
        ['effects', 'Animated moves, shattering captures and powers'],
        ['cinematic', 'Cinematic move rating reveals'],
        ['editGlow', 'Chess edit glow, trails and particles'],
        ['badgeTint', 'Persistent screen tint matching the move badge'],
        ['marks','On-board move rating badges'],
      ]
        .map(
          ([k, t]) =>
            '<label class="check-row"><input type="checkbox" id="pref-' +
            k +
            '" ' +
            (prefs[k] ? 'checked' : '') +
            '>' +
            t +
            '</label>',
        )
        .join('') +
      '<label class="form-field">Board theme<select id="theme">' + selectOptions([['green','Classic green'],['wood','Warm wood'],['blue','Midnight blue'],['mono','Monochrome'],['editgray','Chess edits · grayscale'],['editcinema','Chess edits · high contrast']],prefs.theme) + '</select></label><div class="dialog-actions"><button class="secondary" id="bot-now">Bot move now</button><button class="primary" id="apply">Save settings</button></div><div class="dialog-actions"><button class="secondary" id="clear-marks">Clear arrows</button><button class="secondary" id="resign">Resign game</button></div>',
    'settings',
  )
  function apply() {
    cancelBot()
    readBotFields()
    for (const k of ['auto', 'coords', 'sound', 'effects', 'cinematic','marks','editGlow','badgeTint']) prefs[k] = $('pref-' + k).checked
    if(prefs.sound)unlockSound()
    prefs.theme = $('theme').value
    game.pending = game.pending && prefs.auto
    save()
    modal.close()
    render()
  }
  $('apply').onclick = () => {
    apply()
    if (game.pending) scheduleBot()
  }
  $('clear-marks').onclick = () => {annotations=[];paintAnnotations();modal.close()}
  $('resign').disabled = Boolean(game.result)
  $('resign').onclick = () => {
    if(game.result || !confirm('Resign this sandbox game?')) return
    checkpoint()
    game.result = {winner: other(game.side),reason:'Resignation'}
    log('Resigned')
    modal.close()
    endAction()
  }
  $('bot-now').disabled = Boolean(game.result)
  $('bot-now').onclick = () => {
    if (game.result) return showResult()
    apply()
    checkpoint()
    game.pending = true
    save()
    render()
    scheduleBot()
  }
}
function newGame() {
  pauseDuel()
  dialog(
    'New game',
    '<p class="dialog-copy">Set up a fresh board. Your custom pieces stay in the library.</p>' +
      botFields() +
      '<label class="form-field">Play as<select id="new-side">' +
      selectOptions(
        [
          ['w', 'White'],
          ['b', 'Black'],
        ],
        game.side,
      ) +
      '</select></label><div class="dialog-actions"><button class="secondary" id="keep">Keep playing</button><button class="primary" id="start">Start game ' +
      icon('arrow', 16) +
      '</button></div>',
    'new',
  )
  $('keep').onclick = () => modal.close()
  $('start').onclick = () => {
    readBotFields()
    checkpoint()
    resetPresentation()
    game = fresh()
    game.side = $('new-side').value
    game.view = game.side
    spawnColor = game.side
    mode = 'move'
    modal.close()
    endAction(game.side === 'b')
  }
}
async function normalizeImage(file) {
  if (
    !file ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
    file.size > 6 * 1024 * 1024
  )
    throw Error('Choose a PNG, JPEG, WebP or GIF under 6 MB.')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = 128
    cv.height = 128
    const scale = 128 / Math.max(img.width, img.height),
      w = img.width * scale,
      h = img.height * scale
    cv.getContext('2d').drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h)
    return cv.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
function forge() {
  let art = originals[0].art
  dialog(
    'Create custom piece',
    '<form id="forge-form"><label class="form-field">Piece name<input id="piece-name" required maxlength="28" placeholder="Name your piece" autocomplete="off"></label><p class="section-sub">Artwork</p><div class="forge-art">' +
      originals
        .map(
          (p, i) =>
            '<button type="button" aria-label="Use ' +
            p.name +
            ' artwork" data-art="' +
            p.art +
            '" class="' +
            (!i ? 'chosen' : '') +
            '"><img src="' +
            p.art +
            '" alt=""></button>',
        )
        .join('') +
      '</div><label class="form-field">Or upload an image<input id="art-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label class="form-field">Special ability<select id="ability">' +
      selectOptions(Object.entries(abilities).filter(([id])=>!['divine','supremacy','absorption','fusion'].includes(id)), 'radiance') +
      '</select></label><label class="form-field">Bonus ability<select id="bonus-ability">'+selectOptions([['','None'],...Object.entries(abilities).filter(([id])=>!passiveAbilities.includes(id))],'')+'</select></label><p class="dialog-note" id="power-desc"></p><p class="error" id="forge-error" role="status"></p><div class="dialog-actions"><button type="button" class="secondary" id="forge-back">Back</button><button class="primary" type="submit">Create piece</button></div></form>',
    'forge',
  )
  const desc=()=>($('power-desc').textContent=[powers[$('ability').value],powers[$('bonus-ability').value]].filter(Boolean).join(' • '))
  $('bonus-ability').onchange=desc
  desc()
  $('ability').onchange = desc
  $('forge-back').onclick = showLibrary
  document.querySelectorAll('[data-art]').forEach(
    (b) =>
      (b.onclick = () => {
        art = b.dataset.art
        $('art-file').value = ''
        document
          .querySelectorAll('[data-art]')
          .forEach((x) => x.classList.toggle('chosen', x === b))
      }),
  )
  $('art-file').onchange = () => {
    document
      .querySelectorAll('[data-art]')
      .forEach((x) =>
        x.classList.toggle('chosen', !$('art-file').files[0] && art === x.dataset.art),
      )
  }
  $('forge-form').onsubmit = async (e) => {
    e.preventDefault()
    const name = $('piece-name').value.trim(),
      power = $('ability').value,
      submit = e.submitter
    if (!name) {
      $('forge-error').textContent = 'Give your piece a name.'
      return
    }
    submit.disabled = true
    try {
      const file = $('art-file').files[0]
      const source = file ? await normalizeImage(file) : art
      if (!modal.open || dialogPage !== 'forge') return
      const item = { id: 'user-' + crypto.randomUUID(), name, art: source, power, extraPowers:[$('bonus-ability').value].filter(k=>k&&k!==power) }
      custom.push(item)
      save()
      if (storageIssue) {
        custom.pop()
        $('forge-error').textContent = 'Device storage is full. Try a smaller image.'
        return
      }
      showLibrary()
    } catch (error) {
      if ($('forge-error'))
        $('forge-error').textContent = error.message || 'Image could not be loaded.'
    } finally {
      submit.disabled = false
    }
  }
}
board.oncontextmenu = e => e.preventDefault()
board.addEventListener('pointerdown', e => {
  if(e.button===2) arrowStart=e.target.closest('[data-sq]')?.dataset.sq || null
})
window.addEventListener('pointerup', e => {
  if(e.button!==2 || !arrowStart) return
  const from=arrowStart, to=e.target.closest?.('[data-sq]')?.dataset.sq
  arrowStart=null
  if(!to || !board.contains(e.target)) return
  const existing=annotations.findIndex(([a,b])=>a===from&&b===to)
  if(existing>=0) annotations.splice(existing,1)
  else annotations.push([from,to])
  paintAnnotations()
})
board.onclick = (e) => {
  if(annotations.length){annotations=[];paintAnnotations()}
  const b = e.target.closest('[data-sq]')
  if (b) actOn(b.dataset.sq)
}
board.ondragstart = (e) => {
  const b = e.target.closest('[data-sq]')
  if(game.duel&&(duelRunning||duelBusy))pauseDuel()
  if (Date.now()<finaleUntil||(prefs.effects&&prefs.cinematic&&waitingForRating(game.logs.at(-1)))||game.result || !b || !['move','control'].includes(mode) || !game.b[b.dataset.sq] || (mode==='control' && game.b[b.dataset.sq].c===game.side)) {
    e.preventDefault()
    return
  }
  selected = b.dataset.sq
  powerTarget = null
  notice = ''
  paintDestinations()
  renderStatus()
  e.dataTransfer.setData('text/plain', b.dataset.sq)
  e.dataTransfer.effectAllowed = 'move'
}
board.ondragover = (e) => {
  if (['move','control'].includes(mode)) e.preventDefault()
}
board.ondrop = (e) => {
  e.preventDefault()
  const from = e.dataTransfer.getData('text/plain'),
    to = e.target.closest('[data-sq]')?.dataset.sq
  if (['move','control'].includes(mode) && to && game.b[from] && (mode!=='control' || game.b[from].c!==game.side)) {
    selected = from
    powerTarget = null
    actOn(to)
  }
}
$('power-area').onclick = (e) => {
  const cmd = e.target.closest('[data-special]')?.dataset.special,
    p = game.b[selected]
  if (!p || !cmd || game.result) return
  if (cmd === 'convert') return convertAt(selected)
  if (cmd === 'transform') {
    const sq = selected
    if(isDivine(p)){notice='The God King cannot be transformed. Undo to remove it.';renderStatus();return}
    piecePicker(
      'Transform piece',
      'Choose any replacement, including a pawn or a custom piece.',
      p.c,
      (t) => {
        checkpoint()
        edit(game, sq, { c: ['godking','overlord','devourer','fusion'].includes(t)?game.side:p.c, t, ...(t==='godking'?{immortal:true}:{}) })
        markEdit('Transform ' + sq + ' → ' + label(t),{power:'transform',to:sq})
        endAction()
      },
    )
    return
  }
  if(!game.duel&&bossInfo(game,game.side).lock){notice='Reality lock · your abilities are temporarily disabled.';renderStatus();return}
  const kind=e.target.closest('[data-power]')?.dataset.power
  if(cmd!=='use'||p.c!==game.side||!pieceAbilities(p,catalog()).includes(kind)||passiveAbilities.includes(kind))return
  mode='move'
  if(areaAbilities.includes(kind)) activatePower(selected, null, kind)
  else {
    powerTarget = powerTarget===kind?null:kind
    notice = ''
    paintDestinations()
    renderStatus()
  }
}
$('tool-grid').onclick = (e) => {
  const b = e.target.closest('[data-tool]')
  if (b) selectMode(b.dataset.tool)
}
$('tray').onclick = (e) => {
  const b = e.target.closest('[data-spawn]')
  if (b) chooseSpawn(b.dataset.spawn)
}
for (const b of document.querySelectorAll('[data-color]'))
  b.onclick = () => {
    spawnColor = b.dataset.color
    render()
  }
$('feature-spawn').onclick = () => chooseSpawn('illuminator')
for (const b of document.querySelectorAll('[data-nav]'))
  b.onclick = () => {
    const p = b.dataset.nav
    if (p === 'library') showLibrary()
    else if (p === 'history') showHistory()
    else if (modal.open) modal.close()
  }
$('sound-toggle').onclick=()=>{prefs.sound=!prefs.sound;if(prefs.sound){unlockSound();playEffectSound({capture:false})}save();syncSoundButton()}
document.addEventListener('pointerdown',()=>{if(prefs.sound)unlockSound()},{passive:true})
document.addEventListener('keydown',()=>{if(prefs.sound)unlockSound()},{passive:true})
$('undo').onclick = () => restore('undo')
$('redo').onclick = () => restore('redo')
$('rotate').onclick = () => {
  game.view = other(game.view)
  save()
  render()
}
$('help').onclick = showHelp
$('result-details').onclick = showResultAfterFinale
$('settings').onclick = settings
$('bot-config').onclick = settings
$('new').onclick = newGame
$('duel-open').onclick=duelDialog
$('duel-config').onclick=duelDialog
$('duel-toggle').onclick=()=>{if(!game.duel||game.result)return;if(duelRunning){pauseDuel();save();render()}else{duelRunning=true;renderStatus();scheduleDuel()}}
$('duel-step').onclick=()=>{if(!duelRunning)duelStep()}
$('duel-exit').onclick=stopDuel
const godButton = $('play-ai-god')
if (godButton) godButton.onclick = () => { newGame(); $('opponent').value = 'gpt' }
$('play-owner').onclick=()=>{newGame();$('opponent').value='owner'}
$('play-illegal').onclick=()=>{newGame();$('opponent').value='illegal'}
$('dismiss').onclick = () => modal.close()
modal.onclick = (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      modal.close()
  }
}
modal.onclose = () => {
  if (dialogPage === 'pick' && game.pending && !engine) scheduleBot()
  dialogPage = ''
  for (const b of document.querySelectorAll('nav [data-nav]'))
    b.classList.toggle('active', b.dataset.nav === 'arena')
}
document.onkeydown = (e) => {
  if (modal.open || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  const k = e.key.toLowerCase()
  if (e.metaKey || e.ctrlKey) {
    if (k === 'z') {
      e.preventDefault()
      restore(e.shiftKey ? 'redo' : 'undo')
    }
    return
  }
  if (k === 'escape') {
    resetSelection()
    mode = 'move'
    render()
    return
  }
  if (e.repeat) return
  const tool = { m: 'move', s: 'spawn', d: 'delete', f: 'flip', c:'control', v:'convert', t:'double', h:'hole', e:'expand', r:'rewind', l:'lock', x:'clone', i:'immortal', z:'freeze' }[k]
  if (tool) selectMode(tool)
}
decorate()
initMusic($('music-panel'))
initReferenceArt($('reference-panel'))
$('preview-brilliant').onclick=()=>previewFinale(false)
$('preview-great').onclick=()=>previewFinale(false,true)
$('preview-mate').onclick=()=>previewFinale(true,false,$('preview-finisher-piece').value)
document.querySelectorAll('[data-preview-promotion]').forEach(b=>b.onclick=()=>previewPromotion(b.dataset.previewPromotion))
render()
setInterval(updateFlipCooldown,250)
reviewQueue()
if (game.pending && !game.result) scheduleBot()
