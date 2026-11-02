/** Saves a file the app made, under the given name. */
export function download(fileName: string, data: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'download';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
