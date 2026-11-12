import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOrganizationCustomAppQueryKey,
  getListOrganizationCustomAppRecordsQueryKey,
  getListOrganizationCustomAppsQueryKey,
  useCreateOrganizationCustomApp,
  useCreateOrganizationCustomAppRecord,
  useDeleteOrganizationCustomApp,
  useDeleteOrganizationCustomAppRecord,
  useGetOrganizationCustomApp,
  useListOrganizationCustomAppRecords,
  useListOrganizationCustomApps,
  useSetOrganizationCustomAppStatus,
  useUpdateOrganizationCustomApp,
  useUpdateOrganizationCustomAppRecord,
} from "@workspace/api-client-react";
import type { OrganizationCustomAppField, OrganizationCustomAppRecord } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import PlatformAPI from "@/pages/PlatformAPI";
import {
  ArrowLeft, ArrowUpRight, Check, ChevronDown, CircleAlert, FilePlus2, Layers3, LoaderCircle,
  MoreHorizontal, Pencil, Plus, Settings2, Trash2, X,
} from "lucide-react";

type AppField = OrganizationCustomAppField;
type Draft = { name: string; description: string; fields: AppField[] };
const blankField = (): AppField => ({ key: "", label: "", type: "text", required: false });
const blankDraft = (): Draft => ({ name: "", description: "", fields: [blankField()] });
const panel = "rounded-xl border border-[#dfdbd1] bg-[#fffefa]";
const control = "w-full rounded-lg border border-[#d9d5ca] bg-white px-3 py-2.5 text-[15px] text-[#20201d] outline-none transition focus:border-[#282822] focus:ring-2 focus:ring-[#282822]/10";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";

