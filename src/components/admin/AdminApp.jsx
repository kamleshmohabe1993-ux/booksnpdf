import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, LogIn, UploadCloud, Users, Receipt } from 'lucide-react';
import { isLoggedIn, getMe } from '../../lib/authClient.js';
import UploadSection from './UploadSection.jsx';
import UsersSection from './UsersSection.jsx';
import TransactionsSection from './TransactionsSection.jsx';

const TABS = [
  { key: 'upload', label: 'Upload', icon: UploadCloud },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'transactions', label: 'Transactions', icon: Receipt },
];

export default function AdminApp() {
  const [state, setState] = useState('loading'); // loading | anon | forbidden | error | ready
  const [tab, setTab] = useState('upload');

  useEffect(() => {
    if (!isLoggedIn()) {
      setState('anon');
      return;
    }
    getMe()
      .then((me) => setState(me.isAdmin ? 'ready' : 'forbidden'))
      .catch(() => setState('error'));
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 py-16 text-[var(--ink-faint)]">
        <Loader2 size={18} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (state === 'anon') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <LogIn size={28} className="text-[var(--accent)]" />
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Log in required</h2>
        <p className="max-w-sm text-sm text-[var(--ink-soft)]">You need to be logged in with an admin account to view this page.</p>
        <a href="/login?next=/admin" className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">Log in</a>
      </div>
    );
  }

  if (state === 'forbidden') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <ShieldAlert size={28} className="text-stamp-red" />
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Admin access required</h2>
        <p className="max-w-sm text-sm text-[var(--ink-soft)]">Your account doesn't have admin privileges.</p>
        <a href="/my-library" className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]">Back to My Library</a>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <ShieldAlert size={28} className="text-stamp-red" />
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Couldn't load your account</h2>
        <p className="max-w-sm text-sm text-[var(--ink-soft)]">Something went wrong checking your permissions. Try refreshing the page.</p>
      </div>
    );
  }

  const ActiveSection = { upload: UploadSection, users: UsersSection, transactions: TransactionsSection }[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">Admin dashboard</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">Manage your catalog, users, and transactions.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <ActiveSection />
    </div>
  );
}
