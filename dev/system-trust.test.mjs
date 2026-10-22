// İşletim sisteminin köklerine göre sertifika zinciri doğrulaması (src/main/system-trust.ts): test sertifikaları
// openssl ile üretilir (kök, ara, yaprak; başka kök, süresi geçmiş yaprak, CA olmayan imzalayan).
// Kullanım: node dev/system-trust.test.mjs
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-trust-'))
const stub = path.join(dir, 'electron-stub.cjs')
fs.writeFileSync(stub, 'module.exports = { session: {} }\n')
const outfile = path.join(dir, 'trust.cjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/system-trust.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  alias: { electron: stub },
  logLevel: 'error'
})
const { chainTrusted, splitPem } = createRequire(import.meta.url)(outfile)

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const f = (name) => path.join(dir, name)
const ssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' })
const ext = (name, text) => fs.writeFileSync(f(name), text)
ext('ca.ext', 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
ext('leaf.ext', 'basicConstraints=CA:FALSE\nsubjectAltName=DNS:updates.example.test,IP:127.0.0.1\n')
ext('plain.ext', 'basicConstraints=CA:FALSE\n')

/** Anahtar ve sertifika üretir; `issuer` verilmezse kendinden imzalı. */
const make = (name, subject, extFile, issuer, days = 30) => {
  ssl(
    'req',
    '-new',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    `${name}.key`,
    '-subj',
    subject,
    '-out',
    `${name}.csr`
  )
  const sign = issuer
    ? ['-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`, '-CAcreateserial']
    : ['-signkey', `${name}.key`]
  ssl(
    'x509',
    '-req',
    '-in',
    `${name}.csr`,
    ...sign,
    '-days',
    String(days),
    '-extfile',
    extFile,
    '-out',
    `${name}.pem`
  )
  return fs.readFileSync(f(`${name}.pem`), 'utf8')
}
const rootPem = make('root', '/CN=Test Corporate Root', 'ca.ext')
const interPem = make('inter', '/CN=Test Inspection CA', 'ca.ext', 'root')
const leafPem = make('leaf', '/CN=updates.example.test', 'leaf.ext', 'inter')
const otherPem = make('other', '/CN=Other Root', 'ca.ext')
const plainPem = make('plain', '/CN=Not A CA', 'plain.ext', 'root')
const badLeafPem = make('badleaf', '/CN=updates.example.test', 'leaf.ext', 'plain')

const trusted = [new X509Certificate(rootPem)]
const now = new Date()

check(
  'leaf + intermediate reach the system root',
  chainTrusted([leafPem, interPem], 'updates.example.test', trusted, now)
)
check(
  'chain that includes the root is trusted',
  chainTrusted([leafPem, interPem, rootPem], 'updates.example.test', trusted, now)
)
check(
  'IP address in the certificate is accepted',
  chainTrusted([leafPem, interPem], '127.0.0.1', trusted, now)
)
check(
  'missing intermediate is not trusted',
  !chainTrusted([leafPem], 'updates.example.test', trusted, now)
)
check(
  'another root is not trusted',
  !chainTrusted([leafPem, interPem], 'updates.example.test', [new X509Certificate(otherPem)], now)
)
check(
  'wrong host name is not trusted',
  !chainTrusted([leafPem, interPem], 'github.com', trusted, now)
)
check(
  'expired certificate is not trusted',
  !chainTrusted(
    [leafPem, interPem],
    'updates.example.test',
    trusted,
    new Date(Date.now() + 60 * 86400_000)
  )
)
check(
  'certificate signed by a non-CA is not trusted',
  !chainTrusted([badLeafPem, plainPem], 'updates.example.test', trusted, now)
)
check('PEM bundle is split into certificates', splitPem(`${rootPem}\n${otherPem}`).length === 2)

process.exitCode = failed ? 1 : 0
