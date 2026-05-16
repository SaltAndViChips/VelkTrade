import { api } from './api';

/*
  Simplified folder animation controller.
  Important: this file never moves React-owned DOM nodes. Earlier row grouping used
  appendChild/insertBefore on React children and caused flickering plus removeChild errors.
*/

const OPTIONS = [
  ['grow', 'Grow Into Place'],
  ['sweep', 'Sweep Across'],
  ['slide', 'Slide In'],
  ['fade', 'Fade In'],
  ['deal', 'Deal Out'],
  ['none', 'No Animation']
];

const VALID = new Set(OPTIONS.map(([value]) => value));
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
      applyAnimations(true);
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

function nextCard(element) {
  let node = element?.nextElementSibling;
  while (node && !node.matches?.('.inventory-mosaic-folder,.inventory-mosaic-item,.vt-folder-card,.vt-unified-item-card')) {
    node = node.nextElementSibling;
  }
  return node;
}

function applyAnimationClass(node, animation, index, forceReplay = false) {
  const next = normalizeAnimation(animation);
  clearAnimationClasses(node);
  node.classList.add(`folder-animation-${next}`);
  node.dataset.folderAnimation = next;
  node.style.setProperty('--folder-delay', `${Math.min(index * 55, 880)}ms`);

  if (forceReplay) {
    node.style.setProperty('animation', 'none', 'important');
    void node.offsetWidth;
    node.style.removeProperty('animation');
  }
}

function applyAnimations(forceReplay = false) {
  const folderCards = Array.from(document.querySelectorAll('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]'));

  for (const folderCard of folderCards) {
    const folderId = String(folderCard.dataset.folderId || '');
    const animation = normalizeAnimation(folderMap.get(folderId) || folderCard.dataset.folderAnimation || 'grow');
    clearAnimationClasses(folderCard);
    folderCard.classList.add(`folder-animation-${animation}`);
    folderCard.dataset.folderAnimation = animation;

    let index = 0;
    let node = nextCard(folderCard);
    while (node && !node.matches?.('.inventory-mosaic-folder,.vt-folder-card')) {
      if (node.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) {
        const runKey = `${folderId}:${animation}:${node.dataset.itemId || node.dataset.id || index}`;
        applyAnimationClass(node, animation, index, forceReplay || node.dataset.folderCleanRunKey !== runKey);
        node.dataset.folderCleanRunKey = runKey;
        index += 1;
      }
      node = nextCard(node);
    }
  }
}

function expandAnimationSelects() {
  document.querySelectorAll('select.folder-animation-select').forEach(select => {
    const current = normalizeAnimation(selectedAnimationOverride || select.value || 'grow');
    select.innerHTML = '';
    for (const [value, label] of OPTIONS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = current;
    select.onchange = () => {
      selectedAnimationOverride = normalizeAnimation(select.value);
      const preview = document.querySelector('.folder-animation-preview');
      if (preview) preview.dataset.animation = selectedAnimationOverride;
    };
  });
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
    applyAnimations(true);
  }
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_ANIMATIONS_CLEAN_V3__) return;
  window.__VELKTRADE_FOLDER_ANIMATIONS_CLEAN_V3__ = true;
  patchFetchForAnimationSaves();

  setTimeout(initialLoadForShells, 0);
  const observer = new MutationObserver(mutations => {
    expandAnimationSelects();
    const added = mutations.flatMap(mutation => Array.from(mutation.addedNodes || []));
    const addedInventory = added.some(node => node.nodeType === 1 && (node.matches?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card,.folder-revealed-item,[data-from-open-folder="true"]') || node.querySelector?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card,.folder-revealed-item,[data-from-open-folder="true"]')));
    if (addedInventory) {
      initialLoadForShells();
      setTimeout(() => applyAnimations(true), 30);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', async () => {
    await loadFolderMap();
    applyAnimations(true);
  });
  window.addEventListener('velktrade:inventory-tools-refresh', async () => {
    await loadFolderMap();
    applyAnimations(true);
  });
}

install();
