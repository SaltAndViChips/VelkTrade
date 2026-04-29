import { useMemo, useState } from 'react';
import { api } from '../api';

const FILTERS = ['all', 'pending', 'countered', 'accepted', 'completed', 'declined'];

function MiniTradeItem({ item }) {
  return (
    <div className="mini-trade-item">
      <img src={item.image} alt={item.title} />
      <span>{item.title}</span>
      {item.price && <strong className="item-price">{item.price}</strong>}

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
        {item.price && <em>{item.price}</em>}
      </div>
    </div>
  );
}

function ItemStrip({ label, items }) {
  return (
    <div className="trade-item-strip">
      <strong>{label}</strong>
      <div className="mini-trade-grid">
        {items?.length ? items.map(item => (
          <MiniTradeItem key={item.id} item={item} />
        )) : <span className="muted">No items</span>}
      </div>
    </div>
  );
}

function tradeSearchText(trade) {
  const itemNames = [
    ...(trade.fromItemDetails || []).map(item => `${item.title || ''} ${item.price || ''}`),
    ...(trade.toItemDetails || []).map(item => `${item.title || ''} ${item.price || ''}`)
  ];

  const chatText = (trade.chatHistory || [])
    .map(message => `${message.username || ''} ${message.message || ''}`)
    .join(' ');

  return [
    trade.id,
    trade.roomId,
    trade.status,
    trade.fromUsername,
    trade.toUsername,
    trade.createdAt,
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
    request.itemPrice,
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
    <section>
      <div className="inline-controls filter-row">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search buy requests by item, user, price..."
        />

        <button className={scope === 'all' ? 'selected-filter' : 'ghost'} onClick={() => setScope('all')}>All</button>
        <button className={scope === 'on-my-items' ? 'selected-filter' : 'ghost'} onClick={() => setScope('on-my-items')}>On My Items</button>
        <button className={scope === 'made-by-me' ? 'selected-filter' : 'ghost'} onClick={() => setScope('made-by-me')}>Made By Me</button>
        <button onClick={onRefresh}>Refresh</button>
      </div>

      <p className="muted">Showing {filtered.length} of {requests.length} buy requests.</p>

      {filtered.length === 0 && <p className="muted">No buy requests match this filter/search.</p>}

      <div className="trade-history-list">
        {filtered.map(request => (
          <article className="trade-history-item" key={request.id}>
            <div className="panel-title-row">
              <strong>Buy Request #{request.id}</strong>
              <span className="status-pill">
                {Number(request.ownerId) === Number(currentUser.id) ? 'On your item' : 'Made by you'}
              </span>
            </div>

            <div className="grid two trade-items-grid">
              <div className="mini-trade-grid">
                <div className="mini-trade-item">
                  <img src={request.itemImage} alt={request.itemTitle} />
                  <span>{request.itemTitle}</span>
                  {request.itemPrice && <strong className="item-price">{request.itemPrice}</strong>}
                  <div className="item-full-preview">
                    <img src={request.itemImage} alt={request.itemTitle} />
                    <strong>{request.itemTitle}</strong>
                    {request.itemPrice && <em>{request.itemPrice}</em>}
                  </div>
                </div>
              </div>

              <div>
                <p><strong>Requester:</strong> {request.requesterUsername}</p>
                <p><strong>Owner:</strong> {request.ownerUsername}</p>
                <p><strong>Created:</strong> {request.createdAt}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Trades({ trades, buyRequests = [], currentUser, onRefresh, onCounter }) {
  const [activeTab, setActiveTab] = useState('trades');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

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
    <section className="card">
      <div className="panel-title-row">
        <h2>Trades</h2>
        <button onClick={onRefresh}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="inline-controls filter-row">
        <button className={activeTab === 'trades' ? 'selected-filter' : 'ghost'} onClick={() => setActiveTab('trades')}>
          Trade Offers
        </button>
        <button className={activeTab === 'buy-requests' ? 'selected-filter' : 'ghost'} onClick={() => setActiveTab('buy-requests')}>
          Buy Requests
        </button>
      </div>

      {activeTab === 'buy-requests' && (
        <BuyRequestsTab requests={buyRequests} currentUser={currentUser} onRefresh={onRefresh} />
      )}

      {activeTab === 'trades' && (
        <>
          <div className="inline-controls filter-row">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search trades by user, item, price, status, room, chat..."
              aria-label="Search trades"
            />

            {FILTERS.map(item => (
              <button key={item} className={filter === item ? 'selected-filter' : 'ghost'} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>

          <p className="muted">
            Showing {filtered.length} of {trades.length} trades.
          </p>

          {filtered.length === 0 && <p className="muted">No trades match this filter/search.</p>}

          <div className="trade-history-list">
            {filtered.map(trade => (
              <article className="trade-history-item" key={trade.id}>
                <div className="panel-title-row">
                  <strong>Trade #{trade.id}</strong>
                  <span className={`status-pill status-${trade.status}`}>{trade.status}</span>
                </div>

                <span>With: {otherName(trade)}</span>
                <small>{trade.createdAt}</small>
                <small>Room: {trade.roomId}</small>

                <div className="grid two trade-items-grid">
                  <ItemStrip label={`${trade.fromUsername} offers`} items={trade.fromItemDetails || []} />
                  <ItemStrip label={`${trade.toUsername} offers/requested`} items={trade.toItemDetails || []} />
                </div>

                <details>
                  <summary>Chat / message history ({trade.chatHistory?.length || 0})</summary>
                  <div className="history-chat">
                    {(trade.chatHistory || []).map(message => (
                      <p key={message.id}><strong>{message.username}:</strong> {message.message}</p>
                    ))}
                  </div>
                </details>

                <div className="inline-controls">
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
        </>
      )}
    </section>
  );
}
