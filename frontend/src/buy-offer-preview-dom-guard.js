/*
  Buy Offer Inbox preview guard.

  Some older/stale buy-offer rows can render without item fields. This guarantees
  every buy-offer card has a visible preview column, even when the backend returns
  no itemImage/itemTitle yet.
*/

function text(value, fallback = '') {
  return String(value || '').trim() || fallback;
}

function findItemId(card) {
  const explicit = card.querySelector('[data-item-id],[data-id]');
  const value = explicit?.dataset?.itemId || explicit?.dataset?.id;
  if (value) return value;
  const haystack = text(card.textContent);
  const match = haystack.match(/Item\s*#?\s*(\d+)/i) || haystack.match(/itemId["':\s]+(\d+)/i);
  return match?.[1] || '';
}

function offerNumber(card) {
  const header = text(card.querySelector('.buy-offer-card-header strong')?.textContent || card.querySelector('strong')?.textContent);
  const match = header.match(/#\s*(\d+)/);
  return match?.[1] || '';
}

function createFallback(card) {
  const itemId = findItemId(card);
  const number = offerNumber(card);
  const preview = document.createElement('div');
  preview.className = 'buy-offer-item-preview buy-offer-preview-forced vt-unified-item-card';
  preview.dataset.itemId = itemId;
  preview.dataset.id = itemId;
  preview.dataset.title = itemId ? `Item #${itemId}` : `Buy Offer #${number || '?'}`;
  preview.dataset.noItemPopup = itemId ? 'false' : 'true';
  preview.innerHTML = `
    <div class="buy-offer-preview-fallback">
      <strong>No preview</strong>
      <span>${itemId ? `Item #${itemId}` : 'Missing item data'}</span>
      ${number ? `<small>Buy Offer #${number}</small>` : ''}
    </div>
    <span class="item-title">${itemId ? `Item #${itemId}` : 'Item preview unavailable'}</span>
  `;
  return preview;
}

function hardenCard(card) {
  if (!card || card.dataset.previewGuarded === 'true') return;
  card.dataset.previewGuarded = 'true';

  let body = card.querySelector('.buy-offer-card-body');
  if (!body) {
    body = document.createElement('div');
    body.className = 'buy-offer-card-body';
    const header = card.querySelector('.buy-offer-card-header');
    if (header?.nextSibling) card.insertBefore(body, header.nextSibling);
    else card.appendChild(body);
    Array.from(card.children).forEach(child => {
      if (child !== header && child !== body) body.appendChild(child);
    });
  }

  let preview = body.querySelector('.buy-offer-item-preview');
  if (!preview) {
    preview = createFallback(card);
    body.prepend(preview);
  }

  const hasImage = Boolean(preview.querySelector('img'));
  const hasFallback = Boolean(preview.querySelector('.buy-offer-missing-preview,.buy-offer-preview-fallback'));
  if (!hasImage && !hasFallback) {
    preview.prepend(createFallback(card).firstElementChild);
  }

  preview.style.display = 'grid';
  preview.style.visibility = 'visible';
  preview.style.opacity = '1';
  preview.style.minHeight = '310px';
  preview.style.width = '260px';
  preview.style.maxWidth = '260px';
  preview.style.flex = '0 0 260px';
}

function scan() {
  document.querySelectorAll('.buy-offer-card-redesign').forEach(hardenCard);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_BUY_OFFER_PREVIEW_DOM_GUARD__) return;
  window.__VELKTRADE_BUY_OFFER_PREVIEW_DOM_GUARD__ = true;
  const observer = new MutationObserver(() => window.requestAnimationFrame(scan));
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('velktrade:trade-buy-offers-refreshed', () => window.setTimeout(scan, 80));
  window.setInterval(scan, 1200);
  window.setTimeout(scan, 250);
}

install();
