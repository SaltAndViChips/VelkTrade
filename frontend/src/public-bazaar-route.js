import { API_URL, getToken } from './api';

function isBazaarPath() {
  return /(?:\/VelkTrade)?\/bazaar\/?$/i.test(window.location.pathname) || new URLSearchParams(window.location.search).get('view') === 'bazaar';
}

function appBase() {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${window.location.origin}${cleanBase}`;
}

function bazaarUrl() {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${window.location.origin}${cleanBase}/bazaar`;
}

function embedUrl() {
  return `${API_URL}/bazaar-preview`;
}

function text(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function formatPrice(value) {
  const raw = text(value);
  const numeric = Number(raw.replace(/[^\d.]/g, ''));
  if (Number.isFinite(numeric) && numeric > 0) return `${Math.round(numeric).toLocaleString()} IC`;
  return raw || 'No price';
}

function renderPublicBazaar(root, items = [], error = '') {
  document.title = 'VelkTrade Bazaar';
  root.innerHTML = `
    <main class="public-bazaar-page">
      <section class="public-bazaar-hero">
        <div>
          <p class="public-bazaar-kicker">VelkTrade Public Bazaar</p>
          <h1>Newest Bazaar Listings</h1>
          <p>Browse current IC listings without logging in. Log in or register to mark interest, make buy offers, bid, or trade.</p>
        </div>
        <div class="public-bazaar-actions">
          <a href="${appBase()}" class="public-bazaar-primary">Log in / Register</a>
          <button type="button" id="copy-bazaar-link">Copy Bazaar Link</button>
          <button type="button" id="copy-bazaar-embed">Copy Discord Preview Link</button>
        </div>
      </section>
      ${error ? `<p class="public-bazaar-error">${error}</p>` : ''}
      <section class="public-bazaar-preview-card">
        <div class="public-bazaar-preview-title">
          <div><h2>Discord Preview</h2><p>Share this link in Discord to embed the newest 5 Bazaar items.</p></div>
          <code>${embedUrl()}</code>
        </div>
        <div class="public-bazaar-mini-row">
          ${items.slice(0, 5).map(item => `<article>${item.image ? `<img src="${item.image}" alt="${text(item.title, 'Item')}" />` : `<div class="public-bazaar-empty">?</div>`}<strong>${text(item.title, 'Untitled item')}</strong><span>${formatPrice(item.price)}</span></article>`).join('') || '<p>No Bazaar listings found.</p>'}
        </div>
      </section>
      <section class="public-bazaar-grid">
        ${items.map(item => `<article class="public-bazaar-item" data-no-item-popup="true">
          <div class="public-bazaar-image">${item.image ? `<img src="${item.image}" alt="${text(item.title, 'Item')}" />` : '<div class="public-bazaar-empty">?</div>'}</div>
          <strong>${text(item.title, 'Untitled item')}</strong>
          <span>${formatPrice(item.price)}</span>
          <small>${item.ownerVerified ? '✓ Verified seller' : 'Seller hidden'}${item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ''}</small>
          <button type="button" class="public-bazaar-login-action">Log in to interact</button>
        </article>`).join('') || '<p class="public-bazaar-empty-state">No Bazaar listings found.</p>'}
      </section>
    </main>
  `;

  root.querySelector('#copy-bazaar-link')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(bazaarUrl()).catch(() => {});
    alert('Bazaar link copied.');
  });
  root.querySelector('#copy-bazaar-embed')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(embedUrl()).catch(() => {});
    alert('Discord preview link copied.');
  });
  root.querySelectorAll('.public-bazaar-login-action').forEach(button => button.addEventListener('click', () => { window.location.href = appBase(); }));
}

async function renderPublic() {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '<main class="public-bazaar-page"><section class="public-bazaar-hero"><h1>Loading Bazaar...</h1></section></main>';
  try {
    const response = await fetch(`${API_URL}/api/bazaar/public?limit=50`, { credentials: 'omit' });
    const data = await response.json().catch(() => ({}));
    renderPublicBazaar(root, Array.isArray(data.items) ? data.items : [], response.ok ? '' : (data.error || 'Could not load Bazaar.'));
  } catch (error) {
    renderPublicBazaar(root, [], error.message || 'Could not load Bazaar.');
  }
}

function openLoggedInBazaar() {
  const started = Date.now();
  const timer = window.setInterval(() => {
    const bazaarButton = Array.from(document.querySelectorAll('button, a')).find(node => /bazaar/i.test(String(node.textContent || '')));
    if (bazaarButton) {
      window.clearInterval(timer);
      bazaarButton.click();
    }
    if (Date.now() - started > 6000) window.clearInterval(timer);
  }, 150);
}

function install() {
  if (typeof window === 'undefined' || !isBazaarPath()) return;
  window.__VELKTRADE_BAZAAR_DEDICATED_LINK__ = true;
  if (getToken()) {
    window.setTimeout(openLoggedInBazaar, 600);
  } else {
    window.setTimeout(renderPublic, 0);
    window.setTimeout(renderPublic, 800);
  }
}

install();
