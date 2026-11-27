const outlines = {
  arena:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M3 12h18"/><path fill="currentColor" stroke="none" d="M4 4h8v8H4zm8 8h8v8h-8z"/>',
  library: '<path d="m3 5 5-1v15l-5 1zM10 4h4v15h-4zm6 1 4-1 3 15-4 1z"/>',
  history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-3v5l3 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 .7c0 2-2.5 2.3-2.5 4M12 17h.01"/>',
  settings:
    '<path d="m9 4 1-2h4l1 2 2 1 2-.1 2 3-1 2v3l1 2-2 3-2-.1-2 1-1 3h-4l-1-3-2-1-2 .1-2-3 1-2v-3l-1-2 2-3 2 .1z"/><circle cx="12" cy="11.5" r="3"/>',
  sliders:
    '<path d="M3 7h5m4 0h9M3 17h10m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  move: '<path d="m5 3 14 10-7 1.5-3.5 6.5z"/>',
  spawn:
    '<path d="m12 3 9 5-9 5-9-5zM3 8v8l9 5 9-5V8m-9 5v8"/><path d="M17 3h5m-2.5-2.5v5" stroke-width="2"/>',
  delete: '<path d="M3.5 6h17M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6m4-6v6"/>',
  flip: '<path d="M4 8h14l-4-4m6 12H6l4 4M20 8l-2-2M4 16l2 2"/>',
  rotate: '<path d="M19 8a8 8 0 0 0-14-2L2 10m0-6v6h6m-3 6a8 8 0 0 0 14 2l3-4m0 6v-6h-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  undo: '<path d="M9 4 3 10l6 5m-5-5h10a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',
  redo: '<path d="m15 4 6 6-6 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-14h-8z"/>',
  star: '<path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2a7 7 0 0 1 14 0v2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  code: '<path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/>',
}
export function icon(type, size = 18) {
  return (
    '<svg aria-hidden="true" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    (outlines[type] || '') +
    '</svg>'
  )
}
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
export const names = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }
export const abilities = { radiance: 'Radiance', exchange: 'Phase swap', leap: 'Star leap' }
export const powers = {
  radiance: 'Turn every enemy on a touching square, including diagonals, to your color.',
  exchange: 'Trade squares with any other piece. Both pieces stay on the board.',
  leap: 'Jump two squares in any direction and convert an enemy at the midpoint.',
}
export const originals = [
  { id: 'illuminator', name: 'Illuminator', art: 'art/illuminator.svg', power: 'radiance' },
  { id: 'phantom', name: 'Phantom', art: 'art/phantom.svg', power: 'exchange' },
]
export function pieceArt(type, color, catalog) {
  if (names[type])
    return (
      '<svg class="piece classic" aria-hidden="true" viewBox="0 0 45 45"><use href="art/pieces.svg#' +
      color +
      type.toUpperCase() +
      '"/></svg>'
    )
  const item = catalog.find((p) => p.id === type)
  const url = item?.art || originals[0].art
  return (
    '<span class="piece exotic ' +
    (color === 'b' ? 'dark-piece' : 'light-piece') +
    '"><img src="' +
    escapeHtml(url) +
    '" alt=""><i></i></span>'
  )
}
