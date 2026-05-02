import { useEffect, useState } from 'react';
import { api } from '../api';
import { velkToast } from '../velktrade-feature-foundation.js';

export const FOLDER_ICON_PRESETS = [
  '📁', '🗂️', '📦', '🧰', '🏷️', '⭐', '✨', '🔥', '💎', '🪐', '🌌', '☄️', '🌙', '☀️',
  '⚔️', '🛡️', '🏹', '🎯', '💣', '☠️', '👑', '💰', '🪙', '⚡', '🔮', '🧪', '🧬', '🕯️',
  '✦', '◆', '◇', '★', '☢', '☣', 'Ω', 'α', 'β', 'Δ', '#', '$', 'IC', 'S', 'A', 'B', 'C'
];

function formatPrice(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/IC$/i.test(raw)) return raw;
  const num = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(num) && num > 0 ? `${num.toLocaleString()} IC` : raw;
}

export default function InventoryToolsPanel({ items = [], selectedIds = [], setSelectedIds, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [folderIcon, setFolderIcon] = useState('📁');
  const [folderId, setFolderId] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [cleanup, setCleanup] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadFolders() {
    try {
      const data = await api('/api/item-folders');
      const next = Array.isArray(data.folders) ? data.folders : [];
      setFolders(next);
      if (!folderId && next[0]?.id) {
        setFolderId(String(next[0].id));
        setFolderIcon(next[0].icon || '📁');
      }
    } catch (error) {
      velkToast(error.message || 'Could not load folders.', 'error');
    }
  }

  useEffect(() => { if (open) loadFolders(); }, [open]);

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const data = await api('/api/item-folders', { method: 'POST', body: JSON.stringify({ name, icon: folderIcon }) });
      setFolderName('');
      await loadFolders();
      if (data.folder?.id) setFolderId(String(data.folder.id));
      velkToast('Folder created.', 'success');
      window.dispatchEvent(new CustomEvent('velktrade:folders-changed'));
      onRefresh?.();
    } catch (error) {
      velkToast(error.message || 'Could not create folder.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function updateSelectedFolderIcon(icon = folderIcon) {
    if (!folderId) return;
    setBusy(true);
    try {
      await api(`/api/item-folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: JSON.stringify({ icon }) });
      setFolderIcon(icon);
      await loadFolders();
      window.dispatchEvent(new CustomEvent('velktrade:folders-changed'));
      onRefresh?.();
      velkToast('Folder icon updated.', 'success');
    } catch (error) {
      velkToast(error.message || 'Could not update folder icon.', 'error');
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
    setBusy(true);
    try {
      await api('/api/inventory/bulk-update', { method: 'POST', body: JSON.stringify({ itemIds: selectedIds, ...payload }) });
      velkToast(message, 'success');
      window.dispatchEvent(new CustomEvent('velktrade:folders-changed'));
      onRefresh?.();
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
      await api('/api/inventory/bulk-folder', { method: 'POST', body: JSON.stringify({ itemIds: selectedIds, folderId }) });
      velkToast('Selected items added to folder.', 'success');
      setSelectedIds([]);
      await loadFolders();
      window.dispatchEvent(new CustomEvent('velktrade:folders-changed'));
      onRefresh?.();
    } catch (error) {
      velkToast(error.message || 'Folder assignment failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="inventory-tools-panel tidy-tab-panel">
      <div className="panel-title-row compact">
        <div>
          <h3>Inventory Tools</h3>
          <p className="muted">Folders, cleanup scan, and bulk editing.</p>
        </div>
        <button type="button" className="ghost" onClick={() => setOpen(value => !value)}>{open ? 'Hide Tools' : 'Show Tools'}</button>
      </div>
      {open && <>
        <div className="tidy-toolbar inventory-tools-toolbar">
          <button type="button" disabled={busy} onClick={() => setSelectedIds(items.map(item => item.id).filter(Boolean))}>Select All</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => setSelectedIds([])}>Clear</button>
          <span className="status-pill">{selectedIds.length} selected</span>
          <button type="button" disabled={busy} onClick={scanCleanup}>Run Cleanup Scan</button>
        </div>
        <div className="inventory-tools-grid">
          <div className="inventory-tool-card">
            <strong>Folders</strong>
            <div className="inline-controls">
              <select className="folder-icon-select" value={folderIcon} disabled={busy} onChange={event => setFolderIcon(event.target.value)} aria-label="Folder icon">
                {FOLDER_ICON_PRESETS.map(icon => <option key={icon} value={icon}>{icon}</option>)}
              </select>
              <input value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="New folder name" />
              <button type="button" disabled={busy || !folderName.trim()} onClick={createFolder}>Create</button>
            </div>
            <div className="inline-controls"><select value={folderId} onChange={event => { setFolderId(event.target.value); const next = folders.find(folder => String(folder.id) === event.target.value); if (next?.icon) setFolderIcon(next.icon); }}><option value="">Choose folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.icon || '📁'} {folder.name} ({folder.itemCount || 0})</option>)}</select><button type="button" disabled={busy || !folderId || !selectedIds.length} onClick={assignFolder}>Add Selected</button></div>
            <div className="inline-controls"><button type="button" className="ghost" disabled={busy || !folderId} onClick={() => updateSelectedFolderIcon(folderIcon)}>Apply Icon To Folder</button></div>
          </div>
          <div className="inventory-tool-card">
            <strong>Bulk Edit</strong>
            <div className="inline-controls"><input value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} placeholder="Set selected price" /><button type="button" disabled={busy || !selectedIds.length || !bulkPrice.trim()} onClick={() => bulkUpdate({ price: formatPrice(bulkPrice) }, 'Bulk price updated.')}>Set Price</button></div>
            <div className="inline-controls"><button type="button" disabled={busy || !selectedIds.length} onClick={() => bulkUpdate({ showBazaar: true }, 'Selected items shown on Bazaar.')}>Show Bazaar</button><button type="button" disabled={busy || !selectedIds.length} onClick={() => bulkUpdate({ showBazaar: false }, 'Selected items hidden from Bazaar.')}>Hide Bazaar</button></div>
          </div>
        </div>
        {cleanup && <div className="inventory-cleanup-results"><strong>Cleanup Results</strong><div className="tidy-meta-grid"><span><strong>Total</strong>{cleanup.summary?.totalItems ?? 0}</span><span><strong>Duplicate Groups</strong>{cleanup.summary?.duplicateImageGroups ?? 0}</span><span><strong>Missing Titles</strong>{cleanup.summary?.missingTitles ?? 0}</span><span><strong>Missing Images</strong>{cleanup.summary?.missingImages ?? 0}</span><span><strong>Blank Prices</strong>{cleanup.summary?.blankPrices ?? 0}</span><span><strong>Bad Imgur Links</strong>{cleanup.summary?.brokenImgurLinks ?? 0}</span></div></div>}
      </>}
    </section>
  );
}
