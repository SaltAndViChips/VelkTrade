const TOAST_ROOT_ID = 'velktrade-toast-root';
const TOAST_STYLE_ID = 'velktrade-toast-styles';

function safeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' ? json : fallback;
  } catch {
    return fallback;
  }
}

function installToastStyles() {
  if (typeof document === 'undefined' || document.getElementById(TOAST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    .velktrade-toast-root {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 120000;
      display: grid;
      gap: 10px;
      width: min(380px, calc(100vw - 28px));
      pointer-events: none;
    }

    .velktrade-toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 12px 12px 12px 14px;
      border-radius: 14px;
      color: #f5f0ff;
      background: rgba(13, 11, 22, 0.96);
      border: 1px solid rgba(142, 113, 255, 0.32);
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.52);
      backdrop-filter: blur(10px);
      animation: velktrade-toast-in 160ms ease-out;
      font-size: 14px;
      line-height: 1.35;
    }

    .velktrade-toast.success { border-color: rgba(97, 217, 139, 0.62); }
    .velktrade-toast.error { border-color: rgba(255, 93, 119, 0.72); }
    .velktrade-toast.warning { border-color: rgba(255, 202, 96, 0.72); }
    .velktrade-toast.info { border-color: rgba(142, 113, 255, 0.5); }

    .velktrade-toast button {
      width: 28px;
      height: 28px;
      min-height: 28px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.06);
      color: inherit;
      cursor: pointer;
      padding: 0;
      box-shadow: none;
    }

    .velktrade-toast.leaving { animation: velktrade-toast-out 150ms ease-in forwards; }

    .vt-item-locked { filter: saturate(0.74); }

    .vt-item-locked::after {
      content: '🔒 Locked';
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 3;
      padding: 5px 8px;
      border-radius: 999px;
      background: rgba(5, 4, 10, 0.82);
      border: 1px solid rgba(255, 202, 96, 0.5);
      color: #ffdc93;
      font-size: 12px;
      font-weight: 800;
      pointer-events: none;
    }

    .vt-lock-badge { display: none !important; }

    @keyframes velktrade-toast-in {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes velktrade-toast-out {
      to { opacity: 0; transform: translateY(8px) scale(0.98); }
    }

    @media (max-width: 760px) {
      .velktrade-toast-root {
        right: 10px;
        bottom: 10px;
        width: calc(100vw - 20px);
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureToastRoot() {
  installToastStyles();

  let root = document.getElementById(TOAST_ROOT_ID);
  if (root) return root;

  root = document.createElement('section');
  root.id = TOAST_ROOT_ID;
  root.className = 'velktrade-toast-root';
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'VelkTrade notifications');
  document.body.appendChild(root);
  return root;
}

export function velkToast(message, variant = 'info', timeout = 3600) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const root = ensureToastRoot();
  const toast = document.createElement('article');
  toast.className = `velktrade-toast ${variant || 'info'}`;

  const body = document.createElement('span');
  body.textContent = safeText(message, 'Done.');

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss notification');

  const dismiss = () => {
    toast.classList.add('leaving');
    window.setTimeout(() => toast.parentNode?.removeChild(toast), 155);
  };

  close.addEventListener('click', dismiss);
  toast.append(body, close);
  root.appendChild(toast);

  if (timeout > 0) window.setTimeout(dismiss, timeout);
  return toast;
}

function isLockedValue(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'locked' || value === 'pending';
}

function cardLooksLocked(card) {
  if (!card) return false;
  const data = card.dataset || {};
  if (isLockedValue(data.vtLocked) || isLockedValue(data.locked) || isLockedValue(data.isLocked) || isLockedValue(data.tradePending) || isLockedValue(data.trade_pending)) return true;
  const body = safeText(card.textContent).toLowerCase();
  return body.includes('trade pending') || body.includes('locked') || body.includes('in trade');
}

export function scanItemLocks() {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('.vt-lock-badge').forEach(badge => {
    badge.parentNode?.removeChild(badge);
  });

  document.querySelectorAll('.vt-unified-item-card, .inventory-item, .bazaar-item-card, .bazaar-item, .trade-item, [data-item-id]').forEach(card => {
    if (!cardLooksLocked(card)) return;
    card.classList.add('vt-item-locked');
    card.dataset.vtLocked = 'true';
  });
}

export function auditClientEvent(type, payload = {}) {
  const detail = { type, payload, createdAt: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('velktrade:audit-event', { detail }));

  try {
    const pending = JSON.parse(window.localStorage.getItem('velktrade-pending-audit-events') || '[]');
    pending.unshift(detail);
    window.localStorage.setItem('velktrade-pending-audit-events', JSON.stringify(pending.slice(0, 100)));
  } catch {
    // Local storage is optional.
  }
}

function installFoundation() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installToastStyles();

  if (window.__VELKTRADE_FEATURE_FOUNDATION_INSTALLED__) return;
  window.__VELKTRADE_FEATURE_FOUNDATION_INSTALLED__ = true;

  window.velkToast = velkToast;
  window.velktradeToast = velkToast;
  window.velkAudit = auditClientEvent;

  window.addEventListener('velktrade:toast', event => {
    const detail = event.detail || {};
    velkToast(detail.message || detail.text || 'Done.', detail.variant || detail.type || 'info', detail.timeout ?? 3600);
  });

  window.addEventListener('velktrade:scan-locks', scanItemLocks);
  scanItemLocks();

  const observer = new MutationObserver(scanItemLocks);
  observer.observe(document.body, { childList: true, subtree: true });
}

installFoundation();
