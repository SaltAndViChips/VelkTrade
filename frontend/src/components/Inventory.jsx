import { useEffect, useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { api } from '../api';
import InventoryToolsPanel from './InventoryToolsPanel.jsx';

function vtText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(entry => vtText(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    if (typeof value.message === 'string') return value.message;
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseBulkUrls(value) {
  return Array.from(new Set(String(value || '').split(/[\s,]+/).map(part => part.trim()).filter(Boolean)));
}

function addThousandsCommas(numberText) {
  const [whole, decimal] = String(numberText).replace(/,/g, '').split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
}

function formatPriceDisplay(price) {
  const clean = vtText(price).trim();
  if (!clean) return '';
  const withoutDollar = clean.replace(/^\$\s*/, '').trim();
  const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim();
  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) return `${addThousandsCommas(withoutIc)} IC`;
  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) return `${withoutIc} IC`;
  if (/\bic\b/i.test(withoutDollar)) return withoutDollar.replace(/\bic\b/i, 'IC');
  return withoutDollar;
}

async function saveOnlineVisibility(nextValue) {
  const body = JSON.stringify({ showOnline: nextValue, show_online: nextValue, online: nextValue, enabled: nextValue });
  const attempts = [
    ['/api/me/online', 'PUT'], ['/api/profile/online', 'PUT'], ['/api/users/me/online', 'PUT'], ['/api/inventory/online', 'PUT'],
    ['/api/me/online', 'PATCH'], ['/api/profile/online', 'PATCH'], ['/api/users/me/online', 'PATCH'], ['/api/inventory/online', 'PATCH'],
    ['/api/me/online', 'POST'], ['/api/profile/online', 'POST'], ['/api/users/me/online', 'POST'], ['/api/inventory/online', 'POST'],
    ['/api/me', 'PATCH'], ['/api/profile', 'PATCH']
  ];
  for (const [path, method] of attempts) {
    try {
      return await api(path, { method, body });
    } catch {
      // Keep trying compatibility routes. UI stays optimistic even on old backend deployments.
    }
  }
  return { ok: false, showOnline: nextValue, show_online: nextValue, online: nextValue, localOnly: true };
}

function OnlineInventoryToggle() {
  return null;
}

function DraggableItem({ item, onDoubleClickItem, selectable = false, selected = false, onToggleSelected }) {
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const displayPrice = formatPriceDisplay(item.price);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inventory-item-${item.id}`,
    data: { itemId: item.id, source: 'inventory' }
  });

  function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onDoubleClickItem?.(item.id);
  }

  function handleSelection(event) {
    event.preventDefault();
    event.stopPropagation();
    onToggleSelected?.(item.id);
  }

  return (
    <div
      ref={setNodeRef}
      className={`item-card vt-unified-item-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'bulk-selected' : ''}`}
      data-item-id={item.id}
      data-id={item.id}
      data-title={title}
      data-price={displayPrice}
      data-owner-id={item.userId || item.userid || item.ownerId || item.owner_id || ''}
      data-owner-username={item.ownerUsername || item.owner_username || item.username || ''}
      onDoubleClick={handleDoubleClick}
      {...attributes}
      {...listeners}
    >
      {selectable && (
        <button type="button" className="bulk-select-pill" onPointerDown={event => event.stopPropagation()} onClick={handleSelection}>
          {selected ? '✓ Selected' : 'Select'}
        </button>
      )}
      {image && <img src={image} alt={title} draggable="false" />}
      <span className="item-title">{title}</span>
      {displayPrice && <span className="sr-only item-price">{displayPrice}</span>}
    </div>
  );
}

function ReadOnlyItem({ item }) {
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const displayPrice = formatPriceDisplay(item.price);
  return (
    <div className="item-card readonly vt-unified-item-card" data-item-id={item.id} data-id={item.id} data-title={title} data-price={displayPrice} data-owner-id={item.userId || item.userid || item.ownerId || item.owner_id || ''} data-owner-username={item.ownerUsername || item.owner_username || item.username || ''}>
      {image && <img src={image} alt={title} />}
      <span className="item-title">{title}</span>
      {displayPrice && <span className="sr-only item-price">{displayPrice}</span>}
    </div>
  );
}

export default function Inventory({ title, items = [], droppableId, readOnly = false, onAddImgurItem, onDoubleClickItem, usernameValue, onUsernameChange, onSearch }) {
  const [imgurUrl, setImgurUrl] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const parsedBulkUrls = useMemo(() => parseBulkUrls(bulkText), [bulkText]);
  const isMyInventory = !readOnly && /my inventory|your inventory/i.test(vtText(title));

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId || 'readonly',
    data: { zone: droppableId || 'readonly' }
  });

  async function submitItem(event) {
    event.preventDefault();
    if (!imgurUrl.trim()) return;
    await onAddImgurItem?.(imgurUrl.trim());
    setImgurUrl('');
  }

  async function submitBulkItems(event) {
    event.preventDefault();
    if (!parsedBulkUrls.length || !onAddImgurItem) return;
    setBulkBusy(true);
    setBulkStatus('');
    let added = 0;
    const failed = [];
    for (const url of parsedBulkUrls) {
      try {
        await onAddImgurItem(url);
        added += 1;
      } catch (error) {
        failed.push(`${url} (${error.message || 'failed'})`);
      }
    }
    setBulkBusy(false);
    if (failed.length === 0) {
      setBulkText('');
      setBulkStatus(`Added ${added} item${added === 1 ? '' : 's'}.`);
    } else {
      setBulkStatus(`Added ${added}. Failed ${failed.length}: ${failed.join(', ')}`);
    }
  }

  function toggleSelected(id) {
    setSelectedIds(current => current.includes(id) ? current.filter(existing => existing !== id) : [...current, id]);
  }

  function refreshAfterTools() {
    window.dispatchEvent(new CustomEvent('velktrade:inventory-tools-refresh'));
  }

  return (
    <section className="card inventory-card-section">
      <div className="inventory-title-row">
        <h2>{vtText(title, 'Inventory')}</h2>
        {isMyInventory && <OnlineInventoryToggle />}
      </div>

      {!readOnly && onAddImgurItem && (
        <>
          <form className="inline-controls inventory-add-form" onSubmit={submitItem}>
            <input value={imgurUrl} onChange={event => setImgurUrl(event.target.value)} placeholder="https://imgur.com/6hUs12E" />
            <button type="submit">Add Item</button>
            <button type="button" className="ghost" onClick={() => setBulkOpen(open => !open)}>{bulkOpen ? '▼' : '▶'} Bulk Add</button>
          </form>

          {bulkOpen && (
            <form onSubmit={submitBulkItems}>
              <textarea className="trade-message-box" value={bulkText} onChange={event => setBulkText(event.target.value)} placeholder="Paste multiple Imgur links here, separated by new lines, commas, or spaces." rows={5} />
              <div className="inline-controls">
                <button type="submit" disabled={bulkBusy || parsedBulkUrls.length === 0}>{bulkBusy ? 'Adding...' : `Add ${parsedBulkUrls.length} Item${parsedBulkUrls.length === 1 ? '' : 's'}`}</button>
                <button type="button" className="ghost" onClick={() => setBulkText('')} disabled={bulkBusy}>Clear</button>
              </div>
              {bulkStatus && <p className={bulkStatus.includes('Failed') ? 'error' : 'success'}>{bulkStatus}</p>}
            </form>
          )}

          {isMyInventory && <InventoryToolsPanel items={items} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onRefresh={refreshAfterTools} />}
        </>
      )}

      {readOnly && onSearch && <div className="inline-controls"><input value={usernameValue || ''} onChange={event => onUsernameChange?.(event.target.value)} placeholder="Username" /><button type="button" onClick={onSearch}>View</button></div>}

      <div ref={setNodeRef} className={`item-grid inventory-grid vt-unified-mosaic-grid drop-zone ${isOver ? 'drop-zone-active' : ''}`}>
        {items.length === 0 && <p className="muted">No items here.</p>}
        {items.map(item => readOnly ? <ReadOnlyItem key={item.id || item.image || vtText(item.title)} item={item} /> : <DraggableItem key={item.id || item.image || vtText(item.title)} item={item} onDoubleClickItem={onDoubleClickItem} selectable={isMyInventory} selected={selectedIds.includes(item.id)} onToggleSelected={toggleSelected} />)}
      </div>
    </section>
  );
}
