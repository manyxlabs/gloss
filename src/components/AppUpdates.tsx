import { RefreshCw, X } from 'lucide-react';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Says when Gloss can work offline, and when a new version is waiting, which the reader loads when they choose. */
export function AppUpdates() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  // The offline note is news only once; an update waits until the reader acts on it.
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 5000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);
  if (!needRefresh && !offlineReady) return null;
  const close = () => (setNeedRefresh(false), setOfflineReady(false));
  return (
    <div className="toast glass" role="status">
      <span>{needRefresh ? 'A new version of Gloss is ready.' : 'Gloss now works offline on this device.'}</span>
      {needRefresh && (
        <button className="primary" onClick={() => void updateServiceWorker(true)}>
          <RefreshCw size={15} /> Reload
        </button>
      )}
      <button className="icon" aria-label="Dismiss" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
