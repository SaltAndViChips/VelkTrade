import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { velkToast } from '../velktrade-feature-foundation.js';

const FILTERS = ['all', 'pending', 'countered', 'accepted', 'completed', 'declined'];

function vtText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(entry => vtText(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value);
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function addThousandsCommas(numberText) {
  const [whole, decimal] = String(numberText).replace(/,/g, '').split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
}

function formatPriceDisplay(price) {
  const clean = vtText(price).trim();
  if (!clean) return '';
  const withoutDollar = clean.replace(/^\$\s*/, '').trim();
  const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim();
  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) return `${addThousandsCommas(withoutIc)} IC`;
  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) return `${withoutIc} IC`;
  if (/\bic\b/i.test(withoutDollar)) return withoutDollar.replace(/\bic\b/i, 'IC');
  return withoutDollar;
}

function getTradeMeta(trade) {
  const metaMessage = safeArray(trade.chatHistory).find(message => message?.type === 'trade-meta');
  if (!metaMessage?.message) return { icOffers: {} };
  try {
    const parsed = typeof metaMessage.message === 'string' ? JSON.parse(metaMessage.message) : metaMessage.message;
    return parsed && typeof parsed === 'object' ? parsed : { icOffers: {} };
  } catch {
    return { icOffers: {} };
  }
}

function getIcForUser(trade, userId) {
  const meta = getTradeMeta(trade);
  return vtText(meta.icOffers?.[userId]);
}

function MiniTradeItem({ item }) {
  const title = vtText(item?.title || item?.name, `Item ${vtText(item?.id)}`);
  const image = vtText(item?.image);
  const displayPrice = formatPriceDisplay(item?.price);

  return (
    <div className="mini-trade-item vt-unified-item-card" data-item-id={item?.id || ''} data-id={item?.id || ''} data-title={title} data-price={displayPrice} data-owner-id={item?.userId || item?.userid || item?.ownerId || item?.owner_id || ''} data-owner-username={item?.ownerUsername || item?.owner_username || item?.username || ''}>
      {image && <img src={image} alt={title} />}
      <span className="item-title">{title}</span>
      {displayPrice && <span className="sr-only item-price">{displayPrice}</span>}
    </div>
  );
}

function IcTradeItem({ amount }) {
  const display = vtText(amount);
  if (!display) return null;
  return <div className="mini-trade-item ic-offer-card"><div className="ic-token">IC</div><span>{display}</span></div>;
}

function ItemStrip({ label, items, icAmount }) {
  const list = safeArray(items);
  const hasContent = Boolean(icAmount) || Boolean(list.length);
  return (
    <div className="trade-item-strip tidy-item-strip">
      <strong>{vtText(label)}</strong>
      <div className="mini-trade-grid trade-items-grid vt-unified-mosaic-grid">
        {icAmount && <IcTradeItem amount={icAmount} />}
        {list.length ? list.map((item, index) => <MiniTradeItem key={item?.id || item?.image || index} item={item} />) : !icAmount ? <span className="muted">No items</span> : null}
      </div>
      {!hasContent && <span className="muted">No items</span>}
    </div>
  );
}

function tradeSearchText(trade) {
  const itemNames = [
    ...safeArray(trade.fromItemDetails).map(item => `${vtText(item?.title)} ${formatPriceDisplay(item?.price)}`),
    ...safeArray(trade.toItemDetails).map(item => `${vtText(item?.title)} ${formatPriceDisplay(item?.price)}`)
  ];
  const chatText = safeArray(trade.chatHistory).filter(message => message?.type !== 'trade-meta').map(message => `${vtText(message?.username)} ${vtText(message?.message)}`).join(' ');
  return [trade.id, trade.roomId, trade.status, trade.fromUsername, trade.toUsername, trade.createdAt, ...Object.values(getTradeMeta(trade).icOffers || {}).map(vtText), ...safeArray(trade.fromItems).map(vtText), ...safeArray(trade.toItems).map(vtText), ...itemNames, chatText].map(v => vtText(v)).filter(Boolean).join(' ').toLowerCase();
}

function buyRequestSearchText(request) {
  return [request.id, request.itemId, request.itemTitle, formatPriceDisplay(request.itemPrice || request.offeredIc), request.requesterUsername, request.ownerUsername, request.status, request.createdAt].map(v => vtText(v)).filter(Boolean).join(' ').toLowerCase();
}

