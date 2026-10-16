---
name: ssh-koko-protocol
description: Kendi xterm.js SSH ekranımız için koko v4.10.19 WebSocket terminal protokolü (URL, mesajlar, binary çıktı, ping)
metadata:
  type: reference
---

Kaynak: github.com/jumpserver/koko etiket v4.10.19 (`pkg/httpd/message.go`, `userwebsocket.go`, `tty.go`,
`webrouter.go`, `ui/src/hooks/useTerminalSocket.ts`, `ui/src/hooks/helper/index.ts`).
GPL kod kopyalanmaz, yalnızca protokol uygulanır. Karar: [[architecture-decisions]] madde 3.

## Bağlantı
1. `POST connection-token/` → `protocol: "ssh"`, `connect_method: "web_cli"` ([[jumpserver-api]]).
2. `new WebSocket("wss://<host>/koko/ws/terminal/?token=<token.id>", ["JMS-KOKO"])`, `binaryType = "arraybuffer"`.
   Kimlik: **çerez** (`HTTPMiddleSessionAuth` → `jms_sessionid`); çerezsiz istek login'e 302 alır.
   Sorgu alanları (`WsRequestParams`): `token`, `type` (`monitor`|`share`|`k8s`), `target_id`, `asset`, k8s için `pod`/`namespace`/`container`.
3. Sunucu → `{"id":<ws uuid>,"type":"CONNECT","data":"<JSON: setting, permission, clipboard_policy, asset{name}...>"}`.
4. İstemci → `{"id":<CONNECT.id>,"type":"TERMINAL_INIT","data":"{\"cols\":C,\"rows\":R,\"code\":\"\"}"}`.

## Mesajlar
- Biçim: JSON metin çerçevesi `{id, type, data, raw, err}`; `data` her zaman string (içinde JSON olabilir).
- **Sunucu çıktısı binary WebSocket çerçevesi** (`TERMINAL_BINARY` → `WriteBinary(raw)`):
  `Uint8Array` doğrudan `term.write()`'a verilir; string çevirisi yok.
- İstemci girdisi: `{"id","type":"TERMINAL_DATA","data":"<metin>"}`; binary çerçeve de kabul edilir
  (sunucu `BinaryMessage`'ı `TERMINAL_BINARY` sayar).
- Boyut: `{"id","type":"TERMINAL_RESIZE","data":"{\"cols\":C,\"rows\":R}"}`.
- Canlılık: istemci 25 sn'de bir `{"type":"PING"}` gönderir; sunucu 30 sn boşta kalınca PING yollar;
  5 dk hareketsizlikte bağlantıyı kapatır.
- Kapanış/hata: `CLOSE`, `ERROR` (`err`), `TERMINAL_ERROR` (`err` terminale yazılır).
- Diğer olaylar: `TERMINAL_SESSION`, `TERMINAL_ACTION`, `TERMINAL_SESSION_PAUSE`/`RESUME`,
  `TERMINAL_PERM_VALID`/`TERMINAL_PERM_EXPIRED`, `TERMINAL_SHARE*`, `MESSAGE_NOTIFY`,
  `TERMINAL_SYNC_USER_PREFERENCE`.
- ZMODEM (rz/sz) desteği koko UI'da var (`useZmodem`); bizde ileri aşama.
