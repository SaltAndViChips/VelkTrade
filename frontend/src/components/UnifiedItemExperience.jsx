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

  const image = target.closest('img');
  if (!image) return null;

  const area = image.closest(ITEM_AREA_SELECTOR);
  if (!area) return null;

  const explicit = image.closest(ITEM_CARD_SELECTOR);
  if (explicit && explicit !== document.body) return explicit;

  let current = image.parentElement;
  let depth = 0;

  while (current && current !== area && current !== document.body && depth < 8) {
    const className = vtText(current.className);
    const hasItemClass = /item|card|tile|listing|entry|slot/i.test(className);
    const hasText = current.textContent && current.textContent.trim().length > 0;
    const imgCount = current.querySelectorAll?.('img')?.length || 0;

    if ((hasItemClass || hasText) && imgCount <= 2) return current;

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

function getData(element, key) {
  let current = element;

  while (current && current !== document.body) {
    if (current.dataset && current.dataset[key] !== undefined) {
      return current.dataset[key];
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

function parseItem(element) {
  const img = element.querySelector('img');
  const src = vtText(img?.src);

  const titleText = vtText(
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
    .trim() || 'Item';

  const price = extractPriceText(element);

  const id = vtText(
    getData(element, 'itemId') ||
      getData(element, 'id') ||
      element.id?.match(/\d+/)?.[0]
  );

  const ownerId = vtText(
    getData(element, 'ownerId') ||
      getData(element, 'userId') ||
      getData(element, 'userid')
  );

  const ownerUsername = vtText(
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

function isInteractiveElement(target) {
  return Boolean(
    target?.closest?.(
      'button, a, input, textarea, select, label, summary, details, [role="button"]'
    )
  );
}

export default function UnifiedItemExperience({ currentUser }) {
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

      document.querySelectorAll(ITEM_CARD_SELECTOR).forEach(card => {
        const hasImage = card.querySelector('img');
        if (!hasImage) return;

        card.classList.add('vt-unified-item-card');

        const priceText = extractPriceText(card);
        if (priceText && !card.querySelector(':scope > .vt-hover-price')) {
          const badge = document.createElement('span');
          badge.className = 'vt-hover-price';
          badge.textContent = priceText;
          card.appendChild(badge);
        }
      });
    }

    tagItems();

    const observer = new MutationObserver(tagItems);
    observer.observe(document.body, { childList: true, subtree: true });

    function handleClick(event) {
      if (isInteractiveElement(event.target) && !event.target.closest('img')) {
        return;
      }

      const card = getLikelyItemCard(event.target);
      if (!card) return;

      const parsed = parseItem(card);
      if (!parsed.src) return;

      event.preventDefault();
      event.stopPropagation();

      setItem(parsed);
      setPrice(vtText(parsed.price));
      setMessage('');
      setInterestedUsers([]);
    }

    document.addEventListener('click', handleClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  const canManage = useMemo(() => {
    return Boolean(item && (isOwner(currentUser, item) || isPrivileged(currentUser)));
  }, [currentUser, item]);

  const canInterest = useMemo(() => {
    return Boolean(item && !isOwner(currentUser, item));
  }, [currentUser, item]);

  async function savePrice() {
    if (!item?.id) {
      setMessage('Could not detect item id for price update.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/price`, {
      method: 'PUT',
      body: JSON.stringify({ price: vtText(price) })
    });

    setMessage('Price updated.');
  }

  async function addInterest() {
    if (!item?.id) {
      setMessage('Could not detect item id for interest.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/interest`, {
      method: 'POST'
    });

    setMessage('Interest added.');
  }

  async function removeInterest() {
    if (!item?.id) {
      setMessage('Could not detect item id for interest.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/interest`, {
      method: 'DELETE'
    });

    setMessage('Interest removed.');
  }

  async function removeItem() {
    if (!item?.id) {
      setMessage('Could not detect item id for removal.');
      return;
    }

    if (!window.confirm('Remove this item/listing?')) return;

    await api(`/api/items/${encodeURIComponent(item.id)}`, {
      method: 'DELETE'
    });

    setMessage('Item removed or listing disabled.');
    item.rawElement?.remove?.();
  }

  async function loadInterestedUsers() {
    if (!item?.id) {
      setMessage('Could not detect item id for interested users.');
      return;
    }

    const data = await api(`/api/items/${encodeURIComponent(item.id)}/interest`);
    const users = Array.isArray(data?.users)
      ? data.users
      : Array.isArray(data?.interestedUsers)
        ? data.interestedUsers
        : [];

    setInterestedUsers(users);
  }

  async function instantTrade() {
    if (!item?.id) {
      setMessage('Could not detect item id for instant trade.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/instant-trade`, {
      method: 'POST',
      body: JSON.stringify({ price: vtText(price) })
    });

    setMessage('Trade created and item marked trade pending.');
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
          <h2>{vtText(item.title, 'Item')}</h2>

          {vtText(item.price) && (
            <p className="admin-ic-line">{vtText(item.price)}</p>
          )}

          {!item.id && (
            <p className="vt-muted-note">
              Item id could not be detected. Preview only.
            </p>
          )}

          {vtText(message) && (
            <p className="vt-muted-note">{vtText(message)}</p>
          )}

          {canManage && (
            <label>
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
              <button type="button" onClick={savePrice}>
                Save price
              </button>
            )}

            {canInterest && (
              <button type="button" onClick={addInterest}>
                Interested
              </button>
            )}

            {canInterest && (
              <button type="button" className="ghost" onClick={removeInterest}>
                Remove interest
              </button>
            )}

            {canManage && (
              <button type="button" className="vt-danger-button" onClick={removeItem}>
                Remove item/listing
              </button>
            )}

            {canManage && (
              <button type="button" onClick={loadInterestedUsers}>
                Show interested users
              </button>
            )}

            {canManage && (
              <button type="button" onClick={instantTrade}>
                Instant trade / mark pending
              </button>
            )}

            <button type="button" className="ghost" onClick={() => setItem(null)}>
              Close
            </button>
          </div>

          {canManage && (
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={event => setVerifiedOnly(event.target.checked)}
                />{' '}
                Verified users only
              </span>
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
