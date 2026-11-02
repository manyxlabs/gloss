// Problems found while creating a project on the start page, to show once the project has opened.
let pending: string[] = [];

export const leave = (problems: string[]) => void (pending = problems);

export function take() {
  const problems = pending;
  pending = [];
  return problems;
}
