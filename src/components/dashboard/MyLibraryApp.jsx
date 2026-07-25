import { useEffect, useState } from 'react';
import { LogIn, Download, Loader2, Library, Save, Wallet, Package, Undo2, Star, BookOpen, Sparkles, AlertCircle } from 'lucide-react';
import { getMe, getMyPurchases, updateProfile, isLoggedIn } from '../../lib/authClient.js';
import { normalizePurchase } from '../../lib/normalizePurchase.js';
import { requestRefund, triggerDownload, startFileDownload } from '../../lib/paymentClient.js';
import { getBooks } from '../../lib/api.js';

export default function MyLibraryApp({ dict, dashboardDict }) {
  const [state, setState] = useState('loading');
  const [user, setUser] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [form, setForm] = useState({ fullName: '', mobileNumber: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refundingId, setRefundingId] = useState(null);
  const [refundError, setRefundError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadErrors, setDownloadErrors] = useState({});
  const [suggested, setSuggested] = useState([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setState('anon');
      return;
    }
    Promise.all([getMe(), getMyPurchases().catch(() => [])])
      .then(([me, purchaseList]) => {
        setUser(me);
        setForm({ fullName: me.fullName || '', mobileNumber: me.mobileNumber || '' });
        const normalized = (purchaseList || []).map(normalizePurchase);
        setPurchases(normalized);
        setState('ready');

        // Load a handful of popular books for "You might also like",
        // filtering out anything already owned.
        const ownedIds = new Set(normalized.map((p) => p.itemId).filter(Boolean));
        getBooks({ sort: 'popular', limit: 12 })
          .then(({ books }) => {
            setSuggested((books || []).filter((b) => !ownedIds.has(b._id)).slice(0, 4));
          })
          .catch(() => setSuggested([]))
          .finally(() => setSuggestedLoading(false));
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

  async function onDownloadAgain(purchase) {
    if (!purchase.downloadToken || downloadingId) return;
    setDownloadErrors((prev) => ({ ...prev, [purchase.id]: '' }));
    setDownloadingId(purchase.id);
    try {
      const result = await triggerDownload(purchase.downloadToken);
      startFileDownload(result.downloadUrl, result.filename);
    } catch (err) {
      setDownloadErrors((prev) => ({ ...prev, [purchase.id]: err.message }));
    } finally {
      setDownloadingId(null);
    }
  }

  async function onRequestRefund(purchase) {
    const reason = window.prompt('Tell us briefly why you\'d like a refund (optional):', '');
    if (reason === null) return; // cancelled
    setRefundError('');
    setRefundingId(purchase.id);
    try {
      await requestRefund(purchase.id, reason);
      setPurchases((prev) => prev.map((p) => (p.id === purchase.id ? { ...p, refundRequested: true } : p)));
    } catch (err) {
      setRefundError(err.message);
    } finally {
      setRefundingId(null);
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
          {state === 'error' ? dashboardDict.loadError : dashboardDict.requireLoginTitle}
        </h2>
        {state === 'anon' && <p className="max-w-sm text-sm text-[var(--ink-soft)]">{dashboardDict.requireLoginBody}</p>}
        <a href="/login?next=/my-library" className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
          {dashboardDict.goToLogin}
        </a>
      </div>
    );
  }

  const totalSpent = purchases.reduce((sum, p) => sum + (p.status === 'SUCCESS' || p.status === 'COMPLETED' ? p.price : 0), 0);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <Package size={20} className="text-[var(--accent)]" />
          <div>
            <p className="font-display text-xl font-semibold text-[var(--ink)]">{purchases.length}</p>
            <p className="text-xs text-[var(--ink-faint)]">{dashboardDict.totalPurchases}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <Wallet size={20} className="text-[var(--accent)]" />
          <div>
            <p className="font-display text-xl font-semibold text-[var(--ink)]">₹{totalSpent}</p>
            <p className="text-xs text-[var(--ink-faint)]">{dashboardDict.totalSpent}</p>
          </div>
        </div>
      </div>

      <section>
        {purchases.length === 0 ? (
          <div className="rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
            <Library size={28} className="mx-auto mb-3 text-[var(--ink-faint)]" />
            <p className="font-medium text-[var(--ink)]">{dict.empty}</p>
            <p className="mt-1 max-w-sm mx-auto text-sm text-[var(--ink-soft)]">{dict.emptyBody}</p>
            <a href="/books" className="mt-4 inline-flex rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
              {dashboardDict.browseBooks}
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {purchases.map((p) => (
              <div key={p.id} className="flex flex-col rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-[var(--ink)] line-clamp-2">{p.title}</h3>
                  <span className="shrink-0 rounded-full bg-stamp-green/10 px-2 py-0.5 font-ticket text-[10px] uppercase text-stamp-green">
                    {dict.status[p.status] || p.status}
                  </span>
                </div>
                {p.author && <p className="mt-1 text-xs text-[var(--ink-faint)]">{p.author}</p>}
                {p.purchasedAt && (
                  <p className="mt-2 text-xs text-[var(--ink-faint)]">
                    {dict.purchasedOn.replace('{date}', new Date(p.purchasedAt).toLocaleDateString())}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onDownloadAgain(p)}
                  disabled={!p.downloadToken || downloadingId === p.id}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] mt-4 disabled:opacity-60"
                >
                  {downloadingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {dict.downloadAgain}
                </button>
                {downloadErrors[p.id] && (
                  <p className="mt-1.5 flex items-start gap-1 text-xs text-stamp-red">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" /> {downloadErrors[p.id]}
                  </p>
                )}
                {p.price > 0 && p.status === 'SUCCESS' && (
                  p.refundRequested ? (
                    <p className="mt-2 text-center text-xs text-[var(--ink-faint)]">Refund requested — we'll be in touch</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequestRefund(p)}
                      disabled={refundingId === p.id}
                      className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] disabled:opacity-50"
                    >
                      {refundingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Request refund
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{dashboardDict.accountDetails}</h2>
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
              <Save size={14} /> {saving ? dashboardDict.saving : dashboardDict.saveChanges}
            </button>
            {saved && <span className="text-xs text-stamp-green">{dashboardDict.savedSuccess}</span>}
          </div>
        </form>
      </section>

      {(suggestedLoading || suggested.length > 0) && (
        <section>
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--accent)]" />
            <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{dict.suggestedTitle}</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{dict.suggestedSubtitle}</p>

          {suggestedLoading ? (
            <div className="mt-4 flex items-center gap-2 py-6 text-[var(--ink-faint)]">
              <Loader2 size={16} className="animate-spin" /> …
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {suggested.map((b) => {
                const isFree = !b.price || Number(b.price) === 0;
                return (
                  <a
                    key={b._id}
                    href={`/books/${b.slug || b._id}`}
                    className="group flex flex-col overflow-hidden rounded-ticket border border-[var(--border)] bg-[var(--bg-soft)] p-4 transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--card)] text-[var(--ink-faint)]">
                        {b.thumbnail?.data ? (
                          <img src={b.thumbnail.data} alt={b.title} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <BookOpen size={18} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold leading-snug text-[var(--ink)] line-clamp-2 group-hover:text-[var(--accent)]">
                          {b.title}
                        </h3>
                        {b.author && <p className="mt-0.5 truncate text-xs text-[var(--ink-faint)]">{b.author}</p>}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-3 mt-3 text-xs">
                      <span className="flex items-center gap-1 text-[var(--ink-faint)]">
                        <Star size={12} className="fill-marigold text-marigold" />
                        {b.rating ?? '—'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-ticket text-[10px] uppercase ${isFree ? 'bg-stamp-green/10 text-stamp-green' : 'bg-marigold/10 text-marigold-dark'}`}>
                        {isFree ? 'Free' : `₹${b.price}`}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
