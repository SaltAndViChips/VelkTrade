import { useEffect, useMemo, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { api } from '../api';
import InventoryToolsPanel from './InventoryToolsPanel.jsx';

function vtText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(entry => vtText(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (typeof value.title === 'string') return value.title;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    if (typeof value.message === 'string') return value.message;
    try { const json = JSON.stringify(value); return json && json !== '{}' ? json : fallback; } catch { return fallback; }
  }
  return fallback;
}

function parseBulkUrls(value) { return Array.from(new Set(String(value || '').split(/[\s,]+/).map(part => part.trim()).filter(Boolean))); }
function addThousandsCommas(numberText) { const [whole, decimal] = String(numberText).replace(/,/g, '').split('.'); const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas; }
function formatPriceDisplay(price) { const clean = vtText(price).trim(); if (!clean) return ''; const withoutDollar = clean.replace(/^\$\s*/, '').trim(); const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim(); if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) return `${addThousandsCommas(withoutIc)} IC`; if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) return `${withoutIc} IC`; if (/\bic\b/i.test(withoutDollar)) return withoutDollar.replace(/\bic\b/i, 'IC'); return withoutDollar; }
function OnlineInventoryToggle() { return null; }
function safeCssColor(value) { const color = vtText(value).trim(); return /^#[0-9a-f]{3,8}$/i.test(color) || /^rgba?\([\d\s.,%]+\)$/i.test(color) ? color : '#00fa9a'; }

function DraggableItem({ item, onDoubleClickItem, onClickItem, selectable = false, selected = false, onToggleSelected }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const displayPrice = formatPriceDisplay(item.price);
  const visibleTitle = hovered && displayPrice ? displayPrice : title;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `inventory-item-${item.id}`, data: { itemId: item.id, source: 'inventory' } });
  function handleDoubleClick(event) { event.preventDefault(); event.stopPropagation(); onDoubleClickItem?.(item.id, item); }
  function handleClick(event) { if (!onClickItem) return; event.preventDefault(); event.stopPropagation(); onClickItem(item.id, item); }
  function handleSelection(event) { event.preventDefault(); event.stopPropagation(); onToggleSelected?.(item.id); }
  const dragProps = selectable ? {} : { ...attributes, ...listeners };
  return <div ref={setNodeRef} className={`item-card vt-unified-item-card ${isDragging ? 'is-dragging' : ''} ${selected ? 'bulk-selected' : ''} ${hovered && displayPrice ? 'vt-hover-price-title' : ''}`} data-item-id={item.id} data-id={item.id} data-title={title} data-vt-original-title={title} data-price={displayPrice} data-vt-price={displayPrice} data-owner-id={item.userId || item.userid || item.ownerId || item.owner_id || ''} data-owner-username={item.ownerUsername || item.owner_username || item.username || ''} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={handleClick} onDoubleClick={handleDoubleClick} {...dragProps}>{selectable && <button type="button" className="bulk-select-pill" onPointerDown={handleSelection} onMouseDown={handleSelection} onClick={handleSelection}>{selected ? '✓ Selected' : 'Select'}</button>}{image && <img src={image} alt={title} draggable="false" />}<span className="item-title">{visibleTitle}</span>{displayPrice && <span className="sr-only item-price">{displayPrice}</span>}</div>;
}

function ReadOnlyItem({ item, onClickItem }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title, 'Item');
  const image = vtText(item.image);
  const displayPrice = formatPriceDisplay(item.price);
  const visibleTitle = hovered && displayPrice ? displayPrice : title;
  function handleClick(event) { if (!onClickItem) return; event.preventDefault(); event.stopPropagation(); onClickItem(item.id, item); }
  return <div className={`item-card readonly vt-unified-item-card ${hovered && displayPrice ? 'vt-hover-price-title' : ''}`} data-item-id={item.id} data-id={item.id} data-title={title} data-vt-original-title={title} data-price={displayPrice} data-vt-price={displayPrice} data-owner-id={item.userId || item.userid || item.ownerId || item.owner_id || ''} data-owner-username={item.ownerUsername || item.owner_username || item.username || ''} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={handleClick}>{image && <img src={image} alt={title} />}<span className="item-title">{visibleTitle}</span>{displayPrice && <span className="sr-only item-price">{displayPrice}</span>}</div>;
}

function InventoryFolder({ folder, folderItems, open, onToggle }) {
  const icon = vtText(folder.icon, '📁');
  const color = safeCssColor(folder.color);
  return <section className={`inventory-folder-card vt-folder-card ${open ? 'open' : ''}`} data-folder-id={folder.id} data-title={folder.name} style={{ '--folder-color': color }}><button type="button" className="inventory-folder-cover" onClick={onToggle}><div className="inventory-folder-stack"><span className="inventory-folder-main-icon">{icon}</span></div><strong className="item-title">{folder.name}</strong><span className="inventory-folder-count">{folderItems.length} item{folderItems.length === 1 ? '' : 's'}</span></button></section>;
}

