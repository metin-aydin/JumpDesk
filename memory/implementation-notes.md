---
name: implementation-notes
description: Kod tabanının yapısı, çalıştırma/test komutları ve uygulama sırasında öğrenilen tuzaklar
metadata:
  type: project
---

Kararlar: [[architecture-decisions]]. Protokoller: [[ssh-koko-protocol]], [[rdp-lion-protocol]].

## Yapı (electron-vite)
- `src/main/` — `index.ts` (yaşam döngüsü, tek örnek kilidi), `window.ts` (çerçevesiz pencere, mac hiddenInset),
  `auth.ts` (giriş WebContentsView + oturum durumu), `net-hooks.ts` (çerez/Origin enjeksiyonu),
  `jms/http.ts` + `jms/api.ts` (JumpServer API, session.fetch), `ipc.ts`, `store.ts` (userData/jumpdesk.json), `config.ts`.
- `src/preload/index.ts` — `window.jumpdesk` köprüsü (sandbox açık, contextIsolation).
- `src/shared/` — `types.ts`, `api.ts` (IPC kanal adları + `JumpDeskApi` arayüzü).
- `src/renderer/src/` — `components/titlebar` (TabStrip, WindowControls), `features/auth`, `features/tree`
  (ServerTree, Sidebar, arama), `features/workspace` (Workspace döşeme, SessionView, HomeView, ConnectView),
  `features/terminal` (TerminalPane, KokoConnection, webgl-pool, themes, registry), `stores/` (zustand).
- Alias: `@/` → renderer src, `@shared/` → src/shared.

## Komutlar
- Mock sunucu: `npm run mock` (127.0.0.1:18080; test parolası `dev/mock-jms/server.mjs` içinde, kullanıcı adı serbest).
- Mock'a karşı geliştirme: `npm run dev:mock`. Gerçek sunucu: `npm run dev` (adres giriş ekranında girilir).
- Duman testi: `npm run build` sonra `node dev/e2e/smoke.mjs <çıktı-klasörü>` (Playwright `_electron`,
  ekran görüntüleri alır).
- Test ortam değişkenleri: `JUMPDESK_SERVER`, `JUMPDESK_USER_DATA` (ayrı userData), `JUMPDESK_HIDE_WINDOW=1`,
  `JUMPDESK_OFFSCREEN=1` (offscreen render; gizli pencerede rAF ~2 fps olduğundan Playwright tıklamaları için gerekli).

## Öğrenilen tuzaklar
- **webRequest filtresinde `*://*/*` WebSocket'i kapsamaz**; `ws://*/*` ve `wss://*/*` açıkça eklenmeli.
  Desende port (`*://127.0.0.1:18080/*`) geçersiz → host filtrelemesi callback içinde yapılır.
- Arayüz `file://` origin'inde: SameSite=Lax `jms_sessionid` WebSocket'e eklenmez ve Origin `file://` gider →
  `net-hooks.ts` ana pencere isteklerine Cookie + `Origin: <sunucu>` ekler (mock'ta doğrulandı: `ws test: open`).
- Django CSRF: POST'larda `X-CSRFToken` + `Origin`/`Referer` sunucu adresi olmalı (`jms/http.ts`).
- headless-tree `onPrimaryAction` tek tıklamada da tetiklenir → kullanılmaz; bağlantı çift tık/Enter ile.
- JumpServer tek kök düğümün çocuklarını ilk yanıtta birlikte getirir → `TreeDataSource.prefetched` + otomatik açma.
- shadcn CLI bu projede `cn` yardımcısını npm paketi sanıp `from "cn"` yazıyor ve `cn` paketini kuruyor →
  her `shadcn add` sonrası: `npm uninstall cn` ve importları `@/lib/utils` yap.
- Gizli pencerede `setSize` Wayland'da uygulamayı kapatıyor (yalnız test senaryosu).
- `pkill -f <desen>` kendi bash komut satırını da eşleyip kabuğu öldürür → mock PID dosyasıyla yönetilir.
- WebGL renderer'da terminal metni DOM'da yok; testte doğrulama ekran görüntüsüyle yapılır.
- Sunucuda oturum çerezi Max-Age 86400 (SESSION_EXPIRE_AT_BROWSER_CLOSE=false) → kalıcı partition'da yeniden
  başlatmada korunur. Yönetici bu ayarı açarsa çerez oturumluk olur; politikayı aşmak için çerez saklanmaz.
- zustand seçicisi her çağrıda yeni dizi/nesne döndürmemeli (`?? []` sonsuz render → boş ekran). Sabit boş dizi kullan.
- Kabuk entegrasyonu: kurulum sonrası otomatik komutlar ilk B (istem sonu) işaretinden sonra gönderilir; erken
  gönderilirse tty yankısı istemden önce basılır.
- Komut satırı boyama `DECSC + CUP + renkli metin + DECRC` ile yerelde yapılır; yalnız bekleyen yazma kalmadığında
  (`outstanding === 0`) çalışır, aksi halde eski içerik yenisinin üstüne yazılabilir. Enter'dan sonraki ilk çıktıda
  son bir boyama yapılır.
- Renderer kodu: `features/terminal/{shell-integration,input-line,command-highlight,autocomplete,output-highlighter}.ts`,
  `features/panel/{RightPanel,SnippetsPanel,HistoryPanel}.tsx`, `stores/{session-info,preferences}.ts`.
- Programatik girdi (snippet, geçmiş, yayın, autocomplete kabulü) `sendTracked` üzerinden gider; böylece Enter takibi
  ve son boyama her panelde çalışır. Gönderilen komut satırı, yankı satır sonuna ulaşana ya da yeni istem gelene kadar
  her çıktı parçasında yeniden boyanır (hızlı yazımda kısmi renk sorunu).
- `isAppShortcut` tuş adını büyük harfe çevirip karşılaştırır ('Enter', 'Tab' gibi çok harfli tuşlar için).
- Base UI `Menu.GroupLabel` (shadcn `DropdownMenuLabel`/`ContextMenuLabel`) mutlaka `...Group` içinde olmalı; aksi
  halde açılırken hata fırlatır (profil menüsü çökmesinin nedeni).
- Sekme önizlemesi: `features/workspace/preview-registry.ts` (TerminalPane ve RdpPane sağlayıcı kaydeder),
  `components/titlebar/TabPreviewCard.tsx`. Serialize addon `&` ve `<` kaçışlı HTML üretir; CSP betikleri engeller.
- Guacamole (`guacamole-common-js`) varsayılan katman tuvaline `z-index:-1` verir: görüntü kabına `isolate` (yeni
  katman bağlamı) verilmezse tuval üst öğenin arka planının arkasında kalır ve ekran siyah görünür.
- İkon PNG'leri: `npx electron dev/render-svg.cjs build/icon.svg <önek> 1024,512,256,128,64,48`; ardından
  `npm run desktop-entry` ile GNOME'a yeniden kurulur. Rıhtım eski ikonu, uygulama yeniden açılana kadar gösterebilir.
- SFTP kodu: `features/sftp/{sftp-client,sftp-clients,transfers}.ts`, `FileBrowser.tsx`, `FilesTab.tsx`,
  `features/panel/FilesPanel.tsx`; ana süreç `main/downloads.ts`. Oturumlar anahtarla tutulur (`panel:<sekme>`,
  `tab:<sekme>`), SessionView kapanınca `drop`. SSH oturumu hazır olunca `session-info`'ya `tokenId/protocol/actions`
  yazılır; panel bunları okur.
- WebGL renderer DOM'da `.xterm-rows` üretmez; e2e'de terminal metni okunamaz, etkisi başka yoldan doğrulanır.
- e2e indirme klasörü: `JUMPDESK_DOWNLOADS` ortam değişkeni `app.setPath('downloads')` yapar.
- Sekme şeridinde CSS container query kullanma: `container-type: inline-size` öğenin içerik katkısını sıfırlar,
  `flex: 0 1 auto` kapsayıcı da içeriğe göre daraldığından sekmeler bol yer varken en dar boyuta iner. Genişlik
  `ResizeObserver` + `tabWidth()` ile hesaplanır.
- `scrollbar-width`/`scrollbar-color` verilen öğede Chrome `::-webkit-scrollbar` stillerini yok sayar (varsayılan oklu
  çubuk çıkar); özel stil için bu özellikler verilmez.
- Base UI Popover açılış animasyonu sırasında ekran görüntüsü yarı saydam çıkar; e2e'de kısa bekleme gerekir.
- `react-refresh/only-export-components`: bileşen dosyasından sabit/depo dışa aktarılmaz (ör. `stores/tab-search.ts`,
  `sftp-clients.ts` içindeki anahtar ve sabitler).
- Uzun listelerde satır başına Base UI `ContextMenu` kullanma (yüzlerce örnek açılışı dondurur). Liste sanal çizilir,
  tek menü paylaşılır: satır `onContextMenu` hedefi ref/state'e yazar, kapsayıcı `onContextMenuCapture` sıfırlar,
  menü `open`/`onOpenChange` ile yalnız hedef varken açılır (HistoryPanel, FileBrowser).
- e2e'de klasör adlarını `page.getByRole('tree').getByText(...)` ile ağaca sınırla; "Yeni Bağlantı" ekranındaki
  klasör kartları aynı adları taşır (strict mode ihlali).
- Test dosyalarını Python ile düzenlerken eşleşmeyi `assert` ile doğrula: prettier çok satıra böldüğü ifadelerde
  `str.replace` sessizce hiçbir şey yapmaz ve test eski adımı çalıştırır.
- cmdk öğe durumları `data-selected="true|false"`, `data-disabled="true|false"` olarak yazılır; Tailwind'de
  `data-[selected=true]:` kullan (`data-selected:` her öğeyi eşler).
- Linux (GNOME/Ubuntu Dock) uygulama simgesindeki sayı, bildirim merkezindeki okunmamış bildirimlerdir;
  `app.setBadgeCount` değil. Görülen bildirimler `Notification.close()` ile kaldırılmalı.
- Betiklerde `rm -f $S/*` gibi değişkenli silmeler güvenlik denetimine takılır; çıktı dosyalarını üzerine yaz ya da
  `"${S:?}"` kullan.
- Hover'da beliren satır içi düğmeler `hidden`→`inline-flex` ile açılmamalı (satır yüksekliği/genişliği değişir,
  zıplar); yer kaplamayan mutlak konum + `opacity` kullan.
