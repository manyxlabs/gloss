import type { Problem } from '../../worker/problem';
import { shareLink } from '../../worker/links';
import { m } from '../i18n';
import { ReaderError } from '../pdf/pdfjs';

/** Addresses that name a file Gloss opens, fetched as the file rather than read as an article. */
const FILE_PATH = /\.(pdf|docx|pptx|png|jpe?g|gif|webp|heic|heif|avif|bmp|txt|md|markdown)$/i;

export function isFileLink(url: string) {
  try {
    return !!shareLink(url) || FILE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Downloads the file a link leads to, through Gloss's server, as a browser may not read other
 * sites. A cloud storage picker, given the app keys it needs, would hand over a File the same way.
 */
export async function fetchLinked(url: string, signal?: AbortSignal): Promise<File> {
  const res = await fetch(`/api/file?url=${encodeURIComponent(url)}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: Problem } | null;
    throw new ReaderError(body?.error ? told(body.error) : m.engineConvert.noFileServer);
  }
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? '');
  const provider = shareLink(url)?.provider;
  // The Worker sends only the extension for a provider's file without a name.
  const named = provider && /^\.\w+$/.test(name) ? m.engineConvert.fromProvider(provider) + name : name || m.engineConvert.linkedFile;
  return new File([await res.blob()], named, { type: res.headers.get('content-type') ?? '' });
}

/** Why Gloss's server refused, in the reader's language. */
export function told(problem: Problem) {
  const s = m.engineServer;
  switch (problem.code) {
    case 'upstream':
      return s.upstream(problem.status);
    case 'fileTooLarge':
      return s.fileTooLarge(problem.mb);
    case 'folder':
    case 'privateLink':
      return s[problem.code](problem.provider);
    default:
      return s[problem.code];
  }
}
