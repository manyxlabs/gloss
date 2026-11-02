// Serves the app, and the few things a browser cannot do alone: relaying encrypted sync
// between devices (sync.ts) and fetching a web page to read (page.ts).
import { handleSync, Room } from './sync';
import { handlePage } from './page';

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<Room>;
  FILES: R2Bucket;
}

export { Room };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/sync/')) return handleSync(request, env);
    if (pathname === '/api/page') return handlePage(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
