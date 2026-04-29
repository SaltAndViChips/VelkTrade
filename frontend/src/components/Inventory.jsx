import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function DraggableItem({ item, onDeleteItem, onDoubleClickItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      className={`item-card ${isDragging ? 'is-dragging' : ''}`}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onDoubleClickItem?.(item.id)}
    >
      <img src={item.image} alt={item.title} draggable="false" />
      <span>{item.title}</span>

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
      </div>

      {onDeleteItem && (
        <button
          type="button"
          className="mini-danger"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onDeleteItem(item.id);
          }}
        >
          Remove
        </button>
      )}
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
  usernameValue,
  onUsernameChange,
  onSearch
}) {
  const [imgurUrl, setImgurUrl] = useState('');
  const { setNodeRef } = useDroppable({ id: droppableId || 'readonly' });

  async function submitItem(event) {
    event.preventDefault();
    if (!imgurUrl) return;
    await onAddImgurItem(imgurUrl);
    setImgurUrl('');
  }

  return (
    <section className="card">
      <h2>{title}</h2>

      {!readOnly && onAddImgurItem && (
        <form className="inline-controls" onSubmit={submitItem}>
          <input value={imgurUrl} onChange={e => setImgurUrl(e.target.value)} placeholder="https://imgur.com/6hUs12E" />
          <button>Add Item</button>
        </form>
      )}

      {readOnly && (
        <div className="inline-controls">
          <input value={usernameValue} onChange={e => onUsernameChange(e.target.value)} placeholder="Username" />
          <button onClick={onSearch}>View</button>
        </div>
      )}

      <div ref={setNodeRef} className="item-grid drop-zone">
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
          <DraggableItem key={item.id} item={item} onDeleteItem={onDeleteItem} onDoubleClickItem={onDoubleClickItem} />
        ))}
      </div>
    </section>
  );
}
