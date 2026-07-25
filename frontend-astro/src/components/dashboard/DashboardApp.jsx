import { useEffect, useState } from 'react';
import { LogIn, Package, Wallet, BookOpen, Save, Loader2 } from 'lucide-react';
import { getMe, getMyPurchases, updateProfile, isLoggedIn } from '../../lib/authClient.js';
import { normalizePurchase } from '../../lib/normalizePurchase.js';

export default function DashboardApp({ dict, lang }) {
  const [state, setState] = useState('loading'); // loading | error | ready | anon
  const [user, setUser] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState({ fullName: '', mobileNumber: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      setState('anon');
      return;
    }
    Promise.all([getMe(), getMyPurchases().catch(() => [])])
      .then(([me, purchaseList]) => {
        setUser(me);
        setForm({ fullName: me.fullName || '', mobileNumber: me.mobileNumber || '' });
        setPurchases((purchaseList || []).map(normalizePurchase));
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateProfile(form);
      setUser(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 py-16 text-[var(--ink-faint)]">
        <Loader2 size={18} className="animate-spin" /> …
      </div>
    );
  }

  if (state === 'anon' || state === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <LogIn size={28} className="text-[var(--accent)]" />
        <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
          {state === 'error' ? dict.loadError : dict.requireLoginTitle}
        </h2>
        {state === 'anon' && <p className="max-w-sm text-sm text-[var(--ink-soft)]">{dict.requireLoginBody}</p>}
        <a href={`/login?next=/dashboard`} className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
          {dict.goToLogin}
        </a>
      </div>
    );
  }

  const totalSpent = purchases.reduce((sum, p) => sum + (p.status === 'SUCCESS' || p.status === 'COMPLETED' ? p.price : 0), 0);
  const recent = purchases.slice(0, 5);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">
          {dict.welcomeBack.replace('{name}', user.fullName || user.email)}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <Package size={20} className="text-[var(--accent)]" />
          <div>
            <p className="font-display text-xl font-semibold text-[var(--ink)]">{purchases.length}</p>
            <p className="text-xs text-[var(--ink-faint)]">{dict.totalPurchases}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <Wallet size={20} className="text-[var(--accent)]" />
          <div>
            <p className="font-display text-xl font-semibold text-[var(--ink)]">₹{totalSpent}</p>
            <p className="text-xs text-[var(--ink-faint)]">{dict.totalSpent}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <BookOpen size={20} className="text-[var(--accent)]" />
          <div>
            <p className="font-display text-xl font-semibold text-[var(--ink)]">{purchases.length}</p>
            <p className="text-xs text-[var(--ink-faint)]">{dict.booksOwned}</p>
          </div>
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{dict.recentPurchases}</h2>
          <a href="/my-library" className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-dark)]">{dict.viewLibrary} →</a>
        </div>

        {recent.length === 0 ? (
          <div className="mt-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <p className="font-medium text-[var(--ink)]">{dict.noPurchasesYet}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{dict.noPurchasesBody}</p>
            <a href="/books" className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
              {dict.browseBooks}
            </a>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-ticket border border-[var(--border)] bg-[var(--card)]">
            {recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--ink)]">{p.title}</p>
                  <p className="text-xs text-[var(--ink-faint)]">{p.author}</p>
                </div>
                <span className="shrink-0 font-ticket text-xs text-[var(--ink-faint)]">₹{p.price}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{dict.accountDetails}</h2>
        <form onSubmit={onSave} className="mt-4 grid grid-cols-1 gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
            Name
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
            Mobile
            <input value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)] sm:col-span-2">
            Email
            <input value={user.email} disabled className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--ink-faint)]" />
          </label>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
              <Save size={14} /> {saving ? dict.saving : dict.saveChanges}
            </button>
            {saved && <span className="text-xs text-stamp-green">{dict.savedSuccess}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
