// Geliştirme için JumpServer v4.10 taklidi: giriş sayfası, çerez oturumu, ağaç/arama/varlık API'leri,
// connection token ve koko WebSocket terminali (JMS-KOKO protokolü, yerel bash ile).
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import { buildData } from './data.mjs'

const PORT = Number(process.env.MOCK_PORT || 18080)
const PASSWORD = process.env.MOCK_PASSWORD || 'demo'
const ROOT = process.env.MOCK_ROOT || path.join(os.tmpdir(), 'jumpdesk-mock-hosts')
const SHOWCASE = process.env.MOCK_DATA === 'showcase'

const { nodes, assets } = buildData()
const sessions = new Map()
const tokens = new Map()

function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function sessionUser(req) {
  const sid = parseCookies(req).jms_sessionid
  return sid ? sessions.get(sid) : undefined
}

function sameHostOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

const loginPage = (next, error) => `<!doctype html><html><head><meta charset="utf-8"><title>JumpServer</title>
<style>body{font-family:sans-serif;background:#f3f3f4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
form{background:#fff;padding:32px;border-radius:8px;width:300px;box-shadow:0 2px 12px #0001}
input{width:100%;box-sizing:border-box;margin:6px 0 12px;padding:8px}button{width:100%;padding:9px;background:#1ab394;color:#fff;border:0;border-radius:4px}
.err{color:#c00;font-size:13px}</style></head><body>
<form method="post" action="/core/auth/login/?next=${encodeURIComponent(next)}">
<h3>JumpServer (mock)</h3>${error ? `<p class="err">${error}</p>` : ''}
<label>Kullanıcı adı</label><input name="username" autofocus>
<label>Parola</label><input name="password" type="password">
<button type="submit">Giriş</button></form></body></html>`

function treeNode(n, withAmount = true) {
  const name = withAmount ? `${n.value} (${n.amount})` : n.value
  return {
    id: n.key,
    name,
    title: name,
    pId: n.parentKey,
    isParent: true,
    open: true,
    meta: { type: 'node', data: { id: n.id, key: n.key, value: n.value } }
  }
}

function treeAsset(a, pId) {
  return {
    id: a.id,
    name: a.name,
    title: `${a.address}\n${a.comment}`.trim(),
    pId,
    isParent: false,
    open: false,
    iconSkin: a.platformType,
    chkDisabled: !a.isActive,
    meta: {
      type: 'asset',
      data: {
        platform_type: a.platformType,
        org_name: 'Default',
        sftp: a.protocols.some((p) => p.name === 'sftp'),
        name: a.name,
        address: a.address
      }
    }
  }
}

function childrenTree(key) {
  if (key === 'favorite') return assets.filter((a) => a.favorite).map((a) => treeAsset(a, 'favorite'))
  if (key === 'ungrouped') return []
  if (!key) {
    const top = nodes.filter((n) => n.parentKey === '')
    const special = [
      treeNode({ id: 'favorite', key: 'favorite', value: 'Favorite', parentKey: '', amount: assets.filter((a) => a.favorite).length })
    ]
    const out = [...special, ...top.map((n) => treeNode(n))]
    if (top.length === 1) {
      const root = top[0]
      out.push(...nodes.filter((n) => n.parentKey === root.key).map((n) => treeNode(n)))
      out.push(...assets.filter((a) => a.nodeKeys.includes(root.key)).map((a) => treeAsset(a, root.key)))
    }
    return out
  }
  return [
    ...nodes.filter((n) => n.parentKey === key).map((n) => treeNode(n)),
    ...assets.filter((a) => a.nodeKeys.includes(key)).map((a) => treeAsset(a, key))
  ]
}

