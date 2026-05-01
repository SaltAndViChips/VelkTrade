import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const ITEM_SELECTORS = [
  '.inventory-grid > *',
  '.inventory-items > *',
  '.items-grid > *',
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

function closestItemElement(target) {
  if (!target?.closest) return null;
  const image = target.closest('img');
  if (!image) return null;
  return target.closest(ITEM_SELECTORS);
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
    if (current.dataset && current.dataset[key] !== undefined) return current.dataset[key];
    current = current.parentElement;
  }
  return '';
}

function parseItem(element) {
  const img = element.querySelector('img');
  const src = img?.src || '';

  const title =
    getData(element, 'title') ||
    getData(element, 'itemTitle') ||
    getText(element, ['.item-title', '.title', 'h3', 'h4', 'strong']) ||
    img?.alt ||
    'Item';

  const price =
    getData(element, 'price') ||
    getData(element, 'itemPrice') ||
    getText(element, ['.price', '.item-price', '.bazaar-price']) ||
    '';

  const id =
    getData(element, 'itemId') ||
    getData(element, 'id') ||
    element.id?.match(/\d+/)?.[0] ||
    '';

  const ownerId =
    getData(element, 'ownerId') ||
    getData(element, 'userId') ||
    getData(element, 'userid') ||
    '';

  const ownerUsername =
    getData(element, 'ownerUsername') ||
    getData(element, 'username') ||
    '';

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
  return Boolean(user?.isAdmin || user?.is_admin || user?.isDeveloper || user?.is_developer || user?.role === 'admin' || user?.role === 'developer');
}

function isOwner(user, item) {
  if (!user || !item) return false;
  if (item.ownerId && user.id && String(item.ownerId) === String(user.id)) return true;
  if (item.ownerUsername && user.username && item.ownerUsername.toLowerCase() === user.username.toLowerCase()) return true;
  return false;
}

export default function UnifiedItemExperience({ currentUser }) {
  const [item, setItem] = useState(null);
  const [price, setPrice] = useState('');
  const [interestedUsers, setInterestedUsers] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function tagItems() {
      document.querySelectorAll(ITEM_SELECTORS).forEach(card => {
        card.classList.add('vt-unified-item-card');

        const priceText = getText(card, ['.price', '.item-price', '.bazaar-price']);
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
      const card = closestItemElement(event.target);
      if (!card) return;

      const parsed = parseItem(card);
      if (!parsed.src) return;

      event.preventDefault();
      event.stopPropagation();

      setItem(parsed);
      setPrice(parsed.price || '');
      setMessage('');
      setInterestedUsers([]);
    }

    document.addEventListener('click', handleClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  const canManage = useMemo(() => Boolean(item && (isOwner(currentUser, item) || isPrivileged(currentUser))), [currentUser, item]);
  const canInterest = useMemo(() => Boolean(item && !isOwner(currentUser, item)), [currentUser, item]);

  async function savePrice() {
    if (!item?.id) {
      setMessage('Could not detect item id for price update.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/price`, {
      method: 'PUT',
      body: JSON.stringify({ price })
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
    const users = Array.isArray(data.users) ? data.users : Array.isArray(data.interestedUsers) ? data.interestedUsers : [];
    setInterestedUsers(users);
  }

  async function instantTrade() {
    if (!item?.id) {
      setMessage('Could not detect item id for instant trade.');
      return;
    }

    await api(`/api/items/${encodeURIComponent(item.id)}/instant-trade`, {
      method: 'POST',
      body: JSON.stringify({ price })
    });

    setMessage('Trade created and item marked trade pending.');
  }

  if (!item) return null;

  const visibleInterested = verifiedOnly
    ? interestedUsers.filter(user => user.isVerified || user.is_verified || user.isTrusted)
    : interestedUsers;

  return (
    <div className="vt-item-popout-backdrop" onClick={() => setItem(null)}>
      <section className="vt-item-popout" onClick={event => event.stopPropagation()}>
        <div className="vt-item-popout-image-wrap">
          <img src={item.src} alt={item.title} />
        </div>

        <aside className="vt-item-popout-menu">
          <h2>{item.title}</h2>

          {item.price && <p className="admin-ic-line">{item.price}</p>}
          {!item.id && <p className="vt-muted-note">Item id could not be detected. Preview only.</p>}
          {message && <p className="vt-muted-note">{message}</p>}

          {canManage && (
            <label>
              <span>Edit price</span>
              <input value={price} onChange={event => setPrice(event.target.value)} placeholder="Example: 500000 IC" />
            </label>
          )}

          <div className="vt-item-popout-actions">
            {canManage && <button type="button" onClick={savePrice}>Save price</button>}
            {canInterest && <button type="button" onClick={addInterest}>Interested</button>}
            {canInterest && <button type="button" className="ghost" onClick={removeInterest}>Remove interest</button>}
            {canManage && <button type="button" className="vt-danger-button" onClick={removeItem}>Remove item/listing</button>}
            {canManage && <button type="button" onClick={loadInterestedUsers}>Show interested users</button>}
            {canManage && <button type="button" onClick={instantTrade}>Instant trade / mark pending</button>}
            <button type="button" className="ghost" onClick={() => setItem(null)}>Close</button>
          </div>

          {canManage && (
            <label>
              <span>
                <input type="checkbox" checked={verifiedOnly} onChange={event => setVerifiedOnly(event.target.checked)} /> Verified users only
              </span>
            </label>
          )}

          {canManage && interestedUsers.length > 0 && (
            <div className="vt-interested-list">
              {visibleInterested.length === 0 ? (
                <p className="vt-muted-note">No matching interested users.</p>
              ) : (
                visibleInterested.map(user => (
                  <p key={user.id || user.username}>
                    {user.username || user.name || `User ${user.id}`}
                    {(user.isVerified || user.is_verified || user.isTrusted) ? ' ✓' : ''}
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
