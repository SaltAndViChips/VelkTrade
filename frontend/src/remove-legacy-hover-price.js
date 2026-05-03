/*
  Removes legacy oval hover-price badges and keeps bulk Select clicks from
  being captured by the global item-popup handler.

  The rewritten Inventory component handles price hover by changing the item
  title text only. Anything that creates a floating/oval price badge is legacy.
*/

const LEGACY_PRICE_SELECTORS = [
  '.vt-hover-price',
  '.vt-price-badge',
  '.item-price-badge',
  '.price-badge',
  '.hover-price',
  '.item-hover-price',
  '.bazaar-full-preview',
  '.item-hover-preview',
  '.vt-item-hover-preview',
  '[class*="price-badge" i]',
  '[class*="hover-price" i]',
  '[class*="price-pill" i]',
  '[class*="hover-preview" i]',
  '[class*="full-preview" i]'
].join(',');

function injectLegacyPriceKillCss() {
  if (document.getElementById('velktrade-remove-legacy-hover-price-css')) return;
  const style = document.createElement('style');
  style.id = 'velktrade-remove-legacy-hover-price-css';
  style.textContent = `
    ${LEGACY_PRICE_SELECTORS} {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      content: none !important;
    }

    .inventory-rewrite-shell [data-price]::before,
    .inventory-rewrite-shell [data-price]::after,
    .inventory-rewrite-shell .item-card::before,
    .inventory-rewrite-shell .item-card::after,
    .inventory-rewrite-shell .vt-unified-item-card::before,
    .inventory-rewrite-shell .vt-unified-item-card::after,
    .inventory-rewrite-shell .inventory-mosaic-item::before,
    .inventory-rewrite-shell .inventory-mosaic-item::after {
      content: none !important;
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .inventory-rewrite-shell .inventory-mosaic-item.vt-hover-price-title .item-title,
    .inventory-rewrite-shell .inventory-mosaic-item:hover .item-title {
      color: #ffdc93 !important;
      text-align: center !important;
    }
  `;
  document.head.appendChild(style);
}

function removeLegacyPriceNodes(root = document) {
  root.querySelectorAll?.(LEGACY_PRICE_SELECTORS).forEach(node => {
    if (node.closest?.('.vt-item-popout')) return;
    node.remove?.();
  });
}

function bypassItemPopupForSelect(event) {
  const target = event.target;
  if (!target?.closest) return;
  if (!target.closest('.bulk-select-pill')) return;

  const previousToken = window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__;
  window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = '__velktrade_skip_popup_for_bulk_select__';

  window.queueMicrotask?.(() => {
    if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_skip_popup_for_bulk_select__') {
      window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = previousToken;
    }
  });

  window.setTimeout(() => {
    if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_skip_popup_for_bulk_select__') {
      window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = previousToken;
    }
  }, 0);
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_REMOVE_LEGACY_HOVER_PRICE__) return;
  window.__VELKTRADE_REMOVE_LEGACY_HOVER_PRICE__ = true;

  injectLegacyPriceKillCss();
  removeLegacyPriceNodes();

  window.addEventListener('pointerdown', bypassItemPopupForSelect, true);
  window.addEventListener('mousedown', bypassItemPopupForSelect, true);
  window.addEventListener('click', bypassItemPopupForSelect, true);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (node?.nodeType === 1) removeLegacyPriceNodes(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.setInterval(removeLegacyPriceNodes, 1000);
}

install();
