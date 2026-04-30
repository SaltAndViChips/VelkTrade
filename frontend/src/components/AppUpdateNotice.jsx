import { useEffect, useMemo, useRef, useState } from 'react';

function getBasePath() {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function extractAssetSignature(html) {
  const assetMatches = html.match(/\/assets\/[^"')\s]+/g) || [];
  const moduleMatches = html.match(/src="[^"]+\.js"|href="[^"]+\.css"/g) || [];

  return [...new Set([...assetMatches, ...moduleMatches])]
    .sort()
    .join('|');
}

function getCurrentSignature() {
  return extractAssetSignature(document.documentElement.outerHTML);
}

export default function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState('');
  const initialSignatureRef = useRef('');

  const indexUrl = useMemo(() => {
    return `${window.location.origin}${getBasePath()}index.html`;
  }, []);

  useEffect(() => {
    initialSignatureRef.current = getCurrentSignature();

    let cancelled = false;

    async function checkForUpdate() {
      try {
        const response = await fetch(`${indexUrl}?v=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) return;

        const html = await response.text();
        const latestSignature = extractAssetSignature(html);
        const initialSignature = initialSignatureRef.current;

        if (
          latestSignature &&
          initialSignature &&
          latestSignature !== initialSignature &&
          latestSignature !== dismissedSignature &&
          !cancelled
        ) {
          setAvailable(true);
        }
      } catch {
        // Network failures should not interrupt the app.
      }
    }

    const firstCheck = window.setTimeout(checkForUpdate, 15000);
    const interval = window.setInterval(checkForUpdate, 60000);

    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [indexUrl, dismissedSignature]);

  if (!available) return null;

  function reloadNow() {
    window.location.reload();
  }

  function dismissForNow() {
    setDismissedSignature(getCurrentSignature());
    setAvailable(false);
  }

  return (
    <aside className="app-update-notice" role="status" aria-live="polite">
      <div className="app-update-icon">↻</div>

      <div>
        <strong>New version available</strong>
        <p>A newer version of Salts Trading Board has been deployed.</p>
      </div>

      <div className="inline-controls app-update-actions">
        <button type="button" onClick={reloadNow}>Reload Now</button>
        <button type="button" className="ghost" onClick={dismissForNow}>Later</button>
      </div>
    </aside>
  );
}