function assetDetail(a) {
  return {
    id: a.id,
    name: a.name,
    address: a.address,
    zone: null,
    platform: { id: a.platformType === 'windows' ? 5 : 1, name: a.platformName },
    org_id: '00000000-0000-0000-0000-000000000002',
    org_name: 'Default',
    connectivity: { value: 'ok', label: 'Ok' },
    nodes: a.nodeKeys.map((k) => nodes.find((n) => n.key === k)?.id),
    labels: [],
    category: { value: a.category, label: a.category },
    type: { value: a.platformType, label: a.platformType },
    spec_info: {},
    permed_protocols: a.protocols.map((p) => ({ name: p.name, port: p.port, public: true, setting: {} })),
    permed_accounts: a.accounts.map((acc) => ({
      id: acc.id,
      alias: acc.alias,
      name: acc.name,
      username: acc.username,
      has_username: !acc.username.startsWith('@'),
      has_secret: acc.hasSecret,
      secret_type: { value: 'password', label: 'Password' },
      actions: accountActions(acc).map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
      date_expired: '2099/12/31 00:00:00 +0300'
    })),
    is_active: a.isActive,
    date_verified: null,
    date_created: '2026/01/01 00:00:00 +0300',
    comment: a.comment,
    created_by: 'admin'
  }
}

/** `deploy` hesabı dosya yöneticisinde yalnız gezip indirebilir (yükleme ve silme yetkisi yok). */
function accountActions(acc) {
  return acc.username === 'deploy'
    ? ['connect', 'download', 'copy', 'paste']
    : ['connect', 'upload', 'download', 'delete', 'copy', 'paste']
}

function hostHome(a) {
  const home = path.join(ROOT, a.name)
  if (!fs.existsSync(home)) {
    fs.mkdirSync(path.join(home, 'projects', 'api'), { recursive: true })
    fs.mkdirSync(path.join(home, 'logs'), { recursive: true })
    fs.writeFileSync(path.join(home, 'notes.txt'), SHOWCASE ? `Notes for ${a.name}\n` : `${a.name} notları\n`)
    fs.writeFileSync(path.join(home, '.sudo_as_admin_successful'), '')
    fs.mkdirSync(path.join(home, '.mockbin'), { recursive: true })
    fs.writeFileSync(
      path.join(home, '.mockbin', 'hostname'),
      `#!/bin/sh\nif [ "$1" = "-I" ]; then echo "$MOCK_LOCAL_IP 172.17.0.1"; else echo ${a.name}; fi\n`,
      { mode: 0o755 }
    )
    fs.writeFileSync(path.join(home, 'logs', 'app.log'), SHOWCASE ? showcaseLog() : 'INFO started\nWARN slow query\nERROR timeout\n')
    fs.writeFileSync(path.join(home, 'projects', 'api', 'docker-compose.yml'), 'services: {}\n')
    fs.writeFileSync(
      path.join(home, '.bash_history'),
      (SHOWCASE
        ? ['ls', 'cd logs', 'tail -n 40 -f logs/app.log', 'systemctl status nginx', 'journalctl -u orders -f', 'free -m']
        : ['ls -la', 'cd /var/log', 'tail -f syslog', 'systemctl status nginx', 'df -h', 'free -m']
      ).join('\n') + '\n'
    )
    fs.writeFileSync(
      path.join(home, '.bashrc'),
      [
        `export PS1='\\[\\e[32m\\]${a.account}@${a.name}\\[\\e[0m\\]:\\[\\e[34m\\]\\w\\[\\e[0m\\]\\$ '`,
        "alias ls='ls --color=auto'",
        "alias grep='grep --color=auto'",
        'export HISTFILE="$HOME/.bash_history"',
        'shopt -s histappend',
        "PROMPT_COMMAND='history -a'",
        'cd "$HOME"'
      ].join('\n') + '\n'
    )
  }
  return home
}

