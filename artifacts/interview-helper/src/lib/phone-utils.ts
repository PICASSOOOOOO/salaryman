export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatPhone(num: string): string {
  if (!num) return num;
  const digits = num.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (num.startsWith('+') && digits.length >= 7) return num;
  if (digits.length >= 7 && (digits.length < 10 || digits.length > 11)) return num;
  return num;
}

export const ENDED_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled', 'transferred'];

export interface CRMContact {
  id: number;
  name: string;
  phone: string;
  email: string;
  hometown: string;
  company?: string;
}

export interface ActiveCall {
  callSid: string;
  phone: string;
  name: string;
  status: string;
  startTime: number;
  elapsed: number;
  muted?: boolean;
  onHold?: boolean;
  direction?: string;
  signalLevel?: number;
  conferenceName?: string;
  liveTranscript?: string;
  recordingActive?: boolean;
  aiCoachTip?: string;
}

export function callStatusToSignalLevel(status: string): number {
  switch (status) {
    case 'in-progress': return 5;
    case 'ringing': return 2;
    case 'queued':
    case 'initiated': return 1;
    case 'reconnecting': return 1;
    default: return 0;
  }
}

export interface BatchResult {
  ok: boolean;
  phone: string;
  name?: string;
  callSid?: string;
  error?: string;
  status?: string;
}

export interface CallRecord {
  id: number;
  recipientNumber: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string;
  callerName: string | null;
  twilioCallSid?: string | null;
  direction?: string;
  callType?: string;
  transcript?: string | null;
  summary?: string | null;
  notes?: string | null;
  calendarEventId?: number | null;
  contactId?: number | null;
  recordingUrl?: string | null;
  recordingSid?: string | null;
  recordingRetainUntil?: string | null;
}

export interface VoicemailRecord {
  id: number;
  fromNumber: string;
  fromName: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  summary: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PhoneNumber {
  id: number;
  number: string;
  label: string;
  friendlyName: string | null;
  greeting: string | null;
  routingMode: string;
  isActive: boolean;
  countryCode: string | null;
  cityId: string | null;
  region: string | null;
}

export interface CountryDialInfo {
  iso: string;
  name: string;
  dialCode: string;
  trunkPrefix?: string;
  flag: string;
  example: string;
  region: string;
}

export interface RegulatoryRequirement {
  required: boolean;
  bundleType?: string;
  message: string;
  docsUrl?: string;
}

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  capabilities: Record<string, boolean> | null;
}

export interface SecretaryConfig {
  isEnabled: boolean;
  personality: string;
  greetingScript: string | null;
  screeningRules: string | null;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: string;
  routingInstructions: string | null;
  forwardToNumber: string | null;
  afterHoursAction: string;
  autoAnswer: boolean;
  qualificationQuestions: string | null;
  transferRouting: string | null;
  outboundScript: string | null;
  outboundSchedule: string | null;
  inboundDid: string | null;
  outboundDid: string | null;
  screeningTimeLimit: number;
  screeningScript: string | null;
}

export interface CallCenterAgent {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  lastCallAt: string | null;
  totalCalls: number;
  createdAt: string;
}

export interface InboundScreening {
  id: number;
  twilioCallSid: string;
  callerNumber: string;
  callerName: string | null;
  agentId: number | null;
  agentName: string | null;
  transferredToPhone: string | null;
  outcome: string;
  screeningDurationSeconds: number | null;
  summary: string | null;
  extractedData: string | null;
  contactId: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OutboundCampaign {
  id: number;
  name: string;
  script: string;
  leadsJson: string;
  scheduleJson: string | null;
  status: string;
  totalLeads: number;
  dialedCount: number;
  answeredCount: number;
  convertedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConferenceRoom {
  id: number;
  roomName: string;
  status: string;
  participantsJson: string | null;
}

export const slate = (opacity: number) => `rgba(56,189,248,${opacity})`;
export const destructive = (opacity: number) => `rgba(255,40,40,${opacity})`;
export const warning = (opacity: number) => `rgba(255,180,0,${opacity})`;
export const primary = (opacity: number) => `rgba(0,150,255,${opacity})`;
export const accent = (opacity: number) => `rgba(180,0,255,${opacity})`;

const ACTIVE_CALLS_KEY = 'phone_active_calls';

export function loadActiveCalls(): ActiveCall[] {
  try { return JSON.parse(sessionStorage.getItem(ACTIVE_CALLS_KEY) ?? '[]'); } catch { return []; }
}

export function saveActiveCalls(calls: ActiveCall[]) {
  try { sessionStorage.setItem(ACTIVE_CALLS_KEY, JSON.stringify(calls)); } catch {}
}

export function addActiveCall(call: ActiveCall) {
  const existing = loadActiveCalls();
  const filtered = existing.filter(c => c.callSid !== call.callSid);
  filtered.push(call);
  saveActiveCalls(filtered);
}

export function addActiveCallsBatch(calls: ActiveCall[]) {
  const existing = loadActiveCalls();
  const existingSids = new Set(existing.map(c => c.callSid));
  const newCalls = calls.filter(c => !existingSids.has(c.callSid));
  saveActiveCalls([...existing, ...newCalls]);
}

