import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { velkToast } from '../velktrade-feature-foundation.js';

const DEVELOPER_NAMES = new Set(['salt', 'velkon']);

function lowerUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' ? json : fallback;
  } catch {
    return fallback;
  }
}

function isDeveloperUser(user) {
  return Boolean(
    user?.isDeveloper ||
    user?.is_developer ||
    user?.highestBadge === 'developer' ||
    user?.role === 'developer' ||
    DEVELOPER_NAMES.has(lowerUsername(user?.username))
  );
}

function isAdminUser(user) {
  return Boolean(isDeveloperUser(user) || user?.isAdmin || user?.is_admin || user?.highestBadge === 'admin' || user?.role === 'admin');
}

function isVerifiedUser(user) {
  return Boolean(user?.isVerified || user?.is_verified || user?.isTrusted || user?.highestBadge === 'verified' || user?.highestBadge === 'trusted');
}

function canModifyUser(currentUser, targetUser) {
  if (!isDeveloperUser(targetUser)) return true;
  const sameId = currentUser?.id && targetUser?.id && Number(currentUser.id) === Number(targetUser.id);
  const sameName = lowerUsername(currentUser?.username) === lowerUsername(targetUser?.username);
  return Boolean(isDeveloperUser(currentUser) || sameId || sameName);
}

function normalizeUser(user) {
  const developer = isDeveloperUser(user);
  const admin = Boolean(developer || user?.isAdmin || user?.is_admin);
  const verified = Boolean(user?.isVerified || user?.is_verified || user?.isTrusted);
  return {
    ...user,
    id: user?.id ?? user?.userId,
    username: user?.username || user?.name || 'Unknown',
    isDeveloper: developer,
    isAdmin: admin,
    isVerified: verified,
    highestBadge: developer ? 'developer' : admin ? 'admin' : verified ? 'verified' : 'none',
    online: Boolean(user?.online || user?.isOnline || user?.status === 'online')
  };
}

function UserBadge({ user }) {
  if (isDeveloperUser(user)) return <span className="developer-badge">🖥️ Developer</span>;
  if (isAdminUser(user)) return <span className="admin-badge">🛡️ Admin</span>;
  if (isVerifiedUser(user)) return <span className="verified-label-badge">✓ Verified</span>;
  return <span className="user-badge">User</span>;
}

function getIcValue(trade, keys) {
  for (const key of keys) {
    const value = trade?.[key];
    if (value !== undefined && value !== null && value !== '' && Number(value) !== 0) return Number(value);
  }
  return 0;
}

function normalizeTradeItems(trade, side) {
  const detailKeys = side === 'from'
    ? ['fromItemDetails', 'from_items_details', 'offerItemDetails', 'offeredItemDetails']
    : ['toItemDetails', 'to_items_details', 'requestItemDetails', 'requestedItemDetails'];
  const idKeys = side === 'from'
    ? ['fromItems', 'from_items', 'offerItems', 'offeredItems']
    : ['toItems', 'to_items', 'requestItems', 'requestedItems'];
  for (const key of detailKeys) if (Array.isArray(trade?.[key]) && trade[key].length) return trade[key];
  for (const key of idKeys) if (Array.isArray(trade?.[key]) && trade[key].length) return trade[key].map(item => typeof item === 'object' ? item : { id: item, title: `Item #${item}` });
  return [];
}

function normalizeTradeChat(trade) {
  const directChat = trade?.chatHistory || trade?.chat_history || trade?.chat || trade?.messages || trade?.chatLog || trade?.chat_log || trade?.logs || trade?.log;
  if (Array.isArray(directChat)) return directChat.filter(message => message?.type !== 'trade-meta');
  if (typeof directChat === 'string' && directChat.trim()) {
    try {
      const parsed = JSON.parse(directChat);
      if (Array.isArray(parsed)) return parsed.filter(message => message?.type !== 'trade-meta');
    } catch {
      return [{ username: 'Log', message: directChat }];
    }
  }
  return [];
}

