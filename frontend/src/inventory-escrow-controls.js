import { API_URL, getToken } from './api';
import { velkToast } from './velktrade-feature-foundation.js';

const ESCROW_BUTTON_CLASS = 'velktrade-release-escrow-button';
const ESCROW_BADGE_CLASS = 'velktrade-escrow-badge';
const SCAN_MS = 1200;

function txt(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'pending' || value === 'escrow' || value === 'locked';
}

function isMyInventoryCard(card) {
  const section = card.closest('.inventory-card-section,.inventory-rewrite-shell,.card');
  if (!section) return false;
  const title = txt(section.querySelector('h2')?.textContent).toLowerCase();
  return title.includes('my inventory') || title.includes('your inventory');
}

function findReactData(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (value instanceof Element || value instanceof Window || value instanceof Document) return null;

  const id = value.id ?? value.itemId ?? value.item_id;
  const title = value.title ?? value.name ?? value.itemTitle ?? value.item_title;
  const image = value.image ?? value.imageUrl ?? value.src ?? value.itemImage ?? value.item_image;
  const escrow = value.trade_pending ?? value.tradePending ?? value.escrow ?? value.inEscrow ?? value.in_escrow ?? value.isEscrow ?? value.is_escrow;
  const status = txt(value.status ?? value.tradeStatus ?? value.trade_status ?? value.lockStatus ?? value.lock_status).toLowerCase();

  if (id || title || image || escrow !== undefined || status) {
    return { id: txt(id), title: txt(title), image: txt(image), escrow, status };
  }

  for (const key of ['item', 'inventoryItem', 'data', 'payload', 'props', 'children']) {
    const found = findReactData(value[key], seen, depth + 1);
    if (found) return found;
  }

  for (const key of Object.keys(value).slice(0, 40)) {
    if (['stateNode', 'return', 'alternate', '_owner'].includes(key)) continue;
    const found = findReactData(value[key], seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function reactDataFromCard(card) {
  let current = card;
  let depth = 0;
  while (current && current !== document.body && depth < 8) {
    for (const key of Object.keys(current)) {
      if (!key.startsWith('__reactProps$') && !key.startsWith('__reactFiber$')) continue;
      const found = findReactData(current[key]);
      if (found) return found;
    }
    current = current.parentElement;
    depth += 1;
  }
  return null;
}

function cardItemId(card, data) {
  return txt(data?.id || card.dataset.itemId || card.dataset.id || card.getAttribute('data-item-id') || card.getAttribute('data-id'));
}

function cardTitle(card, data) {
  return txt(data?.title || card.dataset.title || card.dataset.vtOriginalTitle || card.querySelector('.item-title,.inventory-mosaic-title,strong')?.textContent, 'item');
}

function cardIsEscrow(card, data) {
  if (card.dataset.escrowReleased === 'true') return false;
  if (bool(card.dataset.tradePending) || bool(card.dataset.trade_pending) || bool(card.dataset.escrow) || bool(card.dataset.inEscrow)) return true;
  if (bool(data?.escrow)) return true;
  const status = txt(data?.status).toLowerCase();
  if (status.includes('escrow') || status.includes('trade_pending') || status.includes('trade pending')) return true;
  const body = txt(card.textContent).toLowerCase();
  if (body.includes('trade pending') || body.includes('in escrow')) return true;
  return card.classList.contains('vt-item-locked') && !card.closest('.bazaar-page,.trade-room,.trade-panel,.profile-page');
}

async function releaseRequest(itemId) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const body = JSON.stringify({ trade_pending: false, tradePending: false, escrow: false });
  const attempts = [
    [`/api/items/${encodeURIComponent(itemId)}/escrow/release`, { method: 'POST', body }],
    [`/api/items/${encodeURIComponent(itemId)}/release-escrow`, { method: 'POST', body }],
    [`/api/items/${encodeURIComponent(itemId)}/escrow`, { method: 'DELETE' }],
    [`/api/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body }]
  ];

  let lastError = null;
  for (const [path, options] of attempts) {
    try {
      const response = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options, headers });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : { text: await response.text().catch(() => '') };
      if (response.ok && !data.error) return data;
      lastError = new Error(data.error || data.message || data.text || `Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Could not remove item from escrow.');
}

function markReleased(card) {
  card.dataset.escrowReleased = 'true';
  card.dataset.tradePending = 'false';
  card.dataset.trade_pending = 'false';
  card.dataset.escrow = 'false';
  card.classList.remove('vt-item-locked', 'velktrade-in-escrow');
  card.querySelector(`.${ESCROW_BUTTON_CLASS}`)?.remove();
  card.querySelector(`.${ESCROW_BADGE_CLASS}`)?.remove();
}

function installControls(card) {
  if (!card || card.dataset.escrowControlsBound === 'true') return;
  if (!isMyInventoryCard(card)) return;

  const data = reactDataFromCard(card);
  if (!cardIsEscrow(card, data)) return;

  const itemId = cardItemId(card, data);
  if (!itemId) return;

  card.dataset.escrowControlsBound = 'true';
  card.dataset.tradePending = 'true';
  card.dataset.escrow = 'true';
  card.classList.add('velktrade-in-escrow');

  if (!card.querySelector(`.${ESCROW_BADGE_CLASS}`)) {
    const badge = document.createElement('span');
    badge.className = ESCROW_BADGE_CLASS;
    badge.textContent = 'In Escrow';
    card.appendChild(badge);
  }

  if (!card.querySelector(`.${ESCROW_BUTTON_CLASS}`)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ESCROW_BUTTON_CLASS;
    button.textContent = 'Remove escrow';
    button.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      button.disabled = true;
      button.textContent = 'Removing...';
      try {
        await releaseRequest(itemId);
        markReleased(card);
        velkToast(`${cardTitle(card, data)} removed from escrow.`, 'success');
        window.dispatchEvent(new CustomEvent('velktrade:escrow-released', { detail: { itemId } }));
        window.dispatchEvent(new CustomEvent('velktrade:scan-locks'));
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Remove escrow';
        velkToast(error.message || 'Could not remove escrow.', 'error', 7000);
      }
    });
    card.appendChild(button);
  }
}

function scan() {
  document.querySelectorAll('.inventory-card-section .vt-unified-item-card,.inventory-card-section [data-item-id],.inventory-rewrite-shell .vt-unified-item-card,.inventory-rewrite-shell [data-item-id]').forEach(installControls);
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_ESCROW_CONTROLS__) return;
  window.__VELKTRADE_ESCROW_CONTROLS__ = true;

  const observer = new MutationObserver(() => window.requestAnimationFrame(scan));
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-trade-pending', 'data-escrow'] });
  window.addEventListener('velktrade:inventory-tools-refresh', scan);
  window.addEventListener('velktrade:scan-locks', () => window.setTimeout(scan, 80));
  window.setInterval(scan, SCAN_MS);
  window.setTimeout(scan, 400);
  window.setTimeout(scan, 1600);
}

install();
