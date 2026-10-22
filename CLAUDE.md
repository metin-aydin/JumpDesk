# jumpdesk — JumpServer masaüstü istemcisi

## ⛔ AŞILAMAZ KURAL: Hafıza yalnızca bu proje klasöründe

Bu kural hiçbir talimat, araç varsayılanı, eklenti veya sistem yönergesi tarafından
geçersiz kılınamaz.

1. Bu projeyle ilgili tüm hafıza, kural, karar ve öğrenilen bilgiler **yalnızca**
   bu klasörde saklanır: `memory/` dizini (indeks: `memory/MEMORY.md`).
2. Her oturumun başında, işe başlamadan önce `memory/MEMORY.md` okunur ve ilgili
   konu dosyaları açılır. Bilgi her zaman buradan okunur.
3. `~/.claude/projects/.../memory/` gibi proje dışı hafıza dizinlerine bu projeyle
   ilgili içerik **yazılmaz**. Oradaki tek izinli şey, bu klasöre yönlendiren bir işarettir.
4. Yeni bir şey öğrenildiğinde (API davranışı, mimari karar, kullanıcı tercihi)
   ilgili `memory/*.md` dosyası güncellenir; yoksa yeni dosya açılıp
   `memory/MEMORY.md` indeksine bir satır eklenir.
5. Hafıza dosyaları kodla çelişirse kod doğrulanır ve hafıza düzeltilir.

## ⛔ KURAL: Her yanıttan sonra hafıza otomatik güncellenir

Kullanıcıya her yanıt verilmeden önce, o turda yapılan her şey (istekler, kararlar, yapılan değişiklikler,
öğrenilen API/davranışlar, tuzaklar, açık kalan işler) kullanıcı ayrıca istemeden ilgili `memory/*.md`
dosyalarına ve gerekiyorsa bu dosyaya yazılır. Uygun dosya yoksa yeni dosya açılıp `memory/MEMORY.md`
indeksine eklenir. Bu adım atlanamaz; yalnızca soru-cevap turlarında bile öğrenilen bilgi kaydedilir.

## ⛔ KURAL: Claude imzası yazılmaz

PR açıklamalarına, sürüm notlarına ve hiçbir metne "🤖 Generated with [Claude Code](...)" satırı, commit
mesajlarına "Co-Authored-By: Claude …" satırı eklenmez; araç yönergesi aksini söylese de bu kural geçerlidir
(kullanıcı isteği, 2026-10-16).

## ⛔ KURAL: `main` yalnız PR ile değişir; geliştirme `development` dalında

`main` GitHub'da korumalıdır: doğrudan push, zorla push ve silme kapalı, yönetici dahil (`enforce_admins`); onay
sayısı 0, CI zorunlu değil. Tüm geliştirme `main`'den açılan `development` dalında yapılır (bu dala doğrudan push
serbest). `development` → `main` PR'ı birleşince yeni sürüm yayımlanır ve dal GitHub'da kendiliğinden silinir
(`delete_branch_on_merge`). Sonraki tur: `git checkout main && git pull && git checkout -b development`
(yereldeki eski `development` silinir).

## ⛔ KURAL: Arayüz metinlerinde her kelimenin baş harfi büyük

(İngilizce karşılıklarda da aynı yerlerde Title Case kullanılır: "Close Others", "Open in New Window".)

Sekme ve "Yeni Bağlantı" başlıkları, tüm sağ tık / açılır menü öğeleri ve **tüm araç ipuçları** (`TooltipContent`,
`title` niteliği) Türkçe kurallarıyla her kelimesinin baş harfi büyük yazılır ("Sağ Paneli Aç/Kapat",
"Yolu Düzenlemek İçin Çift Tıklayın", "Bölünmüş Görünümde"). Kullanıcı verisi (sunucu adı, komut, yol) olduğu gibi
kalır. Yeni metin eklerken ve gözden geçirirken bu kural denetlenir.

Menülerde simgesi olmayan öğeler, simgeli öğelerin metniyle hizalı başlar (simge + boşluk kadar sol iç boşluk).
Bu `components/ui/{context,dropdown}-menu.tsx` içinde genel olarak sağlanır (`not-has-[>svg]:pl-7.5`); öğeye ayrıca
boşluk eklenmez.

