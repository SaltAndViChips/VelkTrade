import { useEffect, useMemo, useState } from 'react';
import Notifications from './Notifications';

const LOCAL_NOTIFICATIONS_KEY = 'velktrade:sidebar-activity-notifications:v1';
const MAX_LOCAL_NOTIFICATIONS = 80;

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

function isAdminPlayer(player) {
  return Boolean(player?.isAdmin || player?.is_admin || player?.highestBadge === 'admin' || String(player?.username || '').toLowerCase() === 'salt');
}

function isVerifiedPlayer(player) {
  return Boolean(player?.isVerified || player?.is_verified || player?.highestBadge === 'verified');
}

function statusLabel(player) {
  if (player?.status === 'trade') return 'In trade';
  if (player?.status === 'bazaar') return 'Browsing the Bazaar';
  if (player?.status === 'away') return 'Away';
  return 'Online';
}

function readLocalNotifications() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_NOTIFICATIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_LOCAL_NOTIFICATIONS) : [];
  } catch {
    return [];
  }
}

function writeLocalNotifications(notifications) {
  try {
    window.localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, MAX_LOCAL_NOTIFICATIONS)));
  } catch {}
}

function activityToNotification(activity) {
  const type = activity?.type || (activity?.kind === 'auction' ? 'auction_activity'
    : activity?.kind === 'bazaar' ? 'verified_bazaar_activity'
    : activity?.kind === 'invite' ? 'room_invite'
    : activity?.kind === 'trade' ? 'offline_trade'
    : 'activity');

  return {
    id: activity?.key || activity?.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    title: activity?.title || 'VelkTrade activity',
    message: activity?.message || activity?.body || 'New activity.',
    createdAt: activity?.createdAt || new Date().toISOString(),
    read: false,
    seen: false,
    payload: activity?.payload || {},
    localOnly: true
  };
}

function mergeLocalNotification(current, notification) {
  if (!notification?.id) return current;
  if (current.some(item => String(item.id) === String(notification.id))) return current;
  return [notification, ...current].slice(0, MAX_LOCAL_NOTIFICATIONS);
}

