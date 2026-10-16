---
name: user-preferences
description: Kullanıcının çalışma tercihleri ve proje ortamı
metadata:
  type: user
---

- Dil: Türkçe konuşur, yanıtlar Türkçe.
- Git worktree kullanılmaz; değişiklikler doğrudan ana çalışma kopyasında yapılır.
- Kod yorumları değişim geçmişi anlatmaz, yalnızca kodun ne yaptığını anlatır.
- Yanıt biçimi: ADHD modu — ilk satır yapılacak iş, numaralı adımlar, en fazla 5 maddelik
  listeler, somut süre tahmini, sonda tek bir sonraki adım.
- Platform: Linux (zsh, GNOME, X11/XWayland).
- Proje public: kurum, sunucu ve kişi bilgisi kod, test ve dokümanlara yazılmaz (genel örnekler kullanılır).
- PR açıklamalarına ve sürüm notlarına asla "Generated with Claude Code" satırı yazılmaz (2026-10-16). CLAUDE.md'de kural.
- `main`'e doğrudan push yok, yalnız PR. Geliştirme `main`'den açılan `development` dalında; `main`'e birleşince dal
  silinir, sonraki turda yeniden açılır (2026-10-16). CLAUDE.md'de kural.
- İlk tercih edilen teknoloji: Electron (tartışmaya açık). [[architecture-decisions]]
- Arayüz metinleri: "Yeni Bağlantı", tüm sağ tık/açılır menü öğeleri ve **tüm araç ipuçları (tooltip, `title`)**
  her kelimenin baş harfi büyük (ör. "Yan Yana Yerleştir", "Adresi Kopyala", "Bölünmüş Görünümde"). CLAUDE.md'de
  kural. (2026-10-15)
- Sunucu arama kısayolu **Ctrl+Shift+F** (macOS ⌘F). (2026-10-15)
- Her yanıttan sonra o turda yapılan/öğrenilen her şey kendiliğinden `memory/*.md` ve proje md dosyalarına
  yazılır; kullanıcının ayrıca istemesi beklenmez (CLAUDE.md kuralı, 2026-10-15).
- Menülerde simgesiz öğeler simgeli öğelerin metniyle hizalı durur (simge kadar sol boşluk). (2026-10-15)
- Kısayol düzeni: Ctrl+Shift+<harf> (T yeni, W kapat, B sağ panel, E sol ağaç, F sunucu ara, A sekme ara,
  S terminalde ara, P komut paleti, K kısayollar, Enter panel büyüt). Terminal araması Ctrl+F (kullanıcı isteği);
  less/vim içindeyken Ctrl+F programa gider.
- Ayarlar kısayolu **Ctrl+,** (macOS ⌘,); ayarlar penceresi Claude masaüstü gibi solda grup sekmeleri, sağda içerik.
  Yazı boyutları üç ayrı ayar: yazılım geneli, sunucu ağacı, terminal. (2026-10-15)
- Sekme ayırma Chrome gibi: dışarı sürükle → yeni pencere, geri sürükle → sekmelere dön. (2026-10-15)
- Ayarlar, snippetler, kurallar vb. **kullanıcıya özel** saklanır; aynı bilgisayarda başka JumpServer kullanıcısı
  görmez. Uygulamada yerleşik (statik) snippet olmaz; snippetler düzenleyiciden ya da `.jumpdesk` dosyasından gelir.
- Dışa aktarım dosyası: JumpDesk'a özel uzantı (`.jumpdesk`), şifreli, içe aktarırken doğrulanır; ad
  `<kullanıcı adı (özel karakterler _)>_<YYYYMMDDHHmmss>.jumpdesk`. İçe aktarımda seçim yapılır ve seçilen bölümlerin
  eski kayıtlarının silineceği belirtilir. (2026-10-16)
- Her girişte önce JumpServer adresi sorulur; ekranın üstünde JumpDesk ve JumpServer logoları (rıhtım simgesi gibi
  kabarık/parlak) ve aralarında ⇄. Logo karosu Claude turuncusu. Başlık çubuğunun sol üstünde uygulama simgesi
  olmaz. (2026-10-16)
- Arayüz İngilizce (varsayılan) ve Türkçe; dil ayarı Ayarlar → Dil. Yeni ekran/metin eklenince iki dil de eksiksiz
  olmalı ("eksik bırakma"). (2026-10-16)
- Yapay zeka: sağlayıcı ve anahtar ayarları dışa aktarılmaz; yapay zekaya sunucudan hiçbir veri gönderilmez (yalnız
  sunucu türü); öneriler komut olarak seçilir, kullanıcı çalıştırır. (2026-10-16)
- Terminalde altta boşluk istemez; geçmişte yukarıdayken "En Alta Kaydır" bandı (iki satır, tema renginden şeffafa).
  (2026-10-16)
