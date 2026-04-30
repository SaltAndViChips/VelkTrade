import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const DEVELOPER_NAMES = new Set(['salt', 'velkon']);

function normalizeUsername(value) {
  return String(value || '').trim();
}

function lowerUsername(value) {
  return normalizeUsername(value).toLowerCase();
}

function isDeveloperUser(user) {
  return Boolean(
    user?.isDeveloper ||
    user?.is_developer ||
    user?.highestBadge === 'developer' ||
    DEVELOPER_NAMES.has(lowerUsername(user?.username))
  );
}

function isAdminUser(user) {
  return Boolean(isDeveloperUser(user) || user?.isAdmin || user?.is_admin || user?.highestBadge === 'admin');
}

function isTrustedUser(user) {
  return Boolean(
    user?.isTrusted ||
    user?.isVerified ||
    user?.is_verified ||
    user?.highestBadge === 'trusted' ||
    user?.highestBadge === 'verified'
  );
}

function canModifyUser(currentUser, targetUser) {
  if (!isDeveloperUser(targetUser)) return true;
  return isDeveloperUser(currentUser);
}

function normalizeUser(user) {
  const developer = isDeveloperUser(user);
  const admin = Boolean(developer || user?.isAdmin || user?.is_admin);
  const trusted = Boolean(user?.isTrusted || user?.isVerified || user?.is_verified);

  return {
    ...user,
    id: user?.id ?? user?.userId,
    username: user?.username || user?.name || 'Unknown',
    isDeveloper: developer,
    isAdmin: admin,
    isVerified: trusted,
    isTrusted: trusted,
    highestBadge: developer ? 'developer' : admin ? 'admin' : trusted ? 'trusted' : 'none',
    online: Boolean(user?.online || user?.isOnline || user?.status === 'online')
  };
}

function UserBadge({ user }) {
  if (isDeveloperUser(user)) return <span className="developer-badge">🖥️ Developer</span>;
  if (isAdminUser(user)) return <span className="admin-badge">🛡️ Admin</span>;
  if (isTrustedUser(user)) return <span className="trusted-badge">✓ Trusted</span>;
  return <span className="user-badge">User</span>;
}

function getTradeSummary(trade) {
  const items = [
    ...(trade?.items || []),
    ...(trade?.offeredItems || []),
    ...(trade?.requestedItems || [])
  ];

  const itemNames = items
    .map(item => item?.title || item?.name)
    .filter(Boolean)
    .slice(0, 4);

  const ic = trade?.icAmount || trade?.ic || trade?.offeredIc || trade?.offeredIC || 0;
  const parts = [];

  if (itemNames.length) parts.push(itemNames.join(', '));
  if (Number(ic)) parts.push(`${Number(ic).toLocaleString()} IC`);

  return parts.length ? parts.join(' + ') : 'No items';
}

async function tryApi(calls) {
  let lastError;

  for (const call of calls) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Request failed');
}

