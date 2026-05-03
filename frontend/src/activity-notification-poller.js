import { API_URL, getToken } from './api';
import { velkToast } from './velktrade-feature-foundation.js';

const STORAGE_KEY = 'velktrade:activity-notification-state:v1';
const POLL_MS = 25000;
const MAX_SEEN = 240;

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      initialized: Boolean(parsed.initialized),
      seen: Array.isArray(parsed.seen) ? parsed.seen.slice(0, MAX_SEEN) : []
    };
  } catch {
    return { initialized: false, seen: [] };
  }
}

function writeState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ initialized: Boolean(state.initialized), seen: state.seen.slice(0, MAX_SEEN) }));
  } catch {}
}

function stable(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return ''; }
}

function txt(value, fallback = '') {
  const out = stable(value).replace(/^"|"$/g, '').trim();
  return out || fallback;
}

function num(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  const parsed = num(value, 0);
  return parsed > 0 ? `${parsed.toLocaleString()} IC` : txt(value, 'IC offer');
}

function keyOf(prefix, value, fallback = '') {
  return `${prefix}:${txt(value?.id ?? value?.offerId ?? value?.tradeId ?? value?.auctionId ?? value?.roomId ?? value?.code ?? fallback)}`;
}

function isEndedAuctionStatus(status) {
  return ['completed', 'bought_out', 'no_winner', 'ended'].includes(txt(status).toLowerCase());
}

async function request(path) {
  const token = getToken();
  if (!token) throw new Error('Not logged in');
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return {};
  return response.json().catch(() => ({}));
}

async function firstGood(paths) {
  for (const path of paths) {
    try { return await request(path); } catch {}
  }
  return null;
}

function arrays(value, keys) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value[key])) return value[key];
  return [];
}

function isVerifiedActivity(value) {
  return Boolean(
    value?.ownerVerified || value?.owner_verified || value?.sellerVerified || value?.seller_verified ||
    value?.requesterVerified || value?.requester_verified || value?.buyerVerified || value?.buyer_verified ||
    value?.fromVerified || value?.from_verified || value?.userVerified || value?.user_verified ||
    value?.isVerified || value?.is_verified || value?.verified
  );
}

function normalizeBuyOffers(data) {
  return arrays(data, ['offers', 'buyOffers', 'inbox', 'items', 'requests']).map(offer => {
    const title = txt(offer.title ?? offer.itemTitle ?? offer.item_title ?? offer.item?.title, 'an item');
    const buyer = txt(offer.buyerUsername ?? offer.buyer_username ?? offer.requesterUsername ?? offer.requester_username ?? offer.fromUsername ?? offer.username, 'A player');
    const price = money(offer.offeredIc ?? offer.offered_ic ?? offer.offerIc ?? offer.offer_ic ?? offer.amount ?? offer.price);
    return {
      key: keyOf('buy-offer', offer, `${buyer}:${title}:${price}`),
      kind: 'trade',
      title: 'New buy offer',
      message: `${buyer} offered ${price} for ${title}.`,
      variant: 'success',
      verifiedOnly: false
    };
  });
}

function normalizeTrades(data) {
  return arrays(data, ['trades', 'offers', 'requests', 'items']).filter(trade => {
    const status = txt(trade.status).toLowerCase();
    return !status || ['pending', 'incoming', 'countered', 'accepted'].includes(status);
  }).map(trade => {
    const from = txt(trade.fromUsername ?? trade.from_username ?? trade.senderUsername ?? trade.sender_username ?? trade.username, 'A player');
    const status = txt(trade.status, 'pending');
    return {
      key: keyOf('trade', trade, `${from}:${status}:${trade.createdAt || trade.created_at || ''}`),
      kind: 'trade',
      title: status.toLowerCase() === 'countered' ? 'Trade counter received' : 'Trade request activity',
      message: `${from} has a ${status} trade request for you.`,
      variant: 'info',
      verifiedOnly: false
    };
  });
}

function normalizeInvites(data) {
  return arrays(data, ['invites', 'invitations', 'roomInvites', 'rooms']).filter(invite => {
    const status = txt(invite.status).toLowerCase();
    return !status || ['pending', 'active', 'open'].includes(status);
  }).map(invite => {
    const from = txt(invite.fromUsername ?? invite.from_username ?? invite.inviterUsername ?? invite.inviter_username ?? invite.username, 'A player');
    const code = txt(invite.roomCode ?? invite.room_code ?? invite.code ?? invite.roomId ?? invite.room_id, 'a room');
    return {
      key: keyOf('invite', invite, `${from}:${code}`),
      kind: 'invite',
      title: 'Room invitation',
      message: `${from} invited you to room ${code}.`,
      variant: 'info',
      verifiedOnly: false
    };
  });
}

