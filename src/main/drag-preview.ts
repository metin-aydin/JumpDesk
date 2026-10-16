import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { DragPreviewPayload } from '@shared/api'

/**
 * Sekme pencere dışına sürüklenirken imleçte görünen yarı saydam pencere önizlemesi. Saydam, çerçevesiz, odak almayan
 * ve tıklamaları geçiren ayrı bir penceredir; ilk kullanımda oluşturulur, sonra gizlenip yeniden kullanılır. Bırakınca
 * açılan ayrı pencere önizlemenin yerinde ve boyutunda açılır. Wayland uygulamaların pencere konumlandırmasına izin
 * vermediğinden orada önizleme imleci izlemez; pencereyi bileşik yönetici yerleştirir.
 */
let preview: BrowserWindow | null = null
let ready: Promise<void> | null = null
let pending: { bounds: Rectangle; at: number } | null = null
/** İçerik hazırlanırken gizleme istenirse önizleme gösterilmez. */
let wanted = false

/** İmleç önizlemenin sekme çipinin üstünde durur. */
const GRAB_X = 110
const GRAB_Y = 20
/** Bırakmadan sonra açılan pencerenin önizleme konumunu alabileceği süre. */
const PENDING_MS = 3000
/** Gölgenin sığması için önizleme çerçevesinin çevresindeki saydam pay (sayfadaki `#frame` boşluğu). */
const MARGIN = 8

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>jumpdesk-drag-preview</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none}
#frame{position:absolute;inset:8px;display:flex;flex-direction:column;overflow:hidden;border-radius:10px;opacity:.78;box-shadow:0 14px 40px rgba(0,0,0,.35)}
.bar{display:flex;align-items:center;gap:8px;height:40px;flex:none;padding:0 10px;font-size:12.5px}
.chip{display:flex;align-items:center;gap:6px;height:30px;max-width:70%;padding:0 10px;border-radius:6px;overflow:hidden;white-space:nowrap}
.chip span{overflow:hidden;text-overflow:ellipsis}
.count{flex:none;padding:0 4px;border-radius:3px;font-size:11px;opacity:.7}
.content{flex:1;min-height:0;display:grid;gap:1px}
.pane{display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden}
.pane-title{flex:none;height:24px;line-height:24px;padding:0 8px;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pane-body{flex:1;min-height:0;overflow:hidden;padding:4px 8px;font-family:"JetBrains Mono","DejaVu Sans Mono",monospace;font-size:12px;line-height:1.15}
.pane-body pre{margin:0}
.pane-body img{width:100%;height:100%;object-fit:contain}
</style></head><body><div id="frame"></div></body></html>`

/** Önizleme içeriğini kurar; metinler `textContent` ile, terminal görüntüsü (kaçışlı HTML) `innerHTML` ile yazılır. */
const RENDER = `(p) => {
  const frame = document.getElementById('frame')
  frame.replaceChildren()
  frame.style.background = p.colors.background
  frame.style.color = p.colors.foreground
  frame.style.border = '1px solid ' + p.colors.border
  const bar = document.createElement('div')
  bar.className = 'bar'
  bar.style.background = p.colors.titlebar
  bar.style.borderBottom = '1px solid ' + p.colors.border
  const chip = document.createElement('div')
  chip.className = 'chip'
  chip.style.background = p.colors.tab
  chip.style.boxShadow = '0 0 0 1px ' + p.colors.border
  const dot = document.createElement('i')
  dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:none;background:' + p.colors.primary
  const name = document.createElement('span')
  name.textContent = p.title
  chip.append(dot, name)
  if (p.count) {
    const count = document.createElement('span')
    count.className = 'count'
    count.textContent = String(p.count)
    chip.append(count)
  }
  bar.append(chip)
  const content = document.createElement('div')
  content.className = 'content'
  content.style.background = p.colors.border
  const n = Math.max(1, p.panes.length)
  if (p.mode === 'horizontal') content.style.gridTemplateRows = 'repeat(' + n + ', 1fr)'
  else if (p.mode === 'grid') content.style.gridTemplateColumns = 'repeat(' + Math.ceil(Math.sqrt(n)) + ', 1fr)'
  else content.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)'
  for (const pane of p.panes) {
    const el = document.createElement('div')
    el.className = 'pane'
    el.style.background = pane.background || p.colors.background
    if (p.panes.length > 1) {
      const t = document.createElement('div')
      t.className = 'pane-title'
      t.style.background = p.colors.titlebar
      t.style.color = p.colors.titlebarForeground
      t.textContent = pane.title
      el.append(t)
    }
    const body = document.createElement('div')
    body.className = 'pane-body'
    if (pane.image) {
      const img = document.createElement('img')
      img.src = pane.image
      body.append(img)
    } else if (pane.html) body.innerHTML = pane.html
    el.append(body)
    content.append(el)
  }
  frame.append(bar, content)
}`

function ensure(): { win: BrowserWindow; ready: Promise<void> } {
  if (preview && !preview.isDestroyed() && ready) return { win: preview, ready }
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'jumpdesk-drag-preview',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.setIgnoreMouseEvents(true)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  preview = win
  ready = win
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    .catch(() => undefined)
  win.on('closed', () => {
    preview = null
    ready = null
  })
  return { win, ready }
}

function placeAtCursor(win: BrowserWindow): void {
  const p = screen.getCursorScreenPoint()
  win.setPosition(Math.round(p.x - GRAB_X), Math.round(p.y - GRAB_Y))
}

export function showDragPreview(payload: DragPreviewPayload): void {
  wanted = true
  const { win, ready: loaded } = ensure()
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workAreaSize
  const width = Math.round(Math.min(Math.max(payload.width, 480), area.width) + MARGIN * 2)
  const height = Math.round(Math.min(Math.max(payload.height, 320), area.height) + MARGIN * 2)
  win.setSize(width, height)
  placeAtCursor(win)
  void loaded.then(async () => {
    if (win.isDestroyed()) return
    await win.webContents
      .executeJavaScript(`(${RENDER})(${JSON.stringify(payload)})`)
      .catch(() => undefined)
    if (wanted && !win.isDestroyed() && !win.isVisible()) {
      placeAtCursor(win)
      win.showInactive()
    }
  })
}

export function moveDragPreview(): void {
  if (preview && !preview.isDestroyed() && preview.isVisible()) placeAtCursor(preview)
}

export function hideDragPreview(): void {
  wanted = false
  if (preview && !preview.isDestroyed()) preview.hide()
}

/** Önizleme bırakıldı: konumu ve boyutu, hemen ardından açılacak ayrı pencere için saklanır. */
export function commitDragPreview(): void {
  wanted = false
  if (!preview || preview.isDestroyed()) return
  const b = preview.getBounds()
  pending = {
    bounds: {
      x: b.x + MARGIN,
      y: b.y + MARGIN,
      width: b.width - MARGIN * 2,
      height: b.height - MARGIN * 2
    },
    at: Date.now()
  }
  preview.hide()
}

/** Bırakılan önizlemenin yeri (yakın zamanda bırakıldıysa); bir kez alınır. */
export function takePreviewBounds(): Rectangle | null {
  const p = pending
  pending = null
  return p && Date.now() - p.at < PENDING_MS ? p.bounds : null
}

export function destroyDragPreview(): void {
  if (preview && !preview.isDestroyed()) preview.destroy()
  preview = null
  ready = null
}
