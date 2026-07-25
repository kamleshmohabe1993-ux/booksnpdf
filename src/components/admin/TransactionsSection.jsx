import { useEffect, useState } from 'react';
import { Loader2, Search, Download, Trash2, RotateCcw, Receipt, AlertTriangle } from 'lucide-react';
import { adminListTransactions, adminUpdateTransactionStatus, adminDeleteTransaction, adminInitiateRefund, adminExportTransactions } from '../../lib/adminClient.js';

const STATUS_OPTIONS = ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];
const STATUS_STYLES = {
  SUCCESS: 'bg-stamp-green/15 text-stamp-green',
  PENDING: 'bg-amber-500/15 text-amber-600',
  INITIATED: 'bg-amber-500/15 text-amber-600',
  FAILED: 'bg-stamp-red/15 text-stamp-red',
  REFUNDED: 'bg-[var(--bg-soft)] text-[var(--ink-faint)]',
};

const rupees = (paise) => `₹${((paise || 0) / 100).toLocaleString('en-IN')}`;

export default function TransactionsSection() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [refundOnly, setRefundOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { load(); }, [status]);

  function load() {
    setLoading(true);
    setError('');
    adminListTransactions({ status, search: search || undefined })
      .then((res) => {
        setRows(res.data);
        setStats(res.stats);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function onSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  async function onStatusChange(txn, newStatus) {
    if (newStatus === txn.status) return;
    setBusyId(txn._id);
    try {
      await adminUpdateTransactionStatus(txn._id, newStatus);
      setRows((prev) => prev.map((r) => (r._id === txn._id ? { ...r, status: newStatus } : r)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onRefund(txn) {
    if (!window.confirm(`Refund ${rupees(txn.amount)} to ${txn.userId?.fullName || 'this user'}?`)) return;
    const reason = window.prompt('Refund reason (optional):', 'Customer requested refund') || undefined;
    setBusyId(txn._id);
    try {
      await adminInitiateRefund(txn.merchantOrderId, reason);
      setRows((prev) => prev.map((r) => (r._id === txn._id ? { ...r, status: 'REFUNDED', refundRequested: false } : r)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(txn) {
    const isProtected = txn.status === 'SUCCESS' || txn.status === 'REFUNDED';
    if (!window.confirm(isProtected
      ? `This transaction is ${txn.status}. Force-delete it anyway? This can't be undone.`
      : `Delete this ${txn.status} transaction? This can't be undone.`)) return;
    setBusyId(txn._id);
    try {
      await adminDeleteTransaction(txn._id, isProtected);
      setRows((prev) => prev.filter((r) => r._id !== txn._id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      await adminExportTransactions({ status });
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  const filtered = rows
    .filter((r) => !refundOnly || r.refundRequested)
    .filter((r) =>
      !search.trim() ||
      (r.merchantOrderId || '').toLowerCase().includes(search.trim().toLowerCase()) ||
      (r.userId?.email || '').toLowerCase().includes(search.trim().toLowerCase()) ||
      (r.bookId?.title || r.courseId?.title || '').toLowerCase().includes(search.trim().toLowerCase())
    );

  const refundRequestCount = rows.filter((r) => r.refundRequested).length;

  const statCards = stats ? [
    { label: 'Total', value: stats.total },
    { label: 'Success', value: stats.completed },
    { label: 'Pending', value: stats.pending },
    { label: 'Failed', value: stats.failed },
    { label: 'Refunded', value: stats.refunded },
    { label: 'Revenue', value: rupees(stats.totalRevenue) },
  ] : [];

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="font-display text-lg font-semibold text-[var(--ink)]">{c.value}</p>
              <p className="text-xs text-[var(--ink-faint)]">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={onSearchSubmit} className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order id, email, book…" className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-3 text-sm text-[var(--ink)]" />
        </form>

        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--ink)]">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <button
          type="button"
          onClick={() => setRefundOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${refundOnly ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]'}`}
        >
          <AlertTriangle size={14} /> Refund requests{refundRequestCount > 0 ? ` (${refundRequestCount})` : ''}
        </button>

        <button type="button" onClick={onExport} disabled={exporting} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] disabled:opacity-60">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
        </button>
      </div>

      {error && <p className="text-sm text-stamp-red">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[var(--ink-faint)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--ink-soft)]">
          <Receipt size={22} className="mx-auto mb-2 text-[var(--ink-faint)]" /> No transactions match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ticket border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-faint)]">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Refund</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((txn) => (
                <tr key={txn._id}>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--ink-soft)]">{txn.merchantOrderId}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{txn.userId?.fullName || 'N/A'}</p>
                    <p className="text-xs text-[var(--ink-faint)]">{txn.userId?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{txn.bookId?.title || txn.courseId?.title || 'N/A'}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{rupees(txn.amount)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={txn.status}
                      disabled={busyId === txn._id}
                      onChange={(e) => onStatusChange(txn, e.target.value)}
                      className={`rounded-full border-none px-2 py-1 text-xs font-medium ${STATUS_STYLES[txn.status] || 'bg-[var(--bg-soft)] text-[var(--ink-faint)]'}`}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {txn.refundRequested ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600" title={txn.refundReason || undefined}>
                        <AlertTriangle size={11} /> Requested
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--ink-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{new Date(txn.purchasedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {txn.status === 'SUCCESS' && (
                        <button type="button" disabled={busyId === txn._id} onClick={() => onRefund(txn)} className="rounded-full border border-[var(--border)] p-1.5 text-[var(--accent)] hover:bg-[var(--bg-soft)] disabled:opacity-50" aria-label="Refund" title="Refund">
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button type="button" disabled={busyId === txn._id} onClick={() => onDelete(txn)} className="rounded-full border border-[var(--border)] p-1.5 text-stamp-red hover:bg-stamp-red/10 disabled:opacity-50" aria-label="Delete" title="Delete">
                        {busyId === txn._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
