import { useDraggable, useDroppable } from '@dnd-kit/core';

function OfferItem({ item }) {
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

function OfferZone({ title, items, droppableId, readOnly }) {
  const { setNodeRef } = useDroppable({ id: droppableId });

  return (
    <div className="card">
      <h2>{title}</h2>
      <div ref={setNodeRef} className="item-grid drop-zone trade-zone">
        {items.length === 0 && <p className="muted">No items offered.</p>}
        {items.map(item => (
          readOnly ? (
            <div key={item.id} className="item-card readonly">
              <img src={item.image} alt={item.title} />
              <span>{item.title}</span>
            </div>
          ) : (
            <OfferItem key={item.id} item={item} />
          )
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
  onConfirm
}) {
  return (
    <section className="trade-board">
      <div className="grid two">
        <OfferZone title="Your Offer" items={myOfferItems} droppableId="my-offer" />
        <OfferZone title="Their Offer" items={theirOfferItems} droppableId="their-offer" readOnly />
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