function getTradeSummary(trade) {
  const fromItems = normalizeTradeItems(trade, 'from');
  const toItems = normalizeTradeItems(trade, 'to');
  const fromIc = getIcValue(trade, ['fromIc', 'fromIC', 'fromIcAmount', 'fromICAmount', 'offerIc', 'offeredIc', 'offerIC', 'offeredIC']);
  const toIc = getIcValue(trade, ['toIc', 'toIC', 'toIcAmount', 'toICAmount', 'requestIc', 'requestedIc', 'requestIC', 'requestedIC']);
  const parts = [];
  if (fromItems.length) parts.push(`${trade.fromUsername || 'From'}: ${fromItems.map(item => item.title || item.name || `Item #${item.id}`).join(', ')}`);
  if (fromIc) parts.push(`${trade.fromUsername || 'From'}: ${fromIc.toLocaleString()} IC`);
  if (toItems.length) parts.push(`${trade.toUsername || 'To'}: ${toItems.map(item => item.title || item.name || `Item #${item.id}`).join(', ')}`);
  if (toIc) parts.push(`${trade.toUsername || 'To'}: ${toIc.toLocaleString()} IC`);
  return parts.length ? parts.join(' | ') : 'No items or IC';
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { raw: value };
  }
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return text(value);
  }
}

