// Google Drive: Google's sign in gives a token for the drive.file scope, which reaches only the
// files the reader picks in Google's Picker, and Drive's API downloads them.
import { blocked, CloudError, KEYS, load, type Picked } from './cloud';

type Token = { access_token: string; expires_in: number; error?: string };
type PickerDoc = { id: string; name: string; mimeType: string };
type Chosen = { action: string; docs?: PickerDoc[] };
type DocsView = { setIncludeFolders: (on: boolean) => DocsView; setMimeTypes: (types: string) => DocsView };
type Builder = {
  addView: (view: DocsView) => Builder;
  enableFeature: (feature: string) => Builder;
  setOAuthToken: (token: string) => Builder;
  setDeveloperKey: (key: string) => Builder;
  setAppId: (id: string) => Builder;
  setCallback: (then: (data: Chosen) => void) => Builder;
  build: () => { setVisible: (on: boolean) => void };
};
declare const google: {
  accounts: {
    oauth2: {
      initTokenClient: (config: { client_id: string; scope: string; callback: (t: Token) => void; error_callback: (e: { type: string }) => void }) => {
        requestAccessToken: () => void;
      };
      hasGrantedAllScopes: (t: Token, scope: string) => boolean;
    };
  };
  picker: {
    PickerBuilder: new () => Builder;
    DocsView: new (id: string) => DocsView;
    ViewId: { DOCS: string };
    Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
    Action: { PICKED: string; CANCEL: string };
  };
};
declare const gapi: { load: (lib: string, then: { callback: () => void; onerror: () => void }) => void };

const PROVIDER = 'Google Drive';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const APPS = 'application/vnd.google-apps.';
/** Google's own documents, which have no file of their own and are exported as PDFs. */
const EXPORTED = ['document', 'presentation', 'spreadsheet', 'drawing'].map((k) => APPS + k);
/** What the Picker lists: the formats convert/formats.ts opens, as Drive names their types. */
const LISTED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  ...['jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp'].map((t) => `image/${t}`),
  ...EXPORTED,
].join(',');

// Kept in memory only, so a second pick in this visit needs no sign in window.
let token: { value: string; until: number } | null = null;

async function signIn(): Promise<string | null> {
  // A minute's margin, as the Picker can stay open a while before the downloads start.
  if (token && token.until > Date.now() + 60_000) return token.value;
  await Promise.all([load('https://accounts.google.com/gsi/client', PROVIDER), load('https://apis.google.com/js/api.js', PROVIDER)]);
  return new Promise((ok, fail) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: KEYS.google.clientId,
        scope: SCOPE,
        callback: (t) => {
          if (t.error === 'access_denied') return ok(null);
          // Google's consent screen lets the reader untick the one permission Gloss asks for.
          if (t.error || !google.accounts.oauth2.hasGrantedAllScopes(t, SCOPE))
            return fail(new CloudError('Gloss needs permission to open the files you pick in Google Drive. Add from Google Drive again and allow it.'));
          token = { value: t.access_token, until: Date.now() + t.expires_in * 1000 };
          ok(token.value);
        },
        error_callback: (e) => (e.type === 'popup_failed_to_open' ? fail(blocked(PROVIDER)) : ok(null)),
      })
      .requestAccessToken();
  });
}

const pick = (oauth: string) =>
  new Promise<PickerDoc[] | null>((ok, fail) =>
    gapi.load('picker', {
      onerror: () => fail(new CloudError('Gloss could not reach Google Drive. Check the connection and try again.')),
      callback: () => {
        const { picker } = google;
        new picker.PickerBuilder()
          .addView(new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setMimeTypes(LISTED))
          .enableFeature(picker.Feature.MULTISELECT_ENABLED)
          .enableFeature(picker.Feature.SUPPORT_DRIVES)
          .setOAuthToken(oauth)
          .setDeveloperKey(KEYS.google.apiKey)
          .setAppId(KEYS.google.appId)
          .setCallback((data) => {
            if (data.action === picker.Action.PICKED) ok(data.docs ?? []);
            else if (data.action === picker.Action.CANCEL) ok(null);
          })
          .build()
          .setVisible(true);
      },
    }),
  );

export async function chooseFromDrive(): Promise<Picked[] | null> {
  const oauth = await signIn();
  const docs = oauth && (await pick(oauth));
  if (!docs) return null;
  return docs.map(({ id, name, mimeType }) => {
    const exported = EXPORTED.includes(mimeType);
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}${exported ? '/export?mimeType=application/pdf' : '?alt=media&supportsAllDrives=true'}`;
    return {
      name: exported ? `${name}.pdf` : name,
      type: exported ? 'application/pdf' : mimeType,
      get: async () => {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${oauth}` } });
        // Revoked or run out: the next pick signs in afresh.
        if (res.status === 401) token = null;
        return res;
      },
    };
  });
}
