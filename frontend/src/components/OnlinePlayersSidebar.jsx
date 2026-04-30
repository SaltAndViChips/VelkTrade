import { useMemo, useState } from 'react';

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

export default function OnlinePlayersSidebar({
  currentUser,
  onlineUsers = [],
  currentRoomId,
  onInvitePlayer
}) {
  const [open, setOpen] = useState(false);

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
  }

  return (
    <aside className={`online-sidebar ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="online-sidebar-handle"
        onClick={() => setOpen(value => !value)}
        aria-label={open ? 'Close online players' : 'Open online players'}
        title={open ? 'Close online players' : 'Online players'}
      >
        <span />
        <span />
        <span />
      </button>

      <div className="online-sidebar-panel">
        <div className="panel-title-row">
          <div>
            <h2>Online Players</h2>
            <p className="muted">{sortedUsers.length} other player{sortedUsers.length === 1 ? '' : 's'} online.</p>
          </div>
        </div>

        {!currentRoomId && (
          <p className="muted online-sidebar-hint">
            Join or create a room to invite online players.
          </p>
        )}

        <div className="online-sidebar-list">
          {sortedUsers.length === 0 && (
            <p className="muted tidy-empty">No other players online.</p>
          )}

          {sortedUsers.map(player => (
            <article className="online-player-card" key={player.id}>
              <div className="online-player-main">
                <span className="online-dot" />
                <strong>{player.username}</strong>

                {player.isVerified && <span className="verified-badge mini" title="Verified user">✓</span>}
                {player.isAdmin && <span className="admin-badge">Admin</span>}
              </div>

              <div className="online-player-actions">
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
      </div>
    </aside>
  );
}