function makeKey(label: string) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}
function dateLabel(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
function SignInPrompt({ onSignIn }: { onSignIn: () => void }) {
  return <section className={`${panel} mx-auto max-w-md px-6 py-12 text-center`}>
    <h1 className="font-display text-xl font-bold">Sign in to continue</h1>
    <p className="mt-2 text-sm text-[#77746b]">Your organization’s apps and connections require a SALARYMAN account.</p>
    <button onClick={onSignIn} className={`${button} mt-5 bg-[#25251f] text-white`}>Sign in</button>
  </section>;
}
function AppEditor({ initial, saving, onClose, onSave }: {
  initial?: Draft; saving: boolean; onClose: () => void; onSave: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial ? { ...initial, fields: initial.fields.map(f => ({ ...f })) } : blankDraft());
  const [validation, setValidation] = useState("");
  const updateField = (index: number, patch: Partial<AppField>) =>
    setDraft(d => ({ ...d, fields: d.fields.map((field, i) => i === index ? { ...field, ...patch } : field) }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const fields = draft.fields.map(f => ({ ...f, key: makeKey(f.key || f.label), label: f.label.trim(), options: f.type === "select" ? (f.options ?? []).filter(Boolean) : undefined }));
    if (!draft.name.trim()) return setValidation("Add a page name.");
    if (!fields.length || fields.some(f => !f.label || !f.key)) return setValidation("Every field needs a label.");
    if (fields.some(f => f.type === "select" && !f.options?.length)) return setValidation("Add at least one choice to each select field.");
    if (new Set(fields.map(f => f.key)).size !== fields.length) return setValidation("Field labels must produce unique keys.");
    setValidation("");
    onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim(), fields });
  };
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#171713]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={submit} className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[#dfdbd1] bg-[#fbfaf6] p-5 shadow-2xl sm:rounded-2xl sm:p-7">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div><p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-[#817e73]">Page design</p><h2 className="font-display text-2xl font-bold tracking-tight">{initial ? "Edit page" : "New page"}</h2></div>
        <button type="button" onClick={onClose} className="mobile-tap-target grid h-10 w-10 place-items-center rounded-lg hover:bg-[#eeece5]" aria-label="Close editor"><X size={18}/></button>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[#68665e] sm:col-span-2">PAGE NAME<input autoFocus maxLength={80} className={`${control} mt-1.5`} placeholder="Equipment requests" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}/></label>
        <label className="text-xs font-semibold text-[#68665e] sm:col-span-2">SHORT DESCRIPTION <span className="font-normal text-[#aaa69c]">OPTIONAL</span><textarea maxLength={240} rows={2} className={`${control} mt-1.5 resize-y`} placeholder="A shared list for the team." value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}/></label>
      </div>
      <div className="mb-3 mt-7 flex items-end justify-between"><div><h3 className="text-sm font-bold">Fields</h3><p className="mt-1 text-xs text-[#817e73]">Define what each record stores. Up to 20 fields.</p></div><span className="font-mono text-xs text-[#817e73]">{draft.fields.length}/20</span></div>
      <div className="space-y-3">
        {draft.fields.map((field, index) => <section key={index} className="rounded-xl border border-[#e2dfd7] bg-white p-3.5">
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <label className="text-[11px] font-semibold text-[#77746b]">FIELD LABEL<input className={`${control} mt-1 text-sm`} maxLength={80} placeholder="Item name" value={field.label} onChange={e => updateField(index, { label: e.target.value })}/></label>
            <label className="text-[11px] font-semibold text-[#77746b]">TYPE<select className={`${control} mt-1 text-sm`} value={field.type} onChange={e => updateField(index, { type: e.target.value as AppField["type"], options: e.target.value === "select" ? [""] : undefined })}>{["text","textarea","number","date","select","checkbox"].map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          </div>
          {field.type !== "checkbox" && <label className="mt-3 block text-[11px] font-semibold text-[#77746b]">PLACEHOLDER <span className="font-normal">OPTIONAL</span><input className={`${control} mt-1 text-sm`} maxLength={120} value={field.placeholder ?? ""} onChange={e => updateField(index, { placeholder: e.target.value || undefined })}/></label>}
          {field.type === "select" && <label className="mt-3 block text-[11px] font-semibold text-[#77746b]">CHOICES <span className="font-normal">ONE PER LINE</span><textarea rows={2} className={`${control} mt-1 text-sm`} value={(field.options ?? []).join("\n")} onChange={e => updateField(index, { options: e.target.value.split("\n").map(v => v.trim()).filter(Boolean) })} placeholder={"Open\nIn progress\nDone"}/></label>}
          <div className="mt-3 flex items-center justify-between">
            <label className="inline-flex min-h-10 items-center gap-2 text-sm text-[#55534c]"><input type="checkbox" checked={field.required} onChange={e => updateField(index, { required: e.target.checked })} className="h-4 w-4 accent-[#262621]"/>Required</label>
            <button type="button" disabled={draft.fields.length === 1} onClick={() => setDraft(d => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }))} className="mobile-tap-target inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs text-[#9b5146] hover:bg-[#faf0ed] disabled:opacity-40"><Trash2 size={14}/>Remove field</button>
          </div>
        </section>)}
      </div>
      <button type="button" disabled={draft.fields.length >= 20} onClick={() => setDraft(d => ({ ...d, fields: [...d.fields, blankField()] }))} className={`${button} mt-3 border border-dashed border-[#c9c4b8] bg-transparent text-[#49483f] hover:bg-[#f0eee8]`}><Plus size={16}/>Add field</button>
      {validation && <p role="alert" className="mt-3 text-sm text-[#a13e32]">{validation}</p>}
      <footer className="sticky bottom-[-20px] mt-6 flex justify-end gap-2 border-t border-[#e7e4dc] bg-[#fbfaf6] py-4 sm:bottom-[-28px]">
        <button type="button" className={`${button} text-[#55534c] hover:bg-[#eeece5]`} onClick={onClose}>Cancel</button>
        <button disabled={saving} className={`${button} bg-[#20201c] text-white hover:bg-[#393931]`}>{saving ? <LoaderCircle size={16} className="animate-spin"/> : <Check size={16}/>}Save page</button>
      </footer>
    </form>
  </div>;
}

