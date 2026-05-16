import { api } from './api';

const VALID_ANIMATIONS = new Set(['popout', 'fan', 'cascade', 'portal', 'bounce', 'none']);

function cleanAnimation(value) {
  const clean = String(value || 'popout').trim().toLowerCase();
  return VALID_ANIMATIONS.has(clean) ? clean : 'popout';
}

function usernameFromPath() {
  const match = window.location.pathname.match(/\/u(?:ser)?\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

async function loadFolderAnimations() {
  const username = usernameFromPath();
  const path = username ? `/api/inventory/${encodeURIComponent(username)}/folders-with-items` : '/api/item-folders-with-items';
  try {
    const data = await api(path);
    const folders = Array.isArray(data?.folders) ? data.folders : [];
    return new Map(folders.map(folder => [String(folder.id), cleanAnimation(folder.animation)]));
  } catch {
    return new Map();
  }
}

function clearAnimationClasses(element) {
  if (!element?.classList) return;
  for (const value of Array.from(element.classList)) {
    if (value.startsWith('folder-anim-')) element.classList.remove(value);
  }
}

function applyAnimationClass(element, animation) {
  clearAnimationClasses(element);
  element.classList.add(`folder-anim-${cleanAnimation(animation)}`);
  element.dataset.folderAnimation = cleanAnimation(animation);
}

function nextCard(element) {
  let node = element?.nextElementSibling;
  while (node && !node.matches?.('.inventory-mosaic-folder,.inventory-mosaic-item,.vt-folder-card,.vt-unified-item-card')) {
    node = node.nextElementSibling;
  }
  return node;
}

function applyFolderAnimations(animationMap) {
  const folderCards = Array.from(document.querySelectorAll('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]'));
  for (const folderCard of folderCards) {
    const folderId = String(folderCard.dataset.folderId || '');
    const animation = cleanAnimation(animationMap.get(folderId) || folderCard.dataset.folderAnimation || 'popout');
    applyAnimationClass(folderCard, animation);

    let sibling = nextCard(folderCard);
    while (sibling && !sibling.matches?.('.inventory-mosaic-folder,.vt-folder-card')) {
      if (sibling.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) {
        applyAnimationClass(sibling, animation);
        sibling.dataset.sourceFolderId = folderId;
      }
      sibling = nextCard(sibling);
    }
  }
}

function scheduleApply(animationMap) {
  window.requestAnimationFrame(() => applyFolderAnimations(animationMap));
  window.setTimeout(() => applyFolderAnimations(animationMap), 120);
  window.setTimeout(() => applyFolderAnimations(animationMap), 420);
}

async function refresh() {
  const map = await loadFolderAnimations();
  scheduleApply(map);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS__) return;
  window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS__ = true;

  refresh();
  const observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', refresh);
  window.addEventListener('velktrade:inventory-tools-refresh', refresh);
  window.addEventListener('popstate', refresh);
  window.setInterval(refresh, 7000);
}

install();
