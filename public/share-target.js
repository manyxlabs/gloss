/* global self, caches, location, Response, URL */
// Files shared to the installed app from another app arrive as a form posted to /share, as the
// manifest's share_target asks (see vite.config.ts). They wait in a cache for the start page,
// which opens them as a project (see Library.tsx); the service worker has no other way to hand them over.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== location.origin || url.pathname !== '/share') return;
  event.respondWith(
    (async () => {
      const files = (await event.request.formData()).getAll('files').filter((f) => typeof f !== 'string');
      await caches.delete('gloss-shared');
      const cache = await caches.open('gloss-shared');
      // One at a time, as the start page opens them in the order the cache keeps them.
      for (const [i, file] of files.entries())
        await cache.put(`/shared/${i}`, new Response(file, { headers: { 'content-type': file.type, 'x-name': encodeURIComponent(file.name) } }));
      return Response.redirect('/?shared', 303);
    })(),
  );
});
