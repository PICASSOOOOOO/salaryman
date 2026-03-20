import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, FileText,
  Bell, Trash2, Edit2, Check, CalendarDays, Calendar as CalendarIcon,
  AlarmClock, Mail, Loader2, Video, Copy, ExternalLink
} from 'lucide-react';
import { useAuth } from '@workspace/replit-auth-web';
import { SignInPage } from '@/components/SignInPrompt';
import { ProGate } from '@/components/ProGate';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { usePlan } from '@/hooks/use-plan';
import { getDefaultBoomerMode } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/^\//, "");
function apiUrl(path: string) {
  return `/${API ? API + "/" : ""}api/${path}`.replace(/\/+/g, "/");
}

type ViewMode = "month" | "week" | "day";

interface Appointment {
  id: number;
  userId: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  reminderMinutes: number;
  googleEventId: string | null;
  googleCalendarSynced: boolean;
  reminderEmailSent: boolean;
  meetingRoomCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApptForm {
  title: string;
  description: string;
  location: string;
  startDate: string;
  startTime: string;
  endTime: string;
  reminderMinutes: number;
}

const REMINDER_OPTIONS = [
  { label: "5 min before", value: 5 },
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "2 hours before", value: 120 },
  { label: "1 day before", value: 1440 },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfWeek(d: Date): Date {
  const day = new Date(d);
  day.setDate(d.getDate() - d.getDay());
  day.setHours(0, 0, 0, 0);
  return day;
}

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = pad(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDuration(startStr: string, endStr: string): string {
  const diff = (new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000;
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function CRTBorder({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        border: "1px solid rgba(34,197,94,0.25)",
        background: "rgba(9,9,11,0.95)",
        boxShadow: "0 0 20px rgba(255,255,255,0.05), inset 0 0 40px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>
  );
}

function ApptModal({
  initial,
  defaultDate,
  onSave,
  onDelete,
  onClose,
  saving,
}: {
  initial: Partial<Appointment> | null;
  defaultDate: Date;
  onSave: (form: ApptForm) => void;
  onDelete?: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isEdit = !!initial?.id;
  const startD = initial?.startAt ? new Date(initial.startAt) : defaultDate;
  const endD = initial?.endAt ? new Date(initial.endAt) : new Date(defaultDate.getTime() + 60 * 60 * 1000);

  const [form, setForm] = useState<ApptForm>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    startDate: toLocalISODate(startD),
    startTime: toLocalTime(startD),
    endTime: toLocalTime(endD),
    reminderMinutes: initial?.reminderMinutes ?? 15,
  });

  function set<K extends keyof ApptForm>(k: K, v: ApptForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <CRTBorder className="w-full max-w-md">
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid rgba(34,197,94,0.2)" }}
        >
          <span
            className="display-text text-xs tracking-widest"
            style={{ color: "rgba(34,197,94,0.6)" }}
          >
            {isEdit ? "[ EDIT MISSION ]" : "[ NEW MISSION ]"}
          </span>
          <button onClick={onClose} style={{ color: "rgba(34,197,94,0.4)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label
              className="display-text text-xs block mb-1"
              style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
            >
              TITLE *
            </label>
            <input
              className="w-full display-text text-sm px-3 py-2 outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Mission title..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                className="display-text text-xs block mb-1"
                style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
              >
                DATE
              </label>
              <input
                type="date"
                className="w-full display-text text-xs px-2 py-2 outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#22c55e",
                  fontFamily: "'Share Tech Mono', monospace",
                  colorScheme: "dark",
                }}
                value={form.startDate}
                onChange={e => set("startDate", e.target.value)}
              />
            </div>
            <div>
              <label
                className="display-text text-xs block mb-1"
                style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
              >
                START
              </label>
              <input
                type="time"
                className="w-full display-text text-xs px-2 py-2 outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#22c55e",
                  fontFamily: "'Share Tech Mono', monospace",
                  colorScheme: "dark",
                }}
                value={form.startTime}
                onChange={e => set("startTime", e.target.value)}
              />
            </div>
            <div>
              <label
                className="display-text text-xs block mb-1"
                style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
              >
                END
              </label>
              <input
                type="time"
                className="w-full display-text text-xs px-2 py-2 outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#22c55e",
                  fontFamily: "'Share Tech Mono', monospace",
                  colorScheme: "dark",
                }}
                value={form.endTime}
                onChange={e => set("endTime", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              className="display-text text-xs block mb-1"
              style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
            >
              <MapPin className="w-3 h-3 inline mr-1" />LOCATION
            </label>
            <input
              className="w-full display-text text-sm px-3 py-2 outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              value={form.location}
              onChange={e => set("location", e.target.value)}
              placeholder="Location or link..."
            />
          </div>

          <div>
            <label
              className="display-text text-xs block mb-1"
              style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
            >
              <FileText className="w-3 h-3 inline mr-1" />NOTES
            </label>
            <textarea
              className="w-full display-text text-sm px-3 py-2 outline-none resize-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e",
                fontFamily: "'Share Tech Mono', monospace",
                height: "70px",
              }}
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Notes..."
            />
          </div>

