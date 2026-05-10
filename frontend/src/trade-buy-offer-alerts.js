import { API_URL, getToken } from './api';
import { velkToast } from './velktrade-feature-foundation.js';

const SIDEBAR_KEY = 'velktrade:sidebar-activity-notifications:v1';
const SEEN_KEY = 'velktrade:trade-buy-offer-alert-seen:v1';
const COUNT_KEY = 'velktrade:open-trade-buy-offer-count:v1';
const PREFS_KEY = 'velktrade:notification-preferences:v2';
const POLL_MS = 22000;
const MAX_NOTIFICATIONS = 80;

function readJson(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
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
  return parsed > 0 ? `${parsed.toLocaleString()} IC` : text(value, 'IC offer');
}

function prefs() {
  return {
    toastNotifications: true,
    sidebarNotifications: true,
    soundVolume: 0.55,
    buyOffers: true,
    offlineTrades: true,
    counters: true,
    ...readJson(PREFS_KEY, {})
  };
}

async function request(path) {
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

async function firstGood(paths) {
  for (const path of paths) {
    try { return await request(path); } catch {}
  }
  return null;
}

function arrayFrom(data, keys) {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function normalizeBuyOffer(raw) {
  const id = raw?.id ?? raw?.offerId ?? raw?.requestId;
  const title = text(raw?.itemTitle ?? raw?.item_title ?? raw?.title ?? raw?.item?.title, 'an item');
  const buyer = text(raw?.requesterUsername ?? raw?.requester_username ?? raw?.buyerUsername ?? raw?.buyer_username ?? raw?.fromUsername ?? raw?.username, 'A player');
  const status = text(raw?.status, 'pending').toLowerCase();
  const amount = ic(raw?.offeredIc ?? raw?.offered_ic ?? raw?.offerIc ?? raw?.offer_ic ?? raw?.amount ?? raw?.price ?? raw?.itemPrice);
  return {
    id: `buy-offer:${id || `${buyer}:${title}:${amount}`}`,
    type: 'buy_offer',
    title: 'New buy offer',
    message: `${buyer} offered ${amount} for ${title}.`,
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    read: false,
    seen: false,
    status,
    localOnly: true,
    payload: { buyOfferId: id, itemTitle: title, buyer, amount }
  };
}

function normalizeTrade(raw) {
  const id = raw?.id ?? raw?.tradeId;
  const status = text(raw?.status, 'pending').toLowerCase();
  const from = text(raw?.fromUsername ?? raw?.from_username ?? raw?.senderUsername ?? raw?.sender_username, 'A player');
  return {
    id: `trade:${id || `${from}:${status}:${raw?.createdAt || raw?.created_at || ''}`}`,
    type: status === 'countered' ? 'counter_offer' : 'offline_trade',
    title: status === 'countered' ? 'Trade counter received' : 'Trade request received',
    message: `${from} has a ${status} trade request for you.`,
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    read: false,
    seen: false,
    status,
    localOnly: true,
    payload: { tradeId: id, status, from }
  };
}

function mergeNotification(notification) {
  const existing = readJson(SIDEBAR_KEY, []);
  if (existing.some(item => String(item.id) === String(notification.id))) return false;
  writeJson(SIDEBAR_KEY, [notification, ...existing].slice(0, MAX_NOTIFICATIONS));
  window.dispatchEvent(new CustomEvent('velktrade:activity-notification-sync'));
  return true;
}

let audioContext = null;
function playSound() {
  const p = prefs();
  const volume = Number(p.soundVolume ?? 0.55);
  if (volume <= 0) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, Math.min(volume, 1)) * 0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    const osc = audioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.setValueAtTime(980, now + 0.09);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {}
}

function notify(notification, category) {
  const p = prefs();
  if (category === 'buyOffers' && p.buyOffers === false) return;
  if (category === 'offlineTrades' && p.offlineTrades === false) return;
  if (category === 'counters' && p.counters === false) return;

  const merged = p.sidebarNotifications !== false ? mergeNotification(notification) : false;
  if (p.toastNotifications !== false) velkToast(notification.message, 'info', 6500);
  if (merged) playSound();
  window.dispatchEvent(new CustomEvent('velktrade:activity-notification', {
    detail: {
      key: notification.id,
      kind: notification.type === 'buy_offer' ? 'trade' : 'trade',
      title: notification.title,
      message: notification.message,
      variant: 'info',
      payload: notification.payload,
      createdAt: notification.createdAt
    }
  }));
}

function setOpenCount(count) {
  const next = Math.max(0, Number(count) || 0);
  const previous = Number(window.localStorage.getItem(COUNT_KEY) || 0);
  window.localStorage.setItem(COUNT_KEY, String(next));
  if (previous !== next) window.dispatchEvent(new CustomEvent('velktrade:open-trade-count-changed', { detail: { count: next } }));
}

async function poll() {
  if (!getToken()) return;
  const seen = new Set(readJson(SEEN_KEY, []));

  const [buyData, tradeData] = await Promise.all([
    firstGood(['/api/buy-offers/inbox', '/api/me/buy-offers', '/api/trades/buy-offers/inbox']),
    firstGood(['/api/trades/inbox', '/api/trades', '/api/offers/inbox'])
  ]);

  const buyOffers = arrayFrom(buyData, ['offers', 'buyOffers', 'buyRequests', 'requests', 'items'])
    .map(normalizeBuyOffer)
    .filter(offer => ['pending', 'countered'].includes(offer.status));

  const trades = arrayFrom(tradeData, ['trades', 'offers', 'requests', 'items'])
    .map(normalizeTrade)
    .filter(trade => ['pending', 'countered', 'accepted'].includes(trade.status));

  setOpenCount(buyOffers.length + trades.length);

  const freshSeen = new Set(seen);
  for (const offer of buyOffers) {
    if (freshSeen.has(offer.id)) continue;
    freshSeen.add(offer.id);
    notify(offer, 'buyOffers');
  }
  for (const trade of trades) {
    if (freshSeen.has(trade.id)) continue;
    freshSeen.add(trade.id);
    notify(trade, trade.type === 'counter_offer' ? 'counters' : 'offlineTrades');
  }
  writeJson(SEEN_KEY, Array.from(freshSeen).slice(-300));
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_TRADE_BUY_OFFER_ALERTS__) return;
  window.__VELKTRADE_TRADE_BUY_OFFER_ALERTS__ = true;
  window.addEventListener('focus', () => window.setTimeout(poll, 800));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.setTimeout(poll, 800); });
  window.setInterval(poll, POLL_MS);
  window.setTimeout(poll, 1800);
  window.setTimeout(poll, 6500);
}

install();
