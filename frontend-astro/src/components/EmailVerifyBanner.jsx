import { useEffect, useState } from 'react';
import { MailCheck, X, Loader2, CheckCircle2 } from 'lucide-react';
import { isLoggedIn, getCachedUser, getMe, sendEmailVerificationOtp, verifyEmailOtp } from '../lib/authClient.js';

// Dismissing the banner only hides it for the rest of this browser tab's
// session — it reappears next visit until the address is actually verified,
// so it can't be permanently ignored by accident.
const DISMISS_KEY = 'email_verify_banner_dismissed';

export default function EmailVerifyBanner() {
  const [user, setUser] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    setUser(getCachedUser());
    getMe().then(setUser).catch(() => {});
  }, []);

  if (!user || user.isVerified || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function handleSend() {
    setError('');
    setSending(true);
    try {
      const res = await sendEmailVerificationOtp(user.email);
      if (res.alreadyVerified) {
        setDone(true);
      } else {
        setSent(true);
        setOpen(true);
      }
    } catch (err) {
      setError(err.message);
      setOpen(true);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      await verifyEmailOtp({ email: user.email, otp });
      setDone(true);
      const updated = { ...user, isVerified: true };
      localStorage.setItem('user', JSON.stringify(updated));
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  if (done) {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-4 py-2 text-sm sm:px-6 lg:px-8">
          <CheckCircle2 size={15} /> Email verified — thanks!
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <MailCheck size={16} className="shrink-0" />
              Please confirm your email address ({user.email}) to secure your account.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950"
              >
                {sending ? <Loader2 size={12} className="inline animate-spin" /> : 'Verify now'}
              </button>
              <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-amber-700 hover:text-amber-900 dark:text-amber-300">
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-wrap items-center gap-2 py-0.5">
            <span className="flex items-center gap-2 text-sm">
              <MailCheck size={16} className="shrink-0" />
              {sent ? `Enter the OTP we sent to ${user.email}:` : 'Enter the verification OTP:'}
            </span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-28 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm tracking-widest text-amber-950"
            />
            <button type="submit" disabled={verifying || otp.length !== 6} className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60 dark:bg-amber-200 dark:text-amber-950">
              {verifying ? <Loader2 size={12} className="inline animate-spin" /> : 'Confirm'}
            </button>
            <button type="button" onClick={handleSend} disabled={sending} className="text-xs font-medium underline underline-offset-2 disabled:opacity-60">
              Resend OTP
            </button>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="ml-auto text-amber-700 hover:text-amber-900 dark:text-amber-300">
              <X size={16} />
            </button>
          </form>
        )}
        {error && <p className="pb-1.5 text-xs text-stamp-red">{error}</p>}
      </div>
    </div>
  );
}
