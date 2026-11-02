import { create } from 'zustand';

/** Documents just added on this device, whose annotations from other apps are still to be asked about. */
export const useAsk = create<{ docs: string[] }>(() => ({ docs: [] }));
export const askAbout = (docIds: string[]) => docIds.length && useAsk.setState((s) => ({ docs: [...s.docs, ...docIds] }));
export const asked = (docId: string) => useAsk.setState((s) => ({ docs: s.docs.filter((d) => d !== docId) }));
