// Web Push (section 10), imported into the generated service worker (vite.config.ts).
// The worker sends {title, body, url, tag} as JSON (supabase/functions/_shared/push.ts).
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mjolnir', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Tapping a notification focuses an open window on its page, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        await w.focus();
        return w.navigate(url);
      }
      return self.clients.openWindow(url);
    }),
  );
});
