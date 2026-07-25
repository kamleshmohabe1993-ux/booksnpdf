import { useEffect, useRef, useState } from 'react';
import { Languages, Check } from 'lucide-react';
import { LANGUAGES } from '../i18n/languages.js';

export default function LanguageToggle({ currentLang = 'en', label = 'Change language', comingSoonLabel = 'Coming soon' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function selectLang(code) {
    if (code === currentLang) return setOpen(false);
    document.cookie = `pdf_lang=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const url = new URL(window.location.href);
    url.searchParams.set('lang', code);
    window.location.href = url.toString();
  }

  const current = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title={label}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-sm text-[var(--ink)] hover:bg-[var(--bg-soft)] transition-colors"
      >
        <Languages size={15} />
        <span className="font-ticket text-xs">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-ticket border border-[var(--border)] bg-[var(--card)] shadow-ticket">
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {LANGUAGES.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => selectLang(l.code)}
                  disabled={l.status === 'soon'}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    <span className="font-medium">{l.native}</span>
                    <span className="ml-1.5 text-[var(--ink-faint)]">{l.label}</span>
                  </span>
                  {l.code === currentLang ? (
                    <Check size={14} className="text-[var(--accent)]" />
                  ) : l.status === 'soon' ? (
                    <span className="font-ticket text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">{comingSoonLabel}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
