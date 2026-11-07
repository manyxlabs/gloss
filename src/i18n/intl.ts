import type { Lang } from './langs';

/**
 * Number, plural and date formatting for one language, as used in India. Western digits are asked
 * for by name: some locales (Marathi, Bengali) default to their own, which readers of apps do not expect.
 */
export function intl(lang: Lang) {
  const locale = `${lang}-IN-u-nu-latn`;
  const numbers = new Intl.NumberFormat(locale);
  const rules = new Intl.PluralRules(locale);
  const num = (n: number) => numbers.format(n);
  return {
    locale,
    num,
    /** The form for `n`, with `#` standing for the number: `plural(n, { one: '# page', other: '# pages' })`. */
    plural: (n: number, forms: { one?: string; other: string }) => ((rules.select(n) === 'one' && forms.one) || forms.other).replaceAll('#', num(n)),
    date: (d: Date | number, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(d),
  };
}
