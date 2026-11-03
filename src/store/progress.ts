import { create } from 'zustand';

/** How far an import of many files has got; without `total`, the files are still being found. */
export const useProgress = create<{ at: { done: number; total?: number } | null }>(() => ({ at: null }));

/** Runs an import with its progress on show until it ends, however it ends. */
export async function withProgress<T>(run: (step: (done: number, total: number) => void) => Promise<T>) {
  useProgress.setState({ at: { done: 0 } });
  try {
    return await run((done, total) => useProgress.setState({ at: { done, total } }));
  } finally {
    useProgress.setState({ at: null });
  }
}
