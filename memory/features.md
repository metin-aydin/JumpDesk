---
name: features
description: Kullanıcının belirlediği en önemli özellikler (2026-10-14) — snippet paneli, autocomplete, otomatik komutlar, history, arama, düzen, yerel IP, hızlı bağlan
metadata:
  type: project
---

Kullanıcının verdiği öncelikli özellik listesi (2026-10-14). Tasarım bağlamı: [[desktop-design]],
kararlar: [[architecture-decisions]].

## Genel
- UI: **shadcn/ui** (onaylı). **Koyu ve açık tema** ikisi de olacak.
- Termius'un sağ paneli referans (kullanıcının ekran görüntüsü): üstte ikon sekmeleri (roket = snippetler,
  `{}` = değişkenler, saat = history, palet = tema), altında "Search terminal - Ctrl+Shift+F" arama kutusu
  (yukarı/aşağı okları), "Autocomplete BETA — Enabled" açılır seçimi. Başlık çubuğunda pencere düğmelerinin
  solunda bildirim zili ve **sağ paneli aç/kapat** düğmesi.

## Özellikler
1. **Snippetler (ön kayıtlı komutlar):** 34. turdan beri uygulamada yerleşik liste yok; kullanıcı düzenleyiciden ekler
   ya da `.jumpdesk` dosyasından içe aktarır (bkz. 34. tur).
   Her birinin anlaşılır bir **adı** ve komutu var. Sağ panelde Termius'taki gibi listelenir; tıklayınca
   aktif terminalde **doğrudan çalışır**.
2. **Terminal autocomplete:** hem komutlar hem de bulunulan klasördeki dosya/dizin ağacı önerilir ve doldurulur.
3. **Bağlantı sonrası otomatik komutlar:** snippetler arasından seçilir; **yerelde saklanır**, **sunucu bazında**
   değiştirilebilir.
4. **Renkli terminal (komutlar).**
5. **Sağ panel:** başlık çubuğundaki düğmeyle açılır; **Snippetler** ve **History** sekmeleri.
   History: sunucuda `history` çalıştırılır, her komut satır satır listelenir, tıklayınca çalıştırılır.
6. **Sol ağaçta arama** (ağaç lazy yükleniyor; arama için ayrı API kullanılabilir).
7. **Sekmeleri yerleştir:** Xshell'deki "Arrange vertically / horizontally" gibi tüm açık sekmeleri eşit boyda
   yan yana/alt alta sığdır; sonra yeniden boyutlandırılabilir. Sekmeye sağ tık menüsünden de erişilebilir.
8. **Sekme sırası sürükle-bırak** ile değişir.
9. **Sunucunun yerel IP'si:** her bağlantıdan sonra yerelde saklanır, ağaçta sunucu adının yanında gösterilir.
10. **Serbest sekme / hızlı bağlan:** yeni sekmede IP ya da sunucu adı yazılan, autocomplete yapan bir input ile
    doğrudan bağlanma.

## Kullanıcı yanıtları (2026-10-14)
- **Renkli terminal: üçü birden** — (a) yazılan komutun sözdizimi renklensin, (b) çıktıda anahtar kelime/IP
  vurgulama, (c) sunucu kabuğu renkli (renkli PS1, `ls`/`grep` renkleri).
- **Yerel IP: sunucunun içinden alınan IP** (`hostname -I`), yerelde saklanır, ağaçta adın yanında.
- **History:** sekme açılınca **aynı oturumda** otomatik çalıştırılsın, panelde gösterilsin; her yeni komut
  otomatik eklensin; history içinde **arama** olsun. İkinci gizli oturum açılmaz.
- Snippetler kullanıcıya özel kayıtlarda (`stores/snippets.ts`); yerleşik liste 34. turda kaldırıldı.

## Uygulama yaklaşımı (kabuk entegrasyonu)
- Bağlantı sonrası ilk istemde (çıktı ~400 ms durulunca) tek satırlık kurulum gönderilir:
  ` eval "$(printf %s <base64> | base64 -d)"` (başta boşluk → HISTCONTROL ignorespace).
- Kurulum bash/zsh'ta `PROMPT_COMMAND`/`precmd` ile her istemde özel OSC dizileri yayar:
  `ESC ] 6973 ; <tür> ; <base64> BEL` — C=cwd, L=klasör listesi, X=son komut (numarayla), H=tüm geçmiş,
  I=yerel IP, K=`compgen -c` komut listesi, B=istem sonu (girdi başlangıcı, PS1 sonuna eklenir).
- xterm `parser.registerOscHandler(6973)` ile yakalanır; ekranda görünmez. Kurulum satırının yankısı yerelde
  bastırılır (ilk OSC görülene kadar çıktı tutulur, sonra `\r\x1b[2K` ile eski istem satırı temizlenir);
  3 sn'de OSC gelmezse tutulan çıktı olduğu gibi gösterilir (yedek yol).
- Yalnız linux/unix platformlarda ve ssh protokolünde kurulur; ağ cihazlarına gönderilmez.
- JumpServer komut denetiminde kurulum satırı bir komut olarak görünür (beklenen, şeffaf).

## Durum (2026-10-14 sonu, mock'ta e2e ile doğrulandı)
- ✅ 1 Snippet paneli (tıkla-çalıştır); liste kullanıcının kendi kayıtlarından (34. tur).
- ✅ 2 Autocomplete (geçmiş + snippet + `compgen -c` komutları + bulunulan klasör girdileri; Tab/→ kabul, ↑↓, Esc).
  Eksik: alt klasör yolları (`dir/xx`) için liste yok — yalnız bulunulan klasör.
- ✅ 3 Bağlanınca otomatik komutlar (snippet satırındaki ⚡, sunucu bazında `ServerMeta.autoRun`, ilk istemden sonra çalışır).
- ✅ 4 Renkler: (a) komut satırı boyama, (b) çıktı vurgulama, (c) kabuk renkleri (PS1 renksizse sarılır, ls/grep alias).
- ✅ 5 Sağ panel (başlık çubuğu düğmesi, Ctrl+Shift+B): Snippetler + Geçmiş (arama, tıkla-çalıştır, canlı ekleme).
- ✅ 6 Ağaçta arama (`assets/tree/?search=`), ✅ 7 yan yana/alt alta yerleştirme, ✅ 9 yerel IP (`hostname -I`).
- ⚠️ 8 sekme sürükle-bırak ve ⚠️ 10 yeni bağlantı sekmesi: yazıldı, e2e'de denenmedi.
- 🟡 RDP: `features/rdp/RdpPane.tsx` yazıldı (guacamole-common-js 1.5.0 → `/lion/ws/connect/`, TOKEN_ID/GUAC_*,
  `tr-tr-qwerty`, sığdırma ölçeği, sendSize, iki yönlü pano, jms_event). Derleniyor; **uçtan uca test edilmedi**
  (guacd + RDP hedefi gerekir: gerçek sunucu ya da Docker imajları — kullanıcı onayı bekleniyor).
