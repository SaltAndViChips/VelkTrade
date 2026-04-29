const axios = require('axios');

function extractImgurId(url) {
  const filename = url.split('/').pop() || '';
  return filename.split('.')[0];
}

async function fetchImgurTitle(url) {
  const id = extractImgurId(url);

  if (!id) return 'Untitled Item';

  if (!process.env.IMGUR_CLIENT_ID || process.env.IMGUR_CLIENT_ID === 'your_imgur_client_id') {
    return id;
  }

  try {
    const response = await axios.get(`https://api.imgur.com/3/image/${id}`, {
      headers: {
        Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`
      }
    });

    return response.data?.data?.title || id;
  } catch {
    return id;
  }
}

module.exports = { extractImgurId, fetchImgurTitle };
