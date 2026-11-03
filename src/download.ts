import { create } from 'zustand';

const safeName = (fileName: string) => fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'download';

/** Saves a file the app made, under the given name. */
export function download(fileName: string, data: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = safeName(fileName);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * A file made to send that took longer to make than a tap lets the share sheet open for, as on
 * iPhones and iPads; a tap on its notice sends it.
 */
export const useUnsent = create<{ file: File | null }>(() => ({ file: null }));

/** Hands a file the app made to another app through the system's share sheet, or saves it where the browser cannot share files. */
export async function send(fileName: string, data: Blob) {
  const file = new File([data], safeName(fileName), { type: data.type });
  if (!navigator.canShare?.({ files: [file] })) return download(fileName, data);
  try {
    await navigator.share({ files: [file] });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'NotAllowedError') useUnsent.setState({ file });
    else if (name !== 'AbortError') throw err;
  }
}
