import { useEffect, useMemo, useState } from 'react';

const LOCAL_PREFS_KEY = 'velktrade:notification-preferences:v2';

const DEFAULT_PREFS = {
  counters: true,
  offlineTrades: true,
  buyOffers: true,
  auctions: true,
  bazaarVerified: true,
  roomInvites: true,
  declines: true,
  escrow: true,
  admin: true,
  system: true,
  allowUnverifiedNotifications: false,
  soundVolume: 0.55,
  flashTab: true,
  browserNotifications: false,
  toastNotifications: true,
  sidebarNotifications: true
};

function readLocalPrefs() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_PREFS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalPrefs(prefs) {
  try {
    window.localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent('velktrade:notification-preferences-changed', { detail: prefs }));
  } catch {}
}

function getNotificationId(notification) {
  return notification?.id || notification?.notificationId || `${notification?.type || 'notification'}-${notification?.createdAt || ''}`;
}

function getPayload(notification) {
  if (!notification?.payload) return {};
  if (typeof notification.payload === 'string') {
    try { return JSON.parse(notification.payload); } catch { return {}; }
  }
  return notification.payload;
}

function notificationCategory(notification) {
  const type = String(notification?.type || notification?.kind || '').toLowerCase();
  const title = String(notification?.title || '').toLowerCase();
  if (type.includes('auction') || title.includes('auction')) return 'auctions';
  if (type.includes('buy') || title.includes('buy offer')) return 'buyOffers';
  if (type.includes('counter')) return 'counters';
  if (type.includes('trade') || title.includes('trade')) return 'offlineTrades';
  if (type.includes('bazaar') || title.includes('bazaar')) return 'bazaarVerified';
  if (type.includes('invite') || title.includes('invite')) return 'roomInvites';
  if (type.includes('decline') || title.includes('decline')) return 'declines';
  if (type.includes('escrow') || title.includes('escrow')) return 'escrow';
  if (type.includes('admin') || title.includes('admin')) return 'admin';
  return 'system';
}

function notificationAllowed(notification, prefs) {
  const category = notificationCategory(notification);
  if (prefs[category] === false) return false;
  if (notification?.verifiedOnly && prefs.bazaarVerified === false) return false;
  if (notification?.fromVerified === false && prefs.allowUnverifiedNotifications === false) return false;
  return true;
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
    ...readLocalPrefs(),
    ...(preferences || {})
  });

  useEffect(() => {
    setLocalPrefs({
      ...DEFAULT_PREFS,
      ...readLocalPrefs(),
      ...(preferences || {})
    });
  }, [preferences]);

  const sortedNotifications = useMemo(() => {
    return [...(Array.isArray(notifications) ? notifications : [])]
      .filter(notification => notificationAllowed(notification, localPrefs))
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
  }, [notifications, localPrefs]);

  function updatePref(key, value) {
    setLocalPrefs(current => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    const next = { ...DEFAULT_PREFS, ...localPrefs };
    writeLocalPrefs(next);
    onSavePreferences(next);
    setSettingsOpen(false);
  }

  function Toggle({ prefKey, children }) {
    return (
      <label className="toggle-row">
        <input type="checkbox" checked={Boolean(localPrefs[prefKey])} onChange={event => updatePref(prefKey, event.target.checked)} />
        <span>{children}</span>
      </label>
    );
  }

  return (
    <section className={compact ? 'notifications-page compact-notifications' : 'card notifications-page'}>
      <div className="panel-title-row">
        <div>
          <h2>Notifications</h2>
          <p className="muted">{sortedNotifications.length} enabled notification{sortedNotifications.length === 1 ? '' : 's'}.</p>
        </div>

        <div className="inline-controls notification-top-actions">
          <button type="button" className="ghost" onClick={onRefresh}>Refresh</button>
          <button type="button" className="ghost" onClick={() => setSettingsOpen(value => !value)}>⚙ Settings</button>
          <button type="button" onClick={onMarkAllRead}>Mark all read</button>
        </div>
      </div>

      {settingsOpen && (
        <section className="notification-settings">
          <div className="notification-settings-grid">
            <Toggle prefKey="sidebarNotifications">Save alerts in sidebar Notifications tab</Toggle>
            <Toggle prefKey="toastNotifications">Show toast popups</Toggle>
            <Toggle prefKey="browserNotifications">Browser notifications when tab is hidden</Toggle>
            <Toggle prefKey="flashTab">Flash browser tab/window</Toggle>
            <Toggle prefKey="auctions">Auction alerts</Toggle>
            <Toggle prefKey="offlineTrades">Trade request alerts</Toggle>
            <Toggle prefKey="counters">Counter-offer alerts</Toggle>
            <Toggle prefKey="buyOffers">Buy offer alerts</Toggle>
            <Toggle prefKey="roomInvites">Room invite alerts</Toggle>
            <Toggle prefKey="bazaarVerified">Verified-user Bazaar activity</Toggle>
            <Toggle prefKey="declines">Decline alerts</Toggle>
            <Toggle prefKey="escrow">Escrow / trade-pending alerts</Toggle>
            <Toggle prefKey="admin">Admin alerts</Toggle>
            <Toggle prefKey="system">System alerts</Toggle>
            <Toggle prefKey="allowUnverifiedNotifications">Allow alerts from non-verified users</Toggle>
          </div>

          <label className="range-row">
            <span>Notification volume</span>
            <input type="range" min="0" max="1" step="0.05" value={Number(localPrefs.soundVolume ?? 0.55)} onChange={event => updatePref('soundVolume', Number(event.target.value))} />
          </label>

          <div className="inline-controls notification-settings-actions">
            <button type="button" onClick={saveSettings}>Save Settings</button>
            <button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="notification-list">
        {sortedNotifications.length === 0 && <p className="muted tidy-empty">No enabled notifications yet.</p>}

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
                {(notification.createdAt || notification.created_at) && <small>{new Date(notification.createdAt || notification.created_at).toLocaleString()}</small>}

                <div className="notification-card-actions">
                  {!read && <button type="button" className="ghost" onClick={() => onMarkRead(id)}>Mark read</button>}
                  {canCheckTrade && <button type="button" onClick={() => onCheckTrade(notification)}>Check</button>}
                  {type === 'room_invite' && roomId && (
                    <>
                      <button type="button" onClick={() => onAcceptRoomInvite(notification)}>Join</button>
                      <button type="button" className="ghost" onClick={() => onDeclineRoomInvite(notification)}>Decline</button>
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
