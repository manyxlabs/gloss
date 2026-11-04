// Dropbox: its Chooser hands over a direct link to each file picked, which the browser downloads.
// Gloss gets no token and no other access to the reader's Dropbox.
import { blocked, CloudError, KEYS, load, type Picked } from './cloud';
import { ACCEPT } from './convert/formats';

type Chosen = { name: string; link: string };
declare const Dropbox: {
  isBrowserSupported: () => boolean;
  choose: (options: { success: (files: Chosen[]) => void; cancel: () => void; linkType: 'direct'; multiselect: boolean; extensions: string[] }) => void;
};

const PROVIDER = 'Dropbox';
/** The Chooser names images as a group, and other formats by their extensions. */
const EXTENSIONS = ACCEPT.split(',').flatMap((a) => (a === 'image/*' ? ['images'] : a.startsWith('.') ? [a] : []));

export async function chooseFromDropbox(): Promise<Picked[] | null> {
  await load('https://www.dropbox.com/static/api/2/dropins.js', PROVIDER, { id: 'dropboxjs', 'data-app-key': KEYS.dropbox.appKey });
  // Otherwise the Chooser only shows an alert and never answers.
  if (!Dropbox.isBrowserSupported()) throw new CloudError('This browser cannot open the Dropbox Chooser. Try another browser.');
  const files = await new Promise<Chosen[] | null>((ok, fail) => {
    try {
      Dropbox.choose({ success: ok, cancel: () => ok(null), linkType: 'direct', multiselect: true, extensions: EXTENSIONS });
    } catch {
      // It throws when its window could not open.
      fail(blocked(PROVIDER));
    }
  });
  return files?.map(({ name, link }) => ({ name, type: '', get: () => fetch(link) })) ?? null;
}