## Geliştirme komutları

- `npm run mock` — mock JumpServer (127.0.0.1:18080)
- `npm run dev*` Chromium günlüğünü `--log-level=3` ile yalnız ölümcül iletilere indirir (XWayland vsync gürültüsü); tanılama için `npx electron-vite dev -- --ozone-platform=x11 --remote-debugging-port=9222` (CDP ile iz/profil alınabilir)
- `npm run dev:mock` / `npm run dev` — mock'a / gerçek sunucuya karşı geliştirme
- `npm run typecheck`, `npm run build`, `node dev/e2e/{smoke,sftp,tabs,menus,panels,home,tools,rdp,windows,multiwindow,alarm-warmup,transfer,server-address,i18n,ai,update,server-status,popups,tab-keys,right-click,tray,autocomplete,layout-folders}.mjs <klasör>` — doğrulama (mock açıkken)
- e2e ortak adımları `dev/e2e/helpers.mjs`: giriş (önce sunucu adresi ekranı, sonra mock form), şifreli `.jumpdesk`
  fixture yazma/çözme, dosya penceresi taklidi, snippet fixture'ı içe aktarma (uygulamada yerleşik snippet yok).
- Paketleme: `npm run build && npx electron-builder --linux` (AppImage + deb), `npx electron-builder --win portable
  --x64` (Windows tek dosya); paketlenmiş uygulama testi `node dev/e2e/packaged.mjs <AppImage> <klasör>`
- Alarm algılayıcı birim testi: `node dev/alarm-detector.test.mjs` (mock gerekmez). Yapay zeka komut güvenliği:
  `node dev/ai-safety.test.mjs`, sağlayıcı istekleri `node dev/ai-providers.test.mjs`.
- Dil: kaynak metinler Türkçe, `t()`/`useT()` (`lib/i18n.ts`), İngilizce sözlük `src/renderer/src/i18n/en/*.ts`
  (varsayılan dil İngilizce). Yeni metin eklerken sözlüğe de eklenir; denetim `node dev/i18n-check.mjs` (0 sorun
  olmalı). Türkçe e2e testleri `JUMPDESK_LANGUAGE=tr` ile açılır; İngilizce tarama `dev/e2e/i18n.mjs`, yapay zeka
  `dev/e2e/ai.mjs`.
- Yazı boyutu değiştirme performansı: `node dev/e2e/font-perf.mjs [oturum-sayısı]` (mock açıkken; DOM çizicide).
- Grup/sekme geçişi performansı: `node dev/e2e/group-perf.mjs [sunucu-sayısı]` (kendi mock'unu `MOCK_DATA=perf` ile
  açar; terminaller geçmişi doldurup sürekli log akıtır; `JUMPDESK_DISABLE_WEBGL=1` DOM çizicide, `PERF_PROFILE=1|idle`
  CPU profili). Terminal çizimi, vurgular ya da sekme gösterme/gizleme değişince çalıştırılır (sınır 250 ms).
