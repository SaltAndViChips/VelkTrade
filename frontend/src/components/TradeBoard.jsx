import { useDraggable, useDroppable } from '@dnd-kit/core';

function OfferItem({ item, onDoubleClick, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging
  } = useDraggable({
    id: `offer-item-${item.id}`,
    data: {
      itemId: item.id,
      source: 'offer'
    }
  });

  function handleDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    onDoubleClick?.(item.id);
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

      <button
        type="button"
        className="mini-danger"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          onRemove?.(item.id);
        }}
      >
        Remove
      </button>
    </div>
  );
}

function ReadOnlyOfferItem({ item }) {
  return (
    <div className="item-card readonly">
      <img src={item.image} alt={item.title} />
      <span>{item.title}</span>

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
      </div>
    </div>
  );
}

function OfferZone({ title, items, droppableId, readOnly, onDoubleClickOfferItem }) {
  const {
    setNodeRef,
    isOver
  } = useDroppable({
    id: droppableId,
    data: {
      zone: droppableId
    }
  });

  return (
    <div className="card">
      <h2>{title}</h2>

      <div ref={setNodeRef} className={`item-grid drop-zone trade-zone ${isOver ? 'drop-zone-active' : ''}`}>
        {items.length === 0 && <p className="muted">No items offered.</p>}

        {items.map(item => readOnly ? (
          <ReadOnlyOfferItem key={item.id} item={item} />
        ) : (
          <OfferItem
            key={item.id}
            item={item}
            onDoubleClick={onDoubleClickOfferItem}
            onRemove={onDoubleClickOfferItem}
          />
        ))}
      </div>
    </div>
  );
}

export default function TradeBoard({
  myOfferItems,
  theirOfferItems,
  myAccepted,
  theirAccepted,
  myConfirmed,
  theirConfirmed,
  canAccept,
  canConfirm,
  onAccept,
  onConfirm,
  onDoubleClickOfferItem
}) {
  return (
    <section className="trade-board">
      <div className="grid two">
        <OfferZone
          title="Your Offer"
          items={myOfferItems}
          droppableId="my-offer-drop"
          onDoubleClickOfferItem={onDoubleClickOfferItem}
        />

        <OfferZone
          title="Their Offer"
          items={theirOfferItems}
          droppableId="their-offer-drop"
          readOnly
        />
      </div>

      <div className="card trade-actions">
        <div>
          <p>You: {myAccepted ? 'Accepted' : 'Not accepted'} / {myConfirmed ? 'Confirmed' : 'Not confirmed'}</p>
          <p>Them: {theirAccepted ? 'Accepted' : 'Not accepted'} / {theirConfirmed ? 'Confirmed' : 'Not confirmed'}</p>
        </div>

        <div className="inline-controls">
          <button disabled={!canAccept || myAccepted} onClick={onAccept}>
            {myAccepted ? 'Accepted' : 'Accept Trade'}
          </button>

          <button disabled={!canConfirm || myConfirmed} onClick={onConfirm}>
            {myConfirmed ? 'Confirmed' : 'Confirm Trade'}
          </button>
        </div>
      </div>
    </section>
  );
}