          <div>
            <label
              className="display-text text-xs block mb-1"
              style={{ color: "rgba(34,197,94,0.5)", letterSpacing: "0.1em" }}
            >
              <Bell className="w-3 h-3 inline mr-1" />REMINDER ALARM
            </label>
            <select
              className="w-full display-text text-xs px-3 py-2 outline-none"
              style={{
                background: "rgba(9,9,11,0.95)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              value={form.reminderMinutes}
              onChange={e => set("reminderMinutes", Number(e.target.value))}
            >
              {REMINDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value} style={{ background: "#09090b" }}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {isEdit && initial?.meetingRoomCode && (
            <div
              style={{
                borderTop: "1px solid rgba(103,232,249,0.12)",
                paddingTop: "12px",
              }}
            >
              <div
                className="display-text text-xs mb-2"
                style={{ color: "rgba(103,232,249,0.5)", letterSpacing: "0.1em" }}
              >
                <Video className="w-3 h-3 inline mr-1" />MEETING LINK
              </div>
              <div className="flex gap-2">
                <div
                  className="flex-1 display-text text-xs px-2 py-1.5 truncate"
                  style={{
                    background: "rgba(103,232,249,0.04)",
                    border: "1px solid rgba(103,232,249,0.2)",
                    color: "#67e8f9",
                    letterSpacing: "0.04em",
                  }}
                >
                  /meet/{initial.meetingRoomCode}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/meet/${initial!.meetingRoomCode}`); }}
                  className="px-2 py-1.5 display-text"
                  style={{ border: "1px solid rgba(103,232,249,0.25)", color: "#67e8f9", background: "rgba(103,232,249,0.06)" }}
                  title="Copy link"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={() => window.open(`/meet/${initial!.meetingRoomCode}`, "_blank")}
                  className="px-2 py-1.5 display-text"
                  style={{ border: "1px solid rgba(103,232,249,0.25)", color: "#67e8f9", background: "rgba(103,232,249,0.06)" }}
                  title="Join meeting"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onSave(form)}
              disabled={saving || !form.title.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2 display-text text-xs transition-all"
              style={{
                background: form.title.trim() ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(34,197,94,0.4)",
                color: form.title.trim() ? "#22c55e" : "rgba(34,197,94,0.3)",
                letterSpacing: "0.1em",
                cursor: form.title.trim() ? "pointer" : "default",
              }}
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {isEdit ? "UPDATE" : "CREATE"}
            </button>
            {isEdit && onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-2 display-text text-xs transition-all"
                style={{
                  background: "rgba(255,50,50,0.08)",
                  border: "1px solid rgba(255,50,50,0.3)",
                  color: "rgba(255,80,80,0.8)",
                  letterSpacing: "0.1em",
                }}
              >
                <Trash2 className="w-3 h-3" />
                DELETE
              </button>
            )}
          </div>
        </div>
      </CRTBorder>
    </div>
  );
}

function ApptPill({
  appt,
  onClick,
  compact = false,
}: {
  appt: Appointment;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className="w-full text-left transition-all"
      style={{
        background: "rgba(34,197,94,0.1)",
        border: "1px solid rgba(34,197,94,0.35)",
        padding: compact ? "1px 4px" : "3px 6px",
        marginBottom: "2px",
        display: "block",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.18)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.1)";
      }}
    >
      <div
        className="display-text truncate"
        style={{
          fontSize: compact ? "0.55rem" : "0.65rem",
          color: "#22c55e",
          letterSpacing: "0.05em",
          textShadow: "0 0 8px rgba(34,197,94,0.4)",
        }}
      >
        {formatTime(appt.startAt)} {appt.title}
      </div>
    </button>
  );
}

function MonthView({
  year,
  month,
  appointments,
  today,
  selectedDate,
  onSelectDate,
  onClickAppt,
  onClickDay,
}: {
  year: number;
  month: number;
  appointments: Appointment[];
  today: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onClickAppt: (a: Appointment) => void;
  onClickDay: (d: Date) => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function apptsByDay(d: Date) {
    return appointments.filter(a => isSameDay(new Date(a.startAt), d));
  }

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid rgba(34,197,94,0.15)" }}
      >
        {DAY_NAMES.map(d => (
          <div
            key={d}
            className="py-1 text-center display-text"
            style={{
              fontSize: "0.6rem",
              color: "rgba(34,197,94,0.4)",
              letterSpacing: "0.12em",
              borderRight: "1px solid rgba(34,197,94,0.08)",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((cell, i) => {
          if (!cell) {
            return (
              <div
                key={`null-${i}`}
                style={{
                  minHeight: "90px",
                  borderRight: "1px solid rgba(255,255,255,0.05)",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: "rgba(0,0,0,0.3)",
                }}
              />
            );
          }
          const isToday = isSameDay(cell, today);
          const isSelected = isSameDay(cell, selectedDate);
          const dayAppts = apptsByDay(cell);

          return (
            <div
              key={cell.toISOString()}
              onClick={() => { onSelectDate(cell); onClickDay(cell); }}
              className="cursor-pointer transition-all"
              style={{
                minHeight: "90px",
                borderRight: "1px solid rgba(34,197,94,0.08)",
                borderBottom: "1px solid rgba(34,197,94,0.08)",
                padding: "4px",
                background: isSelected
                  ? "rgba(255,255,255,0.05)"
                  : "transparent",
              }}
              onMouseEnter={e => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
              }}
              onMouseLeave={e => {
                if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div
                className="display-text text-xs mb-1 w-6 h-6 flex items-center justify-center"
                style={{
                  fontSize: "0.7rem",
                  color: isToday ? "#030803" : isSelected ? "#22c55e" : "rgba(34,197,94,0.5)",
                  background: isToday ? "#22c55e" : "transparent",
                  borderRadius: "2px",
                  fontWeight: isToday ? "bold" : "normal",
                  textShadow: isToday ? "none" : isSelected ? "0 0 8px rgba(34,197,94,0.5)" : "none",
                }}
              >
                {cell.getDate()}
              </div>
              {dayAppts.slice(0, 3).map(a => (
                <ApptPill key={a.id} appt={a} onClick={() => onClickAppt(a)} compact />
              ))}
              {dayAppts.length > 3 && (
                <div
                  className="display-text"
                  style={{ fontSize: "0.5rem", color: "rgba(34,197,94,0.35)", letterSpacing: "0.08em" }}
                >
                  +{dayAppts.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  weekStart,
  appointments,
  today,
  onClickAppt,
  onClickSlot,
}: {
  weekStart: Date;
  appointments: Appointment[];
  today: Date;
  onClickAppt: (a: Appointment) => void;
  onClickSlot: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function apptsByDay(d: Date) {
    return appointments.filter(a => isSameDay(new Date(a.startAt), d));
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
        <div style={{ borderBottom: "1px solid rgba(34,197,94,0.15)" }} />
        {days.map(d => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className="text-center py-1"
              style={{
                borderBottom: "1px solid rgba(34,197,94,0.15)",
                borderLeft: "1px solid rgba(34,197,94,0.08)",
              }}
            >
              <span
                className="display-text"
                style={{
                  fontSize: "0.55rem",
                  color: isToday ? "#22c55e" : "rgba(34,197,94,0.4)",
                  letterSpacing: "0.1em",
                  textShadow: isToday ? "0 0 8px rgba(34,197,94,0.6)" : "none",
                }}
              >
                {DAY_NAMES[d.getDay()]} {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "relative", height: `${24 * 48}px` }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "48px repeat(7, 1fr)",
            height: "100%",
          }}
        >
          <div>
            {HOURS.map(h => (
              <div
                key={h}
                style={{
                  height: "48px",
                  display: "flex",
                  alignItems: "flex-start",
                  paddingTop: "2px",
                  paddingRight: "6px",
                  justifyContent: "flex-end",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  className="display-text"
                  style={{ fontSize: "0.5rem", color: "rgba(34,197,94,0.25)", letterSpacing: "0.06em" }}
                >
                  {h === 0 ? "" : h < 12 ? `${h}A` : h === 12 ? "12P" : `${h - 12}P`}
                </span>
              </div>
            ))}
          </div>
          {days.map(d => {
            const dayAppts = apptsByDay(d);
            return (
              <div
                key={d.toISOString()}
                style={{
                  borderLeft: "1px solid rgba(34,197,94,0.08)",
                  position: "relative",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const clicked = new Date(d);
                  clicked.setHours(9, 0, 0, 0);
                  onClickSlot(clicked);
                }}
              >
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{
                      height: "48px",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  />
                ))}
                {dayAppts.map(a => {
                  const start = new Date(a.startAt);
  const end = new Date(a.endAt);
                  const topPct = (start.getHours() + start.getMinutes() / 60) / 24;
                  const heightPct = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
                  return (
                    <button
                      key={a.id}
                      onClick={e => { e.stopPropagation(); onClickAppt(a); }}
                      style={{
                        position: "absolute",
                        top: `${topPct * 100}%`,
                        height: `${Math.max(heightPct * 100, 2)}%`,
                        left: "2px",
                        right: "2px",
                        background: "rgba(34,197,94,0.14)",
                        border: "1px solid rgba(34,197,94,0.4)",
                        padding: "2px 4px",
                        textAlign: "left",
                        overflow: "hidden",
                        zIndex: 1,
                      }}
                    >
                      <div
                        className="display-text truncate"
                        style={{ fontSize: "0.55rem", color: "#22c55e", letterSpacing: "0.04em" }}
                      >
                        {formatTime(a.startAt)} {a.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({
  date,
  appointments,
  onClickAppt,
  onClickSlot,
}: {
  date: Date;
  appointments: Appointment[];
  onClickAppt: (a: Appointment) => void;
  onClickSlot: (d: Date) => void;
}) {
  const dayAppts = appointments.filter(a => isSameDay(new Date(a.startAt), date));

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="px-4 py-2 display-text text-xs"
        style={{
          borderBottom: "1px solid rgba(34,197,94,0.15)",
          color: "rgba(34,197,94,0.5)",
          letterSpacing: "0.12em",
        }}
      >
        {DAY_NAMES[date.getDay()]} {MONTH_NAMES[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
        {dayAppts.length > 0 && (
          <span style={{ color: "rgba(34,197,94,0.35)", marginLeft: "12px" }}>
            {dayAppts.length} MISSION{dayAppts.length > 1 ? "S" : ""}
          </span>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <div className="grid" style={{ gridTemplateColumns: "56px 1fr" }}>
          <div>
            {HOURS.map(h => (
              <div
                key={h}
                style={{
                  height: "64px",
                  display: "flex",
                  alignItems: "flex-start",
                  paddingTop: "2px",
                  paddingRight: "8px",
                  justifyContent: "flex-end",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  className="display-text"
                  style={{ fontSize: "0.55rem", color: "rgba(34,197,94,0.25)", letterSpacing: "0.06em" }}
                >
                  {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              borderLeft: "1px solid rgba(34,197,94,0.1)",
              position: "relative",
              height: `${24 * 64}px`,
              cursor: "pointer",
            }}
            onClick={() => {
              const clicked = new Date(date);
              clicked.setHours(9, 0, 0, 0);
              onClickSlot(clicked);
            }}
          >
            {HOURS.map(h => (
              <div
                key={h}
                style={{
                  height: "64px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              />
            ))}
            {dayAppts.map(a => {
              const start = new Date(a.startAt);
              const end = new Date(a.endAt);
              const topPct = (start.getHours() + start.getMinutes() / 60) / 24;
              const heightPct = Math.max(
                (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
                1 / 24
              );
              return (
                <button
                  key={a.id}
                  onClick={e => { e.stopPropagation(); onClickAppt(a); }}
                  style={{
                    position: "absolute",
                    top: `${topPct * 100}%`,
                    height: `${heightPct * 100}%`,
                    left: "8px",
                    right: "8px",
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.4)",
                    padding: "4px 8px",
                    textAlign: "left",
                    overflow: "hidden",
                    zIndex: 1,
                  }}
                >
                  <div
                    className="display-text"
                    style={{ fontSize: "0.7rem", color: "#22c55e", letterSpacing: "0.05em" }}
                  >
                    {a.title}
                  </div>
                  <div
                    className="display-text"
                    style={{ fontSize: "0.6rem", color: "rgba(34,197,94,0.55)" }}
                  >
                    {formatTime(a.startAt)} – {formatTime(a.endAt)} · {formatDuration(a.startAt, a.endAt)}
                    {a.location && ` · ${a.location}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function useNotificationAlarms(appointments: Appointment[]) {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!("Notification" in window)) return;

    const check = () => {
      const now = Date.now();
      for (const appt of appointments) {
        const reminderAt = new Date(appt.startAt).getTime() - appt.reminderMinutes * 60 * 1000;
        const key = `${appt.id}-reminder`;
        if (now >= reminderAt && now <= reminderAt + 60000 && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          if (Notification.permission === "granted") {
            new Notification(`[ CHRONO-4 ALARM ] ${appt.title}`, {
              body: `Starting in ${appt.reminderMinutes} min${appt.location ? ` @ ${appt.location}` : ""}`,
              tag: key,
            });
          }
        }
      }
    };

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const id = setInterval(check, 30000);
    check();
    return () => clearInterval(id);
  }, [appointments]);
}

export default function Calendar() {
  const { user, isAuthenticated } = useAuth();
  usePlan();
  const { toast } = useToast();
  const [boomerMode] = useState(() => getDefaultBoomerMode());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date(today));
  const [selectedDate, setSelectedDate] = useState(new Date(today));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [defaultSlotDate, setDefaultSlotDate] = useState(new Date(today));
  const [emailModal, setEmailModal] = useState<Appointment | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [meetModal, setMeetModal] = useState(false);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetCreating, setMeetCreating] = useState(false);
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [meetCode, setMeetCode] = useState<string | null>(null);
  const [meetInviteEmail, setMeetInviteEmail] = useState("");
  const [meetInviteSending, setMeetInviteSending] = useState(false);

