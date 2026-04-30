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

function normalizeArrayResponse(data, keys) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function getNotificationId(notification) {
  return notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || notification?.created_at || Math.random()}`;
}

function getPayload(notification) {
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

function normalizedRole(player) {
  const username = lower(player?.username);
  const role = lower(player?.role || player?.highestBadge || player?.badge || player?.accountType || player?.type);

  if (
    player?.isDeveloper ||
    player?.is_developer ||
    role === 'developer' ||
    DEVELOPER_NAMES.has(username)
  ) {
    return 'developer';
  }

  if (
    player?.isAdmin ||
    player?.is_admin ||
    role === 'admin' ||
    role === 'moderator'
  ) {
    return 'admin';
  }

  if (
    player?.isVerified ||
    player?.is_verified ||
    player?.isTrusted ||
    player?.is_trusted ||
    role === 'verified' ||
    role === 'trusted'
  ) {
    return 'verified';
  }

  return 'user';
}

function roleRank(player) {
  const role = normalizedRole(player);
  if (role === 'developer') return 3;
  if (role === 'admin') return 2;
  if (role === 'verified') return 1;
  return 0;
}

function RoleIcon({ player }) {
  const role = normalizedRole(player);
  if (role === 'developer') return <span className="presence-role-icon developer" title="Developer">🖥️</span>;
  if (role === 'admin') return <span className="presence-role-icon admin" title="Admin">🛡️</span>;
  if (role === 'verified') return <span className="presence-role-icon verified" title="Verified">✓</span>;
  return null;
}

function normalizedStatus(player) {
  const raw = lower(player?.status || player?.presence || player?.activity || player?.currentView || player?.view || player?.location);

  if (raw.includes('trade') || player?.roomId || player?.currentRoomId) return 'trade';
  if (raw.includes('bazaar')) return 'bazaar';
  if (raw.includes('away')) return 'away';
  return 'online';
}

function statusText(player) {
  const status = normalizedStatus(player);

  if (status === 'trade') return 'In trade room';
  if (status === 'bazaar') return 'Viewing Bazaar';

  if (status === 'away') {
    const rawSince = player?.statusSince || player?.status_since || player?.awaySince || player?.away_since || player?.lastSeen || player?.last_seen_at;
    const since = rawSince ? Number(new Date(rawSince).getTime() || rawSince) : 0;
    const awayForMs = Number(player?.awayForMs || player?.away_for_ms || (since ? Date.now() - since : 0));
    const mins = Math.max(1, Math.floor(awayForMs / 60000));
    return `Away for ${mins}m`;
  }

  return 'Online';
}

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
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

export default function SafeOnlinePlayersDropdown({
  currentUser,
  onlineUsers = [],
  currentRoomId = '',
  notifications: propNotifications = [],
  preferences: propPreferences = {},
  unseenCount = 0,
  onInvitePlayer = () => {}
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('online');
  const [fetchedUsers, setFetchedUsers] = useState([]);
  const [notifications, setNotifications] = useState(Array.isArray(propNotifications) ? propNotifications : []);
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(propPreferences || {}) });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusTextLine, setStatusTextLine] = useState('');

  async function loadOnlineUsers() {
    try {
      const data = await api('/api/online-users');
      setFetchedUsers(normalizeArrayResponse(data, ['users', 'onlineUsers', 'data']));
    } catch {
      setFetchedUsers([]);
    }
  }

  async function loadNotifications() {
    try {
      const data = await tryApi([
        () => api('/api/notifications'),
        () => api('/api/me/notifications')
      ]);
      setNotifications(normalizeArrayResponse(data, ['notifications', 'data']));
    } catch {
      setNotifications(Array.isArray(propNotifications) ? propNotifications : []);
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
      setPrefs({ ...DEFAULT_PREFS, ...(propPreferences || {}) });
    }
  }

  useEffect(() => {
    loadOnlineUsers();
    loadNotifications();
    loadPreferences();

    const onlineTimer = window.setInterval(loadOnlineUsers, 10000);
    const notificationTimer = window.setInterval(loadNotifications, 15000);

    return () => {
      window.clearInterval(onlineTimer);
      window.clearInterval(notificationTimer);
    };
  }, []);

  const mergedUsers = useMemo(() => {
    const byKey = new Map();

    for (const user of fetchedUsers) {
      const key = user?.id ? `id:${user.id}` : `name:${lower(user?.username)}`;
      byKey.set(key, user);
    }

    for (const user of Array.isArray(onlineUsers) ? onlineUsers : []) {
      const key = user?.id ? `id:${user.id}` : `name:${lower(user?.username)}`;
      byKey.set(key, { ...(byKey.get(key) || {}), ...user });
    }

    return [...byKey.values()]
      .filter(user => user?.username)
      .filter(user => Number(user?.id) !== Number(currentUser?.id))
      .sort((a, b) => {
        const rankDiff = roleRank(b) - roleRank(a);
        if (rankDiff) return rankDiff;
        return String(a.username || '').localeCompare(String(b.username || ''));
      });
  }, [fetchedUsers, onlineUsers, currentUser]);

  const unreadCount = useMemo(() => {
    const fetchedUnread = notifications.filter(notification => !notification.read && !notification.seen && !notification.isRead).length;
    return Math.max(Number(unseenCount || 0), fetchedUnread);
  }, [notifications, unseenCount]);

  function openProfile(username) {
    if (!username) return;
    window.history.pushState({}, '', getProfileUrl(username));
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
      setStatusTextLine('Notification settings saved.');
    } catch {
      setStatusTextLine('Could not save notification settings.');
    }
  }

  async function markRead(notification) {
    const id = getNotificationId(notification);
    try {
      await tryApi([
        () => api(`/api/notifications/${id}/read`, { method: 'POST' }),
        () => api(`/api/notifications/${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) })
      ]);
    } catch {}
    setNotifications(previous => previous.map(item => getNotificationId(item) === id ? { ...item, read: true, seen: true, isRead: true } : item));
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
    const payload = getPayload(notification);
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
    const payload = getPayload(notification);
    const roomId = payload.roomId || notification.roomId;
    try {
      if (roomId) await api(`/api/rooms/${roomId}/invite/decline`, { method: 'POST' });
    } catch {}
    await markRead(notification);
  }

  function checkTrade(notification) {
    const payload = getPayload(notification);
    const tradeId = payload.tradeId || notification.tradeId;
    if (!tradeId) return;
    window.history.pushState({}, '', `/trades/${encodeURIComponent(tradeId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  return (
    <div className="presence-hub active-player-menu-rewrite">
      <button
        type="button"
        className="presence-hub-trigger"
        title="Online players and notifications"
        aria-label="Online players and notifications"
        onClick={() => setOpen(value => !value)}
      >
        ≡
        {unreadCount > 0 && <span>{unreadCount}</span>}
      </button>

      {open && (
        <section className="presence-hub-panel">
          <div className="presence-hub-tabs">
            <button type="button" className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Online</button>
            <button type="button" className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
              Notifications {unreadCount > 0 && <span className="presence-mini-count">{unreadCount}</span>}
            </button>
          </div>

          {statusTextLine && <p className="presence-status-line">{statusTextLine}</p>}

          {tab === 'online' && (
            <div className="presence-hub-online">
              <div className="presence-hub-header">
                <strong>Online Players</strong>
                <span>{mergedUsers.length}</span>
              </div>

              {mergedUsers.length === 0 && <p className="muted tidy-empty">No other players online.</p>}

              <div className="presence-player-list">
                {mergedUsers.map(player => {
                  const away = normalizedStatus(player) === 'away';
                  return (
                    <article className="presence-player-row" key={player.id || player.username}>
                      <div className="presence-player-info">
                        <span className={`presence-dot ${away ? 'away' : ''}`} />
                        <strong>{player.username}</strong>
                        <RoleIcon player={player} />
                        <small>{statusText(player)}</small>
                      </div>

                      <div className="presence-player-actions">
                        <button type="button" className="ghost" onClick={() => openProfile(player.username)}>Profile</button>
                        <button type="button" onClick={() => onInvitePlayer(player.username)}>Invite</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="presence-hub-notifications">
              <div className="presence-hub-header">
                <strong>Notifications</strong>
                <div className="presence-notification-actions">
                  <button type="button" className="ghost" onClick={loadNotifications}>Refresh</button>
                  <button type="button" className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙</button>
                  <button type="button" onClick={markAllRead}>Mark all read</button>
                </div>
              </div>

              {settingsOpen && (
                <section className="presence-settings-card">
                  <label><input type="checkbox" checked={Boolean(prefs.counters)} onChange={event => setPrefs({ ...prefs, counters: event.target.checked })} /><span>Counter-offer notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.offlineTrades)} onChange={event => setPrefs({ ...prefs, offlineTrades: event.target.checked })} /><span>Offline trade request notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.roomInvites)} onChange={event => setPrefs({ ...prefs, roomInvites: event.target.checked })} /><span>Room invite notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.declines)} onChange={event => setPrefs({ ...prefs, declines: event.target.checked })} /><span>Decline notifications</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.allowUnverifiedNotifications)} onChange={event => setPrefs({ ...prefs, allowUnverifiedNotifications: event.target.checked })} /><span>Notifications from unverified users</span></label>
                  <label><input type="checkbox" checked={Boolean(prefs.flashTab)} onChange={event => setPrefs({ ...prefs, flashTab: event.target.checked })} /><span>Flash browser tab/window</span></label>
                  <label className="presence-volume-row"><span>Notification volume</span><input type="range" min="0" max="1" step="0.05" value={Number(prefs.soundVolume ?? 0.55)} onChange={event => setPrefs({ ...prefs, soundVolume: Number(event.target.value) })} /></label>
                  <div className="presence-settings-actions"><button type="button" onClick={savePreferences}>Save</button><button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>Cancel</button></div>
                </section>
              )}

              <div className="presence-notification-list">
                {notifications.length === 0 && <p className="muted tidy-empty">No notifications yet.</p>}
                {notifications.map(notification => {
                  const id = getNotificationId(notification);
                  const payload = getPayload(notification);
                  const type = notification.type || '';
                  const title = notification.title || 'Notification';
                  const message = notification.message || notification.body || '';
                  const read = Boolean(notification.read || notification.seen || notification.isRead);
                  const tradeId = payload.tradeId || notification.tradeId;
                  const roomId = payload.roomId || notification.roomId;
                  return (
                    <article className={`presence-notification-row ${read ? 'read' : 'unread'}`} key={id}>
                      <div>
                        <strong>{title}</strong>
                        {message && <p>{message}</p>}
                        {(notification.createdAt || notification.created_at) && <small>{new Date(notification.createdAt || notification.created_at).toLocaleString()}</small>}
                      </div>
                      <div className="presence-notification-buttons">
                        {!read && <button type="button" className="ghost" onClick={() => markRead(notification)}>Read</button>}
                        {tradeId && <button type="button" onClick={() => checkTrade(notification)}>Check</button>}
                        {type === 'room_invite' && roomId && <><button type="button" onClick={() => acceptRoomInvite(notification)}>Join</button><button type="button" className="ghost" onClick={() => declineRoomInvite(notification)}>Decline</button></>}
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