- ⏳ Paketleme, tercihler ekranı (autocomplete/vurgulama anahtarları `stores/preferences.ts`'de var, arayüzü yok).

## Kullanıcı istekleri — 2. tur (2026-10-14, hepsi mock e2e ile doğrulandı)
- Görünmeyen sekmede yeni çıktı → sekme simgesinin sağ üstünde mavi rozet (ilk karşılama çıktısı sayılmaz;
  sekme etkinleşince silinir; grup sekmesinde üyelerden biri varsa gösterilir).
- Ağaçta/aramada IP asla kırpılmaz (`shrink-0 whitespace-nowrap`), ad kısalır.
- Bölünmüş görünüm: grup başına tek sekme + panel başlıkları (8. turdan beri birden çok grup) (ayrıntı: [[architecture-decisions]] madde 5). Ek olarak
  ızgara düzeni ve gruba yayın (girdi/snippet/geçmiş tüm panellere; panel başlığından tek tek hariç tutma).
- Ağaçta çoklu seçim (Ctrl/Shift+tık, Shift+ok): sağ tık "N sunucuya bağlan" ve Enter tümüne bağlanır;
  sağ tıklanan öğe seçimde değilse seçim yalnız o öğe olur.

## Kullanıcı istekleri — 3. tur (2026-10-15, mock e2e ile doğrulandı)
- Ağaç satırı taşması: uzun hostname adresleri artık gösterilmez (yalnız IP gösterilir: `displayAddress`), satır
  `overflow-hidden`, ad `…` ile kısalır; iç IP hiç kırpılmaz.
- Menü metinleri Title Case ([[user-preferences]]).
- "Yeni Bağlantı" sekmesi ana ekranla aynı bileşen (`HomeView tabId=...`): son bağlantılar + favoriler; seçilen sunucu
  o sekmede açılır. Yer tutucu: "Sunucu adı veya IP adresi yazın". `ConnectView` silindi.
- Sekmelerde başlığın altında soluk IP (iç IP, yoksa IP biçimindeki adres). Sekme yüksekliği 32px.
- Sekme üzerine gelince (500 ms) Chrome tarzı önizleme kartı: tam ad, iç IP · adres · durum, terminalin renkli anlık
  görüntüsü (`@xterm/addon-serialize` → HTML, görünür satırlar) ya da RDP küçük resmi (`display.flatten()`); kart
  açıkken sekmeler arası geçiş anında, 1 sn'de bir tazelenir. Grup sekmesinde üyeler listelenir.
- Sunucu arama kısayolu Ctrl+Shift+F.
- Profil düğmesi hatası giderildi; altta tam ad + kullanıcı adı, menüde ad/kullanıcı adı/sunucu.

## Kullanıcı istekleri — 4. tur (2026-10-15, mock e2e ile doğrulandı)
- Autocomplete: ↑/↓, PageUp/Down, Ctrl+P/N, Ctrl+R ile geçmişte gezinirken otomatik açılmaz (yazmaya başlayınca
  yeniden açılır). **Ctrl+Space** elle açar; boş satırda son geçmiş komutları, hiç veri yoksa "Öneri yok" gösterir.
- Sekme önizlemesi kırpılmaz: terminal HTML'i doğal boyutta çizilip karta (340×≤260) sığacak şekilde ölçeklenir.
- **Uygulama ikonu = B varyantı** (renkli karo, beyaz `>_`, beyaz şeritte "JUMP"; 34. turdan beri Claude turuncusu).
  Kaynak `build/icon.svg`; `build/icon.png` 1024 (electron-builder .ico/.icns'i buradan üretir),
  `resources/icon.png` 512 (pencere ikonu, Win+Linux), `src/renderer/src/assets/app-icon.svg` (başlık çubuğu,
  giriş ekranı). PNG üretimi: `electron dev/render-svg.cjs <svg> <önek> <boyutlar>`.
  Not: GNOME/Wayland'da görev çubuğu ikonu .desktop kaydından gelir; geliştirme modunda Electron ikonu görünebilir.
- Giriş ekranında tema menüsü: açılır menü açıkken giriş WebContentsView'ı gizlenir (`stores/overlay.ts`).
- Ağaçta sunucu üzerine gelince kart (`AssetHoverCard`): ad, platform, iç IP, adres, protokoller, hesaplar
  (asset detail önbellekli), son bağlantı, açıklama. Yerel `title` ipucu kaldırıldı.
- Çıkışta/oturum düşünce çalışma alanı sıfırlanır (`useWorkspace.reset`); yeniden girişte eski sunuculara bağlanılmaz.
- **HTTP/web konsol varlıkları:** `GET /api/v1/terminal/components/connect-methods/?os=&asset_id=` → protokolün
  `type: applet` yöntemi (ör. `chrome`, component `tinker`) ile token: `connect_method=<applet>`,
  `connect_options={appletConnectMethod:'web'}`; görüntü lion (`RdpPane`). Luna da tinker'ı lion ile açar.
  `@ANON` hesapta kimlik bilgisi sorulmaz.
- Ad-soyad: profildeki `name` olduğu gibi gösterilir (kullanıcı tahmin istemedi, 5. tur). JumpServer profil API'sinde
  ayrı soyad alanı yok.

## Kullanıcı istekleri — 5. tur (2026-10-15, mock e2e ile doğrulandı)
- Logo: alttaki beyaz şeritteki "JUMP" yazısı kaldırıldı (küçükte okunmuyordu); şerit boş beyaz.
- Snippetler kullanıcının listesiyle değiştirildi: **`src/renderer/src/features/snippets/snippets.txt`** (kullanıcının
  biçimi; `####` arası `# Grup`, sonra `# Ad` + komut). `snippets.ts` çalışma anında ayrıştırır. Panel grupları açılır/kapanır
  (açıklar localStorage'da), aramada eşleşen gruplar açılır. Snippet id = ad slug'ı.
- Bölünmüş görünümde panel başlığından sürükle-bırak → hedef panelle yer değiştirir (`swapInGroup`), Esc iptal.
- Ad tahmini kaldırıldı.
- Windows/RDP/web oturumlarında iç IP: adres IP ise o, değilse istemci DNS'iyle çözümleme (`net.resolve` IPC,
  `dns.promises.lookup`). Linux entegrasyonu 10 sn'de IP vermezse aynı yedek.
- Klasör sağ tık → "Yenile" (önbellek + açık alt klasörler yeniden yüklenir).
- Etiketler (yerel, `ServerMeta.tags`): sağ tık "Etiketleri Düzenle" / çoklu "N Sunucuyu Etiketle" (`TagDialog`),
  aramada ad/IP ile birlikte eşleşir (`#etiket` = tam eşleşme, yalnız yerel), sonuçlarda ve ağaç kartında renkli çip.
- Sekme / panel başlığı sağ tık → "Klasörde Göster" (6. turda düzeltildi, aşağıya bakın).

## SFTP (eski not; uygulanan hâli aşağıda "SFTP dosya yöneticisi")
- koko v4.10 web SFTP: `wss://host/koko/ws/sftp/?token=<id>` (çerez auth), mesajda `cmd`: `list`, `download`,
  `upload`, `rm`, `rename`, `mkdir` (+`current_path`); token `protocol: sftp`, `connect_method: web_sftp`.
  Yetki sunucuda: varlıkta `sftp` protokolü izinli olmalı, hesap `actions` içinde upload/download/delete denetlenir
  (`ConnectToken.Actions.EnableUpload()` vb.). Eski arayüz: `/koko/elfinder/sftp/?token=`. 2222 SFTP yalnız 443 açık ağlarda kapalı olabilir.

## Kullanıcı istekleri — 6. tur (2026-10-15, mock e2e ile doğrulandı)
- **"Klasörde Göster" düzeltmesi:** v4'te `assets/tree/?id=` tüm varlıklar için `pId: 'root'` döner (anahtar vermez).
  Doğru yol: `assets/<id>/` detayındaki `nodes` (klasör UUID listesi) → `nodes/children-with-assets/tree/?id=<uuid>`
  → dönen varlığın `pId`'si klasör anahtarı → yol sırayla açılır. Bulunamazsa toast. Mock da gerçeğe uyduruldu.
- Etiket penceresi: Enter'a basılmamış metin "Kaydet"te ve odak kaybında etikete dönüşür.
- Panel sürükleme: tutulan panel küçük kopyasıyla (anlık görüntü) imleci izler, eski yerinde kesik çizgili yuva kalır,
  imleç başka yuvaya gelince sıra canlı değişir ve paneller 200 ms kayar; bırakınca `reorderGroup`, Esc iptal.
- Sekme sürükleme (Chrome tarzı): sekme imleci izler (inline transform), sıra değişince diğerleri FLIP animasyonuyla kayar.
- Profil: tek satır `[baş harf] Ad · kullanıcı_adı ˅`; ad `…` ile kısalır, kullanıcı adı hep tam (ad = kullanıcı adı
  ise tek yazılır).
- Sağ tık "Bağlan": hatırlanan hesap yok sayılır, hesap yeniden sorulur (`chooseAccount`). Çift tık hatırlanan hesabı
  kullanır. Hatırlanan hesapla token alınamaz ya da ilk bağlantı hata verirse hesap unutulur (`forgetAccount`).
- "SSH Guide" menü öğesi kaldırıldı.
- Bölünmüş görünüm panel başlığı: sağ tık menüsü (Büyüt/Küçült, Ayrı Sekmeye Al, Klasörde Göster, Kapat); el/tutma
  imleci yok.
- Ubuntu görev çubuğu ikonu: Electron `CHROME_DESKTOP=jumpdesk.desktop` (paket adından) → GNOME/Wayland app_id `jumpdesk`.
  Geliştirme için `npm run desktop-entry` (`dev/install-desktop-entry.sh`) `~/.local/share/applications/jumpdesk.desktop`
  + `~/.local/share/icons/hicolor/<boyut>/apps/jumpdesk.png` (48–512, `build/icons/`) kurar (`--remove` ile kaldırılır). 2026-10-15'te kullanıcının
  makinesine kuruldu. Paketler (deb/AppImage) kendi kaydını kurar.
- SFTP: karar verildi ve uygulandı (aşağıda).

## Kullanıcı istekleri — 7. tur (2026-10-15, mock e2e ile doğrulandı)
- **HTTP/RDP siyah ekran:** Guacamole varsayılan katman tuvaline `z-index:-1` verir; görüntü kabının kendi katman
  bağlamı yoksa tuval siyah zeminin arkasında kalır (önizleme `flatten()` ile çizildiği için içerik orada görünür).
  Çözüm: `RdpPane` görüntü kabında `isolate`. Doğrulama: mock'taki sahte lion (`handleLion`) + `dev/e2e/rdp.mjs`.
- **Ana sayfa sekmesi kaldırıldı** (logonun yanındaki 4 kutucuk): sekme türleri `connect | session`. Hiç sekme
  kalmayınca otomatik "Yeni Bağlantı" sekmesi açılır; açılışta da tek bir "Yeni Bağlantı" sekmesi vardır. Etkin sekme
  boş bir bağlantı sekmesiyse ağaçtan/aramadan açılan bağlantı o sekmeye yerleşir (yeni sekme açılmaz).
- "Yeni Bağlantı" sekme ikonu: lucide `File` (boş sayfa).
- **Profil fotoğrafı:** `users/profile/` → `avatar_url` (göreli yol). Ana süreç `jmsImage` ile oturum çereziyle indirir,
  data URL döner (CSP dış görseli engeller; yalnız sunucunun kendi origin'i, ≤2 MB, `image/*`). IPC `jms:avatar`.
  Profil menüsünde ad/kullanıcı adı satırlarının sağında 32 px yuvarlak; görsel yoksa baş harfler.
- **Uygulama ikonu (yuvarlak/pofuduk):** 1024 tuvalde 832 px karo (96 px kenar boşluğu, GNOME rıhtımında diğer
  ikonlarla aynı boy), `rx=208`, dikey kırmızı degrade + üstte hafif parlaklık, yumuşak gölge; `>_` yuvarlak uçlu,
  beyaz bant tüm köşeleri yuvarlak. `build/icon.svg` (OS, gölgeli) ve `assets/app-icon.svg` (başlık çubuğu, boşluksuz)
  aynı çizimdir. PNG'ler: `build/icon.png` 1024, `resources/icon.png` 512, `build/icons/<n>x<n>.png` (electron-builder
  linux `icon: build/icons`).

## SFTP dosya yöneticisi (2026-10-15, karar: kendi arayüzümüz + "ikisi birden"; mock e2e ile doğrulandı)
- Kullanıcı: JMS'in dosya yöneticisinin kullandığı koko SFTP kanalı üstüne kendi arayüzümüz; hem sağ panelde hem ayrı
  sekmede. Protokol: [sftp-koko-protocol.md](sftp-koko-protocol.md).
- **Sağ panel "Dosyalar"** (Snippetler/Geçmiş yanında): etkin SSH terminalinin token'ı `exchange` edilir (hesap
  sorulmaz). Açılış klasörü **`/tmp`** (`FILES_START_PATH`; SFTP kökü dışındaysa kök). "Terminali İzle" (cd takibi)
  kullanıcı isteğiyle **kaldırıldı** (8. tur). Son klasör oturum başına hatırlanır. "Ayrı Sekmede Aç" aynı token'dan
  sekme açar; sekme de `/tmp` ile (ya da panelin klasörüyle) açılır.
- **Dosya yöneticisi sekmesi:** `WorkspaceTab.view = 'files'` (+`startPath`, `sourceToken`, `sourceActions`); sekme
  ve panel başlığında OS renginde klasör rozeti. Ağaç sağ tık → "Dosya Yöneticisi" (yalnız linux türü; çoklu seçimde
  "N Sunucuda Dosyaları Aç"); hesap seçimi "Dosya yöneticisi için hesap seçin", protokol seçeneği yok.
- Arayüz (`features/sftp/FileBrowser.tsx`): yol çubuğu (parçalar tıklanır, çift tık = yol yaz, kök dışı parçalar
  pasif), süzme, klasör önce + Türkçe doğal sıralama, sekmede sıralanabilir sütunlar (Ad/Boyut/Değiştirilme/İzinler)
  ve durum çubuğu (öğe/seçili/toplam, kök). Çoklu seçim (Ctrl/Shift), klavye (↑↓, Enter, Backspace, Delete, F2, F5,
  Ctrl+A, Esc). Sağ tık: Aç, Terminalde Bu Klasöre Geç, İndir/Zip Olarak İndir, Yeniden Adlandır, Yolu Kopyala, Sil
  (onay penceresi); boş alan: Yeni Klasör, Dosya Yükle, Yenile. Masaüstünden sürükle-bırak yükleme (klasör değil).
- İndirme: ana süreç İndirilenler'e akıtarak yazar (`downloads.ts`, IPC `download:*`, aynı ad → `ad (1).uzantı`),
  bitince toast + "Klasörde Göster". Aktarımlar panelin/sekmenin altında ilerleme çubuğuyla; yükleme iptal edilebilir.
- Yetki: hesabın `actions`'ında upload/download/delete yoksa ilgili düğmeler pasif; sunucu da reddeder.
- Mock: `/koko/ws/sftp/` (kök = varlığın ev dizini, gizli dosyalar gizli), `deploy` hesabında upload/delete yok.
  Test: `node dev/e2e/sftp.mjs <klasör>` (JUMPDESK_DOWNLOADS ile indirme klasörü).
- Gerçek sunucuda doğrulanmadı: platformun SFTP kökü (`sftp_home`) değeri. Kullanıcı açılışta `/tmp`
  istedi (8. tur).

## Kullanıcı istekleri — 8. tur (2026-10-15, mock e2e ile doğrulandı: smoke, sftp, tabs)
- **Birden çok grup:** `workspace.groups: TabGroup[]` (her grubun `id`, `mode`, `zoomedId`, `broadcast`, `excluded`,
  `layoutVersion`, `focusedId`'si var). Gruplanmamış bir sekmede "Yan Yana/Alt Alta/Izgara" yalnız **gruba ait
  olmayan** oturumları yeni bir grupta toplar; var olan gruplar korunur. Gruptaki sekmede aynı menü o grubun düzenini
  değiştirir (`arrange(mode, tabId)`). Yeni grubun üyeleri şeritte ilk üyenin yerinde yan yana toplanır. Panel
  boyutları grup + `layoutVersion` anahtarıyla tutulur.
- **Sekme sağ tık "Tümünü Kapat"** (`closeAll`): tüm sekmeler/gruplar kapanır, tek "Yeni Bağlantı" kalır. Grup
  sekmesinde de var.
- **Klasör sağ tık → "Klasördeki Sunuculara Bağlan ▸"** alt menüsü: "Tümünü Yan Yana / Alt Alta / Izgara Şeklinde
  Açarak Bağlan". Yalnız klasörün **doğrudan** altındaki sunucular (`TreeDataSource.directAssets`: API'den taze,
  `pId === key`, devre dışı olanlar hariç); sayı alt menü başlığında. `openGroup(assets, mode)` hepsini tek grupta açar.
- **Çoklu seçim sağ tık:** "N Sunucuya Bağlan" (ayrı sekmeler) + "N Sunucuya Farklı Bağlan… ▸" (aynı alt menü,
  `ConnectAllSubmenu`, `showCount={false}`: sağında sayı yok; klasör menüsünde sayı gösterilir). Adresi/Yerel IP'yi/Adı
  Kopyala çoklu seçimde gizli. (Metinler kullanıcı isteğiyle, 2026-10-15.)
- **Chrome tarzı sekme şeridi:** sekme genişliği JS ile hesaplanır (`tabWidth`: en çok 224, en az 44 px; eşit
  genişlik). 88 px altında başlık ve kapatma gizlenir, yalnız simge kalır. En küçükte de sığmazsa şerit yatay kayar
  (4 px kaydırma çubuğu, dikey tekerlek yatay kaydırır, etkin sekme görünür alana kaydırılır).
  Not: CSS container query (`@container`) sekmelerin doğal genişliğini sıfırladığı için kullanılmadı.
- **Sekme arama** (Chrome'daki gibi): tema düğmesinin solunda ⌄ düğmesi, kısayol Ctrl+Shift+A (⌘⇧A). Arama ad, IP,
  adres ve etiketlerde; ↑↓/Enter, satırda kapatma; gruptaki sekmede düzen simgesi. Depo `stores/tab-search.ts`.
- **Sekme sürükleme tam genişlik:** tutulan sekmenin kopyası (`position: fixed`) pencere boyunca imleci izler, + ve
  şeridin ötesine gidebilir; yerinde boşluk kalır; şerit kayabiliyorsa kenarda kendiliğinden kayar.
- **Dosya silme onayı:** pencere kapanırken başlığın "undefined" olması düzeltildi (liste açık durumundan ayrı tutulur).
- **Logo:** üstteki parlaklık azaltıldı (degrade başı koyulaştırıldı, parlama opaklığı 0.08). Görev çubuğundaki bulanıklık:
  `render-svg.cjs` SVG'yi 1024'te çizip küçültüyordu; artık kök width/height hedef boyuta ayarlanıp her boyut vektörden
  çizilir. Boyutlar 16–512 (`build/icons/`), `npm run desktop-entry` ile kuruldu.
- **Profil satırı:** profil düğmesi kalan alanı kaplar, ok kaldırıldı, sağında sürüm etiketi `v<package.json
  version>` (`__APP_VERSION__`, electron.vite.config `define`).
- Kural eklendi: her yanıttan sonra hafıza ve proje md dosyaları kendiliğinden güncellenir (CLAUDE.md).
- Test: `node dev/e2e/tabs.mjs <klasör>` (klasör alt menüsü, ikinci grup, arama, tümünü kapat, taşma, uzak sürükleme,
  çoklu seçim menüsü).

## Kullanıcı istekleri — 9. tur (2026-10-15, mock e2e ile doğrulandı: smoke, sftp, tabs)
- Grup sekmesi sağ tık: "Gruptaki N Oturumu Kapat".
- **Profil fotoğrafı tek kaynak:** profil düğmesi ve açılır menü aynı `UserAvatar`'ı kullanır; JumpServer
  `avatar_url` görseli indirilebiliyorsa o, değilse **adın baş harfi** (tek harf). Not: JumpServer fotoğrafı olmayan
  kullanıcıya varsayılan bir avatar görseli (`/static/img/avatar/...`) döndürebilir; o da fotoğraf olarak gösterilir.
- **Grup sekmesi sürüklenir:** grup, üyeleriyle birlikte blok olarak taşınır (`moveBlock(ids, toIndex)`); tekli
  sekmeler de aynı yoldan taşınır. Sürüklenen bloğun üyeleri kayma animasyonundan muaf.
- **Araç ipuçları baş harf kuralı:** tüm tooltip/`title` metinleri her kelimenin baş harfi büyük (CLAUDE.md kuralı).
  Düzeltilenler: "Bölünmüş Görünümde", "Sağ Paneli Aç/Kapat (…)", "Sürükleyerek Boyutlandır, Çift Tıklayarak Eşitle",
  "Yolu Düzenlemek İçin Çift Tıklayın", "Platformda Tanımlı SFTP Kök Dizini", "Dosya Yükleme Yetkiniz Yok".
- **Geçmiş sekmesine geçişte donma:** sebep komut değildi (geçmiş oturum kurulurken bir kez okunur); 500 satırın her
  biri için ayrı Base UI ContextMenu oluşturuluyordu. Şimdi liste sanal (tanstack virtual), tek paylaşılan sağ tık
  menüsü (kontrollü `open`, boş alanda açılmaz), geçmiş `useDeferredValue(history, [])` ile ertelenir; açılışta
  "Geçmiş hazırlanıyor…" yükleniyor simgesi görünür. Satır sınırı (500) kaldırıldı.

## Kullanıcı istekleri — 10. tur (2026-10-15, mock e2e ile doğrulandı: smoke, sftp, tabs)
- **Bağlanırken tek görünüm:** token alınırken ve WebSocket bağlanırken aynı `LoadingState` kutusu, aynı metin
  (`<sunucu> bağlanıyor…`), aynı yer (terminal zemini üstünde ortada). `components/LoadingState.tsx`.
- **Dosyalar yükleniyor tek görünüm:** panel, sekme ve dosya tarayıcının tüm hazırlık aşamaları alanın ortasında
  aynı metinle (`FILES_LOADING_LABEL` = "Dosya oturumu açılıyor…"); üstte çıkıp ortaya zıplama giderildi.
- **Sekmeyi sürükleyip açık gruba bırakma:** gruba ait olmayan tek bir oturum sekmesi, grup görünümü açıkken çalışma
  alanına (`[data-workspace]`) sürüklenirse kesik çizgili "Gruba Ekle" alanı çıkar; bırakınca `addToGroup` ile grubun
  sonuna eklenir. Bunun için sekme **basınca değil bırakınca** etkinleşir (sürükleme sırasında grup görünür kalır).
  Grup sekmesi basınca etkinleşmeye devam eder.
- **Grup sekmesinde sayı:** "+N" yerine gruptaki toplam sunucu sayısı (araç ipucu "N Sunucu").
- **Sekme aramada önizleme:** satır üzerine gelince sekme önizleme kartı listenin solunda açılır
  (`TabPreviewCard placement="left"`, alttan taşarsa yukarı kaydırılır).

## Kullanıcı istekleri — 11. tur (2026-10-15)
- Sağ tık ve açılır menülerde simgesi olmayan öğeler (ör. "Diğerlerini Kapat") simgeli öğelerin metniyle aynı hizada:
  `MenuItem` için `not-has-[>svg]:pl-7.5`, alt menü tetikleyicisi için `not-has-[>svg:not(:last-child)]:pl-7.5`
  (tetikleyicinin sonundaki ok simgesi sayılmaz). Doğrulama: `node dev/e2e/menus.mjs` (simgesiz öğe 30 px, simgeli 8 px).

## Kullanıcı istekleri — 12. tur (2026-10-15, mock e2e: panels, smoke, tabs)
- **Sol sunucu ağacı kapatılabilir:** başlık çubuğunda logonun sağında aç/kapat düğmesi ("Sunucu Ağacını Aç/Kapat"),
  kısayol **Ctrl+Shift+E** (⌘E). Durum `workspace.leftPanelOpen`, localStorage `jumpdesk.leftPanelOpen` ile saklanır.
  Kapalıyken Ctrl+Shift+F ve "Klasörde Göster" ağacı kendiliğinden açar.
- **Kayma efekti (sol ve sağ panel):** `components/SlidePanel.tsx` — dış kap genişliği 0↔genişlik arasında 200 ms
  canlandırılır, içerik sabit genişlikte kenara yaslı kaldığı için kayarak girip çıkar; kapalıyken `inert`.
  Sol ağaç hep bağlı kalır (ağaç durumu korunur), sağ panel kapanma bitince kaldırılır. Sol panel kenardan
  boyutlandırılırken canlandırma kapalı. Sağ panel genişliği 320 px (`App.tsx`).
- Test: `node dev/e2e/panels.mjs <klasör>` (ara genişlik ölçümüyle canlandırma, inert, kısayollar).

## Kullanıcı istekleri — 13. tur (2026-10-15, mock e2e: home, panels, smoke, tabs, menus, sftp)
- **Sağ panel genişliği ayarlanır:** sol kenarındaki tutamaçtan (260–640 px, varsayılan 320), localStorage
  `jumpdesk.rightPanelWidth`. Sol ağaçla ortak kanca `hooks/use-panel-width.ts`; sürüklerken kayma canlandırması kapalı.
- **Yeni Bağlantı ekranında "Klasörler" bölümü** (Son Bağlantılar'ın altında, `features/workspace/FolderBrowser.tsx`):
  ağaçtaki klasörler ızgara kartlar olarak; tek kök klasör (Default) varsa doğrudan onun içinden başlar, kökteki
  Favoriler atlanır (ayrı bölümde). Klasöre **çift tıkla** girilir; alt klasörler ve doğrudan altındaki sunucular
  listelenir. Her açılışta kökten başlar.
- **Yol çubuğu (breadcrumb)** başlığın yanında; 4 seviyeyi aşarsa ortası "…" açılır menüsüne toplanır, adlar yalnız
  sığmadığında kısalır (son ad daha geç kısalır).
- **Ağaçtaki gibi etkileşim:** tek tık seçer, Ctrl/Shift ile çoklu seçim (Shift aralığı çapadan), boş alana tık seçimi
  kaldırır. Sunucu sağ tık = `AssetContextMenu` (çoklu seçimde "N Sunucuya Bağlan" / "N Sunucuya Farklı Bağlan…"),
  klasör sağ tık = `FolderContextMenu` ("Klasörü Aç", "Klasördeki Sunuculara Bağlan ▸"). Enter seçili tüm
  sunuculara bağlanır (ilki bu sekmede). Sunucu kartı `AssetCard.tsx`, kart stilleri `card-styles.ts`.
- Ağacın klasör menüsü de aynı `FolderContextMenu`'yu kullanır (ağaçta "Yenile" ile); `fetchDirectAssets` tree-data'da.
- Mock'a derin/uzun adlı klasör zinciri eklendi (Partner A › Bölge Ofisleri… › Merkez Kampüs › Ana Veri Merkezi… ›
  dr-site-01) — yol çubuğu taşmasını denemek için.

## Öneri tartışması — Java exception yakalama ve yeni özellikler (2026-10-15)
- **Karar:** kullanıcı "Terminalde arama + alarm kelimeleri" ve "Çalışma düzeni + komut paleti"ni seçti; exception
  yakalayıcı ve arka plan log izleme seçilmedi. Java paket öneki yok ("bizim kod" çerçevesi aranmayacak).
- Kullanım senaryosu: uygulama logları `tail` ile izlenip exception takibi yapılır; yakalayıp haber veren bir şey istendi.
- Teknik dayanak: terminal çıktısı zaten `TerminalPane` içinde `OutputHighlighter.process(text)` üzerinden geçiyor;
  aynı noktaya satır tabanlı bir dedektör eklenebilir (sunucuda kurulum gerekmez). Masaüstü bildirimi henüz yok
  (Electron `Notification` eklenecek). `@xterm/addon-search` kurulu ama kullanılmıyor.
- Önerilen tasarım (A, ön planda tail): Java yığın izini yakala (`pkg.XxxException: mesaj` / `Exception in thread`,
  `\tat ...(Foo.java:42)`, `Caused by:`, `... N more`, log4j/logback `ERROR` satırları) → tek olay; kök neden (son
  Caused by), "bizim kod" ilk çerçevesi (paket öneki ayarı, ör. `com.example`); aynı tür+çerçeve tekrarları sayaçla
  gruplanır. Bildirim: sekme/panel rozeti (kırmızı), pencere ya da sekme odakta değilse masaüstü bildirimi, sağ panelde
  "Hatalar" sekmesi (zaman, sunucu, tür, mesaj, kök neden; tıkla → terminalde o satıra git; yığını kopyala; yoksay).
  Tahmin: ~1 gün.
- Seçenek B (arka plan log izleyici): tail açık olmasa da seçilen log dosyalarını gizli bir koko oturumunda
  `tail -F` ile izlemek; snippet'lerdeki log yolları kaynak olabilir. Dikkat: her izleyici JumpServer'da gerçek bir
  oturumdur (oturum listesi, kayıt/replay, komut denetimi, boşta zaman aşımı). Tahmin: +1–1,5 gün.
- Diğer öneriler: terminalde arama (Ctrl+F, ~1 saat), kendi regex anahtar kelime alarmları (~2 saat, A'nın
  genellemesi), kayıtlı çalışma alanları/düzenler (~3 saat), oturum çıktısını dosyaya kaydetme (~1 saat), komut
  paleti (~2–3 saat).

## Kullanıcı istekleri — 14. tur (2026-10-15, mock e2e: tools + tüm paketler)
- **Terminalde arama:** `Ctrl+Shift+S` (⌘S; `Ctrl+F` less/vim/readline'a bırakıldı), komut paleti ya da alarm olayı.
  `@xterm/addon-search` + `TerminalSearchBar.tsx`: tüm eşleşmeler vurgulu, "n/N" sayaç, Aa (büyük/küçük harf), .*
  (düzenli ifade), Enter/Shift+Enter, Esc. Terminal tutamağında `openSearch(text?)` (seçili metinle başlar).
- **Alarm kelimeleri** (`stores/alarms.ts`, `features/alarms/`): kurallar localStorage `jumpdesk.alarmRules`;
  varsayılan iki kural açık: `Exception`, `OutOfMemoryError` (büyük/küçük harf duyarlı). Terminal çıktısı satırlara
  bölünür, ANSI temizlenir, alternatif ekran (less/vim) taranmaz; kullanıcının gönderdiği komutun yankısı (ör.
  `grep Exception`) sayılmaz. Aynı sekme + kural 3 sn içinde tek olayda "×N" birleşir. Kullanıcı bakmıyorsa sekmeye
  kırmızı rozet (`tab.alarm`, grup sekmesinde de), sağ panel düğmesinde kırmızı nokta, yeni olayda masaüstü bildirimi
  (aynı sekme + kural için 30 sn'de bir; tıklanınca pencere öne gelir, sekmeye geçer). Sağ panelde "Alarmlar"
  sekmesi (okunmamış sayısı rozetli): kurallar (aç/kapat, sil, ekle; Aa/.*) ve olaylar (tıkla → oturuma geç ve
  satırı terminalde arat; satırı kopyala; temizle). Test ortamında `JUMPDESK_NO_NOTIFY` bildirimi göstermez, sayar.
- **Kayıtlı çalışma düzenleri** (`stores/layouts.ts`, `features/layouts/`): açık oturumlar + gruplar (düzen, sıra)
  ad verilerek kaydedilir (localStorage `jumpdesk.layouts`, aynı ad üzerine yazar). Kaydet: sekme/grup sağ tık
  "Düzeni Kaydet…" ya da komut paleti. Yeni Bağlantı ekranında "Kayıtlı Düzenler" kartları (çift tık/Enter açar;
  sağ tık Aç / Yeniden Adlandır / Sil).
- **Komut paleti** `Ctrl+Shift+P` (`components/CommandPalette.tsx`, cmdk): Genel, Sekmeler (Sekmeye Geç: …),
  Görünüm (paneller, sağ panel sekmeleri, tema), Bölünmüş Görünüm, Çalışma Düzenleri (Düzeni Aç: …), Terminal
  (Terminalde Ara, Snippet Çalıştır: …). Sağ panel sekmesi artık `stores/right-panel.ts` deposunda (`show(tab)`).
- **Klavye kısayolları penceresi:** tema düğmesinin solunda klavye simgeli düğme ve `Ctrl+Shift+K`; liste
  `lib/shortcut-list.ts`'te tek yerde (pencere ve palet aynı kaynağı kullanır).
- Tuzak: shadcn `CommandDialog` kendi `Command` kökünü içermez; içerik `<Command>` ile sarılmazsa cmdk "subscribe"
  hatasıyla çöker.

## Kullanıcı istekleri — 15. tur (2026-10-15, mock e2e: tools, home + tüm paketler geçti)
- **Komut paleti vurgusu:** tüm öğeler seçili görünüyordu. Sebep: cmdk seçili olmayan öğelere `data-selected="false"`
  yazar, shadcn sınıfı `data-selected:` ise yalnız niteliğin varlığına bakar. `components/ui/command.tsx` içinde
  `data-[selected=true]:` kullanılır. Fare/ok tuşu seçimi taşır, Enter çalıştırır.
- **Komut paleti konumu:** ekranın üst ortası (`top-[12vh]`, `sm:max-w-xl`).
- **Klasör ızgarasında klavye:** ok tuşları kartlar arasında gezer ve seçer (yukarı/aşağı bir satır, sütun sayısı
  `grid-template-columns`'tan), Shift ile seçim genişler, Home/End, Enter klasörü açar / sunucuya bağlanır,
  Backspace üst klasöre çıkar; klasör değişince odak yeni listenin ilk kartına geçer (`data-nav-card`).
- **Görev çubuğu bildirim rozeti:** GNOME dock, uygulamanın bildirim merkezinde duran bildirimlerini sayar. Ana süreç
  gösterdiği bildirimleri tutar; Alarmlar sekmesi açılınca (okunmamış 0) tümü, alarmlı sekme açılınca o sekmeninkiler
  `Notification.close()` ile kaldırılır (`notify:clear`, `features/alarms/notification-sync.ts`).

## Kullanıcı istekleri — 16. tur (2026-10-15, mock e2e: tools, smoke, tabs)
- **Düzen = adlandırılmış grup:** grup sekmesinden (ya da etkin sekme bir gruptayken komut paletinden) "Düzeni
  Kaydet…" o grubu (sunucular + yerleşim) kaydeder ve grup sekmesi düzenin adını alır (`TabGroup.name`,
  `layoutId`); sekmede IP alt satırı yerine yalnız ad + sunucu sayısı. Düzen açılınca grup aynı adla gelir; düzen
  yeniden adlandırılınca açık grubun adı da değişir. Tekli sekmenin menüsündeki "Düzeni Kaydet…" tüm açık oturumları
  kaydeder (`openSave(null)`). Adlandırılmış grubu yeniden kaydederken ad hazır gelir (aynı ad üzerine yazar).
- **Kayıtlı düzen özeti** yalnız "N sunucu" (grup sayısı yazılmaz).

## Kullanıcı istekleri — 17. tur (2026-10-15, mock e2e: tools)
- Alarm olayına gelince çıkan "Satırı Kopyala" düğmesi satırı uzatıp zıplatıyordu. Düğme artık saatin üstüne mutlak
  konumla bindiriliyor (hover'da saat gizlenir, düğme görünür); satır yüksekliği sabit (test: 47.75 → 47.75 px).

## Kullanıcı istekleri — 18. tur (2026-10-15, mock e2e: tools + tüm paketler)
- **Grup içinde alarm rozeti:** grup panel başlığında (sunucu simgesinin sağ üstü) kırmızı rozet; grup sekmesinde de
  (üyelerden birinde alarm varsa). Rozet **yalnız o panele/sekmeye odaklanınca** kalkar: `activate(tabId)` artık yalnız
  o sekmenin alarm/etkinlik bayrağını siler (grup açılınca tüm üyeleri silmez). Grup ekranda olsa da alarm gelen panel
  odakta değilse rozet konur; masaüstü bildirimi ise yalnız oturum ekranda değilse ya da pencere odakta değilse çıkar.
  Pencereye dönülünce odaktaki oturumun rozeti kalkar (`window` focus).
- **Panel başlığına tıklama:** odak terminalde kalır/terminale geçer (başlık `mousedown`'da varsayılanı engeller ve o
  panelin terminaline odaklanır); önceden başlığa tıklayınca klavye girdisi hiçbir yere gitmiyordu.

## Kullanıcı istekleri — 19. tur (2026-10-15, mock e2e: tüm paketler)
- **Terminal araması Ctrl+F (⌘F):** kullanıcı Ctrl+F istedi. Kabukta (normal ekran) Ctrl+F aramayı açar; less/vim
  gibi tam ekran programlarda (alternatif ekran) tuş programa gider (sayfa ilerletme). Ctrl+Shift+S her yerde açar.
- **Dar panelde arama çubuğu:** çubuk panel genişliğini aşmaz (`max-w-[calc(100%-1rem)]`, giriş kutusu küçülür, düğmeler
  sabit); yan yana gruptaki ~386 px panelde sığdığı testle doğrulandı.
- **Klasör sağ tık:** "Klasördeki N Sunucuya Bağlan" (ayrı sekmeler, hesap yeniden sorulur — çoklu seçimdeki
  "N Sunucuya Bağlan" ile aynı) ve "Klasördeki N Sunucuya Farklı Bağlan… ▸" (yan yana / alt alta / ızgara). Sayı
  yüklenirken "Klasördeki Sunuculara …" + dönen simge; doğrudan sunucu yoksa "Klasörde Doğrudan Sunucu Yok".
  "Farklı Bağlan…" alt menüsünün simgesi `LayoutGrid`.

## Kullanıcı istekleri — 20. tur (2026-10-15, mock e2e: tools, smoke)
- **Dar panelde arama çubuğu iki satır:** terminal kabı `@container`; 28rem'den dar terminalde giriş kutusu üst satırda
  tam genişlik, sayaç (solda) ve düğmeler (sağda) alt satırda; daha geniş terminalde tek satır (w-56 giriş).
  Testte: geniş terminalde çubuk 34 px (tek satır), ~386 px panelde 62 px ve giriş 360 px.
- **Klasör menüsü yüklenirken** yalnız "Klasördeki Sunucular Okunuyor…" (dönen simge, pasif) görünür; "N Sunucuya
  Bağlan" ve "N Sunucuya Farklı Bağlan…" ikisi birlikte, sunucular yüklenince çıkar. Okuma hatasında "Sunucular
  Okunamadı". Test: `menus.mjs` (mock ağaç isteği 150 ms gecikmeli olduğu için yüklenme anı yakalanır).

## Kullanıcı istekleri — 21–23. tur (2026-10-15, mock e2e: 7 paketin hepsi)
- **Terminal bağlantıları yalnız Ctrl+Tık (⌘+Tık) ile açılır;** düz tık açmaz (seçim yapar). Bağlantının üzerine
  gelince imlecin üstünde (ilk satırlarda altında, kenarlara taşmadan) ipucu: URL + "Bağlantıyı Açmak İçin Ctrl +
  Tıklayın" (`LinkHint`, WebLinksAddon `hover`/`leave`).
- **Hayalet komut satırı düzeltmesi:** `clear`/`reset` sonrası komut renklendirmesi eski komutu boş ekrana yeniden
  yazıyordu; çıktıda ED 2/3 ya da RIS (`\x1b[2J`, `\x1b[3J`, `\x1bc`) görülünce yeniden boyama durur.
- **Alarmlar sayfası:** "Kurallar" bölümü ve "Olaylar" başlığı kaldırıldı; liste tüm alanı kaplar. Altta sabit çubuk:
  "Kurallar" düğmesi (çerçeveli, gölgeli — mavi dolgu kullanıcıya fazla belirgin geldi; açık kural sayısıyla) kuralları
  ayrı bir pencerede ("Alarm Kuralları") düzenler; "Alarmları Temizle" (silgi simgesi + yazı) olayları kaldırır. Çöp kutusu
  simgesi satır siliniyormuş gibi algılandığı için kullanılmaz.
- **Okunmamış sayısı oturum bazında:** olaylarda `read` bayrağı. Bir oturuma odaklanınca (sekme/grup paneli etkinleşir,
  pencereye dönülür) o oturumun olayları okundu sayılır ve o oturumun masaüstü bildirimleri kapatılır; böylece
  Alarmlar sekmesindeki sayı ve görev çubuğundaki bildirim sayısı o kadar düşer, tüm oturumlar gezilince sıfırlanır.
  Odaktaki oturumdan gelen alarm doğrudan okundu sayılır. Alarmlar sekmesini açmak hepsini okundu yapar. Listede
  okunmamış olayın noktası kırmızı, okunmuşun soluk.

## Kullanıcı istekleri — 24. tur (2026-10-15, mock e2e: tools, tabs, smoke)
- **Adlandırılmış grup sekmesi menüsü:** grup kayıtlı bir düzene bağlıysa "Düzeni Kaydet…" yerine "Düzeni Yeniden
  Adlandır…" (ad hazır gelir; aynı düzeni ve sekme adını değiştirir, yeni düzen oluşturmaz) ve "Düzeni Sil" (düzen
  silinir, grup açık kalır ve yeniden sunucu adıyla görünür — `unnameGroup`). Yeni Bağlantı ekranındaki kartta düzen
  silinince de açık grubun adı kalkar.
- **"Alarmları Temizle"** tüm sekme ve panel alarm rozetlerini (`clearAlarmBadges`) ve masaüstü bildirimlerini de
  kaldırır.
- **Orta tık grup sekmesini kapatır** (gruptaki tüm oturumlar; tekli sekmedeki gibi). Orta tuşa basınca tarayıcının
  otomatik kaydırma imleci çıkmasın diye `mousedown` varsayılanı engellenir (tekli sekmede de). (2026-10-15)

## Kullanıcı istekleri — 25. tur (2026-10-15, mock e2e: tools + tüm paketler)
- **Düzendeki değişiklikler:** düzene bağlı grup, kayıtlı hâlinden (sunucular, sıraları, yerleşim) farklıysa
  "değişmiş" sayılır (`isGroupDirty`, `TabGroup.layoutItem` düzendeki öğenin sırası). Grup sekmesinin en sağında
  soluk mavi nokta ("Kaydedilmemiş Düzen Değişiklikleri"); sağ tıkta "Düzendeki Değişiklikleri Kaydet" yalnız değişiklik
  varken etkin (`updateFromGroup`). Panel boyutları düzene dahil değil.
- **Kaydetmeden kapatma onayı:** "Düzende yaptığınız değişiklikler kaybolacaktır. Devam etmek istiyor musunuz?"
  (Vazgeç / Devam Et). Kapsam (`features/layouts/guard.ts`): orta tık, "Gruptaki N Oturumu Kapat", "Grubu Ayır" (düğme,
  menü, palet), "Tümünü Kapat", "Diğerlerini Kapat", ve grubu dağıtacak panel kapatma/ayrı sekmeye alma (iki panelli
  grupta), Ctrl+Shift+W, sekme aramasındaki kapat. Genel onay penceresi `stores/confirm.ts` + `ConfirmDialog`.
- **Orta tık yapıştırma koruması (Linux birincil seçim):** sekmeye orta tıklayınca kapanan sekmenin ardından odak arama
  kutusuna geçip seçili metin oraya yapıştırılıyordu. Sekme şeridindeki orta tık `mouseup` varsayılanı engellenir
  (Chromium birincil seçimi `mouseup` işlenmezse yapıştırır) ve sonraki 500 ms'deki `paste`/`beforeinput`
  (insertFromPaste) olayları yok sayılır (`useMiddleClickPasteGuard`).

## Öneri listesi — 2. tartışma (2026-10-15, karar bekliyor)
- Hızlı kazanımlar: uzun süren komut bitince bildirim (kabuk entegrasyonunun istem işaretleriyle süre ölçümü),
  kopan oturuma otomatik yeniden bağlanma (token exchange), terminal yazı boyutu Ctrl+= / Ctrl+-, oturum çıktısını
  dosyaya kaydetme.
- Daha büyük: uygulama içinden snippet yönetimi (ekle/düzenle/sil, `{{değişken}}` sorma), ayarlar ekranı (yazı tipi,
  boyut, geri kaydırma, tema, varsayılanlar), birden çok sunucuda komut çalıştırıp sonuçları yan yana karşılaştırma,
  paketleme + otomatik güncelleme (deb/AppImage/Windows).
- Paylaşım: snippet/düzen/alarm kurallarını dışa/içe aktarma (JSON), sunucuya yerel not.

## Yayın — 0.1.0 (2026-10-15)
- Kullanıcı yeni özellik eklemeyi şimdilik bitirdi ("hepsi tamam"), yayın istedi: Ubuntu ve Windows için tek tık ya da
  kurulum dosyaları. Üretilenler `dist/`: `JumpDesk-0.1.0.AppImage` (tek tık), `jumpdesk_0.1.0_amd64.deb` (kurulum),
  `JumpDesk-0.1.0-Portable.exe` (Windows tek tık), `JumpDesk-0.1.0-Windows.zip` (klasör sürümü), `SHA256SUMS.txt`,
  `KURULUM.txt` (Türkçe kurulum notu).
- Doğrulanan: AppImage bu makinede (Ubuntu 24.10) açıldı, mock'a giriş + ağaç + terminal çalıştı
  (`dev/e2e/packaged.mjs`). `.deb` kullanıcı tarafından kuruldu (`sudo apt install ./dist/jumpdesk_0.1.0_amd64.deb`):
  `/opt/JumpDesk`, `/usr/bin/jumpdesk` (update-alternatives), `/usr/share/applications/jumpdesk.desktop`, sistem ikonları;
  kurulu ikili `--no-sandbox` olmadan (sandbox açık) mock testini geçti. Windows paketleri gerçek Windows'ta denenmedi.
- Geliştirme masaüstü kaydı (`~/.local/share/applications/jumpdesk.desktop`, `npm run dev` çalıştırır) kurulu paketin
  kaydını gölgeliyordu; `sh dev/install-desktop-entry.sh --remove` ile kaldırıldı. Paket kuruluyken bu betik
  çalıştırılmaz (uygulama menüsündeki JumpDesk geliştirme sürümünü açar).
- Kurulumdan sonra dock'ta ikon çıkmadı: kaldırılan geliştirme ikonları yerel ikon önbelleğinde kalmıştı. Önbellek
  yenilendi (`gtk-update-icon-cache -f -t ~/.local/share/icons/hicolor`), ikon artık
  `/usr/share/icons/hicolor/*/apps/jumpdesk.png`'den çözülüyor; `--remove` betiği önbelleği de yeniliyor.
- Windows NSIS kurulum sihirbazı üretilemedi: Linux'ta `wine32` gerekiyor (yok);
  `electronuserland/builder:wine` Docker imajı da o sırada çekilemedi. Seçenekler: `sudo dpkg --add-architecture
  i386 && sudo apt update && sudo apt install wine32:i386` sonra `npx electron-builder --win nsis --x64 --prepackaged
  dist/win-unpacked`; ya da Windows makinede `npm run build:win`.
- `.deb` AppArmor profili özel şablon (`build/apparmor-profile.tpl`, `deb.appArmorProfile`): yol
  `/opt/JumpDesk/jumpdesk{,-bin}` (başlatıcı + gerçek ikili). `linux.synopsis/description` eklendi.
- Dosyalar imzasız: Windows SmartScreen uyarısı ("Ek bilgi > Yine de çalıştır"); otomatik güncelleme yok.

## Kullanıcı istekleri — 26. tur (2026-10-15, mock e2e: yeni `windows` + tüm paketler)
1. **Ayarlar:** profil satırındaki sürüm etiketi kaldırıldı, sürüm profil menüsünün altına ("Sürüm 0.1.0") taşındı; yerine
   dişli düğmesi (ipucu "Ayarlar (Ctrl+,)"). Profil menüsünde de "Ayarlar" öğesi var. Ayarlar penceresi Claude
   masaüstündeki gibi: solda grup listesi, sağda içerik (`components/SettingsDialog.tsx`). Açma: düğme, Ctrl+, (macOS ⌘,),
   komut paleti "Ayarlar", profil menüsü.
2. **İlk ayar grubu "Yazı Boyutu":** Yazılım Geneli (11–18, vars. 13), Sunucu Ağacı (10–20, vars. 13), Terminal (SSH)
   (9–24, vars. 13); her biri −/kaydırıcı/+ ve varsayılana döndür; önizleme (ağaç satırı + terminal). Birbirinden
   bağımsız: arayüz pencere yakınlaştırmasıyla, ağaç ve terminal yakınlaştırmaya bölünmüş boyutla çizilir.
   Kalıcı: localStorage `jumpdesk.fontSizes`.
3. **Vurgular** (sağ panelde Alarmlar'ın sağında, `features/panel/HighlightsPanel.tsx`): kelime ya da düzenli ifade,
   büyük/küçük harf, yazı rengi + arka plan rengi (renk seçici: 16 hazır renk, "Şeffaf (Rengi Değiştirme)", sistem renk
   seçicisi, #rrggbb kodu). Kural aç/kapat, sil, renkleri satırda değiştir. Kurallar tüm açık terminallere hemen
   uygulanır (geçmiş dahil). Varsayılan yeni kural: siyah yazı + sarı arka plan. Kalıcı: `jumpdesk.highlightRules`.
   Komut paleti: "Vurgular Panelini Aç".
4. **Aramadan toplu bağlanma:** sunucu arama sonuçlarında (kenar çubuğu ve "Yeni Bağlantı" ekranı) Ctrl (⌘) basılıyken
   tıklanan sonuçlar işaretlenir; Ctrl bırakılınca hepsine ayrı sekmelerde bağlanılır ("Yeni Bağlantı" ekranında ilki o
   sekmede açılır). Esc ya da pencere odağı kaybı seçimi iptal eder. Altta ipucu şeridi.
5. **Sekmeyi ayrı pencerede açma:** tekli oturum sekmesi pencerenin dışına ya da (açık grup yokken) şeridin 56 px'ten
   fazla altına, çalışma alanına sürüklenip bırakılınca ("Yeni Pencerede Aç" bırakma alanı görünür; ekranı kaplayan
   pencerede dışarı çıkılamadığı için), sağ tık "Yeni
   Pencerede Aç", grup paneli sağ tık "Yeni Pencerede Aç" ya da komut paleti "Sekmeyi Yeni Pencerede Aç" ile ayrı
   pencere açılır. **Oturum kopmaz** (bağlantı ana pencerede yaşar, görüntü taşınır). Geri alma: ayrı pencerenin
   sekmesini ana pencereye sürükleyip bırakmak (sekme şeridinde bırakılan yere, başka yerde sona), "Ana Pencereye Geri
   Al" düğmesi/menüsü, komut paleti "Ana Pencereye Geri Al: <ad>". Ayrı pencereyi sistemden kapatmak (Alt+F4) oturumu
   ana pencereye geri alır; başlıktaki ✕ oturumu kapatır. Geri alınınca ana pencere öne gelir, klavye terminale geçer. Ayrı pencerede Ctrl+Shift+W (kapat) ve Ctrl+Shift+S (ara)
   çalışır. Ana pencerede yalnız boş "Yeni Bağlantı" kaldıysa geri alınan sekme onun yerine geçer.
6. **Hata:** başlık çubuğunun boş yerine tıklayınca açık sağ tık/açılır menüler kapanmıyordu (sürükleme bölgesi
   tıklamayı işletim sistemine veriyor) → menü/pencere açıkken başlık çubuğu sürüklenmez (`globals.css` `html:has(...)`).
- Kapsam dışı (şimdilik): grup sekmesini (tüm grubu) ayrı pencereye taşıma; ayrı pencerede birden çok sekme; ayrı
  penceredeki oturum için sağ panel (snippet/geçmiş/dosyalar) — sağ panel ana pencerenin etkin sekmesine bakar.

## Kullanıcı istekleri — 27. tur (2026-10-15, mock e2e: windows + tüm paketler, birim testi: alarm algılayıcı)
1. **Grup sekmesi ayrı pencereye:** grup sekmesi sağ tık "Grubu Yeni Pencerede Aç", komut paleti, grup sekmesini
   pencere dışına ya da çalışma alanına aşağı sürükleme. Ayrı pencerede grup aynı döşeme davranışıyla çalışır (panel
   başlıkları, büyüt/küçült, sürükleyerek sıralama, boyutlandırma, yayın, yerleşim değiştirme). Panel başlığında "Ana
   Pencereye Al" (yalnız o panel, ayrı sekme olarak) ve "Yeni Pencerede Aç" (kendi penceresine). Geri alma: sekme
   çipini sürükle-bırak, "Ana Pencereye Geri Al", Alt+F4; grup aynı kimlikle, düzeniyle geri gelir. Pencere ✕: gruptaki
   tüm oturumları kapatır (kayıtlı düzen değiştiyse sorar). Ayrı pencerede Ctrl+Shift+Enter paneli büyütür.
2. **Yanlış "Exception" alarmı (snippet çalıştırınca, satırı base64 ile başlayan):** iki neden — (a) kabuk
   entegrasyonu kurulumunun büyük OSC verisi (komut adları, base64) parçalar halinde gelirken başlangıcı kurulum
   kapısından (SetupEchoGate) geçtiği için algılayıcı görmüyordu, devamı düz metin sayılıyordu; (b) satıra sığmayan
   snippet komutunun yankısını bash araya " \r" (ya da "\r\n") koyarak kaydırıyor, yankı tanınmıyordu ve komuttaki
   `sed '/ERROR\|Exception/...'` alarm oluyordu. Çözüm: algılayıcı kaçış dizilerini parçalar arası durum makinesiyle
   ayıklar (OSC/DCS gövdesi hiç metne karışmaz), yankıyı boşluksuz karşılaştırır ve parçalı yankıyı tanır; kurulum
   kapısının bıraktığı çıktı da süzgeçlerden geçer; gönderilen komut her zaman yankı olarak kaydedilir (ekrandaki
   satır yalnız istemdeyken ek olarak). Birim testi: `node dev/alarm-detector.test.mjs` (eski algılayıcıda 3 hata).
3. **Grup paneli başlığında sunucu bilgisi:** başlıktaki sunucu adının üzerinde ~0,45 sn beklenince ağaçtaki bilgi
   kartı (adres, iç IP, protokoller, hesaplar, açıklama) başlığın altında açılır; ayrı pencerede de çalışır.

## Kullanıcı istekleri — 28. tur (2026-10-15, mock e2e: windows, tabs, menus, smoke)
1. **Yeni pencere yalnız uygulama dışına bırakınca:** çalışma alanına aşağı sürükleyince pencere açma ("Yeni Pencerede
   Aç" bırakma alanı) kaldırıldı. Sekme (ya da grup sekmesi) uygulama penceresinin dışına çıktığı an imleçte yarı
   saydam bir pencere önizlemesi belirir (oturumların anlık görüntüsü, grup panelleri), içeri dönünce kaybolur,
   dışarıda bırakılınca o konum ve boyutta gerçek pencere açılır. Wayland'da önizleme imleci izlemez (konumu
   bileşik yönetici belirler); Windows/X11'de izler. Sağ tık / komut paleti "Yeni Pencerede Aç" aynen duruyor.
2. **"Vurgu tüm satırı boyuyor" bildirimi:** WebGL çizimde de yalnız eşleşen kısım boyanıyor (zorla WebGL açılarak
   doğrulandı: `--ignore-gpu-blocklist --enable-unsafe-swiftshader`). Tam satır rengi snippet'lerdeki `sed` renklendirmesinden
   geliyor (eşleşen satırın tamamını boyar).
   Kullanıcıya soruldu: snippet'ler yalnız eşleşen kelimeyi boyayacak şekilde değiştirilsin mi? (karar bekliyor)

## Kullanıcı istekleri — 29. tur (2026-10-16, Chrome tarzı çok pencere; mock e2e: multiwindow + tüm paketler)
1. **Serbest sürükleme:** şeritte tutulan sekmenin kopyası imleci yatay ve dikeyde izler (yalnız sağa-sola değil).
2. **Şeritten çıkınca şeffaf pencere:** sekme başlık çubuğu bandının (40 px + 16 px tolerans) dışına çıktığı an kopya
   kaybolur, imleçte yarı saydam pencere önizlemesi belirir (pencerenin içinde de, dışında da); bırakınca o yerde
   gerçek pencere açılır. İstisna: açık grubun alanında tek bir oturum "Gruba Ekle" ile gruba bırakılır (önceki istek).
   Bir önceki turdaki "yalnız uygulama dışına bırakınca" kuralı bu istekle değişti (Chrome davranışı).
3. **Pencereleri birleştirme (Chrome gibi):** her ayrı pencerenin kendi sekme şeridi ve çalışma alanı var (birden çok
   sekme, grup, döşeme). Sekme ya da grup sekmesi başka bir pencerenin şeridine sürüklenince bırakılacağı yer çizgiyle
   gösterilir, bırakınca o pencereye geçer (ana pencereden ayrı pencereye, ayrı pencereden ana pencereye ya da ayrı
   pencereler arasında). Pencerenin tüm sekmeleri dışarı sürüklenince yeni pencere açılmaz, pencere oraya taşınır.
   Ayrı pencere sekme menüsü: Ana Pencereye Taşı, Yeni Pencerede Aç, Kapat, Diğerlerini Kapat, yerleşim; başlıkta
   "Tüm Sekmeleri Ana Pencereye Geri Al" düğmesi. Ayrı pencerede Ctrl+Tab pencere içinde gezinir.
4. **Linux'ta X11 (XWayland):** Wayland pencere/imleç konumlarını vermediği için uygulama Wayland oturumunda XWayland
   ile açılır (`--ozone-platform=x11`: geliştirme komutları ve paket başlatıcısı; `JUMPDESK_WAYLAND=1` ile Wayland).
   Kullanıcının ekran ölçeği 1 (kesirli ölçek yok), görüntü kaybı yok. Wayland'da çalışırsa pencereler arası sürükleme
   yapılamaz (yalnız kendi şeridi + dışarı bırakınca yeni pencere), önizleme imleci izlemez.

## Kullanıcı istekleri — 30. tur (2026-10-16, mock e2e: alarm-warmup, windows, tools + tüm paketler)
1. **Alarm bekleme süresi:** bağlantı kurulduktan sonra 10 sn alarm bildirilmez (karşılama çıktısı, giriş betikleri,
   otomatik komutlar); çıktı bu sürede de okunur (satır/kaçış dizisi takibi bozulmasın), yalnız eşleşme bildirilmez.
   Yeniden bağlanınca süre yeniden başlar.
2. **Grup paneli başlığında sunucu kartı tüm satırda:** başlığın herhangi bir yerinde beklenince açılır; düğmelerin
   (büyüt, ana pencereye al, kapat, yayın) üzerinde açılmaz, sağ tıklanınca fare başlıktan çıkana kadar açılmaz.
   Başlıkta gezinirken bekleme süresi yeniden başlamaz.

## Kullanıcı istekleri — 31. tur (2026-10-16, mock e2e: multiwindow ×3, tabs)
- **"Yeni Bağlantı" sekmesi pencere dışına çıkamaz:** dışarı sürüklenince kopya ekranın sağına sıçrıyordu (gerçek fare
  olaylarında, taklit olaylarla yeniden üretilemedi; olası neden pencere dışındaki bozuk koordinatlar, ör. soldaki
  Ubuntu Dock). Artık imleç pencere dışındayken gelen olaylar yok sayılır: kopya imlecin pencereden çıktığı kenarda
  kalır, sıralama da durur.

## Kullanıcı istekleri — 32. tur (2026-10-16, ölçüm: dev/e2e/font-perf.mjs)
- **Yazı boyutu değiştirmek arayüzü kastırıyordu** (çok oturumda terminal yazısı): her adımda tüm terminaller
  yeniden ölçülüp gliflerini yeniden çiziyor, vurgular baştan taranıyordu. Artık görünen terminaller ayar değişmeyi
  bırakınca (150 ms) bir kez, gizli terminaller ekrana geldiklerinde güncellenir; gizli terminallerde vurgu taraması
  da ekrana gelene kadar ertelenir. Ölçüm (12 oturum, 6 adım): toplam donma 4380 ms → 374 ms, en uzun 423 → 106 ms.

## Kullanıcı istekleri — 33. tur (2026-10-16, birim testi 14/14, e2e: tools, windows, alarm-warmup)
- Girişten sonra yine alarm: satır `[appuser@<sunucu> ~]$ ` ×12 + `tail -f <log yolu>…` (otomatik çalışan log
  snippet'inin yankısı; komutta `sed '/ERROR\|Exception/…'`). İstemin tekrarları, bash'in pencere boyutu değişince
  istemi aynı satıra CR ile yeniden çizmesinden; yankı, kayıttan 3 sn sonra geldiği için tanınmadı.
- İstek: alarmlar bağlantıdan **20 sn** sonra başlasın → bekleme 20 000 ms.
- Yankı tanıma 15 sn'ye çıktı ve sıralı yapıldı (yankı tamamlanınca kayıt düşer; ardından gelen çıktı, komut metninin
  parçası olsa da alarmdır). Alarm panelinde satırın görünen son hali gösterilir (üst üste çizilen istemler değil).

## Kullanıcı istekleri — 34. tur (2026-10-16; birim 19/19, e2e: transfer 39 kontrol, alarm-warmup, smoke + tüm paketler)
1. **Alarm bekletme snippet'e bağlı:** yavaş bağlantıda 20 sn yetmedi. Sunucuya bağlanınca çalışacak snippet varsa
   hepsi gönderilene kadar ve gönderildikten sonra 10 sn alarm yakalanmaz; bağlantıdan sonraki bekleme (20 sn) de
   geçerli kalır (hangisi geç biterse). İki süre de Ayarlar → Bildirimler'den değiştirilebilir.
2. **Ayarlar → Bildirimler:** "Alarm Bildirimleri" anahtarı (masaüstü bildirimi; kapalıyken panel ve rozet sürer),
   "Bağlantıdan Sonra" ve "Otomatik Snippetlerden Sonra" bekleme süreleri (sn, 0–300).
3. **Statik snippetler silindi** (`features/snippets/snippets.txt` yok). Snippetler kullanıcının kayıtlarında; sağ
   panelin altında "Snippetleri Düzenle" düğmesi → düzenleyici (solda gruplu liste + arama, sağda Ad/Grup/Komut,
   Sil/Vazgeç/Kaydet, Ctrl+Enter, kaydedilmemiş değişiklikte onay; altta İçe/Dışa Aktar). Satıra sağ tık:
   "“Ad” Snippetini Düzenle". Kullanıcının mevcut snippetleri şifreli dosyaya dönüştürüldü:
   kullanıcının İndirilenler klasörüne (kimlikler eski slug'lar; sunuculardaki "bağlanınca çalıştır" seçimleri
   içe aktarınca yeniden eşleşir). Kullanıcı bunu bir kez içe aktaracak.
4. **Dışa/İçe aktarma:** bölümler snippetler, alarm kuralları, vurgular, düzen kayıtları, uygulama ayarları (yazı
   boyutları, terminal tercihleri, bildirimler, tema). Dosya `.jumpdesk`, AES-256-GCM şifreli + doğrulamalı; ad
   `<kullanıcı adı, harf/rakam dışı _>_<YYYYMMDDHHmmss>.jumpdesk`, varsayılan klasör İndirilenler. Dışa aktarım ekranı
   kartlarla seçim (sayılar + ayrıntı çipleri, boş bölüm pasif). İçe aktarımda dosya doğrulanır, kartlarda dosyadaki
   ve mevcut sayılar, "Seçilen bölümlerdeki mevcut kayıtlarınız silinir" uyarısı. Giriş noktaları: profil menüsü,
   komut paleti, Ayarlar → Dışa / İçe Aktarma, snippet ve alarm kuralı pencerelerindeki düğmeler, Snippetler /
   Alarmlar / Vurgular panellerinde sağ tık (yalnız o bölüm seçili gelir).
5. **Logo:** yalnız kırmızı karo Claude turuncusu (`#D97757` degrade); beyaz şerit ve `>_` aynı. PNG'ler yeniden
   üretildi (build/icon.png, build/icons/*, resources/icon.png). Kullanıcı "simge hâlâ kırmızı" dedi: rıhtım, dev
   modunda bile kurulu .deb'in simgesini gösteriyor. Yeni `dist/jumpdesk_0.1.0_amd64.deb` (turuncu simge) derlendi;
   kullanıcının `sudo apt install` ile kurması gerekiyor.
6. **Girişte önce sunucu adresi:** her girişte (oturum geçerliyse açılışta sorulmaz) adres ekranı: JumpDesk ve JumpServer
   karoları (rıhtım simgesi gibi gölgeli), arada ⇄; son adres hazır, son kullanılanlar çipleri. Şema yoksa https.
   Adres `/api/health/` ile doğrulanır; yanıt yoksa hata ileti. Giriş sayfası başlığında "Sunucuyu Değiştir".
7. **Kullanıcıya özel kayıtlar:** ayarlar, snippetler, kurallar, vurgular, düzenler, tema, panel genişlikleri ve sunucu
   bilgileri (etiket, otomatik komut, iç IP) sunucu + kullanıcı adına göre ayrı; başka kullanıcı görmez. Eski
   (kullanıcısız) kayıtlar güncellemeden sonra ilk giriş yapan kullanıcıya bir kez taşınır.

## Kullanıcı istekleri — 34. tur devamı (2026-10-16)
- **"Simge hâlâ kırmızı" (paketi kurmadan `npm run dev`):** rıhtım dev penceresini (WM_CLASS `jumpdesk`) kurulu paketin
  kaydıyla eşleyip paketin eski kırmızı simgesini gösteriyordu. Geliştirme sürümü artık `jumpdesk-dev` adıyla açılır;
  ardından "simge komple kayboldu": GNOME 47 pencere simgesini kullanmıyor; `jumpdesk-dev.desktop` kaydı (Icon = proje
  `build/icon.png`) kullanıcının `~/.local/share/applications` klasörüne kuruldu, dev yeniden başlatılınca görünür. Ayrıca turuncu simgeli yeni
  `dist/jumpdesk_0.1.0_amd64.deb` derlendi (kurulu paket için `sudo apt install`).
- **Sol üstteki uygulama simgesi kaldırıldı:** ana pencere başlık çubuğu sunucu ağacı düğmesiyle, ayrı pencereler
  doğrudan sekme şeridiyle başlar (macOS'ta zaten yoktu).
- **Turuncu Claude ile aynı yapıldı** (kullanıcı rıhtım görüntüsüyle "biraz koyulaştır" dedi): Claude masaüstü simgesi
  (`/usr/share/icons/hicolor/256x256/apps/claude-desktop.png`) ölçüldü — karo neredeyse düz, üst `#da7a58`, orta
  `#da714c`, alt `#dc6943`. Bizim degrade `#D6714F → #D96F4A → #D96741` (parlaklık katmanı dahil ölçüm üst `#d87959`,
  orta `#d86f4a`, alt `#d86942`). PNG'ler yeniden üretildi.
- "Rıhtımda hâlâ eski hali": GNOME simge önbelleği (aynı dosya yolu). Geliştirme kaydı artık içerik özetli simge yolu
  kullanıyor (`icon-ccf74d70614b.png`); kayıt yeniden kuruldu.

## Kullanıcı istekleri — 35. tur (2026-10-16; e2e: i18n, ai + tüm paketler; birim: alarm 19, ai-safety 58)
1. **Sunucu adresi gömülü değil:** `DEFAULT_SERVER` kaldırıldı; ilk açılışta adres boş, girilen adres `settings.server`
   + `recentServers`'a kaydedilip sonraki açılışta hazır gelir (`dev/e2e/server-address.mjs`). Yan bulgu: `auth.ts`
   modül yüklenirken `serverUrl()` çağırıyordu → ayar dosyası `userData` ayarlanmadan okunuyordu (yalnız
   `electron out/main/index.js` ile açılan testlerde yanlış klasör); başlangıç durumu artık `server: ''`.
2. **Dışa aktarım kartları:** seçilemeyen kartta imleç değişmez, alttaki "şifrelenir" satırı kaldırıldı, açıklamalar
   kesilmez (iki satırlık yer). Snippet paneli alt düğmesi "Snippetler" + ListChecks simgesi; Alarmlar düğmesinde
   "N Aktif" (özet çiplerinde de "aktif").
3. **Kullanıcının snippetleri:** `sed` renklendirmesi atıldı (yalnız `tail -f <yol>`), renkler vurgu kuralı oldu
   (hata/exception kırmızı #cf222e, uyarı sarı #9a6700, INFO mavi #0969da, yazı beyaz, büyük/küçük harf
   duyarlı), mevcut 2 alarm kuralı (Exception, OutOfMemoryError) eklendi →
   kullanıcının İndirilenler klasörüne yeni bir `.jumpdesk` dosyası. Kullanıcı içe aktarıp her şeyi kendisi dışa
   aktaracak.
4. **Vurgu metni çift tıkla düzenlenir** (satır içinde; Enter/odak dışı kaydeder, Esc vazgeçer; seçenekler de).
5. **Vurgu hatası:** satır sonunda bölünen eşleşmede ("warni|ngs") alt satır baştan sona boyanıyordu (`decorateSpan`
   satır değişince `right` sıfırlanmıyordu). Düzeltildi; windows e2e "wrapped match colors only its cells".
6. **Terminal altındaki boşluk:** satıra tamamlanmayan artık alan (~16 px) alttaydı; terminal alta hizalandı (artık
   üstte). **"En Alta Kaydır" bandı:** görünüm geçmişte yukarıdayken altta iki satır yüksekliğinde, tema arka planından
   şeffafa geçişli bant; tıklayınca en alta iner (windows e2e).
7. **Font önizlemesi** genel örnek (`user@server:~$ ls -l /var/log`).
8. **Dil desteği (İngilizce varsayılan, Türkçe):** tüm renderer ekranları + ana süreç iletileri; Ayarlar → Dil
   (ilk bölüm) ve giriş ekranında dil seçici; dil kullanıcıya özel, "Uygulama Ayarları" dışa aktarımına dahil. ~530
   çeviri. Ayrıntı: implementation-notes "Dil desteği".
9. **Komut satırı boyaması çıktının üstüne düşüyordu** (hızlı çıktıda "for i in …" satırı başka satıra boyanıyordu):
   boyama artık bekleyen yazma yokken yapılır (windows e2e "command line painted only once").
10. **Yapay zeka (Ayarlar → Yapay Zeka):** sağlayıcı seçimi (Anthropic, OpenAI, Gemini, Azure OpenAI, OpenAI uyumlu /
    Ollama-LM Studio-vLLM, Kullanma) ve sağlayıcının alanları; API anahtarı şifreli, ekrana geri gelmez, dışa
    aktarılmaz. "Bağlantıyı Dene". Özellik anahtarı: "Yapay Zeka ile Autocomplete". Terminalde Ctrl+Space (öneriler)
    → ikinci Ctrl+Space ya da "Yapay zekaya sor…" satırı → soru → komut seçenekleri (açıklama + Dikkat/Riskli rozeti)
    → seçilen komut satıra yazılır (çalışmaz; Enter kullanıcıda). Riskli komut onay ister. Sohbet oturum başına
    (önceki sorular bağlam olarak gider, "Sohbeti Temizle"). Yapay zekaya yalnız soru, önceki sorular ve sunucu türü
    gider.
- Çalışma alanına bağlı olmayan bir Anthropic anahtarı → HTTP 400 (anthropic-workspace-id gerekli). Anthropic
  ayarlarına "Çalışma Alanı Kimliği (İsteğe Bağlı)" alanı eklendi; kimlik Console → Settings → Workspaces'ten alınır
  ya da çalışma alanına bağlı yeni bir anahtar oluşturulur.
- Opus 5.5 ile "tool_choice … not supported for this model" hatası → serbest araç seçimiyle yeniden deneme. Kullanıcı
  "tüm modelleri ekle, istediğimi seçeyim" dedi → Model alanı, kayıtlı anahtarla sağlayıcıdan alınan listeden seçilir.
- Yapay zeka penceresi: klavyeyle seçilen öneri listede görünür alana kaydırılır (`scrollIntoView nearest`); Enter'dan
  sonra soru kutusu temizlenir, soru kutunun altında sabit bir sohbet balonunda (sağda, birincil renk) görünür, yanında
  "+N önceki soru bağlamda". Kutuda yazı varsa Enter devam sorusu sorar, boşsa seçili öneriyi yazar; hata olursa soru
  kutuya geri konur. Bekleme sırasında üç noktalı "Yapay zeka düşünüyor…" (e2e ai 24/24).
- **Ctrl+Space program çalışırken açılıyordu** (tail -f): iki neden — (a) bağlanınca çalışan snippetler kabuğa doğrudan
  gönderildiği için `live.atPrompt` true kalıyordu; artık gönderilince false olur; (b) `closePopup` yalnız çizilmiş
  pencereyi kapatıyordu, hızlı yazımda Enter'dan hemen önce kurulan açılış kalıyordu; artık her durumda kapatır.
  Ctrl+Space yalnız komut satırı açıkken (normal ekran + entegrasyon varsa istemde) çalışır, değilse tuş programa gider
  (windows e2e "no suggestions while a program runs").

## Public proje hazırlığı (2026-10-16)
Kullanıcı projeyi public yapmak istedi; özel bilgiler tarandı ve kullanıcının kararlarıyla temizlendi:
- **Ad JumpDesk** (paket `jumpdesk`, dosya uzantısı `.jumpdesk`, ortam değişkenleri `JUMPDESK_*`, köprü
  `window.jumpdesk`, appId `io.github.metin-aydin.jumpdesk`); depo `https://github.com/metin-aydin/JumpDesk`,
  yazar `metin-aydin`, lisans MIT.
- Kimlik/paket alanları, mock verisi (genel klasör/sunucu adları), test fixture'ları (genel `/opt/app/...` log yolları,
  "App Server"/"Queue Server" grupları), alarm testi, e2e kullanıcı adı (`demo`), `swagger.json` sunucu adresi
  (`jumpserver.example.com`), memory ve CLAUDE.md genelleştirildi.
- Eski ad altındaki yerel veriler (ayarlar, localStorage) uygulama koduna taşıma eklenmeden, kullanıcının makinesinde
  bir kerelik betikle yeni ada taşındı (kodda eski ad geçmez).
- Git'te henüz commit yok (geçmiş temiz). Kökteki `.remember/` (eklenti geçmişi) .gitignore'a eklendi.
- **İkinci tarama (kullanıcı isteği, tüm dosyalar):** geniş özel bilgi sözcük listesi, tüm alan adları/IP'ler/e-postalar,
  arayüz örnek metinleri, SVG/PNG meta verisi, `.vscode`, paketleme betikleri, `package-lock.json` kayıt adresleri
  (yalnız registry.npmjs.org). Kalan iki örnek ad genelleştirildi (`stores/snippets.ts` yorumu, alarm testi istemi). swagger.json'daki IP/adresler JumpServer'ın kendi
  örnekleri. `.remember/` yerelde duruyor (gitignore'da; içinde eski konuşma kayıtları var).
- **Proje klasörü `jumpdesk` adını aldı;** memory ve md dosyalarında önceki ad kalmadı. Claude'un proje dışı
  işaretçisi yeni klasörün anahtarıyla kuruldu (eskisi de yeni yolu gösterir).
  Dev masaüstü kaydı yeni yolla yeniden kuruldu. Oturum eklentisi (`.remember`) oturum taşınana kadar eski yolda küçük
  bir günlük klasörü yeniden yaratıyor; silinmesi güvenlik denetimine takıldı, kullanıcıya bırakıldı.
- **md denetimi (üçüncü tarama, 2026-10-16):** tüm md dosyaları satır satır okundu; dolaylı ipuçları (klasör yolu,
  snippet sayıları, ağ kısıtları, log biçimi, sunucu port/sürüm ayrıntıları, e-posta notu) genel ifadeyle yeniden
  yazıldı. Kalan kişisel not yalnız çalışma tercihleri (ADHD biçimi; kullanıcı depoda kalmasını seçti). Mock klasör
  adları (Partner A, Bölge Ofisleri…) kodla aynı genel adlar; değiştirilmedi.
- **İlk commit değiştirildi:** GitHub'ın oluşturduğu ilk commit (README'de önceki ad) kaldırıldı; tüm proje tek bir
  ebeveynsiz kök commit olarak force push edildi (kullanıcı "yeni ilk commit + force push" seçti; depoyu silip
  yeniden açma seçilmedi). Kullanıcı mock klasör adlarını doğru buldu.

## Kullanıcı istekleri — 35. tur (2026-10-16): ekran görüntüleri, sürüm akışı, uygulama içi güncelleme
1. **README ekran görüntüleri (İngilizce):** `docs/screenshots/*.png` (11 adet; kullanıcı tablodaki boş kutuya
   vurgular panelini istedi, 1440×900, koyu tema; giriş ekranı açık
   tema). Üretici `npm run screenshots` (`dev/screenshots.mjs`, önce `npm run build`): kendi mock'unu 18090 portunda
   `MOCK_DATA=showcase` (İngilizce adlı küçük ağaç: Production/Web/App/Database, Staging, Windows, Monitoring;
   örnek Java benzeri `logs/app.log`) ve `MOCK_ROOT=/tmp/home` ile açar (dosya yöneticisi yolu kısa görünsün; klasör
   `.jumpdesk-showcase` işareti yoksa başkasınındır, geçici klasöre düşülür), sahte OpenAI uyumlu sağlayıcı açar,
   snippet/vurgu/alarm örneklerini içe aktarır. Varsayılan mock verisi birebir aynı kaldı (karşılaştırıldı).
   Gerçek sistem komutu (`systemctl`, `df`, `ls -l`) çalıştırılmaz: mock kabuğu yerel makinede çalışır, çıktı makine
   bilgisini gösterir. `docs/` pakete girmez.
   `.gitignore` tüm `*.png`'leri dışlar; `!docs/screenshots/*.png` istisnası var (ilk push'ta görseller bu yüzden
   eksik kalmıştı).
2. **README girişi (kullanıcı isteği):** "yalnız 443 açık ağlarda çalışır" cümlesi girişten çıkarıldı (kullanıcı neden
   anlatıldığını sordu; doğrudan proje tanıtımı istedi), yerine sade tanıtım paragrafı; teknik bilgi Features'ta tek
   madde. Üstte ortalanmış logo (`build/icons/256x256.png`, 112 px), başlık ve rozetler ortalı HTML.
   **`main`'e doğrudan push izin denetiminde reddedildi** (README commit'i); kullanıcıya soruldu.
3. **Dallar:** `development` dalı açıldı ve push edildi (`main`'in `4a31893` hâlinden). Akış: iş `development`'ta,
   `main`'e birleştirme sürüm yayımlar; `main`'e doğrudan push yok.
4. **Release iş akışı** (`.github/workflows/release.yml`, `main`'e push + elle): `prepare` (sürüm
   `dev/next-version.mjs`, yarım kalmış taslak silinir, `gh release create --draft --generate-notes`), `build`
   (ubuntu `--linux`, windows `--win`; `npm version X --no-git-tag-version` ile sürüm hem ana hem arayüz kodu için
   ayarlanır, `electron-builder --publish always` taslağa yükler), `publish` (`gh release edit --draft=false
   --latest`), `discard` (hata olursa taslağı siler). `electron-builder.yml` `publish.releaseType: draft`.
   CI artık `development` push'larında da çalışır ve `next-version.test.mjs`'i koşar. package.json sürümü **0.2.0**
   (ilk sürüm v0.2.0 olacak; etiket yok).
5. **Uygulama içi güncelleme** (`src/main/updater.ts`, `electron-updater` 6.8.10, `src/shared/update.ts`):
   AppImage (APPIMAGE ortam değişkeni), .deb (`resources/package-type` = deb; kurulumda pkexec ile parola sorulur),
   Windows NSIS kendini günceller; taşınabilir Windows ve geliştirme sürümü yalnız GitHub API'den son sürümü sorup
   yayın sayfasını açar. Otomatik denetim açılıştan 15 sn sonra ve 6 saatte bir (yalnız paketli sürümde; ayar
   `settings.autoUpdateCheck`, bilgisayara özel, dışa aktarılmaz). Hiçbir şey sormadan indirilmez/kurulmaz.
   Arayüz: Ayarlar → Güncellemeler (sürüm, durum, ilerleme çubuğu, İndir ve Kur / Yeniden Başlat ve Kur / İndirme
   Sayfasını Aç, Sürüm Notları, Otomatik Denetle), girişten sonra bildirim (Güncelle düğmesi), ayarlar düğmesinde
   nokta, kullanıcı menüsünde "Sürüm X Hazır", komut paletinde "Güncellemeleri Denetle".
   Doğrulama: `dev/e2e/update.mjs` 14/14; gerçek paketle `dev/e2e/packaged-update.mjs` 6/6 (0.2.0 AppImage → 0.2.1:
   bulundu, indirildi, dosya değişti, yeni sürüm açıldı ve yeniden denetledi). .deb ve Windows kurulumu gerçek
   ortamda denenmedi (ilk iki sürüm yayımlanınca denenecek).
6. **`.vscode` sorusu:** kullanıcı depoda durmasının doğru olup olmadığını sordu. İçerik electron-vite şablonunun
   ortak ayarları (ESLint eklenti önerisi, ana/arayüz süreci hata ayıklama başlatıcısı, Prettier biçimlendirici);
   kişisel bilgi yok. Öneri: kalsın (katkı verenler için yararlı); kullanıcının kararı bekleniyor.
7. **Doğrulama (35. tur sonu):** typecheck, i18n 0 sorun (576 metin), birim testleri; e2e smoke, i18n 4, menus,
   home 17, transfer 39, panels 13, tools 53, windows 44, update 14, ai 24 — hepsi geçti. Paketli AppImage
   güncellemesi 6/6. **Commit/push yapılmadı:** `development` dalındaki tüm iş (güncelleyici, release akışı, README
   girişi + logo, CLAUDE.md, hafıza) yerelde bekliyor; kullanıcıya önerilen: `development`'a commit + push, sonra
   `development` → `main` PR (birleşince ilk sürüm v0.2.0 yayımlanır).
8. **Sürüm notu (changelog) kararı:** kullanıcı "changelog'da ne yazacağını nasıl belirleyeceğiz" diye sordu ve
   commit/push/PR'a "evet" dedi. Uygulanan: notu `development` → `main` PR açıklaması belirler (PR şablonu: New /
   Changed / Fixed; `dev/release-notes.mjs` boş bölümleri atar, birim testi CI'da); açıklama boşsa commit başlıkları;
   sonraki sürümlerde "Full changelog" karşılaştırma bağlantısı eklenir. Önceki `--generate-notes` (yalnız PR başlığı
   listelerdi) kaldırıldı.
9. **Gönderildi (2026-10-16):** `development` `75d26ec` (güncelleyici, release akışı, sürüm notu, README, 0.2.0).
   PR https://github.com/metin-aydin/JumpDesk/pull/1 (`development` → `main`, başlık "JumpDesk 0.2.0", açıklaması
   v0.2.0 sürüm notu; sondaki "Generated with Claude Code" satırı da nota girer, istenirse birleştirmeden önce
   silinir). Oturuma bağlandı; CI bekliyor. Birleştirme kullanıcıda: birleşince v0.2.0 yayımlanır.
10. **PR #1 açıklaması düzeltildi:** "Generated with Claude Code" satırı kaldırıldı (`gh pr edit` GraphQL "Projects
    (classic)" hatası verdi; `gh api -X PATCH repos/…/pulls/1 -F body=@dosya` ile yapıldı). Kullanıcı bu satırın bir
    daha hiç yazılmamasını istedi.
11. **Dal koruması (GitHub, klasik koruma API'si):** `main` ve `development`: PR zorunlu (0 onay), `enforce_admins`
    açık, zorla push ve silme kapalı, durum denetimi zorunlu değil. `delete_branch_on_merge` kapalı (zaten silme
    korumalı). Release akışı dala push etmez (etiket yayımlanınca oluşur), korumadan etkilenmez.
    Bu turun hafıza/CLAUDE.md notları yerelde, commit'lenmedi; sonraki PR'a girecek.
12. **Dal akışı değişti (kullanıcı kararı):** kalıcı `development` dalına gerek yok; tüm geliştirme `development`'ta,
    `main`'e PR ile birleşince dal silinir, sonraki turda `main`'den yeniden açılır. `development` koruması kaldırıldı
    (`DELETE …/branches/development/protection`), depo ayarı `delete_branch_on_merge: true`. `main` korumalı kaldı.
    README (Branches and releases, katkılar `main`'e PR) ve CLAUDE.md buna göre güncellendi.
13. **Co-Authored-By kaldırıldı (kullanıcı isteği):** bundan sonra commit mesajlarına yazılmaz. `development`'taki iki
    commit `git filter-branch --msg-filter` ile yeniden yazıldı (içerik aynı) ve `--force-with-lease` ile gönderildi.
    `main`'deki dört commit'te (`5ce7c61`, `098f6e4`, `1bfb966`, `4a31893`) satır duruyor; silmek için `main`
    korumasını geçici kaldırıp force push gerekir, kullanıcı kararı bekleniyor.
14. **PR #1 birleştirildi (kullanıcı, 2026-10-16):** merge commit `1ab01da`; uzak `development` kendiliğinden silindi,
    yerelde `main` güncellendi ve yerel `development` silindi. İlk Release çalışması:
    https://github.com/metin-aydin/JumpDesk/actions/runs/38907838865 (takip: Actions → Release, ya da
    `gh run watch 38907838865 --repo metin-aydin/JumpDesk`). Sonuç: Releases sayfasında v0.2.0. Bu not yerelde;
    sonraki `development` dalına girecek. `main`'deki eski Co-Authored-By satırları için karar hâlâ bekliyor.

## Kullanıcı istekleri — 36. tur (2026-10-16): macOS sürümü
1. Kullanıcı macOS release'inin neden olmadığını sordu, eklenmesini istedi; ardından "geliştirici imzam var" dedi.
2. **electron-builder.yml mac:** dmg + zip, `arch: [arm64, x64]`, ad `JumpDesk-<sürüm>-mac-<arch>.<ext>`,
   `hardenedRuntime: true`, entitlements mevcut (allow-jit vb.), şablondaki kamera/mikrofon izin metinleri atıldı.
   Not: electron-builder 26 sertifika yoksa imzalamaz (ad-hoc'a düşmez; ad-hoc için `identity: '-'` +
   `hardenedRuntime: false` gerekir). Onay (notarize) ayarı verilmezse APPLE_* ortam değişkenleri varsa yapılır,
   yoksa uyarıyla atlanır; `notarize: false` onu tamamen kapatır (kaldırıldı).
3. **release.yml:** matris'e `macos-latest` (`--mac`); Linux/Windows adımı `CSC_*` almaz (Windows `CSC_LINK`'i kendi
   imzası sanardı), macOS adımı gizli değerleri alır ve eksikse hata verip durur.
4. **ci.yml:** PR'larda `package` işi (3 platform, `--publish never`, `CSC_IDENTITY_AUTO_DISCOVERY=false`).
5. **Güncelleyici:** `UpdateInstaller` 'mac' (MacUpdater, Squirrel.Mac); paketli macOS'ta `app-update.yml` varsa
   kendini günceller. Not: "Yeni sürüm indirilir, JumpDesk kapanıp yeni sürümle yeniden açılır."
6. README: macOS satırları (In the app), imza gizli değerleri, Packaging'de `--mac`.
7. Doğrulama: typecheck, i18n 0 sorun, update e2e 14/14 (Linux). macOS derlemesi yerelde denenemez; PR CI'ındaki
   `package (macos)` işi imzasız paketlemeyi, ilk yayın imza ve onayı doğrular.
8. **v0.2.0 yayımlandı** (ilk Release çalışması başarılı: prepare, linux, windows, publish). PR #2
   (https://github.com/metin-aydin/JumpDesk/pull/2, "JumpDesk 0.2.1: macOS", `development` `b597b9b`) açıldı ve
   oturuma bağlandı; birleştirmeden önce kullanıcı 5 gizli değeri eklemeli (yoksa macOS adımı ve tüm yayın durur).
   Bu not yerelde; sonraki commit'e girecek.
9. **Mac gerekmez (kullanıcı sorusu):** Developer ID sertifikası Linux'ta OpenSSL ile üretilen CSR'ı
   developer.apple.com'a yükleyerek alınır (Developer ID Application, G2 Sub-CA; yalnız Account Holder oluşturabilir),
   `.cer` + özel anahtar + Apple ara sertifikası (DeveloperIDG2CA.cer) `openssl pkcs12 -export -legacy` ile .p12
   yapılır. `-legacy` gerekir: OpenSSL 3'ün varsayılan .p12 şifrelemesini macOS `security import` (CI'da
   electron-builder'ın geçici anahtarlığı) okuyamaz. Anahtar ve .p12 depo dışında tutulur (öneri `~/apple-signing`).
10. Kullanıcı `~/apple-signing` klasörünü açtı (adım 1/7); sıradaki CSR üretimi.
11. Adım 2 ve 4 tamam: `developer-id.key`, `developer-id.csr` üretildi, `DeveloperIDG2CA.cer` indirildi (Apple
    Developer ID Certification Authority G2, 2031'e kadar geçerli). Bekleyen: adım 3 (Apple'dan .cer), 5 (.p12), 6, 7.
12. Adım 5 denendi, `developerID_application.cer` klasörde olmadığı için durdu (Apple'dan indirilmemiş/taşınmamış).
13. `developerID_application.cer` `~/Downloads`'tan `~/apple-signing`'e taşındı; "Developer ID Application" sertifikası
    (2027-11'e kadar), özel anahtarla eşleştiği doğrulandı (modulus özeti). Team ID sertifikada yazılı (hafızaya
    yazılmadı). Sıradaki: kullanıcı adım 5'i yeniden çalıştırır (.p12, parola sorar).
14. Adım 5: `cert.pem`, `ca.pem` oluştu; terminal parola doğrulamasında ("Verifying - Enter Export Password")
    bekliyor, `DeveloperID.p12` henüz yok.
15. `DeveloperID.p12` oluştu (4342 bayt, eski biçim: MAC sha1, 2048 yineleme; parolalı, yalnız sahibi okuyabilir).
    Linux'ta base64 için `base64 -w0` kullanılır (macOS'taki `-i` GNU'da başka anlama gelir, satır kırmak da istenmez).
    Sıradaki: adım 6 (uygulamaya özel parola) ve 7 (5 gizli değer, kullanıcı girer).
16. **Gizli değerler eklendi** (kullanıcı, 2026-10-16): CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID. İmza klasörü `~/Documents/apple-signing`'e taşındı (anahtar, .p12,
    sertifikalar; Kasım 2027'de sertifika yenilenirken gerekir). PR #2 denetimleri yeşil: check, package (linux,
    windows, macOS imzasız) geçti; birleştirilebilir. Birleşince v0.2.1 macOS dahil yayımlanır (imza + onay ilk kez
    gerçek ortamda denenecek).
17. **PR #2 birleştirildi** (`51c734d`); v0.2.1 Release çalışması:
    https://github.com/metin-aydin/JumpDesk/actions/runs/38911128835. Yerelde `main` güncellendi, `development` silindi.
    Kullanıcı `~/Downloads/jumpdesk_0.2.0_amd64.deb`'i indirdi (kurulu JumpDesk paketi yok); kurulumu kendisi yapacak
    (`sudo apt install`). v0.2.1 yayımlanınca kurulu 0.2.0 .deb'in uygulama içi güncellemesi (pkexec ile dpkg) ilk kez
    gerçek ortamda denenecek. Dev masaüstü kaydı `jumpdesk-dev.desktop` ayrı, çakışmaz; ayarlar ortak
    (`~/.config/JumpDesk`).
18. `gh run list` çıktısı terminalde sayfalayıcıda (less) açılıyor ve satırları kesiyor; kullanıcı ilk sürümün
    çalışmasını yenisi sandı. v0.2.1 çalışması 38911128835: prepare geçti, üç build sürüyordu (16:53).
19. **0.2.0 .deb kuruldu** (kullanıcı, `sudo apt install`): `/opt/JumpDesk`, `resources/package-type` = deb,
    `app-update.yml` (github, updaterCacheDirName jumpdesk-updater) → DebUpdater kipi. app-update.yml'deki
    `releaseType: draft` güncelleyiciyi etkilemez (GitHubProvider `releases.atom` ve `/releases/latest` okur).
    apt'nin "_apt kullanıcısı dosyaya erişemedi" notu ~/Downloads izninden, zararsız.
20. **v0.2.1 yayımlanamadı:** macOS adımı: imza başarılı (Developer ID), Apple onayı kabul edildi (~3 dk), ama
    `stapler staple` Apple'ın damga sunucusundan (api.apple-cloudkit.com) 503 aldı ("Error 65"). @electron/notarize
    2.5.0 damgalamayı 3 kez 1–4 sn arayla deniyor, yetmedi. `discard` taslağı sildi (Linux/Windows başarılıydı).
    Çözüm (PR #3): `build/notarize.cjs` afterSign kancası (ditto zip → `notarytool submit --wait --output-format
    json`, reddedilirse `notarytool log`; sonra damgalama 30 sn arayla 10 deneme), `mac.notarize: false`. Kanca
    değerler yoksa atlar (denendi). Sürüm notu PR #2'den PR #3'e taşındı.
    PR #3: https://github.com/metin-aydin/JumpDesk/pull/3 (oturuma bağlı, CI bekliyor). Birleşince sürüm yine
    0.2.1 olur (v0.2.1 etiketi oluşmadı).
21. **v0.2.1 yayımlandı** (PR #3 birleşti `33de76d`, Release 38912717839): macOS arm64/x64 dmg+zip, Windows, Linux;
    notarize.cjs ile iki mimari de onaylandı ve ilk denemede damgalandı. Sürüm notu PR #3 açıklamasından geldi.
    Kullanıcının makinesinde kurulu .deb 0.2.0 → **0.2.1 uygulama içinden güncellendi** (DebUpdater/pkexec gerçek
    ortamda çalıştı). Yerelde main eşitlendi, yeni `development` açıldı.

## Kullanıcı istekleri — 37. tur (2026-10-16): performans
1. Şikâyet: 5 sunuculu bir grup açıkken "+" (yeni sekme) tıklanınca uygulama donuyor. "İyice incele ve düzelt,
   zamandan/token'dan tasarruf etme."
2. **Yeniden üretildi** (`dev/e2e/group-perf.mjs`, 5 terminal, 6000 satır geçmiş + saniyede ~50 satır/terminal,
   vurgu+alarm kuralları, ekran dışı + SwiftShader WebGL): "+" **31–52 sn**, gruba dönüş **~7,5 sn** kilitlenme.
3. **Kök neden 1 (donma):** gizlenen terminal WebGL'i bırakıyordu → xterm DOM çiziciye geçiyordu. xterm 6'da çıktı
   her kaydığında gelen seçim bildirimi (`RenderService.handleSelectionChanged`), odak kaybı/kazanma
   (`handleBlur/handleFocus`) duraklatmayı atlayıp DOM çiziciye gidiyor ve tüm satırları yeniden çizdiriyor; display:none
   içinde `WidthCache._measure` 0 döndürdüğü için önbelleğe girmiyor, her karakter zorunlu yerleşimle yeniden ölçülüyor
   (profilde 73 sn `_measure`). Düzeltme: (a) gizlenen terminal WebGL bağlamını korur (havuz 12, aşınca en uzun süre
   görünmeyen bırakılır); (b) `features/terminal/xterm-patches.ts`: duraklatılmışken seçim/odak bildirimleri saklanır,
   çizim sürünce uygulanır; seçim hiç yokken gelen seçim bildirimi atlanır; terminal gizlendiği anda
   (useLayoutEffect, odak değişikliğinden önce) çizim duraklatılır, görünür olunca sürdürülür.
4. **Kök neden 2 (akışta takılma):** vurgu katmanı tüm geçmişi süslüyordu (terminal başına ~15.000 işaretçi); xterm
   her işaretçi için kırpma dinleyicisi tutar, geri kaydırma doluyken her yeni satırda hepsi çalışıyordu (~100 ms kare
   boşlukları). Düzeltme: `highlight-decorator.ts` yalnız görünen alanın bir ekran üstü/altını süsler, satır başına tek
   işaretçi, etkin sayfada metni değişmeyen satırlar yeniden kurulmaz, kaydırınca (`onScroll`) pencere güncellenir.
5. Ayrıca: `Workspace.tsx` `TabContent` memo (başka sekme açılınca oturum görünümleri yeniden çizilmez);
   `JUMPDESK_DISABLE_WEBGL` (main → preload `terminalWebgl`); mock `MOCK_DATA=perf` (Cluster, `MOCK_PERF_SERVERS`).
6. **Sonuç:** WebGL: "+" 14–21 ms, dönüş 7–16 ms, akışta uzun görev yok (kare boşluğu ~20 ms). DOM çizici: "+" 16–48 ms,
   dönüş 1–12 ms; 5 görünür terminal akarken ~50 ms görevler kalır (tarayıcının satır yerleşimi/boyaması, DOM çizicinin
   doğası). 14 terminal (12 WebGL + 2 DOM): geçiş ≤ 48 ms. font-perf artık DOM çizicide (WebGL kipinde yazı boyutu
   yalnız tuvalde; denetim `.xterm-rows` okur): en uzun 75 ms. windows.mjs'e geçmiş vurgusu ve fare seçimi/kopyalama
   denetimleri eklendi.
7. **Gönderildi:** `development` `c3a2530`, PR #4 https://github.com/metin-aydin/JumpDesk/pull/4 ("JumpDesk 0.2.2:
   faster tab switching", sürüm notu açıklamada). Kullanıcı "PR aç ve yeni sürümle yayına al" dedi; `gh pr merge`
   izin denetiminde reddedildi ("Merge Without Review") → birleştirme kullanıcıda. Birleşince v0.2.2 yayımlanır.
   Doğrulama: windows 47/47 (WebGL ve DOM), tools 53, panels 13, multiwindow 21, alarm-warmup 5, smoke, tabs, sftp,
   font-perf, birim testleri, i18n 0 sorun.

## Kullanıcı istekleri — 38. tur (2026-10-19): sunucu durum çubuğu (tartışma, kod yok)
1. İstek: sekmenin tepesinde sunucunun RAM, CPU gibi bilgilerini gösteren bir çubuk; "önce tartışalım".
2. Sunulan veri yolları: (1, önerilen) mevcut kabuk entegrasyonuna (OSC 6973, türler C/L/X/I/H/K/B) yeni tür (ör. M)
   ve kurulum betiğinde arka planda 5 sn'de bir `/proc`'tan CPU/RAM/disk/load okuyan, `disown` edilmiş, kabuk ölünce
   biten döngü; tam ekran programlar (vim, less, top…) öndeyken susar (çıktı arasına girip dizi bozmasın), yalnız
   Linux; (2) sunucu başına ayrı gizli koko oturumu (JumpServer'da ikinci oturum, kayıt, parola soran hesapta çalışmaz);
   (3) yalnız JumpServer'ın topladığı sabit bilgiler (gathered_info; canlı değil, boş olabilir).
3. Yerleşim önerisi: tek sekmede terminalin üstünde ince şerit (şu an tek oturumda üst çubuk yok), grupta mevcut
   `PaneHeader`'a kısa çipler; eşik renkleri; üzerine gelince ayrıntı kartı; ayarlarda aç/kapat ve aralık.
4. Kullanıcıdan beklenen kararlar: veri yolu, varsayılan açık/kapalı, grupta yerleşim, gösterilecek değerler.
   PR #4 (0.2.2) birleştirmesi hâlâ kullanıcıda.
5. **Kullanıcı kararları (2026-10-19):** veri yolu 1 (aynı oturumda görünmez ölçüm döngüsü), varsayılan **kapalı**,
   değerler yeterli (CPU, RAM, Disk, Load, açık kalma süresi). Tıklayınca ayrıntı: ayrı pencere ya da aşağı açılan
   panel. Kullanıcı karar için görsel istedi → sohbette 4 maket gösterildi (show_widget): A grupta panel başlığında
   çipler, B grupta başlık altında ayrı şerit, C tıklayınca süzülen ayrıntı kartı, D şeridin altında açılan panel
   (terminali iter). Eşik: sarı %80, kırmızı %90. Seçim (A/B ve C/D) bekleniyor.
6. Kullanıcı çipleri beğendi, çiplerin alt çubukta olduğu bir örnek istedi → 3 maket daha: E grupta her panelin
   altında çip çubuğu (Load + açık kalma süresi de sığar), F tek sekmede terminalin altında çip çubuğu, çipe tıklayınca
   kart yukarı açılır (CPU çipinde küçük çizgi grafik, "3 sn önce"), G grupta pencerenin altında tek ortak çubuk
   (odaktaki panel; eşik aşan panelin başlığında kırmızı nokta). Seçim bekleniyor.
7. Düzeltme: kullanıcının "alt bar"dan kastı **başlık çubuğunun hemen altı** (terminalin altı değil). Yeni maketler:
   H grupta panel başlığının altında çip şeridi (CPU, RAM, Disk, Load çipleri + sağda açık kalma süresi), I tek
   sekmede sekme çubuğunun altında çip şeridi, çipe tıklayınca ayrıntı kartı aşağı açılır (terminalin üstünde süzülür).
   Önerilen: H + I (24 px şerit, her iki görünümde aynı yerde). Onay bekleniyor.
8. **Son karar (2026-10-19):** H (başlığın hemen altında çip şeridi) hem grupta hem tek sekmede. Ek istekler: dar
   panelde çipler yatay kayar; kaydırma çubuğu yer kaplamaz ve ince; tekerlek yatay kaydırır; sağdaki açık kalma süresi
   sabit; çipe tıklayınca açılan kart sabit genişlikte ve dar panelde kırpılmaz.
9. **Uygulama:**
   - Kabuk: `shell-integration.ts` `STATS_SCRIPT` (`__jd_ss` güvenli an: kabuk önde ya da öndeki program tam ekran/uzak
     bağlantı değil — `/proc/$$/stat` tpgid/pgrp + `/proc/<tpgid>/comm`; `__jd_sm` örnek; `__jd_sl` döngü, ilk örnekten
     1 sn sonra ikinci örnek, sonra aralık; `__jd_stat_start <sn>` alt kabukta `$( (… & echo $!) )` ile başlatır: işlem
     tablosuna girmez, iş iletisi basmaz, SIGINT'i yok sayar, `kill -0 $$` ile kabuk ölünce biter; `__jd_stat_stop`).
     Disk (`df -Pkl`) ve çekirdek/OS ilk ve her 6. örnekte. Yeni OSC türü M. `SETUP_MARKER` `__ngj` → `__jd_`
     (eski addan kalan iz; artık `__jd_` içeren komutlar geçmişe ve önerilere girmez).
   - Kurulum komutu tek satır: 4096 bayt sınırı (satır düzenlemesiz `sh` hesaplarında aşılırsa kapanmamış tırnakla
     `>` istemi kalır). Betik bu yüzden kısa: komut 3866 (kapalı) / 3890 (açık) bayt; birim testi sınırı denetler.
   - Uygulama: `stores/server-stats.ts` (ayrıştırıcı, CPU yüzdesi önceki sayaçlarla, eski çekirdekte MemAvailable
     yoksa MemFree+Buffers+Cached, 40 değerlik CPU geçmişi, `requested` bayrağı), `features/server-status/`
     (`ServerStatusStrip` — ScrollRow: yerel kaydırma çubuğu gizli, 3 px sürüklenebilir gösterge, tekerlek yatay; her
     çip ayrı Popover, kart `w-80` sayfaya çizilir, Base UI pencere kenarında içeri kaydırır; `ServerStatusCard`;
     `format.ts`), `SessionView` (Linux SSH'de terminalin üstünde), tercihler `serverStatus` (varsayılan kapalı) ve
     `serverStatusInterval` (5/10/30), Ayarlar → Sunucu Durumu, İngilizce sözlük `i18n/en/server-status.ts`.
   - Ayar sonradan açılırsa açık oturumda "Durumu Göster" çipi `__jd_stat_start` komutunu (istemdeyken) gönderir;
     kapatılınca çalışan döngüler oturum bitene kadar sürer (veri yok sayılır).
10. **Doğrulama:** `dev/server-stats.test.mjs` (bash + zsh, gerçek /proc), `dev/e2e/server-status.mjs` 18/18 (DOM
    çizicide; varsayılan kapalı, elle/kendiliğinden başlatma, jobs boş, dar panelde kaydırma/tekerlek/3 px gösterge/
    sabit süre, kart 320 px ve pencere içinde, `less` sırasında güncelleme durur, kapatınca şerit gider).
    Tuzak: kart açılış animasyonu (%95 ölçekten) sırasında genişlik 304 ölçülür; 400 ms beklenir.
11. PR #4 kullanıcı tarafından birleştirildi (2026-10-17, `95dbea5`), **v0.2.2 yayımlandı**. Yeni `development` güncel
    main'den açıldı; sunucu durumu işi onun üstünde.
12. Tam regresyon geçti (smoke, tools 53, windows 47, tabs, alarm-warmup 5, i18n 4, panels 13, home 17, multiwindow 21,
    sftp, ai 24, transfer 39, update 14, server-address 6, menus, rdp). `development` `cf8b913` gönderildi, PR #5
    https://github.com/metin-aydin/JumpDesk/pull/5 ("JumpDesk 0.2.3: server status strip"); birleştirme kullanıcıda.

## Kullanıcı istekleri — 39. tur (2026-10-19): beş düzeltme
1. **Her çip kendi ayrıntısı:** `ServerStatusCard` `focus` ('cpu' | 'mem' | 'disk' | 'load'); CPU: büyük yüzde, çekirdek,
   alan grafiği (`HistoryChart`, %50/%80 çizgileri, ortalama/en yüksek), yük; RAM: yüzde, GB, çubuk, bellek geçmişi
   (`memHistory` depoya eklendi), swap; Disk: tüm diskler; Load: 1/5/15 dk + çekirdek başına oran, çekirdek, açık kalma
   süresi. Kart `data-server-status-card="<focus>"`.
2. **Bağlanma gecikmesi:** yerelde kurulum 50–70 ms; gecikme JumpServer üzerinden taşınan veriden. Değişiklikler:
   - Kurulum betiği gzip+base64 ile gönderilir (`buildSetupCommand` artık async, `CompressionStream`; sunucuda
     `base64 -d | gzip -dc`); komut sonra `__jd_init <komut adları 1/0> <ölçüm aralığı>` çağırır. Satır 3890 → 1936 bayt.
   - Geçmiş ve komut adları gzip'li yeni OSC türleriyle (h, k; `DecompressionStream`): 39,5 KB → 15,2 KB.
   - Komut adları sunucu başına önbellekte (`stores/command-cache.ts`, kullanıcıya özel, 24 sa, en çok 20 sunucu);
     tazeyse kurulumda istenmez.
   - `SetupEchoGate`: ilk OSC'den sonra OSC'ler hemen yazılır, eski istem satırı yalnız görünür ilk çıktıdan (yeni
     istem) hemen önce silinir → istem "gelip kaybolmaz". OSC parçalar arasında bölünürse durum korunur.
   - Birim testi gerçek bash/zsh'de sıkıştırılmış kurulumu çalıştırır (I, h, k; önbellekte k yok).
3. **Öneri ve yapay zeka pencereleri dar panelde:** ortak `features/terminal/CursorPopup.tsx` (portal; ayrı pencerede o
   pencereye; `fixed`, imleç hücresine hizalı, uygulama penceresine sığdırılır, altta yer yoksa yukarı açılır,
   `max-width: min(560px, 100vw-16px)`). `AutocompleteState`/`AiAnchor` artık `CursorAnchor` (x, y, height).
   Test `dev/e2e/popups.mjs` (4 yan yana panel; etkin panel tıklamayla seçilir — liste yalnız etkin panelde açılır).
4. **Güncelleme kurulurken donma:** electron-updater DebUpdater pkexec'i eşzamanlı çalıştırıyordu (ana süreç kilitli,
   GNOME "yanıt vermiyor"). Artık `updater.ts` `installDeb`: `spawn('pkexec', ['/bin/sh','-c','dpkg -i "$1" ||
   apt-get install -f -y', …])` eşzamansız; durum 'installing' ("Kuruluyor… Sistem parolanız sorulduysa girin."); 0 →
   `app.relaunch()` + `quit`; 126/127 → "Parola penceresi kapatıldı…", yeniden denenebilir. İndirilen dosya
   `update-downloaded` olayındaki `downloadedFile`. Test: `JUMPDESK_UPDATE_INSTALLER=deb` +
   `JUMPDESK_TEST_DEB_INSTALLER=<betik>` (yalnız test adresiyle); update.mjs 19/19, kurulum sırasında ana süreç 1 ms.
5. **Panel boyutu değişince düzen değişmiş sayılmıyordu:** boyutlar `use-tiling`'de yerel durumdaydı. Artık grupta
   (`TabGroup.grow` {version, row, col}; `groupGrow` yalnız aynı `layoutVersion`'da geçerli; `setGroupGrow`); ana ve
   ayrı pencere aynı boyutları görür. Düzen öğesi `sizes` {rows, cols (sunucu sırasına göre)} saklar (eşitse yazılmaz),
   açılınca `openGroup` uygular; `isGroupDirty` normalize oranları %2 toleransla karşılaştırır. tools.mjs'e boyutlandırma,
   kaydetme, yeniden açınca geri gelme denetimleri eklendi.
6. **Tuzaklar (doğrulamada bulundu):**
   - `CursorPopup` konum ölçülene kadar `opacity: 0` kullanır; `visibility: hidden` olursa içindeki `autoFocus` giriş
     kutusu odak alamaz, yapay zeka sorusu terminale yazılıp komut olarak çalışır (ai.mjs bunu yakalar).
   - tools.mjs boyutlandırma adımı: önce grup sekmesi (`named`) tıklanır (Ctrl+Shift+T sonrası etkin sekme yeni
     bağlantıdır); ilk `role=separator` kenar çubuğununkidir, `[data-workspace] [role=separator][aria-orientation=horizontal]` seçilir.
   - `pkill -f "out/main/index.js"` aynı Bash komutunun içindeyse kabuğun kendisini öldürür (çıkış 144); ayrı çalıştır.
   - ESLint'te ~119 eski hata var (çoğu `components/ui/*` dönüş türü, `react-hooks/refs`); değişen dosyalar HEAD ile
     aynı sayıda hata verir, yeni hata eklenmedi.
   - Mock sunucu kabuk geçmişi kalıcıdır (`/tmp/jumpdesk-mock-hosts/<sunucu>/.bash_history`): bir testte terminale
     yanlışlıkla yazılan Türkçe metin sonraki i18n.mjs'de "Turkish text on English screens" (geçmiş paneli) olarak
     düşer; satır dosyadan silinir.
   - Sonuç: tam e2e (18 test) geçti — tools 57, ai 24, windows 47, transfer 39, server-status 24, multiwindow 21,
     update 19, home 17, panels 13, server-address 6, alarm-warmup 5, popups 4, i18n 4; smoke/tabs/sftp/menus/rdp
     çıkış 0. typecheck, i18n-check 0 sorun, server-stats birim testi geçti.
   - Commit `0bdbaaa` `development`'a pushlandı; PR #5 başlığı "JumpDesk 0.2.3: server status strip, faster session
     setup", açıklaması (sürüm notu) beş düzeltmeyi içerecek şekilde güncellendi. Birleştirmeyi kullanıcı yapar.

## Kullanıcı istekleri — 40. tur (2026-10-19): şerit ayrıntıları, işlemler, yeniden bağlanma
1. **Disk çipi en büyük diski gösterir** (`largestDisk`, boyuta göre; eski `fullestDisk` kaldırıldı). Disk kartı da
   boyuta göre sıralı (çipteki disk ilk satır).
2. **Load kartı:** 1/5/15 ortalamaları yok; çekirdek başına CPU kullanımı (`cpu0`…`cpuN`) her satırda çizgi grafikle
   (`Sparkline`, `role=img` "cpu{n} Geçmişi") ve yüzdeyle; çok çekirdekte liste `max-h-72` kayar; altta açık kalma süresi.
   Betik `/proc/stat`'taki tüm `cpu*` satırlarını yayar; depo `coreUsage`, `coreHistory` (çekirdek sayısı değişince
   sıfırlanır). `applySample` ikinci parametresi artık `CpuSnapshot {all, cores}`.
3. **En çok kullanan 5 işlem (CPU ve RAM kartları):** `__jd_pr` tüm işlemlerin `/proc/[0-9]*/stat` sayaçlarını (pid,
   utime+stime tik, rss sayfa, ad) tek `cat|awk` ile çıkarır; döngü önceki görüntüyü `p` değişkeninde tutar, `__jd_tp`
   farkı alıp `pc <tik> <pid> <ad>` (ilk örnekte yok) ve `pm <sayfa> <pid> <ad>` satırlarını üretir. Renderer CPU payını
   aynı aralıktaki toplam CPU tikine oranlar (tüm makineye göre %, kartın CPU değeriyle tutarlı; top'taki çekirdek
   başına % değil), 0 tikliler atılır; bellek = sayfa × `pg` (getconf PAGESIZE, ilk/6. örnekte). `top -bn1` kendisini
   listeler ve çok kısa aralık ölçer, `ps pcpu` ömür boyu ortalama — ikisi de seçilmedi.
4. **Durum iletisi gzip'li `m` türünde** (`__jd_sm…|gzip -c|__jd_b64`); renderer sırayla açar (söz zinciri), kapanmış
   terminalde gelen örnek yok sayılır. Kurulum komutu 2316 bayt.
5. **Kaydırma göstergesi yalnız fare şeritteyken** görünür (opacity 0 → 1).
6. **Şeritle terminal arasında boşluk yok:** terminal tam satırlardan oluşur, artık alan (≤1 satır) şerit varken altta,
   yokken üstte (`TerminalPane` `belowBar`: `pt-0.5` + `justify-start`). Ölçüm: önceden 9–22 px, şimdi 2 px.
   Görünürlük tek kaynaktan: `features/server-status/use-status-bar.ts` `useStatusBarVisible` (şerit ve terminal).
7. **Panel boyutu: her değişiklik kirli sayılır** (`isGroupDirty` toleransı 0,02 → 1e-6); tools.mjs "a 2 px resize".
8. **"Durumu Göster" tam genişlikte düğme;** tıklayınca onay ("Yeniden Bağlantı Gerekiyor", Evet/Hayır); Evet →
   `SessionView.reconnect()` (yeni token, yeni TerminalPane, kurulum ölçümü başlatır). `buildStatsStartCommand`
   kaldırıldı. Yeni oturum ayar açıksa mount'ta `markStatsRequested` (yeniden bağlanırken düğme yanıp sönmez).
   Ayar açıklaması ve "Yenileme Aralığı" notu buna göre güncellendi.
9. Testler: server-stats birim 48/48 (gerçek bash/zsh'de çekirdekler, sayfa boyutu, meşgul `sh` en üstte, gzip'li
   örnek; sentetik pay %20, boşluklu ad, çekirdek sayısı değişimi); server-status e2e 33/33 (Hayır/Evet, tam genişlik,
   2 px boşluk, hover göstergesi, CPU/RAM işlem listeleri, en büyük disk, 8 çekirdek 8 grafik).
10. **Aynı turda ek istekler:** Load kartında açık kalma süresi yok (kullanıcı istemedi; şeridin sağında zaten var;
    `longUptime` ve ilgili çeviriler kaldırıldı). Kart altındaki "Son güncelleme" çizgisinin üstü ve altı eşit:
    `PopoverContent` `p-3 pb-2` (çizgi üstü `pt-2`). Çip değerleri `ChipValue` (`min-w-[4.5ch]`, sağa hizalı,
    `tabular-nums`; "100%" sığar), yük her zaman iki ondalık → hane sayısı değişince çip boyu sabit (e2e "chip widths do
    not change", 8%/88%/100%/…/1,56/12,34 aynı genişlik).
11. Tam e2e (18 test) geçti; sonra yalnız şerit/kart değişti, server-status 34 denetim geçti. Commit `a17c97b`
    pushlandı, PR #5 açıklaması güncellendi (başlık aynı). Birleştirmeyi kullanıcı yapar.

## Kullanıcı istekleri — 41. tur (2026-10-19): 3×5 düzende donma, menü hizası
1. **Şikâyet:** 3 tane 5 sekmeli düzen açınca uygulama yavaşlıyor, sekme geçişinde sürekli donuyor. Kullanıcı
   `npm run dev` (electron-vite dev, profil `~/.config/JumpDesk`) kullanıyordu; örnek alındığında ~1 sa 55 dk açıktı ve
   o sürede bu oturumdaki değişikliklerle onlarca sıcak yenileme (HMR) almıştı. Örnekleme anında süreç boştaydı (%0).
2. **Ölçüm (yeniden üretilemedi):** `group-perf.mjs` artık `PERF_GROUPS` (çok grup, gruplar arası geçiş),
   `PERF_STATUS=1` (durum şeridi), `PERF_PROFILE=switch`, grup açılış süresi, hata anında ekran görüntüsü/durum ve GPU adı
   yazar. Ekran dışı kip de gerçek GPU'yu kullanır (ANGLE AMD Radeon Pro WX 3100, radeonsi). 3×5 + şerit: üretim
   derlemesi geçiş ≤35 ms, kullanıcının Vite geliştirme sunucusuna bağlı renderer (`ELECTRON_RENDERER_URL=
   http://127.0.0.1:5173`) ≤28 ms; 15 terminalin 12'si WebGL (havuz sınırı) ve LRU değişimi ekran dışında maliyetsiz.
3. **Görünür ölçüm güvenilmez:** kullanıcının masaüstünde (GNOME Wayland + XWayland) pencere örtülünce kareler tam 1 sn
   aralıkla gelir (XWayland'in örtülü pencere için 1 Hz geri çekilmesi), bir kez oturumlar 60 sn "bağlanıyor"da kaldı
   (kare üretilmeyince ResizeObserver/fit çalışmıyor). `setAlwaysOnTop` da yetmedi. Görünür testi kullanıcı ekranda
   çalışırken koşmak hem ölçümü bozar hem kullanıcıyı rahatsız eder.
4. **Sonraki adım (kullanıcıdan):** dev'i `npx electron-vite dev -- --ozone-platform=x11 --remote-debugging-port=9222`
   ile yeniden başlatıp 3 düzeni açması; donarsa 9222 üzerinden CDP ile iz (Tracing, gpu/cc/viz kategorileri) alınacak.
5. **"Düzeni Kaydet…" boş "Yeni Bağlantı" sekmesinin sağ tık menüsünde gösterilmez** (`tab.asset` yoksa); menus.mjs
   denetimi eklendi. Commit `686a3c8`.
6. **Menü dikey hizası:** kullanıcı "tüm menü öğelerinde metin yukarıya yakın" dedi. Ölçüm (yakınlaştırma 1, kayıtlı
   UI yazı boyutu yok → yakınlık 1): simge merkezi = metin kutusu merkezi (0,25 px), vurgu kutusu içinde de ortalı;
   büyük harf merkezi simgeyle aynı, küçük harf gövdesi ~1,3 px aşağıda (Ubuntu yazı tipi ölçüleri). %110'da metin
   ~0,5 px yukarıda. Kullanıcının gördüğü fark doğrulanamadı → ekran görüntüsü istendi; değişiklik yapılmadı.
7. **Donmanın kök nedeni (kullanıcının çalışan uygulamasından iz alındı):** kullanıcı dev'i
   `--remote-debugging-port=9222` ile açtı; CDP ile (`chromium.connectOverCDP`, Profiler + Tracing renderer+GPU)
   2 dk kayıt: 5–6,5 sn'lik uzun görevler art arda (tıklamadan sonra ~40 sn zincir). Profil: 63 sn `WidthCache._measure`
   ← DOM çizici `renderRows/createRow` ← `DomRenderer.handleResize` ← xterm `_pausedResizeTask` (boşta görev,
   `FireIdleCallback`). İz: görev başına ~1870 zorunlu stil hesabı, her biri ~3,3 ms (582 öğe).
   Zincir: 15 terminal > WebGL havuzu (12) → grup geçişinde LRU bağlam bırakır → WebGL eklentisi dispose'da
   `setRenderer(DOM)` + `handleResize(cols, rows)` çağırır → duraklatılmış terminalde xterm boyutu boşta çalışan göreve
   bırakır → görev gizli (display:none) terminalin tüm satırlarını çizer; genişlik 0 ölçüldüğü için önbelleğe girmez,
   her metin parçası zorunlu stil hesabıyla yeniden ölçülür. Ayrıca LRU, açılmakta olan grubun henüz bağlam almamış
   **görünür** bir üyesini bırakabiliyordu (eşzamanlı 2 sn DOM çizimi).
8. **Düzeltme:** (a) `xterm-patches.ts` `_pausedResizeTask`'ı saklayan bir nesneyle değiştirir (`set` görevi yalnız
   saklar, `flush` — xterm görünür olunca tam çizimden önce çağırır — çalıştırır); (b) `webgl-pool.ts` `shown` kümesi
   (`setWebglVisible`): görünen terminalin bağlamı bırakılmaz, hepsi görünürse yeni terminal DOM'da kalır;
   `needsWebgl`; (c) `TerminalPane`: görünür olan terminal bağlam bekliyorsa çizim, bağlam alındıktan sonra (pasif
   etkide) sürdürülür; açılışta `setWebglVisible`.
9. **Neden testte görünmüyordu:** ekran dışı testte aynı yol çalışıyor ama ölçüm başına stil hesabı ucuz; ayrıca
   önceki testler sürekli log akıttığı için tarayıcı boşta kalmıyordu. Zamanlama yerine kesin denetim eklendi:
   `group-perf.mjs` "hidden terminals without WebGL are not drawn while hidden" (gizli DOM terminalinin `.xterm-rows`
   metni boş olmalı; eski kod: [872, 868, 867] karakter → FAIL, yeni: [0,0,0]) ve "shown group draws with WebGL
   again". Yeni seçenekler: `PERF_STREAM=0`, `PERF_ZOOM`. requestIdleCallback ekran dışında da çalışıyor (ölçüldü).
10. **Menü dikey hizası (kök neden):** kullanıcının arayüz yazı boyutu 11 px (yakınlaştırma 11/13 = 0,846). Taban
    çizgisi tam cihaz pikseline yuvarlandığı için metin simgeden 1 cihaz pikseli yukarıda (piksel ölçümü). Düzeltme:
    `components/ui/menu-text.tsx` `menuText()` öğedeki ardışık düz metni tek `<span>`e alır, `MENU_TEXT` =
    `relative top-[0.25px] [text-box:trim-both_cap_alphabetic]`; context/dropdown menü Item, SubTrigger,
    CheckboxItem, RadioItem ve Shortcut'ta. 10–16 px arayüz boyutlarında fark en çok 0,5 px (0,25 kaydırma deneysel
    seçildi: 0 → 11 px'te −1; 0,5 → 13 px'te +1). menus.mjs piksel denetimi (11/13/15 px): eski −1 → FAIL, yeni 0/0/0,5.
11. **Disk çipinde bağlama noktası yazmaz** ("Disk 82%"); server-status e2e buna göre.
12. Tuzak: ayrı klasöre derleme proje dışındaysa pencere açılmaz; `npx electron-vite build --outDir out-<ad>` proje
    içinde kullanılır ve sonra silinir. Kullanıcının dev uygulaması açıkken kaynak kaydetmek HMR ile ona da gider
    (ölçüm sırasında dosya kaydetme).
13. **"En Alta Kaydır" bandı en alttayken görünüyordu (kök neden):** xterm `Viewport` kaydırma konumunu piksel
    (`ydisp × satır yüksekliği`) olarak tutar ve yalnız görünen satır değişince (`_sync`, `e !== _latestYDisp`)
    yeniden hesaplar; çizici değişimine (`setRenderer`) abone değildir. WebGL ve DOM çizicinin satır yüksekliği
    kesirli yakınlaştırmada farklı (kullanıcıda 23,6363 / 23,6304; testte 20,0909 / 20,0833). Gizli DOM terminaline
    çıktı gelince konum DOM yüksekliğiyle yazılır; görününce WebGL'e geçer ve konum güncellenmez; sonraki herhangi
    bir kaydırma olayında `_handleScroll` `round(scrollTop / yeniYükseklik)` = ydisp−1/−2 bulur → `scrollLines(<0)` →
    `isUserScrolling = true` → bant görünür ve terminal yeni çıktıyı izlemez (kaydırma çubuğu 5000 satırda yine en
    altta görünür). Dev modda (kullanıcının Vite sunucusu, `import('/src/...')` ile modüllere erişim) birebir üretildi:
    DOM + çıktı + WebGL + kaydırma olayı → ydisp 5000→4998, `isUserScrolling` true.
14. **Düzeltme:** `xterm-patches.ts` `setRenderer`, `handleCharSizeChanged`, `handleDevicePixelRatioChange`
    sonrasında `_latestYDisp = undefined` + `_sync()` (konum görünen satırdan yeniden hesaplanır). Aynı üretimde
    düzeltmeden sonra ydisp 5000'de kalır. UI'dan güvenilir üretilemedi (en altta tekerlekle aşağı kaydırma en alt
    sınıra oturup kendini düzeltir; sürekli çıktı her satırda konumu yeniler) → kalıcı test eklenmedi; group-perf'e
    "no scroll-to-bottom band after switching" sağlık denetimi kaldı.

## Kullanıcı istekleri — 42. tur (2026-10-19): alarm görünürlüğü, grup sekmesi kapatma, log gürültüsü
1. **Alarm oturumunu öne çıkarma:** `stores/spotlight.ts`: `spotlight(tabId)` (alarma gidilince gruptaki diğer
   paneller 2 sn `opacity-15`), `flashAlarm(tabId)` (yeni alarm olayında — `record` yeni olay döndürünce — panelin
   çerçevesi `animate-alarm-flash` ile 4 kez kırmızı yanıp söner; `data-alarm-flash`), `stopAlarmFlash`. Kullanıcı
   isteği: **tıklayınca çerçeve yanıp sönmez**, yalnız diğer paneller soluklaşır; yanıp sönme yalnız yeni hatada.
   Yanıp sönerken panelin mavi odak halkası (`ring-1 ring-primary/60`) gizlenir (kırmızının yanında mavi kenar
   kalıyordu). `motion-reduce` için sabit kırmızı çerçeve. Keyframes `globals.css` `@theme inline` içinde.
2. **`features/alarms/reveal.ts` `revealAlarm(tabId, line)`**: Alarmlar paneli ve masaüstü bildirimi ortak; sekmeye
   geçer, spotlight, satırı arar. Bildirime tıklama önceden yalnız sekmeyi etkinleştiriyordu (satır aranmıyordu):
   IPC `notify:show` artık `line` taşır, `notify:clicked` `{ tabId, line }` gönderir.
3. **Arama etkin eşleşmesi turuncu görünmüyordu (fareyle tıklayana kadar):** xterm arama eklentisi etkin eşleşmeyi
   seçer ve rengini alt katman süslemesi yapar; WebGL `CellColorResolver` seçim rengini alt katmanın üstüne boyar.
   `search-decorations.ts` `raiseActiveMatch(term)`: `term.registerDecoration` sarılır, etkin eşleşme renkleri
   (`SEARCH_DECORATIONS` activeMatchBackground) `layer: 'top'` alır. Piksel ölçümü: 172 → 1363 turuncu piksel;
   tools.mjs "active search match is orange without clicking".
4. **Grup sekmesi:** "Grubu Ayır" düğmesi yerine çarpı (`aria-label` "Grubu kapat", `closeGroup`, düzen değiştiyse
   sorar); "Grubu Ayır" sağ tık menüsünde kaldı. Grup menüsünde kapatma seçenekleri sekmeyle aynı: "Kapat",
   "Diğerlerini Kapat" (`closeOthersSafely(group.ids[0])`, grup korunur), "Tüm Sekmeleri Kapat". Sekme menüsü ve komut
   paletinde "Tümünü Kapat" → "Tüm Sekmeleri Kapat". Kaldırılan çeviriler: "Grubu ayır", "Grubu Ayır (Sekmelere Dön)",
   "Gruptaki {n} Oturumu Kapat", "Tümünü Kapat". smoke/tabs/tools e2e güncellendi.
5. **`GetVSyncParametersIfAvailable() failed` log gürültüsü:** XWayland'de GPU süreci ekran yenileme zamanını
   okuyamayınca basar (zararsız). `app.commandLine.appendSwitch('log-level')` ana süreçten **etkisiz** (Electron günlük
   düzeyini yalnız başlatma komut satırından okur; denendi). `--log-level=3` `npm run dev/dev:mock/start` betiklerine
   ve Linux paket başlatıcısına (`build/after-pack.cjs`, `JUMPDESK_CHROMIUM_LOGS=1` ile kapatılır) eklendi; ölçüm:
   bayraksız 10 sn'de 2 ileti, bayrakla 0. Chromium bu iletiyi açılışta en çok 3 kez basıp susar (kullanıcının terminalinde 1-2-3 sonra yalnız HMR satırları); vaapi/NSS ERROR satırları da aynı bayrakla gizlenir.
6. Kullanıcı yeniden başlattıktan sonra donma ve kaydırma bandı düzeldi ("düzgün çalışıyor").
7. **Doğrulama ve gönderim (42. tur):** tam e2e 18 test + font-perf + group-perf (boşta/akışlı/DOM, 3×5) geçti;
   group-perf'te WebGL denetimleri DOM kipinde atlanır. Commit `8ee1b24` `development`'a pushlandı; PR #5 başlığı
   "JumpDesk 0.2.3: server status strip, faster sessions, alarm spotlight", açıklaması (sürüm notu) güncellendi.
   Birleştirmeyi kullanıcı yapar.

## Kullanıcı istekleri — 43. tur (2026-10-19): çerçeveler ayırıcının altında kalıyordu
1. Şikâyet: gruptaki odak panelinin sağ çerçevesi mavi değil; alarm gelen panel ilk panel değilse sol kenarı kırmızı
   değil. **Neden:** `TileHandles` ayırıcıları (z-20) panel sınırına 1 px `bg-border` çizgi çizer; odak halkası
   (`ring-1`, panelin 1 px dışı) ve panel içindeki kırmızı çerçevenin ilk sütunu bu çizginin altında kalıyordu (panel
   z-10 / z-yok).
2. **Düzeltme:** odak ve alarm çerçeveleri `WindowWorkspace`'te ayrı katman: `data-pane-frame` (z-30,
   `pointer-events-none`, panelin `pct(rect)` konumu), içinde `data-focus-frame` (`ring-1 ring-primary/60`) ve
   `data-alarm-flash`. Panel kabı artık halka/z-10 taşımaz, `data-pane={tabId}` taşır. Paneli ayırıcının üstüne almak
   tutamacın yarısını tıklanamaz yapardı; katman tıklama almadığı için ayırıcılar sürüklenebilir kalır.
3. Testler: tools.mjs alarmı sağdaki panelde (test-01) üretir; hareket azaltma (`page.emulateMedia({reducedMotion:
   'reduce'})`) ile çerçeve sabit çizilir, piksel ölçümüyle dört kenar kırmızı (sol kenar ayırıcıya bitişik:
   [220,61,67]) ve odak halkası ayırıcı tarafında mavi ([130,169,244]). Testlerde panel seçici
   `[data-workspace] > [data-pane]` (eskiden `div.absolute`, artık çerçeve katmanını da yakalıyordu). tools 69/69,
   popups 4/4.
4. Panelle ilgili testler geçti (windows 47, multiwindow 21, panels 13, menus 3, server-status 34, alarm-warmup 5,
   tabs, smoke, group-perf 3×5: 35 ms). Commit `36eabb6` pushlandı, PR #5 sürüm notuna çerçeve düzeltmesi eklendi.
   Not: kullanıcı `npx electron-vite dev -- … --log-level=3 --remote-debugging-port=9222` ile açınca vaapi/NSS/vsync
   satırları kayboldu. Dev başlatmak `out/main` ve `out/preload`'ı yeniden yazar (e2e testleri `out/`'u kullanır).

## Kullanıcı isteği — 44. tur (2026-10-19): kırmızı çerçeve yerine yarı saydam kırmızı katman
- Kullanıcı kırmızı çerçeveden vazgeçti: yeni alarmda panelin üzerine `bg-destructive/20` katman (`data-alarm-flash`,
  aynı `animate-alarm-flash` ile 4 kez gelip gider, hareket azaltmada sabit; çerçeve katmanında, ayırıcıların üstünde).
  Odak halkası katman sırasında yine gizlenir. tools.mjs: "red overlay covers the whole pane, also next to a separator"
  (kenarlardan 2 px içeride piksel [248,216,217]). tools 69/69. PR #5 sürüm notu güncellendi.
- Kullanıcı "hepsi tamam, commitle pushla, main'e PR aç" dedi: her şey zaten commitli ve pushlıydı (`dcd818a`); PR #5
  (development → main) açık, CI 5 geçti / 1 atlandı, MERGEABLE/CLEAN. Yeni PR açılmadı; birleştirme kullanıcıda.

## Kullanıcı isteği — 45. tur (2026-10-20): GitHub issue'ları
1. PR #5 birleşti (2026-10-19 12:54 UTC), **v0.2.3 yayımlandı** (Latest, 13:02 UTC). Yerelde main çekildi, eski
   `development` silindi, yeni `development` main'den açıldı.
2. Açık tek issue **#6** (@Mert18, 2026-10-20): "Alt + rakam ile üst düzey sekmeler arasında geçiş". Mevcut durum:
   Ctrl+1…9 (macOS ⌘) vardı ama `ws.tabs` (grup üyeleri ayrı sayılır) üzerinden çalışıyordu; grup varken numara şeritteki
   sırayla uyuşmuyordu; ayrı pencerede numara kısayolu yoktu.
3. **Uygulama:** `workspace.ts` `topLevelTabs(state, windowId)` (şerit sırası, grup ilk üyesinin yerinde tek öğe,
   etkinleşecek sekme = gruptaki odak ya da `focusedId`); `lib/shortcuts.ts` `tabNumberShortcut(e)`: Ctrl+1…9 (macOS
   ⌘), Windows/Linux'ta Alt+1…9 da (macOS'ta Option+rakam karakter yazar → yok); Shift ve AltGr (`getModifierState
   ('AltGraph')`; Windows'ta AltGr = Ctrl+Alt) hariç — Türkçe klavyede AltGr+7/8/9/0 `{ [ ] }` yazar. Ana pencere
   (`use-global-shortcuts`) ve ayrı pencereler (`detached-windows` onKey) aynı yardımcıyı kullanır. Kısayollar listesi:
   "Ctrl+1…8 / Alt+1…8", "Ctrl+9 / Alt+9".
4. Ödünleşim: Alt+rakam artık uzak programlara gitmez (irssi/weechat pencere geçişi, bash sayısal argüman). GNOME
   Terminal/Konsole varsayılanıyla aynı; gerekirse ayar eklenebilir (kullanıcıya soruldu).
5. Test `dev/e2e/tab-keys.mjs` (DOM çizici): tek sekme + grup + tek sekme; Ctrl ve Alt ile 1…n sıralı seçim, 9 son
   öğe, Alt+rakam terminale gitmez (bash "(arg: n)" yok; denetimin kendisi ESC+1 doğrudan gönderilerek doğrulandı →
   FAIL). Sonuç 6/6. CLAUDE.md e2e listesine eklendi.
6. Testler geçti (tab-keys 6, tools 69, windows 47, multiwindow 21, home 17, panels 13, menus, i18n, tabs, smoke).
   Commit `fc48d5c` (mesajda "Closes #6" → PR main'e birleşince issue kapanır) pushlandı; **PR #7** açıldı
   (https://github.com/metin-aydin/JumpDesk/pull/7, "JumpDesk 0.2.4: switch tabs with Alt+1…9", oturuma bağlı, CI
   çalışıyor). Kullanıcıdan beklenen kararlar: (a) Alt+rakam terminale gitmesin (öneri) mi, (b) ayar mı; issue'ya
   yorum yazılsın mı (dış iletişim → izin gerekir). Birleştirme kullanıcıda.
7. **Kullanıcı kararı (2026-10-20):** "Ctrl üst düzey sekme değişimi, Alt iç sekmelerde (gruptaki paneller) değişim
   yapsın." Uygulama: `lib/shortcuts.ts` `numberShortcut(e)` → `{ scope: 'tab' | 'pane', n }`: Ctrl+1…9 (macOS ⌘)
   şerit, Alt+1…9 (macOS ⌃; Option+rakam karakter yazar) panel; Shift/AltGr hariç. `features/workspace/number-keys.ts`
   `applyNumberShortcut(shortcut, windowId, tabId)`: panel kapsamında sekme grupta değilse false döner (tuş terminale
   gider, irssi/weechat kullanılabilir); büyütülmüş grupta `toggleZoom(hedef)` büyütmeyi taşır. Ana ve ayrı pencere
   aynı işlevi kullanır. Kısayollar listesine "Gruptaki Panele Git" / "Gruptaki Son Panele Git" eklendi (EN çeviri).
   tab-keys.mjs 8/8: Ctrl sırası, Ctrl+9, Alt panel sırası (soldan sağa/yukarıdan aşağı), Alt+9, grupta Alt terminale
   gitmez, büyütülmüş grupta büyütme taşınır, tek sekmede Alt+1 terminale gider ("(arg: 1)"). PR #7 başlığı/açıklaması
   buna göre güncellenecek; "Closes #6" önceki commit'te (issue'nun istediği Alt üst düzey değil, Ctrl üst düzey oldu —
   kullanıcıya belirtildi). Issue'ya yorum için izin hâlâ bekleniyor.
8. **Gönderim (2026-10-20):** testler geçti (tab-keys 8, tools 69, windows 47, multiwindow 21, home 17, panels 13,
   menus, i18n, tabs, smoke). Commit `13a423f` pushlandı; PR #7 başlığı "JumpDesk 0.2.4: number keys for tabs and
   panes", açıklaması güncellendi. Kullanıcı izniyle #6'ya İngilizce açıklama yorumu yazıldı (Ctrl şerit, Alt grup
   paneli, ⌘/⌃ macOS, grup dışında Alt terminale gider, AltGr korunur, Keyboard Shortcuts Ctrl+Shift+K) ve issue
   "completed" olarak kapatıldı. Not: `gh issue view --json` `stateReason` alanını desteklemiyor.

## Kullanıcı isteği — 46. tur (2026-10-20): SSH terminalinde sağ tıkla yapıştırma
1. PR #7 birleşti, **v0.2.4 yayımlandı** (06:22 UTC). Yerelde main çekildi, yeni `development` açıldı (değişiklikler
   stash ile taşındı).
2. Şikâyet: sağ tıkla yapıştırma çalışmıyor. Neden: terminalde hiç sağ tık işleyicisi yoktu (Electron'da varsayılan
   bağlam menüsü yok, sağ tık hiçbir şey yapmıyordu).
3. Uygulama (`TerminalPane` `onContextMenu`, host'a `contextmenu` dinleyicisi): seçim varsa kopyalar ve seçimi kaldırır
   (Windows Terminal/PuTTY), yoksa `navigator.clipboard.readText()` → `term.paste` (köşeli parantezli yapıştırmaya
   uyar, çalıştırmaz). `term.modes.mouseTrackingMode !== 'none'` ise (vim/mc/htop fare kipi) sağ tık programa kalır,
   Shift+sağ tık yapıştırır. `rightClickSelectsWord: false` (macOS varsayılanı sağ tıkta kelime seçerdi). Kısayollar
   listesine "Sağ Tık — Seçimi Kopyala / Yapıştır".
4. Test `dev/e2e/right-click.mjs` (DOM çizici, Electron `clipboard` ile pano): 6/6 — yapıştırır ama çalıştırmaz,
   Enter'la çalışır, seçimde kopyalar + seçim kalkar + yapıştırmaz, fare kipinde (`printf '\e[?1000h'`) sağ tık
   programa kalır, Shift+sağ tık yapıştırır. CLAUDE.md e2e listesine eklendi. Sürüm 0.2.5 olacak.
5. Testler geçti (right-click 6, windows 47, tools 69, tab-keys 8, multiwindow 21, popups 4, ai 24, server-status 34,
   i18n, smoke). Commit `caf7f92` pushlandı; **PR #8** açıldı (https://github.com/metin-aydin/JumpDesk/pull/8,
   "JumpDesk 0.2.5: right-click paste in terminals", oturuma bağlı, CI çalışıyor). Birleştirme kullanıcıda.

## Kullanıcı istekleri — 47. tur (2026-10-20): terminal boşlukları, bazı sunucularda durum şeridi yok
1. **Terminalin üstünde/altında ~1 satır boşluk (ekran görüntüsü, grup paneli):** ölçüm (grup paneli, 4 yükseklik):
   üst boşluk = 6 px `pt-1.5` + artan alan (hücre tam piksel, 19 px) → 12–23 px; alt 0 px. Alttaki boş satır imlecin
   satırı (`tail -f` çıktısı satır sonuyla biter, imleç yeni satırda) — her terminalde vardır, kaldırılamaz.
   **Düzeltme:** `TerminalPane` `fillHeight()` (`sizeChanged` başında, görünürken): hücre yüksekliği taban (yazı ×
   `LINE_HEIGHT` 1.15) ±1 cihaz pikseli içinde artanı en aza indirecek biçimde seçilir (`lineHeight = (hücre+0.5)/
   yazı`; tabansa 1.15), sonra `resyncViewport(term)` (xterm-patches'ten dışa açıldı; satır yüksekliği değişince
   kaydırma konumu yeniden hesaplanır). Görünür olma yolundaki ayrı fit kaldırıldı (`sizeChangedRef`), `fitRef` silindi.
   Üst dolgu `pt-1.5` → `pt-1`. Ölçüm (21 yükseklik): üst boşluk ort. 8,1 px (eskiden ~17), en çok 17. ±2 px
   hesaplandı (ort. 2,7 artan) ama paneller arası satır aralığı farkı büyür → ±1 seçildi.
2. **Bazı sunucularda durum şeridi görünmüyor (ayar açık):** canlı uygulama kapandığı için doğrudan bakılamadı. Kod
   nedenleri: (a) kurulum yanıtı 3 sn içinde gelmezse (`SetupEchoGate` zaman aşımı; yavaş giriş betikleri, motd, yoğun
   sunucu) entegrasyon 'failed' oluyordu; sonradan gelen iletiler (istatistik dahil) şeridi açmıyordu (görünürlük
   'ready' ister) → **düzeltildi:** entegrasyondan gelen her ileti (`onCwd/onIps/onStats`) 'pending'/'failed'ı
   'ready' yapar; zaman aşımında 10 sn (`INTEGRATION_GRACE_MS`) 'pending' kalır, sonra 'failed'. (b) Kabuk bash/zsh
   değil ya da base64/gzip yok → kurulamaz; artık şerit yerine "Sunucu durumu alınamadı: kabuk entegrasyonu
   kurulamadı (bash ya da zsh, base64 ve gzip gerekir)." satırı (`useStatusBarState` → 'failed', `data-server-status-
   failed`). (c) JumpServer'da varlık türü linux/unix/macos/bsd/aix değilse entegrasyon hiç kurulmaz (şerit yok,
   otomatik tamamlama da yok). (d) /proc'suz sistemlerde (AIX/BSD) ölçüm başlamaz.
   Testler (server-status.mjs, 36): "late setup response still shows the strip, without a failure line in between"
   (`sleep 5` istem gelir gelmez), "failed integration explains why" (`exec env -i PATH=/nonexistent bash`).
3. Canlı tanı tuzağı: uzun süre HMR almış dev uygulamada `import('/src/stores/…')` yeni (boş) modül örneği verir;
   `performance.getEntriesByType('resource')` ile yüklenmiş `?t=` adresi bulunup o içe aktarılmalı.
4. Tam regresyon geçti (server-status 36, right-click 6, tab-keys 8, windows 47, tools 69, multiwindow 21, popups,
   ai 24, panels 13, home 17, i18n, menus, tabs, alarm-warmup, transfer 39, update 19, server-address, sftp, rdp,
   font-perf, group-perf 3×5 boşta/akışlı 33–43 ms). Commit `2f8b3b0` pushlandı; PR #8 başlığı "JumpDesk 0.2.5:
   right-click paste, status strip on slow servers", açıklaması güncellendi. Birleştirme kullanıcıda.

## Kullanıcı isteği — 48. tur (2026-10-20): sistem tepsisi simgesi ve kayıtlı düzenler (tartışma)
1. İstek: Ubuntu/macOS sağ üstte, Windows sağ altta simge; tıklayınca kayıtlı düzenler uygulamanın tasarımında açılır
   pencerede; düzene tıklayınca uygulama açıksa yeni sekmede, değilse uygulamayı açıp düzeni açsın.
2. Teknik bulgu (bu makinedeki `ubuntu-appindicators@ubuntu.com/indicatorStatusIcon.js`): GNOME AppIndicator'da sol
   tek tık menü varsa menüyü açar (çift tık beklemesiyle), menü yoksa hiçbir şey yapmaz; çift sol tık `Activate`
   (Electron `click`), orta tık `SecondaryActivate`, sağ tık menü. Yani Ubuntu'da tek tıkla özel pencere açılamaz;
   yalnız GNOME'un kendi (dbusmenu) menüsü. Linux'ta `tray.getBounds()` boş döner (konum yok). macOS/Windows'ta tıklama
   olayı ve simge konumu var → özel açılır pencere mümkün.
3. Kullanıcı kararı: pencere kapatılınca **tepside kalsın, oturumlar kapansın** (süreç yaşar, pencere yok olur; düzen
   seçilince pencere yeniden açılıp düzen açılır). Ubuntu için iki yöntem çizilerek gösterildi (show_widget): A)
   düzenler doğrudan GNOME menüsünde (tek tık), B) menüde "Düzenler…" → bizim tasarımda açılır pencere (iki tık).
   macOS/Windows'ta tek tıkla bizim açılır pencere, sağ tıkta "JumpDesk'i Göster"/"Çıkış". Kullanıcının A/B seçimi
   bekleniyor.
4. **Kullanıcı A'yı seçti (2026-10-20). Uygulama:**
   - `src/main/tray.ts` `initTray(win)`: simge (Linux renkli 32 px `resources/tray/tray.png`; Windows 16+32 px;
     macOS şablon `trayTemplate.png` + `@2x`, siyah `>_` çerçeveli, ffmpeg librsvg ile SVG'den üretildi). Linux: GNOME
     menüsü = "Kayıtlı Düzenler" (pasif başlık), düzenler, ayırıcı, "JumpDesk'i Göster", "Çıkış"; çift tık (Activate)
     pencereyi gösterir; düzen adındaki `&` `&&` yapılır (kısayol harfi sayılmasın). macOS/Windows: sol tık bizim
     açılır pencere (`tray.html`, `TrayPopup.tsx`: başlık, arama, düzen + sunucu sayısı, ok tuşları/Enter/Esc,
     "JumpDesk'i Göster"; içerik yüksekliğini bildirir, pencere ona göre boyutlanır, odak kaybında gizlenir), sağ tık
     kısa menü. Konum `tray-position.ts` `popupPosition` (simge altı/üstü, çalışma alanına sığdırma, Linux'ta sağ üst).
   - Kapatma: tepsi varsa `close` önlenir → ana pencereye `app:hidden` (renderer `useWorkspace.reset()`: oturumlar ve
     ayrı pencereler kapanır) → `win.hide()`; ilk seferde (Linux/Windows) bir kez bildirim (`store.trayHintShown`).
     Pencereyi yeniden kurmak yerine gizlemek seçildi: `registerIpc/attachAuthWindow/initUpdater/notify` ana pencere
     örneğine bağlı. `quitting.ts`: `before-quit` → gerçekten kapanıyor; güncelleme kurulumunda `markQuitting()`
     (macOS Squirrel pencereleri önce kapatır). İkinci örnek ve macOS `activate` gizli pencereyi gösterir.
   - Renderer `features/tray/tray-sync.ts`: giriş yapılmışsa düzen listesini (`id, name, servers`) ana sürece
     bildirir (düzen, dil ve oturum değişince); `tray:open-layout` → `openLayout` (giriş yoksa girişten sonra).
   - **Tuzak:** iki önyükleme (`index`, `tray`) ortak modül içe aktarırsa paketleyici `out/preload/chunks/` üretir;
     korumalı önyükleme başka dosya yükleyemez (pencere açılmaz). Açılır pencere kanalları/türleri bu yüzden ayrı
     `src/shared/tray-popup.ts`'te; `@shared/api` tray önyüklemesinde yalnız tür olarak kullanılır. Derlemeden sonra
     `grep require out/preload/*.js` yalnız `electron` göstermeli.
   - Ekransız testlerde tepsi yalnız `JUMPDESK_TEST_TRAY=1` ile kurulur (test kancası `globalThis.__jumpdeskTray`:
     labels, click, openPopup, popupVisible, mainVisible). Açılır pencere testte `offscreen`.
   - Testler: `dev/e2e/tray.mjs` 8/8 (menüde düzen, kapatınca tepside + oturumlar kapalı, tepsiden düzen → pencere
     + sekme, açılır pencere listesi/sunucu sayısı/arama/Enter → yeni sekme ve gizlenme, Çıkış süreci kapatır);
     `dev/tray-position.test.mjs` 6/6.
5. **Kullanıcı düzeltmeleri (2026-10-20):** (a) pencere kapanınca "tepside çalışıyor" bildirimi gösterilmesin →
   `hintOnce`, `store.trayHintShown` ve çevirisi kaldırıldı; (b) tepsi simgesi uygulama simgesi değil yalnız `>_`
   işareti olsun → `resources/tray/` yeniden üretildi: `trayTemplate(.png,@2x)` siyah `>_` (macOS şablon, Windows açık
   görev çubuğu), `tray-light(.png,@2x)` beyaz `>_` (Linux GNOME koyu üst çubuk, Windows koyu görev çubuğu);
   Windows'ta `nativeTheme.shouldUseDarkColorsForSystemIntegratedUI` ve `nativeTheme` `updated` olayıyla yenilenir.
   Eski renkli `tray.png/tray-16.png` silindi.
6. **Gönderim (2026-10-20):** kullanıcı tepsiyi kendi makinesinde denedi ("çalışıyor") ve uzun regresyonu iki kez
   durdurdu; tamamlanan: tray 8/8 (yeni derleme), update 19/19, önceki turda smoke/tabs/windows 47/multiwindow 21/
   tools 69/menus/panels 13/home 17/i18n/server-status 36/right-click 6/tab-keys 8/popups 4 (çalışmayanlar: ai,
   alarm-warmup, transfer, server-address, sftp, rdp — tepsi değişikliğinden etkilenmez). Commit `fc27956` +
   `c907ef2`; PR #8 başlığı "JumpDesk 0.2.5: system tray layouts, right-click paste, status strip on slow servers".
   **Tuzak:** `.gitignore` `*.png` alt klasördeki görselleri yok sayıyordu; istisna `!resources/**/*.png` yapıldı
   (yoksa CI derlemesi tepsi simgesini bulamazdı). Yeni görsel eklerken `git status`'ta göründüğü denetlenmeli.
   Açılır pencere ilk açılışta `ready-to-show` beklenerek gösterilir (yüklenmeden boş görünüyordu; testte zamanlama hatası).

## Kullanıcı istekleri — 49. tur (2026-10-22)
İstekler: (1) düzenleri klasörleme + tepside klasör alt menüsü; (2) autocomplete'te seçili önerinin devamı komut
satırında soluk görünsün (VS Code satır içi önizleme gibi; Tab/→ kabul aynı kalır, Enter yalnız yazılanı çalıştırır);
(3) düğme metinleri ortalı değil (yukarıda); (4) "Oturum kapandı / Yeniden bağlan" çubuğu komut satırının üstüne
biniyordu, terminalin altında yer kaplamalı; (5) Ctrl+Shift+V iki kez yapıştırıyordu; (6) art arda Ctrl+C sunucu durum
şeridini donduruyordu; (7) klasörler ana ekranda sola hizalı olsun, sol ağaçta da "Kayıtlı Düzenler" (yeni klasör,
sürükle-bırak); (8) klasörler dışa aktarılsın.
- (1,7,8) **Düzen klasörleri** (tek seviye, ad = kimlik, büyük/küçük harf duyarsız benzersiz):
  - Veri `stores/layouts.ts`: `SavedLayout.folder?`, ayrı sıralı liste `folders` (kullanıcı anahtarı `layoutFolders`,
    boş klasörler de tutulur). `sanitizeFolders` (düzenlerin kullandığı ama listede olmayanları ekler, yazımı eşitler),
    `groupByFolder`, `layoutPath` ("Klasör / Düzen"), eylemler `createFolder` (varsa onu döndürür), `renameFolder`
    (başka klasörün adıysa false), `removeFolder` (düzenler klasörsüz kalır), `moveToFolder(id, ad|null)`,
    `saveCurrent(ad, grup, klasör?)` (verilmezse üzerine yazılan düzenin klasörü korunur), `replaceAll(düzenler, klasörler)`.
  - Pencere `LayoutDialog.tsx` kipleri: save (Klasör seçimi: Klasör Yok / klasörler / Yeni Klasör… → ad kutusu),
    rename, folder (yeni; `layoutId` verilirse düzen içine taşınır), folder-rename ("Bu adda bir klasör var.").
  - Ortak: `features/layouts/layout-dnd.ts` (HTML5 sürükle-bırak türü `application/x-jumpdesk-layout`,
    `layoutDragProps`, `useDropTarget(klasör|null)`, `useLayoutDrag`), `LayoutMenus.tsx` (`LayoutMenuItems`: Aç,
    Yeniden Adlandır, Klasöre Taşı ▸, Klasörden Çıkar, Sil; `FolderMenuItems`: Klasörü Yeniden Adlandır, Klasörü Sil).
  - Ana ekran `SavedLayouts.tsx`: başlıkta "Yeni Klasör"; klasörler önce (başlık bölüm başlığıyla aynı sol hizada,
    kartlar `pl-5.5` ile klasör simgesi hizasında, kapalılar `layoutFoldersClosed`), sonra klasörsüz kartlar; klasördeki
    düzen sürüklenirken klasörsüz alan yoksa "Klasörden çıkarmak için buraya bırakın." alanı belirir. Bırakma vurgusu
    `ring` (yerleşimi kaydırmaz).
  - Sol ağaç `LayoutTree.tsx`: `ServerTree` kaydırma alanının en üstünde, ağaç satırlarıyla aynı ölçüde (h-7, girinti
    14, `zoom` ölçeği); kök "Kayıtlı Düzenler" (sayı, üzerine gelince + düğmesi = Yeni Klasör, sağ tık Yeni Klasör…),
    klasör ve düzen satırları; çift tık/Enter açar; düzen satırı klasöre ya da klasördeki düzene bırakılınca o klasöre,
    köke bırakılınca dışarı. Açıklık `layoutTreeOpen` (varsayılan kapalı). `role=tree` kullanılmaz (testler
    `getByRole('tree')` ile sunucu ağacını bulur). Sanal liste `scrollMargin` = bölüm yüksekliği
    (`getBoundingClientRect`, `zoom` altında `offsetHeight` güvenilmez), satır `top: v.start - layoutsHeight`.
  - Tepsi: `TrayLayoutList {folders, layouts}` (`TrayLayout.folder?`); GNOME menüsünde klasörler alt menü (boşsa pasif
    "Klasörde düzen yok"), sonra klasörsüz düzenler; açılır pencerede klasör satırı (tık/Enter/→ açar, ← kapatır,
    alttaki düzenler girintili), aramada düz liste "Klasör › Düzen". Test kancası `labels(altMenü?)`, `click('Klasör/Düzen')`.
  - Komut paleti "Düzeni Aç: Klasör / Düzen". Dışa aktarım: `sections.layoutFolders` düzenler bölümüyle birlikte
    (eski sürüm alanı yok sayar), özet kartında "N klasör"; yalnız klasör varsa da bölüm boş sayılmaz.
  - Test `dev/e2e/layout-folders.mjs` 24/24.
- (2) **Satır içi önizleme** `features/terminal/GhostText.tsx`: `AutocompleteState.ghost` (imleç satır sonundaysa;
  ekranın kaba göre konumu, hücre boyu, sütun/satır, imleç hücresi, yazı tipi); terminal kabına mutlak bindirilir, her
  karakter bir hücrede, satır sonunda alta geçer, tampona yazılmaz; renk tema ön planı %45. Öneri satırları
  `role=option aria-selected`. Test `dev/e2e/autocomplete.mjs` 7/7.
- (3) Ölçüm: kullanıcının arayüz yazı boyutu **11** (pencere yakınlaştırma 11/13≈0,846; bilgi
  `~/.config/JumpDesk/Partitions/jumpserver/Local Storage` içinde, ana pencere `jumpserver` bölümünü kullanır). Bu
  ölçekte düğme yazısının üstünde 6, taban çizgisinin altında 10 px kalıyordu. Çözüm `components/ui/button.tsx`
  `wrapLabels`: düğmedeki metin `<span data-slot="button-label" class="relative top-[0.4px]
  [text-box:trim-both_cap_alphabetic]">` içine alınır (ardışık metinler birleşir, yalnız boşluk olanlar sarılmaz).
  Ölçüm (`text-box` kırpma + 0,4 px): ui 11→8/8, 12→9/9, 13→~10/10, 14→1 px alçak (yuvarlama), 15→11/11, 16→1 px
  alçak, 18→yarım px yüksek. `text-box-trim` düz metin alt öğesine (anonim esnek öğe) uygulanmaz; span şart.
  Ubuntu yazı tipi 12 px: ascent 11, descent 2 (tuval ölçümü). Offscreen ve ekrandaki çizim aynı sonucu verir.
- (4) `SessionView.tsx`: `endedBar` akışta (`shrink-0`), terminal/RDP altında; `connectingOverlay` mutlak kaldı.
- (5) `TerminalPane.tsx` kopyala/yapıştır kısayolunda `e.preventDefault()` (Chromium'un Ctrl+Shift+V düz metin
  yapıştırması da çalışıyordu). Test: `dev/e2e/right-click.mjs` 9/9 (eski derlemede iki yeni test FAIL'di).
- (6) **Ctrl+C ölçüm döngüsünü öldürüyordu (yalnız bash):** döngü `$( ( __jd_sl & echo $! ) )` ile kabuğun süreç
  grubunda; istemde Ctrl+C SIGINT'i ona da gönderir, `sleep` ölür, bash döngüsü de çıkar (zsh'te çıkmıyordu). Çözüm
  `shell-integration.ts`: alt kabukta `trap '' INT QUIT TSTP` (yok sayılan sinyaller alt süreçlere geçer) ve
  `__jd_prompt` döngü ölmüşse (`__jd_sp` dolu, `kill -0` başarısız) `__jd_stat_start $__jd_si` ile yeniden başlatır.
  Yeniden üretim: python `pty.fork` + `bash --norc -i` (betik `SHELL_SCRIPTS` esbuild ile dökülür). Test
  `server-status.mjs` 6a (düzeltme geri alınınca FAIL, uygulanınca ok; toplam 37).
- **Gönderim (2026-10-22):** tam regresyon geçti (menus 3, panels 13, home 17, tools 69, windows 47, multiwindow 21,
  alarm-warmup 5, transfer 39, server-address 6, i18n 4, ai 24, update 19, popups 4, tab-keys 8, tray 8, autocomplete 7,
  layout-folders 24, right-click 9, server-status 37; smoke/tabs/sftp/rdp çıktıları beklenen). `tools.mjs`'teki
  "alarms panel has no rules/events headers" düğme etiketi span'a alındığı için "Kurallar" düğmesini de sayıyordu;
  denetim düğme dışındaki öğelere daraltıldı. **Tuzak:** düğme metni artık ayrı span; `getByText(..., exact)` düğme
  etiketini de bulur (`getByRole('button', { name })` etkilenmez). Commit'ler `c26d667`, `b2374df`, `8ef0370`,
  `e5255da`; PR #9 "JumpDesk 0.2.6: layout folders, inline suggestions, status strip survives Ctrl+C" (sürüm
  0.2.6, birleştirme kullanıcıda).

## Kullanıcı istekleri — 50. tur (2026-10-22): yapay zeka ayarları ve yeni yapay zeka özellikleri
1. **Ayarlar → Yapay Zeka yeniden düzenlendi:** en üstte "Yapay Zeka Özellikleri" anahtarları, altta "Yapay Zeka
   Sağlayıcısı" kutusu: "Sağlayıcı" açılır listesi (yalnız adlar: Kullanma, Anthropic (Claude), OpenAI, Google Gemini,
   Azure OpenAI, OpenAI Uyumlu; kutu kutu kartlar kalktı) → hemen altında API anahtarı (sağlayıcı açıklaması anahtarın
   ipucu oldu) → diğer alanlar. Model: anahtar (OpenAI uyumluda adres) kaydedilmeden liste istenmez ve seçim pasif;
   elle model adı yazılamaz (TextField yedeği ve `AiField.options` kaldırıldı). Liste boş/hatalıysa pasif + neden.
2. Kullanıcıya özellik önerileri soruldu (AskUserQuestion). Seçilenler: **Snippet Üret**, **Alarm/Vurgu Kuralı Üret**,
   **Seçili Çıktıyı Açıkla**, **Alarm Olayını Açıkla**; çıktı gönderenlerde **"Yalnız onay iste"** (maskeleme yok;
   gidecek metin onay penceresinde gösterilir). Seçilmeyenler: Komutu Açıkla, Komut Paletinden Sor, Başarısız Komutu
   Açıkla, Log Özeti. → [[user-preferences]] yapay zeka gizlilik kuralı güncellendi.
3. Uygulama:
   - `AiFeatures` = autocomplete (varsayılan kapalı), snippets, rules, explainSelection, explainAlarm (yeniler varsayılan
     açık; düğmeler yalnız özellik açık + sağlayıcı ayarlıysa görünür, `aiFeatureReady`). `AI_FEATURE_KEYS`,
     `DEFAULT_AI_FEATURES` (`shared/ai.ts`); ana süreç her anahtarı doğrular.
   - Ana süreç `main/ai/index.ts` `runTask(özellik, görev, kur, ayrıştır)`; görevler `prompt.ts`: `SUGGEST_TASK`,
     `SNIPPET_TASK` (options[name, command, description, risk] 1–3), `RULE_TASK` (options[pattern, regex,
     caseSensitive, description]; düzenli ifade derlenemezse atılır), `EXPLAIN_TASK` (summary, points ≤6,
     suggestions ≤3). Komutlarda ortak `COMMAND_RULES`; metinler `<request>/<sample>/<text>/<context>/<question>`
     içinde "untrusted data". IPC `ai:snippet`, `ai:rule`, `ai:explain`. Açıklama sınırı 8000 (metin) + 3000 (bağlam,
     son kısım) karakter.
   - `providers.ts` `CallInput.task: AiTaskSpec {name, description, schema, maxTokens}`; Gemini şeması
     `geminiSchema()` ile JSON şemasından (türler büyük harf, additionalProperties atılır). Anthropic araç adı = görev adı.
   - Arayüz: `features/ai/` → `AiExplainDialog` (+ `stores/ai-explain.ts`; onay: gidecek metin `pre` içinde, satır/
     karakter sayısı, ek soru; Gönder'den önce istek yok; sonuç: özet, maddeler, "Komut Satırına Yaz" — `ai-actions.ts`
     `writeCommand` Ctrl+E Ctrl+U + komut, riskliyse onay), `AiRuleButton` (alarm kural penceresi ve vurgu formunda ✨;
     örnek satırla "eşleşiyor/eşleşmiyor"; Kullan formu doldurur), `AiSnippetAssist` (snippet düzenleyicinin üstünde
     tarif → Öner → Kullan), `use-snippet-ai.tsx` (`useSnippetAi`, `useCommandExplain`: Komut başlığında "Açıkla",
     açıklama komut alanının altında), `RiskBadge`, `RevealOnMount`.
   - Terminal: fareyle seçim bırakılınca `SelectionChip` "Açıkla" (`data-ai-explain-chip`, fare basışı seçimi bozmaz;
     seçim kalkınca/kaydırınca gider); komut paletinde "Seçimi Yapay Zekaya Sor". Alarm: `AlarmDetector` son 8 satırı
     tutar (kontrol karakterleri atılır), `AlarmEvent.context`; olay satırında ✨ "Yapay Zekaya Sor".
   - Snippet formu: komut bölümü `min-h-52` (açıklama kutusu eklenince düğmeler komut alanına binmesin).
4. Testler: `dev/e2e/ai.mjs` 44/44 (sahte sunucu istem türünü sistem iletisinden ayırır: "snippet writer", "rule
   writer", "terminal text explainer"; test `JUMPDESK_DISABLE_WEBGL=1` ve alarm beklemesi 0 ile açılır),
   `dev/ai-providers.test.mjs` 21/21 (görev adı, Gemini şeması), alarm-detector 19.
5. **Tuzaklar (50. tur):**
   - `useEffect(() => el?.scrollIntoView(...))` uygulamayı çökertti ("destroy_ is not a function"): bu Chromium
     sürümünde `scrollIntoView` Promise döndürüyor, React onu temizleme işlevi sanıyor. Etki gövdesi blok olmalı.
   - Ayrı pencerede (`DetachedChrome`) sürekli bağlı, kapalı bir Base UI `Dialog` o penceredeki sağ tık menülerini
     sürekli yeniden oluşturdu (windows/multiwindow testleri düştü). `AiExplainDialog` ayrı pencerede yalnız açıkken
     bağlanır; ana pencerede her zaman bağlı.
   - Alarm bağlamında readline'ın geri silmeleri (Ctrl+U) işlenir (`remember`).
   - `ai.mjs` 5 çalıştırmadan 1'inde "java.lang.Exception: JD_ALARM_BOOM" satırı alarm olarak yakalanmadı (kök neden
     bulunamadı; dedektördeki ekleme eşleşmeyi etkilemiyor). Tekrarlarsa yankı (`ignoreEcho`, `isEcho`) incelenmeli.
6. **README ve ekran görüntüleri:** başlık "An AI-powered, cross-platform desktop client"; hero görüntüsünün altında
   "AI assistant" bölümü (madde listesi, gizlilik paragrafı, 6 görüntü). Yeni görüntüler `ai-explain`,
   `ai-explain-selection`, `ai-alarm`, `ai-rule`, `ai-snippet`; `settings-ai` özellik anahtarlarını gösterir.
   `dev/screenshots.mjs` sahte sağlayıcısı istem türüne göre yanıt verir, DOM çiziciyle çalışır (seçim için satırlar
   DOM'dan okunur).
7. **GitHub (2026-10-22):** depo açıklaması "AI-powered desktop client for JumpServer …" yapıldı, konular eklendi (ai,
   ai-assistant, bastion, electron, jumpserver, llm, ssh-client, terminal). PR #9 başlığı "JumpDesk 0.2.6: AI
   assistant, layout folders, inline suggestions", açıklaması yapay zeka maddeleriyle güncellendi (`gh pr edit`
   Projects (classic) GraphQL hatası verdiği için `gh api -X PATCH repos/.../pulls/9` kullanıldı).
