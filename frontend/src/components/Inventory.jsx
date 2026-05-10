import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import InventoryToolsPanel from './InventoryToolsPanel.jsx';
import { velkToast } from '../velktrade-feature-foundation.js';

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

function stopSelectEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent?.stopImmediatePropagation?.();
  event.stopImmediatePropagation?.();
}

function sanitizeFilename(value, fallback = 'folder') {
  return vtText(value, fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80) || fallback;
}

function imageUrl(item) {
  return vtText(item.image || item.imageUrl || item.src || item.url);
}

function imageTitle(item, index = 0) {
  return sanitizeFilename(item.title || item.name || `item-${index + 1}`, `item-${index + 1}`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadImageForCanvas(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

async function downloadFolderCollage(folder, items) {
  const urls = items.map(imageUrl).filter(Boolean);
  if (!urls.length) throw new Error('This folder has no images to export.');

  const loaded = [];
  for (const src of urls) {
    try { loaded.push(await loadImageForCanvas(src)); } catch {}
  }
  if (!loaded.length) throw new Error('Could not load any folder images for the collage.');

  const tile = 300;
  const gap = 0;
  const columns = Math.ceil(Math.sqrt(loaded.length));
  const rows = Math.ceil(loaded.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * tile + Math.max(0, columns - 1) * gap;
  canvas.height = rows * tile + Math.max(0, rows - 1) * gap;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  loaded.forEach((img, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (tile + gap);
    const y = row * (tile + gap);
    const scale = Math.min(tile / img.naturalWidth, tile / img.naturalHeight);
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    ctx.drawImage(img, x + (tile - width) / 2, y + (tile - height) / 2, width, height);
  });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create collage image.');
  triggerDownload(blob, `${sanitizeFilename(folder.name, 'folder')}-collage.png`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeUint16(out, value) { out.push(value & 0xff, (value >>> 8) & 0xff); }
function writeUint32(out, value) { out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff); }
function bytesFromString(value) { return new TextEncoder().encode(value); }

function makeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = bytesFromString(file.name);
    const data = file.data;
    const crc = crc32(data);
    const localHeader = [];
    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, crc);
    writeUint32(localHeader, data.length);
    writeUint32(localHeader, data.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);
    local.push(new Uint8Array(localHeader), nameBytes, data);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, crc);
    writeUint32(centralHeader, data.length);
    writeUint32(centralHeader, data.length);
    writeUint16(centralHeader, nameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);
    central.push(new Uint8Array(centralHeader), nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, files.length);
  writeUint16(end, files.length);
  writeUint32(end, centralSize);
  writeUint32(end, offset);
  writeUint16(end, 0);
  return new Blob([...local, ...central, new Uint8Array(end)], { type: 'application/zip' });
}

function extensionFromUrl(url, contentType = '') {
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  if (/gif/i.test(contentType)) return 'gif';
  const match = String(url).split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  return 'jpg';
}

async function downloadFolderZip(folder, items) {
  const imageItems = items.map((item, index) => ({ item, index, url: imageUrl(item) })).filter(entry => entry.url);
  if (!imageItems.length) throw new Error('This folder has no images to export.');
  const files = [];
  for (const entry of imageItems) {
    try {
      const response = await fetch(entry.url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const ext = extensionFromUrl(entry.url, response.headers.get('content-type') || '');
      files.push({ name: `${String(entry.index + 1).padStart(2, '0')}-${imageTitle(entry.item, entry.index)}.${ext}`, data: new Uint8Array(buffer) });
    } catch {}
  }
  if (!files.length) throw new Error('Could not fetch any images for the zip.');
  triggerDownload(makeZip(files), `${sanitizeFilename(folder.name, 'folder')}-images.zip`);
}

function ItemTile({ item, readOnly = false, selectable = false, selected = false, onToggleSelected, onClickItem, onDoubleClickItem, revealTick = 0 }) {
  const [hovered, setHovered] = useState(false);
  const title = vtText(item.title || item.name, 'Item');
  const image = vtText(item.image || item.imageUrl || item.src);
  const price = formatPriceDisplay(item.price || item.itemPrice || item.icPrice);
  const shownTitle = hovered && price ? price : title;

  function openItem(event) {
    if (event.target?.closest?.('.bulk-select-pill')) return stopSelectEvent(event);
    if (selectable) return;
    if (!onClickItem) return;
    event.preventDefault();
    event.stopPropagation();
    onClickItem(item.id, item);
  }

  function doubleClick(event) {
    if (event.target?.closest?.('.bulk-select-pill')) return stopSelectEvent(event);
    if (selectable) return;
    if (!onDoubleClickItem) return;
    event.preventDefault();
    event.stopPropagation();
    onDoubleClickItem(item.id, item);
  }

  function selectItem(event) {
    stopSelectEvent(event);
    onToggleSelected?.(item.id);
  }

  function suppressSelectPopup(event) {
    stopSelectEvent(event);
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
      {selectable && <button type="button" className="bulk-select-pill" onPointerDown={selectItem} onPointerUp={suppressSelectPopup} onMouseDown={selectItem} onMouseUp={suppressSelectPopup} onClick={selectItem}>{selected ? '✓ Selected' : 'Select'}</button>}
      <div className="inventory-mosaic-image-frame">
        {image ? <img src={image} alt={title} draggable="false" /> : <div className="inventory-mosaic-placeholder">?</div>}
      </div>
      <span className="item-title inventory-mosaic-title">{shownTitle}</span>
    </article>
  );
}

function FolderTile({ folder, items = [], count, open, selectable = false, selected = false, onToggle, onSelectFolder }) {
  const [exportBusy, setExportBusy] = useState('');
  const icon = vtText(folder.icon, '📁');
  const color = safeCssColor(folder.color);
  const name = vtText(folder.name, 'Folder');

  function selectFolder(event) {
    stopSelectEvent(event);
    onSelectFolder?.(folder.id);
  }

  function suppressSelectPopup(event) {
    stopSelectEvent(event);
  }

  async function exportFolder(event, mode) {
    stopSelectEvent(event);
    if (exportBusy) return;
    setExportBusy(mode);
    try {
      if (mode === 'zip') await downloadFolderZip(folder, items);
      else await downloadFolderCollage(folder, items);
      velkToast(`${name} exported.`, 'success');
    } catch (error) {
      velkToast(error.message || `Could not export ${name}.`, 'error', 6500);
    } finally {
      setExportBusy('');
    }
  }

  return (
    <article className={`inventory-folder-card vt-folder-card inventory-mosaic-folder ${open ? 'open' : ''} ${selected ? 'bulk-selected' : ''}`} data-folder-id={folder.id} data-title={name} data-no-item-popup="true" style={{ '--folder-color': color }}>
      {selectable && <button type="button" className="bulk-select-pill folder-select-pill" onPointerDown={selectFolder} onPointerUp={suppressSelectPopup} onMouseDown={selectFolder} onMouseUp={suppressSelectPopup} onClick={selectFolder}>{selected ? '✓ Selected' : 'Select'}</button>}
      <button type="button" className="inventory-folder-cover" onClick={onToggle} aria-expanded={open}>
        <div className="inventory-folder-stack"><span className="inventory-folder-main-icon">{icon}</span></div>
        <strong className="item-title inventory-mosaic-title">{name}</strong>
        <span className="inventory-folder-count">{count} item{count === 1 ? '' : 's'}</span>
      </button>
      <div className="folder-export-actions" data-no-item-popup="true">
        <button type="button" onPointerDown={suppressSelectPopup} onMouseDown={suppressSelectPopup} onClick={event => exportFolder(event, 'zip')} disabled={Boolean(exportBusy) || !items.length}>{exportBusy === 'zip' ? 'Zipping…' : 'ZIP'}</button>
        <button type="button" onPointerDown={suppressSelectPopup} onMouseDown={suppressSelectPopup} onClick={event => exportFolder(event, 'collage')} disabled={Boolean(exportBusy) || !items.length}>{exportBusy === 'collage' ? 'Making…' : 'Collage'}</button>
      </div>
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
      try { await onAddImgurItem(url); added += 1; } catch (error) { failed.push(`${url} (${error.message || 'failed'})`); }
    }
    setBulkBusy(false);
    if (failed.length === 0) { setBulkText(''); setBulkStatus(`Added ${added} item${added === 1 ? '' : 's'}.`); }
    else setBulkStatus(`Added ${added}. Failed ${failed.length}: ${failed.join(', ')}`);
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

  function toggleFolderSelected(folderId) {
    const entry = folderViews.find(folderView => String(folderView.folder.id) === String(folderId));
    if (!entry) return;
    const ids = entry.items.map(item => item.id).filter(Boolean);
    if (!ids.length) return;
    setSelectedIds(current => {
      const allSelected = ids.every(id => current.includes(id));
      if (allSelected) return current.filter(id => !ids.includes(id));
      return Array.from(new Set([...current, ...ids]));
    });
  }

  function folderSelected(folderId) {
    const entry = folderViews.find(folderView => String(folderView.folder.id) === String(folderId));
    if (!entry?.items?.length) return false;
    return entry.items.map(item => item.id).filter(Boolean).every(id => selectedIds.includes(id));
  }

  const mosaicEntries = useMemo(() => {
    const entries = [];
    for (const entry of folderViews) {
      const folderId = entry.folder.id;
      const open = openFolderIds.map(String).includes(String(folderId));
      entries.push({ type: 'folder', key: `folder-${folderId}`, folder: entry.folder, items: entry.items, count: entry.items.length, open });
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
          <FolderTile key={entry.key} folder={entry.folder} items={entry.items} count={entry.count} open={entry.open} selectable={selectionEnabled} selected={folderSelected(entry.folder.id)} onToggle={() => toggleFolder(entry.folder.id)} onSelectFolder={toggleFolderSelected} />
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
