---
name: rdp-lion-protocol
description: Kendi Guacamole RDP istemcimiz için lion v4.10.19 tünel protokolü (URL, parametreler, jms_event olayları)
metadata:
  type: reference
---

Kaynak: github.com/jumpserver/lion etiket v4.10.19 (`main.go`, `pkg/tunnel/*.go`, `ui/src/hooks/useGuacamoleClient.ts`).
Kod GPL-3.0 → kopyalanmaz, yalnızca protokol uygulanır. Karar: [[architecture-decisions]] madde 4.

## Bağlantı
1. `POST /api/v1/authentication/connection-token/` → asset, account alias, `protocol: "rdp"`,
   `connect_method: "web_gui"` ([[jumpserver-api]]).
2. WebSocket: `wss://<host>/lion/ws/connect/?<query>`, `Guacamole.WebSocketTunnel` + `Guacamole.Client`
   (npm `guacamole-common-js` 1.5.0 — lion de bunu kullanıyor, Apache-2.0).
   Kimlik: **çerez** (`JmsCookieAuth`: `jms_sessionid`, `jms_csrftoken`) → istek giriş yapılmış partition'dan gitmeli.
3. `client.connect(query)` sorgu parametreleri:
   - `TOKEN_ID=<token.id>` (zorunlu; yoksa sunucu hata metni gönderir)
   - `GUAC_WIDTH`, `GUAC_HEIGHT` (piksel), `GUAC_DPI`
   - `GUAC_KEYBOARD` (klavye düzeni, ör. `tr-tr-qwerty` — guacd düzen adları), `GUAC_TIMEZONE`
   - `GUAC_IMAGE`, `GUAC_AUDIO`, `GUAC_VIDEO` (desteklenen mime türleri, tekrar eden parametre)
4. Diğer uçlar: `/lion/ws/monitor/` (`SESSION_ID`), `/lion/ws/share/`, dosya aktarımı
   `GET|POST /lion/api/tunnels/:tid/streams/:index/:filename`.

## Olaylar ve özellikler
- Özel opcode `jms_event` (argv[0] = olay adı, argv[1] = JSON): `session`, `current_user`,
  `session_pause`, `session_resume`, `share_join`/`share_exit`/`share_users` ve diğerleri.
  `tunnel.oninstruction` sarmalanarak yakalanır.
- Pano: `client.onclipboard` (StringReader/BlobReader) ve `client.createClipboardStream(mime)` (StringWriter).
  İzin `actions` içindeki copy/paste bitlerine bağlı.
- Yeniden boyut: `client.sendSize(w, h)`; `display.onresize` olayı.
- Dosya sistemi: `client.onfilesystem`, `client.onfile` (upload/download izni varsa).
- Girdi: `Guacamole.Keyboard`, `Guacamole.Mouse`, dokunmatik için `Guacamole.Mouse.Touchscreen`.
