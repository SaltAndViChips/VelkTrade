import { API_URL, getToken } from './api';
import { velkToast } from './velktrade-feature-foundation.js';

const PANEL_ID = 'velktrade-admin-economy-testview-panel';
const STYLE_CLASS = 'velktrade-admin-enhanced-tabs-ready';

function txt(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return fallback; }
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ic(value) {
  return `${Math.round(number(value)).toLocaleString()} IC`;
}

function arrays(data, keys) {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

async function request(path) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Request failed ${response.status}`);
  return response.json().catch(() => ({}));
}

async function firstGood(paths) {
  let lastError;
  for (const path of paths) {
    try { return await request(path); } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Request failed');
}

function createTabButton(label, mode) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = 'velktrade-admin-extra-tab';
  button.dataset.adminExtraMode = mode;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openPanel(mode);
  });
  return button;
}

function adminPanelRoot() {
  return document.querySelector('.rewritten-admin-panel,.admin-panel');
}

function installAdminTabs() {
  const root = adminPanelRoot();
  if (!root || root.classList.contains(STYLE_CLASS)) return;
  const tabs = root.querySelector('.admin-themed-tabs');
  if (!tabs) return;
  root.classList.add(STYLE_CLASS);
  tabs.appendChild(createTabButton('Economy', 'economy'));
  tabs.appendChild(createTabButton('Test View', 'testview'));
}

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'velktrade-admin-economy-panel card';
  const root = adminPanelRoot();
  if (root) root.appendChild(panel);
  else document.body.appendChild(panel);
  return panel;
}

function setLoading(panel, title) {
  panel.innerHTML = `<div class="panel-title-row"><div><h2>${title}</h2><p class="muted">Loading...</p></div><button type="button" class="ghost" data-admin-extra-close>Close</button></div>`;
  panel.querySelector('[data-admin-extra-close]')?.addEventListener('click', () => panel.remove());
}

function itemPrice(item) {
  return number(item.priceAmount ?? item.price_amount ?? item.price ?? item.icPrice ?? item.ic_price);
}

function itemOwner(item) {
  return txt(item.ownerUsername ?? item.owner_username ?? item.username ?? item.sellerUsername ?? item.seller_username, 'Unknown');
}

function itemTitle(item) {
  return txt(item.title ?? item.itemTitle ?? item.item_title ?? item.name, 'Untitled item');
}

async function loadEconomyData() {
  const [usersData, bazaarData, auctionsActive, auctionsRecent, tradesData] = await Promise.allSettled([
    firstGood(['/api/admin/users', '/api/admin/users/list']),
    firstGood(['/api/bazaar?sort=newest', '/api/bazaar']),
    firstGood(['/api/bazaar/auctions?status=active']),
    firstGood(['/api/bazaar/auctions?status=recent']),
    firstGood(['/api/admin/trades', '/api/trades'])
  ]);

  const users = usersData.status === 'fulfilled' ? arrays(usersData.value, ['users', 'data']) : [];
  const items = bazaarData.status === 'fulfilled' ? arrays(bazaarData.value, ['items', 'listings', 'bazaarItems']) : [];
  const activeAuctions = auctionsActive.status === 'fulfilled' ? arrays(auctionsActive.value, ['auctions']) : [];
  const recentAuctions = auctionsRecent.status === 'fulfilled' ? arrays(auctionsRecent.value, ['auctions']) : [];
  const trades = tradesData.status === 'fulfilled' ? arrays(tradesData.value, ['trades', 'data']) : [];

  return { users, items, activeAuctions, recentAuctions, trades };
}

function renderEconomy(panel, data) {
  const listedValue = data.items.reduce((sum, item) => sum + itemPrice(item), 0);
  const pricedItems = data.items.filter(item => itemPrice(item) > 0);
  const avgPrice = pricedItems.length ? listedValue / pricedItems.length : 0;
  const verifiedListings = data.items.filter(item => item.ownerVerified || item.owner_verified || item.sellerVerified || item.seller_verified).length;
  const completedTrades = data.trades.filter(trade => String(trade.status || '').toLowerCase() === 'completed').length;
  const activeAuctionValue = data.activeAuctions.reduce((sum, auction) => sum + number(auction.currentBid ?? auction.current_bid ?? auction.startingBid ?? auction.starting_bid), 0);
  const topListings = [...data.items].sort((a, b) => itemPrice(b) - itemPrice(a)).slice(0, 8);
  const bySeller = new Map();
  for (const item of data.items) {
    const seller = itemOwner(item);
    const row = bySeller.get(seller) || { seller, count: 0, value: 0 };
    row.count += 1;
    row.value += itemPrice(item);
    bySeller.set(seller, row);
  }
  const sellers = Array.from(bySeller.values()).sort((a, b) => b.value - a.value).slice(0, 8);

  panel.innerHTML = `
    <div class="panel-title-row">
      <div><h2>Economy Dashboard</h2><p class="muted">Admin market overview from Bazaar, auctions, users, and trades.</p></div>
      <div class="inline-controls"><button type="button" data-refresh>Refresh</button><button type="button" class="ghost" data-admin-extra-close>Close</button></div>
    </div>
    <div class="economy-stat-grid">
      <span><strong>${data.users.length.toLocaleString()}</strong><em>Users</em></span>
      <span><strong>${data.items.length.toLocaleString()}</strong><em>Bazaar Listings</em></span>
      <span><strong>${ic(listedValue)}</strong><em>Listed Value</em></span>
      <span><strong>${ic(avgPrice)}</strong><em>Average Price</em></span>
      <span><strong>${verifiedListings.toLocaleString()}</strong><em>Verified Listings</em></span>
      <span><strong>${data.activeAuctions.length.toLocaleString()}</strong><em>Active Auctions</em></span>
      <span><strong>${ic(activeAuctionValue)}</strong><em>Active Auction Value</em></span>
      <span><strong>${completedTrades.toLocaleString()}</strong><em>Completed Trades</em></span>
    </div>
    <div class="economy-columns">
      <section><h3>Top Listings</h3>${topListings.length ? topListings.map(item => `<article><strong>${itemTitle(item)}</strong><span>${itemOwner(item)}</span><em>${ic(itemPrice(item))}</em></article>`).join('') : '<p class="muted">No priced listings.</p>'}</section>
      <section><h3>Top Sellers By Listed Value</h3>${sellers.length ? sellers.map(row => `<article><strong>${row.seller}</strong><span>${row.count} listing${row.count === 1 ? '' : 's'}</span><em>${ic(row.value)}</em></article>`).join('') : '<p class="muted">No sellers found.</p>'}</section>
      <section><h3>Recent Auction Results</h3>${data.recentAuctions.length ? data.recentAuctions.slice(0, 8).map(auction => `<article><strong>${txt(auction.title, 'Auction')}</strong><span>${txt(auction.status, 'updated').replace(/_/g, ' ')}</span><em>${ic(auction.currentBid ?? auction.current_bid ?? auction.winningBid)}</em></article>`).join('') : '<p class="muted">No recent auction results.</p>'}</section>
    </div>
  `;
  panel.querySelector('[data-admin-extra-close]')?.addEventListener('click', () => panel.remove());
  panel.querySelector('[data-refresh]')?.addEventListener('click', () => openPanel('economy'));
}

async function renderTestView(panel) {
  setLoading(panel, 'Test Account View');
  const data = await firstGood(['/api/admin/users', '/api/admin/users/list']);
  const users = arrays(data, ['users', 'data']).filter(user => txt(user.username).toLowerCase() !== 'salt');
  panel.innerHTML = `
    <div class="panel-title-row"><div><h2>Test Account View</h2><p class="muted">Preview player-facing screens as a selected account. This does not log you in as them; it opens their public/profile views and stores a local test-view target.</p></div><button type="button" class="ghost" data-admin-extra-close>Close</button></div>
    <div class="test-view-controls">
      <label><span>Test account</span><select data-test-user>${users.map(user => `<option value="${txt(user.username)}">#${txt(user.id, '?')} ${txt(user.username, 'Unknown')}</option>`).join('')}</select></label>
      <button type="button" data-view-profile>Open Profile</button>
      <button type="button" data-view-dashboard>Mark As Test View Target</button>
      <button type="button" class="ghost" data-clear-test>Clear Test View</button>
    </div>
    <p class="muted">Use this to check how folders, Bazaar, profile inventory, verified badge, and public player data appear for a normal account.</p>
  `;
  panel.querySelector('[data-admin-extra-close]')?.addEventListener('click', () => panel.remove());
  panel.querySelector('[data-view-profile]')?.addEventListener('click', () => {
    const username = panel.querySelector('[data-test-user]')?.value;
    if (!username) return;
    const base = import.meta.env.BASE_URL || '/';
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    window.history.pushState({}, '', `${cleanBase}/user/${encodeURIComponent(username)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  panel.querySelector('[data-view-dashboard]')?.addEventListener('click', () => {
    const username = panel.querySelector('[data-test-user]')?.value;
    if (!username) return;
    window.localStorage.setItem('velktrade:admin-test-view-user', username);
    velkToast(`Test view target set to ${username}.`, 'success');
  });
  panel.querySelector('[data-clear-test]')?.addEventListener('click', () => {
    window.localStorage.removeItem('velktrade:admin-test-view-user');
    velkToast('Test view cleared.', 'success');
  });
}

async function openPanel(mode) {
  const panel = ensurePanel();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (mode === 'economy') {
    setLoading(panel, 'Economy Dashboard');
    try { renderEconomy(panel, await loadEconomyData()); } catch (error) { panel.innerHTML = `<p class="error">${error.message || 'Could not load economy dashboard.'}</p>`; }
    return;
  }
  try { await renderTestView(panel); } catch (error) { panel.innerHTML = `<p class="error">${error.message || 'Could not load test view.'}</p>`; }
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_ADMIN_ECONOMY_TESTVIEW__) return;
  window.__VELKTRADE_ADMIN_ECONOMY_TESTVIEW__ = true;
  const observer = new MutationObserver(installAdminTabs);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setInterval(installAdminTabs, 1000);
  window.setTimeout(installAdminTabs, 400);
}

install();
