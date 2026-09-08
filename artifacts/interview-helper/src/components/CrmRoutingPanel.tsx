import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MessageSquare, Phone, Radio, Save, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Channel = "sms" | "call" | "comms";
type Fallback = "none" | Channel;
type CommsTarget = "company" | "assigned";

interface RoutingProfile {
  id: number;
  name: string;
  primaryChannel: Channel;
  fallbackChannel: Fallback;
  phoneNumberId: number | null;
  commsTarget: CommsTarget;
  commsUserId: string | null;
  isDefault: boolean;
}

interface PhoneNumber {
  id: number;
  number: string;
  label: string;
  friendlyName: string | null;
  countryCode: string | null;
  orgId: number | null;
  userId: string;
}

interface CommsMember {
  userId: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface RouteState {
  primaryChannel: Channel;
  fallbackChannel: Fallback;
  phoneNumberId: number | null;
  commsTarget: CommsTarget;
  commsUserId: string | null;
  profileId: number | null;
}

interface Props {
  leadId: number;
  leadName: string;
  leadPhone: string;
  assignedUserId: string | null;
  canEdit: boolean;
  onUpdated: () => void;
}

const CHANNELS: { value: Channel; label: string; icon: typeof MessageSquare }[] = [
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "call", label: "CALL", icon: Phone },
  { value: "comms", label: "COMMS", icon: Radio },
];

function memberName(member: CommsMember) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || member.userId;
}