/** Ekran görüntüleri için örnek uygulama günlüğü: INFO/WARN/ERROR satırları ve bir yığın izi. */
function showcaseLog() {
  const lines = [
    'INFO  [main] c.e.orders.Application - Started Application in 4.21 seconds',
    'INFO  [http-nio-8080-exec-1] c.e.orders.api.OrderController - GET /api/orders 200 (38 ms)',
    'INFO  [http-nio-8080-exec-2] c.e.orders.api.OrderController - POST /api/orders 201 (64 ms)',
    'WARN  [pool-2-thread-3] c.e.orders.db.ConnectionPool - Pool usage at 85% (17/20)',
    'INFO  [http-nio-8080-exec-3] c.e.orders.api.OrderController - GET /api/orders/48213 200 (12 ms)',
    'ERROR [http-nio-8080-exec-4] c.e.orders.api.OrderController - Request failed',
    'java.lang.IllegalStateException: Order 48213 is already closed',
    '\tat com.example.orders.service.OrderService.cancel(OrderService.java:118)',
    '\tat com.example.orders.api.OrderController.cancel(OrderController.java:64)',
    'INFO  [scheduler-1] c.e.orders.jobs.InvoiceJob - Sent 312 invoices',
    'WARN  [http-nio-8080-exec-5] c.e.orders.api.RateLimiter - Client 10.12.0.41 throttled',
    'INFO  [http-nio-8080-exec-6] c.e.orders.api.OrderController - GET /api/orders 200 (41 ms)',
    'INFO  [http-nio-8080-exec-7] c.e.orders.api.HealthController - GET /health 200 (2 ms)'
  ]
  const start = Date.UTC(2026, 9, 16, 11, 2, 11)
  let n = 0
  const stamped = lines.map((l) => {
    if (!/^[A-Z]{4,5} /.test(l)) return l
    return `${new Date(start + n++ * 1370).toISOString().replace('T', ' ').slice(0, 23)} ${l}`
  })
  return stamped.join('\n') + '\n'
}

