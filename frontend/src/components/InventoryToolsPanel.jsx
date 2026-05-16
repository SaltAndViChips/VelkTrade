import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { velkToast } from '../velktrade-feature-foundation.js';

export const FOLDER_ICON_PRESETS = [
  '📁', '🗂️', '📦', '🧰', '🏷️', '⭐', '✨', '🔥', '💎', '🪐', '🌌', '☄️', '🌙', '☀️',
  '⚔️', '🛡️', '🏹', '🎯', '💣', '☠️', '👑', '💰', '🪙', '⚡', '🔮', '🧪', '🧬', '🕯️',
  '✦', '◆', '◇', '★', '☢', '☣', 'Ω', 'α', 'β', 'Δ', '#', '$', 'IC', 'S', 'A', 'B', 'C'
];

const FOLDER_COLOR_PRESETS = [
  { label: 'Salt Green', value: '#00fa9a' },
  { label: 'Red', value: '#ff3030' },
  { label: 'Orange', value: '#ff8c1a' },
  { label: 'Yellow', value: '#ffe600' },
  { label: 'Green', value: '#39ff14' },
  { label: 'Blue', value: '#1e90ff' },
  { label: 'Purple', value: '#b026ff' },
  { label: 'Pink', value: '#ff4fd8' },
  { label: 'Cyan', value: '#00e5ff' },
  { label: 'White', value: '#f4f4f5' },
  { label: 'Custom hex…', value: 'custom' }
];

const FOLDER_ANIMATION_PRESETS = [
  { label: 'Grow Into Place', value: 'grow' },
  { label: 'Sweep Across', value: 'sweep' },
  { label: 'Slide In', value: 'slide' },
  { label: 'Fade In', value: 'fade' },
  { label: 'Deal Out', value: 'deal' },
  { label: 'No Animation', value: 'none' }
];

const LEGACY_ANIMATION_MAP = new Map([
  ['popout', 'grow'], ['burst', 'grow'], ['cascade', 'grow'], ['rise', 'grow'], ['bounce', 'grow'], ['snap', 'grow'], ['zoom', 'grow'], ['flip', 'grow'], ['flipbook', 'grow'],
  ['fan', 'deal'], ['deal', 'deal'],
  ['portal', 'fade'], ['warp', 'fade'],
  ['drift', 'slide'],
  ['orbit', 'sweep'], ['spiral', 'sweep'], ['scatter', 'sweep'], ['shuffle', 'sweep'],
  ['none', 'none']
]);

function cleanHex(value, fallback = '#00fa9a') {
  const clean = String(value || '').trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(clean)) return clean;
  return fallback;
}

function cleanAnimation(value) {
  const clean = String(value || 'grow').trim().toLowerCase();
  if (FOLDER_ANIMATION_PRESETS.some(entry => entry.value === clean)) return clean;
  return LEGACY_ANIMATION_MAP.get(clean) || 'grow';
}

function formatPrice(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/IC$/i.test(raw)) return raw;
  const num = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num > 0 ? `${num.toLocaleString()} IC` : raw;
}

function normalizeBulkResponse(data, fallback = 0) {
  return Number(data?.updated ?? data?.count ?? data?.affectedRows ?? data?.changed ?? data?.removed ?? data?.deleted ?? data?.assigned ?? fallback ?? 0);
}

function selectedFolderLabel(folder) {
  if (!folder) return 'No folder selected';
  const count = Number(folder.itemCount || 0);
  return `${folder.icon || '📁'} ${folder.name} · ${count} item${count === 1 ? '' : 's'}`;
}

