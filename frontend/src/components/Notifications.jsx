import { useMemo, useState } from 'react';

function notificationIcon(type) {
  return {
    offline_trade: '⇄',
    counter_offer: '↩',
    room_invite: '⌁',
    invite_response: '✓'
  }[type] || '•';
}

export default function Notifications({
  notifications,
  preferences,
  onlineUsers,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onSavePreferences,
  onAcceptRoomInvite,
  onDeclineRoomInvite
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState(preferences);

  useMemo(() => {
    setDraftPrefs(preferences);
  }, [preferences]);

  const unseenCount = notifications.filter(notification => !notification.seen).length;

  function updatePref(key, value) {
    setDraftPrefs(current => ({
      ...current,
      [key]: value
    }));
  }

  function savePrefs(event) {
    event.preventDefault();
    onSavePreferences(draftPrefs);
  }

  return (
    <section className="card notifications-page">
      <div className="panel-title-row">
        <div>
          <h2>Notifications</h2>
          <p className="muted">{unseenCount} unchecked notification{unseenCount === 1 ? '' : 's'}.</p>
        </div>

        <div className="inline-controls">
          <button type="button" className="ghost" onClick={() => setSettingsOpen(open => !open)}>
            ⚙ Settings
          </button>
          <button type="button" onClick={onMarkAllRead}>Mark All Checked</button>
          <button type="button" className="ghost" onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      {settingsOpen && (
        <form className="notification-settings" onSubmit={savePrefs}>
          <h3>Notification Settings</h3>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(draftPrefs.offlineTrades)}
              onChange={event => updatePref('offlineTrades', event.target.checked)}
            />
            Offline trade requests
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(draftPrefs.counters)}
              onChange={event => updatePref('counters', event.target.checked)}
            />
            Counter offers
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(draftPrefs.roomInvites)}
              onChange={event => updatePref('roomInvites', event.target.checked)}
            />
            Room invites
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(draftPrefs.inviteResponses)}
              onChange={event => updatePref('inviteResponses', event.target.checked)}
            />
            Invite responses
          </label>

          <label className="range-row">
            <span>Notification sound volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={Number(draftPrefs.soundVolume ?? 0.5)}
              onChange={event => updatePref('soundVolume', Number(event.target.value))}
            />
            <strong>{Math.round(Number(draftPrefs.soundVolume ?? 0.5) * 100)}%</strong>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(draftPrefs.flashTab)}
              onChange={event => updatePref('flashTab', event.target.checked)}
            />
            Flash tab/window title on new notifications
          </label>

          <button type="submit">Save Settings</button>
        </form>
      )}

      <section className="online-panel">
        <h3>Online Players</h3>
        <div className="online-chip-list">
          {onlineUsers.length === 0 && <span className="muted">No players online.</span>}
          {onlineUsers.map(player => (
            <span className="online-chip" key={player.id}>
              <i /> {player.username}
            </span>
          ))}
        </div>
      </section>

      <div className="notification-list">
        {notifications.length === 0 && <p className="muted tidy-empty">No notifications yet.</p>}

        {notifications.map(notification => (
          <article className={`notification-card ${notification.seen ? 'seen' : 'unseen'}`} key={notification.id}>
            <div className="notification-icon">{notificationIcon(notification.type)}</div>

            <div>
              <div className="notification-title-row">
                <strong>{notification.title}</strong>
                {!notification.seen && <span className="status-pill">new</span>}
              </div>

              <p>{notification.message}</p>
              <small>{notification.createdAt}</small>

              {notification.type === 'room_invite' && (
                <div className="inline-controls notification-actions">
                  <button
                    type="button"
                    onClick={() => onAcceptRoomInvite(notification)}
                  >
                    Join Room
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDeclineRoomInvite(notification)}
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>

            <div className="notification-card-actions">
              {!notification.seen && (
                <button type="button" className="ghost" onClick={() => onMarkRead(notification.id)}>
                  Check
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