function spawnShell(a, cols, rows) {
  const home = hostHome(a)
  return pty.spawn('bash', ['--rcfile', path.join(home, '.bashrc'), '-i'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: home,
    env: {
      ...process.env,
      HOME: home,
      TERM: 'xterm-256color',
      MOCK_LOCAL_IP: a.localIp,
      PATH: `${path.join(home, '.mockbin')}:${process.env.PATH}`,
      HISTCONTROL: 'ignoreboth'
    }
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname
  const user = sessionUser(req)

  if (p === '/core/auth/login/' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Set-Cookie': [`jms_csrftoken=${crypto.randomBytes(16).toString('hex')}; Path=/; SameSite=Lax`]
    })
    return res.end(loginPage(url.searchParams.get('next') || '/luna/'))
  }
  if (p === '/core/auth/login/' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req))
    const next = url.searchParams.get('next') || '/luna/'
    if (!form.get('username') || form.get('password') !== PASSWORD) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(loginPage(next, 'Kullanıcı adı veya parola hatalı'))
    }
    const sid = crypto.randomBytes(16).toString('hex')
    const username = form.get('username')
    sessions.set(sid, { id: crypto.randomUUID(), username, name: username, email: `${username}@example.com` })
    res.writeHead(302, {
      Location: next,
      'Set-Cookie': [
        `jms_sessionid=${sid}; HttpOnly; Max-Age=86400; Path=/; SameSite=Lax`,
        `jms_csrftoken=${crypto.randomBytes(16).toString('hex')}; Path=/; SameSite=Lax`,
        'SESSION_COOKIE_NAME_PREFIX=jms_; Path=/'
      ]
    })
    return res.end()
  }
  if (p === '/core/auth/logout/') {
    const sid = parseCookies(req).jms_sessionid
    sessions.delete(sid)
    res.writeHead(302, { Location: '/core/auth/login/', 'Set-Cookie': 'jms_sessionid=; Max-Age=0; Path=/' })
    return res.end()
  }
  if (p === '/luna/') {
    if (!user) {
      res.writeHead(302, { Location: `/core/auth/login/?next=${encodeURIComponent(p)}` })
      return res.end()
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end('<h1>Luna (mock)</h1>')
  }
  if (p === '/media/avatar/mock.png') {
    if (!user) return json(res, 401, { detail: 'not authenticated' })
    res.writeHead(200, { 'Content-Type': 'image/png' })
    return res.end(fs.readFileSync(new URL('../../resources/icon.png', import.meta.url)))
  }
  if (p === '/api/health/') return json(res, 200, { status: true, db_status: true, redis_status: true, time: Date.now() / 1000 })
  if (p === '/api/v1/settings/public/open/') return json(res, 200, { XPACK_ENABLED: false, INTERFACE: { login_title: 'JumpServer' } })

  if (!p.startsWith('/api/v1/')) return json(res, 404, { detail: 'Not found' })
  if (!user) return json(res, 401, { detail: 'Authentication credentials were not provided.', code: 'not_authenticated' })
  if (req.method !== 'GET' && req.headers['x-csrftoken'] !== parseCookies(req).jms_csrftoken) {
    return json(res, 403, { detail: 'CSRF Failed: CSRF token missing or incorrect.' })
  }
  if (req.method !== 'GET' && !sameHostOrigin(req)) {
    return json(res, 403, { detail: `CSRF Failed: Origin checking failed - ${req.headers.origin} does not match any trusted origins.` })
  }

  if (p === '/api/v1/users/profile/') {
    return json(res, 200, { ...user, avatar_url: '/media/avatar/mock.png', mfa_enabled: false, is_expired: false, need_update_password: false })
  }
  if (p === '/api/v1/users/profile/permissions/') {
    return json(res, 200, {
      workbench_orgs: [{ id: '00000000-0000-0000-0000-000000000002', name: 'Default', is_default: true, is_root: false, is_system: false }],
      perms: ['perms.view_myassets']
    })
  }
  if (p === '/api/v1/settings/public/') {
    return json(res, 200, {
      XPACK_ENABLED: false,
      TERMINAL_KOKO_SSH_ENABLED: true,
      TERMINAL_RAZOR_ENABLED: false,
      CONNECTION_TOKEN_REUSABLE: false,
      SECURITY_MAX_IDLE_TIME: 30,
      SECURITY_WATERMARK_ENABLED: false
    })
  }
  if (p === '/api/v1/perms/users/self/nodes/children-with-assets/tree/') {
    await new Promise((r) => setTimeout(r, 150))
    const byId = url.searchParams.get('id')
    const key = byId ? nodes.find((n) => n.id === byId)?.key ?? '' : url.searchParams.get('key') || ''
    return json(res, 200, childrenTree(key))
  }
  if (p === '/api/v1/perms/users/self/assets/tree/' && url.searchParams.get('id')) {
    const a = assets.find((x) => x.id === url.searchParams.get('id'))
    return json(res, 200, a ? [treeAsset(a, 'root')] : [])
  }
  if (p === '/api/v1/perms/users/self/assets/tree/') {
    const q = (url.searchParams.get('search') || '').toLowerCase()
    const found = assets.filter((a) => a.name.toLowerCase().includes(q) || a.address.includes(q))
    return json(res, 200, found.map((a) => treeAsset(a, a.nodeKeys[0])))
  }
  const detail = p.match(/^\/api\/v1\/perms\/users\/self\/assets\/([^/]+)\/$/)
  if (detail) {
    const a = assets.find((x) => x.id === detail[1])
    return a ? json(res, 200, assetDetail(a)) : json(res, 404, { detail: 'Not found' })
  }
  if (p === '/api/v1/authentication/connection-token/' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const a = assets.find((x) => x.id === body.asset)
    if (!a) return json(res, 400, { code: 'perm_asset_invalid', detail: 'Asset not found' })
    const acc = a.accounts.find((x) => x.alias === body.account)
    if (!acc) return json(res, 400, { code: 'perm_account_invalid', detail: 'Account not permitted' })
    if (process.env.MOCK_DEBUG) console.log('connection-token', body.protocol, body.connect_method, JSON.stringify(body.connect_options))
    const tok = {
      id: crypto.randomUUID(),
      value: crypto.randomBytes(8).toString('hex'),
      asset: a.id,
      account: acc.alias,
      input_username: body.input_username || '',
      protocol: body.protocol,
      connect_method: body.connect_method,
      actions: accountActions(acc),
      expire_time: 300,
      is_expired: false,
      is_reusable: false,
      date_expired: new Date(Date.now() + 300_000).toISOString(),
      org_id: '00000000-0000-0000-0000-000000000002',
      org_name: 'Default'
    }
    tokens.set(tok.id, { ...tok, asset: a, used: false })
    return json(res, 201, tok)
  }
  if (p === '/api/v1/authentication/connection-token/exchange/' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const old = tokens.get(body.id)
    if (!old) return json(res, 404, { detail: 'Not found' })
    const tok = { ...old, id: crypto.randomUUID(), value: crypto.randomBytes(8).toString('hex'), used: false }
    tokens.set(tok.id, tok)
    const { asset, used, ...publicTok } = tok
    return json(res, 201, { ...publicTok, asset: asset.id })
  }
  if (p === '/api/v1/terminal/components/connect-methods/') {
    const web = (component) => [{ component, type: 'web', endpoint_protocol: 'http', value: component === 'koko' ? 'web_cli' : 'web_gui', label: 'Web' }]
    return json(res, 200, {
      ssh: web('koko'),
      telnet: web('koko'),
      rdp: web('lion'),
      vnc: web('lion'),
      http: [{ value: 'chrome', label: 'Chrome', type: 'applet', component: 'tinker', listen: 'rdp' }]
    })
  }
  if (p === '/api/v1/terminal/endpoints/smart/') {
    return json(res, 200, { id: '1', name: 'Default', host: '', https_port: 443, http_port: PORT, ssh_port: 2222, rdp_port: 3389 })
  }
  return json(res, 404, { detail: 'Not found' })
})

