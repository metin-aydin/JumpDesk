// Ctrl+R geçmiş araması (zsh'nin bck-i-search davranışı): eşleşme, geri silmeyle adım adım dönüş, başarısız arama,
// yinelenen komutların atlanması, ileri arama. Kullanım: node dev/history-search.test.mjs
import { build } from 'esbuild'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-hsearch-')), 'search.mjs')
await build({
  entryPoints: [path.join(root, 'src/renderer/src/features/terminal/history-search.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error'
})
const { HistorySearch } = await import(out)

let failed = false
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`}`
  )
}
const view = (s) => ({ ...s.line, status: s.status, mark: s.mark })

// Eskiden yeniye; zsh denemesindeki geçmişle aynı.
const history = ['ls -la', 'mkdir /u01/oracle/security', 'cd /tmp', 'echo mk-two mk', 'cd /tmp']

{
  const s = new HistorySearch(history, { text: 'abc', cursor: 3 })
  check('starts with an empty search below the line', view(s), {
    text: 'abc',
    cursor: 3,
    status: 'bck-i-search: _',
    mark: null
  })
  s.type('m')
  check('newest match, cursor at the match', view(s), {
    text: 'cd /tmp',
    cursor: 5,
    status: 'bck-i-search: m_',
    mark: { start: 5, end: 6 }
  })
  s.type('k')
  check('last occurrence in the line first', view(s).cursor, 12)
  check('extended search moves to an older command', s.line.text, 'echo mk-two mk')
  s.next('backward')
  check('Ctrl+R finds the earlier occurrence in the same line', s.line, {
    text: 'echo mk-two mk',
    cursor: 5
  })
  s.next('backward')
  check('then older commands', s.line, { text: 'mkdir /u01/oracle/security', cursor: 0 })
  s.back()
  s.back()
  s.back()
  check('backspace steps back to the previous match', view(s), {
    text: 'cd /tmp',
    cursor: 5,
    status: 'bck-i-search: m_',
    mark: { start: 5, end: 6 }
  })
  s.back()
  check('deleting everything returns to the original line, not failing', view(s), {
    text: 'abc',
    cursor: 3,
    status: 'bck-i-search: _',
    mark: null
  })
  check('nothing left to delete', s.back(), false)
}

{
  const s = new HistorySearch(history, { text: 'abc', cursor: 3 })
  s.type('c')
  check('the original line is searched first', s.line, { text: 'abc', cursor: 2 })
  s.type('d')
  check('then history', s.line, { text: 'cd /tmp', cursor: 0 })
  check('Ctrl+R past the last match', s.next('backward'), true)
  check('failing search keeps the last match', view(s), {
    text: 'cd /tmp',
    cursor: 0,
    status: 'failing bck-i-search: cd_',
    mark: null
  })
  check('Ctrl+R while failing does nothing', s.next('backward'), false)
  s.type('x')
  check('typing while failing stays failing', s.status, 'failing bck-i-search: cdx_')
  s.back()
  s.back()
  check('backspace leaves the failing state', s.status, 'bck-i-search: cd_')
}

{
  const s = new HistorySearch(history, { text: '', cursor: 0 })
  s.type('zz')
  check('no match from an empty line', view(s), {
    text: '',
    cursor: 0,
    status: 'failing bck-i-search: zz_',
    mark: null
  })
  s.back()
  s.back()
  check('deleting a failing search clears the failure', s.status, 'bck-i-search: _')
}

{
  const s = new HistorySearch(history, { text: '', cursor: 0 })
  s.type('o')
  check('backward search', s.line.text, 'echo mk-two mk')
  s.next('backward')
  s.next('backward')
  check('older', s.line.text, 'mkdir /u01/oracle/security')
  s.next('forward')
  check('Ctrl+S searches forward', s.status, 'fwd-i-search: o_')
  check('back to the newer command', s.line, { text: 'echo mk-two mk', cursor: 3 })
}

{
  const s = new HistorySearch(['df -h', 'ls /a', 'df -h', 'ls /b', 'df -h'], {
    text: '',
    cursor: 0
  })
  s.type('df')
  s.next('backward')
  check('a repeated command is shown once', view(s).status, 'failing bck-i-search: df_')
  const same = new HistorySearch(['ls /a', 'ls /b'], { text: 'ls /b', cursor: 5 })
  same.type('ls')
  same.next('backward')
  check('a command equal to the original line is skipped', same.line, { text: 'ls /a', cursor: 0 })
}

{
  const s = new HistorySearch(history, { text: '', cursor: 0 }, 'tmp')
  check('empty Ctrl+R repeats the previous search', s.next('backward'), true)
  check('previous search text', view(s), {
    text: 'cd /tmp',
    cursor: 4,
    status: 'bck-i-search: tmp_',
    mark: { start: 4, end: 7 }
  })
  const fresh = new HistorySearch(history, { text: '', cursor: 0 })
  check('empty Ctrl+R without a previous search does nothing', fresh.next('backward'), false)
}

process.exitCode = failed ? 1 : 0
