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
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return data;
}

// ---------- Books ----------

export async function initiateBookPayment(bookId, upiId) {
  const res = await request('/payments/initiate', { method: 'POST', body: { bookId, upiId: upiId || undefined } });
  return res.data;
}

export async function downloadFreeBook(bookId) {
  const res = await request(`/payments/downloadfree/${bookId}`, { method: 'POST' });
  return res.data;
}

// ---------- Courses ----------

export async function initiateCoursePayment(courseId, upiId) {
  const res = await request('/payments/initiate-course', { method: 'POST', body: { courseId, upiId: upiId || undefined } });
  return res.data;
}

export async function downloadFreeCourse(courseId) {
  const res = await request(`/payments/downloadfree-course/${courseId}`, { method: 'POST' });
  return res.data;
}

// ---------- Shared ----------

export async function getPaymentStatus(merchantOrderId) {
  const res = await request(`/payments/status/${merchantOrderId}`);
  return res.data;
}

export async function requestRefund(paymentId, reason) {
  const res = await request(`/payments/${paymentId}/request-refund`, { method: 'POST', body: { reason } });
  return res.data;
}

export function downloadUrlForToken(token) {
  return `${API_URL}/payments/download/${token}`;
}

// The /payments/download/:token endpoint returns JSON ({ downloadUrl, filename, ... }),
// not the file itself — it's a lightweight redirect resolver so download tokens can be
// rate-limited/expired server-side. So it must never be used directly as an <a href>;
// callers should fetch it via triggerDownload() below, then hand the *resolved*
// downloadUrl to this helper to actually trigger the file save.
export function startFileDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Triggers the actual file download using a resolved download token.
export async function triggerDownload(token) {
  const res = await request(`/payments/download/${token}`);
  return res.data; // { downloadUrl, filename, remainingDownloads, expiresAt }
}
