import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import CrmRoutingPanel from "@/components/CrmRoutingPanel";
import CrmSyncPanel from "@/components/CrmSyncPanel";
import * as crmApi from "@workspace/api-client-react";
type CrmCustomField = {
  id: number;
  orgId: number;
  fieldKey: string;
  label: string;
  fieldType: "text" | "number" | "boolean" | "date" | "select";
  optionsJson: string[];
  required: boolean;
  archived: boolean;
  position: number;
};
type CrmImportPreview = {
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  candidates: Record<string, unknown>[];
  rows?: string[][];
};
const {
  getGetMyOrganizationsQueryKey,
  getSwitchOrganizationMutationKey,
  getCreateCrmCustomFieldMutationKey,
  getUpdateCrmCustomFieldMutationKey,
  getPreviewCrmLeadImportMutationKey,
  getApplyCrmLeadImportMutationKey,
  getExportCrmArchiveQueryKey,
  getListCrmCustomFieldsQueryKey,
  useApplyCrmLeadImport,
  useCreateCrmCustomField,
  useExportCrmArchive,
  useGetMyOrganizations,
  useListCrmCustomFields,
  usePreviewCrmLeadImport,
  useSwitchOrganization,
  useUpdateCrmCustomField,
} = crmApi as any;
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  Cloud,
  Download,
  Edit2,
  FileJson,
  Filter,
  History,
  Loader2,
  Lock,
  Mail,
  Phone,
  Plus,
  Search,
  Settings2,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface LeadRecord {
  id: number;
  orgId: number;
  importId: number | null;
  isLocked: boolean;
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
  source: string;
  status: string;
  assignedUserId: string | null;
  pabloNotesJson: string | null;
  customFieldsJson?: string | Record<string, unknown> | null;
  lastCalledAt: string | null;
  callCount: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface LeadNote {
  id: number;
  leadId: number;
  userId: string;
  userName: string | null;
  note: string;
  createdAt: string;
}

interface CallRecord {
  id: number;
  callerName: string | null;
  recipientNumber: string;
  status: string;
  direction: string;
  callType: string;
  durationSeconds: number;
  transcript: string | null;
  summary: string | null;
  startedAt: string;
}

interface CrmActivity {
  id: number;
  userId: string;
  channel: "call" | "voicemail" | "sms" | "comms";
  direction: string;
  phone: string;
  contactName: string | null;
  body: string | null;
  summary: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  status: string | null;
  occurredAt: string;
}

type OrganizationOption = {
  id: number;
  name: string;
  role: string;
};
type OrganizationsData = {
  org: Record<string, unknown> | null;
  allOrgs: Array<Record<string, unknown>>;
};

const STATUSES = [
  { value: "new", label: "NEW" },
  { value: "contacted", label: "CONTACTED" },
  { value: "qualified", label: "QUALIFIED" },
  { value: "proposal", label: "PROPOSAL" },
  { value: "closed_won", label: "CLOSED WON" },
  { value: "closed_lost", label: "CLOSED LOST" },
];

const IMPORT_FIELDS = [
  { value: "", label: "DO NOT IMPORT" },
  { value: "name", label: "LEAD NAME" },
  { value: "phone", label: "PHONE" },
  { value: "email", label: "EMAIL" },
  { value: "company", label: "COMPANY" },
  { value: "jobTitle", label: "JOB TITLE" },
  { value: "source", label: "SOURCE" },
  { value: "status", label: "STATUS" },
];

function statusLabel(status: string) {
  return STATUSES.find((item) => item.value === status)?.label ?? status.toUpperCase();
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function parseCustomValues(value: LeadRecord["customFieldsJson"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function objectValue(value: unknown, ...keys: string[]) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return keys.map((key) => record[key]).find((item) => item !== undefined);
}

function normalizeOrganizations(data: OrganizationsData | undefined): OrganizationOption[] {
  if (!data) return [];
  const parsed = data.allOrgs
    .map((entry: Record<string, unknown>) => {
      const organization = objectValue(entry, "organization", "org");
      const membership = objectValue(entry, "membership", "member");
      const id = Number(objectValue(organization, "id", "orgId") ?? objectValue(entry, "orgId", "organizationId"));
      if (!Number.isFinite(id)) return null;
      return {
        id,
        name: String(objectValue(organization, "name", "displayName", "slug") ?? `Organization ${id}`),
        role: String(objectValue(membership, "role") ?? ""),
      };
    })
  return parsed.filter((item): item is OrganizationOption => Boolean(item));
}

function findCurrentOrg(data: OrganizationsData | undefined, fallback: number | null) {
  const current = objectValue(data?.org, "id", "orgId");
  return Number.isFinite(Number(current)) ? Number(current) : fallback;
}

function FieldBadge({ field }: { field: CrmCustomField }) {
  return (
    <span className="inline-flex items-center border border-black/20 bg-[#f6f2ea] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/60">
      {field.fieldType}
    </span>
  );
}

export default function LeadsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const organizationsQuery = useGetMyOrganizations({ query: { enabled: isAuthenticated, queryKey: getGetMyOrganizationsQueryKey() } });
  const customFieldsQuery = useListCrmCustomFields({ query: { enabled: isAuthenticated, queryKey: getListCrmCustomFieldsQueryKey() } });
  const switchOrganization = useSwitchOrganization({ mutation: { mutationKey: getSwitchOrganizationMutationKey() } });
  const createCustomField = useCreateCrmCustomField({ mutation: { mutationKey: getCreateCrmCustomFieldMutationKey() } });
  const updateCustomField = useUpdateCrmCustomField({ mutation: { mutationKey: getUpdateCrmCustomFieldMutationKey() } });
  const previewImport = usePreviewCrmLeadImport({ mutation: { mutationKey: getPreviewCrmLeadImportMutationKey() } });
  const applyImport = useApplyCrmLeadImport({ mutation: { mutationKey: getApplyCrmLeadImportMutationKey() } });
  const archiveQuery = useExportCrmArchive({
    query: { enabled: false, queryKey: getExportCrmArchiveQueryKey() },
  });

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [role, setRole] = useState("employee");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>([]);
  const [leadCalls, setLeadCalls] = useState<CallRecord[]>([]);
  const [leadActivities, setLeadActivities] = useState<CrmActivity[]>([]);
  const [newNote, setNewNote] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", email: "", company: "", jobTitle: "" });
  const [saving, setSaving] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", company: "", jobTitle: "", assignedUserId: "" });

  const [showImport, setShowImport] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<CrmImportPreview | null>(null);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [existingRowPolicy, setExistingRowPolicy] = useState<"skip" | "update">("skip");
  const [authority, setAuthority] = useState<"import" | "crm">("import");
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fieldDraft, setFieldDraft] = useState({ fieldKey: "", label: "", fieldType: "text", options: "", required: false });
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);

  const admin = role === "owner" || role === "manager";
  const organizations = useMemo(() => normalizeOrganizations(organizationsQuery.data), [organizationsQuery.data]);
  const customFields = (customFieldsQuery.data as CrmCustomField[] | undefined) ?? [];
  const visibleFields = customFields.filter((field: CrmCustomField) => !field.archived).sort((a: CrmCustomField, b: CrmCustomField) => a.position - b.position);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("crm_google_sheets");
    if (!result) return;
    setNotice(result === "connected" ? "Google Sheets authorized for this organization." : "Google Sheets authorization was cancelled.");
    params.delete("crm_google_sheets");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const query = params.toString();
      const response = await apiFetch(`api/leads${query ? `?${query}` : ""}`);
      if (!response.ok) throw new Error("Unable to load leads");
      const data = await response.json();
      setLeads(data.leads ?? []);
      setRole(data.role ?? "employee");
      if (data.orgId) setOrgId(Number(data.orgId));
      if (data.members) setMemberMap(data.members);
    } catch (loadError) {
      setError(errorText(loadError, "Unable to load leads"));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    if (isAuthenticated) void fetchLeads();
  }, [isAuthenticated, fetchLeads]);

  useEffect(() => {
    const current = findCurrentOrg(organizationsQuery.data, orgId);
    if (current && current !== orgId) setOrgId(current);
  }, [organizationsQuery.data, orgId]);

  useEffect(() => {
    if (!isAuthenticated || !user || !orgId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const params = new URLSearchParams({
      userId: String(user.id),
      userName: "leads-listener",
      profileImageUrl: "",
      orgId: String(orgId),
    });
    const socket = new WebSocket(`${protocol}//${window.location.host}${base}/ws/chat?${params.toString()}`);
    socket.onmessage = (event) => {
      try {
        if (JSON.parse(event.data)._channel === "leads") void fetchLeads();
      } catch {
        /* A non-JSON socket message is not actionable here. */
      }
    };
    const interval = window.setInterval(() => void fetchLeads(), 30000);
    return () => {
      socket.close();
      window.clearInterval(interval);
    };
  }, [fetchLeads, isAuthenticated, orgId, user]);

  const selectOrganization = (nextOrgId: number) => {
    if (nextOrgId === orgId || switchOrganization.isPending) return;
    setError("");
    switchOrganization.mutate(
      { data: { orgId: nextOrgId } },
      {
        onSuccess: () => {
          setOrgId(nextOrgId);
          setSelectedLead(null);
          setShowSources(false);
          void queryClient.invalidateQueries({ queryKey: getGetMyOrganizationsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListCrmCustomFieldsQueryKey() });
          void fetchLeads();
          setNotice("Organization switched");
        },
        onError: (mutationError: unknown) => setError(errorText(mutationError, "Organization switch failed")),
      },
    );
  };

  const openDetail = async (lead: LeadRecord) => {
    setSelectedLead(lead);
    setDetailLoading(true);
    setLeadActivities([]);
    try {
      const [leadResponse, timelineResponse] = await Promise.all([
        apiFetch(`api/leads/${lead.id}`),
        apiFetch(`api/crm/leads/${lead.id}/timeline`),
      ]);
      if (leadResponse.ok) {
        const data = await leadResponse.json();
        setLeadNotes(data.notes ?? []);
        setLeadCalls(data.callHistory ?? []);
        if (data.lead) setSelectedLead(data.lead);
      }
      if (timelineResponse.ok) {
        const data = await timelineResponse.json();
        setLeadActivities(data.activities ?? []);
      }
    } catch (detailError) {
      setError(errorText(detailError, "Unable to load lead details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const addNote = async () => {
    if (!selectedLead || !newNote.trim()) return;
    try {
      const response = await apiFetch(`api/leads/${selectedLead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      if (!response.ok) throw new Error("Unable to add note");
      const data = await response.json();
      setLeadNotes((current) => [data.note, ...current]);
      setNewNote("");
    } catch (noteError) {
      setError(errorText(noteError, "Unable to add note"));
    }
  };

  const updateStatus = async (leadId: number, status: string) => {
    try {
      const response = await apiFetch(`api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Unable to update status");
      const data = await response.json();
      setLeads((current) => current.map((lead) => (lead.id === leadId ? data.lead : lead)));
      if (selectedLead?.id === leadId) setSelectedLead(data.lead);
    } catch (statusError) {
      setError(errorText(statusError, "Unable to update status"));
    }
  };

  const createLead = async () => {
    if (!addForm.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch("api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create lead");
      }
      setShowAddForm(false);
      setAddForm({ name: "", phone: "", email: "", company: "", jobTitle: "" });
      await fetchLeads();
      setNotice("Lead added");
    } catch (createError) {
      setError(errorText(createError, "Failed to create lead"));
    } finally {
      setSaving(false);
    }
  };

  const saveLead = async () => {
    if (!editingLead) return;
    setSaving(true);
    try {
      const response = await apiFetch(`api/leads/${editingLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update lead");
      }
      setEditingLead(null);
      await fetchLeads();
      if (selectedLead?.id === editingLead.id) await openDetail({ ...editingLead, ...editForm });
      setNotice("Lead updated");
    } catch (saveError) {
      setError(errorText(saveError, "Failed to update lead"));
    } finally {
      setSaving(false);
    }
  };

  const deleteLead = async (id: number) => {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    try {
      const response = await apiFetch(`api/leads/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete lead");
      setLeads((current) => current.filter((lead) => lead.id !== id));
      if (selectedLead?.id === id) setSelectedLead(null);
      setNotice("Lead deleted");
    } catch (deleteError) {
      setError(errorText(deleteError, "Failed to delete lead"));
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const exportLegacy = async (kind: "csv" | "xlsx") => {
    try {
      const response = await apiFetch(`api/leads/export/${kind}`);
      if (!response.ok) throw new Error("Export failed");
      downloadBlob(await response.blob(), `salaryman-leads-${Date.now()}.${kind}`);
    } catch (exportError) {
      setError(errorText(exportError, "Export failed"));
    }
  };

  const exportArchive = async () => {
    try {
      const result = await archiveQuery.refetch();
      if (!result.data) throw new Error("Archive export was empty");
      downloadBlob(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }), `salaryman-crm-archive-${Date.now()}.json`);
      setNotice("Archive downloaded");
    } catch (archiveError) {
      setError(errorText(archiveError, "Archive export failed"));
    }
  };

  const handleFile = (file: File) => {
    setImportFileName(file.name);
    setImportResult(null);
    previewImport.mutate(
      { data: { file } },
      {
        onSuccess: (preview: CrmImportPreview) => {
          setImportPreview(preview);
          const nextMapping: Record<string, string> = {};
          preview.headers.forEach((header: string) => {
            const normalized = header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
            const canonical = IMPORT_FIELDS.find((field) => field.value && field.value.toLowerCase() === normalized);
            const custom = visibleFields.find((field: CrmCustomField) => field.fieldKey.toLowerCase() === normalized || field.label.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized);
            nextMapping[header] = canonical?.value ?? custom?.fieldKey ?? "";
          });
          setImportMapping(nextMapping);
        },
        onError: (previewError: unknown) => setError(errorText(previewError, "Unable to preview import")),
      },
    );
  };

  const applyImportNow = () => {
    if (!importPreview) return;
    const rows = importPreview.rows ?? [];
    if (!rows.length) {
      setError("This preview did not include import rows. Choose the file again or contact support.");
      return;
    }
    const mappedValues = Object.values(importMapping).filter(Boolean);
    if (!mappedValues.includes("name")) {
      setError("Map one column to LEAD NAME before applying.");
      return;
    }
    applyImport.mutate(
      {
        data: {
          headers: importPreview.headers,
          rows,
          mapping: importMapping,
          existingRowPolicy,
          authority,
        },
      },
      {
        onSuccess: (result: Record<string, unknown>) => {
          setImportResult(result);
          void fetchLeads();
          setNotice("Import applied");
        },
        onError: (importError: unknown) => setError(errorText(importError, "Import failed")),
      },
    );
  };

  const saveField = () => {
    if (!fieldDraft.fieldKey.trim() || !fieldDraft.label.trim()) {
      setError("Field key and label are required");
      return;
    }
    const optionsJson = fieldDraft.options.split(",").map((option) => option.trim()).filter(Boolean);
    setFieldSaving(true);
    const onDone = () => {
      setFieldDraft({ fieldKey: "", label: "", fieldType: "text", options: "", required: false });
      setEditingFieldKey(null);
      void queryClient.invalidateQueries({ queryKey: getListCrmCustomFieldsQueryKey() });
      setNotice("Custom field saved");
      setFieldSaving(false);
    };
    if (editingFieldKey) {
      updateCustomField.mutate(
        { fieldKey: editingFieldKey, data: { label: fieldDraft.label.trim(), optionsJson, required: fieldDraft.required } },
        { onSuccess: onDone, onError: (fieldError: unknown) => { setFieldSaving(false); setError(errorText(fieldError, "Unable to update field")); } },
      );
      return;
    }
    createCustomField.mutate(
      { data: { fieldKey: fieldDraft.fieldKey.trim(), label: fieldDraft.label.trim(), fieldType: fieldDraft.fieldType as "text" | "number" | "boolean" | "date" | "select", optionsJson, required: fieldDraft.required, position: customFields.length } },
      { onSuccess: onDone, onError: (fieldError: unknown) => { setFieldSaving(false); setError(errorText(fieldError, "Unable to create field")); } },
    );
  };

  const archiveField = (field: CrmCustomField) => {
    updateCustomField.mutate(
      { fieldKey: field.fieldKey, data: { archived: true } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListCrmCustomFieldsQueryKey() });
          setNotice("Custom field archived");
        },
        onError: (fieldError: unknown) => setError(errorText(fieldError, "Unable to archive field")),
      },
    );
  };

  if (!isAuthenticated && !authLoading) return <SignInPage context="Sign in to access the lead database." />;
  if (authLoading || loading) {
    return (
      <div className="min-h-[calc(100dvh-48px)] bg-[#f7f4ee] px-4 py-8 text-black">
        <div className="mx-auto max-w-[1500px] animate-pulse space-y-4">
          <div className="h-8 w-56 bg-black/10" />
          <div className="h-12 w-full bg-black/5" />
          <div className="h-96 w-full bg-white ring-1 ring-black/10" />
        </div>
      </div>
    );
  }

  const customValues = selectedLead ? parseCustomValues(selectedLead.customFieldsJson) : {};
  const propertyRows: Array<{ label: string; value: string; Icon: LucideIcon }> = selectedLead ? [
    { label: "Phone", value: selectedLead.phone, Icon: Phone },
    { label: "Email", value: selectedLead.email, Icon: Mail },
    { label: "Company", value: selectedLead.company, Icon: Building2 },
    { label: "Job title", value: selectedLead.jobTitle, Icon: Users },
    { label: "Source", value: selectedLead.source, Icon: History },
    { label: "Assigned to", value: selectedLead.assignedUserId ? memberMap[selectedLead.assignedUserId] || "Assigned" : "Unassigned", Icon: Users },
  ] : [];

  return (
    <div className="min-h-[calc(100dvh-48px)] bg-[#f7f4ee] text-black" data-testid="page-leads">
      <header className="border-b border-black bg-[#f7f4ee]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center border border-black bg-black text-[#f7f4ee]"><Users size={16} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">CRM / external relationships</p>
              <h1 className="truncate font-display text-xl font-bold tracking-[-0.02em]">Leads</h1>
            </div>
            <span className="hidden border border-black/20 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] sm:inline-flex">{admin ? "Manager" : "Member"}</span>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-56">
              <span className="sr-only">Active organization</span>
              <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/45" size={14} />
              <select
                data-testid="select-active-organization"
                value={orgId ?? ""}
                onChange={(event) => selectOrganization(Number(event.target.value))}
                className="h-10 w-full appearance-none border border-black bg-white pl-9 pr-8 text-xs font-semibold uppercase tracking-[0.08em] outline-none"
                disabled={switchOrganization.isPending || organizations.length < 2}
              >
                {organizations.length === 0 && <option value={orgId ?? ""}>CURRENT ORGANIZATION</option>}
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={14} />
            </label>
            <button data-testid="button-add-lead" onClick={() => setShowAddForm(true)} className="inline-flex h-10 shrink-0 items-center gap-2 bg-black px-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-black/75"><Plus size={14} /> <span className="hidden sm:inline">Add lead</span></button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 border-t border-black/10 px-4 py-2 sm:px-6">
          {admin && <>
            <button data-testid="button-open-import" onClick={() => setShowImport(true)} className="inline-flex h-9 items-center gap-2 border border-black bg-white px-3 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-black hover:text-white"><Upload size={13} /> Import</button>
            <button data-testid="button-manage-custom-fields" onClick={() => setShowFields((open) => !open)} className={`inline-flex h-9 items-center gap-2 border border-black px-3 text-[10px] font-bold uppercase tracking-[0.12em] ${showFields ? "bg-black text-white" : "bg-white hover:bg-black hover:text-white"}`}><Settings2 size={13} /> Fields</button>
            <button data-testid="button-manage-sources" onClick={() => setShowSources((open) => !open)} className={`inline-flex h-9 items-center gap-2 border border-black px-3 text-[10px] font-bold uppercase tracking-[0.12em] ${showSources ? "bg-black text-white" : "bg-white hover:bg-black hover:text-white"}`}><Cloud size={13} /> Sources</button>
            <button data-testid="button-export-archive" onClick={() => void exportArchive()} disabled={archiveQuery.isFetching} className="inline-flex h-9 items-center gap-2 border border-black bg-white px-3 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-black hover:text-white disabled:opacity-50"><FileJson size={13} /> Archive JSON</button>
            <button data-testid="button-export-csv" onClick={() => void exportLegacy("csv")} className="hidden h-9 items-center gap-2 border border-black bg-white px-3 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-black hover:text-white sm:inline-flex"><Download size={13} /> CSV</button>
            <button data-testid="button-export-xlsx" onClick={() => void exportLegacy("xlsx")} className="hidden h-9 items-center gap-2 border border-black bg-white px-3 text-[10px] font-bold uppercase tracking-[0.12em] hover:bg-black hover:text-white sm:inline-flex"><Download size={13} /> XLSX</button>
          </>}
          {switchOrganization.isPending && <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/50"><Loader2 size={13} className="animate-spin" /> Switching organization</span>}
        </div>
      </header>

      {(error || notice) && (
        <div className={`border-b border-black px-4 py-2 text-xs font-semibold ${error ? "bg-[#171717] text-white" : "bg-[#ebe6dc] text-black"}`} role={error ? "alert" : "status"} data-testid={error ? "status-leads-error" : "status-leads-notice"}>
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
            <span>{error || notice}</span>
            <button data-testid="button-dismiss-message" onClick={() => { setError(""); setNotice(""); }} className="p-1" aria-label="Dismiss message"><X size={14} /></button>
          </div>
        </div>
      )}

      {showFields && admin && (
        <section className="border-b border-black bg-white" data-testid="section-custom-fields">
          <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">Organization settings</p><h2 className="mt-1 text-lg font-bold">Custom field definitions</h2></div>
              <span className="text-xs text-black/50">{visibleFields.length} active fields</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="divide-y divide-black/10 border-y border-black/10">
                {customFields.length === 0 && <p className="py-8 text-sm text-black/50" data-testid="text-custom-fields-empty">No custom fields yet.</p>}
                {customFields.map((field: CrmCustomField) => (
                  <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${field.archived ? "opacity-45" : ""}`} key={field.fieldKey} data-testid={`row-custom-field-${field.fieldKey}`}>
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{field.label}</strong><FieldBadge field={field} />{field.required && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/50">Required</span>}{field.archived && <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Archived</span>}</div><p className="mt-1 font-mono text-[11px] text-black/50">{field.fieldKey}{field.fieldType === "select" && field.optionsJson.length ? ` · ${field.optionsJson.join(", ")}` : ""}</p></div>
                    {!field.archived && <div className="flex items-center gap-1"><button data-testid={`button-edit-custom-field-${field.fieldKey}`} onClick={() => { setEditingFieldKey(field.fieldKey); setFieldDraft({ fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType, options: field.optionsJson.join(", "), required: field.required }); }} className="p-2 hover:bg-[#f7f4ee]" aria-label={`Edit ${field.label}`}><Edit2 size={14} /></button><button data-testid={`button-archive-custom-field-${field.fieldKey}`} onClick={() => archiveField(field)} className="p-2 hover:bg-[#f7f4ee]" aria-label={`Archive ${field.label}`}><Trash2 size={14} /></button></div>}
                  </div>
                ))}
              </div>
              <div className="border border-black/15 bg-[#f7f4ee] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em]">{editingFieldKey ? "Edit field" : "Add field"}</h3>
                <div className="mt-3 space-y-3">
                  <input data-testid="input-custom-field-key" disabled={Boolean(editingFieldKey)} value={fieldDraft.fieldKey} onChange={(event) => setFieldDraft({ ...fieldDraft, fieldKey: event.target.value })} placeholder="FIELD KEY" className="h-10 w-full border border-black bg-white px-3 text-sm font-mono uppercase outline-none disabled:bg-black/5" />
                  <input data-testid="input-custom-field-label" value={fieldDraft.label} onChange={(event) => setFieldDraft({ ...fieldDraft, label: event.target.value })} placeholder="LABEL" className="h-10 w-full border border-black bg-white px-3 text-sm outline-none" />
                  <select data-testid="select-custom-field-type" disabled={Boolean(editingFieldKey)} value={fieldDraft.fieldType} onChange={(event) => setFieldDraft({ ...fieldDraft, fieldType: event.target.value })} className="h-10 w-full border border-black bg-white px-3 text-sm outline-none disabled:bg-black/5"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="select">Select</option></select>
                  {fieldDraft.fieldType === "select" && <input data-testid="input-custom-field-options" value={fieldDraft.options} onChange={(event) => setFieldDraft({ ...fieldDraft, options: event.target.value })} placeholder="OPTIONS, COMMA, SEPARATED" className="h-10 w-full border border-black bg-white px-3 text-sm outline-none" />}
                  <label className="flex items-center gap-2 text-xs"><input data-testid="checkbox-custom-field-required" type="checkbox" checked={fieldDraft.required} onChange={(event) => setFieldDraft({ ...fieldDraft, required: event.target.checked })} /> Required on imported or new records</label>
                  <div className="flex gap-2"><button data-testid="button-save-custom-field" onClick={saveField} disabled={fieldSaving} className="h-10 bg-black px-4 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50">{fieldSaving ? "Saving" : editingFieldKey ? "Save changes" : "Add field"}</button>{editingFieldKey && <button data-testid="button-cancel-custom-field" onClick={() => { setEditingFieldKey(null); setFieldDraft({ fieldKey: "", label: "", fieldType: "text", options: "", required: false }); }} className="h-10 border border-black bg-white px-4 text-xs font-bold uppercase tracking-[0.1em]">Cancel</button>}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {showSources && admin && <CrmSyncPanel orgId={orgId} customFields={visibleFields} onClose={() => setShowSources(false)} />}

      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-3 sm:px-6">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative min-w-[min(100%,280px)] flex-1 sm:w-72 sm:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/45" size={15} /><span className="sr-only">Search leads</span><input data-testid="input-search-leads" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search leads" className="h-10 w-full border border-black bg-white pl-9 pr-3 text-sm outline-none placeholder:text-black/35" /></label>
            <label className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/45" size={14} /><span className="sr-only">Filter by status</span><select data-testid="select-lead-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 appearance-none border border-black bg-white pl-9 pr-8 text-xs font-bold uppercase tracking-[0.08em] outline-none"><option value="">All statuses</option>{STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45" data-testid="text-lead-count">{leads.length} {leads.length === 1 ? "lead" : "leads"}</div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className={`min-h-0 flex-1 overflow-y-auto bg-white ${selectedLead ? "hidden sm:block" : "block"}`} data-testid="section-lead-list">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_1fr_120px_110px_60px] gap-4 border-b border-black bg-[#ebe6dc] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-black/55 sm:grid"><span>Name</span><span>Contact</span><span>Company</span><span>Assigned</span><span>Status</span><span className="text-right">Calls</span></div>
            {leads.length === 0 && <div className="p-12 text-center text-sm text-black/45" data-testid="text-leads-empty">{search || statusFilter ? "No leads match these filters." : "No leads in this organization yet."}</div>}
            {leads.map((lead) => (
              <button key={lead.id} data-testid={`row-lead-${lead.id}`} onClick={() => void openDetail(lead)} className={`w-full border-b border-black/10 px-4 py-4 text-left transition-colors hover:bg-[#f7f4ee] sm:grid sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_1fr_120px_110px_60px] sm:items-center sm:gap-4 ${selectedLead?.id === lead.id ? "bg-black text-white hover:bg-black" : "bg-white"}`}>
                <span className="flex min-w-0 items-center gap-2"><Lock size={12} className={lead.isLocked ? "shrink-0" : "hidden"} /><span className="truncate text-sm font-bold">{lead.name || "Unnamed lead"}</span></span>
                <span className="mt-2 flex min-w-0 flex-col text-xs sm:mt-0"><span className="truncate">{lead.phone || "No phone"}</span><span className={`truncate ${selectedLead?.id === lead.id ? "text-white/55" : "text-black/45"}`}>{lead.email || "No email"}</span></span>
                <span className="mt-2 truncate text-xs font-semibold sm:mt-0">{lead.company || "—"}</span>
                <span className={`mt-2 truncate text-[10px] font-bold uppercase tracking-[0.1em] sm:mt-0 ${selectedLead?.id === lead.id ? "text-white/60" : "text-black/45"}`}>{lead.assignedUserId ? memberMap[lead.assignedUserId] || "Assigned" : "Unassigned"}</span>
                <span className="mt-2 sm:mt-0"><span className={`inline-flex border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${selectedLead?.id === lead.id ? "border-white/40 text-white" : "border-black/20"}`}>{statusLabel(lead.status)}</span></span>
                <span className="mt-2 text-xs font-mono sm:mt-0 sm:text-right">{lead.callCount || "—"}</span>
              </button>
            ))}
          </section>

          {selectedLead && (
            <aside className="flex w-full min-h-0 flex-col bg-[#f7f4ee] sm:w-[440px] sm:shrink-0 sm:border-l sm:border-black" data-testid={`panel-lead-detail-${selectedLead.id}`}>
              <div className="flex items-center justify-between gap-3 border-b border-black bg-black px-4 py-3 text-white"><div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-sm font-bold">{selectedLead.name}</h2>{selectedLead.isLocked && <Lock size={13} />}</div><div className="flex items-center gap-1">{admin && <><button data-testid={`button-edit-lead-${selectedLead.id}`} onClick={() => { setEditingLead(selectedLead); setEditForm({ name: selectedLead.name, phone: selectedLead.phone, email: selectedLead.email, company: selectedLead.company, jobTitle: selectedLead.jobTitle, assignedUserId: selectedLead.assignedUserId || "" }); }} className="p-2 hover:bg-white/15" aria-label="Edit lead"><Edit2 size={14} /></button><button data-testid={`button-delete-lead-${selectedLead.id}`} onClick={() => void deleteLead(selectedLead.id)} className="p-2 hover:bg-white/15" aria-label="Delete lead"><Trash2 size={14} /></button></>}<button data-testid="button-close-lead-detail" onClick={() => setSelectedLead(null)} className="p-2 hover:bg-white/15" aria-label="Close lead detail"><X size={16} /></button></div></div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                 <div className="grid grid-cols-2 gap-x-4 gap-y-4">{propertyRows.map(({ label, value, Icon }) => <div key={label} className="min-w-0"><div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/45"><Icon size={12} />{label}</div><p className="mt-1 break-words text-xs font-semibold">{String(value || "—")}</p></div>)}</div>
                 {visibleFields.length > 0 && <div className="mt-6 border-t border-black/15 pt-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">Custom fields</h3><div className="grid grid-cols-2 gap-4">{visibleFields.map((field: CrmCustomField) => <div key={field.fieldKey} data-testid={`value-custom-field-${field.fieldKey}`}><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-black/45">{field.label}</span><span className="mt-1 block break-words text-xs font-semibold">{String(customValues[field.fieldKey] ?? "—")}</span></div>)}</div></div>}
                <div className="mt-6 border-t border-black/15 pt-4"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">Lead status</span><div className="flex flex-wrap gap-2">{STATUSES.map((status) => <button key={status.value} data-testid={`button-status-${status.value}`} onClick={() => void updateStatus(selectedLead.id, status.value)} className={`border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] ${selectedLead.status === status.value ? "bg-black text-white" : "bg-white hover:bg-black hover:text-white"}`}>{status.label}</button>)}</div></div>
                {selectedLead.pabloNotesJson && <div className="mt-6 border-t border-black/15 pt-4"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">Extraction notes</span><pre className="whitespace-pre-wrap border border-black/15 bg-white p-3 text-xs leading-relaxed">{(() => { try { const parsed = JSON.parse(selectedLead.pabloNotesJson); return Array.isArray(parsed) ? parsed.join("\n") : String(parsed); } catch { return selectedLead.pabloNotesJson; } })()}</pre></div>}
                <div className="mt-6 border-t border-black/15 pt-4"><CrmRoutingPanel leadId={selectedLead.id} leadName={selectedLead.name} leadPhone={selectedLead.phone} assignedUserId={selectedLead.assignedUserId} canEdit={admin} onUpdated={() => void openDetail(selectedLead)} /></div>
                <div className="mt-6 border-t border-black/15 pt-4"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-black/50"><StickyNote size={13} /> Notes ({leadNotes.length})</div><div className="mb-4 flex gap-2"><input data-testid="input-new-lead-note" value={newNote} onChange={(event) => setNewNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addNote(); }} placeholder="Add a note" className="h-10 min-w-0 flex-1 border border-black bg-white px-3 text-sm outline-none" /><button data-testid="button-add-lead-note" onClick={() => void addNote()} disabled={!newNote.trim()} className="h-10 bg-black px-3 text-white disabled:opacity-40"><Plus size={15} /></button></div>{detailLoading ? <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin" /></div> : <div className="space-y-2">{leadNotes.map((note) => <div key={note.id} className="border border-black/15 bg-white p-3" data-testid={`note-lead-${note.id}`}><div className="flex justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-black/45"><span>{note.userName || "Team member"}</span><span>{new Date(note.createdAt).toLocaleDateString()}</span></div><p className="mt-2 text-xs leading-relaxed">{note.note}</p></div>)}</div>}</div>
                {leadCalls.length > 0 && <div className="mt-6 border-t border-black/15 pt-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">Call history ({leadCalls.length})</h3><div className="space-y-2">{leadCalls.map((call) => <div key={call.id} className="border border-black/15 bg-white p-3" data-testid={`call-record-${call.id}`}><div className="flex justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-black/45"><span>{call.direction} · {call.callType}</span><span>{new Date(call.startedAt).toLocaleDateString()}</span></div><p className="mt-2 text-xs">{call.summary || call.transcript || `${call.status} · ${call.durationSeconds}s`}</p></div>)}</div></div>}
                {leadActivities.length > 0 && <div className="mt-6 border-t border-black/15 pt-4"><h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-black/50">Activity ({leadActivities.length})</h3><div className="space-y-2">{leadActivities.map((activity) => <div key={activity.id} className="border border-black/10 bg-white p-3" data-testid={`activity-lead-${activity.id}`}><div className="flex justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-black/45"><span>{activity.channel}</span><span>{new Date(activity.occurredAt).toLocaleDateString()}</span></div><p className="mt-2 text-xs">{activity.summary || activity.body || "No detail"}</p></div>)}</div></div>}
              </div>
            </aside>
          )}
        </div>
      </main>

      {showAddForm && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md border border-black bg-white shadow-xl" role="dialog" aria-modal="true" data-testid="dialog-add-lead"><div className="flex items-center justify-between border-b border-black bg-black px-4 py-3 text-white"><h2 className="text-xs font-bold uppercase tracking-[0.14em]">Add lead</h2><button data-testid="button-close-add-lead" onClick={() => setShowAddForm(false)} aria-label="Close add lead"><X size={16} /></button></div><div className="space-y-3 p-4">{[["name", "Name", ""], ["company", "Company", ""], ["jobTitle", "Job title", ""], ["email", "Email", "email"], ["phone", "Phone", "tel"]].map(([key, label, type]) => <input key={key} data-testid={`input-add-lead-${key}`} type={type || "text"} value={addForm[key as keyof typeof addForm]} onChange={(event) => setAddForm({ ...addForm, [key]: event.target.value })} placeholder={label.toUpperCase()} className="h-10 w-full border border-black px-3 text-sm outline-none" />)}</div><div className="flex justify-end gap-2 border-t border-black/10 bg-[#f7f4ee] p-3"><button data-testid="button-cancel-add-lead" onClick={() => setShowAddForm(false)} className="h-10 border border-black bg-white px-4 text-xs font-bold uppercase tracking-[0.1em]">Cancel</button><button data-testid="button-save-add-lead" onClick={() => void createLead()} disabled={saving} className="h-10 bg-black px-4 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50">{saving ? "Saving" : "Save lead"}</button></div></div></div>}

      {editingLead && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md border border-black bg-white shadow-xl" role="dialog" aria-modal="true" data-testid="dialog-edit-lead"><div className="flex items-center justify-between border-b border-black bg-black px-4 py-3 text-white"><h2 className="text-xs font-bold uppercase tracking-[0.14em]">Edit lead</h2><button data-testid="button-close-edit-lead" onClick={() => setEditingLead(null)} aria-label="Close edit lead"><X size={16} /></button></div><div className="space-y-3 p-4">{[["name", "Name", ""], ["company", "Company", ""], ["jobTitle", "Job title", ""], ["email", "Email", "email"], ["phone", "Phone", "tel"]].map(([key, label, type]) => <input key={key} data-testid={`input-edit-lead-${key}`} type={type || "text"} value={editForm[key as keyof typeof editForm]} onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })} placeholder={label.toUpperCase()} className="h-10 w-full border border-black px-3 text-sm outline-none" />)}<select data-testid="select-edit-lead-assignee" value={editForm.assignedUserId} onChange={(event) => setEditForm({ ...editForm, assignedUserId: event.target.value })} className="h-10 w-full border border-black bg-white px-3 text-sm outline-none"><option value="">Unassigned</option>{Object.entries(memberMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div><div className="flex justify-end gap-2 border-t border-black/10 bg-[#f7f4ee] p-3"><button data-testid="button-cancel-edit-lead" onClick={() => setEditingLead(null)} className="h-10 border border-black bg-white px-4 text-xs font-bold uppercase tracking-[0.1em]">Cancel</button><button data-testid="button-save-edit-lead" onClick={() => void saveLead()} disabled={saving} className="h-10 bg-black px-4 text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-50">{saving ? "Saving" : "Save changes"}</button></div></div></div>}

      {showImport && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 sm:p-5"><div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden border border-black bg-white shadow-xl" role="dialog" aria-modal="true" data-testid="dialog-import"><div className="flex items-center justify-between border-b border-black bg-black px-4 py-3 text-white"><div><h2 className="text-xs font-bold uppercase tracking-[0.14em]">Mapped import</h2><p className="mt-1 text-[11px] text-white/60">Preview first. Apply only after mapping and conflict choices are explicit.</p></div><button data-testid="button-close-import" onClick={() => { setShowImport(false); setImportPreview(null); setImportResult(null); }} aria-label="Close import"><X size={16} /></button></div><div className="min-h-0 overflow-y-auto p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]"><div><label data-testid="dropzone-import-file" className="flex min-h-40 cursor-pointer flex-col items-center justify-center border border-dashed border-black bg-[#f7f4ee] p-5 text-center hover:bg-[#ebe6dc]"><Upload size={22} /><strong className="mt-3 text-xs uppercase tracking-[0.12em]">{importFileName || "Choose CSV or XLSX"}</strong><span className="mt-2 text-xs text-black/50">The file is previewed before any CRM changes.</span><input data-testid="input-import-file" ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); }} /></label>{previewImport.isPending && <div className="mt-3 flex items-center gap-2 border border-black/15 bg-[#f7f4ee] p-3 text-xs"><Loader2 size={15} className="animate-spin" /> Reading preview</div>}{importPreview && <div className="mt-4 space-y-3 border-t border-black/10 pt-4"><div><span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">Existing rows</span><select data-testid="select-import-existing-policy" value={existingRowPolicy} onChange={(event) => setExistingRowPolicy(event.target.value as "skip" | "update")} className="mt-1 h-10 w-full border border-black bg-white px-2 text-sm"><option value="skip">Skip matches</option><option value="update">Update matches</option></select></div><div><span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">Authority on update</span><select data-testid="select-import-authority" value={authority} onChange={(event) => setAuthority(event.target.value as "import" | "crm")} className="mt-1 h-10 w-full border border-black bg-white px-2 text-sm"><option value="import">Import wins</option><option value="crm">CRM wins</option></select></div><button data-testid="button-apply-import" onClick={applyImportNow} disabled={applyImport.isPending || !importPreview.rows?.length} className="h-10 w-full bg-black text-xs font-bold uppercase tracking-[0.1em] text-white disabled:opacity-40">{applyImport.isPending ? "Applying" : "Apply import"}</button>{!importPreview.rows?.length && <p className="text-xs text-black/50">Apply is unavailable because this preview did not return full rows.</p>}</div>}</div>{importPreview ? <div className="min-w-0"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">Column mapping</p><h3 className="mt-1 text-base font-bold">{importPreview.rowCount} rows detected</h3></div><span className="text-xs text-black/50">{importPreview.headers.length} columns</span></div><div className="overflow-x-auto border border-black/15"><table className="w-full min-w-[620px] border-collapse text-left text-xs"><thead className="bg-[#ebe6dc]"><tr><th className="border-b border-black/15 p-2 text-[10px] uppercase tracking-[0.1em]">Source column</th><th className="border-b border-black/15 p-2 text-[10px] uppercase tracking-[0.1em]">Maps to</th><th className="border-b border-black/15 p-2 text-[10px] uppercase tracking-[0.1em]">Sample</th></tr></thead><tbody>{importPreview.headers.map((header, index) => <tr key={header} data-testid={`row-import-mapping-${index}`}><td className="border-b border-black/10 p-2 font-mono">{header}</td><td className="border-b border-black/10 p-2"><select data-testid={`select-import-mapping-${index}`} value={importMapping[header] ?? ""} onChange={(event) => setImportMapping({ ...importMapping, [header]: event.target.value })} className="h-9 w-full border border-black bg-white px-2 text-xs"><option value="">Do not import</option>{IMPORT_FIELDS.filter((field) => field.value).map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}{visibleFields.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label} (custom)</option>)}</select></td><td className="max-w-[180px] truncate border-b border-black/10 p-2 text-black/60">{importPreview.sampleRows[0]?.[index] || "—"}</td></tr>)}</tbody></table></div>{importResult && <pre data-testid="text-import-result" className="mt-4 max-h-32 overflow-auto border border-black/15 bg-[#f7f4ee] p-3 text-xs">{JSON.stringify(importResult, null, 2)}</pre>}</div> : <div className="flex min-h-48 items-center justify-center border border-black/10 bg-[#f7f4ee] p-6 text-center text-sm text-black/50">Choose a file to see headers, sample rows, and suggested mappings.</div>}</div></div></div></div>}
    </div>
  );
}