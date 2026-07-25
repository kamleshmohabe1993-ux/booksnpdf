// Central registry of languages the toggle can offer.
// `status: 'ready'` languages have a full translated dictionary.
// `status: 'soon'` languages are wired into the system (routing, cookie,
// fallback) but currently render English strings until a translator fills
// in src/i18n/dictionaries/<code>.json — that's the only file a future
// translation pass needs to touch.
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', status: 'ready' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी', status: 'ready' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', status: 'soon' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', status: 'soon' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', status: 'soon' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', status: 'soon' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', status: 'soon' },
];

export const DEFAULT_LANG = 'en';

export function isValidLang(code) {
  return LANGUAGES.some((l) => l.code === code);
}
