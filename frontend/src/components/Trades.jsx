import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

const FILTERS = ['all', 'pending', 'countered', 'accepted', 'completed', 'declined'];

function formatPriceDisplay(price) {
  const clean = String(price || '').trim();
  if (!clean) return '';

  if (/^\d+(\.\d+)?\s*([kmb])?$/i.test(clean)) {
    return `${clean} IC`;
  }

  if (/\bic\b/i.test(clean)) {
    return clean.replace(/\bic\b/i, 'IC');
  }

  return clean.replace(/^\$\s*/, '');
}

function getTradeMeta(trade) {
  const metaMessage = (trade.chatHistory || []).find(message => message.type === 'trade-meta');

  if (!metaMessage?.message) return { icOffers: {} };

  try {
    return JSON.parse(metaMessage.message);
  } catch {
    return { icOffers: {} };
  }
}

function getIcForUser(trade, userId) {
  const meta = getTradeMeta(trade);
  return meta.icOffers?.[userId] || '';
}

function MiniTradeItem({ item }) {
  const displayPrice = formatPriceDisplay(item.price);

  return (
    <div className="mini-trade-item">
      <img src={item.image} alt={item.title} />
      <span>{item.title}</span>
      {displayPrice && <strong className="item-price">{displayPrice}</strong>}

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
        {displayPrice && <em>{displayPrice}</em>}
      </div>
    </div>
  );
}

function IcTradeItem({ amount }) {
  if (!amount) return null;

  return (
    <div className="mini-trade-item ic-offer-card">
      <div className="ic-token">IC</div>
      <span>{amount}</span>
    </div>
  );
}

function ItemStrip({ label, items, icAmount }) {
  const hasContent = Boolean(icAmount) || Boolean(items?.length);

  return (
    <div className="trade-item-strip tidy-item-strip">
      <strong>{label}</strong>

      <div className="mini-trade-grid">
        {icAmount && <IcTradeItem amount={icAmount} />}
        {items?.length ? items.map(item => (
          <MiniTradeItem key={item.id} item={item} />
        )) : !icAmount ? <span className="muted">No items</span> : null}
      </div>

      {!hasContent && <span className="muted">No items</span>}
    </div>
  );
}

