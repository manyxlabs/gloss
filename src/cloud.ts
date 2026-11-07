// Files picked from cloud storage with the provider's own picker, then downloaded straight into
// the browser, so they never pass through Gloss's server. gdrive.ts and dropbox.ts do the picking.
import { kindOf } from './convert/formats';
import { refusal } from './convert/refusal';
import { withProgress } from './store/progress';
import type { Provider } from '../worker/links';
import { m } from './i18n';

/** Public by design: each provider lets these work only on Gloss's own origins. */
export const KEYS = {
  google: {
    clientId: '36227836543-l7q3eennig5m62adf4hpdgdhsucgbjsb.apps.googleusercontent.com',
    apiKey: 'AIzaSyD95Y-fwuqM_MlHkjEA7x5qZwRvzap11m8',
    /** The project number; with drive.file, Drive lets the token open only files picked in this app's Picker. */
    appId: '36227836543',
  },
  dropbox: { appKey: 'skaq1wxxhdu1hwy' },
};

/** A problem written for the reader. */
export class CloudError extends Error {}

/** A file picked, before it is downloaded. */
export type Picked = { name: string; type: string; get: () => Promise<Response> };

const loading = new Map<string, Promise<void>>();

/** Adds a provider's script once, trying again next time if it could not load. */
export function load(src: string, provider: Provider, attrs: Record<string, string> = {}) {
  let done = loading.get(src);
  if (!done) {
    done = new Promise<void>((ok, fail) => {
      const script = Object.assign(document.createElement('script'), { src, async: true });
      for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
      script.onload = () => ok();
      script.onerror = () => {
        script.remove();
        loading.delete(src);
        fail(new CloudError(m.homeCloud.couldNotReach(provider)));
      };
      document.head.append(script);
    });
    loading.set(src, done);
  }
  return done;
}

export const blocked = (provider: Provider) => new CloudError(m.homeCloud.blocked(provider));

function refused(provider: Provider, status: number) {
  if (status === 401) return m.homeCloud.signInExpired(provider);
  if (status === 403) return m.homeCloud.refused(provider);
  if (status === 404) return m.homeCloud.notFound(provider);
  return m.homeCloud.notNow(provider);
}

/**
 * The files picked with `choose`, downloaded one after another with their progress on show; null
 * when nothing was picked. A file that fails is named in `problems` and the others still come.
 */
export async function fromCloud(provider: Provider, choose: () => Promise<Picked[] | null>) {
  if (!navigator.onLine) throw new CloudError(m.homeCloud.offline(provider));
  const picked = await choose();
  if (!picked?.length) return null;
  const problems: string[] = [];
  const wanted = picked.filter((p) => kindOf(p) || void problems.push(refusal(p.name)));
  const files: File[] = [];
  if (wanted.length)
    await withProgress(m.homeCloud.downloading(provider), async (step) => {
      step(0, wanted.length);
      for (const [i, p] of wanted.entries()) {
        try {
          const res = await p.get().catch(() => {
            throw new CloudError(m.homeCloud.connectionLost(provider));
          });
          if (!res.ok) throw new CloudError(refused(provider, res.status));
          files.push(new File([await res.blob()], p.name, { type: p.type }));
        } catch (err) {
          problems.push(m.homeCloud.notAdded(p.name, err instanceof CloudError ? err.message : m.homeCloud.couldNotDownload(provider)));
        }
        step(i + 1, wanted.length);
      }
    });
  return { files, problems };
}
