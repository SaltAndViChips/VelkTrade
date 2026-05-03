import { API_URL, getToken } from './api';

const STORAGE_KEY = 'velktrade:persistent-auction-alerts:v1';
const POLL_MS = 30000;
const MAX_ALERTS = 30;

function readAlerts() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, MAX_ALERTS).filter(alert => !isActiveTopBidAlert(alert)) : [];
  } catch {
    return [];
  }
}

function writeAlerts(alerts) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS).filter(alert => !isActiveTopBidAlert(alert))));
  } catch {}
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim() || fallback;
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ic(value) {
  const parsed = number(value);
  return parsed > 0 ? `${parsed.toLocaleString()} IC` : '0 IC';
}

function endedStatus(status) {
  return ['completed', 'bought_out', 'ended', 'no_winner'].includes(text(status).toLowerCase());
}

function isActiveTopBidAlert(alert) {
  const title = text(alert?.title).toLowerCase();
  const key = text(alert?.key).toLowerCase();
  const message = text(alert?.message).toLowerCase();
  return (title.includes('won') || message.includes('you won') || message.includes('auction you won')) && key.includes(':active:');
}

async function apiGet(path) {
  const token = getToken();
  if (!token) throw new Error('No token');
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error(`Request failed ${response.status}`);
  return response.json().catch(() => ({}));
}

function isImportantAuction(auction) {
  const ended = endedStatus(auction.status);
  // Being the current top bidder on an active auction is not a win notification.
  return ended || auction.viewerIsSeller;
}

function alertFromAuction(auction) {
  const status = text(auction.status, 'updated').replace(/_/g, ' ');
  const title = text(auction.title, 'Auction item');
  const winner = text(auction.winnerUsername, 'No winner');
  const amount = ic(auction.currentBid ?? auction.winningBid ?? auction.startingBid);
  const ended = endedStatus(auction.status);
  const role = ended && auction.viewerIsWinner ? 'Auction won' : auction.viewerIsSeller ? 'Your auction' : 'Auction update';
  return {
    key: `auction:${auction.id}:${auction.status}:${auction.winnerId || ''}:${auction.currentBid || auction.winningBid || ''}`,
    type: 'auction',
    title: role,
    message: ended ? `${title} was ${status}. Winner: ${winner}. Final bid: ${amount}.` : `${title} has auction activity. Current bid: ${amount}.`,
    createdAt: new Date().toISOString(),
    href: 'auction'
  };
}

function mergeAlerts(nextAlerts) {
  const existing = readAlerts();
  const keys = new Set(existing.map(alert => alert.key));
  const fresh = nextAlerts.filter(alert => alert.key && !keys.has(alert.key) && !isActiveTopBidAlert(alert));
  const merged = [...fresh, ...existing].slice(0, MAX_ALERTS);
  if (fresh.length || existing.length !== readAlerts().length) writeAlerts(merged);
  return { merged, fresh };
}

async function pollAuctions() {
  if (!getToken()) return;
  let auctions = [];
  for (const status of ['active', 'recent']) {
    try {
      const data = await apiGet(`/api/bazaar/auctions?status=${status}`);
      if (Array.isArray(data.auctions)) auctions.push(...data.auctions);
    } catch {}
  }
  const alerts = auctions.filter(isImportantAuction).map(alertFromAuction);
  const { fresh } = mergeAlerts(alerts);
  if (fresh.length) renderAlerts();
}

function dismiss(key) {
  writeAlerts(readAlerts().filter(alert => alert.key !== key));
  renderAlerts();
}

function dismissAll() {
  writeAlerts([]);
  renderAlerts();
}

function renderAlerts() {
  if (typeof document === 'undefined') return;
  let root = document.getElementById('velktrade-persistent-auction-alerts');
  const alerts = readAlerts();
  if (!alerts.length) {
    root?.remove();
    return;
  }
  if (!root) {
    root = document.createElement('aside');
    root.id = 'velktrade-persistent-auction-alerts';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="persistent-auction-alerts-header">
      <strong>Auction Alerts</strong>
      <button type="button" data-dismiss-all>Clear</button>
    </div>
    <div class="persistent-auction-alerts-list">
      ${alerts.slice(0, 6).map(alert => `
        <article class="persistent-auction-alert" data-key="${alert.key}">
          <button type="button" class="persistent-auction-alert-close" data-dismiss="${alert.key}">×</button>
          <strong>${alert.title}</strong>
          <p>${alert.message}</p>
          <small>${new Date(alert.createdAt).toLocaleString()}</small>
        </article>
      `).join('')}
    </div>
  `;
  root.querySelector('[data-dismiss-all]')?.addEventListener('click', dismissAll);
  root.querySelectorAll('[data-dismiss]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      dismiss(button.getAttribute('data-dismiss'));
    });
  });
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_PERSISTENT_AUCTION_ALERTS__) return;
  window.__VELKTRADE_PERSISTENT_AUCTION_ALERTS__ = true;
  // Purge old active "won" alerts created by the previous logic.
  writeAlerts(readAlerts());
  window.addEventListener('velktrade:activity-notification', event => {
    const activity = event.detail || {};
    if (activity.kind !== 'auction') return;
    const alert = { key: activity.key, type: 'auction', title: activity.title || 'Auction activity', message: activity.message || 'Auction updated.', createdAt: new Date().toISOString() };
    if (isActiveTopBidAlert(alert)) return;
    mergeAlerts([alert]);
    renderAlerts();
  });
  window.addEventListener('velktrade:auction-changed', () => window.setTimeout(pollAuctions, 900));
  window.addEventListener('focus', () => window.setTimeout(renderAlerts, 300));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderAlerts(); });
  window.setInterval(pollAuctions, POLL_MS);
  window.setTimeout(renderAlerts, 300);
  window.setTimeout(pollAuctions, 4500);
}

install();
