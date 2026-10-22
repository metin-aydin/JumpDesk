// Alarm algılayıcısının birim testi: kabuk yankısı ve parçalı OSC verisi. Kullanım: node dev/alarm-detector.test.mjs
import { build } from 'esbuild'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-alarm-')), 'detector.mjs')
await build({
  entryPoints: [path.join(root, 'src/renderer/src/features/alarms/alarm-detector.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  alias: { '@': path.join(root, 'src/renderer/src') },
  logLevel: 'error'
})
globalThis.localStorage = { getItem: () => null, setItem: () => undefined }
const { AlarmDetector } = await import(out)

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const run = (chunks, echoes = []) => {
  const hits = []
  const d = new AlarmDetector((rule, line) => hits.push(line))
  d.startAfter(0)
  echoes.forEach((e) => d.ignoreEcho(e))
  chunks.forEach((c) => d.feed(c))
  d.dispose()
  return hits
}

const cmd =
  "tail -f /opt/app/servers/app_server1/logs/app_server1.out | sed -e '/ERROR\\|Exception/ s/.*/\\x1b[41;97m&\\x1b[0m/' -e '/INFO/ s/.*/\\x1b[44;97m&\\x1b[0m/'"
const prompt = '\x1b]6973;B;\x07\x1b[1;32mroot@app-server:~$ \x1b[0m'
const wrapAt = (text, width, sep) => text.match(new RegExp(`.{1,${width}}`, 'g')).join(sep)
const bigOsc = `\x1b]6973;K;${Buffer.from('tpm2_shutdown\ntune2fs\n'.repeat(3000)).toString('base64')}\x07`
const pieces = (text, size) => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))

check('plain exception line alarms', run(['java.lang.IllegalStateException: x\n']).length === 1)
check('echo on one line ignored', run([prompt + cmd + '\r\n'], [cmd]).length === 0)
check(
  'echo wrapped with " \\r" ignored',
  run([prompt + wrapAt(cmd, 80, ' \r') + '\r\n'], [cmd]).length === 0
)
check(
  'echo wrapped with "\\r\\n" ignored',
  run([prompt + wrapAt(cmd, 80, '\r\n') + '\r\n'], [cmd]).length === 0
)
const junk = run([...pieces(bigOsc + prompt, 1500), cmd + '\r\n'], [cmd])
check('split OSC payload never becomes text', junk.length === 0, junk[0]?.slice(0, 60))
const junkAlarm = run([...pieces(bigOsc, 1500), 'Caused by: java.lang.NullPointerException\n'])
check(
  'real alarm after split OSC reported clean',
  junkAlarm.length === 1 && junkAlarm[0].startsWith('Caused by'),
  junkAlarm[0]?.slice(0, 60)
)
{
  // Bash istemi pencere boyutu değişince aynı satıra CR ile yeniden çizilir; ardından otomatik komutun yankısı gelir.
  const redraws = Array.from({ length: 12 }, () => '\r\x1b[K[appuser@app-server-02 ~]$ ').join('')
  const hits = run([redraws + cmd + '\r\n'], [cmd])
  check('prompt redraws + auto-run echo ignored', hits.length === 0, hits[0]?.slice(0, 80))
  const real = run(['[appuser@host ~]$ \rjava.lang.IllegalStateException: boom\r\n'])
  check(
    'overwritten line reports what is visible',
    real.length === 1 && real[0].startsWith('java.lang'),
    real[0]
  )
}
check(
  'echo expires, later output alarms',
  run([prompt + cmd + '\r\n', 'IOException later\n'], [cmd]).length === 1
)
{
  const hits = []
  const d = new AlarmDetector((rule, line) => hits.push(line))
  d.feed('early Exception before connect\n')
  d.startAfter(60_000)
  d.feed('Exception during warm-up\n')
  check('no alarms before connect or during warm-up', hits.length === 0, hits.join(' / '))
  d.startAfter(0)
  d.feed('Exception after warm-up\n')
  check('alarms after warm-up', hits.length === 1 && hits[0].includes('after warm-up'))
  d.dispose()
}
{
  // Komutun çıktısı komut metninin bir parçası olabilir (echo); yankı tamamlandıktan sonra gelen çıktı alarmdır.
  const typed = 'sleep 2; echo "IllegalStateException: grup"'
  const out = run([prompt + typed + '\r\n', 'IllegalStateException: grup\r\n'], [typed])
  check('output after echo still alarms', out.length === 1, out.join(' / '))
  const wrapped = run(
    [prompt + wrapAt(cmd, 80, '\r\n') + '\r\n', "sed: -e expression #1: Exception/ s/.*/'\r\n"],
    [cmd]
  )
  check('output after wrapped echo still alarms', wrapped.length === 1, wrapped.join(' / '))
}
{
  // Yavaş sunucuda otomatik komutun yankısı gönderildikten saniyeler sonra gelir.
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  const hits = []
  const d = new AlarmDetector((rule, line) => hits.push(line))
  d.startAfter(0)
  d.ignoreEcho(cmd)
  now += 10_000
  d.feed('[appuser@host ~]$ ' + cmd + '\r\n')
  check('delayed echo (10 s) still ignored', hits.length === 0, hits[0]?.slice(0, 60))
  d.dispose()
  Date.now = realNow
}
{
  // Bağlanınca çalışacak snippetler: gönderilene kadar ve gönderildikten sonra belli süre alarm bildirilmez.
  const realNow = Date.now
  let now = realNow()
  Date.now = () => now
  const hits = []
  const d = new AlarmDetector((rule, line) => hits.push(line))
  d.startAfter(20_000)
  d.hold()
  now += 60_000
  d.feed('Exception while snippets pending (slow connection)\n')
  check('held until auto-run snippets are sent', hits.length === 0, hits.join(' / '))
  d.release(10_000)
  now += 9_000
  d.feed('Exception 9 s after snippets\n')
  check('quiet for 10 s after snippets', hits.length === 0, hits.join(' / '))
  now += 2_000
  d.feed('Exception 11 s after snippets\n')
  check(
    'alarms 10 s after snippets',
    hits.length === 1 && hits[0].includes('11 s'),
    hits.join(' / ')
  )
  d.dispose()

  // Snippetler hızlı gönderilirse bağlantı bekleme süresi yine geçerlidir.
  const early = []
  const e = new AlarmDetector((rule, line) => early.push(line))
  e.startAfter(20_000)
  e.hold()
  now += 1_000
  e.release(10_000)
  now += 12_000
  e.feed('Exception 13 s after connect\n')
  check('connect wait still applies after quick snippets', early.length === 0, early.join(' / '))
  now += 8_000
  e.feed('Exception 21 s after connect\n')
  check('alarms after connect wait', early.length === 1, early.join(' / '))
  e.dispose()
  Date.now = realNow
}
{
  // Bağlam: eşleşen satırdan önceki satırlar, geri silme işlenmiş ve kontrol karakterleri atılmış hâlde
  const got = []
  const d = new AlarmDetector((rule, line, context) => got.push({ line, context }))
  d.startAfter(0)
  d.feed('first line\n')
  d.feed('$ tail -f lo\b\b\b\b\b\b\b\b\b\bcat app.log\x07\n')
  d.feed('java.lang.Exception: boom\n')
  d.dispose()
  check(
    'alarm context has the lines before it, cleaned',
    got.length === 1 && got[0].context.join(' | ') === 'first line | $ cat app.log',
    JSON.stringify(got[0]?.context)
  )
}
process.exitCode = failed ? 1 : 0