export default function InventoryToolsPanel({ items = [], selectedIds = [], setSelectedIds, onRefresh, open: controlledOpen, onOpenChange }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = typeof controlledOpen === 'boolean' ? controlledOpen : localOpen;
  function setOpen(next) {
    const value = typeof next === 'function' ? next(open) : next;
    if (typeof onOpenChange === 'function') onOpenChange(Boolean(value));
    setLocalOpen(Boolean(value));
  }

  const [folders, setFolders] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [folderIcon, setFolderIcon] = useState('📁');
  const [folderColor, setFolderColor] = useState('#00fa9a');
  const [folderColorMode, setFolderColorMode] = useState('#00fa9a');
  const [customFolderColor, setCustomFolderColor] = useState('#00fa9a');
  const [folderAnimation, setFolderAnimation] = useState('grow');
  const [folderId, setFolderId] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [cleanup, setCleanup] = useState(null);
  const [busy, setBusy] = useState(false);

  const normalizedFolderColor = useMemo(() => cleanHex(folderColor), [folderColor]);
  const normalizedFolderAnimation = useMemo(() => cleanAnimation(folderAnimation), [folderAnimation]);
  const selectedFolder = useMemo(() => folders.find(folder => String(folder.id) === String(folderId)) || null, [folders, folderId]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function setColorFromValue(value) {
    if (value === 'custom') {
      setFolderColorMode('custom');
      setFolderColor(cleanHex(customFolderColor));
      return;
    }
    setFolderColorMode(value);
    setFolderColor(cleanHex(value));
    setCustomFolderColor(cleanHex(value));
  }

  function syncColorControls(color) {
    const clean = cleanHex(color || '#00fa9a');
    const preset = FOLDER_COLOR_PRESETS.find(entry => entry.value.toLowerCase?.() === clean.toLowerCase());
    setFolderColor(clean);
    setCustomFolderColor(clean);
    setFolderColorMode(preset ? preset.value : 'custom');
  }

  function syncFolderControls(folder) {
    if (!folder) return;
    setFolderId(String(folder.id));
    setFolderIcon(folder.icon || '📁');
    setFolderAnimation(cleanAnimation(folder.animation));
    syncColorControls(folder.color || '#00fa9a');
  }

  async function loadFolders() {
    try {
      const data = await api('/api/item-folders');
      const next = Array.isArray(data.folders) ? data.folders : [];
      setFolders(next);
      if (!folderId && next[0]?.id) syncFolderControls(next[0]);
      if (folderId && !next.some(folder => String(folder.id) === String(folderId))) {
        if (next[0]?.id) syncFolderControls(next[0]);
        else setFolderId('');
      }
    } catch (error) {
      velkToast(error.message || 'Could not load folders.', 'error');
    }
  }

  useEffect(() => { if (open) loadFolders(); }, [open]);
  useEffect(() => { if (!open && selectedIds.length) setSelectedIds([]); }, [open]);

  function broadcastFolderChange() {
    window.dispatchEvent(new CustomEvent('velktrade:folders-changed'));
    window.dispatchEvent(new CustomEvent('velktrade:inventory-bulk-updated'));
    onRefresh?.();
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const data = await api('/api/item-folders', { method: 'POST', body: JSON.stringify({ name, icon: folderIcon, color: normalizedFolderColor, animation: normalizedFolderAnimation }) });
      setFolderName('');
      await loadFolders();
      if (data.folder?.id) setFolderId(String(data.folder.id));
      velkToast('Folder created.', 'success');
      broadcastFolderChange();
    } catch (error) {
      velkToast(error.message || 'Could not create folder.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateSelectedFolderStyle() {
    if (!folderId) return;
    setBusy(true);
    try {
      await api(`/api/item-folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: JSON.stringify({ icon: folderIcon, color: normalizedFolderColor, animation: normalizedFolderAnimation }) });
      await loadFolders();
      broadcastFolderChange();
      velkToast('Folder style updated.', 'success');
    } catch (error) {
      velkToast(error.message || 'Could not update folder style.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedFolder() {
    if (!folderId || !selectedFolder) return velkToast('Choose a folder first.', 'warning');
    const count = Number(selectedFolder.itemCount || 0);
    const ok = window.confirm(`Delete folder "${selectedFolder.name}"?\n\nThis only deletes the folder and removes ${count} folder assignment${count === 1 ? '' : 's'}. Your items will stay in your inventory.`);
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/item-folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
      velkToast('Folder deleted. Items were kept in inventory.', 'success');
      setFolderId('');
      setSelectedIds([]);
      await loadFolders();
      broadcastFolderChange();
    } catch (error) {
      velkToast(error.message || 'Could not delete folder.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function scanCleanup() {
    setBusy(true);
    try {
      const data = await api('/api/inventory/cleanup-scan');
      setCleanup(data);
      velkToast('Cleanup scan complete.', 'success');
    } catch (error) {
      velkToast(error.message || 'Cleanup scan failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bulkUpdate(payload, message) {
    if (!selectedIds.length) return velkToast('Select at least one item first.', 'warning');
    const ids = Array.from(new Set(selectedIds.map(Number).filter(Number.isInteger).filter(id => id > 0)));
    if (!ids.length) return velkToast('Selected items did not contain valid item ids.', 'error');
    setBusy(true);
    try {
      const data = await api('/api/inventory/bulk-update', { method: 'POST', body: JSON.stringify({ itemIds: ids, ids, ...payload }) });
      const updated = normalizeBulkResponse(data, ids.length);
      if (updated === 0 && data?.ok !== true) throw new Error('Bulk update returned no changed items.');
      velkToast(updated > 0 ? `${message} (${updated} item${updated === 1 ? '' : 's'})` : message, 'success');
      broadcastFolderChange();
    } catch (error) {
      velkToast(error.message || 'Bulk update failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function assignFolder() {
    if (!selectedIds.length) return velkToast('Select at least one item first.', 'warning');
    if (!folderId) return velkToast('Create or choose a folder first.', 'warning');
    setBusy(true);
    try {
      const data = await api('/api/inventory/bulk-folder', { method: 'POST', body: JSON.stringify({ itemIds: selectedIds, folderId }) });
      const count = normalizeBulkResponse(data, selectedIds.length);
      velkToast(`Selected items added to folder${count ? ` (${count})` : ''}.`, 'success');
      setSelectedIds([]);
      await loadFolders();
      broadcastFolderChange();
    } catch (error) {
      velkToast(error.message || 'Folder assignment failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedFromFolder() {
    if (!selectedIds.length) return velkToast('Select at least one item first.', 'warning');
    if (!folderId) return velkToast('Choose the folder to remove selected items from.', 'warning');
    setBusy(true);
    try {
      const data = await api('/api/inventory/bulk-folder-remove', { method: 'POST', body: JSON.stringify({ itemIds: selectedIds, folderId }) });
      const removed = normalizeBulkResponse(data, selectedIds.length);
      velkToast(`Selected items removed from folder${removed ? ` (${removed})` : ''}.`, 'success');
      setSelectedIds([]);
      await loadFolders();
      broadcastFolderChange();
    } catch (error) {
      velkToast(error.message || 'Could not remove items from folder.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`inventory-tools-panel folder-tools-modern ${open ? 'bulk-tools-open' : 'bulk-tools-closed'}`}>
      <div className="panel-title-row compact folder-tools-head">
        <div>
          <h3>Inventory Tools</h3>
          <p className="muted">Modern folder management, cleanup scans, and bulk editing.</p>
        </div>
        <button type="button" className="ghost" onClick={() => setOpen(value => !value)}>{open ? 'Hide Tools' : 'Show Tools'}</button>
      </div>

      {open && <>
        <div className="folder-tools-toolbar">
          <button type="button" disabled={busy} onClick={() => setSelectedIds(items.map(item => item.id).filter(Boolean))}>Select All Items</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setSelectedIds([])}>Clear Selection</button>
          <span className="folder-tools-count">{selectedIds.length} selected</span>
          <button type="button" className="ghost" disabled={busy} onClick={scanCleanup}>Run Cleanup Scan</button>
        </div>

        <div className="folder-tools-layout">
          <aside className="folder-tool-card folder-list-card">
            <div className="folder-tool-card-title">
              <strong>Folders</strong>
              <span>{folders.length} total</span>
            </div>
            <div className="folder-modern-list">
              {folders.length === 0 && <p className="muted">No folders yet. Create one below.</p>}
              {folders.map(folder => {
                const selected = String(folder.id) === String(folderId);
                const color = cleanHex(folder.color || '#00fa9a');
                const animationLabel = FOLDER_ANIMATION_PRESETS.find(entry => entry.value === cleanAnimation(folder.animation))?.label || 'Grow Into Place';
                return <button type="button" key={folder.id} className={`folder-modern-row ${selected ? 'active' : ''}`} style={{ '--folder-color': color }} onClick={() => syncFolderControls(folder)}>
                  <span className="folder-modern-icon">{folder.icon || '📁'}</span>
                  <span className="folder-modern-main"><strong>{folder.name}</strong><small>{folder.itemCount || 0} item{Number(folder.itemCount || 0) === 1 ? '' : 's'} · {animationLabel}</small></span>
                  <span className="folder-modern-swatch" />
                </button>;
              })}
            </div>
          </aside>

          <div className="folder-tool-card folder-editor-card">
            <div className="folder-tool-card-title">
              <strong>Create / Style Folder</strong>
              <span>{selectedFolderLabel(selectedFolder)}</span>
            </div>
            <div className="folder-editor-grid folder-editor-grid-animations">
              <label><span>Icon</span><select className="folder-icon-select" value={folderIcon} disabled={busy} onChange={event => setFolderIcon(event.target.value)}>{FOLDER_ICON_PRESETS.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label>
              <label><span>Color</span><select className="folder-color-select" value={folderColorMode} disabled={busy} onChange={event => setColorFromValue(event.target.value)}>{FOLDER_COLOR_PRESETS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
              <label><span>Open animation</span><select className="folder-animation-select" value={folderAnimation} disabled={busy} onChange={event => setFolderAnimation(event.target.value)}>{FOLDER_ANIMATION_PRESETS.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
              {folderColorMode === 'custom' && <label><span>Hex</span><input className="folder-hex-input" value={customFolderColor} disabled={busy} onChange={event => { setCustomFolderColor(event.target.value); setFolderColor(cleanHex(event.target.value)); }} placeholder="#00fa9a" maxLength={7} /></label>}
              <span className="folder-color-preview modern" style={{ backgroundColor: normalizedFolderColor }} />
              <label className="folder-name-field"><span>New folder name</span><input value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Example: Planetaries" /></label>
            </div>
            <div className="folder-animation-preview" data-animation={normalizedFolderAnimation} style={{ '--folder-color': normalizedFolderColor }}>
              <span className="preview-folder-icon">{folderIcon}</span>
              <span className="preview-card one" />
              <span className="preview-card two" />
              <span className="preview-card three" />
            </div>
            <div className="folder-action-row">
              <button type="button" disabled={busy || !folderName.trim()} onClick={createFolder}>Create Folder</button>
              <button type="button" className="ghost" disabled={busy || !folderId} onClick={updateSelectedFolderStyle}>Save Style</button>
              <button type="button" className="danger" disabled={busy || !folderId} onClick={deleteSelectedFolder}>Delete Folder</button>
            </div>
          </div>

          <div className="folder-tool-card folder-assignment-card">
            <div className="folder-tool-card-title">
              <strong>Selected Item Actions</strong>
              <span>{selectedIds.length} selected</span>
            </div>
            <div className="folder-assignment-summary">
              <span>Target folder</span>
              <strong>{selectedFolderLabel(selectedFolder)}</strong>
            </div>
            <div className="folder-action-row">
              <button type="button" disabled={busy || !folderId || !selectedIds.length} onClick={assignFolder}>Add Selected To Folder</button>
              <button type="button" className="ghost warning" disabled={busy || !folderId || !selectedIds.length} onClick={removeSelectedFromFolder}>Remove Selected From Folder</button>
            </div>
            <p className="muted folder-tool-note">Tip: selecting a folder card in your inventory selects all visible items inside it. Use this panel to move or remove the selected items.</p>
          </div>

          <div className="folder-tool-card bulk-editor-card">
            <div className="folder-tool-card-title">
              <strong>Bulk Edit</strong>
              <span>Price + Bazaar visibility</span>
            </div>
            <div className="folder-editor-grid compact">
              <label className="folder-name-field"><span>Set selected price</span><input value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} placeholder="Example: 500,000 IC" /></label>
              <button type="button" disabled={busy || !selectedIds.length || !bulkPrice.trim()} onClick={() => bulkUpdate({ price: formatPrice(bulkPrice) }, 'Bulk price updated.')}>Set Price</button>
            </div>
            <div className="folder-action-row">
              <button type="button" disabled={busy || !selectedIds.length} onClick={() => bulkUpdate({ showBazaar: true, show_bazaar: true, bazaar: true }, 'Selected items shown on Bazaar.')}>Show Bazaar</button>
              <button type="button" className="ghost" disabled={busy || !selectedIds.length} onClick={() => bulkUpdate({ showBazaar: false, show_bazaar: false, bazaar: false }, 'Selected items hidden from Bazaar.')}>Hide Bazaar</button>
            </div>
          </div>
        </div>

        {cleanup && <div className="inventory-cleanup-results folder-tool-card"><strong>Cleanup Results</strong><div className="tidy-meta-grid"><span><strong>Total</strong>{cleanup.summary?.totalItems ?? 0}</span><span><strong>Duplicate Groups</strong>{cleanup.summary?.duplicateImageGroups ?? 0}</span><span><strong>Missing Titles</strong>{cleanup.summary?.missingTitles ?? 0}</span><span><strong>Missing Images</strong>{cleanup.summary?.missingImages ?? 0}</span><span><strong>Blank Prices</strong>{cleanup.summary?.blankPrices ?? 0}</span><span><strong>Bad Imgur Links</strong>{cleanup.summary?.brokenImgurLinks ?? 0}</span></div></div>}
      </>}
    </section>
  );
}
