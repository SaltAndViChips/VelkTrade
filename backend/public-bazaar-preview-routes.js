/* Public Bazaar preview + Discord/social embed routes. */

function installPublicBazaarPreviewRoutes({ app, all }) {
  if (!app || app.__publicBazaarPreviewRoutesInstalled) return;
  app.__publicBazaarPreviewRoutesInstalled = true;

  const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }

  function formatIc(value) {
    const raw = String(value ?? '').trim();
    const numeric = Number(raw.replace(/[^\d.]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) return `${Math.round(numeric).toLocaleString()} IC`;
    return raw || 'No price';
  }

  async function newestListings(limit = 5) {
    const rows = await all(`
      SELECT
        i.id,
        i.title,
        i.image,
        i.price,
        i.created_at AS "createdAt",
        u.username AS "ownerUsername",
        COALESCE(u.is_verified, FALSE) AS "ownerVerified"
      FROM items i
      JOIN users u ON u.id = COALESCE(i.userId, i.userid)
      WHERE i.price IS NOT NULL
        AND TRIM(CAST(i.price AS TEXT)) <> ''
        AND COALESCE(i.trade_pending, FALSE) = FALSE
        AND COALESCE(i.locked, FALSE) = FALSE
        AND COALESCE(u.show_bazaar_inventory, TRUE) = TRUE
      ORDER BY COALESCE(i.created_at, NOW()) DESC, i.id DESC
      LIMIT ?
    `, [limit]);
    return Array.isArray(rows) ? rows : [];
  }

  app.get('/api/bazaar/public', async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(25, Number(req.query.limit || 25) || 25));
      const items = await newestListings(limit);
      res.json({ ok: true, items });
    } catch (error) {
      console.error('Public Bazaar API failed:', error);
      res.status(500).json({ error: error.message || 'Could not load public Bazaar preview' });
    }
  });

  app.get(['/bazaar-preview', '/bazaar-embed', '/discord/bazaar'], async (_req, res) => {
    try {
      const items = await newestListings(5);
      const lines = items.map((item, index) => `${index + 1}. ${item.title || 'Untitled item'} — ${formatIc(item.price)}`);
      const description = lines.length ? lines.join(' | ') : 'Browse the newest IC listings on VelkTrade.';
      const firstImage = items.find(item => item.image)?.image || `${FRONTEND_URL}/profile.png`;
      const title = 'VelkTrade Bazaar — Newest Listings';
      const url = `${FRONTEND_URL}/bazaar`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:image" content="${escapeHtml(firstImage)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(firstImage)}" />
  <meta name="theme-color" content="#7c4dff" />
  <style>
    body { margin:0; min-height:100vh; background:#08050f; color:#f4f0ff; font-family:Inter, system-ui, sans-serif; display:grid; place-items:center; padding:28px; }
    main { width:min(940px, 100%); border:1px solid rgba(124,77,255,.42); border-radius:24px; padding:24px; background:radial-gradient(circle at top left, rgba(124,77,255,.28), transparent 38%), rgba(12,8,20,.88); box-shadow:0 0 48px rgba(124,77,255,.22); }
    h1 { margin:0 0 8px; font-size:34px; } p { color:rgba(244,240,255,.72); } .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:14px; margin-top:18px; }
    article { border:1px solid rgba(124,77,255,.28); border-radius:16px; padding:10px; background:rgba(0,0,0,.28); } img { width:100%; height:170px; object-fit:contain; background:#030307; border-radius:12px; }
    strong { display:block; margin-top:8px; } span { color:#ffdc93; font-weight:900; font-size:13px; } a { display:inline-flex; margin-top:20px; color:white; background:linear-gradient(135deg,#7c4dff,#a56cff); padding:12px 18px; border-radius:12px; text-decoration:none; font-weight:900; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <section class="grid">${items.map(item => `<article>${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title || 'Item')}" />` : ''}<strong>${escapeHtml(item.title || 'Untitled item')}</strong><span>${escapeHtml(formatIc(item.price))}</span></article>`).join('')}</section>
    <a href="${escapeHtml(url)}">Open Bazaar</a>
  </main>
</body>
</html>`);
    } catch (error) {
      console.error('Bazaar embed failed:', error);
      res.status(500).send('Bazaar preview unavailable');
    }
  });
}

module.exports = installPublicBazaarPreviewRoutes;
