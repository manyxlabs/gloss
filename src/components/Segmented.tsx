/** A choice of one of a few, as a row of segments: each choice is a value, its label, and whether it is unavailable. */
export const radios = <T extends string | number | boolean>(name: string, value: T, choices: [T, string, boolean?][], pick: (v: T) => void) => (
  <div className="segmented" role="radiogroup" aria-label={name}>
    {choices.map(([v, label, disabled]) => (
      <label key={String(v)} className={disabled ? 'disabled' : undefined}>
        <input type="radio" name={name} checked={value === v} disabled={disabled} onChange={() => pick(v)} />
        {label}
      </label>
    ))}
  </div>
);
