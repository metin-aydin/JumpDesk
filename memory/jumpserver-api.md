---
name: jumpserver-api
description: Bir JumpServer v4.10 kurulumunun swagger.json'undan çıkarılan, istemci için gerekli JumpServer API uç noktaları ve şemaları
metadata:
  type: reference
---

Kaynak: proje kökündeki `swagger.json` (OpenAPI 3.0.3, 496 path).
Swagger'da tanımlı tek güvenlik şeması: `Bearer` (http bearer). Ayrıntı gerekirse
`swagger.json` doğrudan Python ile sorgulanır (3 MB, tümü okunmaz).
Genel mimari: [[jumpserver-architecture]]. Sunucuya özgü gözlemler: [[target-server]].

## Kimlik doğrulama
- `POST /api/v1/authentication/auth/` (eşdeğeri `/api/v1/authentication/tokens/`)
  - İstek: `username`, `password`, opsiyonel `public_key`
  - Yanıt 201: `token`, `keyword` (header öneki, ör. `Bearer`), `date_expired`, `user` (UserProfile)
  - Kullanım: `Authorization: <keyword> <token>`
- MFA: `POST /api/v1/authentication/mfa/challenge/` {`type`, `code`*};
  `mfa/select/` ve `mfa/send-code/` {`type`*, `username`} (SMS/e-posta kodu tetikler; koko da kullanır);
  `mfa/verify/`.
- Diğer: `access-keys/` (HTTP Signature için AK/SK), `access-tokens/` (listele/iptal),
  `temp-tokens/`, `passkeys/`, `sso/login-url/` (POST), `sso/login/`,
  `login-confirm-ticket/status/` (giriş onayı bekleme), `user-session/` (GET/DELETE).
- Oturum geçerlilik testi: `GET /api/v1/users/profile/` (UserProfile: `id`, `username`, `name`,
  `mfa_enabled`, `need_update_password`, `is_expired`, `org_roles`, `system_roles`, `lang`...).

## Organizasyon
- `GET /api/v1/orgs/orgs/` (Org: `id`, `name`, `is_default`, `is_root`), `GET /api/v1/orgs/orgs/current/`.
- İsteklerde org seçimi `X-JMS-ORG` header'ı ile yapılır (ayrıntı: [[jumpserver-architecture]]).

