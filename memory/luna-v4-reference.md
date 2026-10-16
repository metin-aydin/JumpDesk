---
name: luna-v4-reference
description: Luna v4.10.19 kaynağından doğrulanan istemci davranışları — arama API'si, CSRF/org header, token oluşturma gövdesi
metadata:
  type: reference
---

Kaynak: `git clone --depth 1 --branch v4.10.19 https://github.com/jumpserver/luna` → `src/app/services/http.ts`,
`src/app/utils/common.ts`. GPL → kod kopyalanmaz, davranış referansı. İlgili: [[jumpserver-api]].

## Ağaç ve arama
- Ağaç (lazy): `GET /api/v1/perms/users/self/nodes/children-with-assets/tree/` (+ `?key=` / `?id=`).
- Ağaç (tam): `GET /api/v1/perms/users/self/nodes/all-with-assets/tree/` (büyükse `X-JMS-TREE-OFFSET`).
- **Arama (ayrı API):** `GET /api/v1/perms/users/self/assets/tree/?search=<kelime>` → varlık ağaç düğümleri
  (Luna bunları `meta.data.org_name`'e göre gruplayıp "Search (N)" düğümü altında gösterir).
- Tekil: `GET /api/v1/perms/users/self/assets/tree/?id=<asset_id>`.
- Tür ağacı: `GET .../nodes/children-with-assets/category/tree/?sync=0|1`.
- Profil: `GET /api/v1/users/profile/` + `GET /api/v1/users/profile/permissions/` (Luna ikisini birleştirir).
- Kullanıcı oturumu: `GET|DELETE /api/v1/authentication/user-session/`.

## İstek kuralları
- Her GET'te `X-JMS-ORG` header'ı (`X-JMS-LUNA-ORG` ya da `X-JMS-ORG` çerezinden).
- POST/PUT/PATCH/DELETE'te `X-CSRFToken` = `<SESSION_COOKIE_NAME_PREFIX>csrftoken` çerezi (bizde `jms_csrftoken`).
- 401 → "oturum süresi doldu" diyaloğu; 403 → "yetki yok".
- Hata yeniden deneme: ağaç isteği 10 kez, 10 sn arayla.

## Token oluşturma gövdesi
`POST /api/v1/authentication/connection-token/` (`?create_ticket=1`, `?face_verify=1` opsiyonel):
`{asset, account: <account.alias>, protocol: <protocol.name>, input_username, input_secret: encryptPassword(secret),
input_secret_type: "password", connect_method: <value>, connect_options: {...}}`.
Sanal hesapta (`username` `@` ile başlar) kullanıcı adı/parola formdan gelir; `input_secret` jms_public_key ile şifrelenir.

## Diğer
- Favori klasörleri: `/api/v1/assets/favorite-folders/`, favoriler `?folder=`.
- Çevrimiçi oturum bilgisi: `/api/v1/terminal/sessions/online-info/?asset_id=&account=`.
- Kullanıcı tercihleri: `/api/v1/users/preference/?category=luna`.
