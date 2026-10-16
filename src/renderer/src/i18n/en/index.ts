import type { Dictionary } from '@/lib/i18n'
import { ai } from './ai'
import { app } from './app'
import { common } from './common'
import { panels } from './panels'
import { terminal } from './terminal'
import { tree } from './tree'
import { update } from './update'
import { workspace } from './workspace'

/** İngilizce sözlük: anahtar Türkçe kaynak metin, değer İngilizce karşılığı. Alanlara göre ayrı dosyalarda tutulur. */
export const EN: Dictionary = {
  ...common,
  ...workspace,
  ...tree,
  ...panels,
  ...terminal,
  ...app,
  ...ai,
  ...update
}