function TradeItemList({ title, items, ic, onPreview }) {
  return (
    <div className="admin-trade-side">
      <h3>{title}</h3>
      {ic > 0 && <p className="admin-ic-line">{ic.toLocaleString()} IC</p>}
      {items.length === 0 && ic <= 0 ? <p className="muted">No items or IC.</p> : (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${item.id || index}`} className="vt-unified-item-card" data-item-id={item.id || ''} data-title={item.title || item.name || `Item #${item.id || index + 1}`} data-price={item.price || ''}>
              {item.image && (
                <button type="button" className="admin-trade-image-button" onClick={() => onPreview?.({ src: item.image, title: item.title || item.name || `Item #${item.id || index + 1}` })} title="Preview item image">
                  <img src={item.image} alt="" className="admin-trade-item-thumb" />
                </button>
              )}
              <span>{item.title || item.name || `Item #${item.id || index + 1}`}</span>
              {item.price && <em>{item.price}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatLog({ messages }) {
  if (!messages.length) return <p className="muted">No chat messages.</p>;
  return <ul className="admin-chat-log">{messages.map((message, index) => <li key={message.id || index}><strong>{message.username || message.author || `User ${message.userId || ''}`}:</strong> <span>{message.message || message.text || ''}</span>{(message.createdAt || message.created_at) && <small>{formatDate(message.createdAt || message.created_at)}</small>}</li>)}</ul>;
}

function RawTradeDebug({ trade }) {
  return <details className="admin-raw-trade-details"><summary>Raw trade data</summary><pre>{JSON.stringify(trade, null, 2)}</pre></details>;
}

function AuditLogTab({ auditLogs, query, setQuery, actionFilter, setActionFilter }) {
  const actions = useMemo(() => ['all', ...Array.from(new Set(auditLogs.map(log => text(log.action)).filter(Boolean))).sort()], [auditLogs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return auditLogs.filter(log => {
      const meta = parseMetadata(log.metadata);
      const haystack = [log.id, log.action, log.target_type || log.targetType, log.target_id || log.targetId, log.actorUsername || log.actor_username, log.created_at || log.createdAt, JSON.stringify(meta)].map(text).join(' ').toLowerCase();
      return (actionFilter === 'all' || text(log.action) === actionFilter) && (!needle || haystack.includes(needle));
    });
  }, [auditLogs, query, actionFilter]);

  return (
    <section className="card admin-tab-card admin-audit-card">
      <div className="panel-title-row"><div><h2>Audit Logs</h2><p className="muted">Review admin, trade, buy-offer, and price-change actions.</p></div></div>
      <div className="admin-filter-grid"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search audit logs by actor, item, action, metadata..." /><select value={actionFilter} onChange={event => setActionFilter(event.target.value)}>{actions.map(action => <option key={action} value={action}>{action === 'all' ? 'All actions' : action}</option>)}</select></div>
      <p className="muted tidy-count">Showing {filtered.length} of {auditLogs.length} audit entries.</p>
      <div className="admin-audit-list tidy-list">
        {filtered.length === 0 && <p className="muted tidy-empty">No audit logs match.</p>}
        {filtered.map((log, index) => {
          const meta = parseMetadata(log.metadata);
          return (
            <article className="admin-audit-card-row tidy-trade-card" key={log.id || index}>
              <div className="tidy-card-header"><div><strong>{text(log.action, 'Unknown action')}</strong><small>{formatDate(log.created_at || log.createdAt)}</small></div><span className="status-pill">#{text(log.id, index + 1)}</span></div>
              <div className="tidy-meta-grid"><span><strong>Actor</strong>{text(log.actorUsername || log.actor_username || log.actor_id || log.actorId, 'System')}</span><span><strong>Target</strong>{text(log.target_type || log.targetType, 'target')} #{text(log.target_id || log.targetId, '—')}</span></div>
              <details className="tidy-details"><summary>Metadata</summary><pre>{JSON.stringify(meta, null, 2)}</pre></details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

async function tryApi(calls) {
  let lastError;
  for (const call of calls) {
    try { return await call(); } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Request failed');
}

export default function AdminPanel({ currentUser, user }) {
  const viewer = currentUser || user || {};
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [trades, setTrades] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [auditQuery, setAuditQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [expandedTradeIds, setExpandedTradeIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [previewTradeImage, setPreviewTradeImage] = useState(null);

  async function loadAdminData() {
    setLoading(true);
    setError('');
    try {
      const [usersData, roomsData, tradesData, auditData] = await Promise.allSettled([
        tryApi([() => api('/api/admin/users'), () => api('/api/admin/users/list')]),
        tryApi([() => api('/api/admin/rooms/open'), () => api('/api/admin/rooms'), () => api('/api/rooms/open')]),
        tryApi([() => api('/api/admin/trades'), () => api('/api/trades')]),
        tryApi([() => api('/api/admin/audit-logs'), () => api('/api/audit-logs')])
      ]);
      if (usersData.status === 'fulfilled') {
        const rawUsers = usersData.value.users || usersData.value.data || usersData.value || [];
        setUsers(Array.isArray(rawUsers) ? rawUsers.map(normalizeUser) : []);
      }
      if (roomsData.status === 'fulfilled') {
        const rawRooms = roomsData.value.rooms || roomsData.value.data || roomsData.value || [];
        setRooms(Array.isArray(rawRooms) ? rawRooms : []);
      }
      if (tradesData.status === 'fulfilled') {
        const rawTrades = tradesData.value.trades || tradesData.value.data || tradesData.value || [];
        setTrades(Array.isArray(rawTrades) ? rawTrades : []);
      }
      if (auditData.status === 'fulfilled') {
        const rawLogs = auditData.value.auditLogs || auditData.value.logs || auditData.value.data || auditData.value || [];
        setAuditLogs(Array.isArray(rawLogs) ? rawLogs : []);
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load admin panel.');
      velkToast(loadError.message || 'Could not load admin panel.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAdminData(); }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter(candidate => !needle || [candidate.id, candidate.username, candidate.highestBadge].filter(Boolean).join(' ').toLowerCase().includes(needle)).filter(candidate => {
      if (filter === 'developers') return isDeveloperUser(candidate);
      if (filter === 'admins') return !isDeveloperUser(candidate) && isAdminUser(candidate);
      if (filter === 'verified') return !isDeveloperUser(candidate) && !isAdminUser(candidate) && isVerifiedUser(candidate);
      if (filter === 'online') return Boolean(candidate.online);
      return true;
    }).sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  }, [users, query, filter]);

  async function setAdminFlag(targetUser, isAdmin) {
    setMessage(''); setError('');
    if (!canModifyUser(viewer, targetUser)) { setError('Developer accounts can only be modified by developers.'); return; }
    try {
      await tryApi([() => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/admin`, { method: 'PUT', body: JSON.stringify({ isAdmin }) }), () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/admin`, { method: 'POST', body: JSON.stringify({ isAdmin }) }), () => api('/api/admin/users/admin', { method: 'POST', body: JSON.stringify({ username: targetUser.username, isAdmin }) })]);
      setMessage(`${targetUser.username} updated.`); velkToast(`${targetUser.username} updated.`, 'success'); await loadAdminData();
    } catch (adminError) { setError(adminError.message || 'Could not update admin flag.'); velkToast(adminError.message || 'Could not update admin flag.', 'error'); }
  }

  async function setVerifiedFlag(targetUser, isVerified) {
    setMessage(''); setError('');
    if (!canModifyUser(viewer, targetUser)) { setError('Developer accounts can only be modified by developers.'); return; }
    try {
      await tryApi([() => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/verified`, { method: 'PUT', body: JSON.stringify({ isVerified }) }), () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/verified`, { method: 'POST', body: JSON.stringify({ isVerified }) }), () => api('/api/admin/users/verified', { method: 'POST', body: JSON.stringify({ username: targetUser.username, isVerified }) })]);
      setMessage(`${targetUser.username} updated.`); velkToast(`${targetUser.username} updated.`, 'success'); await loadAdminData();
    } catch (verifiedError) { setError(verifiedError.message || 'Could not update verified flag.'); velkToast(verifiedError.message || 'Could not update verified flag.', 'error'); }
  }

  async function resetPassword(targetUser) {
    setMessage(''); setError('');
    if (!canModifyUser(viewer, targetUser)) { setError('Developer passwords can only be reset by developers.'); return; }
    const password = window.prompt(`Enter a new password for ${targetUser.username}:`);
    if (!password) return;
    try {
      await tryApi([() => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }), () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/password`, { method: 'PUT', body: JSON.stringify({ password }) }), () => api('/api/admin/users/reset-password', { method: 'POST', body: JSON.stringify({ username: targetUser.username, password }) })]);
      setMessage(`Password reset for ${targetUser.username}.`); velkToast(`Password reset for ${targetUser.username}.`, 'success');
    } catch (passwordError) { setError(passwordError.message || 'Could not reset password.'); velkToast(passwordError.message || 'Could not reset password.', 'error'); }
  }

  function toggleTrade(tradeId) {
    setExpandedTradeIds(previous => { const next = new Set(previous); if (next.has(tradeId)) next.delete(tradeId); else next.add(tradeId); return next; });
  }

  function enterRoom(room) {
    const roomId = room.roomId || room.id;
    if (!roomId) return;
    window.history.pushState({}, '', `/room/${encodeURIComponent(roomId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <section className="admin-panel rewritten-admin-panel">
      <div className="panel-title-row"><div><h1>Admin Panel</h1><p className="muted">Manage users, active rooms, trade records, and audit logs.</p></div><button type="button" className="ghost" onClick={loadAdminData}>Refresh</button></div>
      {message && <p className="success-message">{message}</p>}{error && <p className="error-message">{error}</p>}{loading && <p className="muted">Loading admin data...</p>}
      <div className="admin-themed-tabs"><button type="button" className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>Users</button><button type="button" className={activeTab === 'rooms' ? 'active' : ''} onClick={() => setActiveTab('rooms')}>Rooms</button><button type="button" className={activeTab === 'trades' ? 'active' : ''} onClick={() => setActiveTab('trades')}>Trades</button><button type="button" className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>Audit Logs</button></div>

      {activeTab === 'users' && <section className="card admin-tab-card admin-users-card"><div className="panel-title-row"><div><h2>Users</h2><p className="muted">Search, filter, and manage player roles. Sorted by ID by default.</p></div></div><div className="admin-filter-grid"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users by ID, name, or role..." /><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All users</option><option value="developers">Developers</option><option value="admins">Admins</option><option value="verified">Verified</option><option value="online">Online</option></select></div><div className="admin-user-list">{filteredUsers.map(candidate => { const modifiable = canModifyUser(viewer, candidate); const developer = isDeveloperUser(candidate); const adminRole = isAdminUser(candidate); const verified = isVerifiedUser(candidate); return <article className="admin-user-card" key={candidate.id || candidate.username}><div className="admin-user-main"><span className="admin-user-id">#{candidate.id ?? '?'}</span><strong>{candidate.username}</strong><UserBadge user={candidate} />{candidate.online && <span className="online-mini-pill">Online</span>}</div>{developer && !isDeveloperUser(viewer) && <p className="muted admin-protected-note">Developer account. Only developers can modify this user.</p>}<div className="admin-user-actions">{!developer && (adminRole ? <button type="button" className="danger" disabled={!modifiable} onClick={() => setAdminFlag(candidate, false)}>Remove Admin</button> : <button type="button" disabled={!modifiable} onClick={() => setAdminFlag(candidate, true)}>Make Admin</button>)}{!developer && (verified ? <button type="button" className="ghost" disabled={!modifiable} onClick={() => setVerifiedFlag(candidate, false)}>Remove Verified</button> : <button type="button" className="ghost" disabled={!modifiable} onClick={() => setVerifiedFlag(candidate, true)}>Mark Verified</button>)}{modifiable && <button type="button" className="ghost" onClick={() => resetPassword(candidate)}>Reset Password</button>}</div></article>; })}{filteredUsers.length === 0 && <p className="muted tidy-empty">No matching users.</p>}</div></section>}

      {activeTab === 'rooms' && <section className="card admin-tab-card admin-rooms-card"><div className="panel-title-row"><div><h2>Open Rooms</h2><p className="muted">Rooms currently available from the backend.</p></div></div><div className="admin-room-list">{rooms.length === 0 && <p className="muted tidy-empty">No open rooms found.</p>}{rooms.map(room => { const roomId = room.roomId || room.id; const players = room.players || room.users || []; return <article className="admin-room-card" key={roomId}><div><strong>Room {roomId}</strong><p className="muted">{players.length ? players.map(player => player.username || player.name).join(' vs ') : 'No player list available'}</p></div><button type="button" onClick={() => enterRoom(room)}>Enter</button></article>; })}</div></section>}

      {activeTab === 'trades' && <section className="card admin-tab-card admin-trades-card"><div className="panel-title-row"><div><h2>Trades</h2><p className="muted">Expandable trade summaries with items, IC, and chat history.</p></div></div><div className="admin-trade-list">{trades.length === 0 && <p className="muted tidy-empty">No trades found.</p>}{trades.map((trade, index) => { const tradeId = trade.id || trade.tradeId || index; const expanded = expandedTradeIds.has(tradeId); const fromItems = normalizeTradeItems(trade, 'from'); const toItems = normalizeTradeItems(trade, 'to'); const chat = normalizeTradeChat(trade); const fromIc = getIcValue(trade, ['fromIc', 'fromIC', 'fromIcAmount', 'fromICAmount', 'offerIc', 'offeredIc', 'offerIC', 'offeredIC']); const toIc = getIcValue(trade, ['toIc', 'toIC', 'toIcAmount', 'toICAmount', 'requestIc', 'requestedIc', 'requestIC', 'requestedIC']); return <article className="admin-trade-card" key={tradeId}><button type="button" className="admin-trade-summary" onClick={() => toggleTrade(tradeId)}><span>{expanded ? '▾' : '▸'}</span><strong>Trade #{tradeId}</strong><em>{getTradeSummary(trade)}</em></button>{expanded && <div className="admin-trade-details"><div className="admin-trade-meta"><p><strong>Room:</strong> {trade.roomId || trade.room_id || 'Unknown'}</p><p><strong>From:</strong> {trade.fromUsername || trade.from_user || trade.fromUser || 'Unknown'}</p><p><strong>To:</strong> {trade.toUsername || trade.to_user || trade.toUser || 'Unknown'}</p><p><strong>Status:</strong> {trade.status || 'Unknown'}</p></div><TradeItemList title={`${trade.fromUsername || 'From'} offers`} items={fromItems} ic={fromIc} onPreview={setPreviewTradeImage} /><TradeItemList title={`${trade.toUsername || 'To'} offers`} items={toItems} ic={toIc} onPreview={setPreviewTradeImage} /><div className="admin-trade-chat"><h3>Chat History</h3><ChatLog messages={chat} /></div><RawTradeDebug trade={trade} /></div>}</article>; })}</div></section>}

      {activeTab === 'audit' && <AuditLogTab auditLogs={auditLogs} query={auditQuery} setQuery={setAuditQuery} actionFilter={auditActionFilter} setActionFilter={setAuditActionFilter} />}

      {previewTradeImage && <div className="admin-image-preview-backdrop" role="dialog" aria-modal="true" onClick={() => setPreviewTradeImage(null)}><div className="admin-image-preview-modal" onClick={event => event.stopPropagation()}><div className="admin-image-preview-header"><strong>{previewTradeImage.title}</strong><button type="button" className="ghost" onClick={() => setPreviewTradeImage(null)}>Close</button></div><img src={previewTradeImage.src} alt={previewTradeImage.title || 'Trade item preview'} /></div></div>}
    </section>
  );
}
