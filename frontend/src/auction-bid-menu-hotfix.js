import { API_URL, getToken } from './api';

const MODAL_ID = 'velktrade-simple-auction-bid-modal';

function txt(value, fallback = '') { if (value === undefined || value === null) return fallback; return String(value); }
function fmt(value) { const number = Number(value); return Number.isFinite(number) ? number.toLocaleString() : '0'; }
function money(value) { return `${fmt(value)} IC`; }
function cleanNumber(value) { return String(value || '').replace(/[^\d]/g, ''); }
function dateTime(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown time'; }
function ended(auction) { return ['completed', 'no_winner', 'bought_out', 'ended'].includes(String(auction?.status || '').toLowerCase()); }
function labelFor(auction) { return auction?.hasBids || Number(auction?.bidCount || 0) > 0 ? 'Current bid' : 'Starting bid'; }
function fixedIncrement(auction) { const increment = Number(auction?.minIncrement ?? auction?.min_increment ?? 0); return Number.isFinite(increment) && increment > 0 ? increment : 0; }
function minimumAllowedBid(auction) { const current = Number(auction?.currentBid || auction?.winningBid || auction?.startingBid || 0); const increment = fixedIncrement(auction); return current + (increment > 0 ? increment : 1); }
function suggestedBid(auction) { const current = Number(auction?.currentBid || auction?.winningBid || auction?.startingBid || 0); const increment = fixedIncrement(auction); if (increment > 0) return current + increment; return Math.max(current + 1, Math.ceil(current * 1.1)); }

async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : { text: await response.text().catch(() => '') };
  const responseError = data.error || (data.message === 'Missing token' ? data.message : '');
  if (!response.ok || responseError) throw new Error(responseError || data.text || `Request failed with status ${response.status}`);
  return data;
}

async function loadAuction(auctionId) {
  for (const status of ['active', 'recent', 'history', 'all']) {
    try {
      const data = await api(`/api/bazaar/auctions?status=${encodeURIComponent(status)}`);
      const found = (data.auctions || []).find(auction => String(auction.id) === String(auctionId));
      if (found) return found;
    } catch {}
  }
  return null;
}

async function loadBids(auctionId) {
  try { const data = await api(`/api/bazaar/auctions/${encodeURIComponent(auctionId)}/bids`); return Array.isArray(data.bids) ? data.bids : []; } catch { return []; }
}

function toast(message, type = 'info') {
  if (window.velkToast) return window.velkToast(message, type);
  window.dispatchEvent(new CustomEvent('velktrade:toast', { detail: { message, type } }));
}

function closeModal() { document.getElementById(MODAL_ID)?.remove(); }