function tradeSearchText(trade) {
  const itemNames = [
    ...(trade.fromItemDetails || []).map(item => `${item.title || ''} ${formatPriceDisplay(item.price) || ''}`),
    ...(trade.toItemDetails || []).map(item => `${item.title || ''} ${formatPriceDisplay(item.price) || ''}`)
  ];

  const chatText = (trade.chatHistory || [])
    .filter(message => message.type !== 'trade-meta')
    .map(message => `${message.username || ''} ${message.message || ''}`)
    .join(' ');

  return [
    trade.id,
    trade.roomId,
    trade.status,
    trade.fromUsername,
    trade.toUsername,
    trade.createdAt,
    ...Object.values(getTradeMeta(trade).icOffers || {}),
    ...(trade.fromItems || []),
    ...(trade.toItems || []),
    ...itemNames,
    chatText
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buyRequestSearchText(request) {
  return [
    request.id,
    request.itemId,
    request.itemTitle,
    formatPriceDisplay(request.itemPrice),
    request.requesterUsername,
    request.ownerUsername,
    request.createdAt
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function BuyRequestsTab({ requests, currentUser, onRefresh }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return requests.filter(request => {
      const isOnMyItem = Number(request.ownerId) === Number(currentUser.id);
      const isMadeByMe = Number(request.requesterId) === Number(currentUser.id);

      const matchesScope =
        scope === 'all' ||
        (scope === 'on-my-items' && isOnMyItem) ||
        (scope === 'made-by-me' && isMadeByMe);

      const matchesSearch = !needle || buyRequestSearchText(request).includes(needle);

      return matchesScope && matchesSearch;
    });
  }, [requests, search, scope, currentUser]);

  return (
    <section className="tidy-tab-panel">
      <div className="tidy-toolbar">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search buy requests by item, user, IC price..."
        />

        <div className="segmented-control compact">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All</button>
          <button className={scope === 'on-my-items' ? 'active' : ''} onClick={() => setScope('on-my-items')}>On My Items</button>
          <button className={scope === 'made-by-me' ? 'active' : ''} onClick={() => setScope('made-by-me')}>Made By Me</button>
        </div>

        <button onClick={onRefresh}>Refresh</button>
      </div>

      <p className="muted tidy-count">Showing {filtered.length} of {requests.length} buy requests.</p>

      {filtered.length === 0 && <p className="muted tidy-empty">No buy requests match this filter/search.</p>}

      <div className="tidy-list">
        {filtered.map(request => {
          const displayPrice = formatPriceDisplay(request.itemPrice);

          return (
            <article className="tidy-trade-card" key={request.id}>
              <div className="tidy-card-header">
                <div>
                  <strong>Buy Request #{request.id}</strong>
                  <small>{request.createdAt}</small>
                </div>

                <span className="status-pill">
                  {Number(request.ownerId) === Number(currentUser.id) ? 'On your item' : 'Made by you'}
                </span>
              </div>

              <div className="tidy-buy-request-body">
                <div className="mini-trade-grid">
                  <div className="mini-trade-item">
                    <img src={request.itemImage} alt={request.itemTitle} />
                    <span>{request.itemTitle}</span>
                    {displayPrice && <strong className="item-price">{displayPrice}</strong>}
                    <div className="item-full-preview">
                      <img src={request.itemImage} alt={request.itemTitle} />
                      <strong>{request.itemTitle}</strong>
                      {displayPrice && <em>{displayPrice}</em>}
                    </div>
                  </div>
                </div>

                <div className="tidy-meta-grid">
                  <span><strong>Requester</strong>{request.requesterUsername}</span>
                  <span><strong>Owner</strong>{request.ownerUsername}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function Trades({ trades, buyRequests = [], currentUser, focusedTradeId, onFocusedTradeHandled, onRefresh, onCounter }) {
  const [activeTab, setActiveTab] = useState('trades');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const focusedTradeRef = useRef(null);

  useEffect(() => {
    if (!focusedTradeId) return;

    setActiveTab('trades');
    setFilter('all');
    setSearch('');

    const timer = window.setTimeout(() => {
      focusedTradeRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      onFocusedTradeHandled?.();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [focusedTradeId, onFocusedTradeHandled]);

  const filtered = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    return trades.filter(trade => {
      const matchesStatus = filter === 'all' || trade.status === filter;
      const matchesSearch = !cleanSearch || tradeSearchText(trade).includes(cleanSearch);

      return matchesStatus && matchesSearch;
    });
  }, [filter, search, trades]);

  async function action(path) {
    setError('');

    try {
      await api(path, { method: 'POST' });
      await onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function otherName(trade) {
    return Number(trade.fromUser) === Number(currentUser.id) ? trade.toUsername : trade.fromUsername;
  }

  return (
    <section className="card tidy-trades-page">
      <div className="panel-title-row">
        <div>
          <h2>Trades</h2>
          <p className="muted">Review trade offers, completed trades, counters, and buy requests.</p>
        </div>
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="segmented-control trades-tabs">
        <button className={activeTab === 'trades' ? 'active' : ''} onClick={() => setActiveTab('trades')}>
          Trade Offers
        </button>
        <button className={activeTab === 'buy-requests' ? 'active' : ''} onClick={() => setActiveTab('buy-requests')}>
          Buy Requests
        </button>
      </div>

      {activeTab === 'buy-requests' && (
        <BuyRequestsTab requests={buyRequests} currentUser={currentUser} onRefresh={onRefresh} />
      )}

      {activeTab === 'trades' && (
        <section className="tidy-tab-panel">
          <div className="tidy-toolbar">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search trades by user, item, IC, status, room, chat..."
              aria-label="Search trades"
            />

            <div className="segmented-control compact status-filter">
              {FILTERS.map(item => (
                <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <p className="muted tidy-count">
            Showing {filtered.length} of {trades.length} trades.
          </p>

          {filtered.length === 0 && <p className="muted tidy-empty">No trades match this filter/search.</p>}

          <div className="tidy-list">
            {filtered.map(trade => (
              <article
                ref={Number(focusedTradeId) === Number(trade.id) ? focusedTradeRef : null}
                className={`tidy-trade-card ${Number(focusedTradeId) === Number(trade.id) ? 'focused-trade-card' : ''}`}
                key={trade.id}
              >
                <div className="tidy-card-header">
                  <div>
                    <strong>Trade #{trade.id}</strong>
                    <small>With {otherName(trade)} · Room {trade.roomId}</small>
                  </div>

                  <span className={`status-pill status-${trade.status}`}>{trade.status}</span>
                </div>

                <small className="muted">{trade.createdAt}</small>

                <div className="tidy-trade-grid">
                  <ItemStrip
                    label={`${trade.fromUsername} offers`}
                    items={trade.fromItemDetails || []}
                    icAmount={getIcForUser(trade, trade.fromUser)}
                  />
                  <ItemStrip
                    label={`${trade.toUsername} offers/requested`}
                    items={trade.toItemDetails || []}
                    icAmount={getIcForUser(trade, trade.toUser)}
                  />
                </div>

                <details className="tidy-details">
                  <summary>Chat / message history ({(trade.chatHistory || []).filter(message => message.type !== 'trade-meta').length})</summary>
                  <div className="history-chat">
                    {(trade.chatHistory || [])
                      .filter(message => message.type !== 'trade-meta')
                      .map(message => (
                        <p key={message.id}><strong>{message.username}:</strong> {message.message}</p>
                      ))}
                  </div>
                </details>

                <div className="tidy-card-actions">
                  {['pending', 'countered'].includes(trade.status) && (
                    <>
                      <button onClick={() => action(`/api/trades/${trade.id}/accept`)}>Accept</button>
                      <button className="ghost" onClick={() => onCounter(trade)}>Counter</button>
                      <button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button>
                    </>
                  )}

                  {trade.status === 'accepted' && (
                    <>
                      <button onClick={() => action(`/api/trades/${trade.id}/confirm`)}>Confirm / Complete</button>
                      <button className="danger" onClick={() => action(`/api/trades/${trade.id}/decline`)}>Decline</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
