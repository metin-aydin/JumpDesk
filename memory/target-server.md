---
name: target-server
description: JumpServer v4.10.x Community kurulumunun anonim uç noktalardan doğrulanan davranışları
metadata:
  type: project
---

Kaynak: 2026-10-14 tarihinde bir v4.10 Community kurulumunda kimlik doğrulamasız GET istekleriyle doğrulandı. Sunucu
adresi uygulamaya gömülü değildir; giriş ekranında girilir.

- Luna: `/luna/` (Angular 19), ön yüzde `nginx`.
- **Sürüm ayırt etme (v4.10.14+ / v5):** OAuth2 provider var (v4.10.14+ özelliği),
  `/api/v1/settings/client/compatibility/` 404 (v5'te var), lion ayrı yolda (`/lion/connect`),
  `/api/v1/settings/client/versions/` → `["4.0.0","4.1.0","4.1.1","4.1.2"]`.
- **Yalnız 443'ün açık olduğu ağlar:** 2222 (koko SSH), 3389 (razor), 22 ve veritabanı portları kapalı olabilir →
  SSH Guide komutları çalışmaz; uygulama içi SSH koko WebSocket (443) üzerinden yapılır.
- OAuth2 keşif: `GET /core/auth/oauth2-provider/.well-known/oauth-authorization-server` (anonim) →
  public client `client_id` (resmî "JumpServer Client"), PKCE S256, `token_expires_in` 3600,
  `refresh_token_expires_in` 604800. `issuer` alanı vekil sunucu `X-Forwarded-Proto` vermezse `http://` dönebilir.
  v4.10.x'te redirect URI `jms://auth/callback` olmalı (resmî istemcinin şeması).
- **Community sürüm**: `GET /api/v1/settings/public/open/` → `XPACK_ENABLED: false`
  (X-Pack/Enterprise özellikleri yok: Razor RDP proxy, bazı SSO'lar, arayüz özelleştirme vb. — ayrıntı için
  [[jumpserver-architecture]]).
- `GET /api/v1/settings/public/` → 401 (oturum ister). Açık olan: `/api/v1/settings/public/open/`.
- `GET /api/health/` → 200 (`status`, `db_status`, `redis_status`, `time`). Sunucu erişilebilirlik testi için uygun
  (adres ekranı bunu kullanır).
- Swagger: `/api/swagger.json` → 401 (var ama oturum ister); `/api/docs/` → login'e 302. Tarayıcıda giriş yapmışken
  indirilebilir; projedeki `swagger.json` v4.10 şemasıdır (sunucu adresi `jumpserver.example.com`).
- Login sayfası (`/core/auth/login/`):
  - Alanlar: `csrfmiddlewaretoken`, `username`, `password` (gizli alan), `auto_login`.
  - Parola istemcide RSA ile şifrelenir (jsencrypt); açık anahtar `jms_public_key` çerezinde (base64 PEM).
  - Captcha kapalı olabilir (`no-captcha-challenge`). SSO butonu yoksa yalnızca yerel/LDAP kullanıcı-parola.
  - MFA kullanıcı bazında açık olabilir (sayfada `.mfa-div` stili var).
- Çerezler: `jms_csrftoken`, `jms_sessionid` (HttpOnly, Max-Age 86400 = 24 saat), `jms_public_key`,
  `SESSION_COOKIE_NAME_PREFIX=jms_`.
