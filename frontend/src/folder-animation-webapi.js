import { api } from './api';

/*
  Folder animation v3.
  Uses the Web Animations API directly instead of CSS animation shorthands, so older
  .folder-revealed-item !important rules cannot force the default popout animation.
*/

const VALID = new Set(['popout', 'fan', 'cascade', 'portal', 'bounce', 'slide', 'flip', 'zoom', 'spiral', 'shuffle', 'none']);
let folderAnimations = new Map();
let loading = false;
let loaded = false;
let bypass = false;
let refreshTimer = null;

function clean(value) {
  const next = String(value || 'popout').trim().toLowerCase();
  return VALID.has(next) ? next : 'popout';
}

function userFromPath() {
  const match = window.location.pathname.match(/\/u(?:ser)?\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function shells() {
  return Array.from(document.querySelectorAll('.inventory-rewrite-shell'));
}

function clearLoaders() {
  document.querySelectorAll('.folder-loading-screen,.folder-loading-inline').forEach(node => node.remove());
  shells().forEach(shell => shell.classList.remove('folder-loading-active'));
}

function showLoader() {
  if (bypass || loaded) return;
  for (const shell of shells()) {
    shell.classList.add('folder-loading-active');
    if (shell.querySelector('.folder-loading-screen')) continue;
    const loader = document.createElement('button');
    loader.type = 'button';
    loader.className = 'folder-loading-screen';
    loader.dataset.clicks = '0';
    loader.innerHTML = '<span class="folder-loading-orb" aria-hidden="true"></span><strong>Loading folders…</strong><small>Click 3 times to bypass for debugging</small>';
    loader.addEventListener('click', () => {
      const clicks = Number(loader.dataset.clicks || 0) + 1;
      loader.dataset.clicks = String(clicks);
      const small = loader.querySelector('small');
      if (small) small.textContent = clicks >= 3 ? 'Bypass enabled' : `${3 - clicks} more click${3 - clicks === 1 ? '' : 's'} to bypass`;
      if (clicks >= 3) {
        bypass = true;
        loaded = true;
        clearLoaders();
        applyAll(true);
      }
    });
    const grid = shell.querySelector('.inventory-mosaic-grid,.inventory-grid,.item-grid');
    if (grid) shell.insertBefore(loader, grid);
    else shell.appendChild(loader);
  }
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(() => resolve({ timeout: true }), ms));
}

async function loadMap() {
  if (loading) return folderAnimations;
  loading = true;
  loaded = false;
  showLoader();
  try {
    const username = userFromPath();
    const path = username ? `/api/inventory/${encodeURIComponent(username)}/folders-with-items` : '/api/item-folders-with-items';
    const data = await Promise.race([api(path).catch(error => ({ error })), timeout(8000)]);
    if (!data?.timeout && !data?.error && Array.isArray(data?.folders)) {
      folderAnimations = new Map(data.folders.map(folder => [String(folder.id), clean(folder.animation)]));
    }
    return folderAnimations;
  } finally {
    loading = false;
    loaded = true;
    clearLoaders();
  }
}

function nextCard(element) {
  let node = element?.nextElementSibling;
  while (node && !node.matches?.('.inventory-mosaic-folder,.inventory-mosaic-item,.vt-folder-card,.vt-unified-item-card')) node = node.nextElementSibling;
  return node;
}

function framesFor(type) {
  switch (clean(type)) {
    case 'fan': return [
      { opacity: 0, transform: 'translateX(-92px) translateY(-38px) scale(.68) rotate(-24deg)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'translateX(18px) translateY(-18px) scale(1.045) rotate(9deg)', filter: 'blur(0)', offset: .64 },
      { opacity: 1, transform: 'translateX(0) translateY(0) scale(1) rotate(0deg)', filter: 'blur(0)' }
    ];
    case 'cascade': return [
      { opacity: 0, transform: 'translateY(-82px) scale(.82)', filter: 'blur(7px)', clipPath: 'inset(0 0 100% 0 round 18px)' },
      { opacity: 1, transform: 'translateY(5px) scale(1.012)', filter: 'blur(0)', clipPath: 'inset(0 0 0 0 round 18px)', offset: .68 },
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0)', clipPath: 'inset(0 0 0 0 round 18px)' }
    ];
    case 'portal': return [
      { opacity: 0, transform: 'translateX(-50px) scale(.28) rotate(50deg)', filter: 'blur(14px) hue-rotate(60deg)' },
      { opacity: 1, transform: 'translateX(8px) translateY(-6px) scale(1.075) rotate(-5deg)', filter: 'blur(0) saturate(1.25)', offset: .55 },
      { opacity: 1, transform: 'translateX(0) translateY(0) scale(1) rotate(0deg)', filter: 'none' }
    ];
    case 'bounce': return [
      { opacity: 0, transform: 'translateY(-92px) scale(.58)', filter: 'blur(9px)' },
      { opacity: 1, transform: 'translateY(18px) scale(1.07)', filter: 'blur(0)', offset: .42 },
      { transform: 'translateY(-9px) scale(.99)', offset: .70 },
      { transform: 'translateY(4px) scale(1.006)', offset: .88 },
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'none' }
    ];
    case 'slide': return [
      { opacity: 0, transform: 'translateX(-128px) scale(.92)', filter: 'blur(6px)' },
      { opacity: 1, transform: 'translateX(16px) scale(1.018)', filter: 'blur(0)', offset: .72 },
      { opacity: 1, transform: 'translateX(0) scale(1)', filter: 'none' }
    ];
    case 'flip': return [
      { opacity: 0, transform: 'perspective(900px) rotateY(-88deg) translateX(-48px) scale(.82)', filter: 'blur(6px)' },
      { opacity: 1, transform: 'perspective(900px) rotateY(10deg) translateX(5px) scale(1.03)', filter: 'blur(0)', offset: .64 },
      { opacity: 1, transform: 'perspective(900px) rotateY(0deg) translateX(0) scale(1)', filter: 'none' }
    ];
    case 'zoom': return [
      { opacity: 0, transform: 'scale(.16)', filter: 'blur(12px)' },
      { opacity: 1, transform: 'scale(1.09)', filter: 'blur(0)', offset: .55 },
      { opacity: 1, transform: 'scale(1)', filter: 'none' }
    ];
    case 'spiral': return [
      { opacity: 0, transform: 'translateX(-72px) translateY(-54px) rotate(-190deg) scale(.30)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'translateX(10px) translateY(-6px) rotate(14deg) scale(1.055)', filter: 'blur(0)', offset: .64 },
      { opacity: 1, transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)', filter: 'none' }
    ];
    case 'shuffle': return [
      { opacity: 0, transform: 'translateX(-94px) translateY(-24px) skewX(-14deg) scale(.75)', filter: 'blur(8px)' },
      { opacity: 1, transform: 'translateX(24px) translateY(11px) skewX(8deg) scale(1.04)', filter: 'blur(0)', offset: .36 },
      { transform: 'translateX(-9px) translateY(-6px) skewX(-3deg) scale(.996)', offset: .70 },
      { opacity: 1, transform: 'translateX(0) translateY(0) skewX(0deg) scale(1)', filter: 'none' }
    ];
    case 'popout':
    default: return [
      { opacity: 0, transform: 'translateX(-92px) translateY(-46px) scale(.68) rotate(-8deg)', filter: 'blur(10px) saturate(.55)' },
      { opacity: 1, transform: 'translateX(12px) translateY(-8px) scale(1.04) rotate(2deg)', filter: 'blur(0) saturate(1.18)', offset: .58 },
      { opacity: 1, transform: 'translateX(0) translateY(0) scale(1) rotate(0deg)', filter: 'none' }
    ];
  }
}

function timingFor(type, index) {
  const base = {
    popout: 520, fan: 580, cascade: 500, portal: 600, bounce: 680,
    slide: 480, flip: 620, zoom: 500, spiral: 660, shuffle: 620
  }[clean(type)] || 520;
  return { duration: base, delay: Math.min(index * 58, 900), easing: 'cubic-bezier(.18,.9,.22,1.12)', fill: 'both' };
}

function play(element, type, index, runKey) {
  const animation = clean(type);
  element.dataset.folderAnimation = animation;
  element.classList.remove(...Array.from(element.classList).filter(c => c.startsWith('folder-anim-')));
  element.classList.add(`folder-anim-${animation}`, 'folder-revealed-v3');
  element.style.setProperty('animation', 'none', 'important');

  element.getAnimations?.().forEach(anim => {
    try { anim.cancel(); } catch {}
  });

  if (animation === 'none') {
    element.style.opacity = '1';
    element.style.transform = 'none';
    element.style.filter = 'none';
    return;
  }

  if (element.dataset.v3RunKey === runKey) return;
  element.dataset.v3RunKey = runKey;
  element.style.opacity = '0';
  void element.offsetWidth;
  const player = element.animate(framesFor(animation), timingFor(animation, index));
  player.onfinish = () => {
    element.style.opacity = '1';
    element.style.transform = 'none';
    element.style.filter = 'none';
  };
}

function applyAll(force = false) {
  const folders = Array.from(document.querySelectorAll('.inventory-mosaic-folder[data-folder-id],.vt-folder-card[data-folder-id]'));
  for (const folder of folders) {
    const folderId = String(folder.dataset.folderId || '');
    const animation = clean(folderAnimations.get(folderId) || folder.dataset.folderAnimation || 'popout');
    folder.dataset.folderAnimation = animation;
    folder.classList.remove(...Array.from(folder.classList).filter(c => c.startsWith('folder-anim-')));
    folder.classList.add(`folder-anim-${animation}`);

    let index = 0;
    let node = nextCard(folder);
    while (node && !node.matches?.('.inventory-mosaic-folder,.vt-folder-card')) {
      if (node.matches?.('.folder-revealed-item,.folder-revealed-v3,[data-from-open-folder="true"]')) {
        const runKey = `${folderId}:${animation}:${node.dataset.itemId || node.dataset.id || index}:${node.isConnected ? 'open' : 'x'}`;
        play(node, animation, index, force ? `${runKey}:${Date.now()}` : runKey);
        index += 1;
      }
      node = nextCard(node);
    }
  }
}

function injectOptions() {
  document.querySelectorAll('select.folder-animation-select').forEach(select => {
    for (const [value, label] of [['slide','Slide Out'],['flip','Flip Deal'],['zoom','Zoom Bloom'],['spiral','Spiral'],['shuffle','Shuffle']]) {
      if (!select.querySelector(`option[value="${value}"]`)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
    }
  });
}

async function refresh(force = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    injectOptions();
    await loadMap();
    applyAll(force);
  }, 40);
}

function install() {
  if (typeof window === 'undefined' || window.__VELKTRADE_FOLDER_WAAPI_V3__) return;
  window.__VELKTRADE_FOLDER_WAAPI_V3__ = true;
  refresh(true);

  const observer = new MutationObserver(mutations => {
    injectOptions();
    const added = mutations.flatMap(m => Array.from(m.addedNodes || []));
    const hasReveal = added.some(node => node.nodeType === 1 && (node.matches?.('.folder-revealed-item,[data-from-open-folder="true"]') || node.querySelector?.('.folder-revealed-item,[data-from-open-folder="true"]')));
    const hasInventory = added.some(node => node.nodeType === 1 && (node.matches?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card') || node.querySelector?.('.inventory-rewrite-shell,.inventory-mosaic-folder,.vt-folder-card')));
    if (hasReveal) applyAll(true);
    else if (hasInventory) applyAll(false);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('velktrade:folders-changed', () => { loaded = false; refresh(true); });
  window.addEventListener('velktrade:inventory-tools-refresh', () => { loaded = false; refresh(true); });
  window.setInterval(() => refresh(false), 9000);
}

install();
