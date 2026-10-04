import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, Code2, Edit3, ExternalLink,
  FileText, FlaskConical, FolderPlus, Gamepad2, Globe2, LayoutGrid, LoaderCircle,
  LockKeyhole, Plus, RefreshCw, Save, Sparkles, Trash2, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { apiFetch } from "@/lib/api-client";
import { useGenerateWorkspaceProjectDraft } from "@workspace/api-client-react";

type ProjectType = "app" | "website" | "game" | "income" | "office" | "data/research" | "creative";
type WorkspaceProject = {
  id: number; userId: string; name: string; type: string; description: string;
  createdAt: string; updatedAt: string;
};
type WorkspaceNote = {
  id: number; userId: string; projectId: number | null; title: string; content: string;
  category: string; createdAt: string; updatedAt: string;
};
type NoteDraft = Pick<WorkspaceNote, "id" | "projectId" | "title" | "content" | "category">;
type Panel = "prototype" | "plan" | "notes";

const TYPES: { value: ProjectType; label: string; icon: typeof LayoutGrid }[] = [
  { value: "app", label: "App", icon: LayoutGrid },
  { value: "website", label: "Website", icon: Globe2 },
  { value: "game", label: "Game", icon: Gamepad2 },
  { value: "income", label: "Income concept", icon: ArrowUpRight },
  { value: "office", label: "Office", icon: Code2 },
  { value: "data/research", label: "Data / research", icon: FlaskConical },
  { value: "creative", label: "Creative", icon: Sparkles },
];

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'">`;

