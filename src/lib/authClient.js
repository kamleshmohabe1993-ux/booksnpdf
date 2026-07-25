const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787/api';
const TOKEN_KEY = 'token';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? authHeaders() : {}),
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

export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('user');
}

export function getCachedUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSession(data) {
  const { token, ...user } = data;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

export async function login(email, password) {
  const res = await request('/auth/login', { method: 'POST', body: { email, password } });
  return persistSession(res.data);
}

export async function register({ fullName, email, mobileNumber, password }) {
  const res = await request('/auth/register', { method: 'POST', body: { fullName, email, mobileNumber, password } });
  return persistSession(res.data);
}

export async function loginWithGoogle(credential) {
  const res = await request('/auth/google', { method: 'POST', body: { credential } });
  return persistSession(res.data);
}

export async function getMe() {
  const res = await request('/auth/me', { auth: true });
  localStorage.setItem('user', JSON.stringify(res.data));
  return res.data;
}

export async function updateProfile(payload) {
  const res = await request('/auth/profile', { method: 'PUT', body: payload, auth: true });
  localStorage.setItem('user', JSON.stringify(res.data));
  return res.data;
}

export async function changePassword(payload) {
  return request('/auth/change-password', { method: 'PUT', body: payload, auth: true });
}

export async function forgotPassword(email) {
  return request('/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function verifyResetOtp(payload) {
  return request('/auth/verify-reset-otp', { method: 'POST', body: payload });
}

export async function resendOtp(payload) {
  return request('/auth/resend-otp', { method: 'POST', body: payload });
}

export async function resetPassword(payload) {
  return request('/auth/reset-password', { method: 'POST', body: payload });
}

export async function sendEmailVerificationOtp(email) {
  return request('/auth/send-email-otp', { method: 'POST', body: { email } });
}

export async function verifyEmailOtp(payload) {
  return request('/auth/verify-email-otp', { method: 'POST', body: payload });
}

export async function getMyPurchases() {
  const res = await request('/payments/my-purchases', { auth: true });
  return res.data;
}
