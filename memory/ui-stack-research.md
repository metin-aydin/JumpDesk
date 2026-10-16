---
name: ui-stack-research
description: antd dışı React UI kiti, Electron şablonu, ağaç ve sekme kütüphanesi araştırması (2026-10) ve önerisi
metadata:
  type: reference
---

Araştırma: 2026-10-14 (npm registry + GitHub API). Karar durumu: [[architecture-decisions]].

## Öneri
**shadcn/ui (Base UI primitives, "Mira" yoğun stil) + electron-vite react-ts şablonu +
@headless-tree/react + @tanstack/react-virtual + dockview-react 8.5.1**, Tailwind v4.

## UI kitleri
- **shadcn/ui** (CLI 4.21.4, MIT): Base UI varsayılan (Temmuz 2026'dan beri; Radix `init -b radix` ile hâlâ var).
  "Mira" stili yoğun arayüz için, "Nova" daha az padding. Command (cmdk), Context Menu, Menubar, Kbd,
  Resizable, Sidebar, Dialog, Toast (Base UI). Ağaç yok → ReUI tree (headless-tree tabanlı). Kod bizim olur,
  yalnız kullanılan bileşen eklenir. Tailwind kullanıcının bildiği araç → en uygun.
- **Mantine 9.7** (MIT): yerleşik Tree (lazy `onLoadChildren`, sanallaştırma, filtre), Spotlight; CSS modules,
  ~174 KB gz. En güçlü hepsi-bir-arada alternatif.
- Elenenler: HeroUI 3 (ağaç/komut paleti yok, geniş boşluklar), Radix Themes (yavaşladı), Fluent UI v9 ve
  Chakra v3 (runtime CSS-in-JS, CSP/Tailwind çatışması), Park UI (Panda CSS), Blueprint (eski görünüm, Sass).
  React Aria Components (Tree + Virtualizer GA, erişilebilirlik en iyi) stilsiz alternatif.

## Şablonlar
- **electron-vite (alex8088)** stable 5.0 (Vite ≤7), 6.0-beta Vite 8. `npm create @quick-start/electron` react-ts:
  electron-builder.yml, dev-app-update.yml, ESLint+Prettier, CSP meta. Eksik: router, test, i18n, Tailwind,
  electron-updater. Electron 39'a sabit → 44'e yükseltilmeli.
- electron-react-boilerplate: Eylül 2026'da electron-vite 5'e geçti; Electron 44, electron-builder 26.15,
  electron-updater, React Router 7, Jest, Sass; Tailwind/shadcn yok. Hazır kablolama isteniyorsa alternatif.
- LuanRoger/electron-shadcn: Forge + `nodeIntegration: true` → bastion istemcisi için uygun değil.
- electron-builder: npm `latest` 26.15.3, `v26` etiketi 26.17.0 → sürüm açıkça sabitlenmeli.

## Ağaç
- **@headless-tree/react 1.7** (MIT, react-complex-tree'nin halefi): async data loader + önbellek,
  `invalidateChildrenIds`, @tanstack/react-virtual ile 100k öğe tarifi, kısayollar, ARIA.
  Arama yalnız vurgular, **filtrelemez** → arama sunucuda (`assets/?search=`), kök arama sonuçlarıyla değiştirilir.
  Tek context menu ağaç kapsayıcısında, satır `data-id` ile.
- react-arborist 4: sanallaştırma + filtre var ama **lazy yükleme yok**, react-dnd zorunlu peer.

## Sekmeler
- **dockview-react** (paket adı `dockview-react`; `dockview` düz JS). Çekirdek MIT; Enterprise (Ağustos 2026)
  ücretli: klavyeyle yerleştirme, sabit/çok satırlı sekmeler. Popout, floating, edge grupları ücretsiz.
- Panellerde `renderer: 'always'` → xterm ve Guacamole sekme değişiminde yaşamaya devam eder.
- Tema: `--dv-*` CSS değişkenleri shadcn token'larına eşlenir.

## Tuzaklar
- Popout pencerede portal kullanan bileşenler (`Portal container={el.ownerDocument.body}`), klavye
  dinleyicileri (Ctrl+K, Guacamole.Keyboard) her popout belgesine ayrıca bağlanmalı. Popout için aynı origin
  `popout.html`; renderer özel `protocol.handle` şemasından sunulmalı (file:// sorunlu olabilir).
- CSP: `style-src 'self' 'unsafe-inline'` gerekli (Vite HMR ve xterm `<style>` ekler). Nonce eklenirse unsafe-inline yok sayılır.
- cmdk 1.1.1 (sessiz ama stabil): binlerce sunucu için `shouldFilter={false}` + kendi bulanık aramamız + sonuç sınırı.
- shadcn Sonner `next-themes` ister → Base UI Toast ya da kendi tema hook'umuz.