  useNotificationAlarms(appointments);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(apiUrl("calendar/appointments"), { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setAppointments(data.appointments ?? []);
      }
    } catch (e) {
      console.error("fetch appointments error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
    } else {
      setLoading(false);
    }
  }, [user, fetchAppointments]);

  if (!isAuthenticated) {
    return <SignInPage context={boomerMode ? 'Sign in to access your calendar.' : 'Operative credentials required. SCHEDULE GRID access locked.'} />;
  }

  function buildISOFromForm(form: ApptForm) {
    const startAt = new Date(`${form.startDate}T${form.startTime}`).toISOString();
    const endAt = new Date(`${form.startDate}T${form.endTime}`).toISOString();
    return { startAt, endAt };
  }

  async function handleSave(form: ApptForm) {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const { startAt, endAt } = buildISOFromForm(form);
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        location: form.location,
        startAt,
        endAt,
        reminderMinutes: form.reminderMinutes,
      };
      if ((editTarget as any)?.meetingRoomCode) {
        payload.meetingRoomCode = (editTarget as any).meetingRoomCode;
      }

      const url = editTarget
        ? apiUrl(`calendar/appointments/${editTarget.id}`)
        : apiUrl("calendar/appointments");
      const method = editTarget ? "PUT" : "POST";

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        await fetchAppointments();
        setModalOpen(false);
        setEditTarget(null);
        toast({
          title: editTarget ? "Mission updated" : "Mission created",
          description: form.title,
        });
      } else {
        const err = await resp.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editTarget) return;
    setSaving(true);
    try {
      const resp = await fetch(apiUrl(`calendar/appointments/${editTarget.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (resp.ok) {
        await fetchAppointments();
        setModalOpen(false);
        setEditTarget(null);
        toast({ title: "Mission deleted" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMeeting() {
    if (!meetTitle.trim()) return;
    setMeetCreating(true);
    try {
      const resp = await fetch(apiUrl("meetings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: meetTitle.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const code = data.meeting.roomCode;
        const link = `${window.location.origin}/meet/${code}`;
        setMeetCode(code);
        setMeetLink(link);
      } else {
        const err = await resp.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } finally {
      setMeetCreating(false);
    }
  }

  async function handleSendMeetInvite() {
    if (!meetCode || !meetInviteEmail.trim()) return;
    setMeetInviteSending(true);
    try {
      const resp = await fetch(apiUrl(`meetings/${meetCode}/invite`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails: [meetInviteEmail.trim()] }),
      });
      if (resp.ok) {
        toast({ title: "Invite sent", description: `Hologram link sent to ${meetInviteEmail.trim()}` });
        setMeetInviteEmail("");
      } else {
        const err = await resp.json();
        toast({ title: "Invite failed", description: err.error, variant: "destructive" });
      }
    } finally {
      setMeetInviteSending(false);
    }
  }

  async function handleSendEmail() {
    if (!emailModal || !emailInput.trim()) return;
    setEmailSending(true);
    try {
      const resp = await fetch(
        apiUrl(`calendar/appointments/${emailModal.id}/send-confirmation`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: emailInput.trim() }),
        }
      );
      if (resp.ok) {
        toast({ title: "Confirmation sent", description: `Email sent to ${emailInput.trim()}` });
        setEmailModal(null);
        setEmailInput("");
      } else {
        const err = await resp.json();
        toast({ title: "Email failed", description: err.error, variant: "destructive" });
      }
    } finally {
      setEmailSending(false);
    }
  }

  function openNew(slotDate?: Date) {
    setEditTarget(null);
    setDefaultSlotDate(slotDate ?? selectedDate);
    setModalOpen(true);
  }

  function openEdit(appt: Appointment) {
    setEditTarget(appt);
    setModalOpen(true);
  }

  function navigate(dir: 1 | -1) {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  }

  function goToday() {
    setCurrentDate(new Date(today));
    setSelectedDate(new Date(today));
  }

  const currentWeekStart = startOfWeek(currentDate);

  const navLabel = (() => {
    if (view === "month") return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${ws.getMonth() !== we.getMonth() ? MONTH_NAMES[we.getMonth()] + " " : ""}${we.getDate()}, ${we.getFullYear()}`;
    }
    return `${DAY_NAMES[currentDate.getDay()]} ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  })();

  const productName = boomerMode ? "CALENDAR" : PABLO_PRODUCTS.CALENDAR.short;

  return (
      <div
        className="flex flex-col"
        style={{
          minHeight: "calc(100vh - 88px)",
          background: "#09090b",
          fontFamily: "'Share Tech Mono', monospace",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2 gap-4 flex-wrap"
          style={{ borderBottom: "1px solid rgba(34,197,94,0.15)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center"
              style={{
                width: "28px",
                height: "28px",
                border: "1px solid rgba(34,197,94,0.5)",
                background: "rgba(34,197,94,0.08)",
              }}
            >
              <CalendarIcon className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
            </div>
            <div>
              <h1
                className="display-text leading-none"
                style={{
                  fontSize: "1rem",
                  color: "#22c55e",
                  textShadow: "0 0 10px rgba(34,197,94,0.6)",
                  letterSpacing: "0.12em",
                }}
              >
                {productName}
              </h1>
              <p
                className="display-text leading-none mt-0.5"
                style={{ fontSize: "0.6rem", color: "rgba(34,197,94,0.35)", letterSpacing: "0.1em" }}
              >
                {boomerMode ? "Scheduling" : PABLO_PRODUCTS.CALENDAR.desc.split(".")[0].toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex" style={{ border: "1px solid rgba(34,197,94,0.25)" }}>
              {(["month", "week", "day"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-3 py-1 display-text transition-all"
                  style={{
                    fontSize: "0.6rem",
                    letterSpacing: "0.1em",
                    color: view === v ? "#030803" : "rgba(34,197,94,0.5)",
                    background: view === v ? "rgba(34,197,94,0.85)" : "transparent",
                    borderRight: v !== "day" ? "1px solid rgba(34,197,94,0.2)" : "none",
                    textTransform: "uppercase",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(-1)}
                className="p-1"
                style={{ color: "rgba(34,197,94,0.5)", border: "1px solid rgba(34,197,94,0.2)" }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={goToday}
                className="px-2 py-1 display-text"
                style={{
                  fontSize: "0.6rem",
                  color: "rgba(34,197,94,0.6)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  letterSpacing: "0.08em",
                }}
              >
                TODAY
              </button>
              <button
                onClick={() => navigate(1)}
                className="p-1"
                style={{ color: "rgba(34,197,94,0.5)", border: "1px solid rgba(34,197,94,0.2)" }}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <span
              className="display-text text-xs"
              style={{ color: "rgba(34,197,94,0.6)", letterSpacing: "0.1em", minWidth: "180px", textAlign: "center" }}
            >
              {navLabel}
            </span>

            <button
              onClick={() => { setMeetTitle(""); setMeetLink(null); setMeetCode(null); setMeetInviteEmail(""); setMeetModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 display-text transition-all"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "#67e8f9",
                background: "rgba(103,232,249,0.07)",
                border: "1px solid rgba(103,232,249,0.35)",
                textShadow: "0 0 8px rgba(103,232,249,0.4)",
              }}
            >
              <Video className="w-3.5 h-3.5" />
              MEET
            </button>

            <button
              onClick={() => openNew()}
              className="flex items-center gap-1.5 px-3 py-1.5 display-text transition-all"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "#22c55e",
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.4)",
                textShadow: "0 0 8px rgba(34,197,94,0.4)",
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              NEW
            </button>
          </div>
        </div>

        {/* Status bar */}
        {appointments.length > 0 && (
          <div
            className="px-4 py-1 display-text text-xs flex items-center gap-4"
            style={{
              borderBottom: "1px solid rgba(34,197,94,0.08)",
              color: "rgba(34,197,94,0.3)",
              letterSpacing: "0.08em",
            }}
          >
            <span><AlarmClock className="w-2.5 h-2.5 inline mr-1" />{appointments.length} TOTAL MISSIONS</span>
            <span>
              {appointments.filter(a => new Date(a.startAt) > new Date()).length} UPCOMING
            </span>
          </div>
        )}

        {/* Calendar body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="display-text text-sm"
              style={{ color: "rgba(34,197,94,0.4)", letterSpacing: "0.15em" }}
            >
              LOADING TEMPORAL DATA...
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {view === "month" && (
              <MonthView
                year={currentDate.getFullYear()}
                month={currentDate.getMonth()}
                appointments={appointments}
                today={today}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onClickAppt={openEdit}
                onClickDay={d => openNew(d)}
              />
            )}
            {view === "week" && (
              <WeekView
                weekStart={currentWeekStart}
                appointments={appointments}
                today={today}
                onClickAppt={openEdit}
                onClickSlot={d => openNew(d)}
              />
            )}
            {view === "day" && (
              <DayView
                date={currentDate}
                appointments={appointments}
                onClickAppt={openEdit}
                onClickSlot={d => openNew(d)}
              />
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && appointments.length === 0 && (
          <div
            className="fixed bottom-8 left-0 right-0 flex justify-center pointer-events-none"
          >
            <div
              className="display-text text-xs text-center"
              style={{ color: "rgba(34,197,94,0.2)", letterSpacing: "0.12em" }}
            >
              NO MISSIONS SCHEDULED · CLICK ANY DAY OR [+ NEW] TO ADD ONE
            </div>
          </div>
        )}

        {/* Meeting link modal */}
        {meetModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.88)" }}
            onClick={e => { if (e.target === e.currentTarget) setMeetModal(false); }}
          >
            <CRTBorder className="w-full max-w-sm">
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid rgba(103,232,249,0.2)" }}
              >
                <span
                  className="display-text text-xs tracking-widest"
                  style={{ color: "rgba(103,232,249,0.7)" }}
                >
                  <Video className="w-3 h-3 inline mr-1" />
                  [ HOLOGRAM MEETING ]
                </span>
                <button onClick={() => setMeetModal(false)} style={{ color: "rgba(103,232,249,0.4)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                {!meetLink ? (
                  <>
                    <div
                      className="display-text text-xs"
                      style={{ color: "rgba(103,232,249,0.5)", letterSpacing: "0.08em" }}
                    >
                      Create a hologram meeting room. Guests join via browser — no account needed.
                    </div>
                    <div>
                      <label
                        className="display-text text-xs block mb-1"
                        style={{ color: "rgba(103,232,249,0.5)", letterSpacing: "0.1em" }}
                      >
                        MEETING TITLE
                      </label>
                      <input
                        className="w-full display-text text-sm px-3 py-2 outline-none"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(103,232,249,0.25)",
                          color: "#67e8f9",
                          fontFamily: "'Share Tech Mono', monospace",
                        }}
                        value={meetTitle}
                        onChange={e => setMeetTitle(e.target.value)}
                        placeholder="e.g. Interview Round 2..."
                        onKeyDown={e => { if (e.key === "Enter") handleCreateMeeting(); }}
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={handleCreateMeeting}
                      disabled={meetCreating || !meetTitle.trim()}
                      className="flex items-center justify-center gap-2 py-2 display-text text-xs"
                      style={{
                        background: "rgba(103,232,249,0.1)",
                        border: "1px solid rgba(103,232,249,0.4)",
                        color: "#67e8f9",
                        letterSpacing: "0.1em",
                        opacity: meetCreating || !meetTitle.trim() ? 0.5 : 1,
                      }}
                    >
                      {meetCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                      GENERATE MEETING LINK
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="display-text text-xs"
                      style={{ color: "rgba(103,232,249,0.5)", letterSpacing: "0.08em" }}
                    >
                      Room ready. Share this link with guests:
                    </div>
                    <div
                      className="display-text text-xs px-3 py-2 break-all"
                      style={{
                        background: "rgba(103,232,249,0.05)",
                        border: "1px solid rgba(103,232,249,0.2)",
                        color: "#67e8f9",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {meetLink}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { navigator.clipboard.writeText(meetLink!); toast({ title: "Copied!", description: "Meeting link copied to clipboard" }); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2 display-text text-xs"
                        style={{
                          background: "rgba(103,232,249,0.08)",
                          border: "1px solid rgba(103,232,249,0.3)",
                          color: "#67e8f9",
                          letterSpacing: "0.08em",
                        }}
                      >
                        <Copy className="w-3 h-3" />
                        COPY
                      </button>
                      <button
                        onClick={() => window.open(meetLink!, "_blank")}
                        className="flex-1 flex items-center justify-center gap-2 py-2 display-text text-xs"
                        style={{
                          background: "rgba(103,232,249,0.08)",
                          border: "1px solid rgba(103,232,249,0.3)",
                          color: "#67e8f9",
                          letterSpacing: "0.08em",
                        }}
                      >
                        <ExternalLink className="w-3 h-3" />
                        JOIN
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setMeetModal(false);
                        setDefaultSlotDate(new Date());
                        setEditTarget({ title: meetTitle, meetingRoomCode: meetCode } as any);
                        setModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 display-text text-xs"
                      style={{
                        background: "rgba(34,197,94,0.06)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        color: "rgba(34,197,94,0.7)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <Plus className="w-3 h-3" />
                      ADD TO CALENDAR
                    </button>
                    <div
                      className="display-text text-xs"
                      style={{ color: "rgba(103,232,249,0.4)", letterSpacing: "0.08em", borderTop: "1px solid rgba(103,232,249,0.1)", paddingTop: "12px" }}
                    >
                      EMAIL INVITE TO GUEST:
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 display-text text-xs px-3 py-2 outline-none"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(103,232,249,0.2)",
                          color: "#67e8f9",
                          fontFamily: "'Share Tech Mono', monospace",
                        }}
                        value={meetInviteEmail}
                        onChange={e => setMeetInviteEmail(e.target.value)}
                        placeholder="guest@email.com"
                        type="email"
                        onKeyDown={e => { if (e.key === "Enter") handleSendMeetInvite(); }}
                      />
                      <button
                        onClick={handleSendMeetInvite}
                        disabled={meetInviteSending || !meetInviteEmail.trim()}
                        className="flex items-center justify-center gap-2 px-3 py-2 display-text text-xs"
                        style={{
                          background: "rgba(103,232,249,0.08)",
                          border: "1px solid rgba(103,232,249,0.3)",
                          color: "#67e8f9",
                          opacity: meetInviteSending || !meetInviteEmail.trim() ? 0.5 : 1,
                        }}
                      >
                        {meetInviteSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </CRTBorder>
          </div>
        )}

        {/* Appointment modal */}
        {modalOpen && (
          <ApptModal
            initial={editTarget}
            defaultDate={defaultSlotDate}
            onSave={handleSave}
            onDelete={editTarget ? handleDelete : undefined}
            onClose={() => { setModalOpen(false); setEditTarget(null); }}
            saving={saving}
          />
        )}

        {/* Email confirmation modal */}
        {emailModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)" }}
            onClick={e => { if (e.target === e.currentTarget) setEmailModal(null); }}
          >
            <CRTBorder className="w-full max-w-sm">
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid rgba(34,197,94,0.2)" }}
              >
                <span
                  className="display-text text-xs tracking-widest"
                  style={{ color: "rgba(34,197,94,0.6)" }}
                >
                  <Mail className="w-3 h-3 inline mr-1" />
                  [ SEND CONFIRMATION ]
                </span>
                <button onClick={() => setEmailModal(null)} style={{ color: "rgba(34,197,94,0.4)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div
                  className="display-text text-xs"
                  style={{ color: "rgba(34,197,94,0.6)", letterSpacing: "0.08em" }}
                >
                  {emailModal.title}
                </div>
                <input
                  className="w-full display-text text-sm px-3 py-2 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    color: "#22c55e",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="recipient@email.com"
                  type="email"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailInput.trim()}
                  className="flex items-center justify-center gap-2 py-2 display-text text-xs"
                  style={{
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.35)",
                    color: "#22c55e",
                    letterSpacing: "0.1em",
                  }}
                >
                  {emailSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                  SEND CONFIRMATION
                </button>
              </div>
            </CRTBorder>
          </div>
        )}
      </div>
  );
}
