/* Prevent Bulk Tools select controls from bubbling into item/folder popups. */

function stop(event) {
  const button = event.target?.closest?.('.bulk-select-pill,.folder-select-pill');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function installBulkSelectGuard() {
  if (typeof window === 'undefined' || window.__VELKTRADE_BULK_SELECT_EVENT_GUARD__) return;
  window.__VELKTRADE_BULK_SELECT_EVENT_GUARD__ = true;

  // Do not block pointerdown/mousedown because Inventory.jsx uses those to perform
  // the actual select. Block release/click phases so the same press cannot also
  // open the item popup or toggle the selection a second time.
  window.addEventListener('pointerup', stop, true);
  window.addEventListener('mouseup', stop, true);
  window.addEventListener('click', stop, true);
  window.addEventListener('dblclick', stop, true);
}

installBulkSelectGuard();
