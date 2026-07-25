import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { loginWithGoogle } from '../../lib/authClient.js';

const GOOGLE_CLIENT_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;

let scriptLoadingPromise = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-identity-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

/**
 * Renders Google's "Sign in with Google" button. Shared by the login and
 * register pages so the setup/behavior can't drift between the two.
 *
 * Requires PUBLIC_GOOGLE_CLIENT_ID (frontend .env) to match GOOGLE_CLIENT_ID
 * (backend .env), and requires the deployed domain to be added under
 * "Authorized JavaScript origins" for that OAuth Client ID in the Google
 * Cloud Console — Google will otherwise reject the button/token silently
 * (check the browser console for an "origin not allowed" style error).
 */
export default function GoogleSignInButton({ next = '/my-library', onError, disabled = false }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) return;
    let cancelled = false;

    async function handleCredentialResponse(response) {
      onError?.('');
      setLoading(true);
      try {
        await loginWithGoogle(response.credential);
        window.location.href = next || '/my-library';
      } catch (err) {
        onError?.(err.message);
        setLoading(false);
      }
    }

    function render() {
      if (cancelled || !window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });
      containerRef.current.innerHTML = '';
      const width = Math.min(containerRef.current.offsetWidth || 320, 400);
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width,
        text: 'signin_with',
      });
      setReady(true);
    }

    loadGoogleScript().then(render).catch(() => onError?.('Could not load Google Sign-In right now.'));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  if (!GOOGLE_CLIENT_ID) {
    // Visible in every environment (not just dev) on purpose: a silently
    // missing button is much harder to debug than a clear "not configured
    // yet" message pointing at the exact env var to set.
    return (
      <p className="text-center text-xs text-[var(--ink-faint)]">
        Sign in with Google isn't configured yet — set <code className="rounded bg-[var(--bg-soft)] px-1 py-0.5">PUBLIC_GOOGLE_CLIENT_ID</code> in the frontend's <code className="rounded bg-[var(--bg-soft)] px-1 py-0.5">.env</code> file.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--ink-faint)]">
          <Loader2 size={14} className="animate-spin" /> Signing in with Google…
        </div>
      )}
      <div
        ref={containerRef}
        className={`flex w-full justify-center ${loading ? 'pointer-events-none opacity-50' : ''}`}
      />
      {!ready && !loading && (
        <div className="h-10 w-full max-w-[320px] animate-pulse rounded-full bg-[var(--bg-soft)]" aria-hidden="true" />
      )}
    </div>
  );
}
