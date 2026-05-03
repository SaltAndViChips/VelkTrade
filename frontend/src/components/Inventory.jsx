import { useEffect, useMemo, useState } from 'react';
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
    try {
      const json = JSON.stringify(value);
      return json && json !== '{}' ? json : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseBulkUrls(value) {
  return Array.from(new Set(String(value || '').split(/[\s,]+/).map(part => part.trim()).filter(Boolean)));
}

function addThousandsCommas(numberText) {
  const [whole, decimal] = String(numberText).replace(/,/g, '').split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
}

function formatPriceDisplay(price) {
  const clean = vtText(price).trim();
  if (!clean) return '';
  const withoutDollar = clean.replace(/^\$\s*/, '').trim();
  const withoutIc = withoutDollar.replace(/\bic\b/ig, '').trim();
  if (/^\d+(\.\d+)?$/.test(withoutIc.replace(/,/g, ''))) return `${addThousandsCommas(withoutIc)} IC`;
  if (/^\d+(\.\d+)?\s*[kmb]$/i.test(withoutIc)) return `${withoutIc} IC`;
  if (/\bic\b/i.test(withoutDollar)) return withoutDollar.replace(/\bic\b/i, 'IC');
  return withoutDollar;
}

function safeCssColor(value) {
  const color = vtText(value).trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) || /^rgba?\([\d\s.,%]+\)$/i.test(color) ? color : '#00fa9a';
}

function stableItemKey(item, prefix = 'item') {
  return `${prefix}-${item.id || item.itemId || item.image || vtText(item.title, 'untitled')}`;
}

