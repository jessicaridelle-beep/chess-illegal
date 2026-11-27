import { icon, names, abilities, powers, originals, pieceArt, escapeHtml as esc } from './ui.mjs'
import {
  fresh,
  clone,
  files,
  ranks,
  other,
  colorName,
  orthodox,
  move,
  edit,
  usePower,
  sandboxReply,
  matchOutcome,
  destinations,
  threatenedKings,
  convertPiece,
  boardSize, boardFiles, boardRanks, allSquares, expandBoard, blackHole, xy, legalBotTrial, sandboxNoMove, clonePiece, toggleImmortality, freezeBot, toggleRealityLock, consumeBotFreeze,
} from './game.mjs'
import { stockfishMove, compareMove } from './engine.mjs'
import { grades, reviewMove, engineGrade } from './review.mjs'
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
let prefs = {
  bot: 'fish',
  level: 'balanced',
  auto: true,
  coords: true,
  sound: false,
  effects: true,
  cinematic: true,
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
let lastAnimated = game.logs.at(-1)?.id, annotations = [], arrowStart = null, revealed = new Set(game.logs.filter(x=>!x.search).map(x=>x.id))
const catalog = () => [...originals, ...custom]
const label = (t) => names[t] || catalog().find((x) => x.id === t)?.name || 'Custom piece'
const botProfiles = {cat:['Bytecat','chaos',400,'beginner'],architect:['Architect','adaptive',900,'easy'],guardian:['Aegis','guardian',1500,'medium'],adaptive:['Nexus','adaptive',2200,'hard'],fish:['Stockfish','adaptive',3200,'master']}
const profile = () => botProfiles[prefs.bot] || botProfiles.fish
const botTitle = () => profile()[0]
const globalPowers = new Set(['hole','convert','delete','control','spawn','expand','rewind'])
const actionNames = {hole:'Black hole',convert:'Conversion',delete:'Delete',control:'Control',spawn:'Spawn',expand:'Board expansion',rewind:'Time reversal'}
const toolInfo = [
  ['move', 'Move', 'Any square'],
  ['spawn', 'Spawn', 'Add a piece'],
  ['delete', 'Delete', 'Remove piece'],
  ['flip', 'Reality flip', 'Swap sides'],
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
let activeReview = null
async function reviewQueue() {
  if (activeReview) return
  const next = game.logs.find((entry) => entry.search)
  if (!next) return
  const { id, search } = next
  activeReview = compareMove(search.fen, search.played, search.alternatives)
  try {
    const answer = await activeReview.result
    const finalGrade = answer ? engineGrade(search, answer) : {key:'sandbox',detail:'Engine review unavailable. No verified rating.',source:'Unverified estimate'}
    for (const snapshot of [game, ...undoStack, ...redoStack]) {
      const entry = snapshot.logs.find((item) => item.id === id)
      if (entry) {
        entry.grade = finalGrade
        delete entry.search
      }
    }
    save()
    paintReview()
    revealGrade(game.logs.find(x=>x.id===id))
    if (modal.open && dialogPage === 'history') showHistory()
  } finally {
    activeReview = null
    if (game.logs.some((item) => item.search)) queueMicrotask(reviewQueue)
  }
}

function recordPly(before, action, actor, nextSide, text, by) {
  game.result = matchOutcome(before, game, actor===game.side && game.doubleTurn ? actor : nextSide)
  const entry = log(text, by)
  const assessment = reviewMove(before, game, action, actor, game.result)
  Object.assign(entry, assessment, { id: crypto.randomUUID(), sq: action.to || action.from, fx: { from: action.from, to: action.to, power: action.power, capture: !!before.b[action.to], promotion: !!action.promotion } })
  if (assessment.search) reviewQueue()
}

function gradeChip(entry) {
  if (!entry?.grade) return ''
  if (entry.search) return '<span class="grade-chip grade-pending">Reviewing…</span>'
  const [title, mark] = grades[entry.grade.key]
  return (
    '<span class="grade-chip grade-' + entry.grade.key + '"><i>' + mark + '</i>' + title + '</span>'
  )
}

function revealGrade(entry) {
  if (!entry?.id || !entry.grade || entry.search || revealed.has(entry.id)) return
  revealed.add(entry.id)
  const k = entry.grade.key
  if (!prefs.effects || !prefs.cinematic || !['brilliant','great','blunder','miss','winning'].includes(k)) return
  const [title,mark] = grades[k]
  board.querySelector('.grade-cinematic')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'grade-cinematic grade-' + k
  overlay.innerHTML = '<div class="grade-hero"><span>'+mark+'</span><strong>'+title+'</strong></div>'
  board.append(overlay)
  setTimeout(()=>overlay.remove(),1400)
  if (prefs.sound) {
    try {
      const a=chime.ctx||(chime.ctx=new AudioContext());a.resume().catch(()=>{})
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
function paintReview() {
  const last = [...game.logs].reverse().find((item) => item.grade && item.by === 'You')
  const box = $('move-review')
  box.hidden = !last
  if (last) {
    box.innerHTML =
      gradeChip(last) +
      '<div><strong>' +
      esc(last.text) +
      '</strong><p>' +
      esc(
        last.search ? 'Stockfish is comparing your move with its best line.' : last.grade.detail,
      ) +
      '</p></div><small>' +
      esc(last.search ? '' : last.grade.source + (Number.isFinite(last.grade.accuracy) ? ' · ' + last.grade.accuracy.toFixed(1) + '% expected-score retention' : '')) +
      '</small>'
  }
  board.querySelectorAll('.grade-pin').forEach((pin) => pin.remove())
  // Preserve the player’s marker through the bot reply, unless that reply changed the square.
  const recent = game.logs.slice(-2)
  const marked =
    recent.at(-1)?.by === 'You'
      ? recent.at(-1)
      : recent.at(-1)?.grade && !game.last.includes(recent[0]?.sq)
        ? recent[0]
        : null
  if (!marked?.grade || marked.search || marked.by !== 'You' || !game.b[marked.sq]) return
  const square = board.querySelector('[data-sq="' + marked.sq + '"]')
  const [title, mark] = grades[marked.grade.key]
  if (square)
    square.insertAdjacentHTML(
      'beforeend',
      '<span aria-hidden="true" class="grade-pin grade-' +
        marked.grade.key +
        '" title="' +
        title +
        '">' +
        mark +
        '</span>',
    )
}

function resultTitle() {
  if (!game.result.winner) return 'Draw'
  return game.result.winner === game.side ? 'You win!' : 'Bot wins'
}
function showResult() {
  if (!game.result) return
  const result = game.result,
    won = result.winner === game.side
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
  $('rematch').onclick = newGame
  $('view-board').onclick = () => modal.close()
}

function chime(bot = false) {
  if (!prefs.sound) return
  try {
    const a = chime.ctx || (chime.ctx = new AudioContext())
    a.resume().catch(() => {})
    const o = a.createOscillator(),
      g = a.createGain()
    o.connect(g)
    g.connect(a.destination)
    const fx = game.logs.at(-1)?.fx
    const checked = threatenedKings(game,catalog()).length
    o.frequency.value = checked ? 620 : fx?.power ? 510 : fx?.capture ? 180 : bot ? 270 : 385
    o.frequency.exponentialRampToValueAtTime(o.frequency.value * (fx?.power ? 1.65 : 0.8), a.currentTime + 0.085)
    g.gain.setValueAtTime(0.045, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.09)
    o.start()
    o.stop(a.currentTime + 0.1)
  } catch {}
}
function endAction(reply = false) {
  resetSelection()
  const extra = Boolean(reply && game.doubleTurn && !game.result)
  if (extra) {game.doubleTurn--; notice='Extra turn! Make another move before the bot.'}
  game.pending = Boolean(reply && !extra && prefs.auto && !game.result)
  save()
  render()
  chime()
  if (game.result) showResult()
  else if (game.pending) scheduleBot()
}
function travel(from, to, promotion) {
  const p = game.b[from],
    q = game.b[to]
  if (!p || (mode === 'control' && p.c === game.side)) return
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
  if (!p || p.c === game.side) {
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
  checkpoint();game.doubleTurn=(game.doubleTurn||0)+1;log('Extra turn added · '+game.doubleTurn+' banked')
  mode='move';endAction();notice='Double turn armed. Make your first move.';renderStatus()
}
function rewindDialog() {
  if(!undoStack.length){notice='Nothing to reverse yet.';renderStatus();return}
  dialog('Time reversal','<p class="dialog-copy">Restore an earlier board, including captured pieces and board size. Your custom library is kept. The reversal itself can be undone.</p><div class="promos">'+Array.from({length:Math.min(5,undoStack.length)},(_,i)=>'<button data-rewind="'+(i+1)+'">'+(i+1)+' action'+(i?'s':'')+' back</button>').join('')+'</div>','rewind')
  modal.querySelectorAll('[data-rewind]').forEach(b=>b.onclick=()=>{
    const old=clone(undoStack.at(-Number(b.dataset.rewind)));checkpoint();game=old;game.pending=false;game.doubleTurn=0;spawnColor=game.side;mode='move';log('Time reversal · restored '+b.dataset.rewind+' action(s)');modal.close();endAction();notice='Timeline restored.';renderStatus();reviewQueue()
  })
}
function expandDialog() {
  const size=boardSize(game)
  dialog('Board expansion','<p class="dialog-copy">Keep every piece on its existing square. Add empty files and ranks to the right and above. Expanded boards use the sandbox bot, not standard Stockfish.</p><div class="promos">'+[12,16].filter(n=>n>size).map(n=>'<button data-expand="'+n+'">'+n+' × '+n+'</button>').join('')+(size===16?'<p>Maximum size reached. Undo to shrink the board.</p>':'')+'</div>','expand')
  modal.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{checkpoint();expandBoard(game,Number(b.dataset.expand));mode='move';log('Board expanded · '+b.dataset.expand+' × '+b.dataset.expand);modal.close();endAction()})
}
function castHole(sq) {
  checkpoint()
  blackHole(game,sq)
  recordPly(undoStack.at(-1),{from:sq,to:sq,power:'hole'},game.side,other(game.side),'Black hole · '+sq)
  endAction(true)
}
function selectMode(value) {
  if (value === 'rewind') return rewindDialog()
  if (game.result) return showResult()
  if (value === 'double') return activateDouble()
  if(value==='freeze'||value==='lock'){
    checkpoint();mode='move'
    const detail=value==='freeze'?'Time freeze · '+freezeBot(game)+' bot turns frozen': 'Reality lock · '+(toggleRealityLock(game)?'active':'disabled')
    const entry=log(detail);entry.id=crypto.randomUUID();entry.fx={power:value};endAction();notice=detail;renderStatus();return
  }
  if (value === 'expand') return expandDialog()
  if (value === 'flip') {
    checkpoint()
    game.side = other(game.side)
    game.view = game.side
    spawnColor = game.side
    log('Reality flip · now ' + colorName(game.side))
    mode = 'move'
    endAction()
    return
  }
  if (['control','convert','hole','clone','immortal'].includes(value) && game.pending) {
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
  if (game.result) return showResult()
  if (powerTarget) {
    activatePower(selected, sq, powerTarget)
    return
  }
  if(mode==='immortal'){
    if(!game.b[sq]){notice='Choose any piece, even a king.';renderStatus();return}
    checkpoint();toggleImmortality(game,sq);const entry=log('Immortality · '+label(game.b[sq].t)+' '+(game.b[sq].immortal?'protected':'unprotected')+' on '+sq);entry.id=crypto.randomUUID();entry.fx={power:'immortal',to:sq};endAction();return
  }
  if(mode==='clone'){
    if(!selected){if(game.b[sq]){selected=sq;notice='Choose any other square to clone the piece.';render()}return}
    if(selected===sq){resetSelection();render();return}
    const from=selected;checkpoint();clonePiece(game,from,sq);const entry=log('Cloning · '+label(game.b[sq].t)+' '+from+' → '+sq);entry.id=crypto.randomUUID();entry.fx={power:'clone',from,to:sq};endAction();return
  }
  if (mode === 'hole') return castHole(sq)
  if (mode === 'convert') return convertAt(sq)
  if (mode === 'spawn') {
    checkpoint()
    edit(game, sq, { c: spawnColor, t: spawnType })
    log('Spawn ' + colorName(spawnColor).toLowerCase() + ' ' + label(spawnType) + ' · ' + sq)
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
    log('Delete ' + name + ' · ' + sq)
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
  if (!usePower(trial, from, to, kind)) {
    notice =
      ['radiance','nova'].includes(kind)
        ? abilities[kind] + ' needs an adjacent enemy.'
        : kind === 'echo'
          ? 'Choose an empty neighboring square away from the back ranks.'
          : kind === 'beam'
            ? 'Choose an enemy within four unobstructed straight squares.'
        : kind === 'exchange'
          ? 'Choose another occupied square.'
          : 'Choose a square exactly two steps along a line.'
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
        (p?.immortal?'immortal-piece ':'') +
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
  board.innerHTML = html
  board.dataset.mode = mode
  paintDestinations()
  if (animate && !entry.fx.power && entry.fx.to && entry.fx.from) {
    const target = board.querySelector('[data-sq="'+entry.fx.to+'"]')
    const sign = game.view === 'w' ? 1 : -1
    const dx = (fs.indexOf(entry.fx.from[0])-fs.indexOf(entry.fx.to[0]))*sign
    const dy = (Number(entry.fx.to.slice(1))-Number(entry.fx.from.slice(1)))*sign
    target?.style.setProperty('--move-x', (dx*120)+'%')
    target?.style.setProperty('--move-y', (dy*120)+'%')
  }
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
        (piece ? colorName(piece.c) + ' ' + label(piece.t) : 'empty') +
        (eligible ? ' · eligible enemy target' : '') + (target ? ' · suggested target' : '') + (square.classList.contains('king-check') ? ' · king under attack' : ''),
    )
  }
}

function renderStatus() {
  const selectedPiece = game.b[selected]
  const hint =
    (game.result ? game.result.reason + ' · Undo to keep playing.' : '') ||
    notice ||
    (powerTarget
      ? 'Choose a target for ' + abilities[powerTarget] + '.'
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
  $('turn').textContent = game.result ? resultTitle() : game.pending ? 'Bot thinking…' : game.frozenTurns>0 ? 'Bot frozen · '+game.frozenTurns+' turns' : game.doubleTurn ? 'Double turn armed' : ownCheck ? 'Your king in check!' : enemyCheck ? 'Enemy king in check!' : 'Your turn'
  $('turn').parentElement.classList.toggle('check-turn', !!checked.length && !game.result)
  $('match-result').hidden = !game.result
  if (game.result) $('result-summary').textContent = resultTitle() + ' · ' + game.result.reason
  $('bot-name').textContent = botTitle()+' ('+profile()[2]+')'
  $('bot-avatar').src = prefs.bot === 'cat' ? 'art/cat.svg' : 'art/bot.svg'
  const compatible = prefs.bot === 'fish' && orthodox(game, other(game.side))
  $('bot-detail').textContent = (compatible?'Stockfish':'Sandbox engine')+' · '+colorName(other(game.side))+' · No powers'+(game.realityLock?' · Locked':'')+(game.frozenTurns>0?' · Frozen '+game.frozenTurns:'')
  $('player-side').textContent = colorName(game.side) + ' pieces'
  $('side-dot').classList.toggle('black', game.side === 'b')
  $('undo').disabled = !undoStack.length
  $('redo').disabled = !redoStack.length
  const power = catalog().find((v) => v.id === selectedPiece?.t)?.power
  $('power-area').innerHTML = selectedPiece
    ? '<div class="form-row">' +
      (power
        ? '<button class="power-btn" data-special="use">' +
          icon('star', 16) +
          'Use ' +
          abilities[power] +
          '</button>'
        : '') +
      '<button class="power-btn" data-special="transform">' +
      icon('rotate', 16) +
      'Transform piece</button>' +
      (selectedPiece.c !== game.side ? '<button class="power-btn quick-convert" data-special="convert">'+icon('convert',16)+'Convert to my side</button>' : '') +
      '</div>'
    : ''
}
function render() {
  renderBoard()
  renderStatus()
  paintReview()
  const latest = game.logs.at(-1)
  revealGrade(latest)
  $('tool-grid').innerHTML = toolInfo
    .map(
      ([key, name, desc]) =>
        '<button class="tool ' +
        ((key === mode || (key==='double'&&game.doubleTurn)||(key==='lock'&&game.realityLock)||(key==='freeze'&&game.frozenTurns>0)) ? 'active' : '') +
        '" aria-pressed="' +
        (key === mode || (key==='double'&&!!game.doubleTurn)||(key==='lock'&&!!game.realityLock)||(key==='freeze'&&game.frozenTurns>0)) +
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
  $('tray').innerHTML = [...classicOrder, ...catalog().map(item=>item.id)]
    .map(
      (t) =>
        '<button data-spawn="' +
        t +
        '" aria-label="Spawn ' +
        colorName(spawnColor) +
        ' ' +
        label(t) +
        '" class="' +
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
  if(consumeBotFreeze(game)){game.pending=false;game.botFollowup=false;log('Time freeze · bot skips turn ('+game.frozenTurns+' remaining)');notice='Bot turn skipped';save();render();return}
  const c = other(game.side), followup=false,
    ch = prefs.bot === 'fish' && !followup ? orthodox(game, c) : null
  let action = null,
    by = botTitle(),
    pass = ''
  if (ch) {
    const moves = ch.moves({ verbose: true })
    if (!moves.length) {
      game.result = matchOutcome(game, game, c)
      pass = game.result?.reason || 'No legal move'
    } else {
      engine = stockfishMove(ch.fen(), profile()[3], moves)
      action = await engine.result
      if (epoch !== token) return
      engine = null
      if (!action) {
        action = moves.slice().sort((a, b) => Number(b.isCapture()) - Number(a.isCapture()))[0]
        by = 'Reserve bot'
      }
    }
  } else {
    action = sandboxReply(game,catalog(),profile()[3],profile()[1])
    if (prefs.bot === 'fish') by = 'Stockfish · sandbox fallback'
    if (!action) {
      game.result=sandboxNoMove(game,catalog(),c)
      pass=game.result?.reason||'Pass · no safe moves available'
    }
  }
  if (epoch !== token) return
  let extra=false
  if(action){
    const before={...game,b:{...game.b}}, {from,to,promotion,power}=action, p=game.b[from], q=game.b[to]
    const safe=legalBotTrial(game,action,c,catalog())
    if(safe){
      Object.assign(game,safe)
      extra=false
      if(globalPowers.has(power)||extra)game.botCooldown=3
      else if(!followup&&game.botCooldown>0)game.botCooldown--
      if(extra)log('Double turn activated',by)
      const description=power
        ? (actionNames[power]||abilities[power]||power)+' · '+(power==='expand'?action.size+' × '+action.size:power==='rewind'?'restored earlier board':power==='spawn'?label(action.type)+' at '+to:from||to||'')+(to&&to!==from&&power!=='spawn'?' → '+to:'')
        : label(p.t)+' '+from+(q?' × ':' → ')+to+(promotion?' = '+label(promotion):'')
      recordPly(before,action,c,extra?c:game.side,description,by)
    }else{pass='Bot action rejected';log(pass,by)}
  }else{log(pass,by);if(!followup&&game.botCooldown>0)game.botCooldown--}
  game.botFollowup=extra&&!game.result
  game.pending=game.botFollowup
  resetSelection()
  notice = pass
  save()
  render()
  chime(true)
  if (game.result) showResult()
  else if(game.botFollowup){notice='Opponent activated Double turn!';renderStatus();scheduleBot()}
  else if (dialogPage === 'history' && modal.open) showHistory()
}
function scheduleBot() {
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
  }, 440)
}
function restore(direction) {
  const back = direction === 'undo',
    source = back ? undoStack : redoStack,
    destination = back ? redoStack : undoStack
  if (!source.length) return
  cancelBot()
  annotations = []
  destination.push(clone(game))
  game = source.pop()
  spawnColor = game.side
  resetSelection()
  save()
  render()
  if (game.pending && !game.result) scheduleBot()
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
  dialog(
    'Piece library',
    '<p class="dialog-copy">Spawn an original piece or build one with your own name, artwork, and ability.</p>' +
      catalog()
        .map(
          (item) =>
            '<article class="choice"><div class="art-box">' +
            pieceArt(item.id, spawnColor, catalog()) +
            '</div><div><h3>' +
            esc(item.name) +
            '</h3><p><b>' +
            abilities[item.power] +
            '</b> · ' +
            powers[item.power] +
            '</p></div><button class="option" data-pick="' +
            esc(item.id) +
            '">Spawn</button></article>',
        )
        .join('') +
      '<button class="primary full" id="forge">' +
      icon('plus', 16) +
      'Create custom piece</button>',
    'library',
  )
  $('dialog-content')
    .querySelectorAll('[data-pick]')
    .forEach((b) => (b.onclick = () => chooseSpawn(b.dataset.pick)))
  $('forge').onclick = forge
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
      ? 'Stockfish is analyzing this position.'
      : entry.grade.detail + ' · ' + entry.grade.source
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
      'Stockfish compares ordinary moves with its best line. A brilliant move offers material while keeping a strong evaluation. Freeform moves and powers get a sandbox estimate based on material and immediate threats. Sandbox estimates are labeled separately from verified engine grades. Brilliant requires an engine-supported sacrifice. Open Move history for both sides’ grades.',
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
      'Bots never use powers, even when controlling a custom piece. They must move legally and protect their king. Each opponent has a different estimated Elo and search strength. Only the player can use unlimited cloning, immortality, time freeze, reality lock and other tools.'
    ],
  ]
  dialog(
    'How to play',
    '<div class="rules-list">' +
      items.map((v) => '<article><h3>' + v[0] + '</h3><p>' + v[1] + '</p></article>').join('') +
      '</div><h3 class="section-sub">Keyboard</h3><p class="dialog-note">M move · S spawn · D delete · F reality flip · C control · V conversion · Esc cancel · Ctrl/⌘ Z undo</p><a class="credit-link" href="credits.html" target="_blank" rel="noopener">Game credits ↗</a>',
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
  return '<label class="form-field">Opponent · estimated Elo<select id="opponent">'+selectOptions(Object.entries(botProfiles).map(([id,p])=>[id,p[0]+' · '+p[2]+' Elo']),prefs.bot)+'</select></label><p class="dialog-copy">Only you can use abilities. Ratings are fictional difficulty targets, not measured Elo.</p>'
}
function readBotFields(){prefs.bot=$('opponent').value;prefs.level=profile()[3]}
function settings() {
  dialog(
    'Game settings',
    botFields() +
      [
        ['auto', 'Automatic bot replies'],
        ['coords', 'Board coordinates'],
        ['sound', 'Move sounds'],
        ['effects', 'Animated moves and powers'],
        ['cinematic', 'Cinematic move rating reveals'],
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
      '<label class="form-field">Board theme<select id="theme">' + selectOptions([['green','Classic green'],['wood','Warm wood'],['blue','Midnight blue'],['mono','Monochrome']],prefs.theme) + '</select></label><div class="dialog-actions"><button class="secondary" id="bot-now">Bot move now</button><button class="primary" id="apply">Save settings</button></div><div class="dialog-actions"><button class="secondary" id="clear-marks">Clear arrows</button><button class="secondary" id="resign">Resign game</button></div>',
    'settings',
  )
  function apply() {
    cancelBot()
    readBotFields()
    for (const k of ['auto', 'coords', 'sound', 'effects', 'cinematic']) prefs[k] = $('pref-' + k).checked
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
      selectOptions(Object.entries(abilities), 'radiance') +
      '</select></label><p class="dialog-note" id="power-desc"></p><p class="error" id="forge-error" role="status"></p><div class="dialog-actions"><button type="button" class="secondary" id="forge-back">Back</button><button class="primary" type="submit">Create piece</button></div></form>',
    'forge',
  )
  const desc = () => ($('power-desc').textContent = powers[$('ability').value])
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
      const item = { id: 'user-' + crypto.randomUUID(), name, art: source, power }
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
  if (game.result || !b || !['move','control'].includes(mode) || !game.b[b.dataset.sq] || (mode==='control' && game.b[b.dataset.sq].c===game.side)) {
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
    piecePicker(
      'Transform piece',
      'Choose any replacement, including a pawn or a custom piece.',
      p.c,
      (t) => {
        checkpoint()
        edit(game, sq, { c: p.c, t })
        log('Transform ' + sq + ' → ' + label(t))
        endAction()
      },
    )
    return
  }
  const kind = catalog().find((item) => item.id === p.t)?.power
  if (['radiance','nova'].includes(kind)) activatePower(selected, null, kind)
  else {
    powerTarget = kind
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
$('undo').onclick = () => restore('undo')
$('redo').onclick = () => restore('redo')
$('rotate').onclick = () => {
  game.view = other(game.view)
  save()
  render()
}
$('help').onclick = showHelp
$('result-details').onclick = showResult
$('settings').onclick = settings
$('bot-config').onclick = settings
$('new').onclick = newGame
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
render()
reviewQueue()
if (game.pending && !game.result) scheduleBot()
