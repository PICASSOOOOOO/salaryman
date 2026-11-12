import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, File, Folder, FolderPlus, Loader2, MoveRight, RefreshCw, Trash2, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { SignInPage } from "@/components/SignInPrompt";

type DocumentItem = {
  id: number;
  name: string;
  parentId: number | null;
  isFolder: boolean;
  mimeType: string | null;
  fileSize: number | null;
};

export default function OrganizationDocuments() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useOrg();
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [crumbs, setCrumbs] = useState<{ id: number | null; name: string }[]>([{ id: null, name: "Shared files" }]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [moveItem, setMoveItem] = useState<DocumentItem | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<number | null>(null);
  const [moveCrumbs, setMoveCrumbs] = useState<{ id: number | null; name: string }[]>([{ id: null, name: "Shared files" }]);
  const [moveFolders, setMoveFolders] = useState<DocumentItem[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);

  const loadItems = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError("");
    try {
      const query = folderId === null ? "" : `?parentId=${folderId}`;
      const response = await apiFetch(`/api/org/documents${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load organization documents");
      setItems(Array.isArray(data.documents) ? data.documents : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load organization documents");
    } finally {
      setLoading(false);
    }
  }, [folderId, org]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const loadMoveFolders = async (parentId: number | null) => {
    setMoveLoading(true);
    try {
      const query = parentId === null ? "" : `?parentId=${parentId}`;
      const response = await apiFetch(`/api/org/documents${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load destination folders");
      setMoveFolders((Array.isArray(data.documents) ? data.documents : []).filter((item: DocumentItem) => item.isFolder));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load destination folders");
    } finally {
      setMoveLoading(false);
    }
  };

  const openMovePicker = (item: DocumentItem) => {
    setMoveItem(item);
    setMoveFolderId(null);
    setMoveCrumbs([{ id: null, name: "Shared files" }]);
    void loadMoveFolders(null);
  };

  const move = async () => {
    if (!moveItem) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/api/org/documents/${moveItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: moveFolderId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not move item");
      setMoveItem(null);
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not move item");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const response = await apiFetch("/api/org/documents/folders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: folderId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create folder");
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create folder");
    } finally { setBusy(false); }
  };

  const uploadFile = async (file?: globalThis.File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const intentResponse = await apiFetch("/api/org/documents/uploads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size, parentId: folderId }),
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error || "Could not start upload");
      const uploaded = await fetch(intent.uploadURL, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file,
      });
      if (!uploaded.ok) throw new Error("File upload failed");
      const complete = await apiFetch(`/api/org/documents/uploads/${encodeURIComponent(intent.uploadId)}/complete`, { method: "POST" });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error || "Could not finish upload");
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload file");
    } finally { setBusy(false); }
  };

  const download = async (item: DocumentItem) => {
    setError("");
    try {
      const response = await apiFetch(`/api/org/documents/${item.id}/content`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download failed");
    }
  };

  const rename = async (item: DocumentItem) => {
    const name = window.prompt("New name", item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/org/documents/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not rename item");
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename item");
    } finally { setBusy(false); }
  };

  const remove = async (item: DocumentItem) => {
    if (!window.confirm(item.isFolder ? `Delete empty folder “${item.name}”?` : `Delete “${item.name}” from shared files?`)) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/org/documents/${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete item");
      await loadItems();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete item");
    } finally { setBusy(false); }
  };

  if (authLoading || orgLoading) return <div className="mx-auto max-w-4xl p-6 text-sm text-zinc-500">Loading…</div>;
  if (!isAuthenticated) return <SignInPage />;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Organization · {org?.name ?? "No active organization"}</p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-100">Shared documents</h1>
        </div>
        {org && <div className="flex gap-2">
          <button disabled={busy} onClick={() => void createFolder()} className="inline-flex items-center gap-1.5 rounded-md border border-black bg-[#fffaf0] px-3 py-2 text-xs font-medium text-black disabled:opacity-50"><FolderPlus className="h-4 w-4" />Folder</button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-black bg-black px-3 py-2 text-xs font-medium text-white has-[:disabled]:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Upload
            <input type="file" className="sr-only" disabled={busy} onChange={e => { void uploadFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          </label>
          <button onClick={() => void loadItems()} aria-label="Refresh" className="rounded-md border border-black bg-white px-2 text-black"><RefreshCw className="h-4 w-4" /></button>
        </div>}
      </header>
      {org ? <>
        <nav className="mb-3 flex items-center gap-2 text-sm">
          {crumbs.length > 1 && <button aria-label="Back" onClick={() => { const next = crumbs.slice(0, -1); setCrumbs(next); setFolderId(next.at(-1)?.id ?? null); }}><ArrowLeft className="h-4 w-4" /></button>}
          {crumbs.map((crumb, index) => <button key={`${crumb.id}-${index}`} onClick={() => { setCrumbs(crumbs.slice(0, index + 1)); setFolderId(crumb.id); }} className="text-zinc-600 underline-offset-4 hover:underline">{index ? " / " : ""}{crumb.name}</button>)}
        </nav>
        {error && <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {loading ? <p className="py-10 text-center text-sm text-zinc-500">Loading shared documents…</p> :
          items.length === 0 ? <p className="rounded-lg border border-dashed border-black/30 p-8 text-center text-sm text-zinc-500">No shared documents here yet.</p> :
          <ul className="divide-y divide-black/10 rounded-lg border border-black/15 bg-[#fffaf0]">
            {items.map(item => <li key={item.id} className="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
              {item.isFolder ? <Folder className="h-4 w-4 shrink-0" /> : <File className="h-4 w-4 shrink-0" />}
              {item.isFolder ? <button className="min-w-0 flex-1 truncate text-left text-sm font-medium text-zinc-900" onClick={() => { setFolderId(item.id); setCrumbs([...crumbs, { id: item.id, name: item.name }]); }}>{item.name}</button> :
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{item.name}<small className="ml-2 text-zinc-500">{item.mimeType || "File"}{item.fileSize ? ` · ${Math.ceil(item.fileSize / 1024)} KB` : ""}</small></span>}
              {!item.isFolder && <button onClick={() => void download(item)} aria-label={`Download ${item.name}`} className="rounded p-2 hover:bg-black/5"><Download className="h-4 w-4" /></button>}
              <button data-testid={`move-document-${item.id}`} disabled={busy} onClick={() => openMovePicker(item)} aria-label={`Move ${item.name}`} className="rounded p-2 hover:bg-black/5"><MoveRight className="h-4 w-4" /></button>
              <button disabled={busy} onClick={() => void rename(item)} aria-label={`Rename ${item.name}`} className="rounded px-2 py-1 text-xs hover:bg-black/5">Rename</button>
              {!item.isFolder && <button disabled={busy} onClick={() => void remove(item)} aria-label={`Delete ${item.name}`} className="rounded p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
            </li>)}
          </ul>}
      </> : <p className="rounded-lg border border-black/15 bg-[#fffaf0] p-6 text-sm text-zinc-600">Join or create an organization to view shared documents.</p>}
      {moveItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="move-dialog-title" className="w-full max-w-md rounded-lg border border-black/20 bg-[#fffaf0] p-4 text-zinc-900 shadow-xl">
          <h2 id="move-dialog-title" className="text-base font-semibold">Move “{moveItem.name}”</h2>
          <p className="mt-1 text-sm text-zinc-600">Choose a destination folder.</p>
          <nav aria-label="Destination folder" className="my-3 flex flex-wrap items-center gap-1 text-sm">
            {moveCrumbs.map((crumb, index) => <button key={`${crumb.id}-${index}`} onClick={() => {
              const next = moveCrumbs.slice(0, index + 1);
              setMoveCrumbs(next);
              setMoveFolderId(crumb.id);
              void loadMoveFolders(crumb.id);
            }} className="underline-offset-4 hover:underline">{index ? " / " : ""}{crumb.name}</button>)}
          </nav>
          <div className="max-h-64 overflow-y-auto rounded border border-black/15">
            {moveLoading ? <p className="p-4 text-sm text-zinc-500">Loading folders…</p> : moveFolders.length === 0 ?
              <p className="p-4 text-sm text-zinc-500">No folders here.</p> :
              <ul className="divide-y divide-black/10">{moveFolders.map(folder => <li key={folder.id}>
                <button data-testid={`open-move-folder-${folder.id}`} className="flex w-full items-center gap-2 p-3 text-left text-sm hover:bg-black/5" onClick={() => {
                  setMoveFolderId(folder.id);
                  setMoveCrumbs([...moveCrumbs, { id: folder.id, name: folder.name }]);
                  void loadMoveFolders(folder.id);
                }}><Folder className="h-4 w-4" />{folder.name}</button>
              </li>)}</ul>}
          </div>
          <footer className="mt-4 flex justify-end gap-2">
            <button data-testid="cancel-move-document" disabled={busy} onClick={() => setMoveItem(null)} className="rounded border border-black/20 px-3 py-2 text-sm">Cancel</button>
            <button data-testid="confirm-move-document" disabled={busy || moveLoading || moveFolderId === moveItem.parentId} onClick={() => void move()} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? "Moving…" : "Move here"}</button>
          </footer>
        </section>
      </div>}
    </main>
  );
}