function ItemTile({ item, readOnly = false, selectable = false, selected = false, onToggleSelected, onClickItem, onDoubleClickItem, revealTick = 0 }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title || item.name, 'Item');
  const image = vtText(item.image || item.imageUrl || item.src);
  const price = formatPriceDisplay(item.price || item.itemPrice || item.icPrice);
  const shownTitle = hovered && price ? price : title;

  function openItem(event) {
    if (selectable) return;
    if (!onClickItem) return;
    event.preventDefault();
    event.stopPropagation();
    onClickItem(item.id, item);
  }

  function doubleClick(event) {
    if (selectable) return;
    if (!onDoubleClickItem) return;
    event.preventDefault();
    event.stopPropagation();
    onDoubleClickItem(item.id, item);
  }

  function selectItem(event) {
    event.preventDefault();
    event.stopPropagation();
    onToggleSelected?.(item.id);
  }

  return (
    <article
      className={`inventory-mosaic-item item-card vt-unified-item-card ${readOnly ? 'readonly' : ''} ${selected ? 'bulk-selected' : ''} ${hovered && price ? 'vt-hover-price-title' : ''}`}
      data-item-id={item.id || ''}
      data-id={item.id || ''}
      data-title={title}
      data-vt-original-title={title}
      data-price={price}
      data-vt-price={price}
      data-vt-react-hover="true"
      data-vt-hover-swap-bound="true"
      data-owner-id={item.userId || item.userid || item.ownerId || item.owner_id || ''}
      data-owner-username={item.ownerUsername || item.owner_username || item.username || ''}
      style={{ '--mosaic-delay': `${Math.min(revealTick * 28, 420)}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={openItem}
      onDoubleClick={doubleClick}
    >
      {selectable && <button type="button" className="bulk-select-pill" onPointerDown={selectItem} onMouseDown={selectItem} onClick={selectItem}>{selected ? '✓ Selected' : 'Select'}</button>}
      <div className="inventory-mosaic-image-frame">
        {image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}
      </div>
      <span className="item-title inventory-mosaic-title">{shownTitle}</span>
    </article>
  );
}

function FolderTile({ folder, count, open, onToggle }) {
  const icon = vtText(folder.icon, '📁');
  const color = safeCssColor(folder.color);
  const name = vtText(folder.name, 'Folder');
  return (
    <article className={`inventory-folder-card vt-folder-card inventory-mosaic-folder ${open ? 'open' : ''}`} data-folder-id={folder.id} data-title={name} style={{ '--folder-color': color }}>
      <button type="button" className="inventory-folder-cover" onClick={onToggle} aria-expanded={open}>
        <div className="inventory-folder-stack"><span className="inventory-folder-main-icon">{icon}</span></div>
        <strong className="item-title inventory-mosaic-title">{name}</strong>
        <span className="inventory-folder-count">{count} item{count === 1 ? '' : 's'}</span>
      </button>
    </article>
  );
}

export default function Inventory({
  title,
  items = [],
  readOnly = false,
  onAddImgurItem,
  onDoubleClickItem,
  onClickItem,
  usernameValue,
  onUsernameChange,
  onSearch,
  folderUsername = '',
}) {
  const [imgurUrl, setImgurUrl] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [folders, setFolders] = useState([]);
  const [openFolderIds, setOpenFolderIds] = useState([]);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

  const parsedBulkUrls = useMemo(() => parseBulkUrls(bulkText), [bulkText]);
  const isMyInventory = !readOnly && /my inventory|your inventory/i.test(vtText(title));
  const shouldLoadFolders = isMyInventory || Boolean(folderUsername);
  const selectionEnabled = isMyInventory && toolsOpen;

  async function loadFoldersWithItems() {
    if (!shouldLoadFolders) return;
    try {
      const path = folderUsername ? `/api/inventory/${encodeURIComponent(folderUsername)}/folders-with-items` : '/api/item-folders-with-items';
      const data = await api(path);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch {
      setFolders([]);
    }
  }

  useEffect(() => { loadFoldersWithItems(); }, [shouldLoadFolders, folderUsername, items.length, folderRefreshKey]);
  useEffect(() => { if (!selectionEnabled && selectedIds.length) setSelectedIds([]); }, [selectionEnabled, selectedIds.length]);
  useEffect(() => {
    function refreshFolders() { setFolderRefreshKey(value => value + 1); }
    window.addEventListener('velktrade:folders-changed', refreshFolders);
    window.addEventListener('velktrade:item-removed', refreshFolders);
    return () => {
      window.removeEventListener('velktrade:folders-changed', refreshFolders);
      window.removeEventListener('velktrade:item-removed', refreshFolders);
    };
  }, []);

  async function submitItem(event) {
    event.preventDefault();
    if (!imgurUrl.trim()) return;
    await onAddImgurItem?.(imgurUrl.trim());
    setImgurUrl('');
  }

  async function submitBulkItems(event) {
    event.preventDefault();
    if (!parsedBulkUrls.length || !onAddImgurItem) return;
    setBulkBusy(true);
    setBulkStatus('');
    let added = 0;
    const failed = [];
    for (const url of parsedBulkUrls) {
      try {
        await onAddImgurItem(url);
        added += 1;
      } catch (error) {
        failed.push(`${url} (${error.message || 'failed'})`);
      }
    }
    setBulkBusy(false);
    if (failed.length === 0) {
      setBulkText('');
      setBulkStatus(`Added ${added} item${added === 1 ? '' : 's'}.`);
    } else {
      setBulkStatus(`Added ${added}. Failed ${failed.length}: ${failed.join(', ')}`);
    }
  }

  function toggleSelected(id) {
    setSelectedIds(current => current.includes(id) ? current.filter(existing => existing !== id) : [...current, id]);
  }

  function refreshAfterTools() {
    setFolderRefreshKey(value => value + 1);
    window.dispatchEvent(new CustomEvent('velktrade:inventory-tools-refresh'));
  }

  function toggleFolder(folderId) {
    setOpenFolderIds(current => current.includes(folderId) ? current.filter(id => id !== folderId) : [...current, folderId]);
  }

  const folderViews = useMemo(() => folders.map(folder => {
    const ids = new Set((folder.itemIds || []).map(Number));
    return { folder, items: items.filter(item => ids.has(Number(item.id))) };
  }).filter(entry => entry.items.length > 0), [folders, items]);

  const folderItemIds = useMemo(() => new Set(folderViews.flatMap(entry => entry.items.map(item => Number(item.id)))), [folderViews]);
  const openFolderItemIds = useMemo(() => {
    const open = new Set(openFolderIds.map(String));
    return new Set(folderViews.filter(entry => open.has(String(entry.folder.id))).flatMap(entry => entry.items.map(item => Number(item.id))));
  }, [folderViews, openFolderIds]);

  const flatItems = shouldLoadFolders ? items.filter(item => !folderItemIds.has(Number(item.id)) || openFolderItemIds.has(Number(item.id))) : items;

  const mosaicEntries = useMemo(() => {
    const entries = [];
    for (const entry of folderViews) {
      const folderId = entry.folder.id;
      const open = openFolderIds.map(String).includes(String(folderId));
      entries.push({ type: 'folder', key: `folder-${folderId}`, folder: entry.folder, count: entry.items.length, open });
    }
    for (const item of flatItems) {
      const fromOpenFolder = openFolderItemIds.has(Number(item.id));
      entries.push({ type: 'item', key: stableItemKey(item, fromOpenFolder ? 'folder-item' : 'item'), item, fromOpenFolder });
    }
    return entries;
  }, [folderViews, flatItems, openFolderIds, openFolderItemIds]);

  return (
    <section className={`card inventory-card-section inventory-rewrite-shell ${selectionEnabled ? 'bulk-selection-active' : ''}`}>
      <div className="inventory-title-row"><h2>{vtText(title, 'Inventory')}</h2></div>

      {!readOnly && onAddImgurItem && <>
        <form className="inline-controls inventory-add-form" onSubmit={submitItem}>
          <input value={imgurUrl} onChange={event => setImgurUrl(event.target.value)} placeholder="https://imgur.com/6hUs12E" />
          <button type="submit">Add Item</button>
          <button type="button" className="ghost" onClick={() => setBulkOpen(open => !open)}>{bulkOpen ? '▼' : '▶'} Bulk Add</button>
        </form>
        {bulkOpen && <form onSubmit={submitBulkItems}>
          <textarea className="trade-message-box" value={bulkText} onChange={event => setBulkText(event.target.value)} placeholder="Paste multiple Imgur links here, separated by new lines, commas, or spaces." rows={5} />
          <div className="inline-controls">
            <button type="submit" disabled={bulkBusy || parsedBulkUrls.length === 0}>{bulkBusy ? 'Adding...' : `Add ${parsedBulkUrls.length} Item${parsedBulkUrls.length === 1 ? '' : 's'}`}</button>
            <button type="button" className="ghost" onClick={() => setBulkText('')} disabled={bulkBusy}>Clear</button>
          </div>
          {bulkStatus && <p className={bulkStatus.includes('Failed') ? 'error' : 'success'}>{bulkStatus}</p>}
        </form>}
        {isMyInventory && <InventoryToolsPanel items={items} selectedIds={selectedIds} setSelectedIds={setSelectedIds} open={toolsOpen} onOpenChange={setToolsOpen} onRefresh={refreshAfterTools} />}
      </>}

      {readOnly && onSearch && <div className="inline-controls"><input value={usernameValue || ''} onChange={event => onUsernameChange?.(event.target.value)} placeholder="Username" /><button type="button" onClick={onSearch}>View</button></div>}

      <div className="inventory-mosaic-grid item-grid inventory-grid vt-unified-mosaic-grid">
        {mosaicEntries.length === 0 && <p className="muted">No items here.</p>}
        {mosaicEntries.map((entry, index) => entry.type === 'folder' ? (
          <FolderTile key={entry.key} folder={entry.folder} count={entry.count} open={entry.open} onToggle={() => toggleFolder(entry.folder.id)} />
        ) : (
          <ItemTile
            key={entry.key}
            item={entry.item}
            readOnly={readOnly}
            selectable={selectionEnabled}
            selected={selectedIds.includes(entry.item.id)}
            onToggleSelected={toggleSelected}
            onClickItem={onClickItem}
            onDoubleClickItem={onDoubleClickItem}
            revealTick={entry.fromOpenFolder ? index : 0}
          />
        ))}
      </div>
    </section>
  );
}