- Chromium (Linux) orta tık birincil seçim yapıştırması `mouseup` varsayılan davranışıdır ve `auxclick`'ten SONRA
  çalışır: `auxclick`'te odak değişirse yapıştırma yeni odaklanan alana gider. Önlemek için `mouseup`'ta
  `preventDefault`.
- Izgara düzeni en az 3 oturum ister (2'li grupta menüde pasif).
- **Paketleme (electron-builder 26):** `npm run build && npx electron-builder --linux` → `dist/JumpDesk-<v>.AppImage`,
  `dist/jumpdesk_<v>_amd64.deb`; `--win portable --x64` → `dist/JumpDesk-<v>-Portable.exe`. Ağ kopukluğunda (ECONNRESET,
  appimage/fpm indirme) yeniden denemek yeterli. `.deb` için package.json `homepage` zorunlu. `desktopName:
  jumpdesk.desktop` + `linux.syncDesktopName` pencere–dock eşlemesi için.
- **AppImage sandbox (Ubuntu 23.10+):** AppArmor yetkisiz kullanıcı ad alanlarını kısıtlar, AppImage nosuid bağlanır →
  Electron açılışta çöker. `build/after-pack.cjs` Linux ikilisini `jumpdesk-bin` yapıp `jumpdesk` başlatıcı betiği koyar;
  `APPIMAGE` tanımlıysa `--no-sandbox` ekler, `.deb`'de sandbox (SUID chrome-sandbox + AppArmor profili) korunur.
  Paketlenmiş uygulama testi: `node dev/e2e/packaged.mjs <AppImage yolu | /opt/JumpDesk/jumpdesk> <klasör>`.
- **`.deb` sandbox:** postinst, root olarak `unshare --user` başarılı olduğundan chrome-sandbox'ı SUID yapmaz (0755);
  kullanıcı ad alanı izni AppArmor profilinden (`userns`) gelir. Kurulu ikili sandbox açıkken sorunsuz açılır.
- **Masaüstü kaydı çakışması:** eski geliştirme betiğinin kurduğu `~/.local/share/applications/jumpdesk.desktop`
  sistemdeki `/usr/share/applications/jumpdesk.desktop`'u gölgeliyordu; betik artık `jumpdesk-dev.desktop` kurar.
- **Bayat ikon önbelleği:** `~/.local/share/icons/hicolor/*/apps/jumpdesk.png` silinip `icon-theme.cache` yenilenmezse
  önbellek ikonu hâlâ yerel klasörde gösterir (GTK yalnız tema kök klasörünün mtime'ına bakar); kabuk kurulu paketin
  ikonunu bulamaz, dock'ta ikon çıkmaz. Çözüm: `gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor`
  (`install-desktop-entry.sh --remove` bunu yapar). Denetim: `/usr/bin/python3` + `Gtk.IconTheme.lookup_icon('jumpdesk')`
  (sistemdeki `python3` gi modülü içermeyen ayrı bir kurulum).
- **`npx @electron/asar extract-file <asar> <dosya>` çalışılan klasöre yazar:** proje kökünde çalıştırılırsa projenin
  aynı adlı dosyasının üzerine yazar (package.json bir kez böyle kayboldu, package-lock + oturum kaydından yeniden
  kuruldu). Her zaman scratchpad'de çalıştırılır.
- Wayland app_id: Electron `CHROME_DESKTOP` (= package.json `desktopName`, `jumpdesk.desktop`) değerinden `jumpdesk` verir;
  `.desktop` dosya adı ile eşleşir.
- **Windows NSIS kurulumu Linux'ta:** kaldırıcı oluşturmak için 32 bit `wine32` gerekir (bu makinede yok; sudo ister).
  Portable hedef `wine32` istemez. NSIS için Docker `electronuserland/builder:wine` + `--prepackaged dist/win-unpacked`.
  Wine'ı kullanıcının `~/.wine`'ına dokunmadan çalıştırmak: `WINEPREFIX=<geçici> WINEDLLOVERRIDES="mscoree,mshtml="`.
- `.gitignore`'daki `*.png` ikonları da dışlıyordu; `!build/**/*.png` ve `!resources/*.png` istisnaları eklendi.

## Ayrı pencere, yakınlaştırma, vurgular (26. tur)
- **Ayrı sekme penceresi** = ana renderer'dan `window.open('', 'jumpdesk-tab-<id>', features)`; ana süreç
  `setWindowOpenHandler` bu adı izin verip çerçevesiz açar (`main/detached.ts`: kontrol IPC'si `detached:control`,
  yakınlaştırma eşleme, ana pencere kapanınca hepsini kapatma). Pencere ana pencerenin JS bağlamını paylaşır;
  WebSocket/xterm ana pencerede kalır, oturum kopmaz.
- **Kalıcı kaplar** (`features/windows/tab-hosts.ts`): her sekmenin içeriği `createPortal(..., tabHost(id))` ile sabit bir
  `div`'e çizilir; `HostSlot` kabı ana çalışma alanındaki yuvaya ya da ayrı pencerenin içerik alanına `appendChild` ile
  taşır. Portal listesi `[...tabs, ...detached]` tek dizide anahtarlanır (ayrı listeler yeniden kurulum yapar).
  `createPortal` kabı değişirse React yeniden kurar → kap hep aynı öğe. Portal içeriğinden React olayları yuvaya
  ulaşmaz; yuva davranışı yerel dinleyiciyle (`HostSlot onPointerDownCapture`).
- Çalışma alanı deposu: `detached: WorkspaceTab[]` (ana sekmelerden ayrı; şerit, closeAll, Ctrl+Tab vb. etkilenmez),
  `detachToWindow`, `attachFromWindow(tabId, index?)`, `findTab()`. `activate` yalnız ana sekmeler için çalışır.
  Pencere yöneticisi (`features/windows/detached-windows.ts`) `detached` listesini izleyip pencere açar/kapatır,
  stilleri (`<style>`, `<link>`) ve `<html>` sınıf/stilini MutationObserver ile ayrı pencereye kopyalar.
- **xterm başka pencereye taşınınca:** `term.open(host)` yeniden çağrılır (xterm 5.4+ penceresini günceller),
  ResizeObserver öğenin penceresinden yeniden kurulur (`observeSize`), WebGL bırakılıp alınır, yazı tipi o belgede
  yüklenince `clearTextureAtlas()`. `onTabHostMoved` ile haber alınır. RDP de gözlemciyi yeniden kurar.
- Base UI portalları (menü, ipucu, popover, dialog, select) `PortalContainerContext`'ten kap alır
  (`lib/portal-container.ts`, `components/ui/*` içinde `container={usePortalContainer()}`); ayrı penceredeki içerik o
  pencerenin `body`'sini verir. Sonner bildirimleri ana pencerede kalır.
- Geri alma sürükle-bırak: ayrı penceredeki sekme çipi `draggable` (HTML5 DnD, `application/x-jumpdesk-tab` + modül
  değişkeni); ana belge `dragover/drop` dinler (`installDockDropTarget`), bırakma yeri `[data-tab-ids]` öğelerinden.
- Sekmeyi dışarı sürükleme: `useTabReorder` işaretçi pencere sınırı dışında ya da (gruba ekleme hedefi yokken) şeridin
  `DETACH_BELOW_STRIP_PX` altında bırakılırsa `openInNewWindow(id, ekran noktası)`; bırakma alanı `showDropZone('window')`.
  Wayland pencere konumu vermez (pencereyi bileşik yönetici yerleştirir).
- Grup panelinin yuva `div`'inde React `onPointerDownCapture` (başlık gibi React çocukları için) **ve** `HostSlot`
  yerel dinleyicisi (portal içeriği için) birlikte durur; yalnız biri olursa başlığa tıklamak paneli etkinleştirmez
  (tools e2e alarm adımları bunu yakalar).
- **Test tuzakları:** gizli (`show:false`) ayrı pencerede rAF durur; `offscreen` ayrı pencerenin görünüm boyutu 0 kalır;
  gizli ayrı pencerede `capturePage` uygulamayı çökertir. Bu yüzden `JUMPDESK_SHOW_DETACHED=1` ayrı pencereleri görünür
  açar (`dev/e2e/windows.mjs` kullanır; test sırasında ekranda pencere belirir).
- **Yakınlaştırma:** arayüz boyutu = `webFrame.setZoomFactor(ui/13)` (preload `jumpdesk.ui.setZoom`, ana süreç ayrı
  pencerelere uygular; açılışta `applyStoredZoom()` ilk çizimden önce). Terminal `fontSize = terminal / zoom`, ağaç
  satırı CSS `zoom = (tree/13)/zoom` ve satır yüksekliği `28 * ölçek` (sanal liste `measure()`). Giriş görünümü
  (WebContentsView) sınırları CSS px × zoom ile gönderilir.
- **Vurgular** xterm süslemeleriyle (`registerDecoration`, `layer: 'bottom'`, renk yalnız `#rrggbb`, şeffaf = renk
  verilmez); veri akışı değiştirilmez (`features/terminal/highlight-decorator.ts`). Kaydırma geçmişindeki satırlar bir
  kez, etkin sayfa her yazmada yeniden taranır; alternatif ekranda görünen ekran baştan; kural/boyut/ekran değişince
  tümü. Hücre eşlemesi geniş karakter/emoji için hücre hücre okunur. Süsleme öğeleri yalnız görünen alanda DOM'a
  eklenir (`.xterm-decoration`, e2e sayımı bununla).
- Başlık çubuğu sürükleme bölgesi (`-webkit-app-region: drag`) tıklamaları sayfaya iletmez; açık menüde dışarı tıklama
  algılanmaz. Çözüm `html:has([data-slot=...-content]) .app-drag { app-region: no-drag }` (katmansız CSS,
  Tailwind katmanını ezer). Playwright CDP tıklamaları sürükleme bölgesini atlar; test hesaplanan `-webkit-app-region`
  değerini denetler.
- `npx prettier --write src/...` önceden biçimlenmemiş dosyaları da (ör. `main/index.ts`) biçimler; yalnız biçim farkı.
- Lint: `components/ui/*` (shadcn) ve bazı eski dosyalarda (TerminalPane ref, Sidebar setState) önceden kalan
  hatalar var; yeni kod bunlara eklenmez.

## Ayrı pencerede grup (27. tur)
- Pencere kimliği `windowIdOf(tab) = tab.windowId ?? tab.id`; tek sekmede sekmenin, taşınan grupta grubun kimliği.
  Grup nesnesi `groups` içinde kalır (üyeleri `detached`'da); `isMainGroup()` ana pencerenin gruplarını ayırır
  (sekme şeridi genişliği, Tümünü Kapat/Diğerlerini Kapat onayı, `closeAll` ayrı penceredeki grupları korur).
  Depo: `detachGroupToWindow`, `attachWindow(windowId, index?)`, `attachFromWindow` (gruptan çıkarır),
  `splitToWindow`, `focusPane` (ayrı penceredeki grupta odaklı panel = `group.focusedId`; `activate` yalnız ana
  pencere). `toggleZoom` ayrı penceredeki panelde `activeId`'yi değiştirmez. `close` ayrı penceredeki paneli
  gruptan da düşürür.
- Döşeme ortak modülde: `features/workspace/use-tiling.ts` (`useTiling(group, containerRef)`: boyutlar, panel
  sürükleme, tutamaç; dinleyiciler kabın penceresine bağlanır), `tiling.tsx` (`PaneHeader` `detached` seçeneği,
  `DragGhost`, `TileHandles`), `tile-layout.ts` (`pct`). Ana Workspace ve `DetachedGroupView` ikisi de kullanır.
- Yönetici (`detached-windows.ts`) pencereleri kimliğe göre tutar; abonelik pencereden ayrılan panelin kabını
  (`[data-tab-host]` taraması, `parkLeaving`) React yeni yere çizmeden önce ana belgeye alır.
  `openGroupInNewWindow`, `dockWindow`, `dockTab` (tek panel), `focusDetached` (pencereyi öne getirir + panele
  odaklanır), `detachedHasFocus` (grupta yalnız odaklı panel sayılır). Sürükle-bırak verisi pencere kimliğidir;
  ayrı pencere çipinde `data-window-id` (e2e).
- `AssetHoverCard` `placement: 'right' | 'below'` ve kabı `usePortalContainer()`'dan alır (ayrı pencerede doğru belge).
- Alarm algılayıcı: kaçış dizisi durum makinesi (`text/esc/esc-int/csi/str/str-esc`), yankı karşılaştırması
  boşluksuz (`squash`), parçalı yankı (komutun parçası ya da istem + komutun başı). Mock sunucu (node-pty bash) bu
  yankı/OSC bölünmesini yeniden üretmiyor; davranış `dev/alarm-detector.test.mjs` ile (esbuild paketleyip node'da)
  denetlenir.

## Sürükleme önizleme penceresi (28. tur)
- `main/drag-preview.ts`: saydam, çerçevesiz, `focusable:false`, `setIgnoreMouseEvents(true)`, `alwaysOnTop`,
  `skipTaskbar` pencere; ilk kullanımda oluşturulur, sonra gizlenip yeniden kullanılır (ana pencere kapanınca yok
  edilir). İçerik `data:` sayfası (CSP: betik yok) + `executeJavaScript` ile kurulur; metinler `textContent`, terminal
  görüntüsü (serialize addon'un kaçışlı HTML'i) `innerHTML`. Konum `screen.getCursorScreenPoint()` ile (Wayland'da
  yok sayılır). `commit` önizlemenin sınırlarını (8 px gölge payı düşülerek) saklar; ardından açılan ayrı pencere
  `did-create-window`'da `takePreviewBounds()` ile o sınırlara alınır (3 sn geçerli).
- IPC: `drag-preview:show|move|hide|commit`; renderer yükü `features/windows/drag-preview.ts` (`buildDragPreview`:
  `previewRegistry` görüntüleri, pencere boyutu = çalışma alanı × zoom + başlık, tema renkleri CSS değişkenlerinden).
- `useTabReorder`: yalnız `isOutside` (clientX/Y pencere dışında) → önizleme göster/taşı (rAF ile seyreltilmiş),
  içeride kopya (ghost) görünür; dışarıda kopya saydamlaşır. Bırakınca `commit` + `openInNewWindow`/
  `openGroupInNewWindow`.
- e2e: Playwright `app.waitForEvent('window')` önizleme penceresini de yakalar → `waitForDetached()` `data:` URL'li
  pencereleri dışlar; pencere sayısı önizleme başlığı (`jumpdesk-drag-preview`) hariç sayılır.
- WebGL'i test ortamında zorla açmak: electron argümanları `--ignore-gpu-blocklist --enable-unsafe-swiftshader`.

## Çok pencereli sekmeler (29. tur)
- Depo: `detached` sekmeleri `windowId` taşır, `windowActive[windowId]` ayrı pencerenin etkin sekmesi; yardımcılar
  `MAIN_WINDOW`, `NEW_WINDOW`, `windowIdOf`, `tabsOfWindow`, `activeOfWindow`, `findTab`. Tek genel taşıma:
  `moveTabs(ids, target, index?)` (tamamen taşınan grup korunur, yarım kalan gruptan düşer; kaynakta etkin sekme
  komşuya geçer, ana pencere boşalırsa "Yeni Bağlantı"; hedef ana pencerede yalnız boş "Yeni Bağlantı" varsa onun
  yerini alır). Eski adlar (`detachToWindow`, `attachWindow`...) bunun üzerine ince sarmalayıcı. `activate`,
  `close`, `moveBlock`, `arrange`, `addToGroup`, `toggleZoom` pencereye göre çalışır.
- Çizim: `Workspace` = `WindowWorkspace(main)` + `TabPortals` (tüm pencerelerin sekme içerikleri tek anahtarlı
  listede); ayrı pencere = başlık (`data-titlebar`) + `TabStrip windowId` + `WindowWorkspace windowId`.
  `TabStrip({ windowId })`: seçiciler `useShallow` ile; dinleyiciler/ResizeObserver şeridin penceresinden.
- Sürükleme (`TabStrip` `useTabReorder`): pencerelerin içerik alanları sürükleme başında ana süreçten alınır
  (`jumpdesk.detached.bounds()` → `getContentBounds`, ekran pikseli). İmlecin ekran yeri = kaynak içerik başlangıcı +
  `clientX × zoom`; hedef pencerede yerel = (ekran − hedef başlangıç) / zoom. `window.screenX` içerik başlangıcı
  DEĞİL (çerçevesiz X11 pencerede 16/10 px kayık) — kullanılmaz. Üst üste binmede sıra: kaynak pencere, sonra en
  son odaklanan (`lastFocusedAt`). Evreler: `strip` (kopya o pencerede serbest, kaynakta canlı sıralama, başka
  pencerede ekleme çizgisi `stripSlot`), `group` (Gruba Ekle), `window` (önizleme penceresi; bırakınca
  `moveTabs(..., NEW_WINDOW)` ya da pencerenin tüm sekmeleri ise `detached.control(name, 'place')` pencereyi taşır).
  Esc iptal eder. "Yeni Bağlantı" sekmesi yalnız kendi şeridinde sıralanır.
- X11: `app.commandLine.appendSwitch('ozone-platform', 'x11')` ETKİSİZ (ozone uygulama kodundan önce seçiliyor);
  bayrak komut satırında olmalı: `electron-vite dev -- --ozone-platform=x11`, paket başlatıcısı `build/after-pack.cjs`
  (`XDG_SESSION_TYPE=wayland` ve `JUMPDESK_WAYLAND` yoksa ekler). `jumpdesk.windowPositions` (preload'da `sendSync`
  `platform:info`) Wayland'da false. X11'de paket penceresinin WM_CLASS'ı `jumpdesk` (masaüstü kaydıyla eşleşir).
- Test: `dev/e2e/multiwindow.mjs` (`--ozone-platform=x11`, ana pencere ekran dışı, ayrı pencereler görünür;
  pencereler `setContentBounds` ile ayrı yerlere konur). Ekran dışı ana pencerede `window.screenX`/olay `screenX`
  gerçek konumu vermez, içerik sınırları ana süreçten doğru gelir. Eski HTML5 sürükle-bırak (çip → ana şerit)
  kaldırıldı.

## Alarm bekleme süresi ve başlık kartı (30. tur)
- `AlarmDetector.startAfter(ms)`: o zamana kadar (`quietUntil`, başlangıçta sonsuz) satırlar işlenir ama bildirilmez;
  `TerminalPane` bağlantı `connected` olunca `jumpdesk.alarmWarmupMs` (varsayılan 10 000) ile çağırır. Süre, ana
  süreçte `JUMPDESK_ALARM_WARMUP_MS` ile değiştirilebilir (preload `sendSync platform:info`); `tools.mjs` ve
  `windows.mjs` 0 kullanır, gerçek süre `dev/e2e/alarm-warmup.mjs` ile denetlenir.
- Panel başlığı kartı: `onPointerMove` (düğme üzerindeyse gizle, değilse zamanlayıcıyı bir kez başlat),
  `onPointerLeave` gizle, `onContextMenu` fare çıkana kadar engelle.
- Bir tam paket koşusunda `tools` alarm adımları bir kez düştü, ardından iki kez temiz geçti (zamanlama kaynaklı
  olabilir; tekrar ederse alarm adımlarındaki bekleme süreleri gözden geçirilmeli).

- "Yeni Bağlantı" (taşınamayan) sekme sürüklenirken pencere dışı olaylar (`clientX/Y` görünüm dışında) yok sayılır;
  pencere dışındaki gerçek X11 olay koordinatlarına güvenilmez. Taklit (CDP) fare olayları bu durumu üretmez; gerçek
  X11 olayı üretecek araç (xdotool, Xvfb, python-xlib) makinede yok — Xephyr var.
- `multiwindow.mjs` kararsızlığı: ayrı pencerenin başlığı etkin sekmeyle değişir ve pencere yöneticisi öne alınan
  pencereyi kaydırabilir → test pencereyi başlık ekiyle (`— JumpDesk`) bulur ve her sürüklemeden önce yerini yeniden
  sabitler.

## Yazı boyutu ve gizli terminaller (32. tur)
- `TerminalPane`: `useFontSizes` aboneliği `FONT_APPLY_DELAY_MS` (150) sonra yalnız görünen terminale uygular
  (`syncFont`); gizli terminal `visible` etkisinde (`syncFontRef`) güncellenir. `HighlightDecorator.setActive(visible)`:
  gizliyken taramalar `pending` bekler, görünür olunca yapılır.
- Ölçüm aracı `dev/e2e/font-perf.mjs [oturum]` (PerformanceObserver `longtask`); eski davranış 12 oturumda 32 uzun
  görev / 4380 ms, yeni 4 / 374 ms.

- **2026-10-16 ortam sorunu:** oturum ortasında GNOME Wayland yeni Electron uygulamalarını (boş bir örnek dahil)
  açmaz oldu (`app ready` hiç gelmiyor); X11 (`--ozone-platform=x11`) sorunsuz. Neden bilinmiyor (oturumu yeniden
  açmak muhtemelen düzeltir). Bundan sonra tüm e2e testleri uygulamanın Linux'taki çalışma biçimiyle aynı olarak
  `--ozone-platform=x11` ile açılır (`packaged.mjs` hariç; paket başlatıcısı bayrağı kendisi ekler).
- Kabuk tuzağı (tekrar yaşandı): `pkill -f`/`pgrep -f` deseni aynı komut satırında başka bir yerde de geçiyorsa (ör.
  aynı komutta çalıştırılan dosya adı) kendi kabuğunu öldürür (çıkış kodu 144). Süreç kapatmayı ayrı komutta ve
  `desen[x]` biçimiyle yap.

## Alarm yankısı (33. tur)
- `AlarmDetector`: yankı kaydı `{ text, pos, until }` (15 sn). `pos === 0`: satır komutun tamamını içeriyorsa düşer;
  istem + komutun başıyla bitiyorsa `pos` ilerler. Sonraki satırlar `text.slice(pos)` ile başlamalı; sona gelince kayıt
  düşer. Önceki "komutun herhangi bir parçası" kuralı uzun süreyle birleşince `echo "…Exception…"` çıktısını yutuyordu.
- Eşleştirme CR'ler atılmış tam satırda (readline kaydırma deyimi " \r" yeni satırın başına döner, üstüne yazmaz);
  panele `visibleLine` (son CR'den sonrası) eşleşme oradaysa yazılır.
- Bekleme süresi varsayılanı 20 000 ms (`ipc.ts` + preload). `dev/alarm-detector.test.mjs` `Date.now`'u değiştirerek
  gecikmeli yankıyı da dener. (34. turda süreler Ayarlar → Bildirimler'e taşındı, aşağıya bakın.)

## Kullanıcıya özel kayıtlar, dışa/içe aktarma, adres ekranı (34. tur)
- **Kapsam:** `userScopeOf(server, username)` = `host/kullanıcı` (`src/shared/user-scope.ts`). Ana süreç
  `auth.setState` giriş durumuna `scope` ekler ve `store.setUserScope` çağırır; `store.servers` / `updateServer`
  yalnız o kullanıcının `users[scope].servers` kaydına bakar. Renderer `stores/auth.ts` `apply()` arayüz çizilmeden
  önce `setUserScope` (`lib/user-storage.ts`) çağırır; depolar `onUserScope` ile yeniden yüklenir (alarms olayları
  da temizlenir, font-sizes zoom uygular, theme kullanıcının temasını — yoksa sistem — uygular, server-meta yeniden
  çeker). localStorage anahtarı `jumpdesk.user/<scope>/<ad>`; kapsam yokken okuma boş, yazma yok.
- **Eski kayıt taşıma:** ilk `setUserScope`'ta `jumpdesk.legacyOwner` yoksa tüm `jumpdesk.<ad>` anahtarları bu kullanıcıya
  `<ad>` olarak taşınıp silinir; `provideLegacyValue` ile localStorage dışı değerler (tema) de yazılır. Ana süreçte
  `jumpdesk.json` içindeki eski `servers` aynı şekilde ilk kullanıcıya geçer.
- Kullanıcı anahtarları: alarmRules, highlightRules, layouts, fontSizes, terminalPreferences, snippets,
  snippetGroupsOpen, notificationSettings, theme, leftPanelOpen, sidebarWidth, rightPanelWidth.
- **Snippet deposu** `stores/snippets.ts` (`sanitizeSnippets`, `groupSnippets`, `snippetById`); düzenleyici
  `features/snippets/SnippetEditorDialog.tsx` (`useDialogs.openSnippetEditor(id?)`).
- **Alarm bekletme:** `AlarmDetector.hold()` / `release(ms)`; `startAfter(ms)` bağlantı süresini `warmupEnds`'e yazar,
  `release` = max(warmupEnds, şimdi + ms). `TerminalPane` bağlanınca `startAfter(alarmConnectWaitMs())` ve otomatik
  komut varsa `hold()`; `runAutoCommands` gönderdikten sonra `release(alarmSnippetWaitMs())`. Süreler
  `stores/notification-settings.ts`; ortam değişkenleri `JUMPDESK_ALARM_WARMUP_MS` / `JUMPDESK_ALARM_SNIPPET_WAIT_MS`
  (preload `alarmWarmupMs` / `alarmSnippetWaitMs`, verilmezse null) ayarın önüne geçer. `report.ts` masaüstü
  bildirimini `alarmDesktop` kapalıysa göstermez.
- **Dosya biçimi** `src/main/transfer-format.ts` (Node crypto, Electron'suz; testler esbuild ile paketleyip kullanır):
  `JUMPDESK` + sürüm baytı (AAD) + 12 bayt IV + AES-256-GCM(gzip(JSON)) + 16 bayt etiket; anahtar uygulamaya gömülü
  (scrypt). Hata türleri: not-jumpdesk, unsupported-version, corrupt, wrong-format (+ too-large 20 MB, read-failed).
  JSON: `{ format: 'jumpdesk-export', version: 1, app, exportedAt, user: { username, server }, sections }`.
  `src/main/transfer.ts` kayıt/açma pencereleri (İndirilenler). Renderer: `features/transfer/{bundle,actions,
  sections}.ts`, `ExportDialog`, `ImportDialog`, `SectionCard`, `TransferContextMenu`; `stores/transfer.ts`
  (kapanırken içerik kalır, her açılış `nonce` ile yeniden kurulur).
- **Adres ekranı:** `auth.login(server?)` → `normalizeServerUrl` (şema yoksa https, yalnız origin) → `/api/health/`
  (8 sn, JSON'da `status` alanı) → `selectServer` (config: seçilen adres ortam değişkeninin ve kaydın önüne geçer;
  `JUMPDESK_SERVER` ile aynıysa kalıcı ayara yazılmaz; `recentServers` en çok 5) → o sunucuda oturum geçerliyse doğrudan
  giriş, değilse giriş görünümü. `auth.cancel()` adres ekranına döner. `net-hooks` sunucuyu her istekte okur.
- **Logolar:** `src/renderer/src/assets/jumpserver-icon.svg` (JumpServer işareti luna `logo.svg`'den, yeşil `#2B937C`
  degrade karo, JumpDesk karosuyla aynı biçim). Uygulama ikonu `build/icon.svg` turuncu; PNG üretimi
  `npx electron dev/render-svg.cjs build/icon.svg <önek> 1024,512,256,128,96,64,48,32,24,16`.
- **e2e:** `dev/e2e/helpers.mjs` — `login(app, page, { user, server })` (adres ekranı + mock form), `writeExportFile`,
  `decodeExportFile`, `stubFileDialogs` (ana süreç `dialog.showOpenDialog/showSaveDialog` değiştirilir; kayıt
  penceresinin önerdiği yol `globalThis.__jumpdeskSaveDefault`), `importFile`, `importFixtureSnippets`
  (`dev/e2e/fixtures/snippets.json`: genel `/opt/app/...` log snippetleri). Tüm testler bu girişi kullanır.
- **Test tuzağı:** sonner bildirim öğelerini DOM'dan elle silmek React'i çökertir (`insertBefore` hatası, hata ekranı);
  yeni bildirim sayısı artana kadar beklenir (`transfer.mjs` `expectToast`).
- `ExportDialog` önerilen dosya adını kendisi hesaplar (ana süreçteki `exportFileName` ile aynı kural); ikisi birlikte
  değiştirilmeli.
- **Rıhtım simgesi geliştirme modunda da kurulu paketten gelir:** `npm run dev` penceresinin WM_CLASS'ı `jumpdesk`;
  GNOME onu `/usr/share/applications/jumpdesk.desktop` (StartupWMClass=jumpdesk, Icon=jumpdesk) ile eşler ve simgeyi
  `/usr/share/icons/hicolor/*/apps/jumpdesk.png`'den (kurulu .deb) alır. `resources/icon.png` / `build/icons` değişince
  rıhtımda görünmesi için paket yeniden derlenip kurulmalı (`npx electron-builder --linux deb`, ardından kullanıcı
  `sudo apt install ./dist/jumpdesk_<v>_amd64.deb`) ve uygulama yeniden açılmalı. Yerel `~/.local/share/icons` kopyası
  bundan sonraki paket simgelerini gölgeleyeceği için kullanılmaz.
- **Geliştirme sürümü ayrı uygulama:** `main/index.ts` paketlenmemişken `app.setDesktopName('jumpdesk-dev.desktop')`
  çağırır → X11 WM_CLASS `jumpdesk-dev` (Wayland app_id de). Rıhtım dev penceresini kurulu paketle eşlemez, pencerenin
  kendi simgesini göstermez: **GNOME Shell 47 (Ubuntu 24.10) pencere simgesini (`_NET_WM_ICON`) kullanmaz**, eşleşen
  masaüstü kaydı yoksa rıhtımda simge boş kalır. Bu yüzden dev için `npm run desktop-entry` kurulmalı (2026-10-16'da
  kullanıcının makinesine kuruldu: `~/.local/share/applications/jumpdesk-dev.desktop`); kayıt sonradan kurulursa açık
  pencere eşleşmez, dev yeniden başlatılmalı. Denetim: `xprop -len 4000000 -id <pencere> -f
  _NET_WM_ICON 32c '=$0+' _NET_WM_ICON` (ilk iki sayı boyut, sonra ARGB). `npm run desktop-entry` artık
  `jumpdesk-dev.desktop` kurar (StartupWMClass=jumpdesk-dev, Icon=proje `build/icon.png` mutlak yolu; simge temasına
  kopyalama yok), paket kuruluyken de çakışmaz.
- Simge renk ölçümü (PIL yok): Electron `nativeImage.createFromPath(...).toBitmap()` (BGRA) ile piksel okunur;
  betik scratchpad'de (`tile.cjs`: karonun sol kenarında %18/30/50/70/82 yükseklikteki renkler).
- **GNOME Shell simgeyi dosya yoluna göre önbelleğe alır:** `Icon=` aynı yolu gösterirken dosya değişse de rıhtım eski
  simgeyi gösterir (kullanıcı bildirdi). `install-desktop-entry.sh` simgeyi içerik özetli adla kopyalar
  (`~/.local/share/jumpdesk-dev/icon-<sha256 ilk 12>.png`), eski kopyaları siler; logo değişince `npm run desktop-entry`
  yeniden çalıştırılmalı.

## Dil desteği (35. tur)
- `lib/i18n.ts`: kaynak metin Türkçe ve anahtar; `t(kaynak, { param })`, bileşende `const t = useT()` (dil değişince
  yeniden çizim + işlev kimliği değişir), `currentLocale()`, `setLanguage`, `LANGUAGES`. İngilizce sözlük
  `i18n/en/{common,workspace,tree,panels,terminal,app}.ts` (`index.ts` birleştirir); sayıya bağlı İngilizce işlevle.
  Karşılığı olmayan metinler `globalThis.__jumpdeskI18nMisses` kümesine yazılır.
- Dil kullanıcıya özel (`language` anahtarı) ve ana sürece son dil olarak bildirilir (`settings:set-language` →
  `settings.language`); preload açılışta `language`/`languageForced` verir (platformInfo). `JUMPDESK_LANGUAGE=tr|en`
  dili sabitler (tüm Türkçe e2e testleri `tr` ile açılır). Ana süreç iletileri `src/main/i18n.ts` `mt()`.
- Denetleyici: `node dev/i18n-check.mjs [dosya...]` — sarılmamış JSX metni/nitelikleri, toast sabitleri, sözlükte
  olmayan Türkçe sabitler ve `t()` anahtarları, Türkçe şablonlar, büyük harfle başlayan olası metinler.
- Dönüştürme 5 alt ajanla yapıldı (alan başına bir sözlük dosyası; `ai.ts` sonradan); kılavuz scratchpad
  `i18n-guide.md`. Kurallar: Türkçe kaynak metin değişmez (testler Türkçe), modül sabitlerindeki etiketler ekranda
  `t(label)`, şablonlar `t('… {x}', { x })`, `'tr-TR'` biçimleri `currentLocale()` ile çizimde. Bağlama göre farklı
  İngilizce için işlev girdisi + parametre (`t('İptal', { context: 'status' })`, `t('Küçült', { ctx: 'size' })`).
  "Yeni Bağlantı" sekme başlığı saklanır, `tabTitle(tab, t)` ile gösterilirken çevrilir; ayrı pencere başlıkları dil
  değişince yenilenir. Ağaçtaki "Favoriler"/"Gruplanmamış" düğümlerinin `name` alanı çeviri döndüren getter.
- İngilizce tarama e2e: `dev/e2e/i18n.mjs` (JUMPDESK_LANGUAGE verilmez; ekranlar dolaşılır, görünen metin ve
  title/aria-label/placeholder Türkçe anahtarla eşleşirse ya da Türkçe harf içerirse — mock verisi hariç — raporlanır;
  `__jumpdeskI18nMisses` boş olmalı).

## Yapay zeka (35. tur)
- Ortak: `src/shared/ai.ts` (sağlayıcı tanımları, alanlar, `AiConfig`, `aiConfigured`), `src/shared/ai-safety.ts`
  (`sanitizeCommand`: tek satır, kontrol karakteri/U+2028 yok, ≤600; `assessRisk`: riskli/dikkat kalıpları;
  `combineRisk`: model riski kurallarla yükseltilir).
- Ana süreç `src/main/ai/`: `prompt.ts` (sistem talimatı: yalnız komut önerisi, istek "untrusted data", sunucuya erişim
  ve veri yok, güvenlik kuralları; kullanıcı iletisi önceki ≤6 soru + `<request>`; JSON şeması; `parseSuggestions` ≤5,
  tekrarsız), `providers.ts` (Electron `net.fetch`, 45 sn; Anthropic tool_use zorunlu araç, OpenAI/Azure json_schema
  strict, Gemini responseSchema, uyumlu sunucu json_object → 400'de biçimsiz yeniden dene), `index.ts` (ayarlar
  `users[scope].ai`, gizli alanlar `safeStorage` base64; Linux'ta anahtar deposu yoksa `setUsePlainTextEncryption`
  ve arayüzde zayıf şifreleme uyarısı). IPC `ai:get-config|set-config|set-secret|test|suggest`; anahtar arayüze hiç
  gitmez. Dışa aktarım bu ayarları içermez (ayrı depoda).
- Renderer: `stores/ai.ts` (`aiAutocompleteReady`), `features/ai/{AiSettingsSection,AiAssistPopup,conversation}`.
  `TerminalPane`: elle açık öneri listesinde ikinci Ctrl+Space → `openAiRef` (imleç hizasında, yalnız normal ekran);
  seçilen komut `\x05\x15` + komut olarak gönderilir (satır temizlenir, satır sonu yok); terminale odaklanınca kip
  kapanır. Riskli komutta `useConfirm`.
- Testler: `node dev/ai-safety.test.mjs` (58), `dev/e2e/ai.mjs` (sahte OpenAI uyumlu sunucu; `--password-store=basic`
  ile gerçek anahtarlığa dokunmaz; gönderilen iletilerde sunucu adı/IP olmadığı denetlenir).

- **Anthropic çalışma alanı başlığı:** çalışma alanına bağlı olmayan anahtar 400 döner ("must include the
  anthropic-workspace-id header"). Anthropic sağlayıcısında isteğe bağlı "Çalışma Alanı Kimliği" (`workspaceId`,
  `wrkspc_…`, biçim `^[A-Za-z0-9_-]{1,128}$`) alanı var; doluysa `anthropic-workspace-id` başlığı gönderilir, boşken bu
  hata yerine ne yapılacağını söyleyen ileti gösterilir. Alan değerleri kontrol karakteri içeremez (başlığa/adrese
  girer). Birim testi `node dev/ai-providers.test.mjs` (Electron `net` taklit; 18 kontrol).
- **Zorunlu araç desteklenmeyen modeller:** `claude-opus-5-5` `tool_choice: {type:'tool'}` için 400 verdi ("not supported
  for this model"). Anthropic çağrısı bu hatada `tool_choice: auto` ile yeniden dener ve modeli bellekte işaretler
  (`noForcedTool`); yanıt araç girdisinden ya da metindeki JSON'dan okunur.
- **Model listesi sağlayıcıdan:** `listModels` (Anthropic `GET /v1/models?limit=1000` + çalışma alanı başlığı, OpenAI
  `/v1/models` sohbet dışı modeller elenir, Gemini `generateContent` destekleyenler, uyumlu sunucu `{baseUrl}/models`;
  Azure yok). IPC `ai:list-models`; ayarlarda Model alanı listeden seçilir (Base UI Select, `items` ile etiket),
  liste alınamazsa elle yazılır; anahtar/adres/çalışma alanı değişince ve yenile düğmesiyle yeniden alınır.

## Ad değişikliği: JumpDesk (public hazırlık, 2026-10-16)
- Tüm tanımlayıcılar: paket `jumpdesk`, ürün `JumpDesk`, `desktopName jumpdesk.desktop`, köprü `window.jumpdesk`
  (`lib/jumpdesk.ts`), ortam değişkenleri `JUMPDESK_*`, localStorage öneki `jumpdesk.` (kullanıcı kayıtları
  `jumpdesk.user/<scope>/<ad>`), ayar dosyası `jumpdesk.json`, dışa aktarım biçimi `JUMPDESK` + sürüm baytı,
  `format: 'jumpdesk-export'`, uzantı `.jumpdesk`, anahtar `scrypt('jumpdesk/export/v1', ...)` (önceki biçimdeki
  dışa aktarım dosyaları açılmaz), kabuk entegrasyonu işlevleri `__jd_*`, dev masaüstü kaydı `jumpdesk-dev.desktop`.
- Kodda önceki ada taşıma yok. Kullanıcının makinesinde bir kerelik betikle (scratchpad `migrate-to-jumpdesk.cjs`)
  önceki ad altındaki kullanıcı verileri `~/.config/JumpDesk`'e kopyalandı (önbellekler hariç; eski klasör duruyor),
  ayar dosyası `jumpdesk.json` adını aldı, `persist:jumpserver` bölümünde `http://localhost:5173` (12 anahtar) ve
  `file://` (5 anahtar) kökenlerindeki localStorage anahtarları `jumpdesk.` önekine geçirildi. Uygulama adı değiştiği için
  `safeStorage` anahtarlık girdisi de değişti: kayıtlı yapay zeka API anahtarı çözülemez, kullanıcı yeniden girmeli.
  Önceki adla kurulu `.deb` paketi kullanıcı tarafından kaldırıldı ve temizlendi (`apt purge`, 2026-10-16).
- Proje klasörü `jumpdesk` (2026-10-16); Claude'un proje dışı hafıza işaretçisi yeni yolun anahtarıyla kuruldu.
- Mock sunucu PID ile durdurulup yeniden başlatıldı (yeni mock verisi; ev klasörleri `/tmp/jumpdesk-mock-hosts`).
- Mock verisi genel adlar: `Entegrasyon(Partner A, Partner B, Partner C)` › `Partner A` › `Bölge Ofisleri…` ›
  `Merkez Kampüs` › `Ana Veri Merkezi…` › `dr-site-01`; `int-partner-gateway0{1,2}.example.com`. e2e kullanıcı `demo`.
- Public dosyalar: `LICENSE` (MIT, metin-aydin), `README.md` (İngilizce), `.gitignore` (`*.tsbuildinfo`, `/.remember`).

## GitHub deposu (2026-10-16)
- Depo `https://github.com/metin-aydin/JumpDesk` (public, varsayılan dal `main`, lisans MIT).
- **İlk commit:** GitHub'ın depo açılırken oluşturduğu commit (önceki adlı README + Apache LICENSE), kullanıcının
  isteğiyle ebeveynsiz yeni bir kök commit ve `git push --force-with-lease` ile değiştirildi (2026-10-16). Geçmişte
  önceki ad yok. Bu depoya özel `user.email` kullanıcının seçtiği adres (genel git ayarından bağımsız).
  Kök commit `5ce7c61`. Eski commit dalda yok ama GitHub doğrudan SHA bağlantısıyla bir süre açabilir (GitHub'ın
  kendi çöp toplaması siler; hemen silinmesi GitHub Destek isteğiyle olur).
  İlk push'taki CI çalışması başarılı (yaklaşık 45 sn).
- **Paket içeriği:** electron-builder `files` varsayılanı proje kökündeki her şeyi alıyordu (`.remember/` günlükleri,
  `memory/`, `CLAUDE.md`, `dev/`, `swagger.json`, tsbuildinfo). Dışlamalar eklendi; paket artık yalnız `out/`,
  `package.json`, `resources/` (+ üretim bağımlılıkları). Denetim: `npx @electron/asar list dist/linux-unpacked/resources/app.asar`.
- `publish: github (metin-aydin/JumpDesk)` (yalnız `--publish` ya da etiketli CI derlemesinde yükler).
- CI: `.github/workflows/ci.yml` (Node 22: `npm ci`, typecheck, i18n-check, üç birim testi, `electron-vite build`;
  lint önceden kalan hatalar yüzünden yok). README'de CI ve lisans rozetleri, indirme (Releases), klonlama, katkı.
- **memory/ ve CLAUDE.md depoda kalır** (kullanıcı kararı, 2026-10-16; içlerindeki kişisel çalışma tercihleri ve tur
  geçmişi kendisine gösterildikten sonra "ikisi de kalsın" dedi). `.gitignore`'a eklenmez; paket içine girmezler
  (electron-builder dışlamaları).

## Uygulama içi güncelleme (electron-updater) — tuzaklar (2026-10-16)
- Güncelleyici sınıfı elle seçilir (`AppImageUpdater`/`DebUpdater`/`NsisUpdater`): electron-builder `.deb` hedefi
  `linux-unpacked/resources/package-type` yazar ve AppImage aynı klasörden üretildiği için AppImage'a da girer;
  electron-updater'ın kendi seçimi bu dosyaya baktığından AppImage'ı .deb sanabilir. Önce `APPIMAGE` denetlenir.
- `latest-linux.yml` hem AppImage'ı hem .deb'i listeler (dosyalar birleştirilir); her güncelleyici kendi uzantısını
  seçer. Windows'ta yalnız NSIS `latest.yml` yazar; taşınabilir sürümün güncelleme dosyası yoktur.
- Test modu (`JUMPDESK_UPDATE_URL`): `userData/test-app-update.yml` (generic sağlayıcı + `updaterCacheDirName`)
  yazılıp `updateConfigPath` ve `forceDevUpdateConfig` verilir; yoksa paketlenmemiş uygulamada `dev-app-update.yml`
  aranır ve indirme ENOENT ile düşer. Klasör henüz yoksa önce oluşturulur (yoksa açılış takılıyordu; kurulum
  try/catch içinde, hata açılışı durdurmaz). `JUMPDESK_RELEASES_API` kurulamayan sürümün sorduğu adresi değiştirir.
- Paketlenmemiş uygulama `electron out/main/index.js` ile açılınca `app.getVersion()` Electron'un sürümünü (44.x)
  döndürür; güncelleme testi uygulamayı proje kökünden (`.`) açar.
- Güncelleyici istek adresine `?noCache=` ekler; sahte sunucular yolu `URL.pathname` ile eşlemeli.
- Hata iletileri yanıt başlıklarını ve yığın izini içerir; arayüze ilk satır verilir.
- AppImage yeniden açılışı: yeni sürüm eski ana süreçten başlatıldığı için eski sürecin dosya tanıtıcılarını ve
  `APPDIR`/`LD_LIBRARY_PATH` değerlerini devralır; eski AppImage kabuğu ve bağlaması yeni sürüm kapanana kadar
  kalır (silinen eski dosya diskte yer tutar). Güncelleme yine çalışır; electron-updater'ın davranışı, kabul edildi.
- AppImage farklı (differential) indirme için aralık isteği ister; sahte sunucu desteklemezse tam indirmeye düşer.
- **Paket boyutu tuzağı:** `-c.directories.output` başka klasöre verilince electron-builder `dist/`'i artık çıktı
  saymaz ve eski paketleri asar'a koyar (AppImage 1 GB oldu). `files` dışlamasına `dist` eklendi; normal boyut ~126 MB.
- Ayarlar penceresinin seçili bölümü `stores/dialogs.ts` `settingsSection` içinde (`openSettings('updates')` ile
  dışarıdan seçilir, `setSettingsSection`); effect içinde setState lint kuralına (`react-hooks/set-state-in-effect`)
  takıldığı için yerel state kullanılmaz. `Sidebar.tsx` 202/206'daki aynı kural hataları bu değişiklikten önce de vardı.

## Terminal çizimi: gizli terminaller ve xterm iç yaması (2026-10-16)
- `xterm-patches.ts` xterm 6'nın iç alanlarına dayanır: `term._core._renderService` üzerinde `_isPaused`,
  `_needsFullRefresh`, `_needsSelectionRefresh`, `_selectionState`, `_handleIntersectionChange`,
  `handleSelectionChanged/handleBlur/handleFocus`. Alanlar yoksa yama sessizce uygulanmaz. **xterm sürümü
  yükseltilince** `node dev/e2e/group-perf.mjs 5` ve `JUMPDESK_DISABLE_WEBGL=1` ile tekrar ölçülmeli.
- Yama `term.open` sonrası ve sekme başka pencereye taşınınca (`onTabHostMoved` → `term.open`) yeniden uygulanır
  (sembolle işaretli, iki kez sarılmaz).
- `setRenderingPaused(term, paused)`: gizlenince `_handleIntersectionChange({isIntersecting:false})`, görünürken
  `true` + bekleyen odak olayı. IntersectionObserver'ı beklemek geç kalır: yeni sekmenin otomatik odağı gizli
  terminalin `handleBlur`'unu xterm duraklatmadan önce tetikler.
- DOM çizicide `.xterm-rows` vardır, WebGL kipinde yoktur (satırlar tuvalde); testler metni okumak için ya DOM kipini
  (`JUMPDESK_DISABLE_WEBGL=1`) ya da pano/erişilebilirlik yollarını kullanmalı. Ekran dışı testlerde WebGL çalışır
  (tuval var); SwiftShader bayrakları (`--ignore-gpu-blocklist --enable-unsafe-swiftshader`) group-perf'te açık.
- Vurgu penceresi: `scannedFrom/scannedTo` işaretçileri geçmişte taranmış aralığı izler (satırlar kırpıldıkça kayar);
  `pageTop` önceki sayfa başını; geçmişe kayan sayfa satırları metin karşılaştırmasıyla korunur.
- Ölçüm tuzağı: `npm run build` `out/`'u değiştirir; arka planda e2e koşarken derlenecekse
  `npx electron-vite build --outDir <klasör>` ve `PERF_APP=<klasör>/main/index.js` kullanılır.
