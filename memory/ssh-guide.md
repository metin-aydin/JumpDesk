---
name: ssh-guide
description: Luna'nın "SSH Guide" bağlantı yönteminin tam davranışı ve koko'nun token ile SSH girişi
metadata:
  type: reference
---

Kaynak: bir v4 kurulumunun Luna bundle'ı (`/luna/main-*.js`, Angular 19, v4.x) ve koko kaynağı
(`pkg/auth/ssh.go`, `pkg/sshd/server.go`). İlgili API: [[jumpserver-api]].

## Luna akışı (connect_method = `ssh_guide`)
1. `POST /api/v1/authentication/connection-token/` ile token alınır
   (asset, account, protocol=`ssh`, connect_method=`ssh_guide`).
2. `GET /api/v1/terminal/endpoints/smart/` → `host` ve `ssh_port` (koko SSH, varsayılan 2222).
3. Ekranda gösterilen bilgiler: Name `asset.name(asset.address)`, Host `endpoint.host`,
   Port `endpoint ssh port`, **Username `JMS-<token.id>`**, **Password `token.value`**,
   Protocol, Expire time `token.date_expired`; `CONNECTION_TOKEN_REUSABLE` açıksa "Set reusable".
4. Üretilen komutlar (port 22 değilse ` -p <port>` eklenir):
   - Token ile: `ssh JMS-<token.id>@<host> -p <port>` — parola = token.value
   - Kullanıcı ile: `ssh <jms_user>#<account.username>#<asset.id>@<host> -p <port>`
     — parola = kullanıcının kendi JumpServer parolası (+MFA)

## koko tarafı
- Token girişi: kullanıcı adı `JMS-<token_id>`, parola token değeri.
- Doğrudan giriş: `user@account@asset` (veya `#` ayırıcı) biçimi; ayrıca düz `ssh user@host -p 2222`
  → etkileşimli varlık menüsü.
- Parola sonrası MFA/onay için `keyboard-interactive` ister (`PartialSuccess`); `ssh2` npm bunu destekler.
- Aynı 2222 portunda `sftp` alt sistemi sunulur.

## Ağ kısıtı
- Yalnız 443'ün açık olduğu ağlarda 2222 kapalıdır ([[target-server]]). SSH Guide komutları yalnızca 2222'ye erişen
  ağlarda (iç ağ/VPN) çalışır. Uygulama, `endpoints/smart` portuna TCP denemesi yapıp sonuca göre
  ssh2 (2222) veya koko WebSocket (443) yolunu seçmeli.

## Uygulama için anlamı
- Varsayılan SSH ekranı = xterm.js + koko WebSocket (`wss://host/koko/ws/terminal/?token=<id>`,
  subprotocol `JMS-KOKO`, v4'te çerez auth). 2222 erişilebilirse alternatif: `ssh2` ile
  `JMS-<token.id>` / `token.value`. İki yolda da yetki, kayıt ve denetim JumpServer'da kalır.
- "SSH Guide" sekmesi = aynı bilgileri kopyalanabilir göstermek + "harici terminalde aç" butonu.
