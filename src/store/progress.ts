import { create } from 'zustand';

/** Something slow under way, such as an import or an export, and with `total` how many of its files are done. */
export const useProgress = create<{ at: { text: string; done?: number; total?: number } | null }>(() => ({ at: null }));

/** Runs slow work with its progress on show until it ends, however it ends. */
export async function withProgress<T>(text: string, run: (step: (done: number, total: number) => void) => Promise<T>) {
  useProgress.setState({ at: { text } });
  try {
    return await run((done, total) => useProgress.setState({ at: { text, done, total } }));
  } finally {
    useProgress.setState({ at: null });
  }
}