function safePreviewDocument(source: string) {
  const html = source || "<main style='font:16px system-ui;padding:2rem;color:#24231f'>Your prototype will appear here.</main>";
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => `${head}${CSP}`);
  return `<!doctype html><html><head><meta charset="utf-8">${CSP}<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
}

function inputClass() {
  return "w-full rounded-xl border border-[#dedbd2] bg-[#fffefa] px-3.5 py-3 text-[14px] text-[#25241f] outline-none transition focus:border-[#292820] placeholder:text-[#aaa69b]";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const error = new Error(response.status === 403 ? "Generation is not available for this account yet." : `Request failed (${response.status}).`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object") {
    const item = error as { status?: number; response?: { status?: number } };
    return item.status ?? item.response?.status;
  }
  return undefined;
}

export default function PabloCreate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [notesProjectId, setNotesProjectId] = useState<number | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [panel, setPanel] = useState<Panel>("prototype");
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("app");
  const [projectDescription, setProjectDescription] = useState("");
  const [brief, setBrief] = useState("");
  const [noteForm, setNoteForm] = useState<"context" | "reference" | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingPrototype, setSavingPrototype] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<ProjectType>("app");
  const [editDescription, setEditDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const notesRequestId = useRef(0);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const selectedNotes = notesProjectId === selectedId ? notes : [];
  const preferAutopilotDrafts = new URLSearchParams(window.location.search).get("review") === "autopilot";
  const plan = useMemo(
    () => {
      const autopilot = selectedNotes.find((note) => note.category === "creation-autopilot-plan");
      const manual = selectedNotes.find((note) => note.category === "creation-plan");
      return preferAutopilotDrafts ? autopilot ?? manual : manual ?? autopilot;
    },
    [selectedNotes, preferAutopilotDrafts],
  );
  const prototype = useMemo(
    () => {
      const autopilot = selectedNotes.find((note) => note.category === "creation-autopilot-prototype");
      const manual = selectedNotes.find((note) => note.category === "creation-prototype");
      return preferAutopilotDrafts ? autopilot ?? manual : manual ?? autopilot;
    },
    [selectedNotes, preferAutopilotDrafts],
  );
  const materials = useMemo(() => selectedNotes.filter((note) => note.category === "creation-context" || note.category === "external-reference"), [selectedNotes]);
  const [prototypeSource, setPrototypeSource] = useState("");
  const [planSource, setPlanSource] = useState("");
  const generate = useGenerateWorkspaceProjectDraft();

  const signInForWorkspace = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const refreshProjects = useCallback(async () => {
    setLoadingProjects(true);
    setLoadError("");
    try {
      const data = await request<WorkspaceProject[]>("api/workspace/projects");
      setProjects(data);
      const requestedProjectId = Number(new URLSearchParams(window.location.search).get("project"));
      setSelectedId((current) => {
        if (Number.isInteger(requestedProjectId) && data.some((item) => item.id === requestedProjectId)) {
          return requestedProjectId;
        }
        return current && data.some((item) => item.id === current) ? current : data[0]?.id ?? null;
      });
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setLoadError("Projects could not be loaded. Check your connection and try again.");
    } finally {
      setLoadingProjects(false);
    }
  }, [signInForWorkspace]);

  useEffect(() => {
    if (isAuthenticated) void refreshProjects();
  }, [isAuthenticated, refreshProjects]);

  const loadNotes = useCallback(async (projectId: number) => {
    const requestId = ++notesRequestId.current;
    setLoadingNotes(true);
    setNotesProjectId(null);
    setActionError("");
    try {
      const data = await request<WorkspaceNote[]>(`api/workspace/projects/${projectId}/notes`);
      if (requestId !== notesRequestId.current) return;
      setNotes(data);
      setNotesProjectId(projectId);
    } catch (error) {
      if (requestId !== notesRequestId.current) return;
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("This project's notes could not be loaded. Retry by selecting it again.");
    } finally {
      if (requestId === notesRequestId.current) setLoadingNotes(false);
    }
  }, [signInForWorkspace]);

  useEffect(() => {
    if (selectedId !== null) void loadNotes(selectedId);
    else {
      notesRequestId.current += 1;
      setNotes([]);
      setNotesProjectId(null);
      setLoadingNotes(false);
    }
  }, [selectedId, loadNotes]);

  useEffect(() => {
    setPrototypeSource(prototype?.content ?? "");
    setPlanSource(plan?.content ?? "");
    setSaved(false);
  }, [prototype?.id, plan?.id]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    setActionError("");
    try {
      const project = await request<WorkspaceProject>("api/workspace/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName.trim(), type: projectType, description: projectDescription.trim() }),
      });
      setProjects((current) => [project, ...current]);
      setSelectedId(project.id);
      setProjectName(""); setProjectDescription(""); setProjectType("app"); setCreating(false);
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Could not create this project. Please try again.");
    }
  };

  const deleteProject = async () => {
    if (!selected || !window.confirm(`Delete “${selected.name}” and its workspace records?`)) return;
    try {
      await request<{ ok: true }>(`api/workspace/projects/${selected.id}`, { method: "DELETE" });
      const remaining = projects.filter((project) => project.id !== selected.id);
      setProjects(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("This project could not be deleted. Try again.");
    }
  };

  const beginProjectEdit = () => {
    if (!selected) return;
    setEditName(selected.name);
    setEditType((TYPES.find((item) => item.value === selected.type)?.value ?? "app") as ProjectType);
    setEditDescription(selected.description);
    setEditingProject(true);
  };

  const saveProjectEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !editName.trim()) return;
    setSavingProject(true);
    setActionError("");
    try {
      const updated = await request<WorkspaceProject>(`api/workspace/projects/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editName.trim(), type: editType, description: editDescription.trim() }),
      });
      setProjects((current) => current.map((project) => project.id === updated.id ? updated : project));
      setEditingProject(false);
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Project details could not be saved. Please try again.");
    } finally {
      setSavingProject(false);
    }
  };

  const saveNote = async (note: NoteDraft, content: string, title = note.title) => {
    const updated = await request<WorkspaceNote>(`api/workspace/notes/${note.id}`, {
      method: "PUT",
      body: JSON.stringify({ title, content }),
    });
    setNotes((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  };

  const addMaterial = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !noteTitle.trim()) return;
    setSavingNote(true); setActionError("");
    const isReference = noteForm === "reference";
    if (isReference) {
      try {
        const parsed = new URL(referenceUrl.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported link");
      } catch {
        setActionError("Use a valid http or https reference link.");
        setSavingNote(false);
        return;
      }
    }
    const content = isReference
      ? `URL: ${referenceUrl.trim()}\n\n${noteContent.trim()}`.trim()
      : noteContent.trim();
    try {
      const note = await request<WorkspaceNote>("api/workspace/notes", {
        method: "POST",
        body: JSON.stringify({
          projectId: selected.id, title: noteTitle.trim(), content,
          category: isReference ? "external-reference" : "creation-context",
        }),
      });
      setNotes((current) => [note, ...current]);
      setNoteTitle(""); setNoteContent(""); setReferenceUrl(""); setNoteForm(null);
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Could not save this material. Please try again.");
    } finally { setSavingNote(false); }
  };

  const removeNote = async (note: WorkspaceNote) => {
    if (!window.confirm(`Delete “${note.title}”?`)) return;
    try {
      await request<{ ok: true }>(`api/workspace/notes/${note.id}`, { method: "DELETE" });
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Could not delete this item. Try again.");
    }
  };

  const generateDraft = async () => {
    if (!selected || !brief.trim()) return;
    setActionError("");
    try {
      const result = await generate.mutateAsync({ projectId: selected.id, data: { brief: brief.trim() } });
      const generatedNotes: NoteDraft[] = [result.plan, result.prototype];
      setNotes((current) => [
        ...current.filter((item) => item.category !== "creation-plan" && item.category !== "creation-prototype"),
        ...generatedNotes.map((item) => ({ ...item, projectId: selected.id })),
      ] as WorkspaceNote[]);
      setPanel("prototype");
      setBrief("");
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else if (errorStatus(error) === 402 || errorStatus(error) === 403) setActionError("Draft generation is not enabled for this account. Your saved projects and notes are still available.");
      else setActionError("Draft generation didn’t finish. Your project is unchanged; try again.");
    }
  };

  const persistPrototype = async () => {
    if (!prototype) return;
    setSavingPrototype(true); setActionError("");
    try {
      await saveNote(prototype, prototypeSource);
      setSaved(true);
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Prototype changes could not be saved.");
    } finally { setSavingPrototype(false); }
  };

  const persistPlan = async () => {
    if (!plan) return;
    try {
      await saveNote(plan, planSource);
      setActionError("");
    } catch (error) {
      if (errorStatus(error) === 401) signInForWorkspace();
      else setActionError("Plan edits could not be saved.");
    }
  };

  const downloadPrototype = () => {
    const blob = new Blob([prototypeSource], { type: "text/html;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${(selected?.name || "prototype").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  if (isLoading) return <main className="create-loading"><div className="loading-skeleton"><i /><i /><i /></div></main>;
  if (!isAuthenticated) return <div className="create-signin"><SignInPage context="Sign in to open your private creation workspace." /></div>;

  return (
    <main className="create-workspace">
      <header className="workspace-topbar">
        <Link href="/pablo" className="back-link"><ArrowLeft size={15} /><span>Pablo</span></Link>
        <div className="topbar-title"><span className="brand-mark">P</span><span>CREATION WORKSPACE</span></div>
        <div className="private-label"><LockKeyhole size={13} /><span>PRIVATE</span></div>
      </header>
      <div className="workspace-body">
        <aside className="project-rail">
          <div className="rail-heading">
            <span className="eyebrow">YOUR PROJECTS</span>
            <button className="icon-button" aria-label="Create project" onClick={() => setCreating((open) => !open)}><Plus size={17} /></button>
          </div>
          {creating && (
            <form className="new-project-form" onSubmit={createProject}>
              <input autoFocus className={inputClass()} placeholder="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} maxLength={90} required />
              <select className={inputClass()} value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              <textarea className={inputClass()} placeholder="One-line description" rows={2} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
              <div className="form-actions"><button type="button" className="text-button" onClick={() => setCreating(false)}>Cancel</button><button type="submit" className="dark-button"><FolderPlus size={14} /> Create</button></div>
            </form>
          )}
          {loadingProjects ? (
            <div className="project-skeletons"><i /><i /><i /></div>
          ) : loadError ? (
            <div className="rail-error"><p>{loadError}</p><button onClick={() => void refreshProjects()}><RefreshCw size={13} /> Retry</button></div>
          ) : projects.length ? (
            <nav className="project-list" aria-label="Projects">
              {projects.map((project) => {
                const Icon = TYPES.find((type) => type.value === project.type)?.icon ?? LayoutGrid;
                return <button key={project.id} className={`project-item${selectedId === project.id ? " active" : ""}`} onClick={() => setSelectedId(project.id)}>
                  <span className="project-icon"><Icon size={16} /></span>
                  <span className="project-copy"><b>{project.name}</b><small>{project.type}</small></span>
                  <span className="project-dot" />
                </button>;
              })}
            </nav>
          ) : (
            <div className="rail-empty"><span className="empty-orbit"><Sparkles size={18} /></span><p>Start with a project.<br />Shape it as you go.</p><button onClick={() => setCreating(true)}><Plus size={14} /> New project</button></div>
          )}
          <div className="rail-footer"><span className="foot-rule" /><span>WORK IN PROGRESS</span><span className="foot-rule" /></div>
        </aside>

        <section className="workbench">
          {!selected ? (
            <div className="welcome-board">
              <div className="welcome-grid" aria-hidden="true" />
              <span className="eyebrow">FROM THOUGHT TO FIRST DRAFT</span>
              <h1>Make a thing.<br /><em>Then make it real.</em></h1>
              <p>Build a plan, gather your references, and shape a working first draft in one private place.</p>
              <button className="dark-button welcome-cta" onClick={() => setCreating(true)}><Plus size={16} /> Start a project</button>
              <div className="welcome-stamp"><span>01</span><i /><span>IDEA → DRAFT</span></div>
            </div>
          ) : (
            <>
              <div className="project-header">
                {editingProject ? (
                  <form className="project-edit-form" onSubmit={saveProjectEdit}>
                    <input aria-label="Project name" className={inputClass()} value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={90} required />
                    <select aria-label="Project type" className={inputClass()} value={editType} onChange={(event) => setEditType(event.target.value as ProjectType)}>
                      {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <input aria-label="Project description" className={inputClass()} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="Description" />
                    <div className="project-edit-actions">
                      <button type="button" className="text-button" onClick={() => setEditingProject(false)}>Cancel</button>
                      <button type="submit" className="dark-button" disabled={savingProject}>{savingProject ? "Saving…" : <><Check size={14} /> Save</>}</button>
                    </div>
                  </form>
                ) : (
                  <div className="project-heading">
                    <span className="eyebrow">{selected.type.toUpperCase()} / WORKSPACE</span>
                    <h1>{selected.name}</h1>
                    <p>{selected.description || "An open canvas for the first version."}</p>
                  </div>
                )}
                <div className="project-head-actions">
                  {!editingProject && <button className="edit-project" onClick={beginProjectEdit}><Edit3 size={14} /><span>Edit details</span></button>}
                  <button className="delete-project" onClick={() => void deleteProject()} title="Delete project"><Trash2 size={15} /><span>Delete</span></button>
                </div>
              </div>
              <section className="brief-strip">
                <div className="brief-label"><span className="step-number">01</span><div><b>Set the direction</b><small>What should exist when we’re done?</small></div></div>
                <div className="brief-control">
                  <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={4000} rows={2} placeholder={`Describe the first draft for ${selected.name}…`} />
                  <button className="generate-button" onClick={() => void generateDraft()} disabled={generate.isPending || !brief.trim()}>
                    {generate.isPending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                    <span>{generate.isPending ? "Making draft" : "Generate draft"}</span>
                  </button>
                </div>
              </section>
              {actionError && <div className="action-alert" role="alert"><span>{actionError}</span><button onClick={() => setActionError("")} aria-label="Dismiss"><X size={14} /></button></div>}

              <div className="canvas-bar">
                <div className="canvas-tabs" role="tablist" aria-label="Project workspace">
                  <button className={panel === "prototype" ? "selected" : ""} onClick={() => setPanel("prototype")}><Code2 size={14} /> Prototype</button>
                  <button className={panel === "plan" ? "selected" : ""} onClick={() => setPanel("plan")}><BookOpen size={14} /> Plan</button>
                  <button className={panel === "notes" ? "selected" : ""} onClick={() => setPanel("notes")}><FileText size={14} /> Materials <span className="tab-count">{materials.length}</span></button>
                </div>
                {panel === "prototype" && prototype && <div className="canvas-actions"><button className={`save-status${saved ? " is-saved" : ""}`} onClick={() => void persistPrototype()} disabled={savingPrototype}><Save size={14} />{savingPrototype ? "Saving" : saved ? "Saved" : "Save"}</button><button className="download-button" onClick={downloadPrototype}><ArrowDownToLine size={14} /><span>HTML</span></button></div>}
                {panel === "plan" && plan && <button className="save-status" onClick={() => void persistPlan()}><Save size={14} />Save plan</button>}
                {panel === "notes" && <button className="small-add" onClick={() => setNoteForm((value) => value ? null : "context")}><Plus size={14} /> Add material</button>}
              </div>
              <div className="canvas">
                {loadingNotes ? (
                  <div className="canvas-loading"><i /><i /><i /></div>
                ) : panel === "prototype" ? (
                  prototype ? <div className="prototype-layout">
                    <div className="source-pane"><div className="pane-caption"><span><i className="live-dot" /> SOURCE</span><span>HTML · LOCAL</span></div><textarea aria-label="Prototype HTML source" spellCheck={false} value={prototypeSource} onChange={(event) => { setPrototypeSource(event.target.value); setSaved(false); }} /></div>
                    <div className="preview-pane"><div className="pane-caption"><span>PREVIEW</span><span className="sandbox-label">SANDBOXED</span></div><iframe title="Safe HTML prototype preview" sandbox="allow-scripts" srcDoc={safePreviewDocument(prototypeSource)} /></div>
                  </div> : <div className="empty-canvas"><div className="empty-symbol"><Code2 size={22} /></div><h2>No prototype yet</h2><p>Write a short brief above to create a reviewable plan and a single-file HTML draft.</p><div className="empty-meta"><span>01 — BRIEF</span><span>02 — GENERATE</span><span>03 — REFINE</span></div></div>
                ) : panel === "plan" ? (
                  plan ? <div className="plan-editor"><div className="plan-intro"><span className="eyebrow">A WORKING PLAN</span><span>EDITABLE · SAVED IN PROJECT</span></div><textarea aria-label="Project plan" value={planSource} onChange={(event) => setPlanSource(event.target.value)} /></div> : <div className="empty-canvas"><div className="empty-symbol"><BookOpen size={22} /></div><h2>The plan comes first</h2><p>Generate a draft to get a clear, reviewable path from idea to first version.</p></div>
                ) : (
                  <div className="materials-board">
                    <div className="materials-heading"><div><span className="eyebrow">PROJECT MATERIALS</span><h2>Notes & references</h2></div><button className="outlined-button" onClick={() => setNoteForm((value) => value ? null : "context")}><Plus size={14} /> Add material</button></div>
                    {noteForm && <form className="material-form" onSubmit={addMaterial}>
                      <div className="form-type"><button type="button" className={noteForm === "context" ? "chosen" : ""} onClick={() => setNoteForm("context")}>Internal note</button><button type="button" className={noteForm === "reference" ? "chosen" : ""} onClick={() => setNoteForm("reference")}>Reference link</button></div>
                      <input className={inputClass()} value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder={noteForm === "reference" ? "Reference title" : "Note title"} required />
                      {noteForm === "reference" && <input className={inputClass()} type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://example.com" required />}
                      <textarea className={inputClass()} rows={4} value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder={noteForm === "reference" ? "What should this reference help with?" : "Context for the project…"} />
                      <div className="form-actions"><button type="button" className="text-button" onClick={() => setNoteForm(null)}>Cancel</button><button className="dark-button" disabled={savingNote}>{savingNote ? "Saving…" : "Save material"}</button></div>
                    </form>}
                    {!materials.length && !noteForm ? <div className="material-empty"><span className="empty-symbol"><FileText size={20} /></span><p>Keep useful context close to the work.</p><button onClick={() => setNoteForm("context")}><Plus size={14} /> Add a note or link</button></div> : <div className="material-list">
                      {materials.map((note) => {
                        const rawUrl = note.category === "external-reference" ? note.content.match(/^URL:\s*(.+)$/m)?.[1]?.trim() : "";
                        let url = "";
                        if (rawUrl) {
                          try {
                            const parsed = new URL(rawUrl);
                            if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.href;
                          } catch { /* Keep malformed user text visible, never turn it into a link. */ }
                        }
                        const body = url ? note.content.replace(/^URL:\s*.+\n*/m, "") : note.content;
                        return <article className="material-item" key={note.id}>
                          <span className="material-mark">{url ? <ExternalLink size={16} /> : <FileText size={16} />}</span>
                          <div className="material-text"><span className="eyebrow">{url ? "REFERENCE" : "INTERNAL NOTE"}</span><h3>{note.title}</h3>{url && <a href={url} target="_blank" rel="noreferrer">{url}<ArrowUpRight size={12} /></a>}<p>{body}</p></div>
                          <button className="remove-material" title="Delete material" onClick={() => void removeNote(note)}><Trash2 size={14} /></button>
                        </article>;
                      })}
                    </div>}
                    <p className="materials-footnote">Links are stored as text only. Pablo won’t open or fetch them.</p>
                  </div>
                )}
              </div>
              <footer className="workbench-footer"><span><i className="live-dot" /> {prototype ? "DRAFT SAVED IN THIS PROJECT" : "READY FOR A FIRST DRAFT"}</span><span>{selected.type === "income" ? "REVIEW ONLY · NO PAYOUTS OR GUARANTEES" : "YOUR WORK STAYS PRIVATE"}</span></footer>
            </>
          )}
        </section>
      </div>
      <style>{`
        :root{--paper:#f5f3ec;--surface:#fbfaf6;--ink:#24231f;--muted:#858175;--line:#e5e2d8;--accent:#c4ed66;--serif:Georgia,'Times New Roman',serif;--sans:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
        .create-workspace,.create-signin{min-height:100dvh;background:var(--paper);color:var(--ink);font-family:var(--sans)}
        .create-workspace{display:flex;flex-direction:column}
        .workspace-topbar{height:52px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 28px;border-bottom:1px solid var(--line);background:#faf9f4}
        .back-link{display:flex;align-items:center;gap:8px;width:max-content;font-size:12px;font-weight:600;color:#625f54;text-decoration:none}.back-link:hover{color:#171714}
        .topbar-title{display:flex;align-items:center;gap:9px;font:500 10px var(--mono);letter-spacing:.11em}
        .brand-mark{display:grid;place-items:center;width:23px;height:23px;background:#272620;color:#eff3e3;border-radius:50%;font:600 12px var(--serif)}
        .private-label{justify-self:end;display:flex;gap:6px;align-items:center;font:10px var(--mono);letter-spacing:.08em;color:#7c796d}
        .workspace-body{display:grid;grid-template-columns:232px minmax(0,1fr);flex:1;min-height:0}
        .project-rail{display:flex;flex-direction:column;border-right:1px solid var(--line);padding:23px 14px 15px 20px;background:#f0eee7;min-height:calc(100dvh - 52px)}
        .rail-heading{display:flex;justify-content:space-between;align-items:center;padding:0 5px 15px}
        .eyebrow{font:10px var(--mono);letter-spacing:.08em;color:#8a877c}
        .icon-button{width:28px;height:28px;border:1px solid #d9d6cc;border-radius:8px;background:#f9f8f2;color:#3e3c35;display:grid;place-items:center;cursor:pointer}.icon-button:hover{background:#fff}
        .project-list{display:grid;gap:4px}
        .project-item{width:100%;display:flex;align-items:center;gap:10px;padding:10px 9px;border:0;border-radius:10px;text-align:left;background:transparent;color:var(--ink);cursor:pointer;transition:background .15s,transform .15s}
        .project-item:hover{background:#e9e7de}.project-item.active{background:#fffefa;box-shadow:0 1px 2px #2928200c}
        .project-icon{width:30px;height:30px;border:1px solid #e4e1d7;border-radius:9px;background:#f4f2eb;display:grid;place-items:center;color:#777469;flex:none}
        .project-copy{display:grid;min-width:0;gap:3px;flex:1}.project-copy b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.project-copy small{font:9px var(--mono);color:#969287;text-transform:uppercase;letter-spacing:.04em}
        .project-dot{width:5px;height:5px;border-radius:50%;background:transparent}.project-item.active .project-dot{background:#b8df58}
        .rail-footer{display:flex;align-items:center;gap:8px;margin-top:auto;padding:16px 3px 0;color:#aaa69b;font:8px var(--mono);letter-spacing:.08em;white-space:nowrap}.foot-rule{height:1px;background:#dedbd1;flex:1}
        .new-project-form{display:grid;gap:8px;padding:2px 4px 15px}.new-project-form input,.new-project-form select,.new-project-form textarea{font-size:12px;padding:10px 11px}
        .form-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px}.text-button{border:0;background:none;color:#777367;font-size:12px;cursor:pointer}.dark-button{display:inline-flex;justify-content:center;align-items:center;gap:7px;border:0;border-radius:9px;background:#292821;color:#f7f6ef;padding:10px 14px;font:600 12px var(--sans);cursor:pointer;transition:transform .15s,background .15s}.dark-button:hover{background:#11110f;transform:translateY(-1px)}.dark-button:disabled{opacity:.55;cursor:wait}
        .rail-empty{margin:28px 4px;padding:19px 12px;border:1px dashed #d5d1c6;border-radius:13px;text-align:center;color:#858175}.empty-orbit{margin:auto;display:grid;place-items:center;width:36px;height:36px;background:#e7ebd9;border-radius:50%;color:#68734e}.rail-empty p{font:13px/1.6 var(--serif);margin:12px 0}.rail-empty button,.material-empty button{border:0;background:none;color:#48473f;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:5px;cursor:pointer}
        .rail-error{margin:12px 4px;color:#776c61;font-size:12px;line-height:1.5}.rail-error button{display:flex;align-items:center;gap:6px;border:0;background:none;padding:0;color:#313029;cursor:pointer}
        .project-skeletons,.loading-skeleton,.canvas-loading{display:grid;gap:9px;padding:8px}.project-skeletons i,.loading-skeleton i,.canvas-loading i{display:block;height:45px;border-radius:9px;background:linear-gradient(90deg,#e9e6dd,#f2f0e8,#e9e6dd);background-size:200% 100%;animation:skeleton 1.4s ease-in-out infinite}
        .workbench{padding:36px clamp(20px,4vw,60px) 17px;display:flex;flex-direction:column;min-width:0;max-width:1500px;width:100%;margin:0 auto}
        .project-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}
        .project-heading h1{font:500 clamp(29px,4vw,43px)/1.02 var(--serif);letter-spacing:-.035em;margin:8px 0 7px}.project-heading p{margin:0;color:#827f74;font-size:12px}
        .project-head-actions{display:flex;align-items:center;gap:4px}.edit-project{display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;border-radius:8px;background:transparent;color:#777468;padding:8px;font-size:11px;cursor:pointer}.edit-project:hover{border-color:#dedbd2;background:#fbfaf6;color:#292821}
        .project-edit-form{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(130px,.8fr) minmax(180px,1.3fr) auto;gap:7px;align-items:center;flex:1}.project-edit-form input,.project-edit-form select{font-size:11px;padding:9px 10px}.project-edit-actions{display:flex;align-items:center;gap:8px;white-space:nowrap}.project-edit-actions .dark-button{padding:9px 11px}
        .delete-project{display:inline-flex;gap:7px;align-items:center;border:1px solid transparent;border-radius:8px;background:transparent;color:#9a9389;padding:8px;font-size:11px;cursor:pointer}.delete-project:hover{border-color:#e5c9bd;color:#a75e4b;background:#fcf5f0}
        .brief-strip{display:grid;grid-template-columns:205px minmax(0,1fr);gap:14px;align-items:center;padding:14px 16px;border:1px solid #e0ddd2;background:#fbfaf5;border-radius:13px}
        .brief-label{display:flex;gap:11px;align-items:center}.step-number{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:#e9eddc;color:#686d50;font:11px var(--mono)}.brief-label div{display:grid;gap:4px}.brief-label b{font-size:12px}.brief-label small{font-size:10px;color:#969287}
        .brief-control{display:flex;align-items:center;gap:10px}.brief-control textarea{flex:1;resize:vertical;min-height:48px;max-height:120px;border:0;outline:0;background:transparent;color:#282720;font:13px/1.5 var(--sans);padding:9px 4px}.brief-control textarea::placeholder{color:#aaa69b}
        .generate-button{display:flex;align-items:center;justify-content:center;gap:8px;flex:none;background:var(--accent);border:1px solid #b3d75b;border-radius:9px;color:#283018;padding:11px 13px;font:600 11px var(--sans);cursor:pointer;transition:transform .15s}.generate-button:hover:not(:disabled){transform:translateY(-1px)}.generate-button:disabled{opacity:.58;cursor:not-allowed}.spin{animation:spin 1s linear infinite}
        .action-alert{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;margin-top:12px;border:1px solid #e7cfc2;border-radius:9px;background:#fbf2ed;color:#855341;font-size:12px}.action-alert button{border:0;background:transparent;color:inherit;cursor:pointer}
        .canvas-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:24px;border-bottom:1px solid #dfdcd2;min-height:43px}
        .canvas-tabs{display:flex;align-items:center;gap:4px;overflow-x:auto;scrollbar-width:none}.canvas-tabs button{display:flex;align-items:center;gap:7px;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:none;color:#89867b;padding:12px 12px 10px;font:500 11px var(--sans);cursor:pointer}.canvas-tabs button.selected{border-bottom-color:#303027;color:#282720}.tab-count{display:grid;place-items:center;min-width:16px;height:16px;padding:0 3px;background:#e7e5dc;border-radius:9px;font:9px var(--mono)}
        .canvas-actions{display:flex;align-items:center;gap:6px}.save-status,.download-button,.small-add{display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e1ded4;border-radius:8px;background:#fbfaf6;color:#666358;padding:7px 10px;font-size:10px;cursor:pointer}.save-status:hover,.download-button:hover,.small-add:hover{border-color:#b9b6aa;color:#282720}.save-status.is-saved{color:#62753a}.download-button{padding:7px 9px}.small-add{font-size:11px}
        .canvas{position:relative;flex:1;min-height:300px;margin-top:13px;border:1px solid #e3e0d6;border-radius:13px;overflow:hidden;background:#fbfaf7}
        .prototype-layout{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(280px,1.1fr);height:clamp(350px,53vh,590px)}
        .source-pane,.preview-pane{display:flex;min-width:0;flex-direction:column}.source-pane{border-right:1px solid #e4e1d8;background:#f8f7f2}.pane-caption{height:37px;display:flex;justify-content:space-between;align-items:center;padding:0 13px;border-bottom:1px solid #e6e3da;color:#89867b;font:9px var(--mono);letter-spacing:.06em}.pane-caption>span{display:flex;align-items:center;gap:7px}.live-dot{width:6px;height:6px;border-radius:50%;background:#9bc749;display:inline-block}
        .source-pane textarea{flex:1;min-height:0;resize:none;border:0;outline:0;background:transparent;padding:15px;color:#47463f;font:11px/1.7 var(--mono);tab-size:2}
        .sandbox-label{border:1px solid #e2dfd5;border-radius:5px;padding:3px 5px;font-size:8px}
        .preview-pane iframe{width:100%;height:100%;border:0;background:#fff}
        .empty-canvas{min-height:300px;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px}.empty-symbol{width:44px;height:44px;border:1px solid #e4e1d7;border-radius:14px;display:grid;place-items:center;background:#f1efe7;color:#737166}.empty-canvas h2{font:500 22px var(--serif);margin:14px 0 6px}.empty-canvas p{max-width:340px;margin:0;color:#8e8b80;font-size:12px;line-height:1.65}.empty-meta{display:flex;gap:16px;margin-top:25px;color:#a4a094;font:8px var(--mono);letter-spacing:.05em}
        .plan-editor{padding:24px clamp(16px,3vw,34px);min-height:300px}.plan-intro{display:flex;justify-content:space-between;gap:10px;color:#aaa69a;font:9px var(--mono);letter-spacing:.04em;margin-bottom:14px}.plan-editor textarea{width:100%;min-height:290px;resize:vertical;border:0;outline:0;background:transparent;color:#3d3b34;font:14px/1.8 var(--serif)}
        .materials-board{padding:23px clamp(16px,3vw,30px)}.materials-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.materials-heading h2{font:500 24px var(--serif);margin:6px 0 0}.outlined-button{display:flex;align-items:center;gap:6px;border:1px solid #dedbd2;border-radius:8px;background:transparent;padding:8px 10px;font-size:11px;color:#565449;cursor:pointer}
        .material-form{display:grid;gap:9px;padding:14px;margin-bottom:16px;border:1px solid #e5e2d8;border-radius:12px;background:#f7f6f0}.material-form input,.material-form textarea{font-size:12px}.form-type{display:flex;gap:5px}.form-type button{border:1px solid transparent;border-radius:7px;background:transparent;color:#8b887c;padding:6px 9px;font-size:10px;cursor:pointer}.form-type button.chosen{border-color:#e2dfd5;background:#fffefa;color:#34332d}
        .material-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:10px}.material-item{display:flex;align-items:flex-start;gap:11px;min-width:0;padding:14px 13px;border:1px solid #e7e4db;border-radius:11px;background:#fffefa}.material-mark{display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:9px;background:#f0eee6;color:#777468}.material-text{min-width:0;flex:1}.material-text .eyebrow{font-size:8px}.material-text h3{font-size:13px;margin:5px 0 3px;overflow-wrap:anywhere}.material-text a{display:flex;align-items:center;gap:3px;color:#78864c;font-size:10px;overflow-wrap:anywhere}.material-text p{white-space:pre-wrap;overflow-wrap:anywhere;color:#878478;font-size:11px;line-height:1.55;margin:7px 0 0}.remove-material{border:0;background:none;color:#aaa69b;padding:4px;cursor:pointer}.remove-material:hover{color:#a75e4b}
        .material-empty{display:grid;justify-items:center;gap:10px;padding:32px 10px;border:1px dashed #dedbd1;border-radius:12px;color:#8f8b80}.material-empty p{font:14px var(--serif);margin:0}
        .materials-footnote{margin:17px 0 0;color:#a6a297;font-size:10px}
        .workbench-footer{display:flex;justify-content:space-between;gap:12px;margin-top:12px;color:#9b988c;font:8px var(--mono);letter-spacing:.06em}.workbench-footer span:first-child{display:flex;align-items:center;gap:7px}
        .welcome-board{position:relative;display:flex;flex-direction:column;justify-content:center;flex:1;min-height:540px;overflow:hidden;padding:clamp(28px,7vw,90px);border:1px solid #e4e1d7;border-radius:17px;background:#fbfaf5}.welcome-grid{position:absolute;inset:0;pointer-events:none;opacity:.38;background-image:linear-gradient(#dedbd2 1px,transparent 1px),linear-gradient(90deg,#dedbd2 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(90deg,transparent 5%,black 75%)}.welcome-board>*:not(.welcome-grid){position:relative}.welcome-board h1{max-width:650px;margin:20px 0 15px;font:500 clamp(47px,8vw,92px)/.91 var(--serif);letter-spacing:-.055em}.welcome-board h1 em{font-weight:400;color:#8d8a7e}.welcome-board>p{max-width:360px;color:#817e73;font-size:14px;line-height:1.7}.welcome-cta{width:max-content;margin-top:15px;padding:13px 17px}.welcome-stamp{position:absolute!important;right:clamp(22px,5vw,65px);bottom:30px;display:flex;align-items:center;gap:10px;color:#a4a094;font:9px var(--mono);letter-spacing:.08em}.welcome-stamp span:first-child{color:#5d5b50}.welcome-stamp i{width:40px;height:1px;background:#c9c6ba}
        .create-loading{min-height:100dvh;background:var(--paper);display:grid;place-items:center}.loading-skeleton{width:min(320px,70vw)}.loading-skeleton i{height:22px}
        @keyframes spin{to{transform:rotate(360deg)}}@keyframes skeleton{0%{background-position:100% 0}100%{background-position:-100% 0}}
        @media(max-width:760px){.workspace-topbar{padding:0 13px;height:48px}.workspace-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}.project-rail{min-height:auto;border-right:0;border-bottom:1px solid var(--line);padding:10px 12px}.rail-heading{padding:0 2px 8px}.rail-heading .eyebrow{font-size:9px}.project-list{display:flex;overflow-x:auto;gap:5px;scrollbar-width:none}.project-item{width:auto;min-width:145px;padding:7px}.project-item .project-copy b{max-width:95px}.project-skeletons{display:flex}.project-skeletons i{min-width:130px;height:40px}.rail-footer{display:none}.rail-empty{margin:5px 0;padding:12px;display:flex;align-items:center;gap:10px;text-align:left}.rail-empty .empty-orbit{margin:0;flex:none}.rail-empty p{flex:1;margin:0;font-size:12px}.workbench{padding:22px 13px 14px}.project-header{margin-bottom:17px}.project-heading h1{font-size:32px}.project-edit-form{grid-template-columns:1fr 1fr}.project-edit-form input:nth-of-type(2){grid-column:1/-1}.project-head-actions{gap:0}.edit-project span,.delete-project span{display:none}.brief-strip{grid-template-columns:1fr;gap:5px;padding:12px}.brief-control{align-items:stretch}.brief-control textarea{min-width:0;font-size:12px}.generate-button{width:43px;padding:8px}.generate-button span{display:none}.canvas-bar{margin-top:15px}.canvas-tabs{gap:0}.canvas-tabs button{padding:11px 8px 9px;font-size:10px;gap:5px}.canvas-actions{gap:4px}.save-status,.download-button{padding:7px}.canvas{min-height:280px}.prototype-layout{grid-template-columns:1fr;grid-template-rows:minmax(180px,.8fr) minmax(220px,1fr);height:clamp(440px,65vh,700px)}.source-pane{border-right:0;border-bottom:1px solid #e4e1d8}.source-pane textarea{padding:10px;font-size:10px}.pane-caption{height:32px}.empty-meta{gap:9px;font-size:7px}.materials-heading h2{font-size:21px}.workbench-footer{font-size:7px;line-height:1.5}.workbench-footer span:last-child{text-align:right}.welcome-board{min-height:440px;padding:28px 20px}.welcome-board h1{font-size:clamp(49px,14vw,72px)}.welcome-board>p{font-size:13px}.welcome-stamp{right:17px;bottom:19px;font-size:8px}.welcome-stamp i{width:24px}}
        @media(max-width:380px){.topbar-title{font-size:8px;letter-spacing:.06em}.private-label{font-size:8px}.canvas-tabs button{padding-left:6px;padding-right:6px}.canvas-tabs button svg{display:none}.workbench{padding-left:10px;padding-right:10px}.brief-label small{font-size:9px}.generate-button{width:37px}.download-button span{display:none}}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
      `}</style>
    </main>
  );
}