function RecordEditor({ fields, initial, saving, onClose, onSave }: {
  fields: AppField[]; initial?: Record<string, unknown>; saving: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(initial ?? {}) }));
  const [validation, setValidation] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fields.some(f => f.required && (f.type === "checkbox" ? values[f.key] !== true : values[f.key] === undefined || values[f.key] === ""))) return setValidation("Complete each required field.");
    setValidation(""); onSave(values);
  };
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#171713]/45 p-0 sm:items-center sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[#fbfaf6] p-5 shadow-2xl sm:rounded-2xl sm:p-7">
      <div className="mb-5 flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#817e73]">Record</p><h2 className="mt-1 font-display text-2xl font-bold">{initial ? "Edit record" : "Add record"}</h2></div><button type="button" onClick={onClose} className="mobile-tap-target grid h-10 w-10 place-items-center rounded-lg hover:bg-[#eeece5]"><X size={18}/></button></div>
      <div className="space-y-4">{fields.map(f => <label key={f.key} className="block text-xs font-semibold text-[#68665e]">{f.label}{f.required && <span className="ml-1 text-[#a13e32]">*</span>}
        {f.type === "textarea" ? <textarea rows={3} required={f.required} placeholder={f.placeholder} className={`${control} mt-1.5 resize-y`} value={String(values[f.key] ?? "")} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}/> :
          f.type === "select" ? <select required={f.required} className={`${control} mt-1.5`} value={String(values[f.key] ?? "")} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}><option value="">Choose…</option>{(f.options ?? []).map(opt => <option value={opt} key={opt}>{opt}</option>)}</select> :
          f.type === "checkbox" ? <span className="mt-2 flex min-h-11 items-center gap-2 text-sm font-normal text-[#34342e]"><input type="checkbox" checked={values[f.key] === true} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.checked }))} className="h-4 w-4 accent-[#262621]"/>Yes</span> :
          <input type={f.type} required={f.required} placeholder={f.placeholder} className={`${control} mt-1.5`} value={String(values[f.key] ?? "")} onChange={e => setValues(v => ({ ...v, [f.key]: f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value }))}/>}
      </label>)}</div>
      {validation && <p role="alert" className="mt-3 text-sm text-[#a13e32]">{validation}</p>}
      <div className="mt-6 flex justify-end gap-2 border-t border-[#e7e4dc] pt-4"><button type="button" className={`${button} text-[#55534c] hover:bg-[#eeece5]`} onClick={onClose}>Cancel</button><button disabled={saving} className={`${button} bg-[#20201c] text-white`}>{saving ? <LoaderCircle size={16} className="animate-spin"/> : <Check size={16}/>}Save record</button></div>
    </form>
  </div>;
}

