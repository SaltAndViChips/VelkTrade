const LAST_SCREEN_KEY = 'velktrade:last-dashboard-screen';
const RESTORE_DONE_KEY = 'velktrade:restored-dashboard-screen-once';

const SCREEN_LABELS = new Map([
  ['my inventory', 'inventory'],
  ['trades', 'trades'],
  ['bazaar', 'bazaar'],
  ['make offline trade offer', 'offer'],
  ['admin panel', 'admin']
]);

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isDeepLinked() {
  return /(?:\/VelkTrade)?\/(room|user)\//i.test(window.location.pathname) ||
    new URLSearchParams(window.location.search).has('room') ||
    new URLSearchParams(window.location.search).has('user');
}

function protectBulkSelectFromGlobalPopup() {
  function guard(event) {
    if (!event.target?.closest?.('.bulk-select-pill')) return;
    const previousToken = window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__;
    window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = '__velktrade_bulk_select_no_popup__';
    window.queueMicrotask?.(() => {
      if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_bulk_select_no_popup__') {
        window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = previousToken;
      }
    });
    window.setTimeout(() => {
      if (window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ === '__velktrade_bulk_select_no_popup__') {
        window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = previousToken;
      }
    }, 0);
  }

  window.addEventListener('pointerdown', guard, true);
  window.addEventListener('mousedown', guard, true);
  window.addEventListener('click', guard, true);
}

function saveDashboardScreenClicks() {
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button.dashboard-tile, .dashboard-menu button');
    if (!button) return;
    const label = cleanText(button.textContent);
    const screen = SCREEN_LABELS.get(label);
    if (screen) {
      window.localStorage.setItem(LAST_SCREEN_KEY, screen);
      window.sessionStorage.removeItem(RESTORE_DONE_KEY);
    }
  }, true);
}

function restoreLastDashboardScreen() {
  if (isDeepLinked()) return;
  if (window.sessionStorage.getItem(RESTORE_DONE_KEY) === 'true') return;

  const wanted = window.localStorage.getItem(LAST_SCREEN_KEY);
  if (!wanted || wanted === 'dashboard') return;

  const wantedLabel = Array.from(SCREEN_LABELS.entries()).find(([, value]) => value === wanted)?.[0];
  if (!wantedLabel) return;

  const started = Date.now();
  const timer = window.setInterval(() => {
    if (Date.now() - started > 8000) {
      window.clearInterval(timer);
      return;
    }

    const buttons = Array.from(document.querySelectorAll('button.dashboard-tile, .dashboard-menu button'));
    const target = buttons.find(button => cleanText(button.textContent) === wantedLabel);
    if (!target) return;

    window.sessionStorage.setItem(RESTORE_DONE_KEY, 'true');
    window.clearInterval(timer);
    target.click();
  }, 150);
}

function install() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VELKTRADE_SELECT_AND_SCREEN_PERSISTENCE__) return;
  window.__VELKTRADE_SELECT_AND_SCREEN_PERSISTENCE__ = true;
  protectBulkSelectFromGlobalPopup();
  saveDashboardScreenClicks();
  restoreLastDashboardScreen();
}

install();
