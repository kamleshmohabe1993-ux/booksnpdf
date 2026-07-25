import { useEffect, useState } from 'react';
import { Loader2, Search, Download, CheckCircle2, XCircle, ShieldCheck, Trash2, Users as UsersIcon } from 'lucide-react';
import { adminListUsers, adminToggleUserStatus, adminVerifyUser, adminDeleteUser, adminBulkUserAction, adminExportUsers } from '../../lib/adminClient.js';

export default function UsersSection() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [verified, setVerified] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { load(); }, [status, verified, page]);

  function load() {
    setLoading(true);
    setError('');
    adminListUsers({ status, verified, search: search || undefined, page, limit: 20 })
      .then((res) => {
        setRows(res.data);
        setStats(res.stats);
        setPages(res.pages || 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function onSearchSubmit(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r._id))));
  }

  async function onToggleStatus(user) {
    setBusyId(user._id);
    try {
      const updated = await adminToggleUserStatus(user._id);
      setRows((prev) => prev.map((r) => (r._id === user._id ? { ...r, isActive: updated.isActive } : r)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onVerify(user) {
    setBusyId(user._id);
    try {
      await adminVerifyUser(user._id);
      setRows((prev) => prev.map((r) => (r._id === user._id ? { ...r, isVerified: true } : r)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(user) {
    if (!window.confirm(`Delete ${user.fullName || user.email}? This can't be undone.`)) return;
    setBusyId(user._id);
    try {
      await adminDeleteUser(user._id);
      setRows((prev) => prev.filter((r) => r._id !== user._id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onBulk(action) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await adminBulkUserAction([...selected], action);
      setSelected(new Set());
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      await adminExportUsers({ status, verified });
    } catch (err) {
      alert(err.message);
    } finally {
      setExporting(false);
    }
  }

  const statCards = stats ? [
    { label: 'Total users', value: stats.total },
    { label: 'Active', value: stats.active },
    { label: 'Inactive', value: stats.inactive },
    { label: 'Verified', value: stats.verified },
    { label: 'Unverified', value: stats.unverified },
    { label: 'Revenue', value: `₹${stats.totalRevenue}` },
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, mobile…" className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-3 text-sm text-[var(--ink)]" />
        </form>

        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--ink)]">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--ink)]">
          <option value="all">All verification</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
        </select>

        <button type="button" onClick={onExport} disabled={exporting} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] disabled:opacity-60">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-ticket border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-sm">
          <span className="font-medium text-[var(--ink)]">{selected.size} selected</span>
          <button type="button" disabled={bulkBusy} onClick={() => onBulk('activate')} className="text-stamp-green hover:underline disabled:opacity-50">Activate</button>
          <button type="button" disabled={bulkBusy} onClick={() => onBulk('deactivate')} className="text-stamp-red hover:underline disabled:opacity-50">Deactivate</button>
          <button type="button" disabled={bulkBusy} onClick={() => onBulk('verify')} className="text-[var(--accent)] hover:underline disabled:opacity-50">Verify</button>
        </div>
      )}

      {error && <p className="text-sm text-stamp-red">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[var(--ink-faint)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--ink-soft)]">
          <UsersIcon size={22} className="mx-auto mb-2 text-[var(--ink-faint)]" /> No users match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ticket border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-faint)]">
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={selected.size === rows.length} onChange={toggleSelectAll} /></th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Purchases</th>
                <th className="px-4 py-3">Spent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{u.fullName} {u.isAdmin && <span className="ml-1 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">Admin</span>}</p>
                    <p className="text-xs text-[var(--ink-faint)]">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{u.mobileNumber}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{u.purchaseCount ?? 0}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">₹{u.totalSpent ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${u.isActive ? 'bg-stamp-green/15 text-stamp-green' : 'bg-stamp-red/15 text-stamp-red'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${u.isVerified ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--bg-soft)] text-[var(--ink-faint)]'}`}>{u.isVerified ? 'Verified' : 'Unverified'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {!u.isVerified && (
                        <button type="button" disabled={busyId === u._id} onClick={() => onVerify(u)} className="rounded-full border border-[var(--border)] p-1.5 text-[var(--accent)] hover:bg-[var(--bg-soft)] disabled:opacity-50" aria-label="Verify" title="Verify">
                          <ShieldCheck size={14} />
                        </button>
                      )}
                      <button type="button" disabled={busyId === u._id} onClick={() => onToggleStatus(u)} className="rounded-full border border-[var(--border)] p-1.5 text-[var(--ink-soft)] hover:bg-[var(--bg-soft)] disabled:opacity-50" aria-label="Toggle status" title={u.isActive ? 'Deactivate' : 'Activate'}>
                        {u.isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                      </button>
                      <button type="button" disabled={busyId === u._id} onClick={() => onDelete(u)} className="rounded-full border border-[var(--border)] p-1.5 text-stamp-red hover:bg-stamp-red/10 disabled:opacity-50" aria-label="Delete" title="Delete">
                        {busyId === u._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Prev</button>
          <span className="text-[var(--ink-faint)]">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-[var(--border)] px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
