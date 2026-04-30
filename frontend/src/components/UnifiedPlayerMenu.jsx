import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const DEVELOPER_NAMES = new Set(['salt', 'velkon']);

const DEFAULT_PREFS = {
  counters: true,
  offlineTrades: true,
  roomInvites: true,
  declines: true,
  allowUnverifiedNotifications: false,
  soundVolume: 0.55,
  flashTab: true
};

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function asArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function getUserKey(user) {
  if (user?.id !== undefined && user?.id !== null) return `id:${user.id}`;
  return `name:${lower(user?.username || user?.name)}`;
}

function normalizeUser(user) {
  const username = user?.username || user?.name || user?.displayName || 'Unknown';
  const role = lower(user?.role || user?.highestBadge || user?.badge || user?.accountType || user?.type);
  const developer = Boolean(
    user?.isDeveloper ||
    user?.is_developer ||
    role === 'developer' ||
    DEVELOPER_NAMES.has(lower(username))
  );
  const admin = Boolean(
    developer ||
    user?.isAdmin ||
    user?.is_admin ||
    role === 'admin' ||
    role === 'moderator'
  );
  const verified = Boolean(
    user?.isVerified ||
    user?.is_verified ||
    user?.isTrusted ||
    user?.is_trusted ||
    role === 'verified' ||
    role === 'trusted'
  );

  let status = lower(
    user?.status ||
    user?.presence ||
    user?.activity ||
    user?.currentView ||
    user?.view ||
    user?.location ||
    'online'
  );

  if (status.includes('trade') || user?.roomId || user?.currentRoomId) status = 'trade';
  else if (status.includes('bazaar')) status = 'bazaar';
  else if (status.includes('away')) status = 'away';
  else status = 'online';

  const rawSince = user?.statusSince || user?.status_since || user?.awaySince || user?.away_since || user?.lastSeen || user?.last_seen_at;
  const parsedSince = rawSince ? Number(new Date(rawSince).getTime() || rawSince) : Date.now();
  const statusSince = Number.isFinite(parsedSince) ? parsedSince : Date.now();

  return {
    ...user,
    id: user?.id ?? user?.userId,
    username,
    isDeveloper: developer,
    isAdmin: admin,
    isVerified: verified,
    highestBadge: developer ? 'developer' : admin ? 'admin' : verified ? 'verified' : 'none',
    status,
    statusSince,
    awayForMs: status === 'away' ? Math.max(0, Date.now() - statusSince) : 0
  };
}

function roleRank(user) {
  if (user.isDeveloper) return 3;
  if (user.isAdmin) return 2;
  if (user.isVerified) return 1;
  return 0;
}

function RoleIcon({ user }) {
  if (user.isDeveloper) return <span className="unified-role-icon developer" title="Developer">🖥️</span>;
  if (user.isAdmin) return <span className="unified-role-icon admin" title="Admin">🛡️</span>;
  if (user.isVerified) return <span className="unified-role-icon verified" title="Verified">✓</span>;
  return null;
}

function statusText(user) {
  if (user.status === 'trade') return 'In trade room';
  if (user.status === 'bazaar') return 'Viewing Bazaar';
  if (user.status === 'away') {
    const minutes = Math.max(1, Math.floor(Number(user.awayForMs || 0) / 60000));
    return `Away for ${minutes}m`;
  }
  return 'Online';
}

function profileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

