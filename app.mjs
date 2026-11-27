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
} from './game.mjs'
import { stockfishMove } from './engine.mjs'
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
const catalog = () => [...originals, ...custom]
const label = (t) => names[t] || catalog().find((x) => x.id === t)?.name || 'Custom piece'
const botTitle = () => (prefs.bot === 'cat' ? 'Bytecat' : 'Stockfish')
const toolInfo = [
  ['move', 'Move', 'Any square'],
  ['spawn', 'Spawn', 'Add a piece'],
  ['delete', 'Delete', 'Remove piece'],
  ['flip', 'Reality flip', 'Swap sides'],
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
  cancelBot()
  undoStack.push(clone(game))
  if (undoStack.length > 60) undoStack.shift()
  redoStack = []
  game.pending = false
}
function log(text, by = 'You') {
  game.logs.push({ text, by })
  if (game.logs.length > 300) game.logs.shift()
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
    o.frequency.value = bot ? 270 : 385
    g.gain.setValueAtTime(0.045, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.09)
    o.start()
    o.stop(a.currentTime + 0.1)
  } catch {}
}
function endAction(reply = false) {
  resetSelection()
  game.pending = Boolean(reply && prefs.auto)
  save()
  render()
  chime()
  if (game.pending) scheduleBot()
}
function travel(from, to, promotion) {
  const p = game.b[from],
    q = game.b[to]
  checkpoint()
  move(game, from, to, promotion)
  log(
    label(p.t) +
      ' ' +
      from +
      (q ? ' × ' : ' → ') +
      to +
      (promotion ? ' = ' + label(promotion) : '') +
      (q?.c === p.c ? ' · own capture' : ''),
  )
  endAction(true)
}
function selectMode(value) {
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
  mode = value
  resetSelection()
  render()
}
function chooseSpawn(t) {
  spawnType = t
  selectMode('spawn')
  if (modal.open) modal.close()
}
function actOn(sq) {
  if (powerTarget) {
    activatePower(selected, sq, powerTarget)
    return
  }
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
  if (p.t === 'p' && sq[1] === (p.c === 'w' ? '8' : '1')) {
    piecePicker('Promote pawn', 'Choose what your pawn becomes.', p.c, (t) => travel(from, sq, t))
    return
  }
  travel(from, sq)
}
function activatePower(from, to, kind) {
  const trial = clone(game)
  if (!usePower(trial, from, to, kind)) {
    notice =
      kind === 'radiance'
        ? 'Radiance needs an enemy on a touching square.'
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
  log(abilities[kind] + ' · ' + from + (to ? ' → ' + to : ''))
  endAction(true)
}
function renderBoard() {
  const order = game.view === 'w' ? [...files] : [...files].reverse(),
    rows = game.view === 'w' ? ranks : [...ranks].reverse()
  let html = ''
  for (const [ri, r] of rows.entries())
    for (const [fi, f] of order.entries()) {
      const sq = f + r,
        p = game.b[sq],
        dark = (files.indexOf(f) + r) % 2 === 1
      const title = sq + (p ? ' · ' + colorName(p.c) + ' ' + label(p.t) : ' · empty')
      html +=
        '<button class="square ' +
        (dark ? 'dark ' : '') +
        (selected === sq ? 'selected ' : '') +
        (game.last.includes(sq) ? 'last' : '') +
        '" aria-label="' +
        esc(title) +
        '" aria-pressed="' +
        (sq === selected) +
        '" data-sq="' +
        sq +
        '" draggable="' +
        Boolean(p && mode === 'move') +
        '">' +
        (prefs.coords && fi === 0 ? '<span class="coord rank">' + r + '</span>' : '') +
        (p ? pieceArt(p.t, p.c, catalog()) : '') +
        (prefs.coords && ri === 7 ? '<span class="coord file">' + f + '</span>' : '') +
        '</button>'
    }
  board.innerHTML = html
  board.dataset.mode = mode
}
function renderStatus() {
  const selectedPiece = game.b[selected]
  const hint =
    notice ||
    (powerTarget
      ? 'Choose a target for ' + abilities[powerTarget] + '.'
      : mode === 'delete'
        ? 'Tap any piece to remove it.'
        : mode === 'spawn'
          ? 'Tap a square to spawn ' + label(spawnType) + '.'
          : selectedPiece
            ? label(selectedPiece.t) + ' on ' + selected + ' · choose any square.'
            : 'Select a piece to move it anywhere.')
  $('hint').innerHTML =
    icon(mode === 'move' ? 'move' : mode, 15) +
    '<span>' +
    esc(storageIssue ? 'Device storage is full. This game is playing in memory.' : hint) +
    '</span>'
  $('turn').textContent = game.pending ? 'Bot thinking…' : 'Your turn'
  $('bot-name').textContent = botTitle()
  $('bot-avatar').src = prefs.bot === 'cat' ? 'art/cat.svg' : 'art/bot.svg'
  const compatible = prefs.bot === 'fish' && orthodox(game, other(game.side))
  $('bot-detail').textContent =
    (prefs.bot === 'fish' && !compatible
      ? 'Sandbox engine'
      : prefs.bot === 'cat'
        ? 'Trickster bot'
        : { relaxed: 'Relaxed', balanced: 'Balanced', sharp: 'Sharp' }[prefs.level] + ' engine') +
    ' · ' +
    colorName(other(game.side))
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
      'Transform piece</button></div>'
    : ''
}
function render() {
  renderBoard()
  renderStatus()
  $('tool-grid').innerHTML = toolInfo
    .map(
      ([key, name, desc]) =>
        '<button class="tool ' +
        (key === mode ? 'active' : '') +
        '" aria-pressed="' +
        (key === mode) +
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
  $('tray').innerHTML = classicOrder
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
  if (epoch !== token || !game.pending) return
  const c = other(game.side),
    ch = prefs.bot === 'fish' ? orthodox(game, c) : null
  let action = null,
    by = botTitle(),
    pass = ''
  if (ch) {
    const moves = ch.moves({ verbose: true })
    if (!moves.length)
      pass = ch.isCheckmate()
        ? 'Checkmate · edit the board to continue'
        : 'Stalemate · edit the board to continue'
    else {
      engine = stockfishMove(ch.fen(), prefs.level, moves)
      action = await engine.result
      if (epoch !== token) return
      engine = null
      if (!action) {
        action = moves.slice().sort((a, b) => Number(b.isCapture()) - Number(a.isCapture()))[0]
        by = 'Reserve bot'
      }
    }
  } else {
    action = sandboxReply(game, catalog(), prefs.level, prefs.bot === 'cat')
    if (prefs.bot === 'fish') by = 'Sandbox bot'
    if (!action) pass = 'Pass · no pieces available to move'
  }
  if (epoch !== token) return
  if (action) {
    const { from, to, promotion, power } = action,
      p = game.b[from],
      q = game.b[to]
    if (power) {
      usePower(game, from, to, power)
      log(abilities[power] + ' · ' + from + (to ? ' → ' + to : ''), by)
    } else {
      move(game, from, to, promotion)
      log(
        label(p.t) +
          ' ' +
          from +
          (q ? ' × ' : ' → ') +
          to +
          (promotion ? ' = ' + label(promotion) : ''),
        by,
      )
    }
  } else log(pass, by)
  game.pending = false
  resetSelection()
  notice = pass
  save()
  render()
  chime(true)
  if (dialogPage === 'history' && modal.open) showHistory()
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
  destination.push(clone(game))
  game = source.pop()
  spawnColor = game.side
  resetSelection()
  save()
  render()
  if (game.pending) scheduleBot()
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
  const html = game.logs.length
    ? '<ol class="logs">' +
      game.logs
        .map(
          (v, i) =>
            '<li><small>' +
            String(i + 1).padStart(2, '0') +
            '</small><span>' +
            esc(v.text) +
            '</span><b>' +
            esc(v.by) +
            '</b></li>',
        )
        .reverse()
        .join('') +
      '</ol>'
    : '<p class="dialog-copy">The starting position is ready. Your first move or board edit will appear here.</p>'
  dialog('Move history', html, 'history')
}
function showHelp() {
  const items = [
    [
      'Move anywhere',
      'Tap or drag a piece of either color to any square. Landing on an occupied square captures its piece, even your own.',
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
    [
      'Bot turns',
      'Stockfish plays conventional positions. The sandbox engine handles custom pieces, missing kings, and other unusual positions. Change the bot or request a move in settings.',
    ],
  ]
  dialog(
    'How to play',
    '<div class="rules-list">' +
      items.map((v) => '<article><h3>' + v[0] + '</h3><p>' + v[1] + '</p></article>').join('') +
      '</div><h3 class="section-sub">Keyboard</h3><p class="dialog-note">M move · S spawn · D delete · F reality flip · Esc cancel · Ctrl/⌘ Z undo</p><a class="credit-link" href="credits.html" target="_blank" rel="noopener">Game credits ↗</a>',
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
function botFields() {
  return (
    '<label class="form-field">Opponent<select id="opponent">' +
    selectOptions(
      [
        ['fish', 'Stockfish'],
        ['cat', 'Bytecat · tricky sandbox bot'],
      ],
      prefs.bot,
    ) +
    '</select></label><label class="form-field">Difficulty<select id="level">' +
    selectOptions(
      [
        ['relaxed', 'Relaxed'],
        ['balanced', 'Balanced'],
        ['sharp', 'Sharp'],
      ],
      prefs.level,
    ) +
    '</select></label>'
  )
}
function readBotFields() {
  prefs.bot = $('opponent').value
  prefs.level = $('level').value
}
function settings() {
  dialog(
    'Game settings',
    botFields() +
      [
        ['auto', 'Automatic bot replies'],
        ['coords', 'Board coordinates'],
        ['sound', 'Move sounds'],
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
      '<div class="dialog-actions"><button class="secondary" id="bot-now">Bot move now</button><button class="primary" id="apply">Save settings</button></div>',
    'settings',
  )
  function apply() {
    cancelBot()
    readBotFields()
    for (const k of ['auto', 'coords', 'sound']) prefs[k] = $('pref-' + k).checked
    game.pending = game.pending && prefs.auto
    save()
    modal.close()
    render()
  }
  $('apply').onclick = () => {
    apply()
    if (game.pending) scheduleBot()
  }
  $('bot-now').onclick = () => {
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
board.onclick = (e) => {
  const b = e.target.closest('[data-sq]')
  if (b) actOn(b.dataset.sq)
}
board.ondragstart = (e) => {
  const b = e.target.closest('[data-sq]')
  if (!b || mode !== 'move' || !game.b[b.dataset.sq]) {
    e.preventDefault()
    return
  }
  e.dataTransfer.setData('text/plain', b.dataset.sq)
  e.dataTransfer.effectAllowed = 'move'
}
board.ondragover = (e) => {
  if (mode === 'move') e.preventDefault()
}
board.ondrop = (e) => {
  e.preventDefault()
  const from = e.dataTransfer.getData('text/plain'),
    to = e.target.closest('[data-sq]')?.dataset.sq
  if (mode === 'move' && to && game.b[from]) {
    selected = from
    powerTarget = null
    actOn(to)
  }
}
$('power-area').onclick = (e) => {
  const cmd = e.target.closest('[data-special]')?.dataset.special,
    p = game.b[selected]
  if (!p || !cmd) return
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
  if (kind === 'radiance') activatePower(selected, null, kind)
  else {
    powerTarget = kind
    notice = ''
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
  const tool = { m: 'move', s: 'spawn', d: 'delete', f: 'flip' }[k]
  if (tool) selectMode(tool)
}
decorate()
render()
if (game.pending) scheduleBot()
