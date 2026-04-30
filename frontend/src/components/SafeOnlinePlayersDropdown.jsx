import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Notifications from './Notifications';

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

function isDeveloperPlayer(player) {
  return Boolean(
    player?.isDeveloper ||
    player?.is_developer ||
    player?.highestBadge === 'developer' ||
    ['salt', 'velkon'].includes(String(player?.username || '').toLowerCase())
  );
}

function isAdminPlayer(player) {
  return Boolean(
    isDeveloperPlayer(player) ||
    player?.isAdmin ||
    player?.is_admin ||
    player?.highestBadge === 'admin'
  );
}

function isTrustedPlayer(player) {
  return Boolean(
    player?.isTrusted ||
    player?.isVerified ||
    player?.is_verified ||
    player?.highestBadge === 'trusted' ||
    player?.highestBadge === 'verified'
  );
}

function statusLabel(player) {
  const status = player?.status || 'online';

  if (status === 'trade') return 'In trade room';
  if (status === 'bazaar') return 'Viewing Bazaar';

  if (status === 'away') {
    const ms = Number(player?.awayForMs || (player?.statusSince ? Date.now() - Number(player.statusSince) : 0));
    const mins = Math.max(1, Math.floor(ms / 60000));
    return `Away for ${mins}m`;
  }

  return 'Online';
}

function RoleIcon({ player }) {
  if (isDeveloperPlayer(player)) {
    return <span className="role-icon-badge developer-icon" title="Developer">🖥️</span>;
  }

  if (isAdminPlayer(player)) {
    return <span className="role-icon-badge admin-icon" title="Admin">🛡️</span>;
  }

  if (isTrustedPlayer(player)) {
    return <span className="role-icon-badge trusted-icon" title="Trusted">✓</span>;
  }

  return null;
}

export default function SafeOnlinePlayersDropdown({
  currentUser,
  onlineUsers = [],
  currentRoomId = '',
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
  onInvitePlayer = () => {}
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('online');
  const [fallbackUsers, setFallbackUsers] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadFallbackUsers() {
      try {
        const data = await api('/api/online-users');
        if (!cancelled) setFallbackUsers(data.users || []);
      } catch {
        if (!cancelled) setFallbackUsers([]);
      }
    }

    loadFallbackUsers();
    const interval = window.setInterval(loadFallbackUsers, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const sourceUsers = Array.isArray(onlineUsers) && onlineUsers.length ? onlineUsers : fallbackUsers;

  const sortedUsers = useMemo(() => {
    return (Array.isArray(sourceUsers) ? sourceUsers : [])
      .filter(player => Number(player?.id) !== Number(currentUser?.id))
      .sort((a, b) => {
        const developerDiff = Number(isDeveloperPlayer(b)) - Number(isDeveloperPlayer(a));
        if (developerDiff) return developerDiff;

        const adminDiff = Number(isAdminPlayer(b)) - Number(isAdminPlayer(a));
        if (adminDiff) return adminDiff;

        const trustedDiff = Number(isTrustedPlayer(b)) - Number(isTrustedPlayer(a));
        if (trustedDiff) return trustedDiff;

        return String(a?.username || '').localeCompare(String(b?.username || ''));
      });
  }, [sourceUsers, currentUser]);

  function openProfile(username) {
    if (!username) return;
    window.history.pushState({}, '', getProfileUrl(username));
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  return (
    <div className="safe-online-dropdown">
      <button
        type="button"
        className="safe-online-toggle"
        onClick={() => setOpen(value => !value)}
        title="Online players and notifications"
        aria-label="Online players and notifications"
      >
        ≡
        {Number(unseenCount) > 0 && <span>{unseenCount}</span>}
      </button>

      {open && (
        <section className="safe-online-panel">
          <div className="safe-online-tabs">
            <button type="button" className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>
              Online
            </button>
            <button type="button" className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}>
              Notifications {Number(unseenCount) > 0 && <span className="mini-count">{unseenCount}</span>}
            </button>
          </div>

          {tab === 'online' && (
            <>
              <div className="safe-online-header">
                <strong>Online Players</strong>
                <span>{sortedUsers.length}</span>
              </div>

              {sortedUsers.length === 0 && <p className="muted tidy-empty">No other players online.</p>}

              <div className="safe-online-list">
                {sortedUsers.map(player => {
                  const away = player?.status === 'away';

                  return (
                    <article className="safe-online-card" key={player.id || player.username}>
                      <div className="safe-online-main">
                        <span className={`online-dot ${away ? 'away' : ''}`} />
                        <strong>{player.username}</strong>
                        <RoleIcon player={player} />
                        <small>{statusLabel(player)}</small>
                      </div>

                      <div className="safe-online-actions">
                        <button type="button" className="ghost" onClick={() => openProfile(player.username)}>
                          Profile
                        </button>
                        <button type="button" onClick={() => onInvitePlayer(player.username)}>
                          Invite
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'notifications' && (
            <div className="safe-notifications-tab">
              <Notifications
                compact
                notifications={Array.isArray(notifications) ? notifications : []}
                preferences={preferences || {}}
                tradeStatuses={tradeStatuses || {}}
                onRefresh={onRefreshNotifications}
                onMarkRead={onMarkRead}
                onMarkAllRead={onMarkAllRead}
                onSavePreferences={onSavePreferences}
                onCheckTrade={onCheckTrade}
                onAcceptRoomInvite={onAcceptRoomInvite}
                onDeclineRoomInvite={onDeclineRoomInvite}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
