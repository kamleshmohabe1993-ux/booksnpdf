import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Download, ArrowLeft } from 'lucide-react';
import { getPaymentStatus, triggerDownload, startFileDownload } from '../../lib/paymentClient.js';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute

export default function PaymentResult({ mode, orderId }) {
  const [status, setStatus] = useState('checking'); // checking | success | failed | pending | error
  const [data, setData] = useState(null);
  const [pollCount, setPollCount] = useState(0);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [redirectIn, setRedirectIn] = useState(4);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      return;
    }
    let cancelled = false;

    async function check() {
      try {
        const result = await getPaymentStatus(orderId);
        if (cancelled) return;
        setData(result);
        setConsecutiveErrors(0);

        if (result.status === 'SUCCESS') {
          setStatus('success');
        } else if (result.status === 'FAILED') {
          setStatus('failed');
        } else {
          setStatus('pending');
        }
      } catch (err) {
        if (cancelled) return;
        // A single transient failure (network blip, brief server hiccup)
        // shouldn't flash an error screen while we're mid-poll — only bail
        // out to the error state after a few in a row.
        setConsecutiveErrors((c) => {
          const next = c + 1;
          if (next >= 3) setStatus('error');
          return next;
        });
      }
    }

    check();

    const interval = setInterval(() => {
      setPollCount((c) => {
        const next = c + 1;
        if (next >= MAX_POLLS) {
          clearInterval(interval);
        } else {
          check();
        }
        return next;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId]);

  // If this is the raw PhonePe redirect landing page, keep polling silently
  // until we know the outcome — the person just sees one steady screen.
  const effectiveStatus = mode === 'callback' ? status : mode;

  async function onDownload() {
    if (!data?.downloadToken || downloading) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const result = await triggerDownload(data.downloadToken);
      startFileDownload(result.downloadUrl, result.filename);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (effectiveStatus !== 'success') return;
    if (redirectIn <= 0) {
      window.location.href = '/my-library';
      return;
    }
    const t = setTimeout(() => setRedirectIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [effectiveStatus, redirectIn]);

  if (effectiveStatus === 'checking' || effectiveStatus === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Confirming your payment…</h1>
        <p className="max-w-sm text-sm text-[var(--ink-soft)]">
          This usually takes a few seconds. Please don't close this page.
        </p>
        {pollCount >= MAX_POLLS && (
          <p className="max-w-sm text-xs text-[var(--ink-faint)]">
            Still waiting on confirmation — if this doesn't resolve, check My Library in a minute or contact support with order id {orderId}.
          </p>
        )}
      </div>
    );
  }

  if (effectiveStatus === 'success') {
    const item = data?.book || data?.course;
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <CheckCircle2 size={32} className="text-stamp-green" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Payment successful!</h1>
        {item?.title && <p className="text-sm text-[var(--ink-soft)]">{item.title}</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {data?.downloadToken && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? 'Preparing download…' : 'Download now'}
            </button>
          )}
          <a href="/my-library" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]">
            Go to My Library
          </a>
        </div>
        {downloadError && <p className="text-xs text-stamp-red">{downloadError}</p>}
        <p className="mt-1 text-xs text-[var(--ink-faint)]">Taking you to My Library in {redirectIn}s…</p>
      </div>
    );
  }

  if (effectiveStatus === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
        <XCircle size={32} className="text-stamp-red" />
        <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Payment failed</h1>
        <p className="max-w-sm text-sm text-[var(--ink-soft)]">
          Your payment didn't go through, and you haven't been charged for this attempt. You can try again.
        </p>
        <a href="/books" className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
          <ArrowLeft size={16} /> Back to books
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-ticket border border-[var(--border)] bg-[var(--card)] px-8 py-16 text-center">
      <XCircle size={32} className="text-stamp-red" />
      <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Something went wrong</h1>
      <p className="max-w-sm text-sm text-[var(--ink-soft)]">
        We couldn't confirm this payment. If money was deducted, it will be refunded automatically within a few days — or reach out to support with your order id.
      </p>
      <a href="/" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--bg-soft)]">
        <ArrowLeft size={16} /> Back home
      </a>
    </div>
  );
}
