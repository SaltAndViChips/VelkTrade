const axios = require('axios');

function extractImgurId(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);

    // Supports:
    // https://imgur.com/6hUs12E
    // https://i.imgur.com/6hUs12E.png
    // https://imgur.com/gallery/6hUs12E
    // https://imgur.com/a/6hUs12E
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

function stripImgurSuffix(value) {
  return String(value || '')
    .replace(/\s*-\s*Imgur\s*$/i, '')
    .replace(/\s*\|\s*Imgur\s*$/i, '')
    .trim();
}

function decodeHtmlish(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/amp;/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function isJunkTitleLine(line) {
  const value = String(line || '').trim();
  const lower = value.toLowerCase();

  if (!value) return true;
  if (value.length < 2) return true;
  if (lower.includes('discord.gg')) return true;
  if (lower.includes('steamcommunity')) return true;
  if (lower.includes('steam_')) return true;
  if (lower.includes('owned-by-')) return true;
  if (lower.includes('owned by ')) return true;
  if (lower.includes('captured on')) return true;
  if (lower.includes('join http')) return true;
  if (lower.includes('http://')) return true;
  if (lower.includes('https://')) return true;

  return false;
}

function cleanImgurTitle(title, fallback) {
  let raw = decodeHtmlish(stripImgurSuffix(title));

  if (!raw) return fallback;

  // Example:
  // "discord.gg/velkon | Apocalyptic SR-25"
  // -> "Apocalyptic SR-25"
  if (raw.includes('|')) {
    const afterPipe = raw.split('|').pop().trim();
    if (afterPipe && !isJunkTitleLine(afterPipe)) {
      return stripImgurSuffix(afterPipe);
    }
  }

  // Break noisy metadata blobs into candidate lines.
  const candidates = raw
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => stripImgurSuffix(decodeHtmlish(line)))
    .filter(line => !isJunkTitleLine(line));

  if (candidates.length > 0) {
    // Prefer short weapon/item-looking names over long metadata.
    const cleanCandidates = candidates
      .map(line => line.trim())
      .filter(line => line.length <= 80);

    if (cleanCandidates.length > 0) {
      return cleanCandidates[0];
    }

    return candidates[0];
  }

  if (!isJunkTitleLine(raw)) {
    return raw;
  }

  return fallback;
}

function bestTitleFromData(data, fallback) {
  const fields = [
    data?.title,
    data?.description,
    data?.cover_title,
    data?.cover_description
  ];

  if (Array.isArray(data?.images)) {
    for (const image of data.images) {
      fields.push(image?.title);
      fields.push(image?.description);
    }
  }

  for (const field of fields) {
    const cleaned = cleanImgurTitle(field, '');
    if (cleaned) return cleaned;
  }

  return fallback;
}

function bestImageFromData(data, fallbackImage) {
  if (data?.link && /\.(png|jpe?g|gif|webp)$/i.test(data.link)) {
    return data.link;
  }

  if (Array.isArray(data?.images) && data.images.length > 0) {
    const firstImageWithLink = data.images.find(image => image?.link);
    if (firstImageWithLink?.link) return firstImageWithLink.link;
  }

  if (data?.cover) {
    return `https://i.imgur.com/${data.cover}.png`;
  }

  return fallbackImage;
}

async function getImgurData(client, endpoint) {
  const response = await client.get(endpoint);
  return response.data?.data;
}

async function fetchImgurItem(url) {
  const id = extractImgurId(url);

  if (!id) {
    return {
      title: 'Untitled Item',
      image: url
    };
  }

  const fallbackImage = url.includes('i.imgur.com') ? url : `https://i.imgur.com/${id}.png`;

  if (!process.env.IMGUR_CLIENT_ID || process.env.IMGUR_CLIENT_ID === 'your_imgur_client_id') {
    return {
      title: id,
      image: fallbackImage
    };
  }

  const client = axios.create({
    baseURL: 'https://api.imgur.com/3',
    headers: {
      Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`
    },
    timeout: 8000
  });

  // Gallery/page URLs can have a gallery title that differs from the raw image title.
  // Try gallery endpoints first, then fall back to image.
  const endpoints = [
    `/gallery/image/${id}`,
    `/gallery/album/${id}`,
    `/gallery/${id}`,
    `/image/${id}`
  ];

  for (const endpoint of endpoints) {
    try {
      const data = await getImgurData(client, endpoint);
      if (!data) continue;

      return {
        title: bestTitleFromData(data, id),
        image: bestImageFromData(data, fallbackImage)
      };
    } catch {
      // Keep trying the next endpoint.
    }
  }

  return {
    title: id,
    image: fallbackImage
  };
}

module.exports = {
  extractImgurId,
  isImgurUrl,
  cleanImgurTitle,
  fetchImgurItem
};
