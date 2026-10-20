import { app } from 'electron'

/**
 * Uygulama gerçekten kapanıyor mu: kapanmıyorsa ana pencereyi kapatmak pencereyi gizler, uygulama tepside sürer.
 * `app.quit()` (Çıkış, macOS ⌘Q, güncelleme kurulumu) bu durumu `before-quit` ile kendiliğinden işaretler; pencereleri
 * `app.quit()`'ten önce kapatan yollar (macOS'ta Squirrel güncellemesi) önce `markQuitting()` çağırır.
 */
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

app.on('before-quit', markQuitting)