export default function AdminPanel({ currentUser, user }) {
  const viewer = currentUser || user || {};
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [trades, setTrades] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [openUserSearch, setOpenUserSearch] = useState(false);
  const [expandedTradeIds, setExpandedTradeIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadAdminData() {
    setLoading(true);
    setError('');

    try {
      const [usersData, roomsData, tradesData] = await Promise.allSettled([
        tryApi([
          () => api('/api/admin/users'),
          () => api('/api/admin/users/list')
        ]),
        tryApi([
          () => api('/api/admin/rooms/open'),
          () => api('/api/admin/rooms'),
          () => api('/api/rooms/open')
        ]),
        tryApi([
          () => api('/api/admin/trades'),
          () => api('/api/trades')
        ])
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
    } catch (loadError) {
      setError(loadError.message || 'Could not load admin panel.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return users
      .filter(candidate => {
        if (!needle) return true;

        return [
          candidate.id,
          candidate.username,
          candidate.highestBadge
        ]
          .filter(value => value !== undefined && value !== null)
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .filter(candidate => {
        if (filter === 'developers') return isDeveloperUser(candidate);
        if (filter === 'admins') return !isDeveloperUser(candidate) && isAdminUser(candidate);
        if (filter === 'trusted') return !isDeveloperUser(candidate) && !isAdminUser(candidate) && isTrustedUser(candidate);
        if (filter === 'online') return Boolean(candidate.online);
        return true;
      })
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  }, [users, query, filter]);

  async function setAdminFlag(targetUser, isAdmin) {
    setMessage('');
    setError('');

    if (!canModifyUser(viewer, targetUser)) {
      setError('Developer accounts can only be modified by developers.');
      return;
    }

    try {
      await tryApi([
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/admin`, {
          method: 'PUT',
          body: JSON.stringify({ isAdmin })
        }),
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/admin`, {
          method: 'POST',
          body: JSON.stringify({ isAdmin })
        }),
        () => api('/api/admin/users/admin', {
          method: 'POST',
          body: JSON.stringify({ username: targetUser.username, isAdmin })
        })
      ]);

      setMessage(`${targetUser.username} updated.`);
      await loadAdminData();
    } catch (adminError) {
      setError(adminError.message || 'Could not update admin flag.');
    }
  }

  async function setTrustedFlag(targetUser, isVerified) {
    setMessage('');
    setError('');

    if (!canModifyUser(viewer, targetUser)) {
      setError('Developer accounts can only be modified by developers.');
      return;
    }

    try {
      await tryApi([
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/verified`, {
          method: 'PUT',
          body: JSON.stringify({ isVerified })
        }),
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/verified`, {
          method: 'POST',
          body: JSON.stringify({ isVerified })
        }),
        () => api('/api/admin/users/verified', {
          method: 'POST',
          body: JSON.stringify({ username: targetUser.username, isVerified })
        })
      ]);

      setMessage(`${targetUser.username} updated.`);
      await loadAdminData();
    } catch (trustedError) {
      setError(trustedError.message || 'Could not update trusted flag.');
    }
  }

  async function resetPassword(targetUser) {
    setMessage('');
    setError('');

    if (!canModifyUser(viewer, targetUser)) {
      setError('Developer passwords can only be reset by developers.');
      return;
    }

    const password = window.prompt(`Enter a new password for ${targetUser.username}:`);
    if (!password) return;

    try {
      await tryApi([
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password })
        }),
        () => api(`/api/admin/users/${encodeURIComponent(targetUser.username)}/password`, {
          method: 'PUT',
          body: JSON.stringify({ password })
        }),
        () => api('/api/admin/users/reset-password', {
          method: 'POST',
          body: JSON.stringify({ username: targetUser.username, password })
        })
      ]);

      setMessage(`Password reset for ${targetUser.username}.`);
    } catch (passwordError) {
      setError(passwordError.message || 'Could not reset password.');
    }
  }

  function toggleTrade(tradeId) {
    setExpandedTradeIds(previous => {
      const next = new Set(previous);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  }

  function enterRoom(room) {
    const roomId = room.roomId || room.id;
    if (!roomId) return;

    window.history.pushState({}, '', `/room/${encodeURIComponent(roomId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <section className="admin-panel rewritten-admin-panel">
      <div className="panel-title-row">
        <div>
          <h1>Admin Panel</h1>
          <p className="muted">Manage users, active rooms, and trade records.</p>
        </div>

        <button type="button" className="ghost" onClick={loadAdminData}>
          Refresh
        </button>
      </div>

      {message && <p className="success-message">{message}</p>}
      {error && <p className="error-message">{error}</p>}
      {loading && <p className="muted">Loading admin data...</p>}

      <section className="card admin-users-card">
        <button
          type="button"
          className="admin-section-toggle"
          onClick={() => setOpenUserSearch(value => !value)}
        >
          <span>{openUserSearch ? '▾' : '▸'} User Search</span>
          <small>Sorted by ID</small>
        </button>

        {openUserSearch && (
          <div className="admin-users-body">
            <div className="admin-filter-grid">
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search users by ID, name, or role..."
              />

              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="all">All users</option>
                <option value="developers">Developers</option>
                <option value="admins">Admins</option>
                <option value="trusted">Trusted</option>
                <option value="online">Online</option>
              </select>
            </div>

            <div className="admin-user-list">
              {filteredUsers.map(candidate => {
                const modifiable = canModifyUser(viewer, candidate);
                const developer = isDeveloperUser(candidate);
                const adminRole = isAdminUser(candidate);
                const trusted = isTrustedUser(candidate);

                return (
                  <article className="admin-user-card" key={candidate.id || candidate.username}>
                    <div className="admin-user-main">
                      <span className="admin-user-id">#{candidate.id ?? '?'}</span>
                      <strong>{candidate.username}</strong>
                      <UserBadge user={candidate} />
                      {candidate.online && <span className="online-mini-pill">Online</span>}
                    </div>

                    {developer && !isDeveloperUser(viewer) && (
                      <p className="muted admin-protected-note">
                        Developer account. Only developers can modify this user.
                      </p>
                    )}

                    <div className="admin-user-actions">
                      {!developer && (
                        adminRole ? (
                          <button
                            type="button"
                            className="danger"
                            disabled={!modifiable}
                            onClick={() => setAdminFlag(candidate, false)}
                          >
                            Remove Admin
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!modifiable}
                            onClick={() => setAdminFlag(candidate, true)}
                          >
                            Make Admin
                          </button>
                        )
                      )}

                      {!developer && (
                        trusted ? (
                          <button
                            type="button"
                            className="ghost"
                            disabled={!modifiable}
                            onClick={() => setTrustedFlag(candidate, false)}
                          >
                            Remove Trusted
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            disabled={!modifiable}
                            onClick={() => setTrustedFlag(candidate, true)}
                          >
                            Mark Trusted
                          </button>
                        )
                      )}

                      {modifiable && (
                        <button type="button" className="ghost" onClick={() => resetPassword(candidate)}>
                          Reset Password
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}

              {filteredUsers.length === 0 && (
                <p className="muted tidy-empty">No matching users.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card admin-rooms-card">
        <div className="panel-title-row">
          <div>
            <h2>Open Rooms</h2>
            <p className="muted">Rooms currently available from the backend.</p>
          </div>
        </div>

        <div className="admin-room-list">
          {rooms.length === 0 && <p className="muted tidy-empty">No open rooms found.</p>}

          {rooms.map(room => {
            const roomId = room.roomId || room.id;
            const players = room.players || room.users || [];

            return (
              <article className="admin-room-card" key={roomId}>
                <div>
                  <strong>Room {roomId}</strong>
                  <p className="muted">
                    {players.length ? players.map(player => player.username || player.name).join(' vs ') : 'No player list available'}
                  </p>
                </div>

                <button type="button" onClick={() => enterRoom(room)}>
                  Enter
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card admin-trades-card">
        <div className="panel-title-row">
          <div>
            <h2>Trades</h2>
            <p className="muted">Expandable trade summaries with items and chat when available.</p>
          </div>
        </div>

        <div className="admin-trade-list">
          {trades.length === 0 && <p className="muted tidy-empty">No trades found.</p>}

          {trades.map((trade, index) => {
            const tradeId = trade.id || trade.tradeId || index;
            const expanded = expandedTradeIds.has(tradeId);
            const chat = trade.chat || trade.messages || trade.chatLog || [];
            const items = [
              ...(trade.items || []),
              ...(trade.offeredItems || []),
              ...(trade.requestedItems || [])
            ];

            return (
              <article className="admin-trade-card" key={tradeId}>
                <button type="button" className="admin-trade-summary" onClick={() => toggleTrade(tradeId)}>
                  <span>{expanded ? '▾' : '▸'}</span>
                  <strong>Trade #{tradeId}</strong>
                  <em>{getTradeSummary(trade)}</em>
                </button>

                {expanded && (
                  <div className="admin-trade-details">
                    <div>
                      <h3>Items</h3>
                      {items.length === 0 ? (
                        <p className="muted">No items.</p>
                      ) : (
                        <ul>
                          {items.map((item, itemIndex) => (
                            <li key={`${tradeId}-item-${itemIndex}`}>
                              {item.title || item.name || 'Unnamed item'}
                              {item.price && ` — ${item.price}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h3>Chat Log</h3>
                      {chat.length === 0 ? (
                        <p className="muted">No chat messages.</p>
                      ) : (
                        <ul>
                          {chat.map((messageItem, chatIndex) => (
                            <li key={`${tradeId}-chat-${chatIndex}`}>
                              <strong>{messageItem.username || messageItem.author || 'System'}:</strong>{' '}
                              {messageItem.message || messageItem.text || ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