export default function PresenceNotificationsDropdown({
  currentUser,
  onlineUsers = [],
  currentRoomId = '',
  pendingRoomInvite = null,
  notifications = [],
  preferences = {},
  tradeStatuses = {},
  unseenCount = 0,
  onRefreshNotifications = () => {},
  onMarkRead = () => {},
  onMarkAllRead = () => {},
  onSavePreferences = () => {},
  onCheckTrade = () => {},
  onAcceptRoomInvite = () => {},
  onDeclineRoomInvite = () => {},
  onInvitePlayer = () => {},
  onCancelInvite = () => {}
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('online');
  const [localNotifications, setLocalNotifications] = useState(() => readLocalNotifications());

  useEffect(() => {
    function reloadLocalNotifications() {
      setLocalNotifications(readLocalNotifications());
    }

    function handleActivity(event) {
      const next = activityToNotification(event.detail || {});
      setLocalNotifications(current => {
        const merged = mergeLocalNotification(current, next);
        writeLocalNotifications(merged);
        return merged;
      });
    }

    function handleStorage(event) {
      if (event.key === LOCAL_NOTIFICATIONS_KEY) reloadLocalNotifications();
    }

    window.addEventListener('velktrade:activity-notification', handleActivity);
    window.addEventListener('velktrade:activity-notification-sync', reloadLocalNotifications);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('velktrade:activity-notification', handleActivity);
      window.removeEventListener('velktrade:activity-notification-sync', reloadLocalNotifications);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const combinedNotifications = useMemo(() => {
    const map = new Map();
    for (const notification of [...localNotifications, ...(Array.isArray(notifications) ? notifications : [])]) {
      const id = notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || ''}`;
      if (!id || map.has(String(id))) continue;
      map.set(String(id), notification);
    }
    return Array.from(map.values());
  }, [localNotifications, notifications]);

  const localUnreadCount = useMemo(() => localNotifications.filter(notification => !notification.read && !notification.seen).length, [localNotifications]);
  const totalUnseenCount = Number(unseenCount || 0) + localUnreadCount;

  const sortedUsers = useMemo(() => {
    return (Array.isArray(onlineUsers) ? onlineUsers : [])
      .filter(player => Number(player?.id) !== Number(currentUser?.id))
      .sort((a, b) => {
        const adminDiff = Number(isAdminPlayer(b)) - Number(isAdminPlayer(a));
        if (adminDiff) return adminDiff;
        const verifiedDiff = Number(isVerifiedPlayer(b)) - Number(isVerifiedPlayer(a));
        if (verifiedDiff) return verifiedDiff;
        return String(a?.username || '').localeCompare(String(b?.username || ''));
      });
  }, [onlineUsers, currentUser]);

  function openProfile(username) {
    if (!username) return;
    window.history.pushState({}, '', getProfileUrl(username));
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  function markRead(id) {
    const wasLocal = localNotifications.some(notification => String(notification.id) === String(id));
    if (wasLocal) {
      setLocalNotifications(current => {
        const next = current.map(notification => String(notification.id) === String(id) ? { ...notification, read: true, seen: true } : notification);
        writeLocalNotifications(next);
        return next;
      });
      return;
    }
    onMarkRead(id);
  }

  function markAllRead() {
    setLocalNotifications(current => {
      const next = current.map(notification => ({ ...notification, read: true, seen: true }));
      writeLocalNotifications(next);
      return next;
    });
    onMarkAllRead();
  }

  function refreshNotifications() {
    setLocalNotifications(readLocalNotifications());
    onRefreshNotifications();
  }

  return (
    <div className="presence-dropdown">
      <button type="button" className="presence-toggle" onClick={() => setOpen(value => !value)} title="Online players and notifications" aria-label="Online players and notifications">
        ≡
        {Number(totalUnseenCount) > 0 && <span>{totalUnseenCount}</span>}
      </button>

      {open && (
        <section className="presence-panel">
          <div className="presence-tabs">
            <button type="button" className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>Online</button>
            <button type="button" className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
              Notifications {Number(totalUnseenCount) > 0 && <span className="mini-count">{totalUnseenCount}</span>}
            </button>
          </div>

          {tab === 'online' && (
            <div className="presence-list">
              <div className="presence-panel-title"><strong>Online Players</strong><span>{sortedUsers.length}</span></div>
              {pendingRoomInvite && <div className="presence-pending-invite"><span>Pending invite to <strong>{pendingRoomInvite.toUsername || 'player'}</strong></span><button type="button" className="ghost" onClick={onCancelInvite}>Cancel Invite</button></div>}
              {!currentRoomId && <p className="muted presence-hint">Join or create a room to invite online players.</p>}
              {sortedUsers.length === 0 && <p className="muted tidy-empty">No other players online.</p>}
              {sortedUsers.map(player => {
                const admin = isAdminPlayer(player);
                const verified = isVerifiedPlayer(player);
                const away = player?.status === 'away';
                const inviteDisabled = !currentRoomId || Boolean(pendingRoomInvite);
                return <article className="presence-player-card" key={player.id || player.username}><div className="presence-player-main"><span className={`online-dot ${away ? 'away' : ''}`} /><strong>{player.username}</strong>{admin ? <span className="admin-badge">Admin</span> : verified ? <span className="verified-badge mini" title="Verified user">✓</span> : null}<small>{statusLabel(player)}</small></div><div className="presence-player-actions"><button type="button" className="ghost" onClick={() => openProfile(player.username)}>Profile</button><button type="button" disabled={inviteDisabled} onClick={() => onInvitePlayer(player.username)}>{pendingRoomInvite ? 'Invite Pending' : 'Invite'}</button></div></article>;
              })}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="presence-notifications-tab">
              <Notifications compact notifications={combinedNotifications} preferences={preferences || {}} tradeStatuses={tradeStatuses || {}} onRefresh={refreshNotifications} onMarkRead={markRead} onMarkAllRead={markAllRead} onSavePreferences={onSavePreferences} onCheckTrade={onCheckTrade} onAcceptRoomInvite={onAcceptRoomInvite} onDeclineRoomInvite={onDeclineRoomInvite} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
