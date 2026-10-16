import { jmsSession, serverOrigin, serverUrl } from './config'

/**
 * Uygulama arayüzü JumpServer'dan farklı bir origin'de çalıştığı için tarayıcı, SameSite=Lax oturum çerezini
 * koko/lion WebSocket el sıkışmasına eklemez. Bu kanca, ana pencereden giden isteklere çerezleri ve sunucunun
 * kendi Origin'ini ekler; koko/lion ve Django CSRF denetimi aynı host'tan gelen isteği kabul eder.
 */
export function installRequestHooks(isAppWebContents: (id: number | undefined) => boolean): void {
  const ses = jmsSession()

  ses.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      let target: URL
      try {
        target = new URL(details.url)
      } catch {
        callback({})
        return
      }
      const server = serverUrl()
      if (!server || target.host !== new URL(server).host) {
        callback({})
        return
      }
      const headers = { ...details.requestHeaders }
      headers['Accept-Language'] = 'en-US,en;q=0.9'

      if (!isAppWebContents(details.webContentsId)) {
        callback({ requestHeaders: headers })
        return
      }

      ses.cookies
        .get({ url: serverUrl() })
        .then((cookies) => {
          if (cookies.length)
            headers['Cookie'] = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          headers['Origin'] = serverOrigin()
          callback({ requestHeaders: headers })
        })
        .catch(() => callback({ requestHeaders: headers }))
    }
  )
}