const wss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has('JMS-KOKO') ? 'JMS-KOKO' : false) })
const guacWss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has('guacamole') ? 'guacamole' : false) })

/** Guacamole protokolü: her öğe `uzunluk.değer`, öğeler virgülle, komut noktalı virgülle biter. */
const guac = (...parts) => parts.map((p) => `${String(p).length}.${p}`).join(',') + ';'

function parseGuac(text) {
  const out = []
  let i = 0
  let current = []
  while (i < text.length) {
    const dot = text.indexOf('.', i)
    if (dot < 0) break
    const len = Number(text.slice(i, dot))
    const value = text.slice(dot + 1, dot + 1 + len)
    current.push(value)
    i = dot + 1 + len
    const term = text[i]
    i++
    if (term === ';') {
      out.push(current)
      current = []
    }
  }
  return out
}

/** Sahte lion: uzak masaüstü yerine renkli bir masaüstü, görev çubuğu ve pencere çizer. */
function handleLion(ws, url) {
  const tok = tokens.get(url.searchParams.get('TOKEN_ID'))
  const kind = tok?.protocol === 'http' ? 'web' : 'rdp'
  let w = Number(url.searchParams.get('GUAC_WIDTH')) || 1024
  let h = Number(url.searchParams.get('GUAC_HEIGHT')) || 768
  const draw = () => {
    const frame = [
      guac('size', 0, w, h),
      guac('rect', 0, 0, 0, w, h),
      guac('cfill', 14, 0, kind === 'web' ? 245 : 16, kind === 'web' ? 247 : 82, kind === 'web' ? 250 : 145, 255),
      guac('rect', 0, 0, h - 40, w, 40),
      guac('cfill', 14, 0, 30, 30, 36, 255),
      guac('rect', 0, Math.round(w * 0.15), Math.round(h * 0.15), Math.round(w * 0.6), Math.round(h * 0.55)),
      guac('cfill', 14, 0, 255, 255, 255, 255),
      guac('rect', 0, Math.round(w * 0.15), Math.round(h * 0.15), Math.round(w * 0.6), 32),
      guac('cfill', 14, 0, 0, 120, 212, 255),
      guac('sync', Date.now())
    ]
    ws.send(frame.join(''))
  }
  ws.send(guac('', crypto.randomUUID()))
  if (!tok) {
    ws.send(guac('error', 'Token invalid', 769))
    return ws.close()
  }
  ws.send(guac('ready', `$mock-${kind}`))
  draw()
  const nop = setInterval(() => ws.readyState === ws.OPEN && ws.send(guac('nop')), 5000)
  ws.on('message', (raw) => {
    for (const ins of parseGuac(raw.toString())) {
      if (ins[0] === 'size') {
        w = Number(ins[1]) || w
        h = Number(ins[2]) || h
        draw()
      }
    }
  })
  ws.on('close', () => clearInterval(nop))
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (process.env.MOCK_DEBUG) {
    console.log('upgrade', url.pathname, { cookie: Boolean(req.headers.cookie), session: Boolean(sessionUser(req)), origin: req.headers.origin, protocol: req.headers['sec-websocket-protocol'] })
  }
  if (url.pathname === '/lion/ws/connect/' && sessionUser(req) && sameHostOrigin(req)) {
    return guacWss.handleUpgrade(req, socket, head, (ws) => handleLion(ws, url))
  }
  const kokoPaths = ['/koko/ws/terminal/', '/koko/ws/sftp/']
  if (!kokoPaths.includes(url.pathname) || !sessionUser(req) || !sameHostOrigin(req)) {
    socket.write('HTTP/1.1 302 Found\r\nLocation: /core/auth/login/\r\n\r\n')
    return socket.destroy()
  }
  const handler = url.pathname === '/koko/ws/sftp/' ? handleSftp : handleTerminal
  wss.handleUpgrade(req, socket, head, (ws) => handler(ws, url.searchParams.get('token')))
})

