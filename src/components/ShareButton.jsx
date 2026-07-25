import { useEffect, useRef, useState } from 'react';
import { Share2, Link2, Check, MessageCircle, Send, Facebook, Twitter, Mail } from 'lucide-react';

/**
 * Generic share button used on book/course cards and detail pages.
 *
 * - On browsers/devices that support the Web Share API, tapping it opens
 *   the native share sheet. Where the browser also supports sharing files
 *   (navigator.canShare({ files })), we best-effort attach the cover image
 *   itself so apps that accept image attachments (e.g. sharing straight to
 *   a chat) get the thumbnail directly — this is optional and silently
 *   falls back to a link-only share if the image can't be fetched/shared.
 * - On everything else (most desktop browsers), it opens a small popover
 *   with "Copy link" plus WhatsApp / Telegram / Twitter / Facebook / Email
 *   share links. Every one of these — including the plain copied link —
 *   shows the cover thumbnail automatically as a link preview, because the
 *   page itself sets `og:image` to the book/course cover (see BaseLayout).
 */
export default function ShareButton({ title, text, url, imageUrl, size = 'md', variant = 'full', className = '' }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function shareViaNative() {
    const payload = { title, text, url };
    try {
      // Best-effort: attach the cover image itself when the platform
      // supports sharing files. Never lets an image-fetch failure block
      // the (already perfectly fine) link-only share.
      if (imageUrl && navigator.canShare) {
        try {
          const res = await fetch(imageUrl);
          const blob = await res.blob();
          const file = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            payload.files = [file];
          }
        } catch {
          // Ignore — share without the file attachment.
        }
      }
      await navigator.share(payload);
      return true;
    } catch (err) {
      // AbortError = user cancelled the native sheet — treat as handled.
      return err?.name === 'AbortError';
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — nothing more we can do here.
    }
  }

  async function handleShare(e) {
    e.preventDefault();
    e.stopPropagation();

    if (canNativeShare) {
      const handled = await shareViaNative();
      if (!handled && variant === 'full') setOpen(true);
      else if (!handled) await copyLink();
      return;
    }

    // No native share sheet on this browser/device.
    if (variant === 'compact') {
      await copyLink();
    } else {
      setOpen((o) => !o);
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text || title || '');

  const socialLinks = [
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
    { key: 'telegram', label: 'Telegram', icon: Send, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { key: 'twitter', label: 'Twitter / X', icon: Twitter, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
    { key: 'facebook', label: 'Facebook', icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { key: 'email', label: 'Email', icon: Mail, href: `mailto:?subject=${encodeURIComponent(title || '')}&body=${encodedText}%20${encodedUrl}` },
  ];

  const iconSize = size === 'sm' ? 14 : 16;
  const btnPad = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        onClick={handleShare}
        aria-label="Share"
        title="Share"
        className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] ${btnPad} text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors`}
      >
        {variant === 'compact' && copied ? <Check size={iconSize} className="text-stamp-green" /> : <Share2 size={iconSize} />}
        {size === 'lg' && <span className="text-sm font-medium">Share</span>}
      </button>

      {open && variant === 'full' && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-ticket border border-[var(--border)] bg-[var(--card)] shadow-ticket"
        >
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--bg-soft)]"
          >
            {copied ? <Check size={15} className="text-stamp-green" /> : <Link2 size={15} />}
            {copied ? 'Link copied!' : 'Copy link'}
          </button>
          <div className="border-t border-[var(--border)]" />
          {socialLinks.map(({ key, label, icon: Icon, href }) => (
            <button
              key={key}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(href, '_blank', 'noopener,noreferrer');
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--bg-soft)]"
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
