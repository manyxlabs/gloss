// Serves the app, and the few things a browser cannot do alone: relaying encrypted sync
// between devices (sync.ts), fetching a web page to read (page.ts), and fetching a file from
// a link, such as a cloud storage share link (file.ts).
import { handleFile } from './file';
import { handleSync, Room } from './sync';
import { handlePage } from './page';

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<Room>;
  /** "1" lets /api/page and /api/file fetch private hosts such as localhost; only the local tests set it. */
  ALLOW_PRIVATE_HOSTS?: string;
  /** A local server that stands in for the cloud storage providers; only the local tests set it. */
  TEST_PROVIDER_ORIGIN?: string;
}

export { Room };

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/sync/')) return handleSync(request, env);
    if (pathname === '/api/page') return handlePage(request, env);
    if (pathname === '/api/file') return handleFile(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
