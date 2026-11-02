import { create } from 'zustand';
import { files, pageTexts } from './pdf/pdfjs';

/** A term a document defines, with the sentence that defines it and the page it is on. */
export type Definition = { term: string; text: string; page: number };

const KEY = 'gloss:terms';
function stored() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    // Storage can be blocked; the lookup is then on, as it is by default.
    return true;
  }
}

/** Whether a defined term's meaning shows when it is pointed at, kept on this device. */
export const useTerms = create<{ on: boolean }>(() => ({ on: stored() }));

export function setTermsOn(on: boolean) {
  useTerms.setState({ on });
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not kept; it goes back to on next time.
  }
}

const Q = '["“]([^"“”]{2,60}?)["”]';
/**
 * How contracts define terms: `"Term" means`, `"Term" shall mean`, `"Term" has the meaning`, and the
 * term named in brackets after what it stands for: `(the "Term")`, `(hereinafter "Term")`,
 * `(hereinafter referred to as the "Term")`, `(each a "Term")`.
 */
const PATTERNS = [
  new RegExp(`${Q}\\s+(?:shall\\s+)?(?:means?|mean|has\\s+the\\s+meaning|shall\\s+have\\s+the\\s+meaning|refers\\s+to|includes)\\b`, 'g'),
  new RegExp(`\\((?:(?:each|both|together|collectively)[, ]+)?(?:the\\s+|an?\\s+)?(?:hereinafter\\s+(?:referred\\s+to\\s+as\\s+|called\\s+)?(?:the\\s+|an?\\s+)?)?${Q}\\)`, 'g'),
];
/** A defined term starts with a capital or a digit and is a few words long. */
const TERM = /^[\p{Lu}\d][\p{L}\d .,&'’-]*$/u;
const LONGEST = 400;

/** The sentence around a spot in a page's text; in a list of definitions, a semicolon ends one too. */
function sentence(text: string, from: number, to: number) {
  const start = Math.max(0, ...['. ', '; '].map((b) => text.lastIndexOf(b, from) + 2).filter((i) => i > 1));
  const stops = ['. ', '; '].map((b) => text.indexOf(b, to)).filter((i) => i >= 0);
  const end = stops.length ? Math.min(...stops) + 1 : text.length;
  const s = text.slice(start, end).trim();
  return s.length > LONGEST ? `${s.slice(0, LONGEST).trimEnd()}…` : s;
}

/** The terms defined in pages of text; the first definition of a term counts. */
export function findDefinitions(pages: string[]): Definition[] {
  const found = new Map<string, Definition>();
  pages.forEach((raw, i) => {
    const text = raw.replace(/\s+/g, ' ');
    const hits = PATTERNS.flatMap((p) => [...text.matchAll(p)]).sort((a, b) => a.index - b.index);
    for (const m of hits) {
      const term = m[1]!.trim();
      if (!TERM.test(term) || term.split(' ').length > 6 || found.has(term)) continue;
      found.set(term, { term, text: sentence(text, m.index, m.index + m[0].length), page: i + 1 });
    }
  });
  return [...found.values()];
}

const cache = new Map<string, Promise<Definition[]>>();

/** A document's defined terms, worked out once for each version of its file, when first wanted. */
export function definitionsOf(docId: string, password?: string) {
  const key = files.key(docId);
  let defs = cache.get(key);
  if (!defs) {
    defs = pageTexts(docId, password).then(findDefinitions);
    defs.catch(() => cache.delete(key));
    cache.set(key, defs);
  }
  return defs;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds the terms in text, longest first, as whole words, case and all. */
export const termPattern = (defs: Definition[]) =>
  defs.length
    ? new RegExp(
        `(?<![\\p{L}\\d])(${[...defs]
          .sort((a, b) => b.term.length - a.term.length)
          .map((d) => escape(d.term))
          .join('|')})(?![\\p{L}\\d])`,
        'gu',
      )
    : null;
