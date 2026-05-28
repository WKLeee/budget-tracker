// 웹 푸시 수신 + 알림 클릭 처리
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: '가계부', body: event.data ? event.data.text() : '' }
  }

  // 빈 제목('')은 그대로 사용 (iOS에서 'from 가계부' 한 줄만 위에 뜨도록)
  const title = data.title ?? '가계부'
  const options = {
    body: data.body || '',
    data: { url: data.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
