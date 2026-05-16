import { api } from './api';

const VALID_ANIMATIONS = new Set(['popout', 'fan', 'cascade', 'portal', 'bounce', 'none']);
const ANIMATION_TIMINGS = {
  popout: 'folder-anim-popout-card .50s cubic-bezier(.18,.9,.22,1.18) var(--mosaic-delay, 0ms) both',
  fan: 'folder-anim-fan-card .54s cubic-bezier(.18,.9,.22,1.18) var(--mosaic-delay, 0ms) both',
  cascade: 'folder-anim-cascade-card .46s cubic-bezier(.16,.84,.28,1) var(--mosaic-delay, 0ms) both',
  portal: 'folder-anim-portal-card .52s cubic-bezier(.19,1,.22,1) var(--mosaic-delay, 0ms) both',
  bounce: 'folder-anim-bounce-card .62s cubic-bezier(.2,1.35,.28,1) var(--mosaic-delay, 0ms) both',
  none: 'none'
};

function cleanAnimation(value) {
  const clean = String(value || 'popout').trim().toLowerCase();
  return VALID_ANIMATIONS.has(clean) ? clean : 'popout';
}

function usernameFromPath() {
  const match = window.location.pathname.match(/\/u(?:ser)?\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function showFolderLoader() {
  const root = document.querySelector('.inventory-rewrite-shell');
  if (!root || root.querySelector('.folder-loading-inline')) return;
  const loader = document.createElement('div');
  loader.className = 'folder-loading-inline';
  loader.innerHTML = '<span class="folder-loading-spinner" aria-hidden="true"></span><strong>Loading folders…</strong>';
  const grid = root.querySelector('.inventory-mosaic-grid,.inventory-grid,.item-grid');
  if (grid) root.insertBefore(loader, grid);
  else root.appendChild(loader);
}

function hideFolderLoader() {
  document.querySelectorAll('.folder-loading-inline').forEach(node => node.remove());
}

async function loadFolderAnimations() {
  const username = usernameFromPath();
  const path = username ? `/api/inventory/${encodeURIComponent(username)}/folders-with-items` : '/api/item-folders-with-items';
  showFolderLoader();
  try {
    const data = await api(path);
    const folders = Array.isArray(data?.folders) ? data.folders : [];
    return new Map(folders.map(folder => [String(folder.id), cleanAnimation(folder.animation)]));
  } catch {
    return new Map();
  } finally {
    hideFolderLoader();
  }
}

function clearAnimationClasses(element) {
  if (!element?.classList) return;
  for (const value of Array.from(element.classList)) {
    if (value.startsWith('folder-anim-')) element.classList.remove(value);
  }
}

function applyAnimationClass(element, animation) {
  const clean = cleanAnimation(animation);
  clearAnimationClasses(element);
  element.classList.add(`folder-anim-${clean}`);
  element.dataset.folderAnimation = clean;
}

function forceReplayCardAnimation(element, animation) {
  const clean = cleanAnimation(animation);
  if (!element?.style) return;

  element.style.setProperty('animation', 'none', 'important');
  element.style.setProperty('opacity', clean === 'none' ? '1' : '', clean === 'none' ? 'important' : '');
  element.style.setProperty('transform', clean === 'none' ? 'none' : '', clean === 'none' ? 'important' : '');
  element.style.setProperty('filter', clean === 'none' ? 'none' : '', clean === 'none' ? 'important' : '');

  // Force a style flush so the selected animation restarts after the original generic popout was already applied.
  void element.offsetWidth;

  if (clean === 'none') {
    element.style.setProperty('animation', 'none', 'important');
    return;
  }

  element.style.setProperty('animation', ANIMATION_TIMINGS[clean], 'important');
}

function nextCard(element) {
  let node = element?.nextElementSibling;
  while (node && !node.matches?.('.inventory-mosaic-folder,.inventory-mosaic-item,.vt-folder-card,.vt-unified-item-card')) {
    node = node.nextElementSibling;
  }
  return node;
}

function applyFolderAnimations(animationMap, replay = false) {
  const folderCards = Array.from(document.querySelectorAll('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]'));
  for (const folderCard of folderCards) {
    const folderId = String(folderCard.dataset.folderId || '');
    const animation = cleanAnimation(animationMap.get(folderId) || folderCard.dataset.folderAnimation || 'popout');
    applyAnimationClass(folderCard, animation);

    let sibling = nextCard(folderCard);
    while (sibling && !sibling.matches?.('.inventory-mosaic-folder,.vt-folder-card')) {
      if (sibling.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) {
        const previous = sibling.dataset.folderAnimation || '';
        applyAnimationClass(sibling, animation);
        sibling.dataset.sourceFolderId = folderId;
        if (replay || previous !== animation || sibling.dataset.animationReplayed !== 'true') {
          sibling.dataset.animationReplayed = 'true';
          forceReplayCardAnimation(sibling, animation);
        }
      }
      sibling = nextCard(sibling);
    }
  }
}

function scheduleApply(animationMap, replay = false) {
  window.requestAnimationFrame(() => applyFolderAnimations(animationMap, replay));
  window.setTimeout(() => applyFolderAnimations(animationMap, replay), 40);
  window.setTimeout(() => applyFolderAnimations(animationMap, false), 160);
  window.setTimeout(() => applyFolderAnimations(animationMap, false), 420);
}

let refreshTimer = null;
async function refresh(replay = false) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(async () => {
    const map = await loadFolderAnimations();
    scheduleApply(map, replay);
  }, 40);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS__) return;
  window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS__ = true;

  refresh(true);
  const observer = new MutationObserver(mutations => {
    const addedReveal = mutations.some(mutation => Array.from(mutation.addedNodes || []).some(node => node.nodeType === 1 && (node.matches?.('.folder-revealed-item,[data-from-open-folder="true"]') || node.querySelector?.('.folder-revealed-item,[data-from-open-folder="true"]'))));
    refresh(addedReveal);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', () => refresh(true));
  window.addEventListener('velktrade:inventory-tools-refresh', () => refresh(true));
  window.addEventListener('popstate', () => refresh(true));
  window.setInterval(() => refresh(false), 7000);
}

install();
