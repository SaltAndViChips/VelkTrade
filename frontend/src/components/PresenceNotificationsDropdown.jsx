import { useMemo, useState } from 'react';
import Notifications from './Notifications';

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

function statusLabel(player) {
  if (player.status === 'trading') return 'In trade';
  if (player.status === 'idle') return 'Idle';
  return 'Online';
}

export default function PresenceNotificationsDropdown({
  currentUser,
  onlineUsers = [],
  currentRoomId,
  notifications,
  preferences,
  tradeStatuses,
  unseenCount = 0,
  onRefreshNotifications,
  onMarkRead,
  onMarkAllRead,
  onSavePreferences,
  onCheckTrade,
  onAcceptRoomInvite,
  onDeclineRoomInvite,
  onInvitePlayer
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('online');

  const sortedUsers = useMemo(() => {
    return [...onlineUsers]
      .filter(player => Number(player.id) !== Number(currentUser?.id))
      .sort((a, b) => {
        const adminDiff = Number(Boolean(b.isAdmin)) - Number(Boolean(a.isAdmin));
        if (adminDiff) return adminDiff;

        const verifiedDiff = Number(Boolean(b.isVerified)) - Number(Boolean(a.isVerified));
        if (verifiedDiff) return verifiedDiff;

        return String(a.username || '').localeCompare(String(b.username || ''));
      });
  }, [onlineUsers, currentUser]);

  function openProfile(username) {
    window.history.pushState({}, '', getProfileUrl(username));
    window.dispatchEvent(new PopStateEvent('popstate'));
    setOpen(false);
  }

  return (
    <div className="presence-dropdown">
      <button
        type="button"
        className="presence-toggle"
        onClick={() => setOpen(value => !value)}
        title="Online players and notifications"
        aria-label="Online players and notifications"
      >
        ≡
        {unseenCount > 0 && <span>{unseenCount}</span>}
      </button>

      {open && (
        <section className="presence-panel">
          <div className="presence-tabs">
            <button
              type="button"
              className={tab === 'online' ? 'active' : ''}
              onClick={() => setTab('online')}
            >
              Online
            </button>
            <button
              type="button"
              className={tab === 'notifications' ? 'active' : ''}
              onClick={() => setTab('notifications')}
            >
              Notifications {unseenCount > 0 && <span className="mini-count">{unseenCount}</span>}
            </button>
          </div>

          {tab === 'online' && (
            <div className="presence-list">
              <div className="presence-panel-title">
                <strong>Online Players</strong>
                <span>{sortedUsers.length}</span>
              </div>

              {!currentRoomId && (
                <p className="muted presence-hint">
                  Join or create a room to invite online players.
                </p>
              )}

              {sortedUsers.length === 0 && (
                <p className="muted tidy-empty">No other players online.</p>
              )}

              {sortedUsers.map(player => (
                <article className="presence-player-card" key={player.id}>
                  <div className="presence-player-main">
                    <span className="online-dot" />
                    <strong>{player.username}</strong>
                    {player.isVerified && <span className="verified-badge mini" title="Verified user">✓</span>}
                    {player.isAdmin && <span className="admin-badge">Admin</span>}
                    <small>{statusLabel(player)}</small>
                  </div>

                  <div className="presence-player-actions">
                    <button type="button" className="ghost" onClick={() => openProfile(player.username)}>
                      Profile
                    </button>
                    <button
                      type="button"
                      disabled={!currentRoomId}
                      onClick={() => onInvitePlayer?.(player.username)}
                    >
                      Invite
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="presence-notifications-tab">
              <Notifications
                compact
                notifications={notifications}
                preferences={preferences}
                tradeStatuses={tradeStatuses}
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
