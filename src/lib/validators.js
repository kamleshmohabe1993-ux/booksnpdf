// Lightweight client-side validation helpers for the auth forms.
// Mirrors the backend's actual constraints (see backend/models/User.js
// and backend/services/otpServices.js) so users don't hit a server
// error for something we can catch instantly in the browser.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/; // 10-digit Indian mobile number
const OTP_RE = /^\d{6}$/;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

export function isValidMobile(value) {
  return MOBILE_RE.test(String(value || '').trim());
}

export function isValidOtp(value) {
  return OTP_RE.test(String(value || '').trim());
}

/** Backend requires a minimum of 6 characters (models/User.js). */
export function isValidPassword(value) {
  return String(value || '').length >= 6;
}

export function isNonEmpty(value) {
  return String(value || '').trim().length > 0;
}
