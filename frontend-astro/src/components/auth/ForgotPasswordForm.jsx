import { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { forgotPassword, verifyResetOtp, resendOtp, resetPassword } from '../../lib/authClient.js';
import { isValidEmail, isValidOtp, isValidPassword, isNonEmpty } from '../../lib/validators.js';

export default function ForgotPasswordForm({ dict }) {
  const [step, setStep] = useState('request'); // request -> verify -> reset -> done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const errs = dict.errors || {};
  const fieldClass = (name) => `rounded-lg border bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] ${fieldErrors[name] ? 'border-stamp-red' : 'border-[var(--border)]'}`;

  async function requestOtp(e) {
    e.preventDefault();
    setError('');

    if (!isNonEmpty(email)) {
      setFieldErrors({ email: errs.required });
      return;
    }
    if (!isValidEmail(email)) {
      setFieldErrors({ email: errs.emailInvalid });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep('verify');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function doVerify(e) {
    e.preventDefault();
    setError('');

    if (!isNonEmpty(otp)) {
      setFieldErrors({ otp: errs.required });
      return;
    }
    if (!isValidOtp(otp)) {
      setFieldErrors({ otp: errs.otpInvalid });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await verifyResetOtp({ email, otp });
      setResetToken(res?.data?.resetToken || res?.resetToken || '');
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function doResend() {
    setError('');
    try {
      await resendOtp({ email });
    } catch (err) {
      setError(err.message);
    }
  }

  async function doReset(e) {
    e.preventDefault();
    setError('');

    if (!isNonEmpty(newPassword)) {
      setFieldErrors({ newPassword: errs.required });
      return;
    }
    if (!isValidPassword(newPassword)) {
      setFieldErrors({ newPassword: errs.passwordTooShort });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await resetPassword({ email, otp, resetToken, newPassword });
      setStep('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-stamp-red/10 p-3 text-sm text-stamp-red">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={requestOtp} noValidate className="space-y-4">
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
            {dict.email}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              className={fieldClass('email')}
            />
            {fieldErrors.email && <span className="text-xs font-normal text-stamp-red">{fieldErrors.email}</span>}
          </label>
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
            {loading ? dict.sendingOtp : dict.sendOtp}
          </button>
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={doVerify} noValidate className="space-y-4">
          <p className="text-sm text-[var(--ink-soft)]">{dict.otpSentTo.replace('{email}', email)}</p>
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
            {dict.enterOtp}
            <input
              inputMode="numeric"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={!!fieldErrors.otp}
              className={`${fieldClass('otp')} tracking-widest`}
            />
            {fieldErrors.otp && <span className="text-xs font-normal text-stamp-red">{fieldErrors.otp}</span>}
          </label>
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
            {loading ? dict.verifying : dict.verifyOtp}
          </button>
          <button type="button" onClick={doResend} className="w-full text-center text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-dark)]">
            {dict.resendOtp}
          </button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={doReset} noValidate className="space-y-4">
          <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
            {dict.newPassword}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-invalid={!!fieldErrors.newPassword}
                className={`w-full pr-10 ${fieldClass('newPassword')}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.newPassword && <span className="text-xs font-normal text-stamp-red">{fieldErrors.newPassword}</span>}
          </label>
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
            {loading ? dict.resetting : dict.resetButton}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={32} className="text-stamp-green" />
          <p className="text-sm text-[var(--ink-soft)]">{dict.resetSuccess}</p>
          <a href="/login" className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
            {dict.backToLogin}
          </a>
        </div>
      )}
    </div>
  );
}