function BuyRequestsTab({ requests = [], currentUser, onRefresh }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return safeArray(requests).filter(request => {
      const isOnMyItem = Number(request.ownerId) === Number(currentUser.id);
      const isMadeByMe = Number(request.requesterId) === Number(currentUser.id);
      const matchesScope = scope === 'all' || (scope === 'on-my-items' && isOnMyItem) || (scope === 'made-by-me' && isMadeByMe);
      const matchesSearch = !needle || buyRequestSearchText(request).includes(needle);
      return matchesScope && matchesSearch;
    });
  }, [requests, search, scope, currentUser]);

  async function offerAction(request, actionName) {
    setError('');
    setBusyId(`${request.id}-${actionName}`);
    try {
      let body;
      if (actionName === 'counter') {
        const offeredIc = window.prompt('Counter IC amount:', request.offeredIc || request.itemPrice || '');
        if (!offeredIc) return;
        const message = window.prompt('Counter message (optional):', '') || '';
        body = JSON.stringify({ offeredIc, message });
      }
      await api(`/api/buy-offers/${encodeURIComponent(request.id)}/${actionName}`, { method: 'POST', body });
      velkToast(`Buy offer ${actionName === 'accept' ? 'accepted' : actionName === 'decline' ? 'declined' : 'countered'}.`, 'success');
      await onRefresh?.();
    } catch (err) {
      const msg = vtText(err?.message, 'Buy offer action failed.');
      setError(msg);
      velkToast(msg, 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="tidy-tab-panel">
      <div className="tidy-toolbar">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search buy offers by item, user, IC price..." />
        <div className="segmented-control compact">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All</button>
          <button className={scope === 'on-my-items' ? 'active' : ''} onClick={() => setScope('on-my-items')}>Inbox</button>
          <button className={scope === 'made-by-me' ? 'active' : ''} onClick={() => setScope('made-by-me')}>Sent</button>
        </div>
        <button onClick={onRefresh}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted tidy-count">Showing {filtered.length} of {safeArray(requests).length} buy offers.</p>
      {filtered.length === 0 && <p className="muted tidy-empty">No buy offers match this filter/search.</p>}
      <div className="tidy-list">
        {filtered.map((request, index) => {
          const displayPrice = formatPriceDisplay(request.itemPrice);
          const offeredIc = formatPriceDisplay(request.offeredIc || request.offered_ic || request.itemPrice);
          const title = vtText(request.itemTitle, 'Item');
          const image = vtText(request.itemImage);
          const isOnMyItem = Number(request.ownerId) === Number(currentUser.id);
          const status = vtText(request.status, 'pending');
          const actionable = isOnMyItem && ['pending', 'countered'].includes(status);
          return (
            <article className="tidy-trade-card" key={request.id || index}>
              <div className="tidy-card-header">
                <div><strong>Buy Offer #{vtText(request.id, index + 1)}</strong><small>{vtText(request.createdAt || request.created_at)}</small></div>
                <span className={`status-pill status-${status}`}>{status}</span>
              </div>
              <div className="tidy-buy-request-body">
                <div className="mini-trade-grid trade-items-grid vt-unified-mosaic-grid">
                  <div className="mini-trade-item vt-unified-item-card" data-item-id={request.itemId || ''} data-id={request.itemId || ''} data-title={title} data-price={displayPrice} data-owner-id={request.ownerId || ''} data-owner-username={request.ownerUsername || ''}>
                    {image && <img src={image} alt={title} />}
                    <span className="item-title">{title}</span>
                    {displayPrice && <span className="sr-only item-price">{displayPrice}</span>}
                  </div>
                </div>
                <div className="tidy-meta-grid">
                  <span><strong>Offer</strong>{offeredIc || 'No IC amount'}</span>
                  <span><strong>Requester</strong>{vtText(request.requesterUsername)}</span>
                  <span><strong>Owner</strong>{vtText(request.ownerUsername)}</span>
                  {request.message && <span><strong>Message</strong>{vtText(request.message)}</span>}
                </div>
              </div>
              {actionable && (
                <div className="tidy-card-actions">
                  <button disabled={Boolean(busyId)} onClick={() => offerAction(request, 'accept')}>Accept</button>
                  <button disabled={Boolean(busyId)} className="ghost" onClick={() => offerAction(request, 'counter')}>Counter</button>
                  <button disabled={Boolean(busyId)} className="danger" onClick={() => offerAction(request, 'decline')}>Decline</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function Trades({ trades = [], buyRequests = [], currentUser, focusedTradeId, onFocusedTradeHandled, onRefresh, onCounter }) {
  const [activeTab, setActiveTab] = useState('trades');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const focusedTradeRef = useRef(null);

  useEffect(() => {
    if (!focusedTradeId) return;
    setActiveTab('trades'); setFilter('all'); setSearch('');
    const timer = window.setTimeout(() => { focusedTradeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); onFocusedTradeHandled?.(); }, 120);
    return () => window.clearTimeout(timer);
  }, [focusedTradeId, onFocusedTradeHandled]);

  const filtered = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();
    return safeArray(trades).filter(trade => {
      const matchesStatus = filter === 'all' || vtText(trade.status) === filter;
      const matchesSearch = !cleanSearch || tradeSearchText(trade).includes(cleanSearch);
      return matchesStatus && matchesSearch;
    });
  }, [filter, search, trades]);

  async function action(path) {
    setError('');
    try { await api(path, { method: 'POST' }); await onRefresh?.(); velkToast('Trade updated.', 'success'); }
    catch (err) { const msg = vtText(err?.message, 'Action failed.'); setError(msg); velkToast(msg, 'error'); }
  }

  function otherName(trade) { return Number(trade.fromUser) === Number(currentUser.id) ? vtText(trade.toUsername, 'Unknown') : vtText(trade.fromUsername, 'Unknown'); }

  return (
    <section className="card tidy-trades-page">
      <div className="panel-title-row"><div><h2>Trades</h2><p className="muted">Review trade offers, completed trades, counters, and buy offers.</p></div><button onClick={onRefresh}>Refresh</button></div>
      {error && <p className="error">{error}</p>}
      <div className="segmented-control trades-tabs"><button className={activeTab === 'trades' ? 'active' : ''} onClick={() => setActiveTab('trades')}>Trade Offers</button><button className={activeTab === 'buy-requests' ? 'active' : ''} onClick={() => setActiveTab('buy-requests')}>Buy Offer Inbox</button></div>
      {activeTab === 'buy-requests' && <BuyRequestsTab requests={buyRequests} currentUser={currentUser} onRefresh={onRefresh} />}
      {activeTab === 'trades' && (
        <section className="tidy-tab-panel">
          <div className="tidy-toolbar"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search trades by user, item, IC, status, room, chat..." aria-label="Search trades" /><div className="segmented-control compact status-filter">{FILTERS.map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
          <p className="muted tidy-count">Showing {filtered.length} of {safeArray(trades).length} trades.</p>
          {filtered.length === 0 && <p className="muted tidy-empty">No trades match this filter/search.</p>}
          <div className="tidy-list">
            {filtered.map((trade, index) => {
              const status = vtText(trade.status, 'pending');
              const id = vtText(trade.id, index + 1);
              const fromUsername = vtText(trade.fromUsername, 'Unknown');
              const toUsername = vtText(trade.toUsername, 'Unknown');
              const chat = safeArray(trade.chatHistory).filter(message => message?.type !== 'trade-meta');
              return (
                <article ref={Number(focusedTradeId) === Number(trade.id) ? focusedTradeRef : null} className={`tidy-trade-card ${Number(focusedTradeId) === Number(trade.id) ? 'focused-trade-card' : ''}`} key={id}>
                  <div className="tidy-card-header"><div><strong>Trade #{id}</strong><small>With {otherName(trade)} · Room {vtText(trade.roomId)}</small></div><span className={`status-pill status-${status}`}>{status}</span></div>
                  <small className="muted">{vtText(trade.createdAt)}</small>
                  <div className="tidy-trade-grid"><ItemStrip label={`${fromUsername} offers`} items={safeArray(trade.fromItemDetails)} icAmount={getIcForUser(trade, trade.fromUser)} /><ItemStrip label={`${toUsername} offers/requested`} items={safeArray(trade.toItemDetails)} icAmount={getIcForUser(trade, trade.toUser)} /></div>
                  <details className="tidy-details"><summary>Chat / message history ({chat.length})</summary><div className="history-chat">{chat.map((message, messageIndex) => <p key={vtText(message?.id, messageIndex)}><strong>{vtText(message?.username, 'User')}:</strong> {vtText(message?.message)}</p>)}</div></details>
                  <div className="tidy-card-actions">
                    {['pending', 'countered'].includes(status) && <><button onClick={() => action(`/api/trades/${trade.id}/accept`)}>Accept</button><button className="ghost" onClick={() => onCounter?.(trade)}>Counter</button><button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button></>}
                    {status === 'accepted' && <><button onClick={() => action(`/api/trades/${trade.id}/confirm`)}>Confirm / Complete</button><button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button></>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
