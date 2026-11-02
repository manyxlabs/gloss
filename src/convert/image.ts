/** Image bytes pdf-lib can embed as they are. */
export type Embeddable = { bytes: Uint8Array; type: 'png' | 'jpg' };

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const isHeic = (b: Uint8Array) => starts(b, [0x66, 0x74, 0x79, 0x70], 4) && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(String.fromCharCode(...b.slice(8, 12)));

/** The EXIF orientation of a JPEG, 1 when it has none. */
function orientation(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let at = 2; at + 4 < b.length && b[at] === 0xff; at += 2 + v.getUint16(at + 2)) {
    if (b[at + 1] !== 0xe1 || !starts(b, [0x45, 0x78, 0x69, 0x66, 0, 0], at + 4)) continue;
    const tiff = at + 10;
    const le = b[tiff] === 0x49;
    const ifd = tiff + v.getUint32(tiff + 4, le);
    for (let i = 0, n = v.getUint16(ifd, le); i < n; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 10 > b.length) break;
      if (v.getUint16(entry, le) === 0x0112) return v.getUint16(entry + 8, le);
    }
  }
  return 1;
}

/** Redraws an image the browser can decode (WebP, GIF's first frame, a rotated photo) as PNG or JPEG. */
async function redraw(blob: Blob, type: 'png' | 'jpg'): Promise<Embeddable> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const out = await canvas.convertToBlob(type === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 });
  return { bytes: new Uint8Array(await out.arrayBuffer()), type };
}

export async function embeddable(blob: Blob): Promise<Embeddable> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47])) return { bytes, type: 'png' };
  // A photo's pixels are stored as the camera held it, and the EXIF tag says how to turn them; a PDF has no such tag.
  if (starts(bytes, [0xff, 0xd8, 0xff])) return orientation(bytes) > 1 ? redraw(blob, 'jpg') : { bytes, type: 'jpg' };
  if (isHeic(bytes)) {
    const { heicTo } = await import('heic-to');
    return embeddable(await heicTo({ blob, type: 'image/jpeg', quality: 0.9 }));
  }
  return redraw(blob, 'png');
}
