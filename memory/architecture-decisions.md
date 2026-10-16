---
name: architecture-decisions
description: jumpdesk mimari kararları — durum (önerildi/onaylandı) ve gerekçeleriyle
metadata:
  type: project
---

Durum etiketleri: **ÖNERİ** (kullanıcı onayı bekliyor), **ONAY** (kullanıcı kabul etti).
Dayanak: [[tech-stack-research]], [[jumpserver-api]], [[target-server]], [[ssh-guide]].

1. **ONAY (2026-10-14) — Çatı: Electron + Vite + React + TypeScript. antd KULLANILMAZ** (kullanıcı istemiyor).
   **ONAY (2026-10-14) — Tasarım yönü: Termius benzeri görünüm; web sitesi değil gerçek masaüstü uygulaması hissi.**
   Ayrıntı ve kurallar: [[desktop-design]].
   **ONAY (2026-10-14) — UI temeli: shadcn/ui; koyu + açık tema.** shadcn (Base UI primitives) davranış/erişilebilirlik için; görünüm tamamen
   bizim Termius benzeri tasarım sistemimiz. Tailwind v4 + electron-vite react-ts şablonu (Electron 44'e yükseltilerek)
   — ayrıntı [[ui-stack-research]].
   **ÖNERİ — Hızlı terminal:** xterm.js 6 + WebGL havuzu + binary yazma + WebSocketStream backpressure —
   ayrıntı [[terminal-performance]].
   Sunucuda SSH (koko WS) ve RDP (lion/Guacamole WS) web tabanlı; her OS'ta aynı Chromium gerekli.
   Kullanıcı Linux'ta → Tauri'nin WebKitGTK'sı terminal/WebGL için zayıf. Üretici v5'te Electron'a geçti.
   Kullanıcı React + TS + Tailwind ile çalışıyor (antd bu projede istenmiyor).
2. **ONAY (2026-10-14) — Giriş/oturum: JumpServer'ın kendi giriş sayfası uygulama penceresinde, `persist:` partition.**
   v4.10'da koko/lion yalnız çerez kabul ettiği için tek çözüm. LDAP/MFA/parola şifrelemeyi sunucu yapar.
   Çerez diski Chromium tarafından OS anahtarlığıyla şifrelenir; ömür sunucu belirler (24 saat).
   Parola saklanmaz.
3. **ONAY (2026-10-14) — SSH ekranı: kendi xterm.js ekranımız + koko WebSocket (443).** 2222 erişilebilirse ssh2 seçeneği ikincil.
4. **ONAY (2026-10-14) — RDP ekranı: baştan kendi Guacamole istemcimiz** (guacamole-common-js →
   `wss://host/lion/ws/connect/?TOKEN_ID=<id>&GUAC_WIDTH=&GUAC_HEIGHT=&GUAC_DPI=...`, subprotocol `guacamole`, çerez auth).
   lion sayfasını gömme ara adımı yok. Razor (yerel mstsc) Community'de yok.
5. **UYGULANDI (2026-10-14) — Düzen:** solda @headless-tree/react + @tanstack/react-virtual (tembel yükleme,
   sunucu tarafı arama, favoriler). **dockview kullanılmadı**: sekmeler başlık çubuğunda kendi `TabStrip`'imiz
   (sürükle-bırak sıralama), içerik kendi döşeme düzenimiz (`Workspace.tsx` + `tile-layout.ts`). Paneller mutlak
   konumlu, sabit anahtarlı tek kapsayıcıda → düzen değişince terminal yeniden kurulmaz.
   **UYGULANDI (2026-10-14) — Bölünmüş görünüm modeli** (araştırma: Termius/Tabby/iTerm2/Windows Terminal/Warp tek
   sekmede toplar; Xshell/Royal TS sekme grubu kullanır; MobaXterm N sekmeyi üstte bırakır ve "garip" görünür):
   `workspace.group = {ids, mode: vertical|horizontal|grid, zoomedId, broadcast, excluded, layoutVersion}`.
   Üst çubukta grup tek sekme ("<odaklı> +N-1", düzen simgesi, yayın simgesi, ayır düğmesi). Her panelde 28px
   başlık (durum, OS, ad, iç IP, Yayın etiketi, Büyüt/Ayrı sekmeye al/Kapat). Odak: vurgulu başlık + 1px çerçeve,
   diğerleri soluk (`preferences.dimInactivePanes`). Ctrl+Shift+Enter büyüt; ayırıcıya çift tık eşitle; üye <2
   olunca grup dağılır; yeni oturumlar grubun dışında normal sekme açılır.
6. **ONAY (2026-10-14, 2026-10-16'da güncellendi) — Dağıtım: public GitHub deposu (MIT), imzasız başlangıç.** Paketleme: electron-builder (Win NSIS oneClick + portable, mac DMG, Linux AppImage + deb/rpm),
   electron-updater, GitHub Actions matrisi. Sunucu adresi gömülü değil (giriş ekranında girilir).
7. **ONAY (2026-10-14) — Lisans:** luna/koko/lion (GPL-3.0) kodu kopyalanmaz; yalnızca protokolleri uygulanır.
8. **ONAY (2026-10-16) — Kullanıcıya özel yerel kayıtlar + şifreli aktarım.** Yerel kayıtlar (localStorage +
   `jumpdesk.json`) `sunucu host/kullanıcı adı` kapsamıyla ayrılır; uygulama içi ayrımdır (aynı işletim sistemi
   hesabındaki dosyalar diskte şifresiz). Paylaşım/yedek `.jumpdesk` dosyasıyla: AES-256-GCM, anahtar uygulamaya gömülü
   (amaç dosyanın yalnız JumpDesk ile açılması ve bütünlük denetimi; parola koruması yok). Sunucu adresi artık gömülü
   değil: her girişte sorulur, son adres önerilir.
