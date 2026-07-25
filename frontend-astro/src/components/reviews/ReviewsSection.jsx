import { useEffect, useState } from 'react';
import { Star, Loader2, LogIn, Trash2 } from 'lucide-react';
import { isLoggedIn, getCachedUser } from '../../lib/authClient.js';
import { getBookRatings, getMyRating, submitRating, deleteRating } from '../../lib/ratingsClient.js';

function Stars({ value, size = 16, onPick }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick && onPick(n)}
          className={onPick ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`${n} star`}
        >
          <Star size={size} className={n <= value ? 'fill-marigold text-marigold' : 'text-[var(--ink-faint)]'} />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsSection({ bookId }) {
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [myRating, setMyRating] = useState(null);
  const [draft, setDraft] = useState({ rating: 0, review: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const loggedIn = isLoggedIn();
  const user = getCachedUser();

  useEffect(() => { load(); }, [bookId]);

  function load() {
    setLoading(true);
    const tasks = [getBookRatings(bookId)];
    if (loggedIn) tasks.push(getMyRating(bookId).catch(() => null));

    Promise.all(tasks)
      .then(([list, mine]) => {
        setRatings(list.ratings || []);
        setPagination(list.pagination);
        if (mine) {
          setMyRating(mine);
          setDraft({ rating: mine.rating, review: mine.review || '' });
        }
      })
      .finally(() => setLoading(false));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!draft.rating) {
      setError('Pick a star rating first.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await submitRating({ bookId, rating: draft.rating, review: draft.review.trim() });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!myRating || !window.confirm('Remove your review?')) return;
    try {
      await deleteRating(myRating._id);
      setMyRating(null);
      setDraft({ rating: 0, review: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const otherRatings = ratings.filter((r) => !user || r.user?._id !== user._id);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Reviews</h2>

      {loggedIn ? (
        <form onSubmit={onSubmit} className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="mb-2 text-sm font-medium text-[var(--ink)]">{myRating ? 'Your review' : 'Leave a review'}</p>
          <Stars value={draft.rating} size={22} onPick={(n) => setDraft((d) => ({ ...d, rating: n }))} />
          <textarea
            rows={3}
            value={draft.review}
            onChange={(e) => setDraft((d) => ({ ...d, review: e.target.value }))}
            placeholder="What did you think? (optional)"
            className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]"
          />
          {error && <p className="mt-2 text-xs text-stamp-red">{error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
              {submitting && <Loader2 size={14} className="animate-spin" />} {myRating ? 'Update review' : 'Submit review'}
            </button>
            {myRating && (
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-sm text-stamp-red hover:underline">
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--ink-soft)]">
          <LogIn size={16} className="text-[var(--accent)]" />
          <span>Want to leave a review? <a href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`} className="font-medium text-[var(--accent)] hover:underline">Log in</a> first.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[var(--ink-faint)]"><Loader2 size={16} className="animate-spin" /> Loading reviews…</div>
      ) : otherRatings.length === 0 ? (
        <p className="text-sm text-[var(--ink-faint)]">No reviews yet — be the first!</p>
      ) : (
        <div className="space-y-4">
          {otherRatings.map((r) => (
            <div key={r._id} className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--ink)]">{r.user?.fullName || 'Reader'}</p>
                <Stars value={r.rating} size={14} />
              </div>
              {r.review && <p className="mt-2 text-sm text-[var(--ink-soft)]">{r.review}</p>}
              <p className="mt-2 text-xs text-[var(--ink-faint)]">{new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <p className="text-center text-xs text-[var(--ink-faint)]">Showing page {pagination.page} of {pagination.pages}</p>
      )}
    </div>
  );
}
