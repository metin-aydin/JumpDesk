---
name: desktop-design
description: Termius benzeri tasarım ve "gerçek masaüstü uygulaması" hissi için uygulanacak kurallar
metadata:
  type: project
---

Kullanıcı isteği (2026-10-14): Termius'a benzer tasarım; web sitesi hissi olmasın, gerçek masaüstü uygulaması
hissi versin. Bağlam: [[architecture-decisions]], [[ui-stack-research]].

## Termius'tan alınacak görsel dil
- Koyu varsayılan tema (lacivert-gri zemin), açık tema da var; tek vurgu rengi.
- Sekmeler pencerenin başlık çubuğunun içinde (ayrı başlık çubuğu yok); ilk sekme "Sunucular" ana ekranı.
- Solda dar gezinme + grup/klasör ağacı; sunucular renkli OS rozetli (Linux/Windows) satırlar.
- Üstte "Sunucu ara veya bağlan" arama çubuğu; Ctrl/Cmd+K komut paleti.
- Yumuşak köşeler, ince ayırıcılar, düşük kontrastlı ikincil metin, 13 px taban yazı.

## Masaüstü hissi kuralları
1. Çerçevesiz pencere: macOS `titleBarStyle: 'hiddenInset'` (trafik ışıkları), Windows/Linux `titleBarStyle: 'hidden'`
   + `titleBarOverlay` (yerel pencere düğmeleri); sürükleme alanı `-webkit-app-region: drag`.
2. Sistem yazı tipi (`-apple-system`, `Segoe UI Variable`, `Ubuntu/Cantarell`); web fontu yok.
3. Arayüzde metin seçimi kapalı (`user-select: none`; terminal ve form alanları hariç), imleç `default`
   (el imleci yok), link alt çizgisi yok, sayfa kaydırma yok — sabit paneller, ince kaydırma çubukları.
4. Görsel/link sürükleme kapalı, Ctrl+tekerlek ve pinch yakınlaştırma kapalı (`setVisualZoomLevelLimits(1,1)`),
   odak halkası yalnız klavyede (`:focus-visible`).
5. Açılışta beyaz flaş yok: `show: false` + `ready-to-show`, `backgroundColor` tema rengiyle; pencere konumu/boyutu hatırlanır.
6. Yerel parçalar: uygulama menüsü (macOS), yerel bildirimler, onaylar için `dialog.showMessageBox`,
   tek örnek kilidi, OS koyu/açık temasını izleme (`nativeTheme`), isteğe bağlı vurgu rengi (`systemPreferences.getAccentColor`).
7. macOS `vibrancy: 'sidebar'`, Windows 11 `backgroundMaterial: 'mica'` (yan panelde yarı saydamlık).
8. Klavye: Ctrl/Cmd+T yeni bağlantı, +W sekme kapat, +1..9 sekmeye git, +K palet, +Shift+D böl.
9. Etkileşimler anlık: sayfa geçişi yok, animasyonlar ≤150 ms, iyimser arayüz.
