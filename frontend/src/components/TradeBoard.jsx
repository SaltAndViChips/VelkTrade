import { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function normalizeIcInput(value) {
  const raw = String(value || '').trim().replace(/^\$\s*/, '');
  if (!raw) return '';

  const withoutIc = raw.replace(/\bic\b/ig, '').trim();

  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) {
    const [whole, decimal] = withoutIc.replace(/,/g, '').split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${decimal !== undefined ? `${withCommas}.${decimal}` : withCommas} IC`;
  }

  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) {
    return `${withoutIc} IC`;
  }

  if (/\bic\b/i.test(raw)) {
    return raw.replace(/\bic\b/i, 'IC');
  }

  return `${raw} IC`;
}

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

function IcInputPanel({ currentAmount, onSubmit, onCancel }) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    setAmount(String(currentAmount || '').replace(/\s*IC$/i, ''));
  }, [currentAmount]);

  function submit(event) {
    event.preventDefault();

    const normalized = normalizeIcInput(amount);
    if (!normalized) return;

    onSubmit(normalized);
  }

  return (
    <form className="ic-input-panel" onSubmit={submit}>
      <div>
        <label htmlFor="live-ic-amount">IC Amount</label>
        <p className="muted">Enter the amount of IC to include in your offer.</p>
      </div>

      <div className="ic-input-row">
        <input
          id="live-ic-amount"
          value={amount}
          onChange={event => setAmount(event.target.value)}
          placeholder="1,000"
          autoFocus
        />
        <span className="ic-suffix">IC</span>
      </div>

      <div className="inline-controls">
        <button type="submit">Add IC</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
  const [showIcInput, setShowIcInput] = useState(false);

  function submitIc(amount) {
    onOfferIc(amount);
    setShowIcInput(false);
  }

  return (
    <section className="trade-board">
      <div className="trade-actions card">
        <div>
          <h2>Trade</h2>
          <p className="muted">Drag items into your offer, double-click to remove them, or add IC.</p>
        </div>

        <div className="inline-controls">
          <button type="button" onClick={() => setShowIcInput(open => !open)}>
            {showIcInput ? 'Close IC' : 'Offer IC'}
          </button>
          <button onClick={onAccept} disabled={!canAccept || myAccepted}>Accept</button>
          <button onClick={onConfirm} disabled={!canConfirm || myConfirmed}>Confirm</button>
        </div>
      </div>

      {showIcInput && (
        <IcInputPanel
          currentAmount={myIcOffer}
          onSubmit={submitIc}
          onCancel={() => setShowIcInput(false)}
        />
      )}

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
