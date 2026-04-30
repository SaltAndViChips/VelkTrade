function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeUsername(value) {
  return String(value || '').trim();
}

function isCrawlerRequest(req) {
  const userAgent = String(req.get('user-agent') || '').toLowerCase();

  return [
    'discordbot',
    'twitterbot',
    'facebookexternalhit',
    'facebot',
    'slackbot',
    'linkedinbot',
    'telegrambot',
    'whatsapp',
    'embedly',
    'quora link preview',
    'pinterest',
    'vkshare'
  ].some(bot => userAgent.includes(bot));
}

function socialPreviewImageUrl(publicFrontendUrl) {
  const cleanFrontendUrl = String(publicFrontendUrl || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

  return `${cleanFrontendUrl}/social-preview.png`;
}

function profileUrl(publicFrontendUrl, username) {
  const cleanFrontendUrl = String(publicFrontendUrl || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

  return `${cleanFrontendUrl}/user/${encodeURIComponent(username)}`;
}

function sharePageHtml({
  req,
  title,
  description,
  image,
  destination,
  shouldRedirect
}) {
  const canonicalShareUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#8d63ff">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Salts Trading Board">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonicalShareUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1200">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <link rel="canonical" href="${escapeHtml(destination)}">
  ${shouldRedirect ? `<meta http-equiv="refresh" content="0; url=${escapeHtml(destination)}">` : ''}
</head>
<body style="background:#09070f;color:#f2efff;font-family:Arial,sans-serif">
  <main style="max-width:720px;margin:40px auto;padding:24px;border:1px solid #6f5ca8;border-radius:16px;background:#171522">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p><a style="color:#b99dff" href="${escapeHtml(destination)}">Open profile</a></p>
  </main>
  ${shouldRedirect ? `<script>window.location.replace(${JSON.stringify(destination)});</script>` : ''}
</body>
</html>`;
}

function registerProfileShareRoute(app, { get, publicFrontendUrl }) {
  const cleanPublicFrontendUrl = String(publicFrontendUrl || 'https://nicecock.ca/VelkTrade').replace(/\/$/, '');

  app.get('/u/:username', async (req, res) => {
    const username = normalizeUsername(req.params.username);
    const image = socialPreviewImageUrl(cleanPublicFrontendUrl);

    const profileUser = await get(
      `SELECT id, username, bio
       FROM users
       WHERE LOWER(username) = LOWER(?)`,
      [username]
    );

    if (!profileUser) {
      const fallbackUrl = `${cleanPublicFrontendUrl}/`;
      const title = 'Player not found - Salts Trading Board';
      const description = 'This VelkTrade profile could not be found.';

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');

      return res.status(404).send(sharePageHtml({
        req,
        title,
        description,
        image,
        destination: fallbackUrl,
        shouldRedirect: !isCrawlerRequest(req)
      }));
    }

    const itemCountRow = await get(
      `SELECT COUNT(*)::int AS count
       FROM items
       WHERE userId = ?`,
      [profileUser.id]
    );

    const sellingCount = Number(itemCountRow?.count || 0);
    const itemWord = sellingCount === 1 ? 'item' : 'items';
    const bio = String(profileUser.bio || '').trim().slice(0, 1000);
    const title = `${profileUser.username}'s Trading Board`;
    const description = bio
      ? `${bio} • Selling ${sellingCount} ${itemWord} on Salts Trading Board.`
      : `Selling ${sellingCount} ${itemWord} on Salts Trading Board.`;
    const destination = profileUrl(cleanPublicFrontendUrl, profileUser.username);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    return res.send(sharePageHtml({
      req,
      title,
      description,
      image,
      destination,
      shouldRedirect: !isCrawlerRequest(req)
    }));
  });
}

module.exports = {
  registerProfileShareRoute
};
