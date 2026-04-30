import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { api } from '../api';

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

function IcEditor({ label, value, onSave, onClear }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(String(value || '').replace(/\s*IC$/i, ''));
  }, [value]);

  function submit(event) {
    event.preventDefault();
    const normalized = normalizeIcInput(draft);
    if (!normalized) return;
    onSave(normalized);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="inline-controls ic-editor-closed">
        <button type="button" className="ghost" onClick={() => setOpen(true)}>
          {value ? `Edit ${label}` : `Add ${label}`}
        </button>
        {value && <button type="button" className="mini-danger" onClick={onClear}>Remove IC</button>}
      </div>
    );
  }

  return (
    <form className="ic-input-panel compact" onSubmit={submit}>
      <label>{label}</label>
      <div className="ic-input-row">
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="1,000"
          autoFocus
        />
        <span className="ic-suffix">IC</span>
      </div>

      <div className="inline-controls">
        <button type="submit">Save IC</button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function DropZone({ id, title, items, icAmount, onDoubleClickItem, onAddIc, onRemoveIc }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <section className="card">
      <div className="panel-title-row">
        <h2>{title}</h2>
      </div>

      <IcEditor
        label="IC"
        value={icAmount}
        onSave={onAddIc}
        onClear={onRemoveIc}
      />

      <div ref={setNodeRef} className="item-grid drop-zone trade-zone">
        {!icAmount && items.length === 0 && <p className="muted">No items selected.</p>}

        {icAmount && (
          <div className="item-card ic-offer-card">
            <div className="ic-token">IC</div>
            <span>{icAmount}</span>
          </div>
        )}

        {items.map(item => (
          <TradeItem key={item.id} item={item} dragPrefix="selected" onDoubleClick={() => onDoubleClickItem(item.id)} />
        ))}
      </div>
    </section>
  );
}

