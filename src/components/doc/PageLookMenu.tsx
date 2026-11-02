import { Coffee, Image, Moon, Sun, SunMoon } from 'lucide-react';
import { useState } from 'react';
import { PAGE_LOOKS, setKeepImages, setPageLook, useReading, type PageLook } from '../../reading';
import { Menu } from '../Menu';

const LOOKS: Record<PageLook, [string, typeof Sun]> = {
  light: ['Light pages', Sun],
  dark: ['Dark pages', Moon],
  sepia: ['Sepia pages', Coffee],
  theme: ['Follow the app theme', SunMoon],
};

/** Chooses how pages are shown on this device: light, dark, sepia, or following the app's theme. */
export function PageLookMenu() {
  const reading = useReading();
  const [button, setButton] = useState<HTMLElement | null>(null);
  const Shown = LOOKS[reading.look][1];
  return (
    <>
      <button
        className="icon"
        aria-label="Page colours"
        title="Page colours"
        aria-haspopup="menu"
        aria-expanded={!!button}
        onClick={(e) => setButton(button ? null : e.currentTarget)}
      >
        <Shown size={17} />
      </button>
      {button && (
        <Menu anchor={button} label="Page colours" onClose={() => setButton(null)}>
          {PAGE_LOOKS.map((look) => {
            const [label, Icon] = LOOKS[look];
            return (
              <button key={look} role="menuitemradio" aria-checked={reading.look === look} onClick={() => (setPageLook(look), setButton(null))}>
                <Icon size={16} /> {label}
              </button>
            );
          })}
          <hr />
          {/* Stays open, as one may want to see the page each way. */}
          <button role="menuitemcheckbox" aria-checked={reading.keepImages} onClick={() => setKeepImages(!reading.keepImages)} title="On dark pages, show pictures as printed">
            <Image size={16} /> Keep images as they are
          </button>
        </Menu>
      )}
    </>
  );
}
