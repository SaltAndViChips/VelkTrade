import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import '../styles-unified-mosaic-overrides.css';

let vtUnifiedItemExperienceInstanceCounter = 0;

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
    if (typeof value.value === 'string' || typeof value.value === 'number') {
      return String(value.value);
    }

    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}


function vtNormalizeImage(value) {
  return vtText(value).replace(/^https?:\/\//i, '').replace(/\?.*$/, '').trim().toLowerCase();
}

function vtNormalizeTitle(value) {
  return vtText(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function vtArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.listings)) return value.listings;
  if (Array.isArray(value?.bazaarItems)) return value.bazaarItems;
  if (Array.isArray(value?.inventory)) return value.inventory;
  return [];
}

function vtCandidateId(candidate) {
  return vtText(candidate?.id ?? candidate?.itemId ?? candidate?.item_id ?? candidate?.itemID ?? candidate?.listingId ?? candidate?.listing_id);
}

function vtCandidateTitle(candidate) {
  return vtText(candidate?.title ?? candidate?.itemTitle ?? candidate?.item_title ?? candidate?.name ?? candidate?.itemName);
}

function vtCandidateImage(candidate) {
  return vtText(candidate?.image ?? candidate?.itemImage ?? candidate?.item_image ?? candidate?.img ?? candidate?.src ?? candidate?.url ?? candidate?.imageUrl ?? candidate?.image_url);
}

const ITEM_CACHE_ENDPOINTS = [
  '/api/bazaar/items',
  '/api/items',
  '/api/inventory',
  '/api/me/inventory',
  '/api/users/me/inventory',
  '/api/profile/inventory'
];

const ITEM_AREA_SELECTOR = [
  '.inventory',
  '.inventory-page',
  '.profile',
  '.profile-page',
  '.profile-inventory',
  '.bazaar',
  '.bazaar-page',
  '.trade-room',
  '.trade-menu',
  '.trade-panel',
  '.admin-panel',
  '.admin-trade-side',
  '[class*="inventory"]',
  '[class*="Inventory"]',
  '[class*="profile"]',
  '[class*="Profile"]',
  '[class*="bazaar"]',
  '[class*="Bazaar"]',
  '[class*="trade"]',
  '[class*="Trade"]'
].join(',');

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
  '.admin-trade-side ul'
];

const ITEM_CARD_SELECTOR = [
  '.inventory-grid > *',
  '.inventory-items > *',
  '.items-grid > *',
  '.item-grid > *',
  '.profile-items > *',
  '.profile-inventory > *',
  '.bazaar-grid > *',
  '.bazaar-items > *',
  '.bazaar-list > *',
  '.trade-items-grid > *',
  '.trade-inventory-grid > *',
  '.trade-offer-grid > *',
  '.trade-menu-items > *',
  '.selected-items > *',
  '.offer-items > *',
  '.admin-trade-side li'
].join(',');