function TradeItem({ item, dragPrefix, onDoubleClick }) {
  const dragId = `${dragPrefix}-${item.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });

  return (
    <div
      ref={setNodeRef}
      className={`item-card ${isDragging ? 'is-dragging' : ''}`}
      {...listeners}
      {...attributes}
      onDoubleClick={onDoubleClick}
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

function InventoryDrop({ id, children }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="item-grid drop-zone trade-zone">
      {children}
      {!children?.length && <p className="muted">No items.</p>}
    </div>
  );
}

function extractIcFromTrade(trade, userId) {
  const metaMessage = (trade?.chatHistory || []).find(message => message.type === 'trade-meta');

  if (!metaMessage?.message) return '';

  try {
    const meta = JSON.parse(metaMessage.message);
    return meta.icOffers?.[userId] || '';
  } catch {
    return '';
  }
}

export default function TradeOfferPanel({ currentUser, inventory, counterTrade, initialTargetUsername = '', onClose }) {
  const [targetUsername, setTargetUsername] = useState(initialTargetUsername);
  const [targetInventory, setTargetInventory] = useState([]);
  const [offerIds, setOfferIds] = useState([]);
  const [requestIds, setRequestIds] = useState([]);
  const [offerIc, setOfferIc] = useState('');
  const [requestIc, setRequestIc] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeDragItem, setActiveDragItem] = useState(null);

  const offerItems = useMemo(() => inventory.filter(item => offerIds.includes(item.id)), [inventory, offerIds]);
  const visibleOwnItems = useMemo(() => inventory.filter(item => !offerIds.includes(item.id)), [inventory, offerIds]);

  const requestedItems = useMemo(() => targetInventory.filter(item => requestIds.includes(item.id)), [targetInventory, requestIds]);
  const visibleTargetItems = useMemo(() => targetInventory.filter(item => !requestIds.includes(item.id)), [targetInventory, requestIds]);

  useEffect(() => {
    if (!counterTrade || !currentUser) return;

    const currentUserIsOriginalSender = Number(counterTrade.fromUser) === Number(currentUser.id);
    const otherUsername = currentUserIsOriginalSender
      ? counterTrade.toUsername
      : counterTrade.fromUsername;

    const currentUserId = currentUser.id;
    const otherUserId = currentUserIsOriginalSender ? counterTrade.toUser : counterTrade.fromUser;

    setTargetUsername(otherUsername);
    setMessage(`Counter offer for trade #${counterTrade.id}`);

    if (currentUserIsOriginalSender) {
      setOfferIds(counterTrade.fromItems || []);
      setRequestIds(counterTrade.toItems || []);
      setTargetInventory(counterTrade.toItemDetails || []);
    } else {
      setOfferIds(counterTrade.toItems || []);
      setRequestIds(counterTrade.fromItems || []);
      setTargetInventory(counterTrade.fromItemDetails || []);
    }

    setOfferIc(extractIcFromTrade(counterTrade, currentUserId));
    setRequestIc(extractIcFromTrade(counterTrade, otherUserId));
  }, [counterTrade, currentUser]);

  useEffect(() => {
    if (initialTargetUsername && !counterTrade) {
      setTargetUsername(initialTargetUsername);
    }
  }, [initialTargetUsername, counterTrade]);

  useEffect(() => {
    if (targetUsername && !counterTrade) loadTargetInventory(targetUsername);
  }, [targetUsername]);

  async function loadTargetInventory(username = targetUsername) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) return;

    const data = await api(`/api/inventory/${encodeURIComponent(cleanUsername)}`);

    if (!data.user) {
      setTargetInventory([]);
      setError('Player not found.');
      return;
    }

    setError('');
    setTargetInventory(data.items || []);
  }

  function addOfferItem(itemId) {
    if (!offerIds.includes(itemId)) setOfferIds([...offerIds, itemId]);
  }

  function removeOfferItem(itemId) {
    setOfferIds(offerIds.filter(id => id !== itemId));
  }

  function addRequestItem(itemId) {
    if (!requestIds.includes(itemId)) setRequestIds([...requestIds, itemId]);
  }

  function removeRequestItem(itemId) {
    setRequestIds(requestIds.filter(id => id !== itemId));
  }

  function handleDragStart(event) {
    const id = String(event.active.id);
    const itemId = Number(id.replace(/^(own|their|selected)-/, ''));
    setActiveDragItem(
      inventory.find(item => item.id === itemId) ||
      targetInventory.find(item => item.id === itemId) ||
      null
    );
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);
    if (!over) return;

    const activeId = String(active.id);
    const itemId = Number(activeId.replace(/^(own|their|selected)-/, ''));

    if (over.id === 'offer-drop') addOfferItem(itemId);
    if (over.id === 'request-drop') addRequestItem(itemId);
    if (over.id === 'own-inventory-drop') removeOfferItem(itemId);
    if (over.id === 'their-inventory-drop') removeRequestItem(itemId);
  }

  async function submitOffer() {
    setError('');

    if (!targetUsername.trim()) {
      setError('Target username required.');
      return;
    }

    try {
      if (counterTrade) {
        await api(`/api/trades/${counterTrade.id}/counter`, {
          method: 'POST',
          body: JSON.stringify({
            fromItems: offerIds,
            toItems: requestIds,
            fromIc: offerIc,
            toIc: requestIc,
            message
          })
        });
      } else {
        await api('/api/trades/offers', {
          method: 'POST',
          body: JSON.stringify({
            toUsername: targetUsername.trim(),
            fromItems: offerIds,
            toItems: requestIds,
            fromIc: offerIc,
            toIc: requestIc,
            message
          })
        });
      }

      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <section className="card">
        <div className="panel-title-row">
          <div>
            <h2>{counterTrade ? 'Counter Offer' : 'Offline Trade Offer'}</h2>
            <p className="muted">Drag or double-click items into the trade, or add IC.</p>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="inline-controls">
          <input
            value={targetUsername}
            onChange={e => setTargetUsername(e.target.value)}
            placeholder="Other player's username"
            disabled={Boolean(counterTrade)}
          />
          <button type="button" onClick={() => loadTargetInventory()} disabled={Boolean(counterTrade)}>Load Player</button>
        </div>

        <textarea
          className="trade-message-box"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Optional message..."
          maxLength={500}
        />

        <div className="grid two">
          <section className="card">
            <h2>Your Inventory</h2>
            <InventoryDrop id="own-inventory-drop">
              {visibleOwnItems.map(item => (
                <TradeItem key={item.id} item={item} dragPrefix="own" onDoubleClick={() => addOfferItem(item.id)} />
              ))}
            </InventoryDrop>
          </section>

          <section className="card">
            <h2>{targetUsername ? `${targetUsername}'s Inventory` : 'Other Player Inventory'}</h2>
            <InventoryDrop id="their-inventory-drop">
              {visibleTargetItems.map(item => (
                <TradeItem key={item.id} item={item} dragPrefix="their" onDoubleClick={() => addRequestItem(item.id)} />
              ))}
            </InventoryDrop>
          </section>
        </div>

        <div className="grid two">
          <DropZone
            id="offer-drop"
            title="Your Offer"
            items={offerItems}
            icAmount={offerIc}
            onDoubleClickItem={removeOfferItem}
            onAddIc={setOfferIc}
            onRemoveIc={() => setOfferIc('')}
          />
          <DropZone
            id="request-drop"
            title="Requested Items"
            items={requestedItems}
            icAmount={requestIc}
            onDoubleClickItem={removeRequestItem}
            onAddIc={setRequestIc}
            onRemoveIc={() => setRequestIc('')}
          />
        </div>

        <div className="inline-controls">
          <button onClick={submitOffer}>{counterTrade ? 'Send Counter Offer' : 'Send Trade Offer'}</button>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </section>

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="item-card drag-overlay">
            <img src={activeDragItem.image} alt={activeDragItem.title} />
            <span>{activeDragItem.title}</span>
            {activeDragItem.price && <strong className="item-price">{activeDragItem.price}</strong>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
