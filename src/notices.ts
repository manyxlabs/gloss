// Problems found while creating a project on the start page, to show once the project has opened.
let pending: string[] = [];

export const leave = (problems: string[]) => void (pending = problems);

/**
 * Read while rendering, and cleared by `forget` only once the project has mounted: React may start
 * a render, drop it for a more urgent update and render again, and a read that cleared would leave
 * the second render nothing.
 */
export const left = () => pending;
export const forget = () => void (pending = []);
