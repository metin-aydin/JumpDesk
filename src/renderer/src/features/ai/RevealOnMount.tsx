import { useEffect, useRef } from 'react'

/** Görününce kaydırılabilir kaptaki yerine kaydırılan kutu (açıklama formun altında kalmasın). */
export function RevealOnMount(props: React.ComponentProps<'div'>): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // scrollIntoView bir Promise döndürebilir; etkinin dönüş değeri temizleme işlevi sayıldığı için döndürülmez.
    void ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  return <div ref={ref} {...props} />
}
