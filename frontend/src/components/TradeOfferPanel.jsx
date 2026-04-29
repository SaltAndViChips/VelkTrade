import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { api } from '../api';

function DropZone({ id, title, items, onDoubleClickItem }) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <section className="card">
      <h2>{title}</h2>
      <div ref={setNodeRef} className="item-grid drop-zone trade-zone">
        {items.length === 0 && <p className="muted">No items selected.</p>}
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
    </div>
  );
}

export default function TradeOfferPanel({ currentUser, inventory, counterTrade, onClose }) {
  const [targetUsername, setTargetUsername] = useState('');
  const [targetInventory, setTargetInventory] = useState([]);
  const [offerIds, setOfferIds] = useState([]);
  const [requestIds, setRequestIds] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeDragItem, setActiveDragItem] = useState(null);

  const offerItems = useMemo(() => inventory.filter(item => offerIds.includes(item.id)), [inventory, offerIds]);
  const visibleOwnItems = useMemo(() => inventory.filter(item => !offerIds.includes(item.id)), [inventory, offerIds]);

  const requestedItems = useMemo(() => targetInventory.filter(item => requestIds.includes(item.id)), [targetInventory, requestIds]);
  const visibleTargetItems = useMemo(() => targetInventory.filter(item => !requestIds.includes(item.id)), [targetInventory, requestIds]);

  useEffect(() => {
    if (!counterTrade || !currentUser) return;

    const otherUsername = counterTrade.fromUser === currentUser.id
      ? counterTrade.toUsername
      : counterTrade.fromUsername;

    setTargetUsername(otherUsername);
    setMessage(`Counter offer for trade #${counterTrade.id}`);
  }, [counterTrade, currentUser]);

  useEffect(() => {
    if (targetUsername) loadTargetInventory();
  }, [targetUsername]);

  async function loadTargetInventory() {
    if (!targetUsername.trim()) return;

    const data = await api(`/api/inventory/${targetUsername.trim()}`);

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
            <p className="muted">Drag or double-click items into the trade. The other player does not need to be online.</p>
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
          <button onClick={loadTargetInventory} disabled={Boolean(counterTrade)}>Load Player</button>
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
          <DropZone id="offer-drop" title="Your Offer" items={offerItems} onDoubleClickItem={removeOfferItem} />
          <DropZone id="request-drop" title="Requested Items" items={requestedItems} onDoubleClickItem={removeRequestItem} />
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
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
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
