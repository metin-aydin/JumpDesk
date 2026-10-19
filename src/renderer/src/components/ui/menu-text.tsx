import { Children, type ReactNode } from 'react'

/**
 * Metin kutusu büyük harf yüksekliğiyle taban çizgisi arasına kırpılır; flex ortalaması böylece harflerin görünen
 * gövdesini simgeyle aynı hizaya getirir. Taban çizgisi tam cihaz pikseline yuvarlandığı için kesirli arayüz
 * yakınlaştırmasında metin simgeden bir piksele kadar yukarıda kalabilir; çeyrek piksel aşağı kaydırma 10–16 px
 * arayüz yazı boyutlarının hepsinde farkı en çok yarım piksele indirir (`dev/e2e/menus.mjs` ölçer).
 */
export const MENU_TEXT = 'relative top-[0.25px] [text-box:trim-both_cap_alphabetic]'

/** Menü öğesindeki ardışık düz metin parçalarını tek bir kırpılmış kutuya alır; öğeler (simge, kısayol) olduğu gibi kalır. */
export function menuText(children: ReactNode): ReactNode {
  const out: ReactNode[] = []
  let text = ''
  const flush = (): void => {
    if (text.trim())
      out.push(
        <span key={`text-${out.length}`} className={MENU_TEXT}>
          {text}
        </span>
      )
    text = ''
  }
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') text += child
    else {
      flush()
      out.push(child)
    }
  }
  flush()
  return out
}
