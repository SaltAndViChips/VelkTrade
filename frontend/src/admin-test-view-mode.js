import { api } from './api';
import { velkToast } from './velktrade-feature-foundation.js';

const STORAGE_KEY = 'velktrade:admin-test-view-active:v1';
const SIDEBAR_KEY = 'velktrade:sidebar-activity-notifications:v1';
const BANNER_ID = 'velktrade-test-view-banner';
const NOTIFICATION_ID = 'admin-test-view-active';

function readView() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function writeView(value) {
  if (!value) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('velktrade:admin-test-view-changed', { detail: value || {} }));
}

function readSidebarNotifications() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeSidebarNotifications(notifications) {
  try { window.localStorage.setItem(SIDEBAR_KEY, JSON.stringify(notifications.slice(0, 80))); } catch {}
}

function testViewLabel(view) {
  return view?.user?.username || view?.stateLabel || view?.state || 'Test User';
}

function syncSidebarNotification() {
  const view = readView();
  const existing = readSidebarNotifications().filter(note => note.id !== NOTIFICATION_ID);
  if (!view) {
    writeSidebarNotifications(existing);
    window.dispatchEvent(new CustomEvent('velktrade:activity-notification-sync'));
    return;
  }
  const label = testViewLabel(view);
  const note = {
    id: NOTIFICATION_ID,
    type: 'admin_test_view',
    title: 'Admin Test View Active',
    message: `You are viewing as ${label}. EXIT`,
    createdAt: view.startedAt || new Date().toISOString(),
    read: false,
    seen: false,
    localOnly: true,
    payload: { testView: true, label }
  };
  writeSidebarNotifications([note, ...existing]);
  window.dispatchEvent(new CustomEvent('velktrade:activity-notification-sync'));
}

function renderBanner() {
  let banner = document.getElementById(BANNER_ID);
  const view = readView();
  if (!view) {
    banner?.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = BANNER_ID;
    document.body.appendChild(banner);
  }
  const label = testViewLabel(view);
  banner.innerHTML = `<strong>You are viewing as ${label}</strong><button type="button">EXIT</button>`;
  banner.querySelector('button')?.addEventListener('click', exitTestView);
}

async function startTestView(detail = {}) {
  try {
    let response = null;
    try {
      response = await api('/api/admin/impersonation/start', { method: 'POST', body: JSON.stringify(detail) });
    } catch {}
    const impersonation = response?.impersonation || {
      mode: detail.username ? 'user' : 'state',
      state: detail.state || null,
      user: {
        username: detail.username || detail.label || detail.state || 'Test User',
        isVerified: detail.state === 'verified' || detail.state === 'admin' || detail.state === 'developer',
        isAdmin: detail.state === 'admin' || detail.state === 'developer',
        isDeveloper: detail.state === 'developer',
        registered: detail.state !== 'not-registered'
      },
      startedAt: new Date().toISOString()
    };
    writeView(impersonation);
    syncSidebarNotification();
    renderBanner();
    velkToast(`Viewing as ${testViewLabel(impersonation)}.`, 'success');
  } catch (error) {
    velkToast(error.message || 'Could not start test view.', 'error');
  }
}

async function exitTestView() {
  try { await api('/api/admin/impersonation/stop', { method: 'POST' }); } catch {}
  writeView(null);
  syncSidebarNotification();
  renderBanner();
  velkToast('Exited test view.', 'success');
}

function installButtons() {
  document.querySelectorAll('[data-admin-test-state]').forEach(button => {
    if (button.dataset.boundTestView === 'true') return;
    button.dataset.boundTestView = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      startTestView({ state: button.dataset.adminTestState, label: button.textContent.trim() });
    });
  });
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_ADMIN_TEST_VIEW_MODE__) return;
  window.__VELKTRADE_ADMIN_TEST_VIEW_MODE__ = true;
  window.velkStartAdminTestView = startTestView;
  window.velkExitAdminTestView = exitTestView;
  window.addEventListener('velktrade:admin-test-view-start', event => startTestView(event.detail || {}));
  window.addEventListener('velktrade:admin-test-view-exit', exitTestView);
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { syncSidebarNotification(); renderBanner(); } });
  const observer = new MutationObserver(() => { installButtons(); renderBanner(); });
  observer.observe(document.body, { childList: true, subtree: true });
  syncSidebarNotification();
  renderBanner();
  installButtons();
}

install();
