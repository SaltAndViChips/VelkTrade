import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function DraggableItem({ item }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined
  };

  return (
    <div ref={setNodeRef} className="item-card" style={style} {...listeners} {...attributes}>
      <img src={item.image} alt={item.title} />
      <span>{item.title}</span>
    </div>
  );
}

export default function Inventory({
  title,
  items,
  droppableId,
  readOnly = false,
  onAddImgurItem,
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

      {!readOnly && (
        <form className="inline-controls" onSubmit={submitItem}>
          <input
            value={imgurUrl}
            onChange={event => setImgurUrl(event.target.value)}
            placeholder="https://i.imgur.com/4viV2RH.png"
          />
          <button>Add Item</button>
        </form>
      )}

      {readOnly && (
        <div className="inline-controls">
          <input
            value={usernameValue}
            onChange={event => onUsernameChange(event.target.value)}
            placeholder="Username"
          />
          <button onClick={onSearch}>View</button>
        </div>
      )}

      <div ref={setNodeRef} className="item-grid drop-zone">
        {items.length === 0 && <p className="muted">No items here.</p>}
        {items.map(item => (
          readOnly ? (
            <div key={item.id} className="item-card readonly">
              <img src={item.image} alt={item.title} />
              <span>{item.title}</span>
            </div>
          ) : (
            <DraggableItem key={item.id} item={item} />
          )
        ))}
      </div>
    </section>
  );
}