function notificationId(notification) {
  return notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || notification?.created_at || Math.random()}`;
}

function payloadOf(notification) {
  if (!notification?.payload) return {};
  if (typeof notification.payload === 'string') {
    try {
      return JSON.parse(notification.payload);
    } catch {
      return {};
    }
  }
  return notification.payload;
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

export default function UnifiedPlayerMenu({
  currentUser,
  onlineUsers = [],
  currentRoomId = '',
  onInvitePlayer = () => {}
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('online');
  const [fetchedUsers, setFetchedUsers] = useState([]);
  const [roleUsers, setRoleUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');

  async function loadOnlineUsers() {
    try {
      const data = await tryApi([
        () => api('/api/online-users'),
        () => api('/api/users/online')
      ]);
      setFetchedUsers(asArray(data, ['users', 'onlineUsers', 'data']).map(normalizeUser));
    } catch {
      setFetchedUsers([]);
    }
  }

  async function loadRoleUsers() {
    try {
      const data = await tryApi([
        () => api('/api/admin/users'),
        () => api('/api/admin/users/list')
      ]);
      setRoleUsers(asArray(data, ['users', 'data']).map(normalizeUser));
    } catch {
      setRoleUsers([]);
    }
  }

  async function loadNotifications() {
    try {
      const data = await tryApi([
        () => api('/api/notifications'),
        () => api('/api/me/notifications')
      ]);
      setNotifications(asArray(data, ['notifications', 'data']));
    } catch {
      setNotifications([]);
    }
  }

  async function loadPreferences() {
    try {
      const data = await tryApi([
        () => api('/api/notifications/preferences'),
        () => api('/api/me/notification-preferences'),
        () => api('/api/notification-preferences')
      ]);
      setPrefs({ ...DEFAULT_PREFS, ...(data.preferences || data.notificationPreferences || data || {}) });
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }

  useEffect(() => {
    loadOnlineUsers();
    loadRoleUsers();
    loadNotifications();
    loadPreferences();

    const onlineTimer = window.setInterval(() => {
      loadOnlineUsers();
      loadRoleUsers();
    }, 8000);
    const notificationTimer = window.setInterval(loadNotifications, 15000);

    return () => {
      window.clearInterval(onlineTimer);
      window.clearInterval(notificationTimer);
    };
  }, []);

  const users = useMemo(() => {
    const byKey = new Map();

    for (const user of fetchedUsers) {
      byKey.set(getUserKey(user), normalizeUser(user));
    }

    for (const user of Array.isArray(onlineUsers) ? onlineUsers : []) {
      const normalized = normalizeUser(user);
      const key = getUserKey(normalized);
      byKey.set(key, normalizeUser({ ...(byKey.get(key) || {}), ...normalized }));
    }

    for (const user of roleUsers) {
      const key = getUserKey(user);
      if (byKey.has(key)) {
        byKey.set(key, normalizeUser({ ...byKey.get(key), ...user }));
      }
    }

    return [...byKey.values()]
      .filter(user => user.username)
      .filter(user => Number(user.id) !== Number(currentUser?.id))
      .sort((a, b) => {
        const roleDiff = roleRank(b) - roleRank(a);
        if (roleDiff) return roleDiff;
        return String(a.username).localeCompare(String(b.username));
      });
  }, [fetchedUsers, onlineUsers, roleUsers, currentUser]);

  const unreadCount = useMemo(() => {
    return notifications.filter(notification => !notification.read && !notification.seen && !notification.isRead).length;
  }, [notifications]);

  function openProfile(username) {
    if (!username) return;
    window.history.pushState({}, '', profileUrl(username));
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  async function savePreferences() {
    try {
      await tryApi([
        () => api('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
        () => api('/api/me/notification-preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
        () => api('/api/notification-preferences', { method: 'PUT', body: JSON.stringify(prefs) })
      ]);
      setSettingsOpen(false);
      setNotice('Notification settings saved.');
    } catch {
      setNotice('Could not save notification settings.');
    }
  }

  async function markRead(notification) {
    const id = notificationId(notification);
    try {
      await tryApi([
        () => api(`/api/notifications/${id}/read`, { method: 'POST' }),
        () => api(`/api/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) })
      ]);
    } catch {}
    setNotifications(previous => previous.map(item => notificationId(item) === id ? { ...item, read: true, seen: true, isRead: true } : item));
  }

  async function markAllRead() {
    try {
      await tryApi([
        () => api('/api/notifications/read-all', { method: 'POST' }),
        () => api('/api/notifications/mark-all-read', { method: 'POST' })
      ]);
    } catch {}
    setNotifications(previous => previous.map(item => ({ ...item, read: true, seen: true, isRead: true })));
  }

  async function acceptRoomInvite(notification) {
    const payload = payloadOf(notification);
    const roomId = payload.roomId || notification.roomId;
    if (!roomId) return;

    try {
      await tryApi([
        () => api(`/api/rooms/${roomId}/invite/accept`, { method: 'POST' }),
        () => api(`/api/rooms/${roomId}/join`, { method: 'POST' })
      ]);
    } catch {}

    window.history.pushState({}, '', `/room/${encodeURIComponent(roomId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  async function declineRoomInvite(notification) {
    const payload = payloadOf(notification);
    const roomId = payload.roomId || notification.roomId;
    try {
      if (roomId) await api(`/api/rooms/${roomId}/invite/decline`, { method: 'POST' });
    } catch {}
    await markRead(notification);
  }

  function checkTrade(notification) {
    const payload = payloadOf(notification);
    const tradeId = payload.tradeId || notification.tradeId;
    if (!tradeId) return;

    window.history.pushState({}, '', `/trades/${encodeURIComponent(tradeId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  return (
    <div className="unified-player-menu">
      <button
        type="button"
        className="unified-player-trigger"
        title="Online players and notifications"
        aria-label="Online players and notifications"
        onClick={() => setOpen(value => !value)}
      >
        ≡
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>

      {open && (
        <section className="unified-player-panel">
          <div className="unified-player-tabs">
            <button type="button" className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Online</button>
            <button type="button" className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
              Notifications {unreadCount > 0 && <span className="unified-mini-count">{unreadCount}</span>}
            </button>
          </div>

          {notice && <p className="unified-menu-notice">{notice}</p>}

          {tab === 'online' && (
            <div className="unified-online-pane">
              <div className="unified-menu-header">
                <strong>Online Players</strong>
                <span>{users.length}</span>
              </div>

              {users.length === 0 && <p className="muted tidy-empty">No other players online.</p>}

              <div className="unified-player-list">
                {users.map(user => (
                  <article className="unified-player-card" key={user.id || user.username}>
                    <div className="unified-player-main">
                      <span className={`unified-presence-dot ${user.status === 'away' ? 'away' : ''}`} />
                      <strong>{user.username}</strong>
                      <RoleIcon user={user} />
                      <small>{statusText(user)}</small>
                    </div>

                    <div className="unified-player-actions">
                      <button type="button" className="ghost" onClick={() => openProfile(user.username)}>Profile</button>
                      <button type="button" onClick={() => onInvitePlayer(user.username)}>Invite</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="unified-notifications-pane">
              <div className="unified-menu-header">
                <strong>Notifications</strong>
                <div className="unified-notification-actions">
                  <button type="button" className="ghost" onClick={loadNotifications}>Refresh</button>
                  <button type="button" className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙</button>
                  <button type="button" onClick={markAllRead}>Mark all read</button>
                </div>
              </div>

              {settingsOpen && (
                <section className="unified-settings-card">
                  <label><input type="checkbox" checked={Boolean(prefs.counters)} onChange={event => setPrefs({ ...prefs, counters: event.target.checked })} /><span>Counter-offer notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.offlineTrades)} onChange={event => setPrefs({ ...prefs, offlineTrades: event.target.checked })} /><span>Offline trade request notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.roomInvites)} onChange={event => setPrefs({ ...prefs, roomInvites: event.target.checked })} /><span>Room invite notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.declines)} onChange={event => setPrefs({ ...prefs, declines: event.target.checked })} /><span>Decline notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.allowUnverifiedNotifications)} onChange={event => setPrefs({ ...prefs, allowUnverifiedNotifications: event.target.checked })} /><span>Notifications from unverified users</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.flashTab)} onChange={event => setPrefs({ ...prefs, flashTab: event.target.checked })} /><span>Flash browser tab/window</span></label>
                  <label className="unified-volume-row"><span>Notification volume</span><input type="range" min="0" max="1" step="0.05" value={Number(prefs.soundVolume ?? 0.55)} onChange={event => setPrefs({ ...prefs, soundVolume: Number(event.target.value) })} /></label>
                  <div className="unified-settings-actions"><button type="button" onClick={savePreferences}>Save</button><button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>Cancel</button></div>
                </section>
              )}

              <div className="unified-notification-list">
                {notifications.length === 0 && <p className="muted tidy-empty">No notifications yet.</p>}
                {notifications.map(notification => {
                  const id = notificationId(notification);
                  const payload = payloadOf(notification);
                  const type = notification.type || '';
                  const title = notification.title || 'Notification';
                  const message = notification.message || notification.body || '';
                  const read = Boolean(notification.read || notification.seen || notification.isRead);
                  const tradeId = payload.tradeId || notification.tradeId;
                  const roomId = payload.roomId || notification.roomId;

                  return (
                    <article className={`unified-notification-card ${read ? 'read' : 'unread'}`} key={id}>
                      <div>
                        <strong>{title}</strong>
                        {message && <p>{message}</p>}
                        {(notification.createdAt || notification.created_at) && <small>{new Date(notification.createdAt || notification.created_at).toLocaleString()}</small>}
                      </div>

                      <div className="unified-notification-buttons">
                        {!read && <button type="button" className="ghost" onClick={() => markRead(notification)}>Read</button>}
                        {tradeId && <button type="button" onClick={() => checkTrade(notification)}>Check</button>}
                        {type === 'room_invite' && roomId && (
                          <>
                            <button type="button" onClick={() => acceptRoomInvite(notification)}>Join</button>
                            <button type="button" className="ghost" onClick={() => declineRoomInvite(notification)}>Decline</button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
