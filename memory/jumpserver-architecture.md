---
name: jumpserver-architecture
description: JumpServer nedir, veri modeli, bileşenler/portlar, bağlantı akışı, resmî ve üçüncü taraf istemciler
metadata:
  type: reference
---

Kaynak: jumpserver/jumpserver, koko, lion, luna, client, installer depoları (v4.10.19 etiketi ve dev/v5),
2026-10-14 incelemesi. Sürümler: v5.0.0 (2026-09-17), v4.10.19 LTS (2026-08-20), v3.10.23.
Hedef kurulum v4.10.x: [[target-server]]. API ayrıntıları: [[jumpserver-api]].

## Nedir
- Açık kaynak (GPLv3) PAM / bastion host. Kullanıcılar sunuculara doğrudan değil JumpServer üzerinden
  bağlanır; yetki, parola kasası, oturum kaydı (replay), komut denetimi merkezîdir.

## Veri modeli
- **Org**: ROOT `…0000`, DEFAULT `…0002`, SYSTEM `…0004`. Community'de yalnız DEFAULT.
- **Asset**: `name`, `address`, `platform`, `zone`, `nodes` (çoklu), `protocols` (ad+port).
  Kategoriler: host (linux/windows/unix), device, database, cloud (k8s), web, ds, custom.
  Varsayılan portlar: ssh 22, rdp 3389, telnet 23, vnc 5900, mysql 3306, postgresql 5432...
  Platform, protokol ayarlarını taşır (RDP security any/rdp/tls/nla, ad_domain, console).
- **Account** (varlık hesabı): `name`, `username`, `secret_type` (password, ssh_key...), `privileged`.
  Özel alias'lar: `@ALL`, `@INPUT` (elle girilir), `@USER` (JumpServer kullanıcısıyla aynı), `@ANON`, `@SPEC`, `!name` hariç.
- **Node**: materyalize anahtarlı ağaç (`1:2:3`); bir varlık birden çok düğümde olabilir.
- **AssetPermission**: users/user_groups → assets/nodes → accounts → protocols; `actions` bit maskesi:
  connect=1, upload=2, download=4, copy=8, paste=16, delete=32, share=64; tarih aralığı.
- **Zone** (v4.10'da Domain'in yeni adı) + Gateway: bileşenler varlığa gateway üzerinden tünel açar.
- **Endpoint**: istemcilere söylenen host/portlar: https 443, ssh 2222, rdp 3389, magnus 5525, vnc 15900.

## Bileşenler
- Community v4.10: `core` (Django API), `celery`, `koko`, `lion`, `chen`, `web` (nginx + lina + luna).
- Enterprise (X-Pack): `magnus` (DB proxy 5525), `razor` (mstsc RDP proxy 3389), `xrdp`, `nec` (VNC 15900),
  `panda`, `facelive`, `video` — kapalı kaynak.
- **koko** (Go): SSH/SFTP sunucusu 2222 + web terminal (ssh, telnet, k8s, DB CLI'ları).
- **lion** (Go + guacd): web RDP/VNC (Guacamole). v5'te koko içine taşındı (`/koko/lion/ws/`).
- **chen** (Java): web DB arayüzü. **lina**: yönetim arayüzü (Vue). **luna**: kullanıcı çalışma alanı (v4 Angular, v5 Nuxt + Electron).

## Bağlantı akışı
1. İstemci `POST connection-token/` → core yetki + ACL kontrolü yapar, `value` = 16 karakter rastgele.
2. Bileşen (koko/lion) token ile core'dan `super-connection-token/secret/` üzerinden hesabın sırrını alır;
   tek kullanımlık token bu anda geçersizleşir (reusable değilse). Ömür 5 dk.
3. Web: Luna iframe → `/koko/connect/?token=<id>` (ws `/koko/ws/terminal/?token=<id>`, subprotocol `JMS-KOKO`)
   veya `/lion/connect?token=<id>` (ws `/lion/ws/connect/?TOKEN_ID=<id>&GUAC_WIDTH=&GUAC_HEIGHT=&GUAC_DPI=&GUAC_KEYBOARD=&GUAC_TIMEZONE=`,
   subprotocol `guacamole`). İkisi de çerez auth (v4).
4. Yerel istemci: `client-url` → `jms://<base64 JSON>` → resmî istemci PuTTY/Terminal/mstsc/Remmina'yı açar.
5. Connect method değerleri: web `web_cli`, `web_gui`, `web_sftp`; native `ssh_client`, `ssh_guide`, `sftp_client`,
   `db_client`, `db_guide`, `mstsc`, `vnc_client`, `vnc_guide`; applet/virtual_app. `rdp_guide` tanımlı ama sunulmuyor.

## SSH girişleri (koko 2222)
- Token: `ssh JMS-<token.id>@host -p 2222`, parola token.value → doğrudan varlığa, menüsüz. Ayrıntı [[ssh-guide]].
- Doğrudan: `user@account@asset` / `user#account#asset`; 4 parçalı `user@mysql@account@asset`.
- Klasik: `ssh <jms_user>@host -p 2222` → menü (`p` varlıklar, `g` ağaç, `/kw` arama, `q` çıkış).
- Token ve doğrudan girişte ters port yönlendirme (VS Code Remote-SSH) desteklenir.

## RDP (Razor, yalnız Enterprise)
- `.rdp`: `full address:s:<host>:3389`, `username:s:<jms_user>|<token_id>`, parola dosyada yok.

## Resmî istemciler
- v4 "JumpServer Client" (MIT, Tauri 2 + Vue + Go `awaken`): `jms://` işleyicisi; OAuth2 PKCE ile kendisi de giriş
  yapabilir. Kullanıcı adı ssh/sftp/telnet için `JMS-<id>`, diğerlerinde `<id>`; parola `value`.
  Eklenti şablonu örneği (PuTTY): `-{protocol} {username}@{host} -P {port} -pw {value}`.
- v5: Luna Electron uygulaması, `jms2://`.

## Üçüncü taraf istemciler (hepsi küçük, <5 yıldız)
- **m2eat/JumpServerDesktop**: Electron + React + ssh2 + xterm, OAuth PKCE, koko SSH, SFTP — bize en yakın.
- **Marcyle/myterm**: Rust/GPUI, web login'i taklit eder (RSA+AES, captcha, MFA) + koko WebSocket.
- **JaeGerW2016/jms-desktop**: Tauri; RDP'yi lion Guacamole WebSocket ile yapar.
- **MiFaZhan/jms-client**: Go CLI; varsayılan koko WebSocket, 2222 opsiyonel.
- **foryoung365/JumpServerClientApp**: Electron; lion web arayüzünü sarar (kısayol/IME sorunları için).
