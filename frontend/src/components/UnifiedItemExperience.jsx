import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import '../styles-unified-mosaic-overrides.css';

function vtText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(entry => vtText(entry)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    if (typeof value.username === 'string') return value.username;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.title === 'string') return value.title;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.value === 'string' || typeof value.value === 'number') return String(value.value);

    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function normalizeImage(value) {
  return vtText(value)
    .replace(/^https?:\/\//i, '')
    .replace(/\?.*$/, '')
    .trim()
    .toLowerCase();
}

function normalizeTitle(value) {
  return vtText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function arrayFromPayload(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.listings)) return value.listings;
  if (Array.isArray(value?.bazaarItems)) return value.bazaarItems;
  if (Array.isArray(value?.inventory)) return value.inventory;
  if (Array.isArray(value?.fromItemDetails)) return value.fromItemDetails;
  if (Array.isArray(value?.toItemDetails)) return value.toItemDetails;
  return [];
}

function candidateId(value) {
  return vtText(value?.id ?? value?.itemId ?? value?.item_id ?? value?.listingId ?? value?.listing_id);
}

function candidateTitle(value) {
  return vtText(value?.title ?? value?.itemTitle ?? value?.item_title ?? value?.name ?? value?.itemName);
}

function candidateImage(value) {
  return vtText(value?.image ?? value?.itemImage ?? value?.item_image ?? value?.img ?? value?.src ?? value?.url ?? value?.imageUrl ?? value?.image_url);
}

function candidatePrice(value) {
  return vtText(value?.price ?? value?.itemPrice ?? value?.item_price ?? value?.priceAmount ?? value?.price_amount ?? value?.ic ?? value?.icPrice ?? value?.ic_price);
}

function candidateOwnerId(value) {
  return vtText(value?.ownerId ?? value?.owner_id ?? value?.userId ?? value?.user_id ?? value?.userid ?? value?.sellerId ?? value?.seller_id);
}

function candidateOwnerUsername(value) {
  return vtText(value?.ownerUsername ?? value?.owner_username ?? value?.username ?? value?.sellerUsername ?? value?.seller_username);
}

const ITEM_API_ENDPOINTS = [
  '/api/bazaar/items',
  '/api/items',
  '/api/inventory',
  '/api/me/inventory',
  '/api/users/me/inventory',
  '/api/profile/inventory',
  '/api/admin/trades',
  '/api/trades'
];

const GRID_SELECTORS = [
  '.inventory-grid',
  '.inventory-items',
  '.items-grid',
  '.item-grid',
  '.profile-items',
  '.profile-inventory',
  '.bazaar-grid',
  '.bazaar-items',
  '.bazaar-list',
  '.trade-items-grid',
  '.trade-inventory-grid',
  '.trade-offer-grid',
  '.trade-menu-items',
  '.selected-items',
  '.offer-items',
  '.admin-trade-side ul',
  '.admin-trade-items',
  '.admin-trade-card',
  '.admin-trade-log',
  '.trade-log'
];

const EXCLUDED_IMAGE_SELECTOR = [
  '.avatar',
  '.profile-avatar',
  '.user-avatar',
  '.badge',
  '.icon',
  '.status-dot',
  '.emoji',
  '.logo',
  '.favicon'
].join(',');

function isProbablyItemImage(image) {
  if (!image || image.closest(EXCLUDED_IMAGE_SELECTOR)) return false;

  const src = vtText(image.currentSrc || image.src);
  if (!src) return false;

  const bounds = image.getBoundingClientRect?.();
  if (bounds && (bounds.width < 34 || bounds.height < 34)) return false;

  const area = image.closest(
    '.inventory, .inventory-page, .profile, .profile-page, .profile-inventory, .bazaar, .bazaar-page, .trade-room, .trade-menu, .trade-panel, .admin-panel, .admin-trade-side, .admin-trade-log, .trade-log, main, section'
  );

  return Boolean(area);
}

