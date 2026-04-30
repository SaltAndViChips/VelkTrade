import { useDraggable, useDroppable } from '@dnd-kit/core';

function OfferedItem({ item, onDoubleClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `offer-item-${item.id}`,
    data: {
      itemId: item.id,
      source: 'offer'
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`item-card ${isDragging ? 'is-dragging' : ''}`}
      onDoubleClick={() => onDoubleClick?.(item.id)}
      {...attributes}
      {...listeners}
    >
      <img src={item.image} alt={item.title} draggable="false" />
      <span>{item.title}</span>
      {item.price && <strong className="item-price">{item.price}</strong>}

      <div className="item-full-preview">
        <img src={item.image} alt={item.title} />
        <strong>{item.title}</strong>
        {item.price && <em>{item.price}</em>}
      </div>
    </div>
  );
}

function OfferZone({ id, title, items, icAmount, accepted, confirmed, isMine, onDoubleClickOfferItem, onRemoveIc }) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      zone: id
    }
  });

  return (
    <section className="card">
      <div className="panel-title-row">
        <h2>{title}</h2>
        <span className={`status-pill ${confirmed ? 'status-completed' : accepted ? 'status-accepted' : 'status-pending'}`}>
          {confirmed ? 'Confirmed' : accepted ? 'Accepted' : 'Editing'}
        </span>
      </div>

      <div ref={setNodeRef} className={`item-grid drop-zone trade-zone ${isOver ? 'drop-zone-active' : ''}`}>
        {!icAmount && items.length === 0 && <p className="muted">No items here.</p>}

        {icAmount && (
          <div className="item-card ic-offer-card">
            <div className="ic-token">IC</div>
            <span>{icAmount}</span>
            {isMine && (
              <button
                type="button"
                className="mini-danger"
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveIc?.();
                }}
              >
                Remove IC
              </button>
            )}
          </div>
        )}

        {items.map(item => (
          <OfferedItem
            key={item.id}
            item={item}
            onDoubleClick={isMine ? onDoubleClickOfferItem : undefined}
          />
        ))}
      </div>
    </section>
  );
}

export default function TradeBoard({
  myOfferItems,
  theirOfferItems,
  myIcOffer = '',
  theirIcOffer = '',
  myAccepted,
  theirAccepted,
  myConfirmed,
  theirConfirmed,
  canAccept,
  canConfirm,
  onAccept,
  onConfirm,
  onDoubleClickOfferItem,
  onOfferIc,
  onRemoveIc
}) {
  return (
    <section className="trade-board">
      <div className="trade-actions card">
        <div>
          <h2>Trade</h2>
          <p className="muted">Drag items into your offer, double-click to remove them, or add IC.</p>
        </div>

        <div className="inline-controls">
          <button type="button" onClick={onOfferIc}>Offer IC</button>
          <button onClick={onAccept} disabled={!canAccept || myAccepted}>Accept</button>
          <button onClick={onConfirm} disabled={!canConfirm || myConfirmed}>Confirm</button>
        </div>
      </div>

      <section className="grid two">
        <OfferZone
          id="my-offer-drop"
          title="Your Offer"
          items={myOfferItems}
          icAmount={myIcOffer}
          accepted={myAccepted}
          confirmed={myConfirmed}
          isMine
          onDoubleClickOfferItem={onDoubleClickOfferItem}
          onRemoveIc={onRemoveIc}
        />

        <OfferZone
          id="their-offer-drop"
          title="Their Offer"
          items={theirOfferItems}
          icAmount={theirIcOffer}
          accepted={theirAccepted}
          confirmed={theirConfirmed}
        />
      </section>
    </section>
  );
}
