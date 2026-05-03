const LEGACY_PRICE_SELECTORS = [
  '.admin-ic-line',
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
    ${LEGACY_PRICE_SELECTORS},
    .inventory-rewrite-shell [data-price]::before,
    .inventory-rewrite-shell [data-price]::after,
    .inventory-rewrite-shell .item-card::before,
    .inventory-rewrite-shell .item-card::after,
    .inventory-rewrite-shell .vt-unified-item-card::before,
    .inventory-rewrite-shell .vt-unified-item-card::after,
    .inventory-rewrite-shell .inventory-mosaic-item::before,
    .inventory-rewrite-shell .inventory-mosaic-item::after,
    .vt-unified-item-card .admin-ic-line,
    .item-card .admin-ic-line,
    article .admin-ic-line {
      content: none !important;
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    .vt-popout-price-line,
    .admin-ic-text {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: #ffe6a1 !important;
      background: transparent !important;
      border: 0 !important;
      border-radius: 0 !important;
      padding: 0 !important;
      margin: 0 0 8px !important;
      font-weight: 900 !important;
      box-shadow: none !important;
    }

    .inventory-rewrite-shell .inventory-mosaic-item.vt-hover-price-title .item-title,
    .inventory-rewrite-shell .inventory-mosaic-item:hover .item-title {
      color: #ffdc93 !important;
      text-align: center !important;
    }
  `;
  document.head.appendChild(style);
}

function hideLegacyPriceNodes(root = document) {
  root.querySelectorAll?.(LEGACY_PRICE_SELECTORS).forEach(node => {
    if (node.closest?.('.vt-item-popout')) return;
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('display', 'none', 'important');
    node.style.setProperty('visibility', 'hidden', 'important');
    node.style.setProperty('opacity', '0', 'important');
    node.style.setProperty('pointer-events', 'none', 'important');
  });
}

function protectSelectClick(event) {
  const target = event.target;
  if (!target?.closest?.('.bulk-select-pill')) return;
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
  hideLegacyPriceNodes();
  window.addEventListener('pointerdown', protectSelectClick, true);
  window.addEventListener('mousedown', protectSelectClick, true);
  window.addEventListener('click', protectSelectClick, true);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) if (node?.nodeType === 1) hideLegacyPriceNodes(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(hideLegacyPriceNodes, 1000);
}

install();
