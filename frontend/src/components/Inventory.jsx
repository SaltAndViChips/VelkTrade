import { useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function parseBulkUrls(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(/[\s,]+/)
        .map(part => part.trim())
        .filter(Boolean)
    )
  );
}

function DraggableItem({ item, onDeleteItem, onDoubleClickItem, onOfferItem, onUpdatePrice }) {
  const [editingPrice, setEditingPrice] = useState(false);
  const [price, setPrice] = useState(item.price || '');

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging
  } = useDraggable({
    id: `inventory-item-${item.id}`,
    data: {
      itemId: item.id,
      source: 'inventory'
    }
  });

  function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onDoubleClickItem?.(item.id);
  }

  async function savePrice(event) {
    event.preventDefault();
    event.stopPropagation();

    await onUpdatePrice?.(item.id, price);
    setEditingPrice(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`item-card ${isDragging ? 'is-dragging' : ''}`}
      onDoubleClick={handleDoubleClick}
      {...attributes}
      {...listeners}
    >
      <img src={item.image} alt={item.title} draggable="false" />
      <span>{item.title}</span>

      {item.price ? <strong className="item-price">{item.price}</strong> : <small className="muted">No price set</small>}

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
        {item.price && <em>{item.price}</em>}
      </div>

      {editingPrice && (
        <form className="price-edit-form" onSubmit={savePrice}>
          <input
            value={price}
            onChange={event => setPrice(event.target.value)}
            placeholder="$10 / 150k / Offer"
            maxLength={80}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          />
          <button
            type="submit"
            className="mini-action"
            onPointerDown={event => event.stopPropagation()}
          >
            Save
          </button>
        </form>
      )}

      <div className="item-card-actions">
        {onOfferItem && (
          <button
            type="button"
            className="mini-action"
            title="Add this item to your live trade offer"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onOfferItem(item.id);
            }}
          >
            Offer
          </button>
        )}

        {onUpdatePrice && (
          <button
            type="button"
            className="mini-action"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              setEditingPrice(open => !open);
            }}
          >
            Price
          </button>
        )}

        {onDeleteItem && (
          <button
            type="button"
            className="mini-danger"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onDeleteItem(item.id);
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function Inventory({
  title,
  items,
  droppableId,
  readOnly = false,
  onAddImgurItem,
  onDeleteItem,
  onDoubleClickItem,
  onOfferItem,
  onUpdatePrice,
  usernameValue,
  onUsernameChange,
  onSearch
}) {
  const [imgurUrl, setImgurUrl] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const parsedBulkUrls = useMemo(() => parseBulkUrls(bulkText), [bulkText]);

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId || 'readonly',
    data: {
      zone: droppableId || 'readonly'
    }
  });

  async function submitItem(event) {
    event.preventDefault();

    if (!imgurUrl.trim()) return;

    await onAddImgurItem(imgurUrl.trim());
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

  return (
    <section className="card">
      <h2>{title}</h2>

      {!readOnly && onAddImgurItem && (
        <>
          <form className="inline-controls" onSubmit={submitItem}>
            <input
              value={imgurUrl}
              onChange={event => setImgurUrl(event.target.value)}
              placeholder="https://imgur.com/6hUs12E"
            />
            <button type="submit">Add Item</button>
            <button type="button" className="ghost" onClick={() => setBulkOpen(open => !open)}>
              {bulkOpen ? '▼' : '▶'} Bulk Add
            </button>
          </form>

          {bulkOpen && (
            <form onSubmit={submitBulkItems}>
              <textarea
                className="trade-message-box"
                value={bulkText}
                onChange={event => setBulkText(event.target.value)}
                placeholder="Paste multiple Imgur links here, separated by new lines, commas, or spaces."
                rows={5}
              />

              <div className="inline-controls">
                <button type="submit" disabled={bulkBusy || parsedBulkUrls.length === 0}>
                  {bulkBusy ? 'Adding...' : `Add ${parsedBulkUrls.length} Item${parsedBulkUrls.length === 1 ? '' : 's'}`}
                </button>
                <button type="button" className="ghost" onClick={() => setBulkText('')} disabled={bulkBusy}>
                  Clear
                </button>
              </div>

              {bulkStatus && <p className={bulkStatus.includes('Failed') ? 'error' : 'success'}>{bulkStatus}</p>}
            </form>
          )}
        </>
      )}

      {readOnly && (
        <div className="inline-controls">
          <input
            value={usernameValue}
            onChange={event => onUsernameChange(event.target.value)}
            placeholder="Username"
          />
          <button type="button" onClick={onSearch}>View</button>
        </div>
      )}

      <div ref={setNodeRef} className={`item-grid drop-zone ${isOver ? 'drop-zone-active' : ''}`}>
        {items.length === 0 && <p className="muted">No items here.</p>}

        {items.map(item => readOnly ? (
          <div key={item.id} className="item-card readonly">
            <img src={item.image} alt={item.title} />
            <span>{item.title}</span>
            {item.price ? <strong className="item-price">{item.price}</strong> : <small className="muted">No price set</small>}

            <div className="item-full-preview">
              <img src={item.image} alt={item.title} />
              <strong>{item.title}</strong>
              {item.price && <em>{item.price}</em>}
            </div>
          </div>
        ) : (
          <DraggableItem
            key={item.id}
            item={item}
            onDeleteItem={onDeleteItem}
            onDoubleClickItem={onDoubleClickItem}
            onOfferItem={onOfferItem}
            onUpdatePrice={onUpdatePrice}
          />
        ))}
      </div>
    </section>
  );
}
