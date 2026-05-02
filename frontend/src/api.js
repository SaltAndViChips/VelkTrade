export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TOKEN_KEYS = ['token', 'velktrade-token', 'authToken', 'jwt'];

export function getToken() {
  for (const key of TOKEN_KEYS) {
    const value = localStorage.getItem(key);
    if (value && value !== 'undefined' && value !== 'null') return value;
  }
  return '';
}

export function setToken(token) {
  if (!token) return;
  localStorage.setItem('token', token);
  localStorage.setItem('velktrade-token', token);
}

export function clearToken() {
  for (const key of TOKEN_KEYS) localStorage.removeItem(key);
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Auth-Token': token } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { text: await response.text().catch(() => '') };

  const responseError = data.error || data.message === 'Missing token' ? data.error || data.message : '';

  if (!response.ok || responseError) {
    const message = responseError || data.text || `Request failed with status ${response.status}`;
    if (/missing token|invalid token|not authenticated/i.test(message)) {
      const tokenState = token ? 'Token was present in localStorage but backend rejected it.' : 'No login token found in localStorage.';
      throw new Error(`${message}. ${tokenState}`);
    }
    throw new Error(message);
  }

  return data;
}
