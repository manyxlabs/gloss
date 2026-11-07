import { m } from '../i18n';

// Not in formats.ts, which the build reads too, nor index.ts, which brings pdf.js to the start page.
/** Why a file that is not one Gloss opens was left out. */
export const refusal = (name: string) => (/\.(doc|ppt|rtf|odt|odp)$/i.test(name) ? m.engineConvert.olderFormat(name) : m.engineConvert.notOpenable(name));
