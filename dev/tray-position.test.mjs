// Tepsi açılır penceresinin konumu: macOS menü çubuğu, Windows alttaki/üstteki görev çubuğu, ekran kenarı, Linux (konum yok).
// Kullanım: node dev/tray-position.test.mjs
import { buildSync } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-tray-'))
const outfile = path.join(dir, 'tray-position.cjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/tray-position.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'error'
})
const { popupPosition } = createRequire(import.meta.url)(outfile)

let failed = false
const check = (name, actual, expected) => {
  const ok = actual.x === expected.x && actual.y === expected.y
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name} — ${JSON.stringify(actual)}${ok ? '' : ` (beklenen ${JSON.stringify(expected)})`}`
  )
}
const size = { width: 300, height: 200 }
const screen = { x: 0, y: 0, width: 1920, height: 1080 }

check(
  'macOS menu bar: below the icon, centered',
  popupPosition(
    { x: 1200, y: 0, width: 24, height: 24 },
    { x: 0, y: 24, width: 1440, height: 876 },
    size
  ),
  { x: 1062, y: 30 }
)
check(
  'Windows taskbar at the bottom: above the icon',
  popupPosition(
    { x: 1600, y: 1040, width: 24, height: 40 },
    { x: 0, y: 0, width: 1920, height: 1040 },
    size
  ),
  { x: 1462, y: 834 }
)
check(
  'icon near the right edge: kept inside the screen',
  popupPosition(
    { x: 1890, y: 1040, width: 24, height: 40 },
    { x: 0, y: 0, width: 1920, height: 1040 },
    size
  ),
  { x: 1614, y: 834 }
)
check(
  'taskbar at the top: below the icon',
  popupPosition(
    { x: 800, y: 0, width: 24, height: 40 },
    { x: 0, y: 40, width: 1920, height: 1040 },
    size
  ),
  { x: 662, y: 46 }
)
check(
  'unknown icon position (Linux): top right of the work area',
  popupPosition(null, screen, size),
  {
    x: 1614,
    y: 6
  }
)
check(
  'second display on the left: stays on that display',
  popupPosition(
    { x: -300, y: 1040, width: 24, height: 40 },
    { x: -1920, y: 0, width: 1920, height: 1040 },
    size
  ),
  { x: -438, y: 834 }
)

process.exitCode = failed ? 1 : 0
