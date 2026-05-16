import { api } from './api';

/*
  Lightweight folder animation controller.
  Performance rule: do not rewrite React-owned DOM, do not rebuild selects, and do not
  scan the full inventory repeatedly while Bulk Tools is rendering.
*/

const VALID = new Set(['grow', 'sweep', 'slide', 'fade', 'deal', 'none']);
const LEGACY_MAP = new Map([
  ['popout', 'grow'], ['burst', 'grow'], ['cascade', 'grow'], ['rise', 'grow'],
  ['fan', 'deal'], ['deal', 'deal'],
  ['portal', 'fade'], ['warp', 'fade'],
  ['bounce', 'grow'], ['snap', 'grow'],
  ['drift', 'slide'], ['flipbook', 'grow'], ['flip', 'grow'],
  ['bloom', 'grow'], ['orbit', 'sweep'], ['spiral', 'sweep'],
  ['scatter', 'sweep'], ['shuffle', 'sweep'], ['zoom', 'grow'], ['none', 'none']
]);

const loadedShells = new WeakSet();
const loadingShells = new WeakSet();
let folderMap = new Map();
let selectedAnimationOverride = '';
let refreshing = false;
let applyTimer = 0;

function normalizeAnimation(value) {
  const raw = String(value || 'grow').trim().toLowerCase();
  if (VALID.has(raw)) return raw;
  return LEGACY_MAP.get(raw) || 'grow';
}

function usernameFromPath() {
  const match = window.location.pathname.match(/\/u(?:ser)?\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function shells() {
  return Array.from(document.querySelectorAll('.inventory-rewrite-shell'));
}

function gridFor(shell) {
  return shell?.querySelector?.('.inventory-mosaic-grid,.inventory-grid,.item-grid') || null;
}

function clearLoader(shell) {
  shell?.classList?.remove('folder-initial-loading');
  shell?.querySelectorAll?.('.folder-initial-loader,.folder-loading-screen,.folder-loading-inline').forEach(node => node.remove());
}

function showInitialLoader(shell) {
  if (!shell || loadedShells.has(shell) || loadingShells.has(shell)) return;
  loadingShells.add(shell);
  shell.classList.add('folder-initial-loading');

  const loader = document.createElement('button');
  loader.type = 'button';
  loader.className = 'folder-initial-loader';
  loader.dataset.clicks = '0';
  loader.innerHTML = '<span class="folder-loader-ring" aria-hidden="true"></span><strong>Loading folders…</strong><small>Click 3 times to bypass for debugging</small>';
  loader.addEventListener('click', () => {
    const clicks = Number(loader.dataset.clicks || 0) + 1;
    loader.dataset.clicks = String(clicks);
    const small = loader.querySelector('small');
    if (small) small.textContent = clicks >= 3 ? 'Bypass enabled' : `${3 - clicks} more click${3 - clicks === 1 ? '' : 's'} to bypass`;
    if (clicks >= 3) {
      loadedShells.add(shell);
      clearLoader(shell);
      scheduleApply(true);
    }
  });

  const grid = gridFor(shell);
  if (grid) shell.insertBefore(loader, grid);
  else shell.appendChild(loader);
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve({ timeout: true }), ms));
}

async function loadFolderMap() {
  const username = usernameFromPath();
  const path = username ? `/api/inventory/${encodeURIComponent(username)}/folders-with-items` : '/api/item-folders-with-items';
  const data = await Promise.race([api(path).catch(error => ({ error })), timeout(8000)]);
  if (!data?.timeout && !data?.error && Array.isArray(data?.folders)) {
    folderMap = new Map(data.folders.map(folder => [String(folder.id), normalizeAnimation(folder.animation)]));
  }
  return folderMap;
}

function clearAnimationClasses(node) {
  for (const cls of Array.from(node.classList || [])) {
    if (cls.startsWith('folder-animation-') || cls.startsWith('folder-anim-')) node.classList.remove(cls);
  }
}

function markNode(node, animation, index, forceReplay) {
  const next = normalizeAnimation(animation);
  clearAnimationClasses(node);
  node.classList.add(`folder-animation-${next}`);
  node.dataset.folderAnimation = next;
  node.style.setProperty('--folder-delay', `${Math.min(index * 55, 880)}ms`);

  if (forceReplay) {
    node.style.setProperty('animation', 'none', 'important');
    // Flush only the single card, never the whole grid.
    void node.offsetWidth;
    node.style.removeProperty('animation');
  }
}

