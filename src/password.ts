/** Asks the reader for a protected PDF's password, or gives null when they cancel. The dialog sets it while it is mounted. */
export const passwordAsker = {
  ask: async (_file: string, _wrong: boolean): Promise<string | null> => null,
};
