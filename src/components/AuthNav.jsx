import { useEffect, useRef, useState } from 'react';
import { Library, LogOut, ChevronDown, ShieldCheck } from 'lucide-react';
import { isLoggedIn, getCachedUser, getMe, logout } from '../lib/authClient.js';

export default function AuthNav({ labels = {}, variant = 'desktop' }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      setReady(true);
      return;
    }
    setUser(getCachedUser());
    setReady(true);
    getMe().then(setUser).catch(() => {
      logout();
      setUser(null);
    });
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleLogout() {
    logout();
    setUser(null);
    setOpen(false);
    window.location.href = '/';
  }

  if (!ready) {
    return <div className="h-9 w-20 animate-pulse rounded-full bg-[var(--bg-soft)]" aria-hidden="true" />;
  }

  const loginLabel = labels.login || 'Log In';
  const registerLabel = labels.register || 'Sign Up';
  const libraryLabel = labels.myLibrary || 'My Library';
  const logoutLabel = labels.logout || 'Log out';

  if (!user) {
    if (variant === 'mobile') {
      return (
        <div className="mt-2 flex gap-2 border-t border-[var(--border)] pt-3">
          <a href="/login" className="flex-1 rounded-full border border-[var(--border)] px-4 py-2 text-center text-sm font-medium">{loginLabel}</a>
          <a href="/register" className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-center text-sm font-medium text-white">{registerLabel}</a>
        </div>
      );
    }
    return (
      <>
        <a href="/login" className="hidden sm:inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]">
          {loginLabel}
        </a>
        <a href="/register" className="hidden sm:inline-flex items-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
          {registerLabel}
        </a>
      </>
    );
  }

  const initials = (user.fullName || user.email || '?').charAt(0).toUpperCase();

  if (variant === 'mobile') {
    return (
      <div className="mt-2 flex flex-col gap-1 border-t border-[var(--border)] pt-3">
        <a href="/my-library" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]"><Library size={16} /> {libraryLabel}</a>
        {user.isAdmin && (
          <a href="/admin" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]"><ShieldCheck size={16} /> Admin</a>
        )}
        <button type="button" onClick={handleLogout} className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-stamp-red hover:bg-[var(--bg-soft)]"><LogOut size={16} /> {logoutLabel}</button>
      </div>
    );
  }

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs text-white">{initials}</span>
        <span className="max-w-[8rem] truncate">{user.fullName || user.email}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-ticket border border-[var(--border)] bg-[var(--card)] shadow-ticket">
          <a href="/my-library" className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--bg-soft)]"><Library size={15} /> {libraryLabel}</a>
          {user.isAdmin && (
            <a href="/admin" className="flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--bg-soft)]"><ShieldCheck size={15} /> Admin</a>
          )}
          <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2.5 text-left text-sm text-stamp-red hover:bg-[var(--bg-soft)]">
            <LogOut size={15} /> {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