function normalizeAuctions(data) {
  return arrays(data, ['auctions']).filter(auction => {
    const ended = isEndedAuctionStatus(auction.status);
    // Do not treat being the current top bidder on an active auction as "won".
    // Only ended/completed auctions create winner alerts. Sellers still get active
    // auction activity when bids change because the key includes the current bid.
    return ended || auction.viewerIsSeller;
  }).map(auction => {
    const title = txt(auction.title, 'an auction item');
    const status = txt(auction.status, 'updated').replace(/_/g, ' ');
    const winner = txt(auction.winnerUsername || auction.winner_username, 'No winner');
    const amount = money(auction.currentBid ?? auction.current_bid ?? auction.winningBid ?? auction.winning_bid);
    const ended = isEndedAuctionStatus(auction.status);
    const notificationTitle = ended && auction.viewerIsWinner ? 'Auction won' : auction.viewerIsSeller ? 'Your auction activity' : 'Auction activity';
    const message = ended
      ? `${title} was ${status}. Winner: ${winner}. Final bid: ${amount}.`
      : `${title} has auction activity. Current bid: ${amount}.`;
    return {
      key: `auction:${auction.id}:${auction.status}:${auction.winnerId || auction.winner_id || ''}:${auction.currentBid || auction.current_bid || ''}`,
      kind: 'auction',
      title: notificationTitle,
      message,
      variant: ended ? 'success' : 'info',
      verifiedOnly: false
    };
  });
}

function normalizeBazaarVerified(data) {
  return arrays(data, ['items', 'listings', 'bazaarItems']).filter(item => isVerifiedActivity(item)).map(item => {
    const title = txt(item.title ?? item.itemTitle ?? item.item_title, 'an item');
    const seller = txt(item.ownerUsername ?? item.owner_username ?? item.sellerUsername ?? item.seller_username, 'A verified user');
    const price = txt(item.price) ? ` for ${txt(item.price)}` : '';
    return {
      key: keyOf('verified-bazaar', item, `${seller}:${title}:${item.price || ''}`),
      kind: 'bazaar',
      title: 'Verified Bazaar listing',
      message: `${seller} listed ${title}${price}.`,
      variant: 'info',
      verifiedOnly: true
    };
  });
}

async function collectActivities() {
  const [buyOffers, trades, invites, recentAuctions, activeAuctions, bazaar] = await Promise.all([
    firstGood(['/api/buy-offers/inbox', '/api/me/buy-offers', '/api/trades/buy-offers/inbox']),
    firstGood(['/api/trades/inbox', '/api/trades', '/api/offers/inbox']),
    firstGood(['/api/room-invites', '/api/invitations', '/api/rooms/invites', '/api/me/invitations']),
    firstGood(['/api/bazaar/auctions?status=recent']),
    firstGood(['/api/bazaar/auctions?status=active']),
    firstGood(['/api/bazaar?verified=verified&sort=newest'])
  ]);

  return [
    ...normalizeBuyOffers(buyOffers),
    ...normalizeTrades(trades),
    ...normalizeInvites(invites),
    ...normalizeAuctions(recentAuctions),
    ...normalizeAuctions(activeAuctions),
    ...normalizeBazaarVerified(bazaar)
  ];
}

function pushNotification(activity) {
  velkToast(activity.message, activity.variant || 'info', 6500);
  window.dispatchEvent(new CustomEvent('velktrade:activity-notification', { detail: activity }));
  try {
    if (window.Notification && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(activity.title || 'VelkTrade', { body: activity.message, tag: activity.key });
    }
  } catch {}
}

async function poll() {
  if (typeof window === 'undefined' || !getToken()) return;
  const state = readState();
  const seen = new Set(state.seen);
  let activities = [];
  try { activities = await collectActivities(); } catch { return; }

  const unique = [];
  const keys = new Set();
  for (const activity of activities) {
    if (!activity.key || keys.has(activity.key)) continue;
    keys.add(activity.key);
    unique.push(activity);
  }

  if (!state.initialized) {
    writeState({ initialized: true, seen: unique.map(item => item.key).slice(0, MAX_SEEN) });
    return;
  }

  const fresh = unique.filter(item => !seen.has(item.key));
  fresh.slice(0, 6).forEach(pushNotification);
  writeState({ initialized: true, seen: [...fresh.map(item => item.key), ...state.seen].slice(0, MAX_SEEN) });
}

function installActivityNotifications() {
  if (typeof window === 'undefined' || window.__VELKTRADE_ACTIVITY_NOTIFICATIONS__) return;
  window.__VELKTRADE_ACTIVITY_NOTIFICATIONS__ = true;

  window.addEventListener('velktrade:auction-changed', () => window.setTimeout(poll, 900));
  window.addEventListener('velktrade:item-removed', () => window.setTimeout(poll, 900));
  window.addEventListener('focus', () => window.setTimeout(poll, 1200));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.setTimeout(poll, 1200); });
  window.setInterval(poll, POLL_MS);
  window.setTimeout(poll, 2500);
  window.setTimeout(poll, 9000);
}

installActivityNotifications();
