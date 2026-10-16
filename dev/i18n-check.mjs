// Arayüz metinlerinin çeviri denetimi. Kullanım: node dev/i18n-check.mjs [dosya...] (verilmezse tüm renderer)
// Bildirilenler:
//  - JSX içindeki düz metin ve title/aria-label/placeholder gibi niteliklerdeki sabit metin (t() ile sarılmalı)
//  - toast(...) çağrılarındaki sabit metin
//  - label/title/description gibi nesne alanlarındaki ya da Türkçe harf içeren, sözlükte karşılığı olmayan sabitler
//    (bileşen bunları ekranda t(değişken) ile çevirir; bu yüzden sözlükte bulunmalı)
//  - t('...') çağrısında sözlükte karşılığı olmayan metin
//  - Türkçe harf içeren şablon metinler (`... ${x}`): t('... {x}', { x }) biçimine çevrilmeli
import { buildSync } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = path.resolve(import.meta.dirname, '..')
const rendererRoot = path.join(root, 'src/renderer/src')

// Sözlük: i18n/en/index.ts paketlenip yüklenir.
const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-i18n-')), 'en.cjs')
buildSync({
  entryPoints: [path.join(rendererRoot, 'i18n/en/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  alias: { '@': rendererRoot },
  logLevel: 'error'
})
const { EN } = require(outfile)

const TURKISH = /[ğüşıöçİĞÜŞÖÇ]/
const TEXT_ATTRS = new Set([
  'title',
  'aria-label',
  'placeholder',
  'alt',
  'label',
  'description',
  'heading',
  'tooltip',
  'confirmLabel',
  'cancelLabel',
  'emptyText',
  'hint'
])
const TEXT_PROPS = new Set([
  'label',
  'title',
  'description',
  'heading',
  'placeholder',
  'confirmLabel',
  'cancelLabel',
  'tooltip',
  'hint',
  'unit',
  'text',
  'emptyText',
  'detail'
])
/** Değeri veri olan alanlar (alarm deseni, komut, kimlik); çevrilmez. */
const DATA_PROPS = new Set(['pattern', 'command', 'id', 'value', 'protocol', 'platform'])
/** Çevrilmeyen, her dilde aynı kalan metinler. */
const ALLOW = new Set([
  'JumpDesk',
  'JumpServer',
  'SSH',
  'RDP',
  'SFTP',
  'VNC',
  'Telnet',
  'IP',
  'px',
  'Ctrl',
  'Shift',
  'Alt',
  'Esc',
  'Enter',
  'Tab',
  'Aa',
  '.*',
  'English',
  'Türkçe',
  'Ctrl+Space',
  'Linux',
  'Windows',
  'macOS'
])

/** Büyük harfle başlayan, küçük harfle süren sözcüklerden oluşan metin (tuş adları hariç). */
const LIKELY_TEXT = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+([ ,.'’…!?:/-]+[\p{L}\d][\p{L}\d'’-]*)*[.…!?:]?$/u
const KEY_NAMES = new Set([
  'Escape',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'Space',
  'Insert',
  'Control',
  'Meta',
  'Shift',
  'Alt',
  'Comma',
  'Period',
  'Slash',
  'Minus',
  'Equal',
  'Digit',
  'Key',
  'Arrow',
  'Up',
  'Down',
  'Left',
  'Right',
  'Unidentified',
  'Dead'
])
const hasLetters = (s) => /\p{L}/u.test(s)
const allowed = (s) => {
  const t = s.trim()
  return !hasLetters(t) || ALLOW.has(t) || /^[A-Z0-9+⌘⇧⌥←→↑↓ .,:/()-]+$/.test(t)
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : (function walk(dir) {
      return fs.readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f)
        if (fs.statSync(p).isDirectory())
          return p.includes(`${path.sep}components${path.sep}ui`) || p.endsWith(`${path.sep}i18n`)
            ? []
            : walk(p)
        return /\.tsx?$/.test(f) && !f.endsWith('.d.ts') ? [p] : []
      })
    })(rendererRoot)

const problems = []
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const report = (node, kind, value) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
    problems.push(
      `${path.relative(root, file)}:${line + 1}  ${kind}: ${JSON.stringify(value).slice(0, 120)}`
    )
  }
  const isTCall = (n) =>
    n && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't'
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    // t('...') sözlükte olmalı
    if (isTCall(node)) {
      const arg = node.arguments[0]
      if (
        arg &&
        (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
        EN[arg.text] === undefined
      )
        report(arg, 'sözlükte yok', arg.text)
      node.arguments.slice(1).forEach((a) => ts.forEachChild(a, visit))
      return
    }
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim()
      if (t && !allowed(t)) report(node, 'JSX metni', t)
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText()
      const init = node.initializer
      const lit = ts.isStringLiteral(init)
        ? init
        : ts.isJsxExpression(init) &&
            init.expression &&
            (ts.isStringLiteral(init.expression) ||
              ts.isNoSubstitutionTemplateLiteral(init.expression))
          ? init.expression
          : null
      if (lit && TEXT_ATTRS.has(name) && !allowed(lit.text)) {
        report(lit, `nitelik ${name}`, lit.text)
        return
      }
    }
    if (ts.isCallExpression(node) && /^toast(\.\w+)?$/.test(node.expression.getText())) {
      const arg = node.arguments[0]
      if (
        arg &&
        (ts.isStringLiteral(arg) ||
          ts.isNoSubstitutionTemplateLiteral(arg) ||
          ts.isTemplateExpression(arg))
      )
        report(arg, 'toast metni', arg.getText())
    }
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      const key = node.name.getText().replace(/['"]/g, '')
      const v = node.initializer.text
      if (TEXT_PROPS.has(key) && !allowed(v) && EN[v] === undefined)
        report(node.initializer, `alan ${key}`, v)
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      TURKISH.test(node.text)
    ) {
      const p = node.parent
      const isKey = p && ts.isPropertyAssignment(p) && p.name === node
      if (!isKey && EN[node.text] === undefined && !isTCall(p) && !allowed(node.text))
        report(node, 'Türkçe sabit', node.text)
    }
    // Türkçe harf içermeyen metinler ("Kapat", "Dosya Sil"): büyük harfle başlayan sözcük dizisi
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      LIKELY_TEXT.test(node.text) &&
      !KEY_NAMES.has(node.text) &&
      !TURKISH.test(node.text) &&
      EN[node.text] === undefined &&
      !isTCall(node.parent) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      !(ts.isPropertyAssignment(node.parent) && DATA_PROPS.has(node.parent.name.getText())) &&
      !ts.isLiteralTypeNode(node.parent) &&
      !ts.isCaseClause(node.parent) &&
      !(
        ts.isBinaryExpression(node.parent) &&
        /^(===|!==|==|!=)$/.test(node.parent.operatorToken.getText())
      ) &&
      !ts.isElementAccessExpression(node.parent) &&
      !(ts.isJsxAttribute(node.parent) && !TEXT_ATTRS.has(node.parent.name.getText())) &&
      !allowed(node.text)
    )
      report(node, 'olası metin', node.text)
    if (ts.isTemplateExpression(node) && TURKISH.test(node.getText().replace(/\$\{[^}]*\}/g, ''))) {
      report(node, 'Türkçe şablon', node.getText())
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
// Aynı satırdaki tekrarlar tek bildirilir.
const unique = [...new Set(problems)]
for (const p of unique) console.log(p)
console.log(
  `${unique.length} sorun, ${files.length} dosya, sözlükte ${Object.keys(EN).length} metin`
)
process.exitCode = unique.length ? 1 : 0
