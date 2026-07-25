import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, Search, UploadCloud, BookOpen, GraduationCap } from 'lucide-react';
import {
  adminListBooks, adminListCourses,
  createBook, updateBook, deleteBook,
  createCourse, updateCourse, deleteCourse,
} from '../../lib/adminClient.js';

const BOOK_CATEGORIES = ['NCERT', 'Foundation', 'Hindi Books', 'Competitive Exams', 'General Reading', 'Education', 'Business', 'Design', 'Marketing', 'Religious', 'Spiritual', 'Relationship', 'Motivational', 'Other'];
const COURSE_CATEGORIES = ['NCERT', 'Foundation', 'Hindi Books', 'Competitive Exams', 'General Reading', 'Other'];

const emptyForm = {
  title: '', author: '', description: '', category: 'Other',
  price: '', isPaid: false, isPublished: true, featured: false,
  tags: '', pdfDriveLink: '', thumbnailBase64: '', thumbnailPreview: '',
};

export default function UploadSection() {
  const [itemType, setItemType] = useState('book'); // 'book' | 'course'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const categories = itemType === 'book' ? BOOK_CATEGORIES : COURSE_CATEGORIES;
  const listFn = itemType === 'book' ? adminListBooks : adminListCourses;

  useEffect(() => { load(); }, [itemType]);

  function load() {
    setLoading(true);
    setError('');
    listFn()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      title: item.title || '',
      author: item.author || '',
      description: item.description || '',
      category: item.category || 'Other',
      price: item.price || '',
      isPaid: !!item.isPaid,
      isPublished: item.isPublished !== false,
      featured: !!item.featured,
      tags: (item.tags || []).join(', '),
      pdfDriveLink: item.pdfDriveLink || '',
      thumbnailBase64: '',
      thumbnailPreview: item.thumbnail?.data || '',
    });
    setFormError('');
    setShowForm(true);
  }

  function onThumbnailChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, thumbnailBase64: reader.result, thumbnailPreview: reader.result }));
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!form.title.trim() || !form.description.trim() || !form.pdfDriveLink.trim()) {
      setFormError('Title, description, and the PDF Drive link are required.');
      return;
    }
    if (!editing && !form.thumbnailBase64) {
      setFormError('Please choose a cover thumbnail.');
      return;
    }
    if (form.isPaid && (!form.price || Number(form.price) <= 0)) {
      setFormError('Enter a price greater than 0 for a paid item, or uncheck "Paid".');
      return;
    }

    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      description: form.description.trim(),
      category: form.category,
      price: form.isPaid ? Number(form.price) : 0,
      isPaid: form.isPaid,
      isPublished: form.isPublished,
      featured: form.featured,
      tags: form.tags,
      pdfDriveLink: form.pdfDriveLink.trim(),
    };
    if (form.thumbnailBase64) payload.thumbnailBase64 = form.thumbnailBase64;

    setSaving(true);
    try {
      if (itemType === 'book') {
        if (editing) await updateBook(editing._id, payload);
        else await createBook(payload);
      } else {
        if (editing) await updateCourse(editing._id, payload);
        else await createCourse(payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item) {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    setDeletingId(item._id);
    try {
      if (itemType === 'book') await deleteBook(item._id);
      else await deleteCourse(item._id);
      setItems((prev) => prev.filter((i) => i._id !== item._id));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = items.filter((i) =>
    !search.trim() || i.title.toLowerCase().includes(search.trim().toLowerCase()) || (i.author || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] p-1">
          <button type="button" onClick={() => setItemType('book')} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium ${itemType === 'book' ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'}`}>
            <BookOpen size={14} /> Books
          </button>
          <button type="button" onClick={() => setItemType('course')} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium ${itemType === 'course' ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-soft)]'}`}>
            <GraduationCap size={14} /> Courses
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or author…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-1.5 pl-8 pr-3 text-sm text-[var(--ink)]"
          />
        </div>

        <button type="button" onClick={openNew} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)]">
          <Plus size={15} /> Upload {itemType === 'book' ? 'book' : 'course'}
        </button>
      </div>

      {error && <p className="text-sm text-stamp-red">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[var(--ink-faint)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ticket border border-[var(--border)] bg-[var(--card)] p-10 text-center text-sm text-[var(--ink-soft)]">
          No {itemType === 'book' ? 'books' : 'courses'} yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ticket border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-faint)]">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Downloads</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((item) => (
                <tr key={item._id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="text-xs text-[var(--ink-faint)]">{item.author}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{item.category}</td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{item.isPaid ? `₹${item.price}` : 'Free'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${item.isPublished ? 'bg-stamp-green/15 text-stamp-green' : 'bg-[var(--bg-soft)] text-[var(--ink-faint)]'}`}>
                        {item.isPublished ? 'Published' : 'Draft'}
                      </span>
                      {!item.isActive && <span className="rounded-full bg-stamp-red/15 px-2 py-0.5 text-xs text-stamp-red">Inactive</span>}
                      {item.featured && <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-xs text-[var(--accent)]">Featured</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{item.downloadCount || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(item)} className="rounded-full border border-[var(--border)] p-1.5 text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]" aria-label="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => onDelete(item)} disabled={deletingId === item._id} className="rounded-full border border-[var(--border)] p-1.5 text-stamp-red hover:bg-stamp-red/10 disabled:opacity-50" aria-label="Delete">
                        {deletingId === item._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
          <div className="w-full max-w-2xl rounded-ticket border border-[var(--border)] bg-[var(--card)] p-6 shadow-ticket">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-[var(--ink)]">
                {editing ? `Edit ${itemType}` : `Upload new ${itemType}`}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-full p-1.5 text-[var(--ink-faint)] hover:bg-[var(--bg-soft)]"><X size={18} /></button>
            </div>

            {formError && <p className="mb-3 rounded-lg bg-stamp-red/10 p-3 text-sm text-stamp-red">{formError}</p>}

            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)] sm:col-span-2">
                Title
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
                Author {itemType === 'course' ? '/ Instructor' : ''}
                <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
                Category
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]">
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)] sm:col-span-2">
                Description
                <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)] sm:col-span-2">
                PDF link (Google Drive share link, or any direct http/https link)
                <input required value={form.pdfDriveLink} onChange={(e) => setForm({ ...form, pdfDriveLink: e.target.value })} placeholder="https://drive.google.com/file/d/…" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)] sm:col-span-2">
                Cover thumbnail {editing && <span className="normal-case text-[var(--ink-faint)]">(leave empty to keep current)</span>}
                <div className="flex items-center gap-3">
                  {form.thumbnailPreview && <img src={form.thumbnailPreview} alt="Preview" className="h-16 w-12 rounded object-cover border border-[var(--border)]" />}
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]">
                    <UploadCloud size={14} /> Choose image
                    <input type="file" accept="image/*" onChange={onThumbnailChange} className="hidden" />
                  </label>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs text-[var(--ink-faint)]">
                Tags (comma separated)
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
              </label>

              <div className="flex flex-col gap-2 text-sm text-[var(--ink)]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} /> Paid
                </label>
                {form.isPaid && (
                  <input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price in ₹" className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]" />
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} /> Published
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured on homepage
                </label>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-full border border-[var(--border)] px-5 py-2 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-soft)]">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--accent-dark)] disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />} {editing ? 'Save changes' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
