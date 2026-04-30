import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PREFS = {
  counters: true,
  offlineTrades: true,
  roomInvites: true,
  declines: true,
  allowUnverifiedNotifications: false,
  soundVolume: 0.55,
  flashTab: true
};

function getNotificationId(notification) {
  return notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || ''}`;
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

  const sortedNotifications = useMemo(() => {
    return [...(Array.isArray(notifications) ? notifications : [])]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
  }, [notifications]);

  function saveSettings() {
    onSavePreferences(localPrefs);
    setSettingsOpen(false);
  }

  return (
    <section className={compact ? 'notifications-page compact-notifications' : 'card notifications-page'}>
      <div className="panel-title-row">
        <div>
          <h2>Notifications</h2>
          <p className="muted">{sortedNotifications.length} notification{sortedNotifications.length === 1 ? '' : 's'}.</p>
        </div>

        <div className="inline-controls notification-top-actions">
          <button type="button" className="ghost" onClick={onRefresh}>Refresh</button>
          <button type="button" className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙</button>
          <button type="button" onClick={onMarkAllRead}>Mark all read</button>
        </div>
      </div>

      {settingsOpen && (
        <section className="notification-settings">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.counters)}
              onChange={event => setLocalPrefs({ ...localPrefs, counters: event.target.checked })}
            />
            <span>Counter-offer notifications</span>
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
              checked={Boolean(localPrefs.declines)}
              onChange={event => setLocalPrefs({ ...localPrefs, declines: event.target.checked })}
            />
            <span>Decline notifications</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.allowUnverifiedNotifications)}
              onChange={event => setLocalPrefs({ ...localPrefs, allowUnverifiedNotifications: event.target.checked })}
            />
            <span>Notifications from unverified users</span>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(localPrefs.flashTab)}
              onChange={event => setLocalPrefs({ ...localPrefs, flashTab: event.target.checked })}
            />
            <span>Flash browser tab/window</span>
          </label>

          <label className="range-row">
            <span>Notification volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={Number(localPrefs.soundVolume ?? 0.55)}
              onChange={event => setLocalPrefs({ ...localPrefs, soundVolume: Number(event.target.value) })}
            />
          </label>

          <div className="inline-controls notification-settings-actions">
            <button type="button" onClick={saveSettings}>Save Settings</button>
            <button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="notification-list">
        {sortedNotifications.length === 0 && (
          <p className="muted tidy-empty">No notifications yet.</p>
        )}

        {sortedNotifications.map(notification => {
          const id = getNotificationId(notification);
          const payload = getPayload(notification);
          const type = notification.type || '';
          const title = notification.title || 'Notification';
          const message = notification.message || notification.body || '';
          const read = Boolean(notification.read || notification.isRead || notification.seen);
          const tradeId = payload.tradeId || notification.tradeId;
          const roomId = payload.roomId || notification.roomId;
          const canCheckTrade = tradeId && tradeStatuses?.[tradeId] !== 'complete';

          return (
            <article className={`notification-card ${read ? 'read' : 'unread'}`} key={id}>
              <div className="notification-dot" />

              <div className="notification-body">
                <strong>{title}</strong>
                {message && <p>{message}</p>}
                {notification.createdAt && <small>{new Date(notification.createdAt).toLocaleString()}</small>}

                <div className="notification-card-actions">
                  {!read && (
                    <button type="button" className="ghost" onClick={() => onMarkRead(id)}>
                      Mark read
                    </button>
                  )}

                  {canCheckTrade && (
                    <button type="button" onClick={() => onCheckTrade(notification)}>
                      Check
                    </button>
                  )}

                  {type === 'room_invite' && roomId && (
                    <>
                      <button type="button" onClick={() => onAcceptRoomInvite(notification)}>
                        Join
                      </button>
                      <button type="button" className="ghost" onClick={() => onDeclineRoomInvite(notification)}>
                        Decline
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