export default function MyApps() {
  const { appSlug } = useParams<{ appSlug?: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const signIn = () => login(appSlug === "connections" ? "/my-apps/connections" : "/my-apps");
  const isConsole = appSlug === "connections";
  const pageSlug = isConsole ? undefined : appSlug;
  const { org, loading: orgLoading } = useOrg();
  const queryClient = useQueryClient();
  const orgId = org?.id;
  const listKey = [...getListOrganizationCustomAppsQueryKey(), "active-org", orgId ?? "none"];
  const appsQuery = useListOrganizationCustomApps({ query: { enabled: !!orgId && !orgLoading, queryKey: listKey } });
  const detailKey = [...getGetOrganizationCustomAppQueryKey(pageSlug ?? ""), "active-org", orgId ?? "none"];
  const detailQuery = useGetOrganizationCustomApp(pageSlug ?? "", { query: { enabled: !!orgId && !!pageSlug && !orgLoading, queryKey: detailKey } });
  const [offset, setOffset] = useState(0);
  const recordsKey = [...getListOrganizationCustomAppRecordsQueryKey(pageSlug ?? "", offset), "active-org", orgId ?? "none"];
  const recordsQuery = useListOrganizationCustomAppRecords(pageSlug ?? "", offset, { query: { enabled: !!orgId && !!pageSlug && !!detailQuery.data && !orgLoading, queryKey: recordsKey } });
  const createApp = useCreateOrganizationCustomApp();
  const updateApp = useUpdateOrganizationCustomApp();
  const setStatus = useSetOrganizationCustomAppStatus();
  const deleteApp = useDeleteOrganizationCustomApp();
  const createRecord = useCreateOrganizationCustomAppRecord();
  const updateRecord = useUpdateOrganizationCustomAppRecord();
  const deleteRecord = useDeleteOrganizationCustomAppRecord();
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [recordEditor, setRecordEditor] = useState<OrganizationCustomAppRecord | "new" | null>(null);
  const [allRecords, setAllRecords] = useState<OrganizationCustomAppRecord[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apps = appsQuery.data?.items ?? [];
  const permissions = detailQuery.data?.permissions ?? appsQuery.data?.permissions;
  const app = detailQuery.data?.app;
  const records = allRecords;
  const visibleApps = useMemo(() => apps.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(filter.toLowerCase())), [apps, filter]);
  const refreshApps = () => queryClient.invalidateQueries({ queryKey: listKey });
  const refreshDetail = () => queryClient.invalidateQueries({ queryKey: detailKey });
  const refreshRecords = async () => {
    setAllRecords([]);
    setOffset(0);
    await queryClient.invalidateQueries({ queryKey: [...getListOrganizationCustomAppRecordsQueryKey(pageSlug ?? "", 0), "active-org", orgId ?? "none"] });
  };

  useEffect(() => { setOffset(0); setAllRecords([]); setError(""); }, [appSlug, orgId]);
  useEffect(() => {
    const page = recordsQuery.data?.items;
    if (!page) return;
    setAllRecords(previous => {
      if (offset === 0) return page;
      const byId = new Map(previous.map(record => [record.id, record]));
      page.forEach(record => byId.set(record.id, record));
      return Array.from(byId.values());
    });
  }, [recordsQuery.data, offset]);

  async function saveApp(draft: Draft) {
    setBusy(true); setError("");
    try {
    if (editor === "edit" && pageSlug) await updateApp.mutateAsync({ appSlug: pageSlug, data: draft });
      else {
        const result = await createApp.mutateAsync({ data: draft });
        setEditor(null); await refreshApps();
        const createdSlug = "app" in (result as object) ? (result as { app: { slug: string } }).app.slug : (result as { slug?: string }).slug;
        if (createdSlug) navigate(`/my-apps/${createdSlug}`);
      }
      setEditor(null); await Promise.all([refreshApps(), refreshDetail()]);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function publish(status: "draft" | "published") {
    if (!pageSlug) return;
    setBusy(true); setError("");
    try { await setStatus.mutateAsync({ appSlug: pageSlug, data: { status } }); await Promise.all([refreshDetail(), refreshApps()]); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function removeApp() {
    if (!app || !pageSlug || !window.confirm(`Delete “${app.name}” and all its records? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await deleteApp.mutateAsync({ appSlug: pageSlug }); await refreshApps(); navigate("/my-apps"); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function saveRecord(data: Record<string, unknown>) {
    if (!pageSlug) return;
    setBusy(true); setError("");
    try {
      if (recordEditor !== "new" && recordEditor) await updateRecord.mutateAsync({ appSlug: pageSlug, recordId: recordEditor.id, data: { data } });
      else await createRecord.mutateAsync({ appSlug: pageSlug, data: { data } });
      setRecordEditor(null); await refreshRecords();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function removeRecord(record: OrganizationCustomAppRecord) {
    if (!pageSlug || !window.confirm("Delete this record? This cannot be undone.")) return;
    setBusy(true); setError("");
    try { await deleteRecord.mutateAsync({ appSlug: pageSlug, recordId: record.id }); await refreshRecords(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (isConsole) return <main className="min-h-[100dvh] bg-[#f6f4ee] px-4 py-5 text-[#24241f] sm:px-8"><div className="mx-auto max-w-6xl">{authLoading ? <p className="py-12 text-center text-sm text-[#77746b]">Checking your session…</p> : !isAuthenticated ? <SignInPrompt onSignIn={signIn}/> : <><button onClick={() => navigate("/my-apps")} className={`${button} mb-4 border border-[#dedacf] bg-white`}><ArrowLeft size={16}/>My Apps</button><PlatformAPI embedded/></>}</div></main>;
  return <main className="min-h-[100dvh] bg-[#f6f4ee] px-4 pb-16 pt-5 text-[#24241f] sm:px-8 sm:pt-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex items-center justify-between gap-3 border-b border-[#dfdbd1] pb-4">
        <Link href="/my-apps" className="flex min-w-0 items-center gap-3 text-[#22221d]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25251f] text-[#faf9f4]"><Layers3 size={19}/></span><span><span className="block font-display text-lg font-bold tracking-tight">My Apps</span><span className="block text-xs text-[#79766c]">{org?.name ?? "Organization workspace"}</span></span></Link>
        <button data-testid="button-open-connections" onClick={() => navigate("/my-apps/connections")} className={`${button} border border-[#dedacf] bg-[#fffefa] px-3 text-xs sm:px-4 sm:text-sm`}><Settings2 size={16}/><span className="hidden sm:inline">API & Connections</span><span className="sm:hidden">Connections</span></button>
      </header>
      {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-[#e5bcb4] bg-[#fff6f3] px-4 py-3 text-sm text-[#8f3e32]"><CircleAlert size={17} className="mt-0.5 shrink-0"/><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16}/></button></div>}
      {authLoading || orgLoading ? <div className="space-y-3"><div className="h-7 w-48 animate-pulse rounded bg-[#e7e4dc]"/><div className="h-28 animate-pulse rounded-xl bg-[#e7e4dc]"/><div className="h-28 animate-pulse rounded-xl bg-[#e7e4dc]"/></div> :
        !isAuthenticated ? <SignInPrompt onSignIn={signIn}/> :
        !org ? <section className={`${panel} py-16 text-center`}><Layers3 className="mx-auto mb-3 text-[#89867b]" size={26}/><h1 className="font-display text-xl font-bold">Choose an organization</h1><p className="mt-2 text-sm text-[#77746b]">My Apps is available inside an active organization.</p></section> :
        pageSlug ? <section>
          {!app && (detailQuery.isLoading ? <div className="space-y-3"><div className="h-8 w-64 animate-pulse rounded bg-[#e7e4dc]"/><div className="h-32 animate-pulse rounded-xl bg-[#e7e4dc]"/></div> : detailQuery.isError ? <div className={`${panel} p-8 text-center`}><CircleAlert className="mx-auto mb-3 text-[#a13e32]"/><h2 className="font-bold">This page could not be loaded</h2><button onClick={() => detailQuery.refetch()} className={`${button} mt-4 bg-[#22221d] text-white`}>Try again</button></div> : null)}
          {app && <>
            <button onClick={() => navigate("/my-apps")} className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#66635a] hover:text-[#22221d]"><ArrowLeft size={16}/>All pages</button>
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0"><div className="mb-2 flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${app.status === "published" ? "bg-[#e8efe5] text-[#476240]" : "bg-[#ece9e1] text-[#716d62]"}`}>{app.status}</span><span className="text-xs text-[#89867b]">Updated {dateLabel(app.updatedAt)}</span></div><h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-app-name">{app.name}</h1><p className="mt-1.5 max-w-2xl text-sm text-[#716e64]">{app.description || "A shared organization page."}</p></div>
              <div className="flex flex-wrap gap-2">
                {permissions?.canManageApps && <><button disabled={busy} onClick={() => setEditor("edit")} className={`${button} border border-[#d9d5ca] bg-white`}><Pencil size={15}/>Edit</button><button disabled={busy} onClick={() => publish(app.status === "published" ? "draft" : "published")} className={`${button} bg-[#25251f] text-white`}>{busy ? <LoaderCircle className="animate-spin" size={15}/> : <ArrowUpRight size={15}/>} {app.status === "published" ? "Unpublish" : "Publish"}</button><button disabled={busy} onClick={removeApp} aria-label="Delete page" className="mobile-tap-target grid h-11 w-11 place-items-center rounded-lg border border-[#e2c7c1] bg-white text-[#9b5146] hover:bg-[#faf0ed]"><Trash2 size={16}/></button></>}
              </div>
            </div>
            {!permissions?.canEditRecords && <p className="mb-4 rounded-lg border border-[#e6e0d1] bg-[#f1eee5] px-4 py-3 text-xs text-[#716d62]">Read only. An organization manager can enable record editing.</p>}
            <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Records</h2><p className="text-xs text-[#817e73]">Typed entries shared in this organization</p></div><button data-testid="button-add-record" disabled={!permissions?.canEditRecords || busy} onClick={() => setRecordEditor("new")} className={`${button} bg-[#25251f] px-3 text-white sm:px-4`}><Plus size={16}/>Add record</button></div>
            {recordsQuery.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-[#e7e4dc]"/>)}</div> :
              recordsQuery.isError ? <div className={`${panel} p-8 text-center text-sm text-[#77746b]`}>Records did not load. <button className="font-semibold underline" onClick={() => recordsQuery.refetch()}>Try again</button></div> :
              records.length === 0 ? <div className={`${panel} grid justify-items-center px-5 py-14 text-center`}><FilePlus2 size={26} className="mb-3 text-[#858176]"/><h3 className="font-semibold">No records yet</h3><p className="mt-1 text-sm text-[#817e73]">{permissions?.canEditRecords ? "Add the first entry to this page." : "Records added by your team will appear here."}</p></div> :
              <div className="space-y-2">{records.map(record => <article key={record.id} data-testid={`record-${record.id}`} className={`${panel} p-4`}>
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{app.fields.map(field => <div key={field.key} className="min-w-0"><p className="mb-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#89867b]">{field.label}</p><p className="break-words text-sm text-[#292923]">{record.data[field.key] === true ? "Yes" : record.data[field.key] === false ? "No" : String(record.data[field.key] ?? "—")}</p></div>)}</div>
                <footer className="mt-4 flex items-center justify-between border-t border-[#eeece5] pt-3"><span className="text-[11px] text-[#89867b]">Updated {dateLabel(record.updatedAt)}</span>{permissions?.canEditRecords && <div className="flex gap-1"><button aria-label="Edit record" onClick={() => setRecordEditor(record)} className="mobile-tap-target grid h-10 w-10 place-items-center rounded-lg hover:bg-[#efede7]"><Pencil size={15}/></button><button aria-label="Delete record" onClick={() => removeRecord(record)} className="mobile-tap-target grid h-10 w-10 place-items-center rounded-lg text-[#9b5146] hover:bg-[#faf0ed]"><Trash2 size={15}/></button></div>}</footer>
              </article>)}</div>}
            {recordsQuery.data?.hasMore && <button disabled={recordsQuery.isFetching} onClick={() => setOffset(v => v + records.length)} className={`${button} mt-4 w-full border border-[#dedacf] bg-white`}>{recordsQuery.isFetching ? "Loading…" : "Load more records"}<ChevronDown size={15}/></button>}
          </>}
        </section> : <section>
          <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#858176]">Organization workspace</p><h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Small workflows.<br className="hidden sm:block"/> One shared place.</h1><p className="mt-3 max-w-lg text-sm text-[#716e64]">Make a structured page for the work that doesn’t have a home yet.</p></div>{permissions?.canManageApps && <button data-testid="button-create-app" onClick={() => setEditor("create")} className={`${button} bg-[#25251f] px-5 text-white`}><Plus size={17}/>New page</button>}</div>
          {appsQuery.isLoading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-xl bg-[#e7e4dc]"/> )}</div> :
            appsQuery.isError ? <div className={`${panel} p-8 text-center`}><CircleAlert className="mx-auto mb-3 text-[#a13e32]"/><h2 className="font-semibold">Pages didn’t load</h2><button onClick={() => appsQuery.refetch()} className={`${button} mt-4 bg-[#25251f] text-white`}>Try again</button></div> :
            apps.length === 0 ? <div className={`${panel} grid justify-items-center px-6 py-16 text-center`}><div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#eeece5]"><Layers3 size={24}/></div><h2 className="font-display text-xl font-bold">Nothing custom, yet</h2><p className="mt-2 max-w-sm text-sm text-[#817e73]">{permissions?.canManageApps ? "Create one useful page for a workflow SALARYMAN doesn’t already cover." : "An organization manager can create a page for this team."}</p>{permissions?.canManageApps && <button onClick={() => setEditor("create")} className={`${button} mt-5 bg-[#25251f] text-white`}><Plus size={16}/>Create a page</button>}</div> :
            <><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-semibold text-[#817e73]">{apps.length} {apps.length === 1 ? "PAGE" : "PAGES"}</p><input aria-label="Search pages" data-testid="input-search-apps" className={`${control} max-w-sm`} placeholder="Find a page" value={filter} onChange={e => setFilter(e.target.value)}/></div>
              <div className="grid gap-3 md:grid-cols-2">{visibleApps.map((item, index) => <article key={item.slug} data-testid={`card-app-${item.slug}`} className={`${panel} group relative flex min-h-36 flex-col justify-between p-5 transition hover:border-[#b9b4a8] hover:shadow-[0_8px_24px_rgba(30,28,22,.05)]`}><Link href={`/my-apps/${item.slug}`} className="absolute inset-0 rounded-xl" aria-label={`Open ${item.name}`}/><div className="relative pointer-events-none flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><span className="font-mono text-[10px] text-[#969286]">0{index+1}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.12em] ${item.status === "published" ? "bg-[#e8efe5] text-[#476240]" : "bg-[#eeece5] text-[#716d62]"}`}>{item.status}</span></div><h2 className="font-display text-xl font-bold tracking-tight">{item.name}</h2><p className="mt-1 line-clamp-2 text-sm text-[#77746b]">{item.description || "No description"}</p></div><ArrowUpRight className="mt-1 shrink-0 text-[#aaa69c] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#262621]" size={18}/></div><div className="pointer-events-none mt-5 flex items-center justify-between border-t border-[#eeece5] pt-3 text-[11px] text-[#89867b]"><span>{item.fields.length} {item.fields.length === 1 ? "field" : "fields"}</span><span>Edited {dateLabel(item.updatedAt)}</span></div></article>)}</div>
              {visibleApps.length === 0 && <div className={`${panel} p-8 text-center text-sm text-[#77746b]`}>No pages match “{filter}”.</div>}
            </>}
        </section>}
      {editor && <AppEditor initial={editor === "edit" && app ? { name: app.name, description: app.description, fields: app.fields } : undefined} saving={busy} onClose={() => setEditor(null)} onSave={saveApp}/>}
      {recordEditor && app && <RecordEditor fields={app.fields} initial={recordEditor === "new" ? undefined : recordEditor.data} saving={busy} onClose={() => setRecordEditor(null)} onSave={saveRecord}/>}
    </div>
  </main>;
}
