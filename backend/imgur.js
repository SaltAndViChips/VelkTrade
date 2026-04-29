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

function stripImgurSuffix(value) {
  return decodeHtmlish(value)
    .replace(/\s*-\s*Imgur\s*$/i, '')
    .replace(/\s*\|\s*Imgur\s*$/i, '')
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
  if (/^[a-z0-9]{5,}$/i.test(value) && !value.includes(' ')) return true;

  return false;
}

function cleanImgurTitle(title, fallback) {
  const raw = stripImgurSuffix(title);

  if (!raw) return fallback;

  // Exact known pattern:
  // "discord.gg/velkon | Apocalyptic SR-25"
  // -> "Apocalyptic SR-25"
  if (raw.includes('|')) {
    const afterPipe = raw.split('|').pop().trim();
    if (afterPipe && !isJunkTitleLine(afterPipe)) {
      return stripImgurSuffix(afterPipe);
    }
  }

  const normalized = raw
    .replace(/\r/g, '\n')
    .replace(/(?:Owned-by-|Owned by |Captured on|Join http)/g, '\n$&');

  const candidates = normalized
    .split(/\n+/)
    .map(line => stripImgurSuffix(line))
    .filter(line => !isJunkTitleLine(line))
    .filter(line => line.length <= 100);

  if (candidates.length > 0) {
    const itemLike = candidates.find(line =>
      /[A-Za-z]/.test(line) &&
      line.length >= 3 &&
      line.length <= 60
    );

    return itemLike || candidates[0];
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
    if (cleaned && cleaned !== fallback) return cleaned;
  }

  return fallback;
}

function bestImageFromData(data, fallbackImage) {
  if (data?.link && /\.(png|jpe?g|gif|webp)$/i.test(data.link)) {
    return data.link;
  }

  if (Array.isArray(data?.images) && data.images.length > 0) {
    const image = data.images.find(item => item?.link);
    if (image?.link) return image.link;
  }

  if (data?.cover) {
    return `https://i.imgur.com/${data.cover}.png`;
  }

  return fallbackImage;
}

function getAttributeValue(tag, attrName) {
  const regex = new RegExp(`${attrName}\\\\s*=\\\\s*([\"'])(.*?)\\\\1`, 'i');
  const match = tag.match(regex);
  return match?.[2] ? decodeHtmlish(match[2]) : '';
}

function extractMetaValue(html, attrName, attrValue) {
  const metaTags = String(html || '').match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const foundValue = getAttributeValue(tag, attrName);

    if (foundValue.toLowerCase() === attrValue.toLowerCase()) {
      const content = getAttributeValue(tag, 'content');

      if (content) return content;
    }
  }

  return '';
}

function extractTitleTag(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtmlish(match[1]) : '';
}

function extractOEmbedTitle(html) {
  const linkTags = String(html || '').match(/<link\b[^>]*>/gi) || [];

  for (const tag of linkTags) {
    const type = getAttributeValue(tag, 'type');

    if (type === 'application/json+oembed' || type === 'application/xml+oembed') {
      const title = getAttributeValue(tag, 'title');

      if (title) return title;
    }
  }

  return '';
}

function extractImageFromPage(html, fallbackImage) {
  const candidates = [
    extractMetaValue(html, 'property', 'og:image'),
    extractMetaValue(html, 'name', 'twitter:image')
  ].filter(Boolean);

  const image = candidates.find(value => value.includes('i.imgur.com'));

  if (!image) return fallbackImage;

  return image.replace(/\?fb$/i, '');
}

async function scrapeImgurPage(id) {
  try {
    const response = await axios.get(`https://imgur.com/${id}`, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = String(response.data || '');

    // This order matches the HTML you pasted:
    // title, twitter:title, og:title, oembed link title
    const titleFields = [
      extractTitleTag(html),
      extractMetaValue(html, 'name', 'twitter:title'),
      extractMetaValue(html, 'property', 'og:title'),
      extractOEmbedTitle(html),
      extractMetaValue(html, 'name', 'description'),
      extractMetaValue(html, 'property', 'og:description')
    ];

    for (const field of titleFields) {
      const cleaned = cleanImgurTitle(field, '');

      if (cleaned && cleaned !== id) {
        return {
          title: cleaned,
          image: extractImageFromPage(html, `https://i.imgur.com/${id}.png`)
        };
      }
    }

    return {
      title: '',
      image: extractImageFromPage(html, `https://i.imgur.com/${id}.png`)
    };
  } catch {
    return {
      title: '',
      image: `https://i.imgur.com/${id}.png`
    };
  }
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

  // Scrape page first for regular imgur.com page URLs.
  // This is where the gallery title exists for URLs like https://imgur.com/6hUs12E.
  if (!url.includes('i.imgur.com')) {
    const scraped = await scrapeImgurPage(id);

    if (scraped.title && scraped.title !== id) {
      return {
        title: scraped.title,
        image: scraped.image || fallbackImage
      };
    }
  }

  if (process.env.IMGUR_CLIENT_ID && process.env.IMGUR_CLIENT_ID !== 'your_imgur_client_id') {
    const client = axios.create({
      baseURL: 'https://api.imgur.com/3',
      headers: {
        Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`
      },
      timeout: 8000
    });

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

        const apiTitle = bestTitleFromData(data, '');
        const image = bestImageFromData(data, fallbackImage);

        if (apiTitle && apiTitle !== id) {
          return {
            title: apiTitle,
            image
          };
        }
      } catch {
        // Try next endpoint.
      }
    }
  }

  // Final page scrape fallback, even for direct URLs.
  const scraped = await scrapeImgurPage(id);

  return {
    title: scraped.title || id,
    image: scraped.image || fallbackImage
  };
}

module.exports = {
  extractImgurId,
  isImgurUrl,
  cleanImgurTitle,
  fetchImgurItem
};