function bidRows(bids) {
  if (!bids.length) return '<p class="muted auction-simple-empty">No bids yet.</p>';
  return `<div class="auction-simple-table-wrap"><table class="auction-simple-bid-table"><thead><tr><th>Bidder</th><th>Price</th><th>Date / Time</th></tr></thead><tbody>${bids.map(bid => `<tr><td>${txt(bid.bidderUsername || bid.username || 'Unknown')}${bid.bidderVerified ? ' <span class="verified-badge mini">✓</span>' : ''}</td><td>${money(bid.amount)}</td><td>${dateTime(bid.createdAt || bid.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
}

function ownerControls(auction, bids) {
  if (!auction.viewerCanManage) return '';
  const uniqueBidders = Array.from(new Map(bids.map(bid => [String(bid.bidderId), bid])).values());
  return `<details class="auction-simple-owner-controls" open><summary>Seller / Admin controls</summary><label><span>Winner</span><select id="auction-simple-winner"><option value="">No winner</option>${uniqueBidders.map(bid => `<option value="${txt(bid.bidderId)}">${txt(bid.bidderUsername || 'Unknown')} — ${money(bid.amount)}</option>`).join('')}</select></label><div class="auction-simple-owner-actions"><button type="button" id="auction-simple-end">End Auction</button><button type="button" id="auction-simple-delete" class="danger">Delete Auction</button></div></details>`;
}

function renderModal(auction, bids) {
  closeModal();
  document.querySelectorAll('.auction-modal-backdrop').forEach(node => node.remove());
  const minimum = minimumAllowedBid(auction);
  const suggested = suggestedBid(auction);
  const increment = fixedIncrement(auction);
  const buyout = Number(auction.buyoutPrice || 0);
  const current = Number(auction.currentBid || auction.winningBid || auction.startingBid || 0);
  const canBid = auction.status === 'active' && !auction.viewerIsSeller;
  const isEnded = ended(auction);
  const root = document.createElement('div');
  root.id = MODAL_ID;
  root.className = 'auction-simple-backdrop';
  root.innerHTML = `<section class="auction-simple-modal" role="dialog" aria-modal="true" aria-label="Auction bid menu"><button type="button" class="auction-simple-close" aria-label="Close">×</button><header class="auction-simple-header"><div><h2>${txt(auction.title || 'Auction Item')}</h2><p class="muted">${labelFor(auction)}: <strong>${money(current)}</strong>${increment > 0 ? ` · Fixed increment: ${money(increment)}` : ' · No fixed increment'}</p></div>${buyout > 0 ? `<span class="auction-simple-buyout-pill">Buyout ${money(buyout)}</span>` : ''}</header><div class="auction-simple-content"><div class="auction-simple-image-frame">${auction.image ? `<img src="${txt(auction.image)}" alt="${txt(auction.title || 'Auction Item')}" />` : '<div class="inventory-mosaic-placeholder">?</div>'}</div><div class="auction-simple-side"><section class="auction-simple-history"><h3>Bid history</h3>${bidRows(bids)}</section>${canBid ? `<section class="auction-simple-actions"><label><span>Your bid</span><input id="auction-simple-bid-input" value="${suggested}" placeholder="${suggested}" inputmode="numeric" /><small>${increment > 0 ? `Minimum allowed: ${money(minimum)}` : `Minimum allowed: ${money(minimum)}. The +10% value is only a suggestion.`}</small></label><button type="button" id="auction-simple-place-bid">Place bid</button>${buyout > 0 ? `<button type="button" id="auction-simple-buyout" class="ghost">Offer buyout</button>` : ''}</section>` : isEnded ? `<section class="auction-simple-ended"><p><strong>Seller:</strong> ${txt(auction.sellerUsername || 'Unknown')}</p><p><strong>Winner:</strong> ${txt(auction.winnerUsername || 'No winner')}</p><p><strong>Winning bid:</strong> ${money(current)}</p></section>` : '<p class="muted">You cannot bid on this auction.</p>'}${ownerControls(auction, bids)}</div></div></section>`;
  root.addEventListener('mousedown', event => { if (event.target === root) closeModal(); });
  root.querySelector('.auction-simple-close')?.addEventListener('click', closeModal);
  root.querySelector('#auction-simple-bid-input')?.addEventListener('input', event => { event.target.value = cleanNumber(event.target.value); });
  root.querySelector('#auction-simple-place-bid')?.addEventListener('click', async () => { const amount = cleanNumber(root.querySelector('#auction-simple-bid-input')?.value || suggested); try { await api(`/api/bazaar/auctions/${encodeURIComponent(auction.id)}/bid`, { method: 'POST', body: JSON.stringify({ amount }) }); toast('Bid placed.', 'success'); await openAuctionById(auction.id); window.dispatchEvent(new CustomEvent('velktrade:auction-changed')); } catch (error) { toast(error.message || 'Could not place bid.', 'error'); } });
  root.querySelector('#auction-simple-buyout')?.addEventListener('click', async () => { if (!window.confirm(`Offer buyout for ${money(buyout)}?`)) return; try { await api(`/api/bazaar/auctions/${encodeURIComponent(auction.id)}/buyout`, { method: 'POST' }); toast('Buyout offered.', 'success'); await openAuctionById(auction.id); window.dispatchEvent(new CustomEvent('velktrade:auction-changed')); } catch (error) { toast(error.message || 'Could not offer buyout.', 'error'); } });
  root.querySelector('#auction-simple-end')?.addEventListener('click', async () => { const winnerId = root.querySelector('#auction-simple-winner')?.value || null; try { await api(`/api/bazaar/auctions/${encodeURIComponent(auction.id)}/end`, { method: 'POST', body: JSON.stringify({ winnerId }) }); toast('Auction ended.', 'success'); closeModal(); window.dispatchEvent(new CustomEvent('velktrade:auction-changed')); } catch (error) { toast(error.message || 'Could not end auction.', 'error'); } });
  root.querySelector('#auction-simple-delete')?.addEventListener('click', async () => { if (!window.confirm(`Delete auction for ${txt(auction.title || 'this item')}?`)) return; try { await api(`/api/bazaar/auctions/${encodeURIComponent(auction.id)}`, { method: 'DELETE' }); toast('Auction deleted.', 'success'); closeModal(); window.dispatchEvent(new CustomEvent('velktrade:auction-changed')); } catch (error) { toast(error.message || 'Could not delete auction.', 'error'); } });
  document.body.appendChild(root);
}

async function openAuctionById(auctionId) { const auction = await loadAuction(auctionId); if (!auction) return toast('Auction could not be found.', 'error'); const bids = await loadBids(auctionId); renderModal(auction, bids); }
function getAuctionCard(event) { return event.target?.closest?.('.bazaar-auction-item,[data-auction-id]'); }
function getAuctionId(card) { return card?.dataset?.auctionId || card?.getAttribute?.('data-auction-id'); }

function auctionPointerGuard(event) {
  if (event.target?.closest?.(`#${MODAL_ID}`)) return;
  const card = getAuctionCard(event);
  if (!card) return;
  const auctionId = getAuctionId(card);
  if (!auctionId) return;
  card.removeAttribute('data-item-id');
  card.removeAttribute('data-id');
  card.setAttribute('data-no-item-popup', 'true');
  window.__VELKTRADE_ITEM_POPUP_HANDLER_TOKEN__ = '__velktrade_skip_item_popup_for_auction__';
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function auctionClickGuard(event) {
  if (event.target?.closest?.(`#${MODAL_ID}`)) return;
  const card = getAuctionCard(event);
  if (!card) return;
  const auctionId = getAuctionId(card);
  if (!auctionId) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  openAuctionById(auctionId);
}

function removeAdminFaqArticle(root = document) { root.querySelectorAll?.('.dashboard-faq-grid article').forEach(article => { const title = article.querySelector('h3')?.textContent?.trim().toLowerCase(); if (title === 'admin panel') article.remove(); }); }
function patchAuctionCreateForm(root = document) {
  root.querySelectorAll?.('.auction-create-form label').forEach(label => {
    const span = label.querySelector('span');
    if (!span || !/minimum bid increment/i.test(span.textContent || '')) return;
    const input = label.querySelector('input');
    if (!input) return;
    input.placeholder = 'Optional fixed amount, e.g. 500000';
    if (input.value === '1' && input.dataset.vtUserTouched !== 'true') {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (input.dataset.vtOptionalIncrementPatched === 'true') return;
    input.dataset.vtOptionalIncrementPatched = 'true';
    input.addEventListener('input', () => { input.dataset.vtUserTouched = 'true'; });
  });
}
function patchAuctionCards(root = document) { root.querySelectorAll?.('.bazaar-auction-item,[data-auction-id]').forEach(card => { card.removeAttribute('data-item-id'); card.removeAttribute('data-id'); card.setAttribute('data-no-item-popup', 'true'); }); }

function install() {
  if (window.__VELKTRADE_SIMPLE_AUCTION_BID_MENU__) return;
  window.__VELKTRADE_SIMPLE_AUCTION_BID_MENU__ = true;
  window.addEventListener('pointerdown', auctionPointerGuard, true);
  window.addEventListener('mousedown', auctionPointerGuard, true);
  window.addEventListener('click', auctionClickGuard, true);
  removeAdminFaqArticle(); patchAuctionCreateForm(); patchAuctionCards();
  const observer = new MutationObserver(mutations => { for (const mutation of mutations) { for (const node of mutation.addedNodes || []) { if (node?.nodeType !== 1) continue; removeAdminFaqArticle(node); patchAuctionCreateForm(node); patchAuctionCards(node); } } });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(() => { removeAdminFaqArticle(); patchAuctionCreateForm(); patchAuctionCards(); document.querySelectorAll('.auction-modal-backdrop').forEach(node => node.remove()); }, 1000);
}

install();
