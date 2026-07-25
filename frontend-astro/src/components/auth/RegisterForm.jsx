import { useEffect, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { register, isLoggedIn } from '../../lib/authClient.js';
import { isValidEmail, isValidMobile, isValidPassword, isNonEmpty } from '../../lib/validators.js';
import GoogleSignInButton from './GoogleSignInButton.jsx';

export default function RegisterForm({ dict, next = '/my-library' }) {
  const [form, setForm] = useState({ fullName: '', email: '', mobileNumber: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    if (!isNonEmpty(values.fullName) || values.fullName.trim().length < 2) next.fullName = errs.fullNameTooShort;

    if (!isNonEmpty(values.email)) next.email = errs.required;
    else if (!isValidEmail(values.email)) next.email = errs.emailInvalid;

    if (!isNonEmpty(values.mobileNumber)) next.mobileNumber = errs.required;
    else if (!isValidMobile(values.mobileNumber)) next.mobileNumber = errs.mobileInvalid;

    if (!isNonEmpty(values.password)) next.password = errs.required;
    else if (!isValidPassword(values.password)) next.password = errs.passwordTooShort;

    if (!isNonEmpty(values.confirmPassword)) next.confirmPassword = errs.required;
    else if (values.confirmPassword !== values.password) next.confirmPassword = errs.passwordMismatch;

    return next;
  }

  function update(field, value) {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (fieldErrors[field] || (field === 'password' && fieldErrors.confirmPassword)) {
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
      await register({ ...form, fullName: form.fullName.trim(), email: form.email.trim(), mobileNumber: form.mobileNumber.trim() });
      window.location.href = next || '/my-library';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function fieldClass(name) {
    return `rounded-lg border bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] ${fieldErrors[name] ? 'border-stamp-red' : 'border-[var(--border)]'}`;
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
        {dict.fullName}
        <input
          required
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!fieldErrors.fullName}
          className={fieldClass('fullName')}
        />
        {fieldErrors.fullName && <span className="text-xs font-normal text-stamp-red">{fieldErrors.fullName}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
        {dict.email}
        <input
          type="email"
          required
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!fieldErrors.email}
          className={fieldClass('email')}
        />
        {fieldErrors.email && <span className="text-xs font-normal text-stamp-red">{fieldErrors.email}</span>}
      </label>

      <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
        {dict.mobileNumber}
        <input
          type="tel"
          inputMode="numeric"
          maxLength={10}
          required
          value={form.mobileNumber}
          onChange={(e) => update('mobileNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
          onBlur={onBlur}
          aria-invalid={!!fieldErrors.mobileNumber}
          className={fieldClass('mobileNumber')}
        />
        {fieldErrors.mobileNumber && <span className="text-xs font-normal text-stamp-red">{fieldErrors.mobileNumber}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
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
              className={`w-full pr-9 ${fieldClass('password')}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {fieldErrors.password && <span className="text-xs font-normal text-stamp-red">{fieldErrors.password}</span>}
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
          {dict.confirmPassword}
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              required
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              onBlur={onBlur}
              aria-invalid={!!fieldErrors.confirmPassword}
              className={`w-full pr-9 ${fieldClass('confirmPassword')}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            >
              {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {fieldErrors.confirmPassword && <span className="text-xs font-normal text-stamp-red">{fieldErrors.confirmPassword}</span>}
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {loading ? dict.creatingAccount : dict.registerButton}
      </button>

      <p className="text-center text-sm text-[var(--ink-soft)]">
        {dict.haveAccount} <a href="/login" className="font-medium text-[var(--accent)] hover:text-[var(--accent-dark)]">{dict.logInLink}</a>
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