function handleTerminal(ws, tokenId) {
  const id = crypto.randomUUID()
  const tok = tokens.get(tokenId)
  const send = (type, data = '', extra = {}) => ws.send(JSON.stringify({ id, type, data, ...extra }))
  if (!tok || tok.used) {
    send('ERROR', '', { err: 'Token invalid or expired' })
    return ws.close()
  }
  tok.used = true
  let shell
  send(
    'CONNECT',
    JSON.stringify({
      asset: { id: tok.asset.id, name: tok.asset.name },
      setting: {},
      permission: { actions: tok.actions },
      clipboard_policy: {}
    })
  )
  const pingTimer = setInterval(() => send('PING'), 30_000)
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return shell?.write(raw.toString())
    const msg = JSON.parse(raw.toString())
    if (msg.type === 'TERMINAL_INIT') {
      const size = JSON.parse(msg.data)
      shell = spawnShell(tok.asset, size.cols, size.rows)
      shell.onData((d) => ws.readyState === ws.OPEN && ws.send(Buffer.from(d, 'utf8'), { binary: true }))
      shell.onExit(() => {
        send('CLOSE')
        ws.close()
      })
    } else if (msg.type === 'TERMINAL_DATA') {
      shell?.write(msg.data)
    } else if (msg.type === 'TERMINAL_RESIZE') {
      const size = JSON.parse(msg.data)
      shell?.resize(size.cols, size.rows)
    } else if (msg.type === 'CLOSE') {
      ws.close()
    }
  })
  ws.on('close', () => {
    clearInterval(pingTimer)
    shell?.kill()
  })
}

function permString(st) {
  const type = st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : '-'
  const bits = 'rwxrwxrwx'
  let out = type
  for (let i = 0; i < 9; i++) out += st.mode & (1 << (8 - i)) ? bits[i] : '-'
  return out
}

/**
 * koko web SFTP (`/koko/ws/sftp/`): SFTP kökü varlığın ev dizini. Kökle başlamayan yollar kökün altına eklenir;
 * gizli dosyalar listelenmez. İstekler sırayla işlenir.
 */
