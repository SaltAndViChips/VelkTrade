const axios = require('axios');

function extractImgurId(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return last.split('.')[0];
  } catch {
    const filename = String(url || '').split('/').pop() || '';
    return filename.split('.')[0];
  }
}

function isImgurUrl(url) {
  try {
    const parsed = new URL(url);
    return ['imgur.com', 'www.imgur.com', 'i.imgur.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function cleanImgurTitle(title, fallback) {
  const raw = String(title || '').trim();

  if (!raw) return fallback;

  // Example:
  // "discord.gg/velkon | Apocalyptic SR-25"
  // becomes:
  // "Apocalyptic SR-25"
  if (raw.includes('|')) {
    const afterPipe = raw.split('|').pop().trim();
    if (afterPipe) return afterPipe;
  }

  return raw;
}

async function fetchImgurItem(url) {
  const id = extractImgurId(url);

  if (!id) {
    return {
      title: 'Untitled Item',
      image: url
    };
  }

  if (!process.env.IMGUR_CLIENT_ID || process.env.IMGUR_CLIENT_ID === 'your_imgur_client_id') {
    return {
      title: id,
      image: url.includes('i.imgur.com') ? url : `https://i.imgur.com/${id}.png`
    };
  }

  try {
    const response = await axios.get(`https://api.imgur.com/3/image/${id}`, {
      headers: {
        Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`
      }
    });

    const data = response.data?.data;
    const title = cleanImgurTitle(data?.title, id);

    return {
      title,
      image: data?.link || `https://i.imgur.com/${id}.png`
    };
  } catch {
    return {
      title: id,
      image: url.includes('i.imgur.com') ? url : `https://i.imgur.com/${id}.png`
    };
  }
}

module.exports = { extractImgurId, isImgurUrl, cleanImgurTitle, fetchImgurItem };