## Yetkili sunucular ve ağaç (`{user}` = `self`)
- `GET /api/v1/perms/users/self/nodes/children-with-assets/tree/` — tembel yükleme ağacı
  (swagger'da sorgu parametresi belgelenmemiş; Luna `?id=`/`?key=`/`?search=` gönderir — doğrulanacak).
- `GET .../nodes/all-with-assets/tree/`, `.../nodes/children/tree/`, `.../nodes/tree/`,
  `.../nodes/children-with-assets/category/tree/` (kategoriye göre ağaç).
- `GET .../nodes/` (NodePermed: `id`, `name`, `key`, `value`, `full_value`, `assets_amount`).
- `GET .../nodes/{node_id}/assets/`, `.../nodes/favorite/assets/`, `.../nodes/ungrouped/assets/`,
  `.../ungroup/assets/tree/`, `.../assets/tree/`.
- `GET /api/v1/perms/users/self/assets/` — sayfalı (`limit`, `offset`, `q`, `name`, `address`,
  `platform`, `protocols`, `category`, `type`, `zone`); yanıt `{count,next,previous,results}`.
- `GET /api/v1/perms/users/self/assets/{id}/` → AssetPermedDetail:
  - `permed_protocols[]`: `name`, `port`, `public`, `setting`
  - `permed_accounts[]`: `id`, `alias`, `name`, `username`, `has_username`, `has_secret`,
    `secret_type`, `actions`, `date_expired`
  - ayrıca `platform{id,name}`, `zone`, `category`, `type`, `nodes`, `spec_info`.
- Favoriler: `GET/POST /api/v1/assets/favorite-assets/`, `DELETE .../{id}/`.

## Bağlantı token'ı (connection token)
- `POST /api/v1/authentication/connection-token/` (eşdeğeri `/api/v1/users/connection-token/`)
  - Zorunlu: `account`, `connect_method`; ayrıca `asset`, `protocol`, `input_username`,
    `input_secret`, `connect_options`, `is_reusable`, `remote_addr`.
  - Yanıt: `id`, `value`, `expire_time` (sn), `date_expired`, `actions`, `org_id`,
    `from_ticket`, `face_monitor_token`, `is_expired`...
- `GET|POST .../connection-token/{id}/client-url/` — yerel istemci için `jms://` URL.
- `GET|POST .../connection-token/{id}/rdp-file/` — `.rdp` dosyası (Razor gerekir).
- `PATCH .../{id}/reuse/` {`is_reusable`}, `PATCH .../{id}/expire/`, `POST .../exchange/`.
- `super-connection-token/` ve `admin-connection-token/`: bileşenlerin (koko/lion) kullandığı
  ayrıcalıklı uçlar; istemci kullanmaz.
- Ayar: `CONNECTION_TOKEN_REUSABLE` (settings/public).

## Terminal / uç nokta bilgisi
- `GET /api/v1/terminal/endpoints/smart/` → Endpoint: `host`, `https_port`, `http_port`,
  `ssh_port`, `rdp_port`, `vnc_port`, `mysql_port`, `postgresql_port`... (SSH Guide için host/port buradan).
- `GET /api/v1/terminal/components/connect-methods/` → ConnectMethod: `value`, `label`, `type`,
  `endpoint_protocol`, `component`.
- `GET /api/v1/terminal/my-sessions/` — kullanıcının oturumları (Session şeması).
- `GET /api/v1/settings/public/` (oturum ister): `TERMINAL_KOKO_SSH_ENABLED`, `TERMINAL_RAZOR_ENABLED`,
  `TERMINAL_MAGNUS_ENABLED`, `SECURITY_MAX_IDLE_TIME`, `SECURITY_MFA_AUTH`, `SECURITY_MFA_VERIFY_TTL`,
  `SECURITY_LUNA_REMEMBER_AUTH`, `SECURITY_WATERMARK_*`, `CONNECTION_TOKEN_REUSABLE`, `AUTH_PASSKEY`, `AUTH_TEMP_TOKEN`.
- `GET /api/v1/settings/public/open/` (anonim): `XPACK_ENABLED`, `INTERFACE`, `LANGUAGES`.
- `GET /api/health/` (anonim). JumpDesk adres ekranı sunucuyu bununla doğrular: yanıt JSON ve `status` alanı içerir.

## Kaynak koddan doğrulanan davranışlar (v4.10.19 + dev, 2026-10-14)

### Giriş akışı (`POST /api/v1/authentication/auth/`)
- Gövde: `{username, password, public_key?, challenge?, code?, mfa_type?}`; düz parola kabul edilir,
  API captcha kontrol etmez. LDAP/RADIUS/yerel kullanıcıların hepsi çalışır.
- Başarı 201: `{"token","keyword":"Bearer","date_expired","user"}`; token Redis'te `TOKEN_EXPIRATION`
  (varsayılan 86400 sn). Yenileme uç noktası yok → süre bitince yeniden giriş.
- **MFA oturum çerezine bağlıdır** → istemci çerez kavanozu tutmalı (`jms_sessionid`):
  1. `/auth/` → 200 `{"error":"mfa_required","data":{"choices":["otp","sms","email"],"url":...}}`
  2. SMS/e-posta ise `POST mfa/select/` `{"type":"sms"}`
  3. `POST mfa/challenge/` `{"type":"otp","code":"123456"}` → `{"msg":"ok"}` / 401 `mfa_failed`
  4. Aynı çerezle `/auth/` tekrar → token
- Giriş onayı: 200 `{"error":"login_confirm_wait","data":{"ticket_id"}}` → `GET login-confirm-ticket/status/` yokla.
- Hatalar 400 `{"error": "password_failed"|"user_inactive"|"user_expired"|"block_login"|"acl_not_allow"...}`.
  Parola süresi dolmuşsa web arayüzüne yönlendirilmeli.
- Auth sırası: Signature(service) → Access Key → `Token` → Bearer(cache) → Bearer(OAuth2) → Session.
- Session auth ile POST/PUT/PATCH/DELETE için `X-CSRFToken: <jms_csrftoken>` zorunlu (yoksa sessizce anonim).
- OAuth2 (v4.10.14+): `/core/auth/oauth2-provider/{authorize,token,revoke}/`, PKCE S256 zorunlu,
  redirect URI v4'te `jms://auth/callback` (tam eşleşme). Gömülü webview yönlendirmeyi kendisi yakalayabilir.

### Org
- Seçim önceliği: `?oid=` → `X-JMS-ORG` header → `X-JMS-ORG` çerezi → session. Değerler: UUID ya da
  `root`/`default`/`system`. Community'de her zaman DEFAULT (`00000000-0000-0000-0000-000000000002`).
- Kullanıcının org'ları: `GET /api/v1/users/profile/permissions/` → `workbench_orgs[]`
  (`/orgs/orgs/` admin ister).

### Ağaç
- `nodes/children-with-assets/tree/?key=<node key>` (veya `id=<uuid>`); özel anahtarlar `favorite`, `ungrouped`.
  v4: anahtarsız çağrı = üst düğümler + varsayılan açık düğümün varlıkları. Luna async parametreleri:
  `id=key`, `name=n`, `level=lv`.
- `nodes/all-with-assets/tree/`: en çok 10.000 varlık; fazlası için yanıt header'ı `X-JMS-TREE-OFFSET: N` → `?offset=N`.
- Düğüm: `{"id":"1:2","name":"Linux (12)","pId":"1","isParent":true,"meta":{"type":"node","data":{"id","key","value"}}}`
- Varlık: `{"id":"<uuid>","name","title":"<address>\n<comment>","pId":"<node key>","isParent":false,
  "iconSkin":"linux","meta":{"type":"asset","data":{"platform_type","org_name","sftp","name","address"}}}`
- Ağaç öğelerinde protokol/hesap yok → `assets/<uuid>/` detayından alınır.
- Arama: `assets/?search=` (veya `q=`), `limit`, `offset`, `node_id`.

### Bağlantı yöntemleri
- `GET /api/v1/terminal/components/connect-methods/?os=windows|mac|linux&asset_id=<uuid>` →
  `{protocol: [{component, type:"web"|"native"|"applet"|"virtual_app", endpoint_protocol, value, label}]}`.
  Değerler: `web_cli` (koko), `ssh_client`, `ssh_guide`, `web_gui` (lion/chen), `mstsc` (razor, ücretli),
  `db_client`/`db_guide`. `os` verilmezse User-Agent'tan tahmin edilir → UA'da işletim sistemi olmalı.

### Connection token ayrıntıları
- `account` alanına hesabın **`alias`** değeri gönderilir. Sanal hesaplar: `@INPUT` (kullanıcı girer),
  `@USER` (JumpServer kullanıcı adıyla aynı), `@ANON`. `has_secret=false` ise `input_username`/`input_secret`.
- Ömür: 300 sn (`CONNECTION_TOKEN_ONETIME_EXPIRATION`); reusable ise 30 gün (ayar açıksa).
- Hatalar 400 `{"code","detail"}`: `perm_account_invalid`, `perm_expired`, `acl_reject`,
  `acl_review` (→ `?create_ticket=1`, `from_ticket_info.check_ticket_api` yoklanır), `acl_face_verify`.
- `client-url` → `{"url":"jms://<base64 JSON>"}`; JSON: `{version:2,id,value,name,protocol,site_url,org_id,
  token{id,value},file{name,content},command,asset{...},endpoint{host,port}}`.
- `rdp-file` → adres `<host>:<rdp_port>` (razor), kullanıcı `<jms_user>|<token_id>`, parola token.value (dosyada yok).
- `POST exchange/` `{"id"}` → aynı parametrelerle yeni token (yeniden bağlanma için; Luna da kullanır).

### Web bileşenleri (çerez oturumu şart; yoksa `/core/auth/login/?next=` yönlendirmesi)
- koko sayfası: `/koko/connect/?disableautohash=&token=<id>&_=<ts>`; SFTP: `/koko/elfinder/sftp/?token=<id>&asset=<asset_id>`
- lion sayfası: `/lion/connect/?token=<id>`; chen: `/chen/connect?token=<id>`
- **koko WebSocket**: `wss://host/koko/ws/terminal/?token=<id>`, subprotocol `JMS-KOKO`, JSON `{id,type,data}`.
  Sunucu `CONNECT` gönderir → istemci `TERMINAL_INIT` `{"cols","rows","code"}` → sonra `TERMINAL_DATA`,
  `TERMINAL_RESIZE`, `TERMINAL_BINARY`, `PING`/`PONG`, `CLOSE`. **v4.10.x'te yalnız çerez auth**
  (Bearer/ticket desteği yalnız v5/dev).
- **lion WebSocket**: `wss://host/lion/ws/connect/?TOKEN_ID=<id>` (Guacamole protokolü, çerez auth — `JmsCookieAuth`).
- `endpoints/smart/?protocol=ssh&asset_id=<uuid>` (veya `&token=<id>`); boş `host` = bağlanılan host.

### Diğer
- Sayfalama yalnız `?limit=` verilirse `{count,next,previous,results}`; yoksa düz dizi. Üst sınır 1000.
- Tarih biçimi `%Y/%m/%d %H:%M:%S %z`; dil `Accept-Language`; hız sınırı kullanıcı 4096/dk (429 + Retry-After).
- `sso/login-url/` admin yetkisi + `AUTH_SSO` ister (varsayılan kapalı) → normal kullanıcı için kullanılamaz.
