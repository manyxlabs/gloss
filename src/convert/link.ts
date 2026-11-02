import { shareLink } from '../../worker/links';

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
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Files can be added from links only where Gloss runs with its server.');
  }
  return new File([await res.blob()], decodeURIComponent(res.headers.get('x-file-name') ?? 'Linked file'), { type: res.headers.get('content-type') ?? '' });
}