function handleSftp(ws, tokenId) {
  const id = crypto.randomUUID()
  const tok = tokens.get(tokenId)
  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ id, data: '', err: '', ...msg }))
  if (!tok || tok.used) {
    send({ type: 'ERROR', err: 'Token invalid or expired' })
    return ws.close()
  }
  tok.used = true
  const root = hostHome(tok.asset)
  const can = (action) => tok.actions.includes(action)
  const chunks = new Map()
  let currentPath = root
  const realPath = (p) => (p && p.startsWith(root) ? path.resolve(p) : path.join(root, (p || '').replace(/^\/+/, '')))
  send({ type: 'CONNECT', data: JSON.stringify({ user: {}, setting: {}, asset: { id: tok.asset.id, name: tok.asset.name } }) })
  const pingTimer = setInterval(() => send({ type: 'PING' }), 30_000)
  let queue = Promise.resolve()
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.type !== 'SFTP_DATA') return
    queue = queue.then(() => handle(msg)).catch((err) => console.error('sftp', err))
  })
  async function handle(msg) {
    const req = JSON.parse(msg.data || '{}')
    const reply = (extra) => send({ id: msg.id, type: 'SFTP_DATA', cmd: msg.cmd, current_path: currentPath, ...extra })
    const fail = (err) => reply({ err: String(err.message ?? err) })
    if (process.env.MOCK_DEBUG) console.log('sftp', msg.cmd, req.path ?? '', req.chunk ? `chunk@${req.offset}` : '', req.merge ? 'merge' : '')
    try {
      switch (msg.cmd) {
        case 'list': {
          const rp = realPath(req.path)
          currentPath = rp
          let files = []
          try {
            files = fs
              .readdirSync(rp)
              .filter((n) => !n.startsWith('.'))
              .map((name) => {
                const st = fs.statSync(path.join(rp, name))
                return { name, size: String(st.size), perm: permString(st), mod_time: String(Math.floor(st.mtimeMs / 1000)), type: '', is_dir: st.isDirectory() }
              })
          } catch {
            files = []
          }
          return reply({ data: JSON.stringify(files), current_path: currentPath })
        }
        case 'mkdir':
          fs.mkdirSync(realPath(req.path), { recursive: true })
          return reply({ data: 'ok' })
        case 'rename': {
          const rp = realPath(req.path)
          fs.renameSync(rp, path.join(path.dirname(rp), req.new_name))
          return reply({ data: 'ok' })
        }
        case 'rm':
          if (!can('delete')) return reply({ err: 'permission denied' })
          fs.rmSync(realPath(req.path), { recursive: true })
          return reply({ data: 'ok' })
        case 'download': {
          if (!can('download')) return reply({ err: 'Permission denied' })
          const rp = realPath(req.path)
          if (req.is_dir) return reply({ err: 'Mock sunucu klasör indirmeyi desteklemiyor' })
          const fd = fs.openSync(rp, 'r')
          const buf = Buffer.alloc(2 * 1024 * 1024)
          for (;;) {
            const n = fs.readSync(fd, buf, 0, buf.length, null)
            if (n === 0) break
            send({ id: msg.id, type: 'SFTP_BINARY', cmd: 'download', raw: buf.subarray(0, n).toString('base64'), current_path: currentPath })
            await new Promise((r) => setImmediate(r))
          }
          fs.closeSync(fd)
          return reply({ data: path.basename(rp) })
        }
        case 'upload': {
          if (!can('upload')) return reply({ err: 'Permission denied' })
          const rp = realPath(req.path)
          const data = Buffer.from(msg.raw || '', 'base64')
          if (req.merge) {
            const fd = chunks.get(msg.id)
            if (fd === undefined) return reply({ err: `chunk file not found ${msg.id}` })
            fs.closeSync(fd)
            chunks.delete(msg.id)
            return reply({ data: 'ok' })
          }
          if (req.chunk) {
            if (!chunks.has(msg.id)) chunks.set(msg.id, fs.openSync(rp, 'w'))
            fs.writeSync(chunks.get(msg.id), data, 0, data.length, req.offset ?? req.offSet ?? 0)
            return reply({ data: req.path })
          }
          fs.writeFileSync(rp, data)
          return reply({ data: 'ok' })
        }
        default:
          return reply({ err: 'Unknown command' })
      }
    } catch (err) {
      return fail(err)
    }
  }
  ws.on('close', () => {
    clearInterval(pingTimer)
    for (const fd of chunks.values()) fs.closeSync(fd)
  })
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock JumpServer: http://127.0.0.1:${PORT}  (parola: ${PASSWORD}, kullanıcı adı serbest)`)
})
