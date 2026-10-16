---
name: tech-stack-research
description: Masaüstü istemci için teknoloji araştırması (Electron/Tauri, SSH, RDP, paketleme, oturum saklama) — 2026-10 durumu
metadata:
  type: reference
---

Araştırma tarihi: 2026-10-14. Kararlar ayrı dosyada: [[architecture-decisions]].

## Resmî istemciler
- v4 Client (github.com/jumpserver/client, 4.1.7): Tauri 2 + Nuxt/Vue + Go yardımcı.
  Yalnızca **başlatıcı**: `jms://` ile PuTTY/SecureCRT/mstsc/Remmina/xfreerdp gibi harici uygulamaları açar.
- v5 Client (github.com/jumpserver/luna içinde `electron/`, v5.0.0 / v5.1.0-rc3):
  **Electron 44** + Forge + xterm.js 6 + node-pty + Go `jms-ssh` + `guacamole-common-js-jumpserver`
  → SSH ve RDP pencere içinde. Giriş: OAuth2 PKCE (`jms2://auth/callback`), token safeStorage'da.
  Sonuç: üretici, terminal/RDP pencere içine alınınca Tauri'den Electron'a döndü.
- luna/koko/lion GPL-3.0: kodlarını kopyalamak bizi GPL yapar; protokolleriyle konuşmak yapmaz.

## Çatı karşılaştırması
- Electron 44.7.x (Chromium 152, Node 24): her OS'ta aynı motor → xterm WebGL, WebSocket, canvas sorunsuz.
  Maliyet: 110–160 MB kurulum, ~150–300 MB RAM.
- Tauri 2.12: ~40 MB; ama Linux'ta WebKitGTK → WebGL terminal yavaş yola düşebilir, NVIDIA sorunları;
  updater deb/rpm güncellemez.
- Wails v2/v3-beta: Go, aynı webview sınırları. Flutter: DOM yok → xterm.js/guacamole kullanılamaz, önerilmez.

## SSH (pencere içi)
- **Yalnız 443'ün açık olduğu ağlarda 2222 kapalı** → birincil yol koko WebSocket (443, çerez auth, `JMS-KOKO` protokolü;
  ayrıntı [[jumpserver-api]]). Aşağıdaki ssh2 yolu yalnız 2222 erişilebilen ağlar için ikincil.
- İkincil: `ssh2` 1.17 (saf JS) main/utilityProcess'te → koko:2222, `JMS-<token.id>`/`token.value`;
  keyboard-interactive (MFA) ve `sftp()` destekli; host key `hostVerifier` ile sabitlenir.
  Ayrıntı: [[ssh-guide]].
- Ekran: `@xterm/xterm` 6.0 + fit/webgl/search/web-links/unicode11. Çok sekmede WebGL bağlam sınırı (~16):
  gizli sekmede WebGL addon bırakılır.
- koko WebSocket protokolü resmî olarak belgesiz; koko kaynağındaki `pkg/httpd/message.go` referans
  (GPL kod kopyalanmaz, yalnızca protokol uygulanır).

## RDP (pencere içi)
- **Razor (yerel RDP proxy, 3389) Enterprise/X-Pack** → Community sürümde `.rdp` yolu yok.
- Community'de RDP = **lion (Guacamole)**. Sunucuda `/lion/connect` var (v4 düzeni; v5'te lion koko içine taşındı:
  `/koko/lion/ws/...`). Kendi Guacamole istemcimiz: `guacamole-common-js` (Apache-2.0) → lion websocket.
  Hızlı ilk sürüm: lion sayfasını `WebContentsView` içinde göstermek.
- IronRDP (wasm + RDCleanPath köprüsü; Electerm kullanıyor) → razor gerektirir, bizde ileri aşama/opsiyonel.
- Yerel RDP penceresini Electron içine gömmek pratik değil (Windows SetParent kırılgan, Wayland/macOS imkânsız).

## Paketleme / güncelleme
- electron-builder 26.x: Win NSIS oneClick (+portable, msi), mac dmg, Linux AppImage/deb/rpm.
- electron-updater 6.8: NSIS, DMG(+zip), AppImage, deb, rpm günceller; MSI/Squirrel.Windows güncellemez.
  Forge varsayılanı Squirrel → electron-updater ile çakışır; **electron-builder tercih**.
- İmza: Windows Azure Artifact Signing (`win.sign.type: "azure"`); macOS Developer ID + notarization.
- Protokol: kendi şemamız (`jumpdesk://`); `jms://` ve `jms2://` resmî istemcilerin.
- CI: GitHub Actions matrisi (macOS arm64, Windows x64/arm64, Ubuntu x64/arm64).

## Oturum saklama / güvenlik
- `safeStorage`: Win DPAPI, mac Keychain, Linux libsecret/kwallet. Linux `basic_text` backend'de sabit
  parola kullanır → `getSelectedStorageBackend()` kontrolü, `basic_text` ise kalıcı kayıt yok/uyarı.
- keytar arşivlendi → gerekirse `@napi-rs/keyring`.
- v4.10.x'te koko ve lion WebSocket'leri **yalnızca çerez** (`jms_sessionid`) kabul eder; API Bearer
  token'ı terminal için yetmez. → Oturum = gömülü JumpServer giriş sayfası + kalıcı partition çerezi.
  OAuth2 PKCE sunucuda var ama v4'te terminal için yine çerez gerekir.
- Sertleştirme: contextIsolation, sandbox, nodeIntegration kapalı, dar preload, CSP, Fuses;
  kendinden imzalı sertifika için ilk kullanımda public key sabitleme (`setCertificateVerifyProc`).

## UI
- Vue 3 veya React 19. Sekme/bölme: **dockview** (MIT, React/Vue, düzen kaydet/yükle).
- Ağaç: tembel yükleme + sanallaştırma (React `@headless-tree/core`, Vue `vue-virtual-scroller`).
- Luna ağaç davranışı: async parametreler `id=key`, `name=n`, `level=lv`; büyük ağaçta
  `X-JMS-TREE-OFFSET` yanıt header'ı ile parça parça yükleme; Community'de ROOT org yerine varsayılan org.
- Referans uygulamalar: **Electerm** (Electron 44 + React + xterm + ssh2 + ironrdp-wasm RDP + noVNC; MIT) en yakın örnek;
  Tabby (Electron, RDP yok).
