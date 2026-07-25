import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { isLoggedIn, getMyPurchases } from '../../lib/authClient.js';
import { getBookBySlug, getCourseBySlug } from '../../lib/api.js';
import { initiateBookPayment, initiateCoursePayment } from '../../lib/paymentClient.js';

const UPI_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export default function CheckoutConfirm({ itemId, itemType }) {
  const [state, setState] = useState('loading'); // loading | anon | owned | ready | error
  const [item, setItem] = useState(null);
  const [upiId, setUpiId] = useState('');
  const [upiError, setUpiError] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      setState('anon');
      return;
    }

    const fetchItem = itemType === 'course' ? getCourseBySlug(itemId) : getBookBySlug(itemId);

    Promise.all([fetchItem, getMyPurchases().catch(() => [])])
      .then(([fetchedItem, purchases]) => {
        if (!fetchedItem) {
          setState('error');
          return;
        }
        setItem(fetchedItem);

        const alreadyOwned = (purchases || []).some((p) => {
          const owns = itemType === 'course' ? p.courseId?._id === itemId : p.bookId?._id === itemId;
          return owns && (p.status === 'SUCCESS' || p.paymentState === 'COMPLETED');
        });

        setState(alreadyOwned ? 'owned' : 'ready');
      })
      .catch(() => setState('error'));
  }, [itemId, itemType]);

  async function onPay() {
    setPayError('');

    if (upiId && !UPI_RE.test(upiId.trim())) {
      setUpiError('That doesn\'t look like a valid UPI ID (e.g. yourname@bank).');
      return;
    }
    setUpiError('');
    setPaying(true);

    try {
      const payment = itemType === 'course'
        ? await initiateCoursePayment(itemId, upiId.trim() || undefined)
        : await initiateBookPayment(itemId, upiId.trim() || undefined);
      window.location.href = payment.paymentUrl;
    } catch (err) {
      setPayError(err.message);
      setPaying(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-[var(--ink-faint)]">
        <Loader2 size={20} className="animate-spin" /> Loading order details…
      </div>
    );
  }

  if (state === 'anon') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
        <LogIn size={28} className="text-[var(--accent)]" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Log in to continue</h1>
        <a
          href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/')}`}
          className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]"
        >
          Log in
        </a>
      </div>
    );
  }

  if (state === 'error' || !item) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
        <AlertCircle size={28} className="text-stamp-red" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Couldn't load this item</h1>
        <a href="/books" className="rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]">Back to books</a>
      </div>
    );
  }

  if (state === 'owned') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
        <CheckCircle2 size={28} className="text-stamp-green" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">You already own this</h1>
        <a href="/my-library" className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">Go to My Library</a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">Confirm your purchase</h1>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">Review your order before you're taken to PhonePe to pay.</p>

      <div className="mt-6 flex gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--bg-soft)] font-display text-2xl text-[var(--ink-faint)]">
          {item.thumbnail?.data ? (
            <img src={item.thumbnail.data} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            item.title.charAt(0)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-[var(--ink)] sm:text-lg">{item.title}</p>
          {item.author && <p className="text-sm text-[var(--ink-faint)]">{item.author}</p>}
          <p className="mt-2 font-display text-xl font-semibold text-[var(--accent)]">₹{item.price}</p>
        </div>
      </div>

      <div className="mt-6 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
          UPI ID <span className="normal-case text-[var(--ink-faint)]">(optional — PhonePe's QR/UPI page can be slow to load in sandbox; enter yours here to speed it up)</span>
          <input
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourname@upi"
            className={`rounded-lg border bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] ${upiError ? 'border-stamp-red' : 'border-[var(--border)]'}`}
          />
          {upiError && <span className="text-xs font-normal text-stamp-red">{upiError}</span>}
        </label>
      </div>

      {payError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-stamp-red/10 p-3 text-sm text-stamp-red">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{payError}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={paying}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {paying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
        {paying ? 'Redirecting to PhonePe…' : `Pay ₹${item.price} with PhonePe`}
      </button>

      <p className="mt-3 text-center text-xs text-[var(--ink-faint)]">You'll be redirected to PhonePe's secure checkout to complete payment.</p>
    </div>
  );
}
