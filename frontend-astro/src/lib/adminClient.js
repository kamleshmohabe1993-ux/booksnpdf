const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:5000/api';
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

function qs(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

// ---------- Catalog (books & courses) ----------

export async function adminListBooks(params = {}) {
  const res = await request(`/books/admin/all${qs(params)}`);
  return res.data;
}

export async function adminListCourses(params = {}) {
  const res = await request(`/courses/admin/all${qs(params)}`);
  return res.data;
}

export async function createBook(payload) {
  const res = await request('/books', { method: 'POST', body: payload });
  return res.data;
}

export async function updateBook(id, payload) {
  const res = await request(`/books/${id}`, { method: 'PUT', body: payload });
  return res.data;
}

export async function deleteBook(id) {
  return request(`/books/${id}`, { method: 'DELETE' });
}

export async function createCourse(payload) {
  const res = await request('/courses', { method: 'POST', body: payload });
  return res.data;
}

export async function updateCourse(id, payload) {
  const res = await request(`/courses/${id}`, { method: 'PUT', body: payload });
  return res.data;
}

export async function deleteCourse(id) {
  return request(`/courses/${id}`, { method: 'DELETE' });
}

// ---------- Users ----------

export async function adminListUsers(params = {}) {
  return request(`/auth/users${qs(params)}`); // { data, stats, total, page, pages }
}

export async function adminGetUserStats(params = {}) {
  const res = await request(`/auth/userstats${qs(params)}`);
  return res.data;
}

export async function adminToggleUserStatus(id) {
  const res = await request(`/auth/${id}/toggle-status`, { method: 'PUT' });
  return res.data;
}

export async function adminVerifyUser(id) {
  const res = await request(`/auth/${id}/verify`, { method: 'PUT' });
  return res.data;
}

export async function adminDeleteUser(id) {
  return request(`/auth/${id}`, { method: 'DELETE' });
}

export async function adminBulkUserAction(userIds, action) {
  const res = await request('/auth/bulk-action', { method: 'POST', body: { userIds, action } });
  return res.data;
}

async function downloadCsv(path, filenameFallback) {
  const res = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename=([^;]+)/);
  const filename = match ? match[1].trim() : filenameFallback;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function adminExportUsers(params = {}) {
  return downloadCsv(`/auth/exportusers${qs(params)}`, 'users-export.csv');
}

export async function adminExportTransactions(params = {}) {
  return downloadCsv(`/payments/export${qs(params)}`, 'transactions-export.csv');
}

// ---------- Transactions ----------

export async function adminListTransactions(params = {}) {
  return request(`/payments/transactions${qs(params)}`); // { data, stats, count }
}

export async function adminGetTransactionStats(params = {}) {
  const res = await request(`/payments/stats${qs(params)}`);
  return res.data;
}

export async function adminUpdateTransactionStatus(id, status, note) {
  const res = await request(`/payments/transactions/${id}/status`, { method: 'PUT', body: { status, note } });
  return res.data;
}

export async function adminDeleteTransaction(id, force = false) {
  return request(`/payments/transactions/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
}

export async function adminInitiateRefund(merchantOrderId, reason) {
  const res = await request(`/payments/refund/${merchantOrderId}`, { method: 'POST', body: { reason } });
  return res.data;
}
