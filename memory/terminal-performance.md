---
name: terminal-performance
description: Electron'da hızlı terminal çizimi — xterm.js WebGL havuzu, binary veri yolu, backpressure, React kuralları ve uygulama kontrol listesi
metadata:
  type: reference
---

Araştırma: 2026-10-14 (npm, xterm.js PR/issue'ları, Chromium 152 kaynağı, VS Code/Tabby/Wave kodu).
Protokol tarafı: [[ssh-koko-protocol]]. Karar durumu: [[architecture-decisions]].

## Sonuç
xterm.js 6.x + WebGL addon (yalnız görünür panellerde). Asıl kazanç renderer'dan değil veri yolundan gelir:
binary çerçeveler + gerçek backpressure. Alternatifler (ghostty-web, restty, celeritty, wterm, beamterm)
üretimde xterm.js+WebGL'i geçmiyor. WebGPU addon (#6137) henüz yayımlanmadı → izlenecek.

## Gerçekler
- Sürümler: `@xterm/xterm` 6.0.0 (latest), 6.1.0-beta.3xx; `@xterm/addon-webgl` 0.19.0 / 0.20.0-beta.3xx.
  VS Code 6.1.0-beta.304 + webgl 0.20.0-beta.300 kullanıyor.
- 6.0'da canvas renderer kaldırıldı → seçenek DOM ya da WebGL2. WebGL, canvas'tan 4–9 kat hızlıydı; DOM çok daha yavaş.
- `cat bigfile` sınırı parser'dır (~5–35 MB/sn); çizim kare başına en çok bir kez.
- Chromium 152: renderer ana iş parçacığı başına **16 aktif WebGL bağlamı**; aşılınca en eskisi sessizce düşer.
  `--max-active-webgl-contexts` sınırı yükseltir ama GPU belleği harcar; havuz daha iyi.
- Bağlam kaybı: xterm 3 sn bekler, `onContextLoss` → addon dispose → DOM'a düş.
- addon-webgl ≤0.19 dispose'da cursor-blink interval sızıntısı (0.20-beta.224'te düzeltildi;
  Tabby geçici çözümü: önce `_renderer._cursorBlinkStateManager` dispose).
- Ekran dışı terminal çizimi IntersectionObserver ile durur; parse sürer.
- xterm yazma tamponu 50 MB üstünü atar (`DISCARD_WATERMARK`).
- `WebSocket` duraklatılamaz; `WebSocketStream` (Chromium 124+) okumayı bırakınca backpressure uygular.
  koko tarafı 10 slotluk kanal + 5 dk yazma zaman aşımıyla bloklar → yavaş okuyucu uzak süreci yavaşlatır.
- Hücre başına 12 bayt: 200 sütun × 10.000 satır ≈ 24 MB/terminal.
- 6.0'da `fastScrollModifier` kaldırıldı → `fastScrollSensitivity`. DEC 2026 (senkron çıktı) destekli.

## Uygulama kontrol listesi
1. `@xterm/xterm` + `addon-webgl`, `addon-fit`, `addon-unicode11` (`allowProposedApi: true`), `addon-search`,
   `addon-web-links`; sürümler sabitlenir (VS Code'un beta'ları ya da 6.0.0 + Tabby geçici çözümü).
2. `binaryType='arraybuffer'`, `term.write(new Uint8Array(buf))`; JSON/TextDecoder/base64 yok. Tuşlar anında gönderilir.
3. `WebSocketStream` ile okuma: her ~100 KB'ta write callback; bekleyen >8 ise dur, <3 olunca devam;
   duraklama asla 5 dk'yı aşmaz. Test: `yes` + Ctrl-C, 200 MB `cat`.
4. WebGL bağlam havuzu: üst sınır ~12, LRU tahliye; panel görünür olunca addon yükle, gizlenince dispose.
5. Bağlam kaybında dispose → DOM; görünürken en çok 3 yeniden deneme; WebGL hiç açılmazsa oturum boyunca DOM.
6. Pasif sekme `display:none`, unmount yok (dockview `renderer: 'always'`); Terminal nesnesi ref'te,
   veri React state'inden geçmez.
7. Fit: ResizeObserver → tek animation frame + 50 ms throttle; gizli panelde fit yok;
   `TERMINAL_RESIZE` yalnız cols/rows değişince.
8. `scrollback` 5000 (ayarlanabilir), `smoothScrollDuration` 0, `customGlyphs` true.
9. `backgroundThrottling` kararı; `--ignore-gpu-blocklist` ve `--force_high_performance_gpu` yalnız kullanıcı seçeneği.
10. Çok pencerede her pencere ayrı renderer → her biri ayrı 16 bağlam bütçesi.
11. İzlenecek: xterm.js #6137 (addon-webgpu, bağlam sınırını kaldırır), #4379 (paylaşılan bağlam).
