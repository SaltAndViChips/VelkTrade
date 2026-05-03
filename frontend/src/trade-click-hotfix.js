import { velkToast } from './velktrade-feature-foundation.js';

function text(value) {
  return String(value || '').trim();
}

function itemTitle(card) {
  return text(card?.dataset?.title) ||
    text(card?.querySelector?.('.item-title')?.textContent) ||
    text(card?.querySelector?.('span')?.textContent) ||
    'item';
}

function closestTradeInventoryPanel(card) {
  let node = card;
  while (node && node !== document.body) {
    // The rewritten offline trade panel handles its own click/double-click/drag logic.
    // Do not synthesize clicks there or it can invert add/remove behavior.
    if (node.classList?.contains('trade-offer-panel')) return null;

    const label = text(node.querySelector?.('h2,h3,strong')?.textContent).toLowerCase();
    const className = text(node.className).toLowerCase();
    const isTradeSurface = className.includes('trade') || className.includes('offer') || /offline trade|counter offer|your inventory|other player inventory/.test(label);
    const isInventoryPanel = /your inventory|other player inventory|inventory/.test(label);
    const isOfferPanel = /your offer|requested items|selected|offer-drop|request-drop/.test(label) || node.id === 'offer-drop' || node.id === 'request-drop';
    if (isTradeSurface && isInventoryPanel && !isOfferPanel) return node;
    node = node.parentElement;
  }
  return null;
}

function installTradeClickHotfix() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_TRADE_CLICK_HOTFIX__) return;
  window.__VELKTRADE_TRADE_CLICK_HOTFIX__ = true;

  document.addEventListener('click', event => {
    if (event.__velktradeSyntheticTradeClick) return;
    const card = event.target?.closest?.('.vt-unified-item-card,.item-card');
    if (!card || card.closest('.vt-item-popout,.vt-item-popout-backdrop')) return;
    if (card.closest('.trade-offer-panel')) return;
    if (card.classList.contains('inventory-folder-card') || card.classList.contains('vt-folder-card')) return;
    const panel = closestTradeInventoryPanel(card);
    if (!panel) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const dbl = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
    dbl.__velktradeSyntheticTradeClick = true;
    card.dispatchEvent(dbl);
    velkToast(`Added ${itemTitle(card)}.`, 'success', 2200);
  }, true);
}

installTradeClickHotfix();