function applyAnimations(forceReplay = false) {
  for (const grid of document.querySelectorAll('.inventory-rewrite-shell .inventory-mosaic-grid, .inventory-rewrite-shell .inventory-grid, .inventory-rewrite-shell .item-grid')) {
    let activeFolderId = '';
    let activeAnimation = 'grow';
    let index = 0;

    for (const node of Array.from(grid.children)) {
      if (node.matches?.('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]')) {
        activeFolderId = String(node.dataset.folderId || '');
        activeAnimation = normalizeAnimation(folderMap.get(activeFolderId) || node.dataset.folderAnimation || 'grow');
        clearAnimationClasses(node);
        node.classList.add(`folder-animation-${activeAnimation}`);
        node.dataset.folderAnimation = activeAnimation;
        index = 0;
        continue;
      }

      if (!activeFolderId) continue;
      if (node.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) {
        const runKey = `${activeFolderId}:${activeAnimation}:${node.dataset.itemId || node.dataset.id || index}`;
        markNode(node, activeAnimation, index, forceReplay || node.dataset.folderCleanRunKey !== runKey);
        node.dataset.folderCleanRunKey = runKey;
        index += 1;
      }
    }
  }
}

function scheduleApply(forceReplay = false) {
  window.clearTimeout(applyTimer);
  applyTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => applyAnimations(forceReplay));
  }, 80);
}

function watchAnimationSelects() {
  // Event delegation only. Do not rewrite select.innerHTML; React owns that DOM.
  document.addEventListener('change', event => {
    const select = event.target?.closest?.('select.folder-animation-select');
    if (!select) return;
    selectedAnimationOverride = normalizeAnimation(select.value);
    const preview = document.querySelector('.folder-animation-preview');
    if (preview) preview.dataset.animation = selectedAnimationOverride;
  }, true);
}

function patchFetchForAnimationSaves() {
  if (window.__VELKTRADE_FOLDER_CLEAN_FETCH_PATCH__) return;
  window.__VELKTRADE_FOLDER_CLEAN_FETCH_PATCH__ = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || 'GET').toUpperCase();
      const isFolderWrite = /\/api\/(item-folders|inventory\/folders)(\/\d+)?$/.test(url) && ['POST', 'PUT', 'PATCH'].includes(method);
      if (isFolderWrite && init?.body) {
        const selected = document.querySelector('select.folder-animation-select');
        const chosen = normalizeAnimation(selectedAnimationOverride || selected?.value || '');
        const body = JSON.parse(init.body);
        body.animation = chosen;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {}
    return originalFetch(input, init);
  };
}

async function initialLoadForShells() {
  const pending = shells().filter(shell => !loadedShells.has(shell));
  if (!pending.length || refreshing) return;
  refreshing = true;
  pending.forEach(showInitialLoader);
  try {
    await loadFolderMap();
  } finally {
    pending.forEach(shell => {
      loadedShells.add(shell);
      clearLoader(shell);
    });
    refreshing = false;
    scheduleApply(true);
  }
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_ANIMATIONS_LIGHT__) return;
  window.__VELKTRADE_FOLDER_ANIMATIONS_LIGHT__ = true;
  patchFetchForAnimationSaves();
  watchAnimationSelects();

  setTimeout(initialLoadForShells, 0);

  const observer = new MutationObserver(mutations => {
    let shouldLoad = false;
    let shouldApply = false;
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes || [])) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.inventory-rewrite-shell') || node.querySelector?.('.inventory-rewrite-shell')) shouldLoad = true;
        if (node.matches?.('.inventory-mosaic-folder,.vt-folder-card,.folder-revealed-item,[data-from-open-folder="true"]') || node.querySelector?.('.inventory-mosaic-folder,.vt-folder-card,.folder-revealed-item,[data-from-open-folder="true"]')) shouldApply = true;
      }
    }
    if (shouldLoad) initialLoadForShells();
    if (shouldApply) scheduleApply(true);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', async () => {
    await loadFolderMap();
    scheduleApply(true);
  });
  window.addEventListener('velktrade:inventory-tools-refresh', async () => {
    await loadFolderMap();
    scheduleApply(false);
  });
}

install();
