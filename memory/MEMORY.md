# jumpdesk hafıza indeksi

Her oturumda önce bu dosya okunur. Kural: [CLAUDE.md](../CLAUDE.md).

- [Kullanıcı tercihleri](user-preferences.md) — Türkçe, worktree yok, yorum kuralı, ADHD biçimi
- [JumpServer v4.10 davranışı](target-server.md) — v4.10.14+ Community (X-Pack yok); yalnız 443 açık ağ senaryosu, OAuth2, login/çerez ayrıntıları
- [JumpServer mimarisi](jumpserver-architecture.md) — veri modeli, bileşenler/portlar, bağlantı akışı, resmî ve 3. taraf istemciler
- [JumpServer API](jumpserver-api.md) — swagger.json'dan: giriş/MFA, ağaç, yetkili hesaplar, connection token, endpoints
- [SSH Guide](ssh-guide.md) — `ssh JMS-<token.id>@host -p 2222`, parola token.value; koko keyboard-interactive/sftp
- [Teknoloji araştırması](tech-stack-research.md) — Electron vs Tauri, ssh2+xterm, RDP=lion/Guacamole (razor yok), paketleme, safeStorage
- [Mimari kararlar](architecture-decisions.md) — Electron+React+shadcn (antd yok), gömülü login+çerez, koko WS SSH, lion RDP, kendi döşeme/grup modeli, electron-builder (durum etiketli)
- [RDP lion protokolü](rdp-lion-protocol.md) — kendi Guacamole istemcimiz için lion ws URL, TOKEN_ID/GUAC_* parametreleri, jms_event, pano
- [SFTP koko protokolü](sftp-koko-protocol.md) — `/koko/ws/sftp/` JSON mesajları, tek istek kuralı, parçalı yükleme, SFTP kök kafesi, token exchange
- [SSH koko protokolü](ssh-koko-protocol.md) — xterm.js için koko ws URL, CONNECT→TERMINAL_INIT, binary çıktı, TERMINAL_DATA/RESIZE, PING 25 sn
- [UI yığını araştırması](ui-stack-research.md) — antd yerine shadcn/ui (Base UI) + electron-vite + headless-tree; dockview önerildi ama kullanılmadı; tuzaklar
- [Terminal performansı](terminal-performance.md) — xterm.js WebGL havuzu (16 bağlam sınırı), binary yazma, WebSocketStream backpressure, 11 maddelik kontrol listesi
- [Masaüstü tasarımı](desktop-design.md) — Termius benzeri görsel dil + gerçek masaüstü hissi için 9 kural (çerçevesiz pencere, sistem fontu, seçim/zoom kapalı...)
- [Özellikler](features.md) — kullanıcının 10 öncelikli özelliği (snippet, autocomplete, otomatik komut, history, arama, arrange, yerel IP, hızlı bağlan) + tur tur istekler (49. tur: düzen klasörleri, satır içi öneri, düğme hizası, Ctrl+C; 59. tur: aramada hızlı Enter, issue #15)
- [Luna v4 referansı](luna-v4-reference.md) — ağaç arama API'si (assets/tree/?search=), CSRF/org header kuralları, token gövdesi
- [Uygulama notları](implementation-notes.md) — kod yapısı, mock/dev/e2e komutları, öğrenilen tuzaklar (ws filtresi, CSRF, shadcn cn hatası)
