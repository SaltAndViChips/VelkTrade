import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors
} from '@dnd-kit/core';

import { api, clearToken, getToken } from './api';
import { createSocket } from './socket';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import TradeBoard from './components/TradeBoard';
import TradeChat from './components/TradeChat';
import AdminPanel from './components/AdminPanel';
import Trades from './components/Trades';
import TradeOfferPanel from './components/TradeOfferPanel';
import UserInventoryPage from './components/UserInventoryPage';
import Bazaar from './components/Bazaar';
import Notifications from './components/Notifications';
import SafeOnlinePlayersDropdown from './components/SafeOnlinePlayersDropdown.jsx';

function parseDraggedItemId(active) {
  const dataItemId = active?.data?.current?.itemId;
  if (dataItemId !== undefined && dataItemId !== null) {
    const itemId = Number(dataItemId);
    return Number.isFinite(itemId) ? itemId : null;
  }

  const raw = String(active?.id || '');
  const cleaned = raw.replace(/^(inventory-item|offer-item|inv|offer|own|their|selected)-/, '');
  const itemId = Number(cleaned);

  return Number.isFinite(itemId) ? itemId : null;
}

function normalizeIds(ids) {
  return Array.from(new Set((ids || []).map(Number))).filter(Number.isFinite);
}

function normalizeIcInput(value) {
  const raw = String(value || '').trim().replace(/^\$\s*/, '');
  if (!raw) return '';

  const withoutIc = raw.replace(/\bic\b/ig, '').trim();

  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) {
    const [whole, decimal] = withoutIc.replace(/,/g, '').split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${decimal !== undefined ? `${withCommas}.${decimal}` : withCommas} IC`;
  }

  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) {
    return `${withoutIc} IC`;
  }

  if (/\bic\b/i.test(raw)) {
    return raw.replace(/\bic\b/i, 'IC');
  }

  return `${raw} IC`;
}

function tradeCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
}

function getInitialRouteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryRoom = params.get('room');
  const queryUser = params.get('user');

  if (queryRoom) return { type: 'room', value: queryRoom.trim() };
  if (queryUser) return { type: 'user', value: queryUser.trim() };

  const roomMatch = window.location.pathname.match(/(?:\/VelkTrade)?\/room\/([a-zA-Z0-9_-]+)/i);
  if (roomMatch?.[1]) return { type: 'room', value: roomMatch[1] };

  const userMatch = window.location.pathname.match(/(?:\/VelkTrade)?\/user\/([^\/?#]+)/i);
  if (userMatch?.[1]) return { type: 'user', value: decodeURIComponent(userMatch[1]) };

  return { type: '', value: '' };
}

function getAppHomeUrl() {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${window.location.origin}${cleanBase}`;
}

