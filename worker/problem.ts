// Apart from page.ts, so the app can name these without type checking the Worker's DOM code.
import type { Provider } from './links';

/** Why a fetch was refused, as a code with what its wording needs: the app says it in the reader's language. */
export type Problem =
  | {
      code:
        | 'method'
        | 'notAddress'
        | 'scheme'
        | 'credentials'
        | 'ipNumber'
        | 'private'
        | 'notFound'
        | 'unchecked'
        | 'redirects'
        | 'notPage'
        | 'pageTooLarge'
        | 'noArticle'
        | 'pageTimeout'
        | 'pageFailed'
        | 'notFile'
        | 'fileTimeout'
        | 'fileFailed';
    }
  | { code: 'upstream'; status: number }
  | { code: 'fileTooLarge'; mb: number }
  | { code: 'folder' | 'privateLink'; provider: Provider };
