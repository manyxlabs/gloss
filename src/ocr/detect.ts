import { OPS } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { files, loadDoc, pageTexts } from '../pdf/pdfjs';

const IMAGES = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup]);
/** A page with fewer letters than this has no real text layer: a scan often carries a stamped page number or a few stray characters. */
const FEW_LETTERS = 20;

// Keyed by the version of the file, so a version with recognised text is looked at afresh.
const found = new Map<string, Promise<number[]>>();

/** The pages that are pictures of text: they draw an image, and have no text to select or search. */
export function scannedPages(docId: string, password?: string) {
  const key = files.key(docId);
  let pages = found.get(key);
  if (!pages) {
    pages = Promise.all([loadDoc(docId, password), pageTexts(docId, password)]).then(async ([doc, texts]) => {
      const out: number[] = [];
      for (const [i, text] of texts.entries()) {
        if (text.replace(/\s/g, '').length >= FEW_LETTERS) continue;
        // Only text-less pages are read this far, so born-digital documents cost nothing more.
        const page = await doc.getPage(i + 1);
        if ((await page.getOperatorList()).fnArray.some((op) => IMAGES.has(op))) out.push(i + 1);
      }
      return out;
    });
    pages.catch(() => found.delete(key));
    found.set(key, pages);
  }
  return pages;
}

/** The scanned pages of the document at its current version; empty until they are known, or if it cannot be read. */
export function useScanned(docId: string | undefined, password: string | undefined, file: string | undefined) {
  const [state, setState] = useState<{ key: string; pages: number[] } | null>(null);
  const key = `${docId}@${file}`;
  useEffect(() => {
    if (!docId) return;
    let stale = false;
    scannedPages(docId, password).then(
      (pages) => !stale && setState({ key, pages }),
      () => {},
    );
    return () => void (stale = true);
  }, [docId, password, key]);
  return state?.key === key ? state.pages : [];
}
