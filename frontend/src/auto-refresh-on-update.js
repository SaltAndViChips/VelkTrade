import { BUILD_INFO } from './build-info.js';

const VERSION_URL = `${import.meta.env.BASE_URL || '/'}version.json`;
const CHECK_INTERVAL_MS = 60_000;
const FIRST_CHECK_DELAY_MS = 8_000;
const STORAGE_KEY = 'velktrade-last-seen-build-id';
const RELOAD_FLAG_KEY = 'velktrade-auto-reload-build-id';

function currentBuildId() {
  return String(BUILD_INFO?.buildId || BUILD_INFO?.commit || '').trim();
}

function shouldSkip() {
  if (typeof window === 'undefined') return true;
  if (import.meta.env.DEV) return true;
  return false;
}

function cacheBustedUrl() {
  const separator = VERSION_URL.includes('?') ? '&' : '?';
  return `${VERSION_URL}${separator}t=${Date.now()}`;
}

function showReloadNotice(nextBuildId) {
  let notice = document.getElementById('velktrade-update-reload-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'velktrade-update-reload-notice';
    notice.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:2147483647',
      'padding:12px 14px',
      'border-radius:14px',
      'background:rgba(8,6,14,.94)',
      'color:#00fa9a',
      'font:700 13px system-ui,-apple-system,Segoe UI,sans-serif',
      'border:1px solid rgba(0,250,154,.45)',
      'box-shadow:0 14px 42px rgba(0,0,0,.45)',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(notice);
  }
  notice.textContent = `VelkTrade updated. Reloading ${nextBuildId ? `(${nextBuildId})` : ''}…`;
}

async function checkForUpdate({ force = false } = {}) {
  if (shouldSkip()) return;
  const current = currentBuildId();
  if (!current) return;

  try {
    const response = await fetch(cacheBustedUrl(), {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) return;
    const latest = await response.json();
    const latestBuildId = String(latest?.buildId || latest?.commit || '').trim();
    if (!latestBuildId) return;

    const lastSeen = window.localStorage.getItem(STORAGE_KEY);
    if (!lastSeen) window.localStorage.setItem(STORAGE_KEY, current);

    if (latestBuildId !== current) {
      const lastReloadAttempt = window.sessionStorage.getItem(RELOAD_FLAG_KEY);
      if (lastReloadAttempt === latestBuildId && !force) return;
      window.sessionStorage.setItem(RELOAD_FLAG_KEY, latestBuildId);
      window.localStorage.setItem(STORAGE_KEY, latestBuildId);
      showReloadNotice(latestBuildId);
      window.setTimeout(() => window.location.reload(), 900);
    }
  } catch {
    // Ignore transient network/cache failures.
  }
}

export function installAutoRefreshOnUpdate() {
  if (shouldSkip()) return;
  if (window.__VELKTRADE_AUTO_REFRESH_INSTALLED__) return;
  window.__VELKTRADE_AUTO_REFRESH_INSTALLED__ = true;

  const current = currentBuildId();
  if (current) window.localStorage.setItem(STORAGE_KEY, current);

  window.setTimeout(() => checkForUpdate(), FIRST_CHECK_DELAY_MS);
  window.setInterval(() => checkForUpdate(), CHECK_INTERVAL_MS);
  window.addEventListener('focus', () => checkForUpdate({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate({ force: true });
  });
}

installAutoRefreshOnUpdate();
