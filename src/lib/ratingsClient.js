const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787/api';
const TOKEN_KEY = 'token';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: 'Unexpected server response' };
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function getBookRatings(bookId, { page = 1, limit = 10 } = {}) {
  const res = await request(`/ratings/${bookId}?page=${page}&limit=${limit}`);
  return res.data; // { ratings, pagination, distribution }
}

export async function getMyRating(bookId) {
  const res = await request(`/ratings/user/${bookId}`);
  return res.data; // rating doc or null
}

export async function submitRating({ bookId, rating, review }) {
  const res = await request('/ratings', { method: 'POST', body: { bookId, rating, review } });
  return res.data;
}

export async function deleteRating(ratingId) {
  return request(`/ratings/${ratingId}`, { method: 'DELETE' });
}
