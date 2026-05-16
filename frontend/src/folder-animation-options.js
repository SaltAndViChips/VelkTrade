import { api } from './api';

const ANIMATION_OPTIONS = [
  ['popout', 'Popout'],
  ['fan', 'Fan Spread'],
  ['cascade', 'Cascade'],
  ['portal', 'Portal'],
  ['bounce', 'Bounce'],
  ['slide', 'Slide Out'],
  ['flip', 'Flip Deal'],
  ['zoom', 'Zoom Bloom'],
  ['spiral', 'Spiral'],
  ['shuffle', 'Shuffle'],
  ['none', 'No Animation']
];

const VALID_ANIMATIONS = new Set(ANIMATION_OPTIONS.map(([value]) => value));

const ANIMATION_TIMINGS = {
  popout: 'vt-folder-popout .52s cubic-bezier(.18,.9,.22,1.16) var(--mosaic-delay, 0ms) both',
  fan: 'vt-folder-fan .58s cubic-bezier(.18,.9,.22,1.16) var(--mosaic-delay, 0ms) both',
  cascade: 'vt-folder-cascade .50s cubic-bezier(.16,.84,.28,1) var(--mosaic-delay, 0ms) both',
  portal: 'vt-folder-portal .60s cubic-bezier(.19,1,.22,1) var(--mosaic-delay, 0ms) both',
  bounce: 'vt-folder-bounce .68s cubic-bezier(.2,1.35,.28,1) var(--mosaic-delay, 0ms) both',
  slide: 'vt-folder-slide .48s cubic-bezier(.18,.9,.22,1) var(--mosaic-delay, 0ms) both',
  flip: 'vt-folder-flip .62s cubic-bezier(.18,.9,.22,1.08) var(--mosaic-delay, 0ms) both',
  zoom: 'vt-folder-zoom .50s cubic-bezier(.16,.9,.22,1.12) var(--mosaic-delay, 0ms) both',
  spiral: 'vt-folder-spiral .66s cubic-bezier(.2,1,.22,1) var(--mosaic-delay, 0ms) both',
  shuffle: 'vt-folder-shuffle .62s cubic-bezier(.2,.9,.24,1.08) var(--mosaic-delay, 0ms) both',
  none: 'none'
};

let folderAnimationMap = new Map();
let folderMapLoaded = false;
let refreshTimer = null;
let debugBypass = false;

function cleanAnimation(value) {
  const clean = String(value || 'popout').trim().toLowerCase();
  return VALID_ANIMATIONS.has(clean) ? clean : 'popout';
}

