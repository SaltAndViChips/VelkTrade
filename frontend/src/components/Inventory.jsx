import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function DraggableItem({ item, onDeleteItem, onDoubleClickItem, onOfferItem }) {
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

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
      </div>

      <div className="item-card-actions">
        {onOfferItem && (
          <button
            type="button"
            className="mini-action"
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
  usernameValue,
  onUsernameChange,
  onSearch
}) {
  const [imgurUrl, setImgurUrl] = useState('');

  const {
    setNodeRef,
    isOver
  } = useDroppable({
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

  return (
    <section className="card">
      <h2>{title}</h2>

      {!readOnly && onAddImgurItem && (
        <form className="inline-controls" onSubmit={submitItem}>
          <input
            value={imgurUrl}
            onChange={event => setImgurUrl(event.target.value)}
            placeholder="https://imgur.com/6hUs12E"
          />
          <button type="submit">Add Item</button>
        </form>
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

            <div className="item-full-preview">
              <img src={item.image} alt={item.title} />
              <strong>{item.title}</strong>
            </div>
          </div>
        ) : (
          <DraggableItem
            key={item.id}
            item={item}
            onDeleteItem={onDeleteItem}
            onDoubleClickItem={onDoubleClickItem}
            onOfferItem={onOfferItem}
          />
        ))}
      </div>
    </section>
  );
}
