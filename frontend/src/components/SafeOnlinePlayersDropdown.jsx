import { useMemo, useState } from 'react';

function getProfileUrl(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

function isAdminPlayer(player) {
  return Boolean(
    player?.isAdmin ||
    player?.is_admin ||
    player?.highestBadge === 'admin' ||
    String(player?.username || '').toLowerCase() === 'salt'
  );
}

function isVerifiedPlayer(player) {
  return Boolean(
    player?.isVerified ||
    player?.is_verified ||
    player?.highestBadge === 'verified'
  );
}

function statusLabel(player) {
  if (player?.status === 'trade') return 'In trade';
  if (player?.status === 'bazaar') return 'Browsing the Bazaar';
  if (player?.status === 'away') return 'Away';
  return 'Online';
}

export default function SafeOnlinePlayersDropdown({
  currentUser,
  onlineUsers = [],
  currentRoomId = '',
  onInvitePlayer = () => {}
}) {
  const [open, setOpen] = useState(false);

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

  return (
    <div className="safe-online-dropdown">
      <button
        type="button"
        className="safe-online-toggle"
        onClick={() => setOpen(value => !value)}
        title="Online players"
        aria-label="Online players"
      >
        ≡
      </button>

      {open && (
        <section className="safe-online-panel">
          <div className="safe-online-header">
            <strong>Online Players</strong>
            <span>{sortedUsers.length}</span>
          </div>

          {!currentRoomId && (
            <p className="muted safe-online-hint">
              Join or create a room to invite online players.
            </p>
          )}

          {sortedUsers.length === 0 && (
            <p className="muted tidy-empty">No other players online.</p>
          )}

          <div className="safe-online-list">
            {sortedUsers.map(player => {
              const admin = isAdminPlayer(player);
              const verified = isVerifiedPlayer(player);
              const away = player?.status === 'away';

              return (
                <article className="safe-online-card" key={player.id || player.username}>
                  <div className="safe-online-main">
                    <span className={`online-dot ${away ? 'away' : ''}`} />
                    <strong>{player.username}</strong>

                    {admin ? (
                      <span className="admin-badge">Admin</span>
                    ) : verified ? (
                      <span className="verified-badge mini" title="Verified user">✓</span>
                    ) : null}

                    <small>{statusLabel(player)}</small>
                  </div>

                  <div className="safe-online-actions">
                    <button type="button" className="ghost" onClick={() => openProfile(player.username)}>
                      Profile
                    </button>
                    <button type="button" disabled={!currentRoomId} onClick={() => onInvitePlayer(player.username)}>
                      Invite
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