function nearestItemCard(start) {
  const image = start?.closest?.('img') || start?.querySelector?.('img');
  if (!isProbablyItemImage(image)) return null;

  const explicit = image.closest(
    '.vt-unified-item-card, article, li, .item-card, .inventory-item, .bazaar-item-card, .bazaar-item, .trade-item, .admin-trade-item, .admin-trade-side li, .admin-trade-image-frame, .admin-trade-image-button'
  );

  if (explicit && explicit.querySelector('img')) return explicit;

  let current = image.parentElement;
  let depth = 0;

  while (current && current !== document.body && depth < 12) {
    const className = vtText(current.className);
    const imgCount = current.querySelectorAll?.('img')?.length || 0;
    const text = vtText(current.textContent);
    const hasItemishClass = /item|card|tile|listing|entry|slot|bazaar|inventory|trade|offer|log/i.test(className);
    const hasItemishText = /IC|price|interested|remove|LVL|DMG|RPM|MAG|offers/i.test(text);

    if (imgCount >= 1 && imgCount <= 6 && (hasItemishClass || hasItemishText)) {
      return current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return image.parentElement;
}

function getText(element, selectors) {
  for (const selector of selectors) {
    const found = element.querySelector(selector);
    const text = found?.textContent?.trim();
    if (text) return text;
  }

  return '';
}

function getData(element, keys) {
  let current = element;

  while (current && current !== document.body) {
    for (const key of keys) {
      if (current.dataset && current.dataset[key] !== undefined) return current.dataset[key];
    }

    for (const attr of Array.from(current.attributes || [])) {
      const name = attr.name.toLowerCase().replace(/^data-/, '').replace(/-/g, '');
      for (const key of keys) {
        if (name === key.toLowerCase()) return attr.value;
      }
    }

    current = current.parentElement;
  }

  return '';
}

function readIdFromAttributes(element) {
  let current = element;

  while (current && current !== document.body) {
    for (const attr of Array.from(current.attributes || [])) {
      const name = attr.name.toLowerCase();
      const value = vtText(attr.value);

      if (
        name === 'data-item-id' ||
        name === 'data-id' ||
        name === 'item-id' ||
        name === 'itemid' ||
        name === 'listing-id' ||
        name === 'data-listing-id'
      ) {
        return value.match(/\d+/)?.[0] || value;
      }

      if ((name.includes('item') || name.includes('listing') || name.endsWith('id')) && /\d+/.test(value)) {
        return value.match(/\d+/)?.[0] || value;
      }

      const routeMatch = value.match(/(?:items?|bazaar\/items|inventory)\/(\d+)/i);
      if (routeMatch) return routeMatch[1];
    }

    current = current.parentElement;
  }

  return '';
}

function normalizeReactCandidate(value) {
  if (!value || typeof value !== 'object') return null;

  const id = candidateId(value);
  const title = candidateTitle(value);
  const src = candidateImage(value);
  const price = candidatePrice(value);
  const ownerId = candidateOwnerId(value);
  const ownerUsername = candidateOwnerUsername(value);

  if (!id && !title && !src && !price) return null;

  return { id, title, src, price, ownerId, ownerUsername };
}

function findReactItemLike(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (value instanceof Element || value instanceof Window || value instanceof Document) return null;

  const direct = normalizeReactCandidate(value);
  if (direct && (direct.id || direct.src || direct.title)) return direct;

  for (const key of [
    'item',
    'listing',
    'bazaarItem',
    'inventoryItem',
    'tradeItem',
    'fromItemDetails',
    'toItemDetails',
    'data',
    'payload',
    'props',
    'children'
  ]) {
    if (value[key]) {
      const found = findReactItemLike(value[key], seen, depth + 1);
      if (found) return found;
    }
  }

  for (const key of Object.keys(value).slice(0, 48)) {
    if (['stateNode', 'return', 'alternate', '_owner'].includes(key)) continue;
    const found = findReactItemLike(value[key], seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function readReactItemData(element) {
  let current = element;
  let depth = 0;

  while (current && current !== document.body && depth < 12) {
    for (const key of Object.keys(current)) {
      if (!key.startsWith('__reactProps$') && !key.startsWith('__reactFiber$')) continue;
      const found = findReactItemLike(current[key]);
      if (found) return found;
    }

    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function extractPriceText(element) {
  const direct =
    getData(element, ['price', 'itemPrice', 'vtPrice']) ||
    getText(element, ['.price', '.item-price', '.bazaar-price']);

  if (direct) return vtText(direct);

  const text = vtText(element.textContent);
  const match = text.match(/[\d,]+(?:\.\d+)?\s*IC/i);
  return match ? match[0] : '';
}

function parseItem(element) {
  const reactItem = readReactItemData(element) || {};
  const img = element.querySelector('img');

  const src = vtText(reactItem.src || img?.currentSrc || img?.src);
  const titleRaw = vtText(
    reactItem.title ||
      getData(element, ['title', 'itemTitle']) ||
      getText(element, ['.item-title', '.title', 'h3', 'h4', 'strong']) ||
      img?.alt,
    'Item'
  );

  const title =
    titleRaw
      .replace(/\bI'?m interested\b/gi, '')
      .replace(/\bInterested\b/gi, '')
      .replace(/\bRemove interest\b/gi, '')
      .replace(/\bRemove\b/gi, '')
      .replace(/[\d,]+(?:\.\d+)?\s*IC/gi, '')
      .replace(/\d+\s+verified users interested/gi, '')
      .trim() || 'Item';

  return {
    id: vtText(reactItem.id || getData(element, ['itemId', 'id', 'listingId']) || readIdFromAttributes(element)),
    title,
    price: vtText(reactItem.price || extractPriceText(element)),
    src,
    ownerId: vtText(reactItem.ownerId || getData(element, ['ownerId', 'userId', 'userid', 'sellerId'])),
    ownerUsername: vtText(reactItem.ownerUsername || getData(element, ['ownerUsername', 'username', 'sellerUsername'])),
    rawElement: element
  };
}

function formatIcPrice(value) {
  const text = vtText(value).trim();
  if (!text) return '';

  if (/IC$/i.test(text)) return text;

  const number = Number(text.replace(/[^\d.]/g, ''));
  if (Number.isFinite(number) && number > 0) {
    return `${number.toLocaleString()} IC`;
  }

  return text;
}

function applyPriceToCard(rawElement, nextPrice) {
  if (!rawElement) return;

  const formatted = formatIcPrice(nextPrice);

  rawElement.dataset.vtPrice = formatted;
  rawElement.dataset.price = formatted;
  rawElement.dataset.itemPrice = formatted;

  const visiblePrice = rawElement.querySelector('.price, .item-price, .bazaar-price');
  if (visiblePrice) visiblePrice.textContent = formatted;

  const oldBadge = rawElement.querySelector(':scope > .vt-hover-price');
  if (oldBadge) oldBadge.textContent = formatted;
}

function isPrivileged(user) {
  const username = vtText(user?.username).toLowerCase();

  return Boolean(
    user?.isAdmin ||
      user?.is_admin ||
      user?.admin ||
      user?.isDeveloper ||
      user?.is_developer ||
      user?.developer ||
      user?.role === 'admin' ||
      user?.role === 'developer' ||
      user?.rank === 'admin' ||
      user?.rank === 'developer' ||
      username === 'salt' ||
      username === 'velkon'
  );
}

function isOwner(user, item) {
  if (!user || !item) return false;

  if (item.ownerId && user.id && String(item.ownerId) === String(user.id)) return true;

  if (
    item.ownerUsername &&
    user.username &&
    item.ownerUsername.toLowerCase() === user.username.toLowerCase()
  ) {
    return true;
  }

  return false;
}

function userDisplayName(user) {
  return vtText(user?.username || user?.name || user?.displayName || user?.id, 'User');
}

function isIgnoredClickTarget(target) {
  if (target?.closest?.('.vt-item-popout')) return true;

  const interactive = target?.closest?.('button, a, input, textarea, select, label, summary, details, [role="button"]');
  if (!interactive) return false;

  return !interactive.closest?.('.vt-unified-item-card');
}

async function toggleTopOnline(nextValue) {
  const body = JSON.stringify({
    showOnline: nextValue,
    show_online: nextValue,
    online: nextValue,
    enabled: nextValue
  });

  const attempts = [
    ['/api/me/online', 'PUT'],
    ['/api/profile/online', 'PUT'],
    ['/api/users/me/online', 'PUT'],
    ['/api/inventory/online', 'PUT'],
    ['/api/me/online', 'PATCH'],
    ['/api/profile/online', 'PATCH'],
    ['/api/users/me/online', 'PATCH'],
    ['/api/inventory/online', 'PATCH'],
    ['/api/me/online', 'POST'],
    ['/api/profile/online', 'POST'],
    ['/api/users/me/online', 'POST'],
    ['/api/inventory/online', 'POST']
  ];

  for (const [path, method] of attempts) {
    try {
      return await api(path, { method, body });
    } catch {
      // Try next route.
    }
  }

  return { ok: false, localOnly: true, online: nextValue };
}

function syncOnlinePills(nextValue) {
  document.querySelectorAll('button, .profile-toggle-pill, .inventory-status-pill, [class*="online" i]').forEach(element => {
    const text = vtText(element.textContent).trim().toLowerCase();
    if (text !== 'online' && text !== 'offline') return;

    element.classList.toggle('is-online', nextValue);
    element.classList.toggle('is-offline', !nextValue);

    const dot = element.querySelector('.status-dot') || element.querySelector('span');
    if (dot) dot.classList.add('status-dot');

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && /online|offline/i.test(node.textContent)) {
        node.textContent = nextValue ? 'Online' : 'Offline';
        return;
      }
    }
  });
}

export default function UnifiedItemExperience({ currentUser }) {
  const [item, setItem] = useState(null);
  const [price, setPrice] = useState('');
  const [interestedUsers, setInterestedUsers] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.__VELKTRADE_OPEN_ITEM_POPUP__ = parsed => {
      setItem(parsed);
      setPrice(vtText(parsed.price));
      setMessage('');
      setInterestedUsers([]);
    };

    function tagItems() {
      GRID_SELECTORS.forEach(selector => {
        document.querySelectorAll(selector).forEach(grid => {
          grid.classList.add('vt-unified-mosaic-grid');
        });
      });

      const cards = new Set();

      document.querySelectorAll('main img, section img, article img, .card img, .panel img, .admin-panel img, .trade-room img, .trade-log img').forEach(image => {
        if (!isProbablyItemImage(image)) return;
        const card = nearestItemCard(image);
        if (card?.querySelector?.('img')) cards.add(card);
      });

      cards.forEach(card => {
        card.classList.add('vt-unified-item-card');
        const parsed = parseItem(card);

        if (parsed.id) {
          card.dataset.itemId = parsed.id;
          card.dataset.id = parsed.id;
        }

        if (parsed.title) card.dataset.title = parsed.title;
        if (parsed.price) {
          card.dataset.vtPrice = parsed.price;
          card.dataset.price = parsed.price;
        }
      });
    }

    tagItems();

    const observer = new MutationObserver(tagItems);
    observer.observe(document.body, { childList: true, subtree: true });

    function handleItemClick(event) {
      if (isIgnoredClickTarget(event.target)) return;

      const card = nearestItemCard(event.target);
      if (!card) return;

      const parsed = parseItem(card);
      if (!parsed.src) return;

      event.preventDefault();
      event.stopPropagation();

      window.__VELKTRADE_OPEN_ITEM_POPUP__?.(parsed);
    }

    async function handleTopOnlineClick(event) {
      const pill = event.target?.closest?.('button, .profile-toggle-pill, .inventory-status-pill, [class*="online" i]');
      if (!pill) return;

      const text = vtText(pill.textContent).trim().toLowerCase();
      if (text !== 'online' && text !== 'offline') return;

      if (pill.closest('.vt-unified-item-card, .vt-item-popout, .unified-player-panel, .presence-hub-panel, .safe-online-panel')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const next = text !== 'online';
      window.localStorage.setItem('velktrade-show-online', String(next));
      syncOnlinePills(next);
      await toggleTopOnline(next);
    }

    document.addEventListener('click', handleItemClick, true);
    document.addEventListener('click', handleTopOnlineClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleItemClick, true);
      document.removeEventListener('click', handleTopOnlineClick, true);
      if (window.__VELKTRADE_OPEN_ITEM_POPUP__) {
        delete window.__VELKTRADE_OPEN_ITEM_POPUP__;
      }
    };
  }, []);

  const hasItemId = Boolean(vtText(item?.id));
  const ownerCanEditPrice = useMemo(() => Boolean(item && hasItemId && isOwner(currentUser, item)), [currentUser, item, hasItemId]);
  const canRemoveListing = useMemo(() => Boolean(item && hasItemId && (isOwner(currentUser, item) || isPrivileged(currentUser))), [currentUser, item, hasItemId]);
  const canShowInterested = useMemo(() => Boolean(item && hasItemId && (isOwner(currentUser, item) || isPrivileged(currentUser))), [currentUser, item, hasItemId]);
  const canInterest = useMemo(() => Boolean(item && hasItemId && !isOwner(currentUser, item)), [currentUser, item, hasItemId]);

  async function resolveItemIdFromApis() {
    const targetImage = normalizeImage(item?.src);
    const targetTitle = normalizeTitle(item?.title);

    for (const endpoint of ITEM_API_ENDPOINTS) {
      try {
        const data = await api(endpoint);
        const candidates = arrayFromPayload(data);

        for (const candidate of candidates) {
          const id = candidateId(candidate);
          if (!id) continue;

          const candidateImg = normalizeImage(candidateImage(candidate));
          const candidateName = normalizeTitle(candidateTitle(candidate));

          if (targetImage && candidateImg && candidateImg === targetImage) return id;
          if (targetTitle && candidateName && candidateName === targetTitle) return id;
          if (targetImage && candidateImg && (candidateImg.includes(targetImage) || targetImage.includes(candidateImg))) return id;
        }
      } catch {
        // Try next endpoint.
      }
    }

    return '';
  }

  async function ensureItemId() {
    if (item?.id) return item.id;

    const parsed = item?.rawElement ? parseItem(item.rawElement) : null;
    if (parsed?.id) {
      setItem(previous => ({ ...previous, ...parsed }));
      return parsed.id;
    }

    const fromApis = await resolveItemIdFromApis();
    if (fromApis) {
      setItem(previous => ({ ...previous, id: fromApis }));
      return fromApis;
    }

    try {
      const data = await api('/api/items/resolve', {
        method: 'POST',
        body: JSON.stringify({
          title: vtText(item?.title),
          image: vtText(item?.src),
          price: vtText(item?.price || price)
        })
      });

      const resolved = vtText(data?.id || data?.itemId || data?.item?.id);
      if (resolved) {
        setItem(previous => ({ ...previous, id: resolved }));
        return resolved;
      }
    } catch {
      // Optional backend route.
    }

    return '';
  }

  async function savePrice() {
    try {
      const itemId = await ensureItemId();
      if (!itemId || !ownerCanEditPrice) return;

      const formatted = formatIcPrice(price);

      await api(`/api/items/${encodeURIComponent(itemId)}/price`, {
        method: 'PUT',
        body: JSON.stringify({ price: formatted, title: vtText(item?.title), image: vtText(item?.src) })
      });

      applyPriceToCard(item?.rawElement, formatted);
      setPrice(formatted);
      setItem(previous => ({ ...previous, id: itemId, price: formatted }));
      setMessage('Price updated.');
    } catch (error) {
      console.error('savePrice failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function addInterest() {
    try {
      const itemId = await ensureItemId();
      if (!itemId || !canInterest) return;

      await api(`/api/items/${encodeURIComponent(itemId)}/interest`, {
        method: 'POST',
        body: JSON.stringify({ title: vtText(item?.title), image: vtText(item?.src), price: vtText(item?.price) })
      });

      setItem(previous => ({ ...previous, id: itemId }));
      setMessage('Interest added.');
    } catch (error) {
      console.error('addInterest failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function removeInterest() {
    try {
      const itemId = await ensureItemId();
      if (!itemId || !canInterest) return;

      await api(`/api/items/${encodeURIComponent(itemId)}/interest`, {
        method: 'DELETE'
      });

      setItem(previous => ({ ...previous, id: itemId }));
      setMessage('Interest removed.');
    } catch (error) {
      console.error('removeInterest failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function removeItem() {
    try {
      const itemId = await ensureItemId();
      if (!itemId || !canRemoveListing) return;

      if (!window.confirm('Remove this item/listing?')) return;

      await api(`/api/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE'
      });

      setMessage('Item removed or listing disabled.');
      item.rawElement?.remove?.();
      setItem(null);
    } catch (error) {
      console.error('removeItem failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function loadInterestedUsers() {
    try {
      const itemId = await ensureItemId();
      if (!itemId || !canShowInterested) return;

      const data = await api(`/api/items/${encodeURIComponent(itemId)}/interest`);
      const users = Array.isArray(data?.users)
        ? data.users
        : Array.isArray(data?.interestedUsers)
          ? data.interestedUsers
          : [];

      setItem(previous => ({ ...previous, id: itemId }));
      setInterestedUsers(users);
    } catch (error) {
      console.error('loadInterestedUsers failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  if (!item) return null;

  const visibleInterested = verifiedOnly
    ? interestedUsers.filter(user => user?.isVerified || user?.is_verified || user?.isTrusted)
    : interestedUsers;

  return (
    <div className="vt-item-popout-backdrop" onClick={() => setItem(null)}>
      <section className="vt-item-popout" onClick={event => event.stopPropagation()}>
        <div className="vt-item-popout-image-wrap">
          <img src={vtText(item.src)} alt={vtText(item.title, 'Item')} />
        </div>

        <aside className="vt-item-popout-menu">
          <div className="vt-item-popout-header">
            <h2>{vtText(item.title, 'Item')}</h2>
            <button type="button" className="vt-icon-button" onClick={() => setItem(null)} aria-label="Close item menu">
              ×
            </button>
          </div>

          {vtText(item.price) && <p className="admin-ic-line">{vtText(item.price)}</p>}

          {vtText(message) && <p className="vt-muted-note">{vtText(message)}</p>}

          {ownerCanEditPrice && (
            <label className="vt-price-editor">
              <span>Edit price</span>
              <input
                value={vtText(price)}
                onChange={event => setPrice(event.target.value)}
                placeholder="Example: 500000 IC"
              />
            </label>
          )}

          <div className="vt-item-popout-actions">
            {ownerCanEditPrice && (
              <button type="button" className="vt-primary-action" onClick={savePrice}>
                Save price
              </button>
            )}

            {canInterest && (
              <button type="button" className="vt-primary-action" onClick={addInterest}>
                Interested
              </button>
            )}

            {canInterest && (
              <button type="button" className="vt-secondary-action" onClick={removeInterest}>
                Remove interest
              </button>
            )}

            {canShowInterested && (
              <button type="button" className="vt-secondary-action" onClick={loadInterestedUsers}>
                Show interested users
              </button>
            )}

            {canRemoveListing && (
              <button type="button" className="vt-danger-button" onClick={removeItem}>
                Remove item/listing
              </button>
            )}
          </div>

          {canShowInterested && interestedUsers.length > 0 && (
            <label className="vt-checkbox-row">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={event => setVerifiedOnly(event.target.checked)}
              />
              <span>Verified users only</span>
            </label>
          )}

          {canShowInterested && interestedUsers.length > 0 && (
            <div className="vt-interested-list">
              {visibleInterested.length === 0 ? (
                <p className="vt-muted-note">No matching interested users.</p>
              ) : (
                visibleInterested.map((user, index) => (
                  <p key={vtText(user?.id || user?.username || index, String(index))}>
                    {userDisplayName(user)}
                    {(user?.isVerified || user?.is_verified || user?.isTrusted) ? ' ✓' : ''}
                  </p>
                ))
              )}
            </div>
          )}

          {!ownerCanEditPrice && !canInterest && !canShowInterested && !canRemoveListing && (
            <p className="vt-muted-note">No actions available for this item.</p>
          )}
        </aside>
      </section>
    </div>
  );
}
