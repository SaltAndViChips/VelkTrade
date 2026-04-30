import { useEffect, useState } from 'react';

const DEFAULT_PREFS = {
  counters: true,
  offlineTrades: true,
  roomInvites: true,
  tradeDeclines: true,
  soundVolume: 0.45,
  flashWindow: true,
  allowUnverifiedNotifications: false
};

function getNotificationId(notification) {
  return notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || Math.random()}`;
}

function notificationNeedsTradeAction(notification, tradeStatuses = {}) {
  const payload = notification?.payload || {};
  const tradeId = payload.tradeId || notification.tradeId;
  if (!tradeId) return false;

  const status = tradeStatuses[tradeId];
  return status && status !== 'completed' && status !== 'declined';
}

export default function Notifications({
  compact = false,
  notifications = [],
  preferences = {},
  tradeStatuses = {},
  onRefresh = () => {},
  onMarkRead = () => {},
  onMarkAllRead = () => {},
  onSavePreferences = () => {},
  onCheckTrade = () => {},
  onAcceptRoomInvite = () => {},
  onDeclineRoomInvite = () => {}
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localPrefs, setLocalPrefs] = useState({
    ...DEFAULT_PREFS,
    ...(preferences || {})
  });

  useEffect(() => {
    setLocalPrefs({
      ...DEFAULT_PREFS,
      ...(preferences || {})
    });
  }, [preferences]);

  function savePrefs(event) {
    event?.preventDefault?.();
    onSavePreferences(localPrefs);
  }

  return (
    <section className={compact ? 'notifications-page compact-notifications' : 'card notifications-page'}>
      <div className="panel-title-row">
        <div>
          <h2>Notifications</h2>
          <p className="muted">{notifications.length} notification{notifications.length === 1 ? '' : 's'}.</p>
        </div>

        <div className="inline-controls">
          <button type="button" className="ghost" onClick={onRefresh}>Refresh</button>
          <button type="button" className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙ Settings</button>
          <button type="button" onClick={onMarkAllRead}>Mark all read</button>
        </div>
      </div>

      {settingsOpen && (
        <form className="notification-settings" onSubmit={savePrefs}>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.counters)}
              onChange={event => setLocalPrefs({ ...localPrefs, counters: event.target.checked })}
            />
            <span>Counter notifications</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.offlineTrades)}
              onChange={event => setLocalPrefs({ ...localPrefs, offlineTrades: event.target.checked })}
            />
            <span>Offline trade request notifications</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.roomInvites)}
              onChange={event => setLocalPrefs({ ...localPrefs, roomInvites: event.target.checked })}
            />
            <span>Room invite notifications</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.tradeDeclines)}
              onChange={event => setLocalPrefs({ ...localPrefs, tradeDeclines: event.target.checked })}
            />
            <span>Trade declined notifications</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.allowUnverifiedNotifications)}
              onChange={event => setLocalPrefs({ ...localPrefs, allowUnverifiedNotifications: event.target.checked })}
            />
            <span>Notifications from unverified users</span>
          </label>

          <label className="range-row">
            <span>Notification volume: {Math.round(Number(localPrefs.soundVolume || 0) * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={Number(localPrefs.soundVolume ?? 0.45)}
              onChange={event => setLocalPrefs({ ...localPrefs, soundVolume: Number(event.target.value) })}
            />
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.flashWindow)}
              onChange={event => setLocalPrefs({ ...localPrefs, flashWindow: event.target.checked })}
            />
            <span>Flash tab/window on notification</span>
          </label>

          <div className="inline-controls">
            <button type="submit">Save Settings</button>
          </div>
        </form>
      )}

      <div className="notification-list">
        {notifications.length === 0 && <p className="muted tidy-empty">No notifications.</p>}

        {notifications.map(notification => {
          const id = getNotificationId(notification);
          const payload = notification.payload || {};
          const isRoomInvite = notification.type === 'room_invite';
          const showTradeCheck = notificationNeedsTradeAction(notification, tradeStatuses);

          return (
            <article className={`notification-card ${notification.read ? 'read' : 'unread'}`} key={id}>
              <div className="notification-dot" />
              <div>
                <strong>{notification.title || 'Notification'}</strong>
                <p>{notification.message || notification.body || ''}</p>
                {notification.createdAt && <small>{new Date(notification.createdAt).toLocaleString()}</small>}
              </div>

              <div className="notification-card-actions">
                {!notification.read && (
                  <button type="button" className="ghost" onClick={() => onMarkRead(id)}>
                    Mark read
                  </button>
                )}

                {showTradeCheck && (
                  <button type="button" onClick={() => onCheckTrade(notification)}>
                    Check Trade
                  </button>
                )}

                {isRoomInvite && !payload.expired && (
                  <>
                    <button type="button" onClick={() => onAcceptRoomInvite(notification)}>
                      Join
                    </button>
                    <button type="button" className="mini-danger" onClick={() => onDeclineRoomInvite(notification)}>
                      Decline
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