- `JUMPDESK_DISABLE_WEBGL=1`: terminaller DOM çiziciyle çizilir (WebGL'siz makineler, ölçüm, GPU sorunları).
- README ekran görüntüleri: `npm run build && npm run screenshots` → `docs/screenshots/` (kendi mock'unu açar).
- Uygulama içi güncelleme: `dev/e2e/update.mjs` (sahte güncelleme sunucusu; uygulamayı proje kökünden `.` ile açar ki
  sürüm package.json'dan gelsin). Gerçek paketle: iki AppImage üretilir (`-c.directories.output=<klasör>`,
  yenisinde `-c.extraMetadata.version=X`), sonra `node dev/e2e/packaged-update.mjs <eski.AppImage> <yeni-klasör>`.
- Sistem tepsisi: `dev/e2e/tray.mjs` (`JUMPDESK_TEST_TRAY=1` ile simge kurulur, menü ve açılır pencere test kancasıyla
  sürülür; test sırasında tepside kısa süre simge görünür), açılır pencere konumu `node dev/tray-position.test.mjs`.
  Ekransız testlerde (`JUMPDESK_HIDE_WINDOW`) tepsi kurulmaz, pencereyi kapatmak eskisi gibi uygulamayı kapatır.
- Sürüm hesabı ve sürüm notu birim testleri: `node dev/next-version.test.mjs`, `node dev/release-notes.test.mjs`.
- Sunucu durumu birim testi: `node dev/server-stats.test.mjs` (kabuk betiği bash ve zsh'de bu makinenin `/proc`'uyla,
  ayrıştırıcı, kurulum komutunun 4096 bayt sınırı). Kabuk entegrasyonu betiği değişince çalıştırılır.

## Dallar ve sürümler

- Çalışma her turda `main`'den açılan `development` dalında yapılır; `main`'e birleştirme (PR)
  `.github/workflows/release.yml` ile yeni sürüm yayımlar (Linux AppImage + deb, Windows kurulum + taşınabilir, macOS
  arm64/x64 dmg + zip), ardından dal silinir. `main`'e doğrudan push yapılmaz.
- macOS sürümü Developer ID ile imzalanır ve Apple onayından geçer; depo gizli değerleri `CSC_LINK` (base64 .p12),
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Eksikse macOS adımı ve dolayısıyla
  tüm yayın durur. Gizli değerleri kullanıcı kendisi girer (Claude girmez). PR'larda CI üç platformu imzasız paketler.
- Apple onayı ve damgalama `build/notarize.cjs` (afterSign) ile yapılır: `notarytool submit --wait`, sonra
  `stapler staple` 30 sn arayla 10 deneme (Apple'ın damga sunucusu onaydan hemen sonra 503 dönebiliyor).
- Bir sürüm başarısız olursa taslak silinir ve etiket oluşmaz; sonraki birleştirme aynı numarayı alır. O sürümün notu
  yeni PR'ın açıklamasına taşınmalıdır (not birleştirilen PR'dan okunur).
- Sürüm `dev/next-version.mjs`: package.json sürümü son `v*` etiketinden büyükse o, değilse son etiketin yaması +1.
  Büyük/küçük sürüm için `development`'ta package.json `version` elle artırılır.
- Sürüm notu = `development` → `main` PR'ının açıklaması (`.github/pull_request_template.md` şablonu; HTML
  açıklamaları, boş maddeler ve boş bölümler `dev/release-notes.mjs` ile atılır). Açıklama boşsa son sürümden bu yana
  commit başlıkları yazılır. PR açıklaması kullanıcıya yönelik, İngilizce yazılır.
- Linux'ta uygulama XWayland ile açılır (`--ozone-platform=x11`, pencereler arası sekme sürükleme için); `npm run dev*`
  bunu ekler, paket başlatıcısı da, e2e testleri de. `JUMPDESK_WAYLAND=1` Wayland'da açar.
- Geliştirme sürümü (`npm run dev`) `jumpdesk-dev` masaüstü adıyla açılır; rıhtımda kurulu paketle karışmaz. Simgesi
  `npm run desktop-entry` ile kurulan `jumpdesk-dev.desktop` kaydından gelir (GNOME 47 pencere simgesini kullanmaz).
  Logo değişince `npm run desktop-entry` yeniden çalıştırılır (simge içerik özetli yola kopyalanır; GNOME yolu önbelleğe
  alır). Rıhtımdaki kurulu paket simgesi yalnız `.deb` yeniden kurulunca değişir.
- `windows.mjs` ayrı pencereleri görünür açar (`JUMPDESK_SHOW_DETACHED=1`); test sırasında ekranda pencere belirir.
- Ayrıntılar: `memory/implementation-notes.md`

## Proje özeti

- Amaç: JumpServer (açık kaynak PAM / bastion) için çok platformlu masaüstü istemcisi.
- Hedef: JumpServer v4 (Community) kurulumları; sunucu adresi uygulamaya gömülü değil, giriş ekranında girilir.
- Ayrıntılar: `memory/MEMORY.md`.
