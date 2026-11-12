import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { AlertCircle, FileText, Plus, Save, Trash2, X } from "lucide-react";

interface Note {
  id: number;
  title: string;
  content: string;
  category: string;
  projectId: number | null;
  updatedAt?: string;
}

const BASE_URL = import.meta.env.BASE_URL;
const CATEGORIES = ["general", "key facts", "meeting notes", "ideas"];

function api(path: string, opts?: RequestInit) {
  const fullPath = path.startsWith("/api/") ? `${BASE_URL}${path.slice(1)}` : path;
  return apiFetch(fullPath, { headers: { "Content-Type": "application/json" }, ...opts });
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "The request could not be completed.");
  }
  return payload as T;
}

export default function WorkspaceNotepad() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await api("/api/workspace/knowledge");
      setNotes(await readResponse<Note[]>(response));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotes(); }, [loadNotes]);

  const resetForm = () => {
    setEditingId(null);
    setCreating(false);
    setTitle("");
    setContent("");
    setCategory("general");
    setActionError("");
  };

  const startNew = () => {
    setEditingId(null);
    setCreating(true);
    setTitle("");
    setContent("");
    setCategory("general");
    setActionError("");
  };

  const startEdit = (note: Note) => {
    setCreating(false);
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category || "general");
    setActionError("");
  };

  const saveNote = async () => {
    if (!title.trim()) {
      setActionError("Add a title before saving.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const response = editingId !== null
        ? await api(`/api/workspace/notes/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ title: title.trim(), content, category }),
        })
        : await api("/api/workspace/notes", {
          method: "POST",
          body: JSON.stringify({ projectId: null, title: title.trim(), content, category }),
        });
      const updated = await readResponse<Note>(response);
      setNotes((current) => editingId !== null
        ? current.map((note) => note.id === updated.id ? updated : note)
        : [updated, ...current]);
      resetForm();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save this note.");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (note: Note) => {
    if (!window.confirm(`Delete “${note.title || "Untitled note"}”? This cannot be undone.`)) return;
    setActionError("");
    try {
      const response = await api(`/api/workspace/notes/${note.id}`, { method: "DELETE" });
      if (!response.ok) await readResponse(response);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      if (editingId === note.id) resetForm();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete this note.");
    }
  };

  const activeNote = editingId === null ? null : notes.find((note) => note.id === editingId) ?? null;
  const formVisible = creating || editingId !== null;

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] px-3 py-5 text-[#11110f] sm:px-6 sm:py-8" data-testid="workspace-notepad">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-[#d8d1c3] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold tracking-[.16em] text-[#756d60]">WORKSPACE / NOTES</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Notepad</h1>
            <p className="mt-2 max-w-xl text-sm text-[#625c52]">Quick notes for the details you need to keep close.</p>
          </div>
          {!formVisible && <button type="button" onClick={startNew} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#11110f] px-4 text-sm font-semibold text-[#fafaf7] hover:bg-[#34332f]" data-testid="create-note">
            <Plus className="h-4 w-4" aria-hidden="true" /> New note
          </button>}
        </header>

        {loadError && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-md border border-[#c98a70] bg-[#f8eee8] p-4 text-sm" data-testid="notes-load-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1"><p>{loadError}</p><button type="button" onClick={() => void loadNotes()} className="mt-2 font-semibold underline underline-offset-2" data-testid="retry-notes">Try again</button></div>
          </div>
        )}
        {actionError && <p role="alert" className="mb-4 rounded-md border border-[#c98a70] bg-[#f8eee8] px-4 py-3 text-sm" data-testid="notes-action-error">{actionError}</p>}

        {formVisible && (
          <section className="mb-6 rounded-md border border-[#c9c1b3] bg-[#fffdf8] p-4 sm:p-6" aria-label={creating ? "Create note" : "Edit note"} data-testid="note-editor">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{creating ? "New note" : "Edit note"}</h2>
              <button type="button" onClick={resetForm} className="grid h-10 w-10 place-items-center rounded-md border border-[#d8d1c3] hover:bg-[#f1ede4]" aria-label="Cancel editing" data-testid="cancel-note-edit"><X className="h-4 w-4" /></button>
            </div>
            <label className="mb-1 block text-sm font-medium" htmlFor="workspace-note-title">Title</label>
            <input id="workspace-note-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} autoFocus placeholder="Give this note a name" className="mb-4 min-h-12 w-full rounded-md border border-[#c9c1b3] bg-[#fafaf7] px-3 text-base outline-none focus:border-[#11110f]" data-testid="input-note-title" />
            <label className="mb-1 block text-sm font-medium" htmlFor="workspace-note-content">Note</label>
            <textarea id="workspace-note-content" value={content} onChange={(event) => setContent(event.target.value)} rows={8} placeholder="Write a thought, a reminder, or a detail worth keeping…" className="w-full resize-y rounded-md border border-[#c9c1b3] bg-[#fafaf7] p-3 text-base leading-6 outline-none focus:border-[#11110f]" data-testid="input-note-content" />
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="flex items-center gap-3 text-sm">
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-md border border-[#c9c1b3] bg-[#fafaf7] px-3" data-testid="select-note-category">
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  {category && !CATEGORIES.includes(category) && <option value={category}>{category}</option>}
                </select>
              </label>
              <button type="button" onClick={() => void saveNote()} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#11110f] px-5 font-semibold text-[#fafaf7] disabled:opacity-50 sm:ml-auto" data-testid="save-note">
                <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : "Save note"}
              </button>
            </div>
            {activeNote && <p className="mt-3 text-xs text-[#756d60]">Editing “{activeNote.title || "Untitled note"}”</p>}
          </section>
        )}

        {loading ? (
          <div className="space-y-3" aria-label="Loading notes" data-testid="notes-loading">
            {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-md border border-[#e2ddd3] bg-[#f1ede4]" />)}
          </div>
        ) : notes.length === 0 && !loadError ? (
          <section className="rounded-md border border-dashed border-[#c9c1b3] bg-[#fffdf8] px-5 py-12 text-center" data-testid="notes-empty">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[#d8d1c3]"><FileText className="h-5 w-5 text-[#756d60]" /></div>
            <h2 className="mt-4 text-lg font-semibold">A clear page.</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#625c52]">Create a note and it will be ready here next time you need it.</p>
            {!formVisible && <button type="button" onClick={startNew} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#11110f] px-4 text-sm font-semibold" data-testid="create-first-note"><Plus className="h-4 w-4" /> Create your first note</button>}
          </section>
        ) : (
          <section className="space-y-3" aria-label="Saved notes" data-testid="notes-list">
            {notes.map((note) => (
              <article key={note.id} className="flex flex-col gap-3 rounded-md border border-[#d8d1c3] bg-[#fffdf8] p-4 sm:flex-row sm:items-center sm:px-5" data-testid={`note-card-${note.id}`}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f1ede4]"><FileText className="h-4 w-4 text-[#625c52]" aria-hidden="true" /></div>
                <button type="button" onClick={() => startEdit(note)} className="min-w-0 flex-1 text-left" data-testid={`edit-note-${note.id}`}>
                  <span className="block truncate font-semibold">{note.title || "Untitled note"}</span>
                  <span className="mt-1 block truncate text-sm text-[#625c52]">{note.content || "No note text"}</span>
                </button>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="rounded-sm bg-[#f1ede4] px-2 py-1 text-xs text-[#625c52]">{note.category || "general"}</span>
                  <button type="button" onClick={() => void deleteNote(note)} className="grid h-11 w-11 place-items-center rounded-md text-[#625c52] hover:bg-[#f8eee8] hover:text-[#8d3f32]" aria-label={`Delete ${note.title || "untitled note"}`} data-testid={`delete-note-${note.id}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
