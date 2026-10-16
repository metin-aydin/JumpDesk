# koko web SFTP protokolü (v4.10.14 kaynağından doğrulandı, 2026-10-15)

Kaynak: koko `pkg/httpd/websftp.go`, `sftpwebvolume.go`, `userwebsocket.go`, `pkg/srvconn/sftp_asset.go`;
istemci örneği koko `ui/src/hooks/useFileManage.ts`; Luna `koko.component.ts#createFileConnectToken`.

## Bağlantı
- `wss://<host>/koko/ws/sftp/?token=<token.id>`, alt protokol `JMS-KOKO`, çerez + Origin (terminal ile aynı).
- Token: Luna terminal içindeki dosya yöneticisi için terminal token'ını `connection-token/exchange/` ile çoğaltır
  (protokol ssh, `web_cli` kalır). Ağaçtan doğrudan açışta `protocol: sftp`, `connect_method: web_sftp` (varlıkta
  sftp protokolü yoksa ssh + web_cli). Token tek kullanımlık; yeniden bağlanmada yine `exchange`.
- Sunucu önce `CONNECT` gönderir; doğrulama hatasında `ERROR` (`err`) gönderip kapatır. Sunucu boşta `PING` yollar
  → `PONG` yanıtlanır. `CLOSE` = oturum süresi doldu. İlk komuttan sonra token "canlı oturumlar" içinde değilse
  `CLOSE` + "Session expired or not found".

## Mesaj biçimi (hepsi JSON metin; binary çerçeve yok)
- İstek: `{id, type:'SFTP_DATA', cmd, data: JSON.stringify({path,new_name,chunk,merge,offset,size,is_dir}), raw}`.
  `raw` = base64 (Go `[]byte`). Go JSON alan adları büyük/küçük harf duyarsız (`offSet` da olur).
- Yanıt: `{id, type:'SFTP_DATA', cmd, data, err, current_path}`. Hata `err` alanında ("Permission denied",
  rm'de "permission denied").
- **Aynı anda tek istek:** koko gelen mesajı paylaşılan `h.msg` alanına yazıp goroutine'de okur; eşzamanlı istekler
  birbirine karışır. İstemci istekleri sıraya koymalı (bizde `SftpClient.request` zinciri).

## Komutlar
- `list {path}` → `data` = JSON dizi `{name, size:"<bayt>", perm:"drwxr-xr-x", mod_time:"<unix sn>", type, is_dir}`.
  `path: ''` → kök. Okuma hatası yutulur: boş dizi döner. Gizli dosyalar (`.` ile başlayan) terminal ayarındaki
  ShowHidden kapalıysa listelenmez. Sembolik bağlar hedefleriyle döner.
- `mkdir {path}` (MkdirAll), `rename {path, new_name}` (yalnız ad; aynı klasör), `rm {path}` (klasörse
  RemoveDirectory) → `data: 'ok'`. Silme `actions` içinde delete ister.
- `download {path, is_dir}` → 2 MB'lık `SFTP_BINARY` mesajları (`raw` base64), sonra `SFTP_DATA data=<dosya adı>`.
  Klasör → sunucuda zip (`<ad>-<zaman>.zip`). İptal komutu yok. Yetki: download.
- `upload`: `id` sayısal metin olmalı (`strconv.Atoi`), parçalar aynı id ile. Tek parça:
  `{path, size, chunk:false}` → 'ok'. Çok parça: her parça `{path, size, offset, chunk:true}` → `data=path`, sonra
  `{path, merge:true}` → 'ok'. Parça: 5 MB, en çok 100 parça, en büyük 10 MB (koko UI ile aynı). Yetki: upload.

## Yol kuralı (web terminal modunda)
- Platformun SFTP kök dizini (`sftp_home`; `home`/`~`/boş = kullanıcının ev dizini, `${ACCOUNT}`/`${USER}`/`${HOME}`
  değişkenleri) bir kafestir: `path` kökle başlıyorsa olduğu gibi, değilse köke eklenir (`/var/log` → `/tmp/var/log`).
  `current_path` gerçek yoldur. Kök `/` ise her yol erişilebilir.
- Sonuç: kök dışındaki bir yol istenirse koko onu köke ekler (yanlış klasör). İstemci kök dışı yolları kökle
  değiştirir; açılış klasörü `/tmp` kök dışındaysa kökten başlanır.
