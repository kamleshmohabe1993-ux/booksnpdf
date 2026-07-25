import { useEffect, useState } from 'react';
import { Download, ShoppingCart, Loader2, LogIn, CheckCircle2 } from 'lucide-react';
import { isLoggedIn, getMyPurchases } from '../../lib/authClient.js';
import { downloadFreeBook, downloadFreeCourse, triggerDownload, startFileDownload } from '../../lib/paymentClient.js';

export default function PurchaseButton({ itemId, itemType = 'book', isPaid, price, labels = {} }) {
  const [state, setState] = useState('checking'); // checking | anon | notOwned | owned | working
  const [downloadToken, setDownloadToken] = useState(null);
  const [error, setError] = useState('');

  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';

  useEffect(() => {
    if (!isLoggedIn()) {
      setState('anon');
      return;
    }
    getMyPurchases()
      .then((purchases) => {
        const match = (purchases || []).find((p) => {
          const owns = itemType === 'course' ? p.courseId?._id === itemId : p.bookId?._id === itemId;
          return owns && (p.status === 'SUCCESS' || p.paymentState === 'COMPLETED');
        });
        if (match) {
          setDownloadToken(match.downloadToken);
          setState('owned');
        } else {
          setState('notOwned');
        }
      })
      .catch(() => setState('notOwned'));
  }, [itemId, itemType]);

  async function onBuyOrDownload() {
    setError('');
    if (isPaid) {
      window.location.href = `/checkout?type=${itemType}&id=${itemId}`;
      return;
    }
    setState('working');
    try {
      const download = itemType === 'course' ? await downloadFreeCourse(itemId) : await downloadFreeBook(itemId);
      setDownloadToken(download.downloadToken);
      startFileDownload(download.downloadUrl, download.filename);
      setState('owned');
    } catch (err) {
      setError(err.message);
      setState('notOwned');
    }
  }

  async function onDownloadAgain() {
    if (!downloadToken) return;
    setError('');
    setState('working');
    try {
      const result = await triggerDownload(downloadToken);
      startFileDownload(result.downloadUrl, result.filename);
      setState('owned');
    } catch (err) {
      setError(err.message);
      setState('owned');
    }
  }

  if (state === 'checking') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-soft)] px-6 py-3 text-sm font-medium text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> {labels.checking || 'Checking…'}
      </span>
    );
  }

  if (state === 'anon') {
    return (
      <a
        href={`/login?next=${encodeURIComponent(currentPath)}`}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--accent-dark)]"
      >
        <LogIn size={16} /> {isPaid ? (labels.loginToBuy || 'Log in to buy') : (labels.loginToDownload || 'Log in to download')}
      </a>
    );
  }

  if (state === 'owned') {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onDownloadAgain}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--accent-dark)]"
        >
          <Download size={16} /> {labels.download || 'Download'}
        </button>
        <span className="inline-flex items-center gap-1 text-xs text-stamp-green"><CheckCircle2 size={13} /> {labels.owned || "You've got this one"}</span>
        {error && <span className="text-xs text-stamp-red">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onBuyOrDownload}
        disabled={state === 'working'}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {state === 'working' ? <Loader2 size={16} className="animate-spin" /> : isPaid ? <ShoppingCart size={16} /> : <Download size={16} />}
        {state === 'working' ? (labels.processing || 'Please wait…') : isPaid ? (labels.buyNow || `Buy now — ₹${price}`) : (labels.downloadNow || 'Download')}
      </button>
      {error && <span className="text-xs text-stamp-red">{error}</span>}
    </div>
  );
}
