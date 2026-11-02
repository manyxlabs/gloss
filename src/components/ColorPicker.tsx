import { Check, Palette, Star } from 'lucide-react';
import { useState } from 'react';
import { SWATCHES } from '../palette';
import { setFavourite, useFavourites } from '../store/favourites';
import { COLORS, type Color } from '../types';

/** Every colour, in rows of eight: the light shades, then the deep ones. */
export function PaletteGrid({ current, label, onPick }: { current?: Color; label: (name: string) => string; onPick: (c: Color) => void }) {
  return (
    <div className="palette-grid">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch hl-${c}${c === current ? ' current' : ''}`}
          aria-label={label(SWATCHES[c].name)}
          aria-pressed={c === current}
          title={SWATCHES[c].name}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

/**
 * The favourite colours, then More, which opens all 32 and is tinted with the colour in use when
 * that is not a favourite. Favourites are edited in the palette: pick a place, then the colour to
 * put there.
 */
export function ColorPicker({ current, label, onPick }: { current?: Color; label: (name: string) => string; onPick: (c: Color) => void }) {
  const favourites = useFavourites((s) => s.favourites);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const other = current && !favourites.includes(current) ? current : null;
  const swatch = (c: Color) => (
    <button
      key={c}
      className={`swatch hl-${c}${c === current ? ' current' : ''}`}
      aria-label={label(SWATCHES[c].name)}
      title={label(SWATCHES[c].name)}
      onClick={() => onPick(c)}
    />
  );
  return (
    <>
      {favourites.map(swatch)}
      <button
        className={`icon more-colors${other ? ` hl-${other} other` : ''}`}
        aria-label="More colours"
        title={other ? `More colours (now ${SWATCHES[other].name})` : 'More colours'}
        aria-expanded={open}
        onClick={() => (setOpen(!open), setEditing(null))}
      >
        <Palette size={16} />
      </button>
      {open && (
        <div className="palette glass" role="dialog" aria-label="All colours">
          {editing === null ? (
            <PaletteGrid current={current} label={label} onPick={(c) => (setOpen(false), onPick(c))} />
          ) : (
            <>
              <p className="palette-hint">Pick a favourite, then the colour to put in its place.</p>
              <div className="palette-favourites" role="group" aria-label="Favourites">
                {favourites.map((c, i) => (
                  <button
                    key={c}
                    className={`swatch hl-${c}${i === editing ? ' current' : ''}`}
                    aria-label={`Favourite ${i + 1}: ${SWATCHES[c].name}`}
                    aria-pressed={i === editing}
                    onClick={() => setEditing(i)}
                  />
                ))}
              </div>
              <PaletteGrid current={favourites[editing]} label={(name) => `Make favourite ${editing + 1} ${name}`} onPick={(c) => setFavourite(editing, c)} />
            </>
          )}
          <footer>
            <button className="ghost" aria-pressed={editing !== null} onClick={() => setEditing(editing === null ? 0 : null)}>
              {editing === null ? <Star size={14} /> : <Check size={14} />} {editing === null ? 'Edit favourites' : 'Done'}
            </button>
          </footer>
        </div>
      )}
    </>
  );
}
