import { Fragment, type ReactNode } from 'react';

/**
 * A catalogue string with marked parts, `Read next to <em>a canvas</em>`, drawn with an element for
 * each tag, so a translation can put the marked words wherever its word order needs them. Tags do not nest.
 */
export function rich(text: string, tags: Record<string, (inner: string) => ReactNode>) {
  return text.split(/(<(\w+)>.*?<\/\2>)/s).map((part, i) => {
    // split() puts each match's tag name after it; it is read with the match and skipped.
    if (i % 3 === 2) return null;
    const [, tag, inner] = /^<(\w+)>(.*)<\/\1>$/s.exec(part) ?? [];
    const make = tag ? tags[tag] : undefined;
    return <Fragment key={i}>{make ? make(inner!) : part}</Fragment>;
  });
}