function getLikelyItemCard(target) {
  if (!target?.closest) return null;

  const directCard = target.closest(ITEM_CARD_SELECTOR);
  if (directCard?.querySelector?.('img')) return directCard;

  const area = target.closest(ITEM_AREA_SELECTOR) || target.closest('main, section, article, .card, .panel, body');
  if (!area) return null;

  let current = target;
  let depth = 0;

  while (current && current !== area && current !== document.body && depth < 12) {
    if (current.querySelector?.('img')) {
      const className = vtText(current.className);
      const hasItemClass = /item|card|tile|listing|entry|slot|bazaar|inventory|trade/i.test(className);
      const hasOneMainImage = (current.querySelectorAll?.('img')?.length || 0) <= 3;
      const hasPriceOrTitle = /IC|price|interested|remove/i.test(vtText(current.textContent)) || current.querySelector?.('h3,h4,strong,.title,.item-title');

      if (hasItemClass || (hasOneMainImage && hasPriceOrTitle)) return current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return target.closest('article, li, .card, [class*="item" i], [class*="card" i]');
}

function getText(element, selectors) {
  for (const selector of selectors) {
    const found = element.querySelector(selector);
    const text = found?.textContent?.trim();
    if (text) return text;
  }

  return '';
}

function getData(element, key) {
  let current = element;
  const normalizedKey = key.toLowerCase();

  while (current && current !== document.body) {
    if (current.dataset && current.dataset[key] !== undefined) {
      return current.dataset[key];
    }

    if (current.attributes) {
      for (const attr of Array.from(current.attributes)) {
        const attrName = attr.name.toLowerCase().replace(/^data-/, '').replace(/-/g, '');
        if (attrName === normalizedKey.toLowerCase()) return attr.value;
      }
    }

    current = current.parentElement;
  }

  return '';
}

function extractPriceText(element) {
  const direct = vtText(
    getData(element, 'price') ||
      getData(element, 'itemPrice') ||
      getText(element, ['.price', '.item-price', '.bazaar-price'])
  );

  if (direct) return direct;

  const text = vtText(element.textContent);
  const icMatch = text.match(/[\d,]+(?:\.\d+)?\s*IC/i);
  if (icMatch) return icMatch[0];

  return '';
}


function normalizeItemCandidate(value) {
  if (!value || typeof value !== 'object') return null;

  const id = vtText(value.id ?? value.itemId ?? value.item_id ?? value.itemID ?? value.listingId ?? value.listing_id);
  const title = vtText(value.title ?? value.itemTitle ?? value.item_title ?? value.name ?? value.itemName);
  const src = vtText(value.image ?? value.itemImage ?? value.item_image ?? value.img ?? value.src ?? value.url ?? value.imageUrl ?? value.image_url);
  const price = vtText(value.price ?? value.itemPrice ?? value.item_price ?? value.priceAmount ?? value.price_amount ?? value.ic ?? value.icPrice ?? value.ic_price);
  const ownerId = vtText(value.ownerId ?? value.owner_id ?? value.userId ?? value.user_id ?? value.userid ?? value.sellerId ?? value.seller_id);
  const ownerUsername = vtText(value.ownerUsername ?? value.owner_username ?? value.username ?? value.sellerUsername ?? value.seller_username);

  if (!id && !title && !src && !price) return null;

  return { id, title, src, price, ownerId, ownerUsername };
}

function findItemLike(value, seen = new WeakSet(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (value instanceof Element || value instanceof Window || value instanceof Document) return null;

  const direct = normalizeItemCandidate(value);
  if (direct && (direct.id || direct.src || direct.title)) return direct;

  const preferredKeys = [
    'item', 'listing', 'bazaarItem', 'inventoryItem', 'tradeItem',
    'data', 'payload', 'props', 'children'
  ];

  for (const key of preferredKeys) {
    if (value[key]) {
      const found = findItemLike(value[key], seen, depth + 1);
      if (found) return found;
    }
  }

  for (const key of Object.keys(value).slice(0, 30)) {
    if (key === 'stateNode' || key === 'return' || key === 'alternate' || key === '_owner') continue;
    const found = findItemLike(value[key], seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function findReactItemData(element) {
  let current = element;
  let depth = 0;

  while (current && current !== document.body && depth < 10) {
    for (const key of Object.keys(current)) {
      if (!key.startsWith('__reactProps$') && !key.startsWith('__reactFiber$')) continue;

      const found = findItemLike(current[key]);
      if (found) return found;
    }

    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function readAnyDataId(element) {
  let current = element;

  while (current && current !== document.body) {
    for (const attr of Array.from(current.attributes || [])) {
      const name = attr.name.toLowerCase();
      const value = vtText(attr.value);

      if ((name.includes('item') || name.endsWith('id') || name.includes('listing')) && /\d+/.test(value)) {
        return value.match(/\d+/)?.[0] || value;
      }

      const routeMatch = value.match(/(?:items?|bazaar\/items)\/(\d+)/i);
      if (routeMatch) return routeMatch[1];
    }

    current = current.parentElement;
  }

  return '';
}


function parseItem(element) {
  const reactItem = findReactItemData(element) || {};
  const img = element.querySelector('img');
  const src = vtText(reactItem.src || img?.src);

  const titleText = vtText(
    reactItem.title ||
      reactItem.title ||
      getData(element, 'title') ||
      getData(element, 'itemTitle') ||
      getText(element, ['.item-title', '.title', 'h3', 'h4', 'strong']) ||
      img?.alt,
    'Item'
  );

  const title = titleText
    .replace(/\bI'?m interested\b/gi, '')
    .replace(/\bInterested\b/gi, '')
    .replace(/\bRemove interest\b/gi, '')
    .replace(/\bRemove\b/gi, '')
    .replace(/[\d,]+(?:\.\d+)?\s*IC/gi, '')
    .replace(/\d+\s+verified users interested/gi, '')
    .trim() || 'Item';

  const price = vtText(reactItem.price || extractPriceText(element));

  const id = vtText(
    reactItem.id ||
      reactItem.id ||
      getData(element, 'itemId') ||
      getData(element, 'id') ||
      readAnyDataId(element) ||
      element.id?.match(/\d+/)?.[0]
  );

  const ownerId = vtText(
    reactItem.ownerId ||
      reactItem.ownerId ||
      getData(element, 'ownerId') ||
      getData(element, 'userId') ||
      getData(element, 'userid')
  );

  const ownerUsername = vtText(
    reactItem.ownerUsername ||
      reactItem.ownerUsername ||
      getData(element, 'ownerUsername') ||
      getData(element, 'username')
  );

  return {
    id,
    title,
    price,
    src,
    ownerId,
    ownerUsername,
    rawElement: element
  };
}

function isPrivileged(user) {
  return Boolean(
    user?.isAdmin ||
      user?.is_admin ||
      user?.isDeveloper ||
      user?.is_developer ||
      user?.role === 'admin' ||
      user?.role === 'developer'
  );
}

function isOwner(user, item) {
  if (!user || !item) return false;

  if (item.ownerId && user.id && String(item.ownerId) === String(user.id)) {
    return true;
  }

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
  return vtText(
    user?.username ||
      user?.name ||
      user?.displayName ||
      user?.id,
    'User'
  );
}

function shouldIgnoreClick(target) {
  const interactive = target?.closest?.(
    'button, a, input, textarea, select, label, summary, details, [role="button"]'
  );

  if (!interactive) return false;

  return !interactive.closest?.('.vt-unified-item-card');
}


async function vtSetOnlineFromTopPill(nextValue) {
  const body = JSON.stringify({ showOnline: nextValue, show_online: nextValue, online: nextValue, enabled: nextValue });
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
      // Try next compatibility route.
    }
  }

  return { ok: false, localOnly: true, online: nextValue };
}

function vtSyncOnlinePillText(nextValue) {
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

    if (!element.querySelector('.status-dot')) {
      element.textContent = nextValue ? 'Online' : 'Offline';
    }
  });
}

export default function UnifiedItemExperience({ currentUser }) {
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) {
    vtUnifiedItemExperienceInstanceCounter += 1;
    instanceIdRef.current = vtUnifiedItemExperienceInstanceCounter;
    window.__VELKTRADE_ACTIVE_ITEM_EXPERIENCE_ID__ = instanceIdRef.current;
  }

  const [item, setItem] = useState(null);
  const [price, setPrice] = useState('');
  const [interestedUsers, setInterestedUsers] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function tagItems() {
      GRID_SELECTORS.forEach(selector => {
        document.querySelectorAll(selector).forEach(grid => {
          grid.classList.add('vt-unified-mosaic-grid');
        });
      });

      const cards = new Set();

      document.querySelectorAll(ITEM_CARD_SELECTOR).forEach(card => {
        if (card.querySelector('img')) cards.add(card);
      });

      document.querySelectorAll('main img, section img, article img, .card img').forEach(image => {
        const card = getLikelyItemCard(image);
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
        if (parsed.price) card.dataset.vtPrice = parsed.price;
      });
    }

    tagItems();

    const observer = new MutationObserver(tagItems);
    observer.observe(document.body, { childList: true, subtree: true });

    function handleClick(event) {
      if (window.__VELKTRADE_ACTIVE_ITEM_EXPERIENCE_ID__ !== instanceIdRef.current) return;
      if (event.target?.closest?.('.vt-item-popout')) return;
      if (shouldIgnoreClick(event.target)) return;

      const card = getLikelyItemCard(event.target);
      if (!card) return;

      const parsed = parseItem(card);
      if (!parsed.src) return;

      event.preventDefault();
      event.stopPropagation();

      document.querySelectorAll('.vt-item-popout-backdrop').forEach(node => node.remove());
      setItem(parsed);
      setPrice(vtText(parsed.price));
      setMessage('');
      setInterestedUsers([]);
    }

    async function handleTopOnlineClick(event) {
      const pill = event.target?.closest?.('button, .profile-toggle-pill, .inventory-status-pill, [class*="online" i]');
      if (!pill) return;

      const text = vtText(pill.textContent).trim().toLowerCase();
      if (text !== 'online' && text !== 'offline') return;

      const isInsideItem = pill.closest('.vt-unified-item-card, .vt-item-popout, .unified-player-panel, .presence-hub-panel, .safe-online-panel');
      if (isInsideItem) return;

      event.preventDefault();
      event.stopPropagation();

      const next = text !== 'online';
      window.localStorage.setItem('velktrade-show-online', String(next));
      vtSyncOnlinePillText(next);
      await vtSetOnlineFromTopPill(next);
    }

    document.addEventListener('click', handleClick, true);
    document.addEventListener('click', handleTopOnlineClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('click', handleTopOnlineClick, true);
    };
  }, []);

  const canManage = useMemo(() => {
    return Boolean(item && (isOwner(currentUser, item) || isPrivileged(currentUser)));
  }, [currentUser, item]);

  const canInterest = useMemo(() => {
    return Boolean(item && !isOwner(currentUser, item));
  }, [currentUser, item]);
  async function resolveItemIdFromApis() {
    const targetImage = vtNormalizeImage(item?.src);
    const targetTitle = vtNormalizeTitle(item?.title);

    for (const endpoint of ITEM_CACHE_ENDPOINTS) {
      try {
        const data = await api(endpoint);
        const candidates = vtArray(data);

        for (const candidate of candidates) {
          const id = vtCandidateId(candidate);
          if (!id) continue;

          const candidateImage = vtNormalizeImage(vtCandidateImage(candidate));
          const candidateTitle = vtNormalizeTitle(vtCandidateTitle(candidate));

          if (targetImage && candidateImage && candidateImage === targetImage) return id;
          if (targetTitle && candidateTitle && candidateTitle === targetTitle) return id;
          if (targetImage && candidateImage && (candidateImage.includes(targetImage) || targetImage.includes(candidateImage))) return id;
        }
      } catch {
        // Try the next compatibility endpoint.
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

    const resolvedFromApis = await resolveItemIdFromApis();
    if (resolvedFromApis) {
      setItem(previous => ({ ...previous, id: resolvedFromApis }));
      return resolvedFromApis;
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

      const resolvedId = vtText(data?.id || data?.itemId || data?.item?.id);
      if (resolvedId) {
        setItem(previous => ({ ...previous, id: resolvedId }));
        return resolvedId;
      }
    } catch {
      // Optional route. Older backends will not have it.
    }

    return '';
  }

  async function savePrice() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for price update.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(itemId)}/price`, {
      method: 'PUT',
      body: JSON.stringify({ price: vtText(price), title: vtText(item?.title), image: vtText(item?.src) })
    });

    setMessage('Price updated.');
    } catch (error) {
      console.error('savePrice failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function addInterest() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for interest.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(itemId)}/interest`, {
      method: 'POST',
      body: JSON.stringify({ title: vtText(item?.title), image: vtText(item?.src), price: vtText(item?.price) })
    });

    setMessage('Interest added.');
    } catch (error) {
      console.error('addInterest failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function removeInterest() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for interest.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(itemId)}/interest`, {
      method: 'DELETE'
    });

    setMessage('Interest removed.');
    } catch (error) {
      console.error('removeInterest failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function removeItem() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for removal.');
      return;
    }

    if (!window.confirm('Remove this item/listing?')) return;

    await api(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    });

    setMessage('Item removed or listing disabled.');
    item.rawElement?.remove?.();
    } catch (error) {
      console.error('removeItem failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function loadInterestedUsers() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for interested users.');
      return;
    }

    const data = await api(`/api/items/${encodeURIComponent(itemId)}/interest`);
    const users = Array.isArray(data?.users)
      ? data.users
      : Array.isArray(data?.interestedUsers)
        ? data.interestedUsers
        : [];

    setInterestedUsers(users);
    } catch (error) {
      console.error('loadInterestedUsers failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  async function instantTrade() {
    try {
    const itemId = await ensureItemId();
    if (!itemId) {
      setMessage('Could not detect item id for instant trade.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(itemId)}/instant-trade`, {
      method: 'POST',
      body: JSON.stringify({ price: vtText(price), title: vtText(item?.title), image: vtText(item?.src) })
    });

    setMessage('Trade created and item marked trade pending.');
    } catch (error) {
      console.error('instantTrade failed:', error);
      setMessage('Request failed. The backend route may need redeploying.');
    }
  }

  if (!item || window.__VELKTRADE_ACTIVE_ITEM_EXPERIENCE_ID__ !== instanceIdRef.current) return null;

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

          {vtText(item.price) && (
            <p className="admin-ic-line">{vtText(item.price)}</p>
          )}

          {vtText(message) && (
            <p className="vt-muted-note">{vtText(message)}</p>
          )}

          {canManage && (
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
            {canManage && (
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

            {canManage && (
              <button type="button" className="vt-secondary-action" onClick={loadInterestedUsers}>
                Show interested users
              </button>
            )}

            {canManage && (
              <button type="button" className="vt-primary-action" onClick={instantTrade}>
                Instant trade / mark pending
              </button>
            )}

            {canManage && (
              <button type="button" className="vt-danger-button" onClick={removeItem}>
                Remove item/listing
              </button>
            )}
          </div>

          {canManage && (
            <label className="vt-checkbox-row">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={event => setVerifiedOnly(event.target.checked)}
              />
              <span>Verified users only</span>
            </label>
          )}

          {canManage && interestedUsers.length > 0 && (
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
        </aside>
      </section>
    </div>
  );
}