function clearUserDeepLinkUrl() {
  const params = new URLSearchParams(window.location.search);
  const isUserQuery = params.has('user');
  const isUserPath = /(?:\/VelkTrade)?\/user\/([^\/?#]+)/i.test(window.location.pathname);

  if (isUserQuery || isUserPath) {
    window.history.replaceState({}, '', getAppHomeUrl());
  }
}

function makeRoomPath(roomId) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/room/${roomId}`;
}

function makeUserProfilePath(username) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/user/${encodeURIComponent(username)}`;
}

export default function App() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 90, tolerance: 8 } })
  );

  const initialRoute = useMemo(() => getInitialRouteFromUrl(), []);
  const [view, rawSetView] = useState(initialRoute.type === 'user' ? 'userProfile' : 'dashboard');
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [viewUsername, setViewUsername] = useState('');
  const [viewedInventory, setViewedInventory] = useState([]);
  const [trades, setTrades] = useState([]);
  const [buyRequests, setBuyRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState({
    offlineTrades: true,
    counters: true,
    roomInvites: true,
    inviteResponses: true,
    soundVolume: 0.5,
    flashTab: true
  });
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [pendingRoomInvite, setPendingRoomInvite] = useState(null);
  const [safeTradeStatuses, setTradeStatuses] = useState({});
  const [focusedTradeId, setFocusedTradeId] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [counterTrade, setCounterTrade] = useState(null);
  const [offerTargetUsername, setOfferTargetUsername] = useState('');
  const [pendingRoomId, setPendingRoomId] = useState(initialRoute.type === 'room' ? initialRoute.value : '');

  const [profileUsername, setProfileUsername] = useState(initialRoute.type === 'user' ? initialRoute.value : '');
  const [profileUser, setProfileUser] = useState(null);
  const [profileItems, setProfileItems] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [loginRequiredMessage, setLoginRequiredMessage] = useState('');

  const [bioDraft, setBioDraft] = useState('');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioMessage, setBioMessage] = useState('');
  const [undoDelete, setUndoDelete] = useState(null);

  const userRef = useRef(null);
  const roomRef = useRef(null);
  const socketRef = useRef(null);
  const joinedInitialRoomRef = useRef(false);
  const undoTimerRef = useRef(null);
  const previousRoomPlayerIdsRef = useRef([]);
  const awayTimerRef = useRef(null);

  function setView(nextView) {
    if (nextView !== 'userProfile') {
      clearUserDeepLinkUrl();
    }

    rawSetView(nextView);
  }

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {

  async function cancelPendingRoomInvite() {
    setPendingRoomInvite(null);
  }



async function invitePlayerToRoom(username) {
    setError('');

    let activeRoomId = room?.roomId;

    if (!activeRoomId) {
      const data = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const nextRoom = data.room || data;
      activeRoomId = nextRoom.roomId || nextRoom.id;

      if (nextRoom) {
        setRoom(nextRoom);
        roomRef.current = nextRoom;
      }

      setView('trade');
    }

    const inviteData = await api(`/api/rooms/${activeRoomId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ username })
    });

    if (typeof setPendingRoomInvite === 'function') {
      setPendingRoomInvite(inviteData.invite || { roomId: activeRoomId, toUsername: username });
    }

    setView('trade');
  }



  const safeVisibleNotifications = Array.isArray(notifications) ? notifications : [];
  const safeTradeStatuses = {};
  const safeUnseenNotificationCount = 0;

  return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);
const isAdmin = Boolean(user?.isAdmin);
  function isTerminalTradeStatus(status) {
    return ['declined', 'completed'].includes(String(status || '').toLowerCase());
  }

  function isIncompleteTradeStatus(status) {
    return ['pending', 'countered', 'accepted'].includes(String(status || '').toLowerCase());
  }

  function shouldKeepNotificationVisible(notification, statuses = safeTradeStatuses) {
    if (!notification?.seen) return true;

    const createdAt = new Date(notification.createdAt || Date.now()).getTime();
    const ageMs = Date.now() - createdAt;
    const fiveMinutesMs = 5 * 60 * 1000;

    const isTradeNotification = ['offline_trade', 'counter_offer'].includes(notification.type);
    const tradeId = notification.payload?.tradeId;
    const tradeStatus = statuses[String(tradeId)];

    if (isTradeNotification && isIncompleteTradeStatus(tradeStatus)) {
      return true;
    }

    if (isTradeNotification && !tradeStatus) {
      return true;
    }

    return ageMs < fiveMinutesMs;
  }


  const myOfferIds = useMemo(
    () => normalizeIds(room && user ? room.offers?.[user.id] || [] : []),
    [room, user]
  );

  const theirPlayer = useMemo(
    () => room && user ? room.players.find(player => Number(player.id) !== Number(user.id)) || null : null,
    [room, user]
  );

  const theirOfferIds = useMemo(
    () => normalizeIds(room && theirPlayer ? room.offers?.[theirPlayer.id] || [] : []),
    [room, theirPlayer]
  );

  const myIcOffer = useMemo(
    () => room && user ? room.icOffers?.[user.id] || '' : '',
    [room, user]
  );

  const theirIcOffer = useMemo(
    () => room && theirPlayer ? room.icOffers?.[theirPlayer.id] || '' : '',
    [room, theirPlayer]
  );

  const visibleInventory = useMemo(
    () => inventory.filter(item => !myOfferIds.includes(Number(item.id))),
    [inventory, myOfferIds]
  );

  const myOfferItems = useMemo(
    () => inventory.filter(item => myOfferIds.includes(Number(item.id))),
    [inventory, myOfferIds]
  );

  const theirOfferItems = useMemo(
    () => viewedInventory.filter(item => theirOfferIds.includes(Number(item.id))),
    [viewedInventory, theirOfferIds]
  );

  const myAccepted = Boolean(room && user && room.accepted?.[user.id]);
  const theirAccepted = Boolean(room && theirPlayer && room.accepted?.[theirPlayer.id]);
  const myConfirmed = Boolean(room && user && room.confirmed?.[user.id]);
  const theirConfirmed = Boolean(room && theirPlayer && room.confirmed?.[theirPlayer.id]);


  useEffect(() => {
    const baseTitle = 'Salts Trading Board';
    document.title = safeUnseenNotificationCount > 0 ? `(${safeUnseenNotificationCount}) ${baseTitle}` : baseTitle;
  }, [safeUnseenNotificationCount]);

  useEffect(() => {
    const pruneTimer = window.setInterval(() => {
      setNotifications(current => current.filter(notification => shouldKeepNotificationVisible(notification)));
    }, 30000);

    return () => window.clearInterval(pruneTimer);
  }, [safeTradeStatuses]);


  useEffect(() => {
    if (!getToken()) return;

    api('/api/me')
      .then(data => {
        setUser(data.user);
        setBioDraft(data.user?.bio || '');
      })
      .catch(() => clearToken());
  }, []);

  useEffect(() => {
    if (view === 'userProfile' && profileUsername) {
      loadUserProfile(profileUsername);
    }
  }, [view]);

  useEffect(() => {
    if (!user) return;

    refreshAllForUser(user);

    const nextSocket = createSocket();
    socketRef.current = nextSocket;
    setSocket(nextSocket);

    nextSocket.on('connect', () => {
      if (pendingRoomId && !joinedInitialRoomRef.current) {
        joinedInitialRoomRef.current = true;
        nextSocket.emit('room:join', { roomId: pendingRoomId });
      }
    });

    nextSocket.on('room:update', nextRoom => {
      const previousIds = previousRoomPlayerIdsRef.current || [];
      const nextIds = (nextRoom?.players || []).map(player => Number(player.id)).filter(Number.isFinite);
previousRoomPlayerIdsRef.current = nextIds;

      setRoom(nextRoom);
      roomRef.current = nextRoom;
      setError('');
      setView('trade');
      refreshRoomInventories(nextRoom, userRef.current);
      loadTrades();
    });

    nextSocket.on('trade:offer-updated', ({ room: nextRoom }) => {
      if (nextRoom) {
        setRoom(nextRoom);
        roomRef.current = nextRoom;
        setView('trade');
      }

      refreshRoomInventories(nextRoom || roomRef.current, userRef.current);
      loadTrades();
    });

    nextSocket.on('inventory:refresh', () => {
      refreshRoomInventories(roomRef.current, userRef.current);
      loadTrades();
    });

    nextSocket.on('inventory:updated', ({ username }) => {
      const currentUser = userRef.current;
      const activeRoom = roomRef.current;

      if (!username || !currentUser) return;

      if (username === currentUser.username) {
        refreshInventory(username);
      }

      const otherPlayer = activeRoom?.players?.find(player => Number(player.id) !== Number(currentUser.id));
      if (otherPlayer?.username && username === otherPlayer.username) {
        loadViewedInventory(otherPlayer.username);
      }
    });


    nextSocket.on('notification:new', ({ notification }) => {
      setNotifications(current => [notification, ...current].filter(item => shouldKeepNotificationVisible(item)));
      playNotificationSound();

      if (notificationPrefs.flashTab) {
        const original = document.title;
        document.title = `● ${original}`;
        setTimeout(() => {
          document.title = original;
        }, 900);
      }
    });

    nextSocket.on('notification:updated', ({ notification }) => {
      setNotifications(current => current.map(item => (
        Number(item.id) === Number(notification.id) ? notification : item
      )).filter(item => shouldKeepNotificationVisible(item)));
    });

    nextSocket.on('presence:update', ({ users }) => {
      setOnlineUsers(users || []);
    });

    nextSocket.on('room:error', message => {
      setError(message || 'Room error');
    });

    nextSocket.on('room:closed', () => {
      setRoom(null);
      roomRef.current = null;
      previousRoomPlayerIdsRef.current = [];
      setPendingRoomInvite(null);
      previousRoomPlayerIdsRef.current = [];
      setView('dashboard');
      refreshAllForUser(userRef.current);
    });

    nextSocket.on('trade:accepted-saved', () => {
      loadTrades();
    });

    nextSocket.on('trade:completed', () => {
      setRoom(null);
      roomRef.current = null;
      setView('dashboard');
      refreshAllForUser(userRef.current);
      alert('Trade completed. Inventories updated.');
    });

    nextSocket.on('chat:message', message => {
      setRoom(current => {
        if (!current) return current;

        const existing = current.messages || [];
        if (existing.some(item => item.id === message.id)) return current;

        const nextRoomState = { ...current, messages: [...existing, message] };
        roomRef.current = nextRoomState;
        return nextRoomState;
      });
    });

    return () => {
      nextSocket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (theirPlayer?.username) {
      loadViewedInventory(theirPlayer.username);
    }
  }, [theirPlayer?.username]);

  async function refreshAllForUser(targetUser = user) {
    if (!targetUser) return;

    const data = await api('/api/me');
    if (data.user) {
      setUser(data.user);
      setBioDraft(data.user.bio || '');
    }

    await Promise.all([
      refreshInventory(targetUser.username),
      loadTrades(),
      loadNotifications()
    ]);
  }

  async function refreshRoomInventories(activeRoom = roomRef.current, activeUser = userRef.current) {
    if (!activeUser) return;

    const otherPlayer = activeRoom?.players?.find(player => Number(player.id) !== Number(activeUser.id));

    await refreshInventory(activeUser.username);

    if (otherPlayer?.username) {
      await loadViewedInventory(otherPlayer.username);
    }
  }

  async function refreshInventory(username) {
    const data = await api(`/api/inventory/${encodeURIComponent(username)}`);
    setInventory(data.items || []);
  }

  async function loadViewedInventory(username = viewUsername) {
    if (!username) return;

    const data = await api(`/api/inventory/${encodeURIComponent(username)}`);
    setViewedInventory(data.items || []);
  }

  async function loadUserProfile(username = profileUsername) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return;

    setProfileLoading(true);
    setProfileError('');

    try {
      const data = await api(`/api/profile/${encodeURIComponent(cleanUsername)}`);

      if (!data.user) {
        setProfileUser(null);
        setProfileItems([]);
        setProfileError('Player not found.');
      } else {
        setProfileUser(data.user);
        setProfileItems(data.items || []);
        setProfileUsername(data.user.username);
      }
    } catch (err) {
      setProfileError(err.message || 'Could not load inventory.');
    } finally {
      setProfileLoading(false);
    }
  }


  async function loadNotifications() {
    if (!getToken()) return;

    const data = await api('/api/notifications');
    const nextTradeStatuses = data.safeTradeStatuses || {};
    setTradeStatuses(nextTradeStatuses);
    setNotifications((data.notifications || []).filter(notification => shouldKeepNotificationVisible(notification, nextTradeStatuses)));
    setNotificationPrefs(data.preferences || notificationPrefs);
    setOnlineUsers(data.onlineUsers || []);
  }
  function playNotificationSound() {
    const volume = Number(notificationPrefs.soundVolume ?? 0.5);
    if (volume <= 0) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const now = context.currentTime;

      // Soft, deep water-drop style notification:
      // a low sine tone with a quick downward pitch glide,
      // subtle filtered overtone, soft attack, and smooth decay.
      const drop = context.createOscillator();
      const overtone = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const overtoneGain = context.createGain();

      drop.type = 'sine';
      overtone.type = 'triangle';

      drop.frequency.setValueAtTime(420, now);
      drop.frequency.exponentialRampToValueAtTime(185, now + 0.18);

      overtone.frequency.setValueAtTime(840, now);
      overtone.frequency.exponentialRampToValueAtTime(370, now + 0.14);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.2);
      filter.Q.setValueAtTime(2.2, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume * 0.18, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

      overtoneGain.gain.setValueAtTime(volume * 0.035, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      drop.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);

      overtone.connect(overtoneGain);
      overtoneGain.connect(filter);

      drop.start(now);
      overtone.start(now);
      drop.stop(now + 0.38);
      overtone.stop(now + 0.18);

      setTimeout(() => {
        context.close();
      }, 460);
    } catch {
      // Browser may block audio until user interaction.
    }
  }

  async function saveNotificationPreferences(preferences) {
    const data = await api('/api/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences)
    });

    setNotificationPrefs(data.preferences || preferences);
  }

  async function markNotificationRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' });
    await loadNotifications();
  }

  async function markAllNotificationsRead() {
    await api('/api/notifications/read-all', { method: 'POST' });
    await loadNotifications();
  }

  async function loadTrades() {
    if (!getToken()) return;

    const data = await api('/api/trades');
    setTrades(data.trades || []);
    setBuyRequests(data.buyRequests || []);
  }

  async function saveBio(event) {
    event.preventDefault();
    setBioMessage('');

    const data = await api('/api/me/profile', {
      method: 'PUT',
      body: JSON.stringify({ bio: bioDraft })
    });

    if (data.user) {
      setUser(data.user);
      setBioDraft(data.user.bio || '');
      setIsEditingBio(false);
    }

    setBioMessage('Bio saved.');
  }



  async function updateOnlineVisibility(showOnline) {
    const data = await api('/api/me/online-visibility', {
      method: 'PUT',
      body: JSON.stringify({ showOnline })
    });

    if (data.user) {
      setUser(data.user);
      setBioDraft(data.user.bio || '');
    }
  }

  async function updateBazaarInventoryVisibility(showBazaarInventory) {
    const data = await api('/api/me/bazaar-visibility', {
      method: 'PUT',
      body: JSON.stringify({ showBazaarInventory })
    });

    if (data.user) {
      setUser(data.user);
      setBioDraft(data.user.bio || '');
    }
  }

  function notifyRoomInventoryUpdated() {
    const activeRoom = roomRef.current;

    if (activeRoom?.roomId) {
      socketRef.current?.emit('inventory:updated', { roomId: activeRoom.roomId });
    }
  }

  async function addImgurItem(image) {
    await api('/api/items', {
      method: 'POST',
      body: JSON.stringify({ image })
    });

    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();
  }

  async function deleteItem(itemId) {
    const item = inventory.find(entry => Number(entry.id) === Number(itemId));

    const result = await api(`/api/items/${itemId}`, {
      method: 'DELETE'
    });

    const deletedItem = result.item || item;

    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }

    setUndoDelete({
      item: deletedItem,
      expiresAt: Date.now() + 15000
    });

    undoTimerRef.current = window.setTimeout(() => {
      setUndoDelete(null);
      undoTimerRef.current = null;
    }, 15000);
  }

  async function undoDeleteItem() {
    if (!undoDelete?.item) return;

    const item = undoDelete.item;

    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    await api('/api/items/restore', {
      method: 'POST',
      body: JSON.stringify({
        title: item.title,
        image: item.image,
        price: item.price || ''
      })
    });

    setUndoDelete(null);
    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();
  }

  async function updateItemPrice(itemId, price) {
    await api(`/api/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ price })
    });

    await refreshInventory(user.username);
    notifyRoomInventoryUpdated();
  }


  async function toggleBuyRequest(item) {
    if (!user) {
      setLoginRequiredMessage('Log in or register to mark items you would buy.');
      setView('login');
      return;
    }

    if (item.viewerWouldBuy) {
      await api(`/api/items/${item.id}/buy-request`, { method: 'DELETE' });
    } else {
      await api(`/api/items/${item.id}/buy-request`, { method: 'POST' });
    }

    await loadUserProfile(profileUsername);
    await loadTrades();
  }

  function createRoom() {
    setView('dashboard');
    socketRef.current?.emit('room:create');
  }

  function joinRoom(roomId) {
    const cleanRoomId = String(roomId || '').trim();
    if (!cleanRoomId) return;

    clearUserDeepLinkUrl();
    setPendingRoomId(cleanRoomId);
    joinedInitialRoomRef.current = true;
    socketRef.current?.emit('room:join', { roomId: cleanRoomId });
  }


  function invitePlayerToRoom(username) {
    const cleanUsername = String(username || '').trim();
    const activeRoom = roomRef.current;

    if (!cleanUsername || !activeRoom?.roomId) return;

    socketRef.current?.emit('room:invite', {
      roomId: activeRoom.roomId,
      username: cleanUsername
    });
  }

  function acceptRoomInvite(notification) {
    const roomId = notification?.payload?.roomId;
    const inviterId = notification?.payload?.fromUserId;

    if (!roomId) return;

    socketRef.current?.emit('room:invite-response', {
      roomId,
      inviterId,
      notificationId: notification.id,
      accepted: true
    });

    markNotificationRead(notification.id);
    joinRoom(roomId);
  }

  function declineRoomInvite(notification) {
    const roomId = notification?.payload?.roomId;
    const inviterId = notification?.payload?.fromUserId;

    socketRef.current?.emit('room:invite-response', {
      roomId,
      inviterId,
      notificationId: notification.id,
      accepted: false
    });

    markNotificationRead(notification.id);
  }

  function leaveRoom() {
    if (roomRef.current) {
      socketRef.current?.emit('room:leave', { roomId: roomRef.current.roomId });
    }

    setRoom(null);
    roomRef.current = null;
    setView('dashboard');
  }

  function returnToDashboard() {
    setView('dashboard');
  }

  function updateOffer(nextOfferIds) {
    const activeRoom = roomRef.current;

    if (!activeRoom) {
      setError('You are not in a room.');
      return;
    }

    socketRef.current?.emit('trade:offer', {
      roomId: activeRoom.roomId,
      itemIds: normalizeIds(nextOfferIds)
    });
  }

  function moveToOffer(itemId) {
    const id = Number(itemId);

    if (!roomRef.current || !Number.isFinite(id)) return;
    if (myOfferIds.includes(id)) return;

    updateOffer([...myOfferIds, id]);
  }

  function moveToInventory(itemId) {
    const id = Number(itemId);

    if (!roomRef.current || !Number.isFinite(id)) return;

    updateOffer(myOfferIds.filter(existingId => Number(existingId) !== id));
  }

  function offerIc(amount) {
    const activeRoom = roomRef.current;

    if (!activeRoom) {
      setError('You are not in a room.');
      return;
    }

    const cleanAmount = normalizeIcInput(amount);

    if (!cleanAmount) {
      setError('Enter a valid IC amount.');
      return;
    }

    socketRef.current?.emit('trade:ic-offer', {
      roomId: activeRoom.roomId,
      amount: cleanAmount
    });
  }

  function removeIcOffer() {
    const activeRoom = roomRef.current;

    if (!activeRoom) return;

    socketRef.current?.emit('trade:ic-remove', {
      roomId: activeRoom.roomId
    });
  }

  function handleDragStart(event) {
    const itemId = parseDraggedItemId(event.active);

    if (!itemId) {
      setActiveDragItem(null);
      return;
    }

    setActiveDragItem(
      inventory.find(item => Number(item.id) === itemId) ||
      viewedInventory.find(item => Number(item.id) === itemId) ||
      trades.flatMap(trade => [
        ...(trade.fromItemDetails || []),
        ...(trade.toItemDetails || [])
      ]).find(item => Number(item.id) === itemId) ||
      null
    );
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const itemId = parseDraggedItemId(active);
    if (!itemId) return;

    if (over.id === 'my-offer-drop') {
      moveToOffer(itemId);
    }

    if (over.id === 'inventory-drop') {
      moveToInventory(itemId);
    }
  }

  function acceptTrade() {
    socketRef.current?.emit('trade:accept', { roomId: roomRef.current?.roomId });
  }

  function confirmTrade() {
    socketRef.current?.emit('trade:confirm', { roomId: roomRef.current?.roomId });
  }

  function sendChatMessage(message) {
    if (!roomRef.current) return;

    socketRef.current?.emit('chat:send', {
      roomId: roomRef.current.roomId,
      message
    });
  }

  function viewMyProfile() {
    if (!user?.username) return;
    window.location.href = makeUserProfilePath(user.username);
  }

  function logout() {
    clearUserDeepLinkUrl();
    clearToken();
    window.location.href = getAppHomeUrl();
  }

  function openCounter(trade) {
    setCounterTrade(trade);
    setOfferTargetUsername('');
    setView('offer');
  }

  function startTradeWith(username) {
    if (!user) {
      setLoginRequiredMessage(`Log in or register to start a trade with ${username}.`);
      setView('login');
      return;
    }

    setOfferTargetUsername(username);
    setCounterTrade(null);
    setView('offer');
  }

  async function checkTradeNotification(notification) {
    const tradeId = notification?.payload?.tradeId;

    if (notification?.id) {
      await markNotificationRead(notification.id);
    }

    await loadTrades();

    if (tradeId) {
      setFocusedTradeId(Number(tradeId));
    }

    setView('trades');
  }

  function navigateFromDashboard(nextView) {
    setView(nextView);
  }

  const roomUrl = room?.roomId ? makeRoomPath(room.roomId) : '';

  if (!user && view !== 'userProfile' && view !== 'login') {
    return <AuthForm onLogin={setUser} />;
  }

  if (!user && view === 'login') {
    return (
      <main className="app-shell">
        {loginRequiredMessage && <p className="error">{loginRequiredMessage}</p>}
        <AuthForm onLogin={setUser} />
      </main>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={tradeCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragItem(null)}
    >
      {user && (
        <SafeOnlinePlayersDropdown
          currentUser={user}
          onlineUsers={Array.isArray(onlineUsers) ? onlineUsers : []}
          currentRoomId={room?.roomId || ''}
          notifications={safeVisibleNotifications}
          preferences={typeof notificationPrefs !== 'undefined' && notificationPrefs ? notificationPrefs : {}}
          safeTradeStatuses={safeTradeStatuses}
          unseenCount={safeUnseenNotificationCount}
          onRefreshNotifications={typeof loadNotifications !== 'undefined' ? loadNotifications : (() => {})}
          onMarkRead={typeof markNotificationRead !== 'undefined' ? markNotificationRead : (() => {})}
          onMarkAllRead={typeof markAllNotificationsRead !== 'undefined' ? markAllNotificationsRead : (() => {})}
          onSavePreferences={typeof saveNotificationPreferences !== 'undefined' ? saveNotificationPreferences : (() => {})}
          onCheckTrade={typeof checkTradeNotification !== 'undefined' ? checkTradeNotification : (() => {})}
          onAcceptRoomInvite={typeof acceptRoomInvite !== 'undefined' ? acceptRoomInvite : (() => {})}
          onDeclineRoomInvite={typeof declineRoomInvite !== 'undefined' ? declineRoomInvite : (() => {})}
          onInvitePlayer={typeof invitePlayerToRoom !== 'undefined' ? invitePlayerToRoom : (() => {})}
        />
      )}


<main className="app-shell">
        <header className="topbar">
          <div>
            <h1>VelkTrade</h1>
            <p>{user ? `Logged in as ${user.username}${user.isAdmin ? ' · Admin' : ''}` : 'Viewing as guest'}</p>
          </div>

          <div className="inline-controls">
            {view !== 'dashboard' && user && (
              <button className="ghost" onClick={returnToDashboard}>Dashboard</button>
            )}

            {user && (
              <button className="ghost" onClick={viewMyProfile}>Profile</button>
            )}

            {view === 'userProfile' && !user && (
              <button onClick={() => setView('login')}>Login / Register</button>
            )}

            {room && (
              <button className="ghost danger" onClick={leaveRoom}>Exit Room</button>
            )}

            {user && <button onClick={logout}>Logout</button>}
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {view === 'userProfile' && (
          <UserInventoryPage
            username={profileUsername}
            userRecord={profileUser}
            items={profileItems}
            loading={profileLoading}
            error={profileError}
            isLoggedIn={Boolean(user)}
            currentUsername={user?.username}
            loginRequiredMessage={loginRequiredMessage}
            onLoad={loadUserProfile}
            onBack={() => user ? setView('dashboard') : setView('login')}
            onStartTrade={startTradeWith}
            onLoginRequired={startTradeWith}
            onToggleBuyRequest={toggleBuyRequest}
          />
        )}

        {user && view === 'dashboard' && (
          <Dashboard
            user={user}
            isAdmin={isAdmin}
            inventory={inventory}
            trades={trades}
            onNavigate={navigateFromDashboard}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
          />
        )}

        {user && view === 'inventory' && (
          <>
<section className="card inventory-profile-controls-card">
              <div className="inventory-profile-header">
                <div>
                  <h2>Profile Bio</h2>
                  {!isEditingBio && (
                    <p className="profile-bio-display">
                      {user.bio || 'No bio set.'}
                    </p>
                  )}
                </div>

                <div className="inventory-profile-actions">
                  <button
                    type="button"
                    className="bio-pencil-button ghost"
                    title={isEditingBio ? 'Cancel editing bio' : 'Edit bio'}
                    aria-label={isEditingBio ? 'Cancel editing bio' : 'Edit bio'}
                    onClick={() => {
                      if (isEditingBio) {
                        setBioDraft(user.bio || '');
                        setIsEditingBio(false);
                      } else {
                        setIsEditingBio(true);
                      }
                    }}
                  >
                    ✎
                  </button>

                  <button
                    type="button"
                    className="compact-status-toggle"
                    onClick={() => updateBazaarInventoryVisibility(user.showBazaarInventory === false)}
                    title={user.showBazaarInventory === false ? 'Show inventory on Bazaar' : 'Hide inventory from Bazaar'}
                  >
                    Bazaar <span className={user.showBazaarInventory === false ? 'status-dot off' : 'status-dot on'} />
                  </button>

                  <button
                    type="button"
                    className="compact-status-toggle"
                    onClick={() => updateOnlineVisibility(user.showOnline === false)}
                    title={user.showOnline === false ? 'Appear online' : 'Appear offline'}
                  >
                    Online <span className={user.showOnline === false ? 'status-dot off' : 'status-dot on'} />
                  </button>
                </div>
              </div>

              {isEditingBio && (
                <form
                  className="bio-edit-form"
                  onSubmit={event => {
                    event.preventDefault();
                    saveBio();
                  }}
                >
                  <textarea
                    value={bioDraft}
                    onChange={event => setBioDraft(event.target.value)}
                    placeholder="Add a short bio for your profile..."
                    rows={3}
                  />

                  <div className="inline-controls">
                    <button type="submit">Save Bio</button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setBioDraft(user.bio || '');
                        setIsEditingBio(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>

            <Inventory
              title="My Inventory"
              items={inventory}
              droppableId="inventory-drop"
              onAddImgurItem={addImgurItem}
              onDeleteItem={deleteItem}
              onDoubleClickItem={moveToOffer}
              onOfferItem={room ? moveToOffer : undefined}
              onUpdatePrice={updateItemPrice}
            />
          </>
        )}

        {user && view === 'bazaar' && (
          <Bazaar currentUser={user} />
        )}

        {user && view === 'trades' && (
          <Trades
            trades={trades}
            buyRequests={buyRequests}
            currentUser={user}
            focusedTradeId={focusedTradeId}
            onFocusedTradeHandled={() => setFocusedTradeId(null)}
            onRefresh={() => refreshAllForUser(user)}
            onCounter={openCounter}
          />
        )}

        {user && view === 'offer' && (
          <TradeOfferPanel
            currentUser={user}
            inventory={inventory}
            counterTrade={counterTrade}
            initialTargetUsername={offerTargetUsername}
            onClose={() => {
              setCounterTrade(null);
              setOfferTargetUsername('');
              setView('dashboard');
              refreshAllForUser(user);
            }}
          />
        )}


        {user && view === 'notifications' && (
          <Notifications
            notifications={safeVisibleNotifications}
            preferences={notificationPrefs}
            onlineUsers={onlineUsers}
            safeTradeStatuses={safeTradeStatuses}
            onRefresh={loadNotifications}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
            onSavePreferences={saveNotificationPreferences}
            onCheckTrade={checkTradeNotification}
            onAcceptRoomInvite={acceptRoomInvite}
            onDeclineRoomInvite={declineRoomInvite}
          />
        )}

        {user && view === 'admin' && isAdmin && <AdminPanel />}

        {user && view === 'trade' && (
          <>
            <section className="card room-info-card">
              <div>
                <h2>Live Room</h2>
                <p>Room ID: <strong>{room?.roomId || 'Not in a room'}</strong></p>
                {roomUrl && <p className="muted">Room link: {roomUrl}</p>}
                {room?.acceptedTradeId && <p className="muted">Accepted trade saved as #{room.acceptedTradeId}</p>}
              </div>

              <div className="inline-controls">
                {roomUrl && <button onClick={() => navigator.clipboard?.writeText(roomUrl)}>Copy Room Link</button>}
                {room?.roomId && <button onClick={() => navigator.clipboard?.writeText(room.roomId)}>Copy Room ID</button>}
              </div>

              <form
                className="inline-controls room-invite-form"
                onSubmit={event => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const input = form.elements.inviteUsername;
                  invitePlayerToRoom(input.value);
                  input.value = '';
                }}
              >
                <input name="inviteUsername" placeholder="Invite player by username" />
                <button type="submit">Send Invite</button>
              </form>
            </section>

            <section className="grid two">
              <Inventory
                title="Your Inventory"
                items={visibleInventory}
                droppableId="inventory-drop"
                onAddImgurItem={addImgurItem}
                onDeleteItem={deleteItem}
                onDoubleClickItem={moveToOffer}
                onOfferItem={moveToOffer}
                onUpdatePrice={updateItemPrice}
              />

              <Inventory
                title="View Player Inventory"
                items={viewedInventory}
                readOnly
                usernameValue={viewUsername}
                onUsernameChange={setViewUsername}
                onSearch={() => loadViewedInventory()}
              />
            </section>

            <TradeBoard
              myOfferItems={myOfferItems}
              theirOfferItems={theirOfferItems}
              myIcOffer={myIcOffer}
              theirIcOffer={theirIcOffer}
              myAccepted={myAccepted}
              theirAccepted={theirAccepted}
              myConfirmed={myConfirmed}
              theirConfirmed={theirConfirmed}
              canAccept={Boolean(room && theirPlayer)}
              canConfirm={Boolean(room && theirPlayer && myAccepted && theirAccepted)}
              onAccept={acceptTrade}
              onConfirm={confirmTrade}
              onDoubleClickOfferItem={moveToInventory}
              onOfferIc={offerIc}
              onRemoveIc={removeIcOffer}
            />

            <TradeChat
              disabled={!room || !theirPlayer}
              messages={room?.messages || []}
              currentUser={user}
              onSend={sendChatMessage}
            />
          </>
        )}
      </main>


      {undoDelete && (
        <div className="undo-toast">
          <span>Removed <strong>{undoDelete.item?.title || 'item'}</strong></span>

          <button type="button" onClick={undoDeleteItem}>
            Undo {undoDelete.item?.title || 'Item'}
          </button>

          <button
            type="button"
            className="ghost undo-dismiss"
            aria-label="Dismiss undo"
            onClick={() => {
              if (undoTimerRef.current) {
                window.clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
              }
              setUndoDelete(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="item-card drag-overlay">
            <img src={activeDragItem.image} alt={activeDragItem.title} />
            <span>{activeDragItem.title}</span>
            {activeDragItem.price && <strong className="item-price">{activeDragItem.price}</strong>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