function usernameFromPath() {
  const match = window.location.pathname.match(/\/u(?:ser)?\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function inventoryShells() {
  return Array.from(document.querySelectorAll('.inventory-rewrite-shell'));
}

function ensureLoader(shell) {
  if (!shell || shell.querySelector('.folder-loading-screen')) return;
  const loader = document.createElement('button');
  loader.type = 'button';
  loader.className = 'folder-loading-screen';
  loader.dataset.clicks = '0';
  loader.innerHTML = `
    <span class="folder-loading-orb" aria-hidden="true"></span>
    <strong>Loading folders…</strong>
    <small>Click 3 times to bypass for debugging</small>
  `;
  loader.addEventListener('click', () => {
    const clicks = Number(loader.dataset.clicks || 0) + 1;
    loader.dataset.clicks = String(clicks);
    loader.querySelector('small').textContent = clicks >= 3 ? 'Bypass enabled' : `${3 - clicks} more click${3 - clicks === 1 ? '' : 's'} to bypass`;
    if (clicks >= 3) {
      debugBypass = true;
      folderMapLoaded = true;
      hideFolderLoader(true);
      applyFolderAnimations(folderAnimationMap, true);
    }
  });
  const grid = shell.querySelector('.inventory-mosaic-grid,.inventory-grid,.item-grid');
  if (grid) shell.insertBefore(loader, grid);
  else shell.appendChild(loader);
}

function showFolderLoader() {
  if (debugBypass || folderMapLoaded) return;
  for (const shell of inventoryShells()) {
    shell.classList.add('folder-loading-active');
    ensureLoader(shell);
  }
}

function hideFolderLoader(force = false) {
  if (!force && !folderMapLoaded && !debugBypass) return;
  for (const shell of inventoryShells()) shell.classList.remove('folder-loading-active');
  document.querySelectorAll('.folder-loading-screen, .folder-loading-inline').forEach(node => node.remove());
}

function timeout(ms) {
  return new Promise(resolve => window.setTimeout(() => resolve({ timeout: true }), ms));
}

async function loadFolderAnimations() {
  const username = usernameFromPath();
  const path = username ? `/api/inventory/${encodeURIComponent(username)}/folders-with-items` : '/api/item-folders-with-items';
  showFolderLoader();
  try {
    const request = api(path).catch(error => ({ error }));
    const data = await Promise.race([request, timeout(8500)]);
    if (data?.timeout || data?.error) return folderAnimationMap;
    const folders = Array.isArray(data?.folders) ? data.folders : [];
    folderAnimationMap = new Map(folders.map(folder => [String(folder.id), cleanAnimation(folder.animation)]));
    return folderAnimationMap;
  } finally {
    folderMapLoaded = true;
    hideFolderLoader(true);
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
  element.style.setProperty('opacity', clean === 'none' ? '1' : '0', 'important');
  element.style.setProperty('transform', clean === 'none' ? 'none' : '', clean === 'none' ? 'important' : '');
  element.style.setProperty('filter', clean === 'none' ? 'none' : '', clean === 'none' ? 'important' : '');
  void element.offsetWidth;

  if (clean === 'none') {
    element.style.setProperty('animation', 'none', 'important');
    element.style.setProperty('opacity', '1', 'important');
    element.style.setProperty('transform', 'none', 'important');
    element.style.setProperty('filter', 'none', 'important');
    return;
  }

  element.style.removeProperty('opacity');
  element.style.removeProperty('transform');
  element.style.removeProperty('filter');
  element.style.setProperty('animation', ANIMATION_TIMINGS[clean], 'important');
}

function nextCard(element) {
  let node = element?.nextElementSibling;
  while (node && !node.matches?.('.inventory-mosaic-folder,.inventory-mosaic-item,.vt-folder-card,.vt-unified-item-card')) {
    node = node.nextElementSibling;
  }
  return node;
}

function applyFolderAnimations(animationMap = folderAnimationMap, replay = false) {
  const folderCards = Array.from(document.querySelectorAll('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]'));
  for (const folderCard of folderCards) {
    const folderId = String(folderCard.dataset.folderId || '');
    const animation = cleanAnimation(animationMap.get(folderId) || folderCard.dataset.folderAnimation || 'popout');
    applyAnimationClass(folderCard, animation);

    let sibling = nextCard(folderCard);
    let index = 0;
    while (sibling && !sibling.matches?.('.inventory-mosaic-folder,.vt-folder-card')) {
      if (sibling.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) {
        applyAnimationClass(sibling, animation);
        sibling.dataset.sourceFolderId = folderId;
        sibling.style.setProperty('--mosaic-delay', `${Math.min(index * 58, 900)}ms`);
        if (replay || sibling.dataset.animationRunKey !== `${folderId}:${animation}`) {
          sibling.dataset.animationRunKey = `${folderId}:${animation}`;
          forceReplayCardAnimation(sibling, animation);
        }
        index += 1;
      }
      sibling = nextCard(sibling);
    }
  }
}

function replayRecentlyAdded(nodes) {
  const candidates = [];
  for (const node of nodes) {
    if (node.nodeType !== 1) continue;
    if (node.matches?.('.folder-revealed-item,[data-from-open-folder="true"]')) candidates.push(node);
    node.querySelectorAll?.('.folder-revealed-item,[data-from-open-folder="true"]').forEach(child => candidates.push(child));
  }
  if (!candidates.length) return false;
  applyFolderAnimations(folderAnimationMap, true);
  return true;
}

function injectAnimationOptions() {
  document.querySelectorAll('select.folder-animation-select').forEach(select => {
    for (const [value, label] of ANIMATION_OPTIONS) {
      if (!select.querySelector(`option[value="${value}"]`)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
    }
  });
}

function scheduleApply(replay = false) {
  window.requestAnimationFrame(() => applyFolderAnimations(folderAnimationMap, replay));
  window.setTimeout(() => applyFolderAnimations(folderAnimationMap, replay), 25);
  window.setTimeout(() => applyFolderAnimations(folderAnimationMap, false), 160);
}

async function refresh(replay = false, reload = true) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(async () => {
    injectAnimationOptions();
    if (reload) await loadFolderAnimations();
    scheduleApply(replay);
  }, 35);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS_V2__) return;
  window.__VELKTRADE_FOLDER_ANIMATION_OPTIONS_V2__ = true;

  showFolderLoader();
  refresh(true, true);

  const observer = new MutationObserver(mutations => {
    injectAnimationOptions();
    const addedNodes = mutations.flatMap(mutation => Array.from(mutation.addedNodes || []));
    if (replayRecentlyAdded(addedNodes)) return;
    const addedInventory = addedNodes.some(node => node.nodeType === 1 && (node.matches?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card') || node.querySelector?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card')));
    if (addedInventory && !folderMapLoaded) showFolderLoader();
    if (addedInventory) scheduleApply(false);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', () => { folderMapLoaded = false; refresh(true, true); });
  window.addEventListener('velktrade:inventory-tools-refresh', () => { folderMapLoaded = false; refresh(true, true); });
  window.addEventListener('popstate', () => { folderMapLoaded = false; refresh(true, true); });
  window.setInterval(() => refresh(false, true), 9000);
}

install();
