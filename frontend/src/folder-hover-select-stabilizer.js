/*
  Stabilizes opened-folder hover behavior and bulk-select clicks.

  This intentionally runs before React renders so its capture listeners execute
  before the global item-popup capture listener added by UnifiedItemExperience.
*/

function txt(value) {
  return String(value || '').trim();
}

function priceOf(card) {
  return txt(card?.dataset?.vtPrice || card?.dataset?.price || card?.dataset?.itemPrice);
}

function titleNode(card) {
  return card?.querySelector?.('.item-title, .title, figcaption, h3, h4, strong') || null;
}

function originalTitle(card, node) {
  const fromData = txt(card?.dataset?.vtOriginalTitle || card?.dataset?.title);
  if (fromData) return fromData;
  const current = txt(node?.textContent);
  if (current && !/^[\d,]+(?:\.\d+)?\s*IC$/i.test(current)) return current;
  return 'Item';
}

function restoreCard(card) {
  if (!card || card.classList?.contains('vt-folder-card')) return;
  const node = titleNode(card);
  if (!node) return;
  card.classList.remove('vt-hover-price-title');
  card.dataset.vtHoveringPrice = 'false';
  node.textContent = originalTitle(card, node);
  card.style.visibility = '';
  card.style.opacity = '';
  card.style.display = '';
}

function priceSwapCard(card) {
  if (!card || card.classList?.contains('vt-folder-card')) return;
  const node = titleNode(card);
  const price = priceOf(card);
  if (!node || !price) return restoreCard(card);
  if (!card.dataset.vtOriginalTitle) card.dataset.vtOriginalTitle = originalTitle(card, node);
  card.dataset.vtHoveringPrice = 'true';
  card.classList.add('vt-hover-price-title');
  node.textContent = price;
  card.style.visibility = '';
  card.style.opacity = '';
  card.style.display = '';
}

function hideLegacyBadges(scope = document) {
  scope.querySelectorAll?.([
    '.vt-hover-price',
    '.vt-price-badge',
    '.item-price-badge',
    '.price-badge',
    '.hover-price',
    '.item-hover-price',
    '[class*="price-badge" i]',
    '[class*="hover-price" i]',
    '[class*="price-pill" i]',
    '[class*="hover-preview" i]',
    '[class*="full-preview" i]'
  ].join(',')).forEach(node => {
    if (node.closest?.('.vt-item-popout')) return;
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('display', 'none', 'important');
    node.style.setProperty('visibility', 'hidden', 'important');
    node.style.setProperty('opacity', '0', 'important');
    node.style.setProperty('pointer-events', 'none', 'important');
  });
}

function normalizeFolderHover(event) {
  const folderItems = event?.target?.closest?.('.inventory-folder-items');
  if (!folderItems) return;

  const hoveredCard = event.target.closest('.vt-unified-item-card:not(.vt-folder-card), .item-card:not(.vt-folder-card)');
  const validHoveredCard = hoveredCard && folderItems.contains(hoveredCard) && !hoveredCard.classList.contains('inventory-folder-item-grid');

  folderItems.querySelectorAll('.vt-unified-item-card:not(.vt-folder-card), .item-card:not(.vt-folder-card)').forEach(card => {
    if (validHoveredCard && card === hoveredCard) priceSwapCard(card);
    else restoreCard(card);
  });

  hideLegacyBadges(folderItems);
}

function scheduleNormalize(event) {
  normalizeFolderHover(event);
  window.requestAnimationFrame(() => normalizeFolderHover(event));
  window.setTimeout(() => normalizeFolderHover(event), 30);
}

function temporarilyBypassGlobalItemPopup() {
  const current = window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__;
  window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = '__velktrade_bypass_item_popup_once__';
  window.queueMicrotask?.(() => {
    if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_bypass_item_popup_once__') {
      window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = current;
    }
  });
  window.setTimeout(() => {
    if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_bypass_item_popup_once__') {
      window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = current;
    }
  }, 0);
}

function bypassPopupWhenNeeded(event) {
  const target = event.target;
  if (!target?.closest) return;

  if (target.closest('.bulk-select-pill')) {
    temporarilyBypassGlobalItemPopup();
    return;
  }

  const folderItems = target.closest('.inventory-folder-items');
  if (folderItems && !target.closest('.vt-unified-item-card:not(.vt-folder-card), .item-card:not(.vt-folder-card)')) {
    temporarilyBypassGlobalItemPopup();
  }
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_FOLDER_HOVER_SELECT_STABILIZER__) return;
  window.__VELKTRADE_FOLDER_HOVER_SELECT_STABILIZER__ = true;

  window.addEventListener('pointerdown', bypassPopupWhenNeeded, true);
  window.addEventListener('click', bypassPopupWhenNeeded, true);
  window.addEventListener('mouseover', scheduleNormalize, true);
  window.addEventListener('mousemove', scheduleNormalize, true);
  window.addEventListener('mouseout', event => {
    const folderItems = event.target?.closest?.('.inventory-folder-items');
    if (!folderItems) return;
    window.requestAnimationFrame(() => {
      if (!folderItems.matches(':hover')) {
        folderItems.querySelectorAll('.vt-unified-item-card:not(.vt-folder-card), .item-card:not(.vt-folder-card)').forEach(restoreCard);
        hideLegacyBadges(folderItems);
      }
    });
  }, true);

  window.setInterval(() => {
    document.querySelectorAll('.inventory-folder-items').forEach(folderItems => {
      hideLegacyBadges(folderItems);
      const hoveredCard = folderItems.querySelector('.vt-unified-item-card:hover:not(.vt-folder-card), .item-card:hover:not(.vt-folder-card)');
      folderItems.querySelectorAll('.vt-unified-item-card:not(.vt-folder-card), .item-card:not(.vt-folder-card)').forEach(card => {
        if (hoveredCard && card === hoveredCard) priceSwapCard(card);
        else restoreCard(card);
      });
    });
  }, 250);
}

install();