export default function Inventory({ title, items = [], droppableId, readOnly = false, onAddImgurItem, onDoubleClickItem, onClickItem, usernameValue, onUsernameChange, onSearch, folderUsername = '' }) {
  const [imgurUrl, setImgurUrl] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [folders, setFolders] = useState([]);
  const [openFolderId, setOpenFolderId] = useState(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const parsedBulkUrls = useMemo(() => parseBulkUrls(bulkText), [bulkText]);
  const isMyInventory = !readOnly && /my inventory|your inventory/i.test(vtText(title));
  const shouldLoadFolders = isMyInventory || Boolean(folderUsername);
  const selectionEnabled = isMyInventory && toolsOpen;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId || 'readonly', data: { zone: droppableId || 'readonly' } });

  async function loadFoldersWithItems() {
    if (!shouldLoadFolders) return;
    try {
      const path = folderUsername ? `/api/inventory/${encodeURIComponent(folderUsername)}/folders-with-items` : '/api/item-folders-with-items';
      const data = await api(path);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch { setFolders([]); }
  }

  useEffect(() => { loadFoldersWithItems(); }, [shouldLoadFolders, folderUsername, items.length, folderRefreshKey]);
  useEffect(() => { if (!selectionEnabled && selectedIds.length) setSelectedIds([]); }, [selectionEnabled]);
  useEffect(() => { function refreshFolders() { setFolderRefreshKey(value => value + 1); } window.addEventListener('velktrade:folders-changed', refreshFolders); return () => window.removeEventListener('velktrade:folders-changed', refreshFolders); }, []);

  async function submitItem(event) { event.preventDefault(); if (!imgurUrl.trim()) return; await onAddImgurItem?.(imgurUrl.trim()); setImgurUrl(''); }
  async function submitBulkItems(event) { event.preventDefault(); if (!parsedBulkUrls.length || !onAddImgurItem) return; setBulkBusy(true); setBulkStatus(''); let added = 0; const failed = []; for (const url of parsedBulkUrls) { try { await onAddImgurItem(url); added += 1; } catch (error) { failed.push(`${url} (${error.message || 'failed'})`); } } setBulkBusy(false); if (failed.length === 0) { setBulkText(''); setBulkStatus(`Added ${added} item${added === 1 ? '' : 's'}.`); } else setBulkStatus(`Added ${added}. Failed ${failed.length}: ${failed.join(', ')}`); }
  function toggleSelected(id) { setSelectedIds(current => current.includes(id) ? current.filter(existing => existing !== id) : [...current, id]); }
  function refreshAfterTools() { setFolderRefreshKey(value => value + 1); window.dispatchEvent(new CustomEvent('velktrade:inventory-tools-refresh')); }

  const folderViews = useMemo(() => folders.map(folder => ({ folder, items: items.filter(item => (folder.itemIds || []).map(Number).includes(Number(item.id))) })).filter(entry => entry.items.length > 0), [folders, items]);
  const folderItemIds = useMemo(() => new Set(folderViews.flatMap(entry => entry.items.map(item => Number(item.id)))), [folderViews]);
  const openFolderItemIds = useMemo(() => new Set((folderViews.find(entry => String(entry.folder.id) === String(openFolderId))?.items || []).map(item => Number(item.id))), [folderViews, openFolderId]);
  const visibleItems = shouldLoadFolders ? items.filter(item => !folderItemIds.has(Number(item.id)) || openFolderItemIds.has(Number(item.id))) : items;

  return <section className={`card inventory-card-section ${selectionEnabled ? 'bulk-selection-active' : ''}`}><div className="inventory-title-row"><h2>{vtText(title, 'Inventory')}</h2>{isMyInventory && <OnlineInventoryToggle />}</div>{!readOnly && onAddImgurItem && <><form className="inline-controls inventory-add-form" onSubmit={submitItem}><input value={imgurUrl} onChange={event => setImgurUrl(event.target.value)} placeholder="https://imgur.com/6hUs12E" /><button type="submit">Add Item</button><button type="button" className="ghost" onClick={() => setBulkOpen(open => !open)}>{bulkOpen ? '▼' : '▶'} Bulk Add</button></form>{bulkOpen && <form onSubmit={submitBulkItems}><textarea className="trade-message-box" value={bulkText} onChange={event => setBulkText(event.target.value)} placeholder="Paste multiple Imgur links here, separated by new lines, commas, or spaces." rows={5} /><div className="inline-controls"><button type="submit" disabled={bulkBusy || parsedBulkUrls.length === 0}>{bulkBusy ? 'Adding...' : `Add ${parsedBulkUrls.length} Item${parsedBulkUrls.length === 1 ? '' : 's'}`}</button><button type="button" className="ghost" onClick={() => setBulkText('')} disabled={bulkBusy}>Clear</button></div>{bulkStatus && <p className={bulkStatus.includes('Failed') ? 'error' : 'success'}>{bulkStatus}</p>}</form>}{isMyInventory && <InventoryToolsPanel items={items} selectedIds={selectedIds} setSelectedIds={setSelectedIds} open={toolsOpen} onOpenChange={setToolsOpen} onRefresh={refreshAfterTools} />}</>}{readOnly && onSearch && <div className="inline-controls"><input value={usernameValue || ''} onChange={event => onUsernameChange?.(event.target.value)} placeholder="Username" /><button type="button" onClick={onSearch}>View</button></div>}<div ref={setNodeRef} className={`item-grid inventory-grid vt-unified-mosaic-grid drop-zone ${isOver ? 'drop-zone-active' : ''}`}>{visibleItems.length === 0 && folderViews.length === 0 && <p className="muted">No items here.</p>}{folderViews.map(({ folder, items: folderItems }) => <InventoryFolder key={folder.id} folder={folder} folderItems={folderItems} open={String(openFolderId) === String(folder.id)} onToggle={() => setOpenFolderId(current => String(current) === String(folder.id) ? null : folder.id)} />)}{visibleItems.map(item => readOnly ? <ReadOnlyItem key={item.id || item.image || vtText(item.title)} item={item} onClickItem={onClickItem} /> : <DraggableItem key={item.id || item.image || vtText(item.title)} item={item} onDoubleClickItem={onDoubleClickItem} onClickItem={onClickItem} selectable={selectionEnabled} selected={selectedIds.includes(item.id)} onToggleSelected={toggleSelected} />)}</div></section>;
}