export default function CrmRoutingPanel({ leadId, leadName, leadPhone, assignedUserId, canEdit, onUpdated }: Props) {
  const [profiles, setProfiles] = useState<RoutingProfile[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [members, setMembers] = useState<CommsMember[]>([]);
  const [route, setRoute] = useState<RouteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [profileName, setProfileName] = useState("");

  const assignedMember = useMemo(
    () => members.find((member) => member.userId === assignedUserId),
    [assignedUserId, members],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [resourcesResponse, routeResponse] = await Promise.all([
        apiFetch("api/crm/routing"),
        apiFetch(`api/crm/leads/${leadId}/routing`),
      ]);
      if (resourcesResponse.ok) {
        const data = await resourcesResponse.json();
        setProfiles(data.profiles || []);
        setPhoneNumbers(data.phoneNumbers || []);
        setMembers(data.members || []);
      }
      if (routeResponse.ok) {
        const data = await routeResponse.json();
        setRoute(data.route);
      }
    } catch {
      setStatus("Unable to load routing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStatus("");
    setMessage("");
    void load();
  }, [leadId]);

  const selectedProfile = profiles.find((profile) => profile.id === route?.profileId);

  const updateFromProfile = (profileId: number | null) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile || !route) return;
    setRoute({
      ...route,
      profileId: profile.id,
      primaryChannel: profile.primaryChannel,
      fallbackChannel: profile.fallbackChannel,
      phoneNumberId: profile.phoneNumberId,
      commsTarget: profile.commsTarget,
      commsUserId: profile.commsUserId,
    });
  };

  const saveRoute = async () => {
    if (!route || !canEdit) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await apiFetch(`api/crm/leads/${leadId}/routing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(route),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save routing");
      setRoute(data.route);
      setStatus("Routing saved");
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save routing");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!route || !canEdit || !profileName.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      const response = await apiFetch("api/crm/routing/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...route, name: profileName.trim(), isDefault: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save profile");
      setProfiles((current) => [...current, data.profile]);
      setRoute({ ...route, profileId: data.profile.id });
      setProfileName("");
      setStatus("Profile saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const routeNow = async () => {
    if (!route || !canEdit) return;
    setSending(true);
    setStatus("");
    try {
      const response = await apiFetch(`api/crm/leads/${leadId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Routing failed");
      if (data.handoffUrl) {
        window.location.assign(data.handoffUrl);
        return;
      }
      setMessage("");
      setStatus(`Sent via ${String(data.channel).toUpperCase()}`);
      onUpdated();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Routing failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="border border-border/60 bg-muted/5 p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> LOADING ROUTING</div>;
  }

  if (!route) {
    return <div className="border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{status || "ROUTING UNAVAILABLE"}</div>;
  }

  return (
    <div className="border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase text-muted-foreground block">OUTREACH ROUTING</span>
          <span className="text-[11px] text-muted-foreground/70">Primary, fallback, sender, and internal handoff destination</span>
        </div>
        <span className="text-[10px] uppercase text-primary">{selectedProfile?.name || "CUSTOM"}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase text-muted-foreground">
          PROFILE
          <select
            value={route.profileId ?? ""}
            onChange={(event) => updateFromProfile(event.target.value ? Number(event.target.value) : null)}
            disabled={!canEdit}
            className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs normal-case"
          >
            <option value="">CUSTOM OVERRIDE</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.isDefault ? " · DEFAULT" : ""}</option>)}
          </select>
        </label>
        <label className="text-[10px] uppercase text-muted-foreground">
          SENDER NUMBER
          <select
            value={route.phoneNumberId ?? ""}
            onChange={(event) => setRoute({ ...route, phoneNumberId: event.target.value ? Number(event.target.value) : null })}
            disabled={!canEdit}
            className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs normal-case"
          >
            <option value="">PERSONAL DEFAULT</option>
            {phoneNumbers.map((number) => <option key={number.id} value={number.id}>{number.label || number.friendlyName || number.number} · {number.number}</option>)}
          </select>
        </label>
        <label className="text-[10px] uppercase text-muted-foreground">
          PRIMARY
          <select value={route.primaryChannel} onChange={(event) => setRoute({ ...route, primaryChannel: event.target.value as Channel })} disabled={!canEdit} className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs">
            {CHANNELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-[10px] uppercase text-muted-foreground">
          FALLBACK
          <select value={route.fallbackChannel} onChange={(event) => setRoute({ ...route, fallbackChannel: event.target.value as Fallback })} disabled={!canEdit} className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs">
            <option value="none">NONE</option>
            {CHANNELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase text-muted-foreground">
          COMMS DESTINATION
          <select value={route.commsTarget} onChange={(event) => setRoute({ ...route, commsTarget: event.target.value as CommsTarget })} disabled={!canEdit} className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs">
            <option value="company">COMPANY CHANNEL</option>
            <option value="assigned">ASSIGNED SALESPERSON</option>
          </select>
        </label>
        <label className="text-[10px] uppercase text-muted-foreground">
          COMMS RECIPIENT
          <select value={route.commsUserId ?? assignedUserId ?? ""} onChange={(event) => setRoute({ ...route, commsUserId: event.target.value || null })} disabled={!canEdit || route.commsTarget !== "assigned"} className="mt-1 w-full bg-background border border-border px-2 py-1.5 text-xs">
            <option value="">{assignedMember ? `ASSIGNED · ${memberName(assignedMember)}` : "SELECT MEMBER"}</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{memberName(member)}</option>)}
          </select>
        </label>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button onClick={saveRoute} disabled={saving} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold uppercase disabled:opacity-40">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} SAVE LEAD ROUTE
          </button>
          <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="NEW PROFILE NAME" className="min-w-32 flex-1 bg-background border border-border px-2 py-1.5 text-[10px] uppercase" />
          <button onClick={saveProfile} disabled={saving || !profileName.trim()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/20 border border-border text-[10px] font-bold uppercase disabled:opacity-40">
            <Check className="w-3 h-3" /> SAVE PROFILE
          </button>
        </div>
      )}

      <div className="border-t border-border/60 pt-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] uppercase text-muted-foreground">ROUTE THIS LEAD</span>
          <span className="text-[10px] text-muted-foreground/70 truncate">{leadPhone || "NO PHONE · COMMS ONLY"} · {leadName}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void routeNow(); }}
            placeholder={route.primaryChannel === "call" ? "OPTIONAL CALL NOTE..." : "MESSAGE OR HANDOFF NOTE..."}
            disabled={!canEdit}
            className="flex-1 bg-background border border-border px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/50"
          />
          <button onClick={routeNow} disabled={!canEdit || sending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase disabled:opacity-40">
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} ROUTE
          </button>
        </div>
        {status && <p className="mt-1 text-[10px] text-muted-foreground">{status}</p>}
      </div>
    </div>
  );
}