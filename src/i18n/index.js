import en from './dictionaries/en.json';
import hi from './dictionaries/hi.json';
import mr from './dictionaries/mr.json';
import gu from './dictionaries/gu.json';
import ta from './dictionaries/ta.json';
import te from './dictionaries/te.json';
import bn from './dictionaries/bn.json';
import { DEFAULT_LANG, isValidLang } from './languages.js';

const DICTS = { en, hi, mr, gu, ta, te, bn };

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else if (key !== '_note') {
      out[key] = override[key];
    }
  }
  return out;
}

/** Returns the full dictionary for `lang`, English-filled for any missing keys. */
export function getDictionary(lang) {
  const code = isValidLang(lang) ? lang : DEFAULT_LANG;
  return deepMerge(en, DICTS[code]);
}

/** dictionary lookup by dot path + {placeholder} interpolation, e.g. t(dict, 'book.by', { author: 'Premchand' }) */
export function t(dict, path, vars) {
  const value = path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), dict);
  if (value === undefined) return path;
  if (!vars) return value;
  return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{${k}}`, v), value);
}

/** Resolve the active language for a request: ?lang= query wins, then the pdf_lang cookie, then default. */
export function resolveLang(astroUrl, cookies) {
  const queryLang = astroUrl?.searchParams?.get('lang');
  if (queryLang && isValidLang(queryLang)) return queryLang;
  const cookieLang = cookies?.get?.('pdf_lang')?.value;
  if (cookieLang && isValidLang(cookieLang)) return cookieLang;
  return DEFAULT_LANG;
}
