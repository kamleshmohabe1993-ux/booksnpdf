import { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { login, isLoggedIn } from '../../lib/authClient.js';
import { isValidEmail, isNonEmpty } from '../../lib/validators.js';
import GoogleSignInButton from './GoogleSignInButton.jsx';

export default function LoginForm({ dict, next = '/my-library' }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      window.location.href = next || '/my-library';
      return;
    }
    setCheckingSession(false);
  }, []);

  const errs = dict.errors || {};

  function validate(values) {
    const next = {};
    if (!isNonEmpty(values.email)) next.email = errs.required;
    else if (!isValidEmail(values.email)) next.email = errs.emailInvalid;

    if (!isNonEmpty(values.password)) next.password = errs.required;

    return next;
  }

  function update(field, value) {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (fieldErrors[field]) {
      setFieldErrors(validate(updated));
    }
  }

  function onBlur() {
    setFieldErrors((prev) => ({ ...prev, ...validate(form) }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    const validationErrors = validate(form);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      window.location.href = next || '/my-library';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex items-center gap-2 py-10 text-[var(--ink-faint)]">
        <Loader2 size={16} className="animate-spin" /> …
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-stamp-red/10 p-3 text-sm text-stamp-red">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
        {dict.email}
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!fieldErrors.email}
          className={`rounded-lg border bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] ${fieldErrors.email ? 'border-stamp-red' : 'border-[var(--border)]'}`}
        />
        {fieldErrors.email && <span className="text-xs font-normal text-stamp-red">{fieldErrors.email}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
        {dict.password}
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            onBlur={onBlur}
            aria-invalid={!!fieldErrors.password}
            className={`w-full rounded-lg border bg-[var(--bg)] px-3 py-2.5 pr-10 text-sm text-[var(--ink)] ${fieldErrors.password ? 'border-stamp-red' : 'border-[var(--border)]'}`}
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
        {fieldErrors.password && <span className="text-xs font-normal text-stamp-red">{fieldErrors.password}</span>}
      </label>

      <div className="text-right">
        <a href="/forgot-password" className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-dark)]">{dict.forgotPassword}</a>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {loading ? dict.loggingIn : dict.loginButton}
      </button>

      <p className="text-center text-sm text-[var(--ink-soft)]">
        {dict.noAccount} <a href="/register" className="font-medium text-[var(--accent)] hover:text-[var(--accent-dark)]">{dict.signUpLink}</a>
      </p>

      <div className="relative my-2 flex items-center">
        <div className="h-px flex-1 bg-[var(--border)]" />
        <span className="px-3 text-xs uppercase tracking-wide text-[var(--ink-faint)]">or</span>
        <div className="h-px flex-1 bg-[var(--border)]" />
      </div>

      {!checkingSession && <GoogleSignInButton next={next} onError={setError} />}
    </form>
  );
}
