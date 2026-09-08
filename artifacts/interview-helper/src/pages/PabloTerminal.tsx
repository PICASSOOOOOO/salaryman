import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Send, Keyboard, MessageCircle, GraduationCap, LogIn, Download } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { PabloControlsMenu } from "@/components/PabloControlsMenu";
import { apiFetch } from "@/lib/api-client";
import { sanitizeReturnPath } from "@/lib/safe-path";
import { speakWithTTS, unlockAudio, armAudioAutoUnlock } from "@/lib/tts";
import { useAuth } from "@/hooks/use-auth";
import { Component as ReactComponent, type ReactNode as RNode } from "react";
import { PabloNebula3D, PABLO_VARIANT, MILA_VARIANT } from "@/components/PabloNebula3D";
import { useBoomerMode } from "@/hooks/use-mobile";
import { VisionIntake } from "@/components/VisionIntake";
import {
  isTutorialDone,
  setSalarymanName, setSalarymanEmail, getSalarymanName, getSalarymanEmail, isLikelyEmail,
} from "@/lib/tutorial-progress";
import { isReadyToEnter, isCostCurious, isShowPapers } from "@/lib/signup-intent";
import { formatSpeechName } from "@/lib/speech-name";
import { TIMEZONE_CITIES } from "@/gameSystems";

const PABLO_TTS_OPTIONS = { character: "PABLO" } as const;

// Map the visitor's IANA timezone (e.g. "America/Los_Angeles") to one
// of the in-platform city labels by matching the current UTC offset to
// the closest entry in TIMEZONE_CITIES. Returns just the city name (no
// "(PST)" suffix) so Pablo can drop it into prose. Returns null when we
// can't read the timezone — caller should treat that as "no city
// signal" and not fabricate one.
function deriveUserCityName(): string | null {
  if (typeof Intl === "undefined") return null;
  let offsetHours: number;
  try {
    // Date#getTimezoneOffset returns minutes WEST of UTC (positive for
    // negative offsets), so negate to get the conventional signed
    // offset (e.g. PST → -8, JST → +9).
    offsetHours = -new Date().getTimezoneOffset() / 60;
  } catch {
    return null;
  }
  let best: { label: string; offset: number } = TIMEZONE_CITIES[0];
  let bestDelta = Math.abs(offsetHours - best.offset);
  for (const tz of TIMEZONE_CITIES) {
    const delta = Math.abs(offsetHours - tz.offset);
    if (delta < bestDelta) { best = tz; bestDelta = delta; }
  }
  // Strip the "(PST)" trailing parenthetical if present — we want
  // the bare city name for natural-sounding sentences.
  const bare = best.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // The PST entry in TIMEZONE_CITIES uses CITY_NAME = 'MINX CITY'
  // (shared with WorldPlay's in-game branding). Pablo must NOT call
  // the player's city "Minx City" anymore — substitute a neutral
  // alias for the PST band so the prompt context never carries that
  // string. Other timezones (NEW EDEN, IRON FALLS, etc.) pass
  // through unchanged.
  if (/^MINX\s+CITY$/i.test(bare)) return "NEON ANGELES";
  return bare;
}

// Server-side allowlist mirror — the public chat endpoint only accepts
// userCity values that match this exact set, so a hostile caller can't
// smuggle arbitrary text into Pablo's system context. Keep in sync with
// the labels produced by deriveUserCityName above.
const ALLOWED_USER_CITIES: ReadonlySet<string> = new Set([
  "NEON ANGELES",
  "NEW EDEN",
  "IRON FALLS",
  "DUST VALLEY",
  "NEXUS PRIME",
  "STEEL BERLIN",
  "NEO TOKYO",
  "CHROME SYDNEY",
  "CYBER MUMBAI",
]);
// Re-export for the test surface; kept un-exported in module scope
// otherwise. (Just leaving the constant here documents the contract.)
void ALLOWED_USER_CITIES;

type NebulaStatusLite = "idle" | "listening" | "thinking" | "speaking";

const ORB_COLORS: Record<NebulaStatusLite, { core: string; halo: string; ring: string }> = {
  idle:      { core: "#a78bfa", halo: "#7c3aed", ring: "#4c1d95" },
  listening: { core: "#67e8f9", halo: "#06b6d4", ring: "#155e75" },
  thinking:  { core: "#fbbf24", halo: "#f59e0b", ring: "#78350f" },
  speaking:  { core: "#f0abfc", halo: "#d946ef", ring: "#86198f" },
};

// Pure-CSS animated orb. No WebGL, no chunk loading. Only used as a safety net.
function NebulaOrb2D({ status, size }: { status: NebulaStatusLite; size: number }) {
  const c = ORB_COLORS[status] ?? ORB_COLORS.idle;
  const speed = status === "listening" ? "1.4s" : status === "speaking" ? "1.8s" : status === "thinking" ? "2.2s" : "3.5s";
  // Bright core capped in px so a full-bleed orb stays a soft glow, not a disc.
  const coreGlow = Math.min(size * 0.18, 96);
  return (
    <div style={{ width: size, height: size, position: "relative", overflow: "hidden" }} aria-label="Pablo nebula">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 20%, ${c.ring} 42%, transparent 68%)`,
        filter: `blur(${Math.max(4, size * 0.01)}px)`, opacity: 0.85,
        animation: `pablo-orb-pulse ${speed} ease-in-out infinite`,
      }} />
      <div style={{
        position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
        width: coreGlow, height: coreGlow, borderRadius: "50%",
        background: `radial-gradient(circle, #fff 0%, ${c.core} 42%, transparent 74%)`,
        filter: "blur(3px)", opacity: 0.9, mixBlendMode: "screen",
      }} />
      <style>{`@keyframes pablo-orb-pulse { 0%,100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.04); opacity: 0.95; } }`}</style>
    </div>
  );
}

class NebulaErrorBoundary extends ReactComponent<{ children: RNode; fallback: RNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[PabloTerminal] Nebula crashed, using 2D fallback:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Idle one-liners Pablo cycles through for returning users. The point is
// presence — Pablo always feels like he's
// in the chat, watching, joking, occasionally trying to upsell PABLO PRIME.
// We pick a line at random on each mount and keep a tiny "recently said"
// queue in localStorage so the same line never repeats two visits in a row.
const IDLE_LINES: string[] = [
  "Welcome back. I'm Pablo — your host here. What do you need?",
  "Still with us? Good. This city eats the idle alive. What's on your mind?",
  "You came back. Smart. In here you work, or you die trying. Where do we start?",
  "I keep an eye on everyone who walks in. Glad it's you. How can I help?",
  "Your host, at your service. Lost, curious, or ready to work — tell me.",
  "The position's still open if you want it. First — what can I do for you?",
  "I worry about the ones who wander off. Stay close. What do you need?",
  "Talk to me. I've watched a thousand careers rise and fall. Yours can rise.",
  "Quick question, big question, all welcome. I'm here to keep you alive in this town.",
  "Ready when you are. Just remember — in this city, standing still is how you lose.",
  "Speak or type, I'll keep up. Your host doesn't miss much.",
  "What do you want to figure out? The clock's always running in here.",
];

// Persisted ring of recently-shown indices so we don't repeat in a row.
const IDLE_RECENT_KEY = "pablo.idle.recent";
const IDLE_RECENT_MAX = 8;
function pickIdleLine(): string {
  if (typeof window === "undefined") return IDLE_LINES[0];
  let recent: number[] = [];
  try {
    const raw = window.localStorage.getItem(IDLE_RECENT_KEY);
    if (raw) recent = (JSON.parse(raw) as number[]).filter(n => Number.isInteger(n));
  } catch {}
  const candidates = IDLE_LINES.map((_, i) => i).filter(i => !recent.includes(i));
  const pool = candidates.length > 0 ? candidates : IDLE_LINES.map((_, i) => i);
  const idx = pool[Math.floor(Math.random() * pool.length)];
  const next = [idx, ...recent].slice(0, IDLE_RECENT_MAX);
  try { window.localStorage.setItem(IDLE_RECENT_KEY, JSON.stringify(next)); } catch {}
  return IDLE_LINES[idx];
}

type Mode = "voice" | "text";

// Sanitize a path before we hand it to OAuth as `returnTo` or stash it as
// a pending destination. The LLM occasionally emits weird-shaped paths
// (server endpoints with /api/, paths with bare hashes/queries, even
// protocol-relative `//evil.com` strings that look like an open-redirect
// attack vector). We reject anything that:
//   - isn't a string starting with `/`
//   - looks protocol-relative (`//foo`) or has control chars
//   - whose URL-parsed pathname is `/api` or starts with `/api/` (any case
//     — sometimes models capitalize as `/API/login`)
// On success we return a clean `${pathname}${search}${hash}` string so
// callers can use it directly as a same-origin location. On rejection we
// return null and callers fall back to the default landing page.
// sanitizeReturnPath now lives in @/lib/safe-path so the global command palette
// enforces identical navigation safety. Imported at the top of this file.

// Detect a returning user who just wants to sign in. They shouldn't be
// dragged through new-user identity collection — OAuth covers the account
// half on its own. We bypass the
// intro entirely and hand them straight to /sign-in. This also avoids
// a feedback loop where the LLM might return navigate to '/sign-in',
// our intro-gate would stash it as a "destination", and the email-step
// `returnTo` would point back at the auth endpoint itself.
function detectSignInIntent(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ");
  if (!t) return false;

  // === EXCLUSIONS first — kill obvious false positives. ===

  // Negations: "don't sign me in", "do not log me in", "never sign me on".
  if (/\b(don'?t|do not|never|no)\s+(sign|log)\s+(me\s+)?(in|on)\b/.test(t)) return false;

  // Informational ("how do I log in?", "where's the login?") — user wants
  // to KNOW about login, not be logged in.
  if (/\bhow\s+(do|can|to)\s+i\s+(sign|log)\s*(in|on)\b/.test(t)) return false;
  if (/\b(what'?s|where'?s)\s+(the|my)\s+(login|sign\s*in|sign\s*on)\b/.test(t)) return false;

  // Login is being used as a noun, not a verb: "login info", "login page",
  // "login button", "sign-in form", etc. None of these mean "log me in now".
  if (/\b(login|log\s*in|signin|sign\s*in)\s+(info|information|details|credentials|page|button|form|link|url|screen|prompt|help|process|flow|method|option)\b/.test(t)) return false;

  // "Sign me up" is account creation, not sign-in. We let that go through
  // the normal new-user sequence.
  if (/\b(sign|signing)\s+(me\s+)?up\b/.test(t)) return false;
  if (/\bsignup\b/.test(t)) return false;

  // === POSITIVE matches — actual user intent to be signed in. ===

  // Imperative: "sign me in", "log me in", "sign me on".
  if (/\b(sign|log)\s+me\s+(in|on)\b/.test(t)) return true;
  // "Let me sign in", "let me log in".
  if (/\blet\s+me\s+(sign|log)\s*(in|on)\b/.test(t)) return true;
  // First-person intent: "I want to sign in", "I'd like to log in", "please log in".
  if (/\b(i\s+(want|need|would\s+like)\s+to|i'?ll|please)\s+(sign|log)\s*(in|on)\b/.test(t)) return true;
  // "Sign in now", "log in please".
  if (/\b(sign|log)\s*(in|on)\s+(now|please)\b/.test(t)) return true;
  // "Authenticate me".
  if (/\bauthenticate\s+me\b/.test(t)) return true;
  // "I (already) have an account" — same effective intent.
  if (/\bi\s+(already\s+)?have\s+(an|my)\s+account\b/.test(t)) return true;
  // Standalone short forms a user actually types alone in the box.
  if (/^(login|log\s*in|signin|sign\s*in|signon|sign\s*on)$/.test(t)) return true;

  return false;
}

// Detect a general question / help request — used during the asking-name and
// asking-email intake phases so an interruption like "what's a salaryman?"
// or "do I have to give my real email?" doesn't get stored as the user's
// name. When this returns true, the caller routes the input to Pablo's LLM
// for an answer and then re-prompts for the original field instead of
// advancing the phase.
//
// Heuristics (intentionally conservative — false-positives would lock the
// user out of completing intake):
//   - Ends in `?`
//   - Starts with a wh-word, "do/does/did", "can/could/would/should/may",
//     "is/are/was/were", "have/has", "tell me", "explain", "help"
//   - Contains "what is", "how do", "why is", etc.
// We deliberately do NOT match plain greetings ("hi", "hello") so the user
// can still skip Pablo's monologue with a casual greeting.
function isGeneralQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  if (/^(what|why|how|when|where|who|which|whose|whom)\b/.test(t)) return true;
  if (/^(do|does|did|can|could|would|should|may|might|will|is|are|was|were|am|have|has|had)\b\s+\w/.test(t)) return true;
  if (/^(tell\s+me|explain|help|i\s+(don'?t|do\s+not)\s+(know|understand))\b/.test(t)) return true;
  return false;
}

// During the pre-onboarding chat phase, isReadyToEnter / isCostCurious detect
// the visitor signaling they're ready to come in / sign up, or asking whether
// it costs anything (a buying signal). Both are pure, regex-driven, and live in
// @/lib/signup-intent so they can be unit-tested without the terminal component.

// Visitor wants to USE / DO something that requires being inside —
// make a call, see their dashboard, hire a bot, run payroll, save
// anything, take a tour, see the map, etc. The chatting branch reads
// this and pivots to asking-name so the intro flow runs (name → email
// → OAuth) before handing them the tool. Distinct from "I'm ready":
// here the visitor is asking for an action, not announcing intent to
// sign in. We trigger the intro on their behalf.
// Architect-flagged: the original regex missed common feature-intent
// phrasings like "open dashboard", "go to payroll", "create an
// invoice", "need a phone number". Broadened the verb list AND the
// noun list. Still a verb+noun pattern (no noun-only triggering —
// casual mentions of "calendar" or "plans" must NOT pivot to intake).
const WANTS_TOOL_RE = /\b(?:(?:can|could|will|would|may)\s+(?:i|you)|how\s+(?:do|can|would)\s+i|let\s+me|i\s+(?:want|wanna|need|would\s+like|'?d\s+like)\s+(?:to|a|an|my|the)?|i'?m\s+looking\s+for|looking\s+for|show\s+me|take\s+me\s+to|bring\s+me\s+to|give\s+me|get\s+me|set\s+me\s+up|hook\s+me\s+up|sign\s+me\s+up\s+for|start\s+(?:a|my)?|make\s+(?:a|my)?|create\s+(?:a|an|my)?|build\s+(?:a|my)?|book\s+(?:a|my)?|open\s+(?:my|the|a)?|go\s+to|navigate\s+to|head\s+to|launch|run|hire|see\s+(?:my|the)|view\s+(?:my|the)|need\s+(?:a|an|my|the)?)\s*[\w\s'?-]{0,40}?\b(?:call|phone|number|voicemail|payroll|paycheck|invoice|invoices|calendar|contact|contacts|map|tour|dashboard|account|profile|inside|in|business|empire|salaryman|bot|agent|hire|payment|stripe|plan|plans|pricing|price|tier|sub(?:scription)?|trial|signup|sign\s*up|signin|sign\s*in|register|join|studio|art|image|sound|writing|brand|book|appointment|schedule|meeting)\b/i;
function wantsTool(text: string): boolean {
  return WANTS_TOOL_RE.test(text.trim());
}

// Voice transcripts spell email addresses out loud — "alex at gmail dot com",
// "alex underscore j at gmail dot c o m". Browsers and Whisper rarely emit a
// literal "@" or "." for spoken email. Normalize those spoken tokens back to
// their punctuation so isLikelyEmail can validate the result. Conservative on
// purpose: only touches sequences that look like they're inside an email
// fragment, never globally rewrites the user's prose.
function normalizeSpokenEmail(s: string): string {
  let out = s
    // Common transcription artifacts of "@"
    .replace(/\s+(at|@)\s+/gi, "@")
    .replace(/\bat sign\b/gi, "@")
    // " dot " / " period " between word chars → "."
    .replace(/\s+(dot|period)\s+/gi, ".")
    // " underscore " / " dash " / " hyphen "
    .replace(/\s+underscore\s+/gi, "_")
    .replace(/\s+(dash|hyphen|minus)\s+/gi, "-")
    // Strip trailing punctuation Whisper likes to add
    .replace(/[\s.,!?;:]+$/g, "");
  // Spelled-out TLDs: "c o m" / "c.o.m" / "n e t" / "o r g" → joined.
  out = out.replace(/\bc\s*\.?\s*o\s*\.?\s*m\b/gi, "com");
  out = out.replace(/\bn\s*\.?\s*e\s*\.?\s*t\b/gi, "net");
  out = out.replace(/\bo\s*\.?\s*r\s*\.?\s*g\b/gi, "org");
  // Provider names whisper sometimes splits in two ("proton mail", "g mail",
  // "i cloud", "out look", "hot mail"). Collapse before the .com glue below.
  out = out.replace(/\bg\s*\.?\s*mail\b/gi, "gmail");
  out = out.replace(/\bproton\s*mail\b/gi, "protonmail");
  out = out.replace(/\bi\s*cloud\b/gi, "icloud");
  out = out.replace(/\bout\s*look\b/gi, "outlook");
  out = out.replace(/\bhot\s*mail\b/gi, "hotmail");
  // Provider + ".com" join.
  out = out.replace(/\bgmail\s*\.\s*com\b/gi, "gmail.com");
  out = out.replace(/\byahoo\s*\.\s*com\b/gi, "yahoo.com");
  out = out.replace(/\bhotmail\s*\.\s*com\b/gi, "hotmail.com");
  out = out.replace(/\boutlook\s*\.\s*com\b/gi, "outlook.com");
  out = out.replace(/\bicloud\s*\.\s*com\b/gi, "icloud.com");
  out = out.replace(/\bprotonmail\s*\.\s*com\b/gi, "protonmail.com");
  return out;
}

// Pull the FIRST plausible email out of a free-text utterance, after
// normalizing spoken forms. Returns the lowercased email or null.
function extractEmailFromText(text: string): string | null {
  const norm = normalizeSpokenEmail(text);
  const m = norm.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  if (!m) return null;
  const candidate = m[0].toLowerCase().replace(/[.,;:!?]+$/, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate) ? candidate : null;
}

// Pull a plausible name out of a free-text utterance. The hard part isn't
// the prefix ("my name is …") — it's the TAIL when the user fuses both
// pieces of intake into one breath. Real-world variants we have to survive:
//   "My name is Alex Duong. My email is alex@x.com"
//   "I'm Sarah Johnson — reach me at sarah@x.com"
//   "Call me John, john@x.com"
//   "John Smith (john@x.com)"
//   "Hi, I'm María José Pérez-Smith, you can email me at mj@x.com"
//   "alex at gmail dot com"            (spoken-form, no name)
//   "alex@gmail.com"                   (just the email)
// Strategy: when we already know the email, anchor the cut on the email's
// position and walk backward through the nearest clause separator + any
// "reach me / drop me a line / email me at" lead-in. This is robust to
// any phrasing because we never have to enumerate the lead-in words to
// FIND the boundary — we only have to peel them off once we're past it.
// Voice transcripts are full of slang openers ("yo", "ayy", "sup", "uhh",
// "like", "basically") that the user doesn't think of as part of their
// answer. Strip them iteratively before running the name-claim parser so
// "Yo, my name's Alex" → "my name's Alex" → "Alex" works in one pass,
// and so does the harder stack like "Uh, well, so basically I'm John".
const CASUAL_FILLER_RE = /^(?:(?:yo|ayy|sup|wassup|hey|hi|hello|howdy|aloha|greetings|good\s+(?:morning|afternoon|evening|day)|um+|uh+|er+|ah+|like|y'?know|you\s+know|basically|honestly|literally|so|well|okay|ok|alright|alrighty|listen|look|yeah|right|cool|dope|bet|aight|lemme\s+tell\s+(?:ya|you)|let\s+me\s+tell\s+(?:ya|you))[\s,.;:!?\-]+)+/i;
function stripCasualPrefixes(s: string): string {
  let prev = '';
  let curr = s.trim();
  // Iterate so stacked fillers ("uh, well, so I'm…") all peel off.
  while (prev !== curr) {
    prev = curr;
    curr = curr.replace(CASUAL_FILLER_RE, '').trim();
  }
  return curr;
}

// Note: "that's" deliberately NOT included — "that's crazy" / "that's wild"
// would otherwise be parsed as name "Crazy" / "Wild". "It's <name>" is
// kept because it's a common self-intro form.
const NAME_PREFIX_RE = /^(my\s+name\s+is|my\s+name'?s|i'?m|i\s+am|i'?ma|ima|call\s+me|you\s+can\s+call\s+me|ya\s+can\s+call\s+me|they\s+call\s+me|folks\s+call\s+me|everyone\s+calls\s+me|peeps\s+call\s+me|it'?s|the\s+name\s+is|the\s+name'?s|name\s+is|name'?s|this\s+is|lemme\s+introduce\s+myself[,\s]+i'?m|let\s+me\s+introduce\s+myself[,\s]+i'?m|allow\s+me\s+to\s+introduce\s+myself[,\s]+i'?m)[\s,]+/i;
// Allow optional "my " before the noun so combined utterances WITHOUT a
// clause separator ("my name is alex duong my email is alex@x.com") still
// fall through cleanly — the clause-boundary cut can't help when there
// isn't one.
const EMAIL_LEADIN_TAIL_RE = /\s*(and\s+)?(you\s+can\s+|please\s+|feel\s+free\s+to\s+)?(my\s+)?(send|drop|write|shoot|reach|contact|hit|ping|email|e[\s-]?mail|message|text)\s+(me\s+)?(an?\s+|the\s+)?(e[\s-]?mail|line|message|note|address)?.*$/i;
const CLAUSE_BOUNDARY_RE = /[.,;:!?\-—–()\[\]]\s*[^.,;:!?\-—–()\[\]]*$/;

// All emails (deduped, in order) found in an utterance. Used by the
// crosstalk detector to flag transcripts that captured two different
// people answering at once ("my email is alice@a.com" "no it's bob@b.com").
function extractAllEmailsFromText(text: string): string[] {
  const norm = normalizeSpokenEmail(text);
  const out: string[] = [];
  const re = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  for (const m of norm.matchAll(re)) {
    const c = m[0].toLowerCase().replace(/[.,;:!?]+$/, "");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

// Heuristic: did the mic pick up more than one person answering at the
// same time? We're conservative — false positives waste a re-prompt, but
// false negatives let Pablo silently lock in the wrong identity.
//   - Two distinct emails → almost certainly crosstalk.
//   - Two "my name is" claims → almost certainly crosstalk.
//   - Long transcript with corrective markers from a third party
//     ("no, his name is", "she said", "I said") → likely crosstalk.
// We deliberately do NOT count bare "i'm" / "i am" — those are too
// common in ordinary monologue and produce constant false positives.
const NAME_CLAIM_GLOBAL_RE = /\bmy\s+name\s+is\b/gi;
// Tightened (architect-flagged): "i said" + "hold on" both occur in
// normal monologue ("hold on, my name is Sarah") and were producing
// false-positive re-prompts. Keep only markers that strongly imply a
// third-party voice or self-correction about identity.
// HIGH-CONFIDENCE markers fire regardless of utterance length — these
// phrases are vanishingly rare in benign intake replies. LOWER-CONFIDENCE
// markers are gated by the length threshold below.
const CROSSTALK_HIGH_CONF_RE = /\b(no[,\s]+(his|her|their|the)\s+name\s+is|that'?s\s+not\s+my\s+(name|email)|wait[,\s]+(no|that'?s\s+not))\b/i;
const CROSSTALK_CORRECTION_RE = /\b(she\s+said\s+(her|his|their)|he\s+said\s+(her|his|their)|they\s+said\s+(her|his|their|my))\b/i;
function detectCrosstalk(text: string): { reason: 'multiple_emails'; emails: string[] } | { reason: 'multiple_name_claims' } | { reason: 'correction_chatter' } | null {
  const emails = extractAllEmailsFromText(text);
  if (emails.length >= 2) return { reason: 'multiple_emails', emails };
  const claims = (text.match(NAME_CLAIM_GLOBAL_RE) || []).length;
  if (claims >= 2) return { reason: 'multiple_name_claims' };
  // High-confidence marker fires regardless of length.
  if (CROSSTALK_HIGH_CONF_RE.test(text)) return { reason: 'correction_chatter' };
  // Lower-confidence markers gated by length to avoid eating short
  // benign replies that happen to contain a near-collision phrase.
  if (text.length > 60 && CROSSTALK_CORRECTION_RE.test(text)) return { reason: 'correction_chatter' };
  return null;
}

function extractNameFromText(text: string, knownEmail?: string | null): string {
  // Peel off greeting/filler particles before we look at the prefix.
  let t = stripCasualPrefixes(text);

  if (knownEmail) {
    // Find the email in the normalized text (handles spoken forms like
    // "alex at gmail dot com" → "alex@gmail.com").
    const norm = normalizeSpokenEmail(t);
    const idx = norm.toLowerCase().indexOf(knownEmail.toLowerCase());
    if (idx >= 0) {
      const lead = norm.slice(0, idx);
      // Cut at the last clause/sentence boundary before the email so the
      // email and any of its lead-in chatter ("reach me at", "drop me a
      // line:", "(email:") all fall away with one anchor.
      const m = lead.match(CLAUSE_BOUNDARY_RE);
      const head = m && typeof m.index === 'number' ? lead.slice(0, m.index) : lead;
      // Strip any "...email me at" / "...you can write me at" verb-phrase
      // residue that survived the boundary cut.
      t = head.replace(EMAIL_LEADIN_TAIL_RE, '').trim();
      // Reversed-order utterance ("my email is bob@x.com and my name is
      // Bob"): the BEFORE-the-email part scrubbed to nothing. Look AFTER
      // the email for a name claim and use that instead.
      if (!t || t.length < 2) {
        const tail = norm.slice(idx + knownEmail.length);
        // Strip a leading conjunction so NAME_PREFIX_RE can anchor.
        const cleaned = tail
          .replace(/^[\s.,;:!?\-—–()\[\]]+/, '')
          .replace(/^(and\s+|,\s*)?/i, '');
        // Architect-flagged: ONLY accept post-email tail if it starts
        // with an explicit name-claim ("my name is …", "I'm …", "call
        // me …"). Otherwise the leftover is just chatter ("is my email,
        // see ya") and we'd silently store it as the user's name.
        if (NAME_PREFIX_RE.test(cleaned)) {
          const after = cleaned
            .replace(NAME_PREFIX_RE, '')
            .replace(/[.!?,;:]+$/g, '')
            .trim();
          if (after) t = after;
        }
      }
    } else {
      // Couldn't anchor on the email itself — fall back to the simpler
      // "first whitespace+at|@" cut.
      t = t.replace(/\s+(at|@).*$/i, '').trim();
    }
  }

  // Drop a leading claim prefix ("my name is X" → "X").
  t = t.replace(NAME_PREFIX_RE, '');
  // Strip trailing punctuation Whisper / users like to add.
  t = t.replace(/[.!?,;:]+$/g, '').trim();
  // 64-char cap leaves room for hyphenated double-barreled names without
  // truncating realistic identities. (Old 32 cap is what stored "Alex
  // Duong. My email is Alejandr" as the user's name in production.)
  return t.slice(0, 64);
}

// Detect explicit "switch the modality" requests during normal conversation.
// Voice is the default — only flip when the user clearly asks.
function detectModeSwitch(text: string): "text" | "voice" | null {
  const t = text.toLowerCase().trim();
  // Going to text
  if (/\b(let'?s|let us|switch to|go to|use|change to|make it|prefer)\s+(text|typing|type|keyboard|chat|writing)\b/.test(t)) return "text";
  if (/^(text mode|type mode|keyboard mode|switch to text|go to text|use text|let'?s text|i'?ll type|let me type|i want to type)\b/.test(t)) return "text";
  // Going back to voice
  if (/\b(let'?s|let us|switch to|go to|use|change to|back to)\s+(voice|talking|speaking|talk|speak)\b/.test(t)) return "voice";
  if (/^(voice mode|speak mode|switch to voice|go to voice|use voice|let'?s talk|let me talk|i want to talk|talk to me)\b/.test(t)) return "voice";
  return null;
}

type Status = "idle" | "listening" | "thinking" | "speaking";

const STATUS_LABEL: Record<Status, string> = {
  idle: "TAP TO SPEAK",
  listening: "LISTENING…",
  thinking: "THINKING…",
  speaking: "SPEAKING",
};

const STATUS_COLOR: Record<Status, string> = {
  idle: "rgb(125, 211, 252)",
  listening: "rgb(74, 222, 128)",
  thinking: "rgb(250, 204, 21)",
  speaking: "rgb(244, 114, 182)",
};

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const mt of candidates) {
    try { if (MediaRecorder.isTypeSupported(mt)) return mt; } catch {}
  }
  return "";
}

// The transcription endpoint expects { audio: base64, mimeType } as JSON —
// not FormData. Sending multipart silently 400s, which is why Pablo "can't
// hear you". Base64-encode in chunks so we don't blow the call stack on a
// 12-second clip.
async function transcribe(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
  }
  const audioB64 = btoa(bin);
  const res = await apiFetch("api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioB64, mimeType: blob.type || "audio/webm" }),
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

// Keep the nebula present but pulled back from the camera so the terminal
// controls and practical workspace remain readable around it. Resize updates
// as the user rotates / changes window size.
function useNebulaSize() {
  const compute = () => {
    if (typeof window === "undefined") return 1200;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = Math.hypot(w, h);
    // A smaller field gives the visual room around the controls and reads as
    // a zoomed-out camera instead of a full-screen wash.
    const isMobile = w < 640;
    const mult = isMobile ? 0.78 : 0.9;
    const min = isMobile ? 360 : 520;
    return Math.max(min, Math.floor(d * mult));
  };
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function Nebula({ status, size = 360 }: { status: Status; size?: number }) {
  // Detailed Jarvis-style core: rings, ticks, segmented arcs, scan line, hex core, data nodes.
  const breath =
    status === "speaking" ? 0.9 :
    status === "listening" ? 1.3 :
    status === "thinking" ? 2.0 :
    3.4;
  const ringDur =
    status === "thinking" ? 8 :
    status === "listening" ? 5 :
    status === "speaking" ? 4 :
    14;
  const color = STATUS_COLOR[status];
  const dim = `${color}aa`;
  const faint = `${color}55`;

  // SVG geometry in a 200×200 viewBox; rendered at any size.
  const cx = 100;
  const cy = 100;
  const rOuter = 96;
  const rInnerRing = 78;
  const rMidRing = 62;
  const rCore = 22;
  const tickCount = 60;
  const longTickEvery = 5;
  const segArcs = [
    { r: 88, gap: 18, from: 0, dur: ringDur, dir: 1 },
    { r: 72, gap: 28, from: 45, dur: ringDur * 0.7, dir: -1 },
    { r: 56, gap: 14, from: 90, dur: ringDur * 1.4, dir: 1 },
  ];
  const dataNodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
    return { x: cx + Math.cos(a) * 88, y: cy + Math.sin(a) * 88, delay: i * 0.18 };
  });

  // Build dashed segmented arc as stroke-dasharray
  const dashFor = (r: number, gap: number) => {
    const circ = 2 * Math.PI * r;
    const seg = circ / 8;
    return `${seg - gap} ${gap}`;
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer breathing halo (subtle, behind structure) */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: breath * 1.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 50% 50%, ${faint} 0%, transparent 65%)`,
          filter: "blur(18px)",
        }}
      />

      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <radialGradient id="pablo-core-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="40%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pablo-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="50%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="pablo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={dim} strokeWidth="0.6" opacity="0.55" />
        <circle cx={cx} cy={cy} r={rOuter - 4} fill="none" stroke={dim} strokeWidth="0.3" opacity="0.35" />

        {/* Tick marks around outer ring */}
        <g opacity="0.7">
          {Array.from({ length: tickCount }, (_, i) => {
            const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
            const long = i % longTickEvery === 0;
            const inner = long ? rOuter - 7 : rOuter - 3.5;
            const outer = rOuter;
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * inner}
                y1={cy + Math.sin(a) * inner}
                x2={cx + Math.cos(a) * outer}
                y2={cy + Math.sin(a) * outer}
                stroke={color}
                strokeOpacity={long ? 0.85 : 0.4}
                strokeWidth={long ? 0.8 : 0.4}
              />
            );
          })}
        </g>

        {/* Inner concentric rings */}
        <circle cx={cx} cy={cy} r={rInnerRing} fill="none" stroke={dim} strokeWidth="0.5" opacity="0.5" />
        <circle cx={cx} cy={cy} r={rMidRing} fill="none" stroke={dim} strokeWidth="0.4" opacity="0.4" />

        {/* Segmented rotating arcs */}
        {segArcs.map((s, i) => (
          <motion.g
            key={i}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
            animate={{ rotate: s.dir * 360 }}
            transition={{ duration: s.dur, repeat: Infinity, ease: "linear" }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={s.r}
              fill="none"
              stroke={color}
              strokeOpacity={0.85}
              strokeWidth={1.1}
              strokeDasharray={dashFor(s.r, s.gap)}
              strokeLinecap="round"
              transform={`rotate(${s.from} ${cx} ${cy})`}
              filter="url(#pablo-glow)"
            />
          </motion.g>
        ))}

        {/* Crosshair reticle */}
        <g opacity="0.45" stroke={color} strokeWidth="0.4">
          <line x1={cx - rInnerRing} y1={cy} x2={cx - rMidRing - 4} y2={cy} />
          <line x1={cx + rMidRing + 4} y1={cy} x2={cx + rInnerRing} y2={cy} />
          <line x1={cx} y1={cy - rInnerRing} x2={cx} y2={cy - rMidRing - 4} />
          <line x1={cx} y1={cy + rMidRing + 4} x2={cx} y2={cy + rInnerRing} />
        </g>

        {/* Data nodes pulsing on outer ring */}
        {dataNodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={1.6}
            fill={color}
            animate={{ opacity: [0.3, 1, 0.3], r: [1.4, 2.6, 1.4] }}
            transition={{ duration: breath * 1.3, repeat: Infinity, delay: n.delay, ease: "easeInOut" }}
            filter="url(#pablo-glow)"
          />
        ))}

        {/* Hexagonal mid frame — counter rotating */}
        <motion.g
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ rotate: -360 }}
          transition={{ duration: ringDur * 2.1, repeat: Infinity, ease: "linear" }}
        >
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
              return `${cx + Math.cos(a) * 40},${cy + Math.sin(a) * 40}`;
            }).join(" ")}
            fill="none"
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={0.6}
          />
          <polygon
            points={Array.from({ length: 6 }, (_, i) => {
              const a = (i / 6) * Math.PI * 2;
              return `${cx + Math.cos(a) * 32},${cy + Math.sin(a) * 32}`;
            }).join(" ")}
            fill="none"
            stroke={color}
            strokeOpacity={0.4}
            strokeWidth={0.5}
          />
        </motion.g>

        {/* Vertical scan line sweeping across */}
        <motion.rect
          x={cx - 1}
          y={cy - rInnerRing}
          width={2}
          height={rInnerRing * 2}
          fill="url(#pablo-scan)"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: ringDur * 0.9, repeat: Infinity, ease: "linear" }}
          opacity={0.7}
        />

        {/* Pulsing core */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={rCore}
          fill="url(#pablo-core-grad)"
          animate={{ r: [rCore * 0.92, rCore * 1.08, rCore * 0.92], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: breath, repeat: Infinity, ease: "easeInOut" }}
          filter="url(#pablo-glow)"
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={5}
          fill="#ffffff"
          animate={{ opacity: [0.85, 1, 0.85], r: [4.5, 6.2, 4.5] }}
          transition={{ duration: breath * 0.7, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

// Only fires when the user asks for a feature that requires an account
// (wantsTool match) — never as the default opener anymore.
const NAME_PROMPT_LINE = "What should I call you?";

export default function PabloTerminal() {
  // The public terminal is safe to paint while auth resolves. Waiting here
  // used to flash a black BOOTING screen before the canonical nebula, defeating
  // its role as the immediate front door. Auth-dependent actions remain gated
  // by PabloTerminalAuthed's own isLoading checks.
  return <PabloTerminalAuthed />;
}

function PabloTerminalAuthed() {
  const [, navigate] = useLocation();
  const { logout, isAuthenticated, user, isLoading } = useAuth();
  // The front door uses one verified platform-auth flow. Provider-specific
  // buttons stay out of onboarding until their production callbacks are proven.
  const [authChoice, setAuthChoice] = useState<{ dest: string; hint: string | null } | null>(null);
  const nebulaSize = useNebulaSize();
  // GFX quality toggle — exposed in the top-right of the terminal so
  // visitors on slow phones / integrated GPUs can drop the WebGL nebula
  // for the static 2D fallback during onboarding without digging into
  // settings (the same toggle also lives in Profile for authed users).
  // Boomer mode reskins the whole terminal into a simplified late-70s
  // high-contrast, spacious interface with accessibility-friendly sizing.
  // glass). Defaults ON for everyone, so this is the common look.
  const [boomerMode] = useBoomerMode();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  // Default to TEXT on EVERY device. The nebula opens quiet — Pablo waits
  // for the user to type. Voice-first auto-listen on open used to arm the
  // mic the instant the screen loaded, which on a browser without a real
  // mic just threw "Microphone access required." and, combined with the
  // greeting/caption re-pin cycle, made Pablo seem to re-introduce himself
  // in a loop. Text-first removes that entirely; the user can flip to
  // voice anytime with the pablo-mode-toggle button.
  const [mode, setMode] = useState<Mode>("text");
  const [textInput, setTextInput] = useState("");
  // Cached server-authoritative assistant persona, so the terminal paints the
  // right identity (Pablo vs Mila) on the first frame before the fetch resolves.
  const PERSONA_CACHE_KEY = "salaryman.persona";
  // (Removed Simon-says puzzle and its state. The puzzle was a guard that
  // ran post-passcode; with the passcode gone, the user goes directly
  // from the intro question to the inline employment / name / email
  // intake. Deeper biz registration (company name, industry, type) is
  // captured by the post-OAuth PabloOnboarding modal in WorldPlay.)
  // Idle dialogue, two-stage:
  //   1. ONE greeting per session, picked from IDLE_LINES. No looping. Stored
  //      in sessionStorage so navigating around doesn't re-greet.
  //   2. After the greeting, Pablo slow-drips AI-generated world lore. First
  //      drip ~5 min in; each subsequent drip waits DOUBLE the previous gap
  //      (5 → 10 → 20 → 40…). Each drip carries two cheeky clickable reply
  //      tokens — when tapped, they're sent to Pablo as a normal message.
  const SESSION_GREETED_KEY = "pablo.greeted_v2";
  const [idleLine, setIdleLine] = useState<string>(() => {
    if (typeof window === "undefined" || !isTutorialDone()) return "";
    try {
      if (window.sessionStorage.getItem(SESSION_GREETED_KEY)) return ""; // greeted earlier this session
      window.sessionStorage.setItem(SESSION_GREETED_KEY, "1");
    } catch {}
    return pickIdleLine();
  });
  const [idleOptions, setIdleOptions] = useState<string[]>([]);
  const idleDelayRef = useRef<number>(5 * 60_000); // 5 min, doubles each fire
  const idleTimerRef = useRef<number | null>(null);

  const fetchLoreDrip = useCallback(async () => {
    try {
      const r = await apiFetch("/api/chat/pablo/lore", { method: "POST", body: JSON.stringify({}) });
      if (!r.ok) return;
      const data = await r.json() as { line?: string; options?: string[] };
      if (data?.line) {
        setIdleLine(data.line);
        setIdleOptions(Array.isArray(data.options) ? data.options.slice(0, 2) : []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isTutorialDone()) return;
    // Schedule the first lore drip 5 min after mount; each subsequent
    // drip doubles the wait so an idle tab gets quieter the longer it sits.
    const scheduleNext = () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(async () => {
        await fetchLoreDrip();
        idleDelayRef.current = Math.min(idleDelayRef.current * 2, 24 * 60 * 60_000); // cap at 24h
        scheduleNext();
      }, idleDelayRef.current) as unknown as number;
    };
    scheduleNext();
    return () => { if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current); };
  }, [fetchLoreDrip]);
  // Audio unlocks itself the moment the user touches anything (handled by
  // the global armAudioAutoUnlock listener wired in App.tsx). Pablo's voice
  // is on by default and stays on; no manual unlock affordance needed.
  // When the user asks Pablo
  // to take them somewhere — "open my dashboard", "go to studio", "find me X"
  // — we don't navigate immediately. Auth-gated pages would either crash on
  // missing user data or redirect through the login flow with no context,
  // showing a black screen on the way. Instead we stash the requested
  // destination here and run the user through passcode → name → email →
  // OAuth. The email step then hands `pendingDestinationRef.current` to the
  // login redirect as `returnTo`, so they land exactly where they asked.
  //
  // Also seed from the ?returnTo= URL param on mount: when an expired session
  // redirects a returning user to /pablo?returnTo=/dashboard, beginIntake()
  // can read a non-null pendingDestination and hand them straight to the
  // auth-choice modal without re-asking for name/email they already gave.
  const pendingDestinationRef = useRef<string | null>(
    sanitizeReturnPath(
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("returnTo")
        : null,
    ),
  );
  // Post-passcode interview state. Pablo asks the user a few salaryman
  // questions inline (no /landing detour), then collects an email and hands
  // them off to OAuth. The remaining race/gender/biz/etc. onboarding lives
  // in WorldPlay's PabloOnboarding modal, which auto-opens on first enter.
  // Phases:
  //   idle         — Pablo isn't currently waiting on the door. Default.
  //   chatting     — Pre-onboarding free conversation. Pablo answers
  //                  anything via the public LLM endpoint until the
  //                  visitor signals readiness OR volunteers a name.
  //                  This is where new visitors land after the intro
  //                  monologue. Internal name only — never shown to user.
  //   asking-name  — We've committed to collecting their name next.
  //   asking-email — Name captured; collecting email before OAuth.
  const interviewPhaseRef = useRef<'idle' | 'chatting' | 'asking-name' | 'asking-email'>('idle');
  const [, setInterviewTick] = useState(0);
  const bumpInterview = useCallback(() => setInterviewTick((n) => n + 1), []);
  // Reset the interview phase if PabloTerminal is unmounted mid-interview
  // (browser back, route change, hard refresh). Without this, a remount can
  // believe it's mid-question and ignore the next utterance. This is the
  // explicit recovery path called out in code review.
  useEffect(() => () => { interviewPhaseRef.current = 'idle'; }, []);
  const autoListenRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const ttsRef = useRef<{ cancel: () => void } | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => { cleanup(); ttsRef.current?.cancel(); }, [cleanup]);

  // ── Email gate shared by beginIntake + sendToPablo ───────────────────────
  // Calls /api/chat/pablo/screen-email before opening the auth modal.
  // Returns true (cleared) or false (blocked — Pablo already deflected in
  // character and the phase has been reset to asking-email so the user can
  // try a different address). Never throws; network failure → fail open so a
  // server hiccup never locks out a real human.
  // Stable ref so beginIntake (a separate useCallback) can reach it without
  // it appearing in the deps array.
  const screenEmailBeforeAdmitRef = useRef<(email: string) => Promise<boolean>>(async () => true);
  useEffect(() => {
    screenEmailBeforeAdmitRef.current = async (email: string): Promise<boolean> => {
      try {
        const res = await apiFetch("api/chat/pablo/screen-email", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        if (!res.ok) return true;
        const data = await res.json() as { pass: boolean; pabloLine?: string };
        if (!data.pass) {
          const line = data.pabloLine ?? "The Bureau is reviewing your file. Check back later.";
          localStorage.removeItem("salaryman_email");
          interviewPhaseRef.current = 'asking-email';
          bumpInterview();
          setReply(line);
          setStatus("speaking");
          ttsRef.current?.cancel();
          await new Promise<void>((resolve) => {
            const done = () => { ttsRef.current = null; resolve(); };
            ttsRef.current = speakWithTTS(line, done, done, PABLO_TTS_OPTIONS);
          });
          const followUp = "If you have another address, let's hear it.";
          setReply(followUp);
          setStatus("speaking");
          await new Promise<void>((resolve) => {
            const done = () => { ttsRef.current = null; setStatus("idle"); resolve(); };
            ttsRef.current = speakWithTTS(followUp, done, done, PABLO_TTS_OPTIONS);
          });
          return false;
        }
        return true;
      } catch {
        return true;
      }
    };
  });

  // Camera/file/URL-vision UI is available only after authentication and the
  // immigration desk has completed.
  const hasFinishedOnboarding = isAuthenticated && isTutorialDone();
  const enterFromHomepage = useCallback(() => {
    navigate("/console");
  }, [navigate]);
  const startWorkFromHomepage = useCallback(() => {
    if (isAuthenticated) {
      enterFromHomepage();
      return;
    }
    navigate(`/sign-in?returnTo=${encodeURIComponent("/console")}`);
  }, [enterFromHomepage, isAuthenticated, navigate]);

  // Keep the existing global audio unlock path alive for reply speech and
  // explicit voice input. There is no automatic greeting to start here.
  useEffect(() => {
    armAudioAutoUnlock();
    void unlockAudio();
  }, []);

  const speakLine = useCallback((text: string, after?: () => void) => {
    setStatus("speaking");
    setReply(text);
    ttsRef.current?.cancel();
    const done = () => {
      ttsRef.current = null;
      setStatus("idle");
      after?.();
    };
    ttsRef.current = speakWithTTS(text, done, done, PABLO_TTS_OPTIONS);
  }, []);

  // Start the pre-auth intake when the visitor chooses to enter. The remaining
  // race/gender/biz/appearance/location onboarding lives in Immigration and
  // WorldPlay after auth returns.
  const askEmailNow = useCallback(() => {
    interviewPhaseRef.current = 'asking-email';
    bumpInterview();
    const known = formatSpeechName(getSalarymanName() ?? 'friend');
    const line = `Nice to meet you, ${known}. What's a good email for your account?`;
    setReply(line);
    setStatus("speaking");
    // Force text mode for the email step — voice STT mangles "@" and dots.
    // We flip mode directly instead of going through chooseTextMode() to
    // avoid a forward declaration ordering issue inside the callback.
    setMode('text');
    autoListenRef.current = false;
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(line, () => { ttsRef.current = null; setStatus("idle"); }, () => { ttsRef.current = null; setStatus("idle"); }, PABLO_TTS_OPTIONS);
  }, [bumpInterview]);

  // Start the inline intake. The first message itself is preserved and
  // continues through the normal chatting/readiness/name/email pipeline.
  // Returns true when a cached identity requires a prompt or auth handoff;
  // returns false when the caller should process the current message.
  const beginIntake = useCallback((): boolean => {
    if (interviewPhaseRef.current !== 'idle') return false;

    // Returning visitor: name and/or email are already in localStorage
    // from a previous run. Re-asking them is the loop the user reported
    // ("can't get past Pablo nebula thru voice or text"). Skip directly
    // to the next missing field — and if BOTH are filled, hand straight
    // off to OAuth instead of asking anything. This is also the right
    // path for an authenticated user who somehow re-landed here without
    // hitting the IMMIGRATION HAND-OFF GUARD (it only fires once auth
    // resolves; this protects the in-flight render).
    const cachedName = (getSalarymanName() ?? '').trim();
    const cachedEmail = (getSalarymanEmail() ?? '').trim();
    const haveName = cachedName.length >= 2;
    const haveEmail = isLikelyEmail(cachedEmail);

    if (haveName && haveEmail) {
      // Returning visitor with cached identity. We used to auto-redirect
      // them straight to OAuth, but that violates "don't push login on
      // people who just want to chat." Now: only auto-OAuth when there's
      // an explicit pendingDestination (they were trying to reach a
      // gated feature when intercepted). Otherwise just greet them and
      // drop into the same free CHATTING phase a brand-new visitor gets.
      const hasPendingFeature = !!sanitizeReturnPath(pendingDestinationRef.current);
      if (!isAuthenticated && hasPendingFeature) {
        interviewPhaseRef.current = 'idle';
        bumpInterview();
        const ack = `Welcome back, ${formatSpeechName(cachedName)}. Signing you in.`;
        setReply(ack);
        setStatus("speaking");
        ttsRef.current?.cancel();
        // After the greeting, screen the cached email before opening OAuth.
        let fired = false;
        const openModal = () => {
          if (fired) return;
          fired = true;
          ttsRef.current = null;
          const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/tower';
          pendingDestinationRef.current = null;
          screenEmailBeforeAdmitRef.current(cachedEmail).then((ok) => {
            if (ok) setAuthChoice({ dest, hint: cachedEmail });
          });
        };
        ttsRef.current = speakWithTTS(ack, openModal, openModal, PABLO_TTS_OPTIONS);
        // Hard timeout in case TTS stalls.
        window.setTimeout(openModal, 1800);
        return true;
      }
      // No pending feature — let them chat freely. The current message is
      // preserved and processed by the chatting branch below.
      interviewPhaseRef.current = 'chatting';
      bumpInterview();
      return false;
    }

    // Brand-new visitors enter free chatting. Visitors with a cached name but
    // no email resume at the email step.
    if (!haveName) {
      interviewPhaseRef.current = 'chatting';
    } else {
      setSalarymanName(cachedName); // re-affirm in case storage was thrashed
      interviewPhaseRef.current = 'asking-email';
    }
    bumpInterview();

    return false;
  }, [bumpInterview, isAuthenticated]);

  // A deep link from a gated destination still resumes authentication
  // immediately when this browser already has a complete cached identity.
  // Ordinary visits never trigger an automatic greeting or storyteller.
  useEffect(() => {
    if (!pendingDestinationRef.current) return;
    beginIntake();
  }, [beginIntake]);

  const chooseTextMode = useCallback(() => {
    setMode("text");
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    setReply("Text mode on. Type what you need.");
  }, [cleanup]);

  // Active assistant identity. Pre-story this is ALWAYS "pablo" (his orb + his
  // voice, completely untouched). Once a player's story is live the server flips
  // the answer to Mila and we mirror it here, which drives her distinct nebula
  // and ElevenLabs voice. We never alter Pablo's look/voice.
  //
  // First-frame identity comes from a localStorage cache so a returning story
  // player paints as Mila on the very first frame (no Pablo flash). The cache is
  // ACCOUNT-TAGGED ({ uid, persona }) so a different account on the same browser
  // can never inherit a stale Mila: the sync effect below drops a cache whose uid
  // doesn't match the resolved user (and clears it for guests), and the server
  // persona fetch is always the final authority. A normal pre-story player never
  // has a "mila" cache written for them, so Pablo's path is fully untouched.
  type PersonaName = "pablo" | "mila";
  const readCachedPersona = (): PersonaName => {
    try {
      const raw = localStorage.getItem(PERSONA_CACHE_KEY);
      if (!raw) return "pablo";
      if (raw === "mila") return "mila"; // back-compat: legacy bare-string cache
      if (raw === "pablo") return "pablo";
      const parsed = JSON.parse(raw) as { persona?: PersonaName };
      return parsed?.persona === "mila" ? "mila" : "pablo";
    } catch { return "pablo"; }
  };
  const readCachedPersonaUid = (): string | null => {
    try {
      const raw = localStorage.getItem(PERSONA_CACHE_KEY);
      if (!raw || raw === "mila" || raw === "pablo") return null;
      const parsed = JSON.parse(raw) as { uid?: string | null };
      return parsed?.uid ?? null;
    } catch { return null; }
  };
  const writeCachedPersona = (who: PersonaName, uid: string | null) => {
    try { localStorage.setItem(PERSONA_CACHE_KEY, JSON.stringify({ uid: uid ?? null, persona: who })); } catch { /* ignore */ }
  };
  const clearCachedPersona = () => {
    try { localStorage.removeItem(PERSONA_CACHE_KEY); } catch { /* ignore */ }
  };
  const [persona, setPersona] = useState<PersonaName>(readCachedPersona);
  const personaRef = useRef<PersonaName>(persona);
  useEffect(() => { personaRef.current = persona; }, [persona]);

  // Resolve WHO is answering (server-authoritative, cookie-scoped). Only mirrors
  // the value into state; the sync effect below owns all cache writes.
  const resolvePersona = useCallback(() => {
    apiFetch("api/chat/pablo/persona")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { persona?: PersonaName } | null) => {
        const who = d?.persona === "mila" ? "mila" : "pablo";
        setPersona(who);
        personaRef.current = who;
      })
      .catch(() => { /* leave cached/default persona on failure */ });
  }, []);

  useEffect(() => { resolvePersona(); }, [resolvePersona]);

  // Cache ownership + cross-account safety. Once auth resolves we make the
  // persona cache account-correct so the next first paint can't inherit another
  // user's identity:
  //   - guest  → never trust a non-pablo cache; force Pablo and clear it.
  //   - cache owned by a DIFFERENT uid → drop it (server fetch repaints) and fall
  //     back to Pablo until it does, so a pre-story account never shows Mila.
  //   - same account (or an owner-unknown handoff seed) → (re)tag the cache with
  //     the current uid so it's validated on the next load.
  useEffect(() => {
    if (isLoading) return;
    const currentUid = user?.id ?? null;
    if (!currentUid) {
      if (personaRef.current !== "pablo") { setPersona("pablo"); personaRef.current = "pablo"; }
      clearCachedPersona();
      return;
    }
    const cachedUid = readCachedPersonaUid();
    if (cachedUid && cachedUid !== currentUid) {
      // Cache belongs to a different account on this browser. Drop it, fall back
      // to Pablo, and re-resolve THIS user's authoritative persona immediately so
      // a story-player switching accounts isn't stranded on Pablo (the persona
      // fetch may have already resolved against the wrong cache/order).
      clearCachedPersona();
      if (personaRef.current !== "pablo") { setPersona("pablo"); personaRef.current = "pablo"; }
      resolvePersona();
      return;
    }
    writeCachedPersona(personaRef.current, currentUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, persona, resolvePersona]);

  // Display name + accent for whoever is currently answering. Pablo keeps his
  // pink theme untouched; Mila gets her cooler aqua/teal identity.
  const personaLabel = persona === "mila" ? "MILA" : "PABLO";

  const speak = useCallback((text: string, character?: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    // Explicit character wins (e.g. a Pablo intrusion during Mila mode);
    // otherwise always select the active assistant explicitly so Pablo cannot
    // be recast by the generic ELEVENLABS_VOICE_ID setting.
    const voice = character ?? (personaRef.current === "mila" ? "MILA" : "PABLO");
    const done = () => { ttsRef.current = null; resolve(); };
    ttsRef.current = speakWithTTS(text, done, done, voice ? { character: voice } : undefined);
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    // Returning visitor whose name + email are already on file: ANY
    // admittance intent ("let me in", "show you my papers", "open my
    // dashboard") should hand them STRAIGHT to the sign-in choice — we
    // already have their paperwork, so re-asking name/email is the
    // "stuck at the door" loop this flow is meant to kill. Returns true
    // when it admitted (caller should bail), false when there's no
    // cached identity to admit on. Single-shot redirect: the TTS
    // callback OR the 2.2s fallback fires goLogin exactly once.
    // screenEmailBeforeAdmit is available as screenEmailBeforeAdmitRef.current
    // (defined once above beginIntake so both callbacks share the same logic).

    const admitIfKnown = (closingLine: string): boolean => {
      if (isAuthenticated) return false;
      const cachedName = (getSalarymanName() ?? '').trim();
      const cachedEmail = (getSalarymanEmail() ?? '').trim();
      if (cachedName.length < 2 || !isLikelyEmail(cachedEmail)) return false;
      interviewPhaseRef.current = 'idle';
      bumpInterview();
      // Screen the cached email before committing to OAuth. The closing line
      // may keep speaking, but opening the modal never depends on TTS ending.
      setReply(closingLine);
      setStatus('speaking');
      ttsRef.current?.cancel();
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/tower';
      pendingDestinationRef.current = null;
      ttsRef.current = speakWithTTS(
        closingLine,
        () => { ttsRef.current = null; setStatus("idle"); },
        () => { ttsRef.current = null; setStatus("idle"); },
        PABLO_TTS_OPTIONS,
      );
      void screenEmailBeforeAdmitRef.current(cachedEmail).then((ok) => {
        if (ok) setAuthChoice({ dest, hint: cachedEmail });
      });
      return true;
    };

    // Returning user shortcut: if they say "sign me in" / "log me in" /
    // "I have an account", skip the entire new-user sequence (passcode →
    // puzzle → name → email) and hand them straight to OAuth. The auth
    // provider handles both sign-in and sign-up; if they're returning,
    // they bounce straight through, and if they're new the world's
    // PabloOnboarding modal picks up the rest of the intake. We check
    // this BEFORE the passcode/interview-phase branches so it works at
    // every step of the intro, and BEFORE hitting the LLM so it never
    // gets a chance to invent a /sign-in navigate that would loop
    // through our new pre-onboarding gate.
    if (!isAuthenticated && detectSignInIntent(text)) {
      ttsRef.current?.cancel();
      ttsRef.current = null;
      // Honor a destination they asked Pablo for earlier in the same
      // session — otherwise default to the open Tower lobby. We deliberately
      // do NOT default to /world/play here: non-owner accounts can't pass
      // the city lock and would bounce back into the loop. Pass through
      // the sanitizer so a tampered or LLM-malformed pendingDestination
      // can never poison the OAuth returnTo.
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/tower';
      pendingDestinationRef.current = null;
      // Pre-fill the OAuth login_hint with their cached email when we
      // have one on file — returning players shouldn't retype it.
      const cachedEmail = (getSalarymanEmail() ?? '').trim();
      const hint = isLikelyEmail(cachedEmail) ? cachedEmail : null;
      const ack = "This way. Hold tight.";
      setReply(ack);
      setStatus("speaking");
      setAuthChoice({ dest, hint });
      ttsRef.current = speakWithTTS(
        ack,
        () => { ttsRef.current = null; setStatus("idle"); },
        () => { ttsRef.current = null; setStatus("idle"); },
        PABLO_TTS_OPTIONS,
      );
      return;
    }

    // A logged-out visitor's first normal message enters the existing
    // conversational intake pipeline. Preserve that message: brand-new visitors
    // continue into free chat/readiness detection, while cached partial identity
    // states resume at the missing field.
    if (!isAuthenticated && interviewPhaseRef.current === 'idle') {
      const handled = beginIntake();
      if (handled) return;
    }

    // CHATTING PHASE — pre-onboarding free conversation. Pablo answers
    // anything via the public LLM endpoint (no auth required) until the
    // visitor either (a) volunteers their name/email, or (b) signals
    // they're ready to come in. The user explicitly asked for Pablo to
    // be able to act as an encyclopedia for the world before any
    // identity collection happens.
    // The signup funnel (crosstalk → cost-curious → readiness → wants-tool →
    // identity volunteer → public LLM) is ONLY for the logged-out Pablo nebula
    // intro — first-time AND returning visitors who haven't signed in yet.
    // An ALREADY-SIGNED-IN user has nothing to sign up for, so we never pivot
    // them into intake; they stay in the public terminal until they explicitly
    // choose to enter the Tower.
    if (interviewPhaseRef.current === 'chatting' && !isAuthenticated) {
      // Crosstalk in the chat phase: try to ENGAGE the interested party
      // instead of just shutting down. Pablo's job here is to identify
      // who actually wants in, not to refuse the room.
      const crossChat = detectCrosstalk(text);
      if (crossChat) {
        const line = crossChat.reason === 'multiple_emails'
          ? "Two emails came through. Whoever's the one signing in — just say your name. The rest of you, hold the line."
          : "Sounded like more than one of you. Whoever wants in — speak up alone. What's your name?";
        await speak(line);
        return;
      }
      // Order matters: check the readiness signal BEFORE the identity
      // volunteer. Phrases like "I'm ready" / "I'm in" / "let me in"
      // ALSO match NAME_PREFIX_RE (anchoring on "I'm"), so without
      // this ordering they'd be misread as the user volunteering the
      // name "ready" / "in" — which would slip past the asking-name
      // handler's prefix-garbage guard and get stored as the user's
      // identity. Readiness wins.
      // Cost/"is it free" question — a buying signal. Reassure that the
      // door's free (advantage is what costs) and pivot straight to intake,
      // rather than letting the free-chat LLM answer and risk losing them.
      if (isCostCurious(text)) {
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        const line = "Walking in is free — only advantage costs. Let's get you set up. What should I call you?";
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: line }]);
        await speak(line);
        return;
      }
      if (isReadyToEnter(text) || isShowPapers(text)) {
        // Admittance intent: "let me in" / "I'm ready" / "sign up" or the
        // immigration "here are my papers" framing. A returning visitor we
        // already have on file goes STRAIGHT to the sign-in choice; a brand
        // new one pivots to asking-name with the sharper prompt.
        const known = getSalarymanName();
        const spokenKnown = known ? formatSpeechName(known) : null;
        if (admitIfKnown(spokenKnown ? `Cleared, ${spokenKnown}. Heading in.` : "Cleared. Heading in.")) return;
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: NAME_PROMPT_LINE }]);
        await speak(NAME_PROMPT_LINE);
        return;
      }
      // Visitor asked for an action that requires being inside (make
      // a call, see dashboard, hire a bot, etc.). Pivot to asking-name
      // and tell them why — we're not refusing, we're clearing them
      // in for the thing they just asked for. This is the "when the
      // user requires more context tools etc., go through the intro"
      // path the spec calls for.
      if (wantsTool(text)) {
        // Returning visitor we already have on file — admit them straight
        // away rather than re-asking for an account they already created.
        const known = getSalarymanName();
        const spokenKnown = known ? formatSpeechName(known) : null;
        if (admitIfKnown(spokenKnown ? `On it, ${spokenKnown}. Heading in.` : "On it. Heading in.")) return;
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        const line = "For that I'll need to set you up with an account — what should I call you?";
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: line }]);
        await speak(line);
        return;
      }
      // Identity volunteer detection. We ONLY treat an utterance as a
      // name/email handoff when there's a strong signal — either an
      // explicit name-claim prefix ("I'm Alex", "my name is …", "call
      // me …") or a parseable email. Otherwise generic chat like
      // "what's the price?" would be misread as a name volunteer
      // (extractNameFromText returns the trimmed text by default).
      const volunteeredEmail = extractEmailFromText(text);
      const strippedForCheck = stripCasualPrefixes(text);
      const hasNameClaim = NAME_PREFIX_RE.test(strippedForCheck);

      // Architect-flagged: email-only utterances ("my email is alice@x.com",
      // "alice@x.com") must NOT fall through to the asking-name handler.
      // extractNameFromText returns the lead-in chatter ("my email is")
      // as the "name" for those, and the asking-name guard's
      // prefix-garbage regex is anchored single-word so the phrase
      // sneaks past and gets stored as the user's identity. Capture the
      // email here, transition to asking-name, and prompt explicitly.
      if (volunteeredEmail && !hasNameClaim) {
        setSalarymanEmail(volunteeredEmail);
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        const line = "Got your email. And what should I call you?";
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: line }]);
        await speak(line);
        return;
      }

      if (hasNameClaim) {
        // Explicit name claim (with or without an email). Promote to
        // asking-name and FALL THROUGH — the existing handler re-runs
        // extraction so name+email routes straight to OAuth and
        // name-only advances to asking-email.
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        // intentional fall-through into the asking-name branch
      } else {
        // Free conversation — call the PUBLIC Pablo endpoint (no auth
        // required). The endpoint is gatekeeper-personality, no tools,
        // smaller model + tighter token budget since it's anonymously
        // callable.
        setStatus("thinking");
        setReply("");
        try {
          const res = await apiFetch("api/chat/pablo/public", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript: text,
              history: history.slice(-6),
              // Hand Pablo the onboarding context — which intake phase
              // we're in, where the visitor was trying to go before
              // being routed to /pablo, and what page they're on now.
              // Lets him answer specifically ("you were headed to the
              // phone — name first") instead of a generic deflection.
              context: {
                intakePhase: interviewPhaseRef.current,
                pendingDestination: pendingDestinationRef.current,
                currentPath: typeof window !== 'undefined' ? window.location.pathname : null,
                userCity: deriveUserCityName(),
              },
            }),
          });
          if (!res.ok) throw new Error(`pablo ${res.status}`);
          const data = (await res.json()) as { say: string };
          const said = (data.say ?? "I'm here.").trim() || "I'm here.";
          setReply(said);
          setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: said }]);
          setStatus("speaking");
          ttsRef.current?.cancel();
          const done = () => { ttsRef.current = null; setStatus("idle"); if (mode === 'voice') autoListenRef.current = true; };
          ttsRef.current = speakWithTTS(said, done, done, PABLO_TTS_OPTIONS);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[Pablo] public chat failed:", msg);
          // Soft re-prompt — don't strand them on a network blip.
          await speak("Lost you for a second — try again?");
        }
        return;
      }
    }

    // GENERAL QUESTION during name/email collection. If the user asks
    // "what's a salaryman?" or "do I have to give my real email?" once
    // we've already committed to collecting identity, route to the
    // PUBLIC LLM endpoint (the user isn't authed yet — the authed
    // /chat/pablo/command 401s here) and re-prompt for the field.
    // Without this branch the question got stored as a junk name/email
    // and the user was stuck.
    if (
      (interviewPhaseRef.current === 'asking-name' || interviewPhaseRef.current === 'asking-email') &&
      isGeneralQuestion(text)
    ) {
      const phase = interviewPhaseRef.current;
      const reprompt = phase === 'asking-name'
        ? "And — what should I call you?"
        : "And — what's your email?";
      setStatus("thinking");
      setReply("");
      try {
        const res = await apiFetch("api/chat/pablo/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: text,
            history: history.slice(-6),
            context: {
              intakePhase: interviewPhaseRef.current,
              pendingDestination: pendingDestinationRef.current,
              currentPath: typeof window !== 'undefined' ? window.location.pathname : null,
              userCity: deriveUserCityName(),
            },
          }),
        });
        if (!res.ok) throw new Error(`pablo ${res.status}`);
        const data = (await res.json()) as { say: string };
        const combined = `${(data.say ?? '').trim()} ${reprompt}`.trim();
        setReply(combined);
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: combined }]);
        setStatus("speaking");
        ttsRef.current?.cancel();
        const done = () => { ttsRef.current = null; setStatus("idle"); if (mode === 'voice') autoListenRef.current = true; };
        ttsRef.current = speakWithTTS(combined, done, done, PABLO_TTS_OPTIONS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Pablo] gatekeeper-question failed:", msg);
        await speak(reprompt);
      }
      return;
    }
    if (interviewPhaseRef.current === 'asking-name') {
      // Crosstalk guard: if the mic captured more than one person
      // answering at the same time (two emails, two "my name is" claims,
      // or correction chatter like "no, his name is…"), don't silently
      // pick one — ask the user to repeat solo. False-positives just cost
      // a re-prompt; false-negatives lock in the wrong identity.
      const cross = detectCrosstalk(text);
      if (cross) {
        // Identify the interested party rather than just refuse — that's
        // what the user explicitly asked for. We address only the one
        // who wants in and keep the door cracked.
        if (cross.reason === 'multiple_emails') {
          await speak("Two emails came through. Whoever's the one signing in — say your name. Just yours.");
        } else {
          await speak("More than one of you in there. Whoever wants in — speak alone. Your name?");
        }
        return;
      }
      // Combined utterance ("My name is Alex Duong, my email is alex@x.com"
      // or the spoken-form "alex at gmail dot com") — extract BOTH fields
      // here so we don't store the email tail as the user's name and then
      // re-prompt for the email they already gave us. That double-take was
      // the production-reported loop: Pablo addressed the user with a
      // garbage 32-char-truncated "name", said what he was about to do,
      // and then asked for an email the user had ALREADY provided in the
      // same breath.
      const inlineEmail = extractEmailFromText(text);
      // Pass the email so the name extractor can anchor its tail-cut on
      // the actual email position instead of guessing every English
      // lead-in phrase.
      let name = extractNameFromText(text, inlineEmail);

      // Reject email-as-name corruption (architect-flagged): when the user
      // only said an email (or a fragment that the prefix-stripper turned
      // into a junk token like "my"), don't store that as their name. We
      // SAVE the email if we got one and re-ask for the name. This avoids
      // the inverse loop where Pablo addresses the user as "my" or as
      // their literal email.
      const looksLikeEmail = name.includes('@') || /^https?:/i.test(name);
      const localPart = inlineEmail ? inlineEmail.split('@', 1)[0] : '';
      const isJustLocalPart = !!localPart && name.toLowerCase() === localPart;
      const isPrefixGarbage = /^(my|i|the|name|email|it)$/i.test(name);
      // Defense-in-depth (architect-flagged round 6): "my email is
      // alice@x.com" → extractor returns "my email is" as the "name".
      // Single-word isPrefixGarbage doesn't catch the phrase, so we
      // ALSO reject any extracted name that mentions email/phone/address
      // tokens — those words don't appear in real names and signal the
      // extractor swallowed lead-in chatter.
      const containsContactToken = /\b(email|phone|address|number|contact)\b/i.test(name);
      if (!name || name.length < 2 || looksLikeEmail || isJustLocalPart || isPrefixGarbage || containsContactToken) {
        if (inlineEmail) {
          // Lock in the email; we still need a name. Advance to a
          // name-only re-prompt instead of asking for both again.
          setSalarymanEmail(inlineEmail);
          await speak("Got the email. Now — your name. Just what to call you.");
        } else {
          await speak("Try again. Just a name.");
        }
        return;
      }
      setSalarymanName(name);

      if (inlineEmail) {
        // Single-utterance intake complete. Screen the email before opening OAuth.
        const emailOk = await screenEmailBeforeAdmitRef.current(inlineEmail);
        if (!emailOk) return; // blocked — Pablo already deflected, phase reset to asking-email
        setSalarymanEmail(inlineEmail);
        interviewPhaseRef.current = 'idle';
        bumpInterview();
        const line = `Cleared, ${name}. Heading in.`;
        setReply(line);
        setStatus("speaking");
        ttsRef.current?.cancel();
        // Single-shot redirect: TTS callback OR the 2.2s timeout fallback,
        // whichever fires first — never both. The timer is cleared on
        // first fire, and a `fired` flag also blocks re-entry in case
        // both invocations land in the same microtask. Architect-flagged.
        let fired = false;
        let timerId: number | undefined;
        const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/tower';
        pendingDestinationRef.current = null;
        const goLogin = () => {
          if (fired) return;
          fired = true;
          if (timerId !== undefined) window.clearTimeout(timerId);
          ttsRef.current = null;
          setAuthChoice({ dest, hint: inlineEmail });
        };
        ttsRef.current = speakWithTTS(line, goLogin, goLogin, PABLO_TTS_OPTIONS);
        timerId = window.setTimeout(goLogin, 2200);
        return;
      }

      // Advance phase BEFORE the ack TTS so a rapid second submission
      // routes to asking-email (parses as the user's email) instead of
      // re-entering asking-name — architect-flagged race.
      interviewPhaseRef.current = 'asking-email';
      bumpInterview();
      // Brief, warm ack — the longer "nice to meet you, X" greeting
      // lives in askEmailNow which fires right after this finishes.
      const ack = `${name}. Got it.`;
      setReply(ack);
      setStatus("speaking");
      ttsRef.current?.cancel();
      ttsRef.current = speakWithTTS(ack, () => { ttsRef.current = null; askEmailNow(); }, () => { ttsRef.current = null; askEmailNow(); }, PABLO_TTS_OPTIONS);
      return;
    }
    if (interviewPhaseRef.current === 'asking-email') {
      // Full crosstalk guard for the email step (architect-flagged: was
      // only checking multiple-emails; now also rejects multi-name-claim
      // and correction-chatter transcripts so we don't silently lock in
      // the wrong email when the mic captured a side conversation).
      const cross = detectCrosstalk(text);
      if (cross) {
        // Same interested-party framing as asking-name. Address the one
        // who wants in, not the room.
        if (cross.reason === 'multiple_emails') {
          await speak("Two emails came through. Which one is yours? Just yours.");
        } else {
          await speak("More than one voice in there. Whoever's the one signing in — just your email.");
        }
        return;
      }
      // Voice transcripts say "alex at gmail dot com" — normalize before
      // validating, otherwise every voice-mode user got "That's not an
      // email" until they typed it manually.
      const email = (extractEmailFromText(text) ?? text.trim()).toLowerCase();
      if (!isLikelyEmail(email)) {
        await speak("That's not an email. Real one. user@somewhere.com.");
        return;
      }
      // Screen the email before we open the door — blocked domains get
      // Pablo's in-character deflection and the phase resets to asking-email.
      const emailOk = await screenEmailBeforeAdmitRef.current(email);
      if (!emailOk) return;
      setSalarymanEmail(email);
      interviewPhaseRef.current = 'idle';
      bumpInterview();
      const known = formatSpeechName(getSalarymanName() ?? 'salaryman');
      const line = `Cleared, ${known}. Heading in.`;
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      // Capture the destination once and open the modal immediately; speech
      // remains an acknowledgment, not a gate that can strand the visitor.
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/tower';
      pendingDestinationRef.current = null;
      setAuthChoice({ dest, hint: email });
      ttsRef.current = speakWithTTS(
        line,
        () => { ttsRef.current = null; setStatus("idle"); },
        () => { ttsRef.current = null; setStatus("idle"); },
        PABLO_TTS_OPTIONS,
      );
      return;
    }

    // Honor explicit "let's text" / "let's talk" mode-switch requests.
    const switchTo = detectModeSwitch(text);
    if (switchTo === "text") {
      chooseTextMode();
      setReply("Text mode on. Type away.");
      return;
    }
    if (switchTo === "voice") {
      ttsRef.current?.cancel();
      setMode("voice");
      setStatus("idle");
      autoListenRef.current = true;
      speakLine("Voice on. Talk to me.");
      return;
    }

    // Authenticated new users remain on Pablo's homepage until they explicitly
    // choose to enter. Keep the handoff deterministic instead of asking the
    // command model to infer whether "I'm ready" means Tower access.
    if (isAuthenticated && !hasFinishedOnboarding && (isReadyToEnter(text) || isShowPapers(text))) {
      enterFromHomepage();
      return;
    }

    // (Brush-off mid-intro is gone. The intro question itself is the
    // hook — any user input while the intro card is visible drops
    // them into the intake at the asking-name branch above, which
    // interrupts the storyteller in a friendly way.)

    setStatus("thinking");
    setReply("");
    try {
      const res = await apiFetch("api/chat/pablo/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, history: history.slice(-10) }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`pablo ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }
      type PabloAction =
        | { kind: "navigate"; path: string }
        | { kind: "logout" }
        | { kind: "search"; query: string }
        | { kind: "external"; url: string };
      const data = (await res.json()) as { say: string; action: PabloAction | null; persona?: "pablo" | "mila"; intrusion?: string };
      let action = data.action;
      let say = data.say;

      // Mirror the server-authoritative persona so the orb + voice match who's
      // actually answering (Pablo pre-story, Mila once the story is live).
      const who = data.persona ?? "pablo";
      setPersona(who);
      personaRef.current = who;
      // Cache write-through is owned by the account-tagging sync effect, which
      // fires on this persona change and stores { uid, persona }.

      // PRE-AUTH GATE: if the user hasn't signed in yet and Pablo decided to
      // send them somewhere,
      // do NOT navigate / open / log out now. Auth-gated routes either
      // crash on missing user data or redirect through login with no
      // context — both look like a black screen to the user.
      //
      // We treat the user as pre-onboarded any time they aren't signed in or
      // the interview is still running. While that holds:
      //   - navigate / search → stash destination as pendingDestinationRef
      //     and use it as OAuth `returnTo` later.
      //   - external / logout  → drop entirely; they don't make sense
      //     without an account, and an LLM-suggested external URL fired at
      //     an unauthenticated user is a phishing surface.
      // In every case the action is set to null so nothing fires now, and
      // we append an in-voice gating sentence to Pablo's reply so the
      // user understands why we're routing them through immigration.
      const isPreOnboarding =
        !isAuthenticated ||
        interviewPhaseRef.current !== 'idle';
      if (isPreOnboarding && action) {
        if (action.kind === "navigate") {
          // Never stash a server/auth path as a destination — that becomes
          // the OAuth `returnTo` later, and pointing returnTo back at
          // /sign-in or any /api/* endpoint creates a redirect loop or
          // a 404 page. If the LLM picked one of those (or anything
          // weirder, like a protocol-relative `//evil.com` open-redirect
          // bait), drop the path and let OAuth bounce them to the
          // default (/world/play).
          const safePath = sanitizeReturnPath(action.path);
          if (safePath) pendingDestinationRef.current = safePath;
          say = `${say.replace(/\s+$/, "")} I’ll get you signed in, then send you straight there.`;
        } else if (action.kind === "search") {
          pendingDestinationRef.current = `/?q=${encodeURIComponent(action.query)}`;
          say = `${say.replace(/\s+$/, "")} I’ll get you signed in, then take you to that search.`;
        } else {
          // external / logout — silently drop; Pablo's `say` already
          // reads as a normal reply and the gate is implicit.
        }
        action = null;
      }

      setReply(say);
      setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: say }]);
      // Speak Pablo's (or Mila's) reply on EVERY device. Voice OUTPUT is
      // decoupled from voice INPUT here: the mic / auto-listen stays gated to
      // voice mode (see the autoListen flags below), but the spoken reply must
      // play even in text mode. Phones default to text mode, so gating speech
      // on `mode === "voice"` left mobile users with a permanently silent
      // Pablo ("voice response isn't working"). The onboarding intake already
      // speaks regardless of mode — this makes normal chat replies match.
      {
        // Pablo occasionally claws back through the channel — a short glitchy
        // intrusion in HIS voice cuts in before Mila wrestles control back.
        if (who === "mila" && data.intrusion) {
          await speak(data.intrusion, "PABLO");
        }
        await speak(say);
      }
      if (action?.kind === "navigate") {
        // Architect-flagged: server already strips /phone* navigations,
        // but defense in depth — gate the immediate navigate too. Use
        // the same sanitizeReturnPath that handles canonical URL parsing
        // (drops fragments, dot-segments, encoded variants that would
        // resolve to /phone). If the path is denied (or any other
        // disallowed destination like /api/*), drop the nav silently
        // and let `say` carry the user message.
        const safeNav = sanitizeReturnPath(action.path);
        if (safeNav) setTimeout(() => navigate(safeNav), 300);
        else { setStatus("idle"); if (mode === "voice") autoListenRef.current = true; }
      } else if (action?.kind === "logout") {
        // Reset the current terminal conversation for the next account.
        setHistory([]);
        setReply("");
        setTranscript("");
        // Drop this account's persona cache so the next account on this browser
        // can never inherit a stale Mila on first paint.
        clearCachedPersona();
        setTimeout(() => { try { logout(); } catch { window.location.href = "/"; } }, 400);
      } else if (action?.kind === "search") {
        setTimeout(() => navigate(`/?q=${encodeURIComponent(action.query)}`), 300);
      } else if (action?.kind === "external") {
        try { window.open(action.url, "_blank", "noopener"); } catch {}
        setStatus("idle");
        if (mode === "voice") autoListenRef.current = true;
      } else {
        setStatus("idle");
        if (mode === "voice") autoListenRef.current = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Pablo] command failed:", msg);
      setError(`Pablo hit a snag: ${msg}`);
      setStatus("idle");
      if (mode === "voice") autoListenRef.current = true;
    }
  }, [history, navigate, speak, speakLine, mode, chooseTextMode, logout, beginIntake, askEmailNow, isAuthenticated, hasFinishedOnboarding, enterFromHomepage]);

  const submitText = useCallback(() => {
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    setTranscript(t);
    void sendToPablo(t);
  }, [textInput, sendToPablo]);

  const startListening = useCallback(async () => {
    setError("");
    setReply("");
    setTranscript("");
    try {
      // Force the browser's voice-tuned constraints. Without these, mobile
      // Safari and Chrome give us a raw, low-gain stream that whisper struggles
      // to transcribe. AGC normalizes quiet voices; NS/EC clean up rooms.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48_000,
        },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        // Drop only truly empty captures. Short clips ("yes", "no", "hey
        // Pablo") were getting silently discarded at the old 1000-byte floor.
        if (blob.size < 350) { setStatus("idle"); return; }
        try {
          setStatus("thinking");
          const text = await transcribe(blob);
          if (!text) { setStatus("idle"); return; }
          setTranscript(text);
          await sendToPablo(text);
        } catch (err) {
          console.error("[Pablo] transcribe failed:", err);
          setError("Couldn't hear that.");
          setStatus("idle");
        }
      };

      // VAD: stop on ~1.4s of silence after some speech
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSoundAt = Date.now();
      let everSpoke = false;
      // Adaptive noise floor: sample the room for the first 350ms so quiet
      // speakers in noisy rooms still register without false-triggering on
      // ambient hum. Speech threshold sits at floor + a small margin.
      let noiseFloor = 0.005;
      let noiseSamples = 0;
      const NOISE_LEARN_MS = 350;
      const SILENCE_MS = 1800;
      const MAX_MS = 20000;
      const startedAt = Date.now();
      const loop = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const elapsed = Date.now() - startedAt;
        if (elapsed < NOISE_LEARN_MS) {
          noiseFloor = (noiseFloor * noiseSamples + rms) / (noiseSamples + 1);
          noiseSamples++;
        }
        const speakingThreshold = Math.max(0.012, noiseFloor * 2.2);
        if (rms > speakingThreshold) { lastSoundAt = Date.now(); everSpoke = true; }
        const now = Date.now();
        if ((everSpoke && now - lastSoundAt > SILENCE_MS) || now - startedAt > MAX_MS) {
          if (recorderRef.current?.state === "recording") {
            try { recorderRef.current.stop(); } catch {}
          }
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      recorder.start();
      setStatus("listening");
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error("[Pablo] mic error:", err);
      setError("Microphone access required.");
      setStatus("idle");
    }
  }, [cleanup, sendToPablo]);

  const stopAll = useCallback(() => {
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const onOrbClick = useCallback(() => {
    if (mode === "text") return;
    // Tapping the nebula is "I want to talk to Pablo NOW". Previously a tap
    // during Pablo's speech only ran stopAll() — silencing him without
    // opening the mic, forcing a second tap. Now any tap that isn't the
    // user trying to stop an active recording cuts Pablo off AND opens the
    // mic in one gesture.
    if (status === "listening") { stopAll(); return; }
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    void startListening();
  }, [status, startListening, stopAll, mode, cleanup]);

  // Hands-free conversation loop: whenever we land on idle and a hop is
  // queued, start listening again automatically (voice mode only).
  useEffect(() => {
    if (mode !== "voice") return;
    if (status !== "idle") return;
    if (!autoListenRef.current) return;
    autoListenRef.current = false;
    const t = setTimeout(() => { startListening(); }, 350);
    return () => clearTimeout(t);
  }, [status, startListening, mode]);

  const switchToText = useCallback(() => chooseTextMode(), [chooseTextMode]);
  const switchToVoice = useCallback(() => {
    setMode("voice");
    ttsRef.current?.cancel();
    setStatus("idle");
    autoListenRef.current = true;
  }, []);

  return (
    <div
      className={`fixed left-0 top-0 z-50 flex w-full flex-col items-center overflow-hidden${boomerMode ? " boomer-terminal" : ""}`}
      style={{
        // Brand-toned base. Used to be near-black (#0a0a14 → #000), which
        // turned the whole page into a "black screen" on iOS Safari whenever
        // the WebGL nebula failed to paint silently. The brand gradient
        // (deep violet through Pablo-magenta to ink) keeps the page feeling
        // alive even if the shader never lights up.
        background:
          "radial-gradient(ellipse at 50% 35%, #1a0a2e 0%, #0a0418 55%, #000 100%)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingTop: "env(safe-area-inset-top)",
        height: "var(--app-viewport-height, 100dvh)",
        transform: "translateY(var(--app-viewport-top, 0px))",
      }}
    >
      {/* Free-flowing nebula — full-bleed living background. Sized to the
          viewport diagonal so its particle field actually overflows every
          edge instead of sitting in a centered box. The whole layer is a
          single click target so tapping anywhere wakes the mic. */}
      <button
        type="button"
        onClick={onOrbClick}
        className="fixed inset-0 z-0 outline-none select-none cursor-pointer"
        aria-label={STATUS_LABEL[status]}
        data-testid="pablo-orb"
      >
        {(
          // Pablo IS the emotion nebula — no portrait, no figure, no shadow.
          // He's a living ball of light; the orb itself is his presence. Per
          // user direction we render ONLY the nebula here (a literal picture of
          // Pablo broke the "he's just light in the back" read).
          <div
            className="absolute pointer-events-none"
            style={{
              width: nebulaSize,
              height: nebulaSize,
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              opacity: 1,
            }}
          >
            <NebulaErrorBoundary fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
              <PabloNebula3D status={status} size={nebulaSize} variant={persona === "mila" ? MILA_VARIANT : PABLO_VARIANT} />
            </NebulaErrorBoundary>
          </div>
        )}
      </button>

      {/* Minimal top header — logo + visible TEXT/VOICE toggle + exit. Sits
          above the nebula via z-10 so it stays clickable. The header itself
          gets extra horizontal padding on mobile so the logo + buttons clear
          the curved corners + camera bumps of modern phones, and the
          GFX/status pills (which are fixed) get their own safe-area padding
           above. We also push the whole header down so it sits BELOW the
           GFX/status pills row instead of fighting them for the top edge.
           On desktop, the global alpha warning occupies the top strip, so
           reserve that strip here rather than hiding the controls behind it. */}
      <header
        className="relative z-10 w-full flex items-center justify-between gap-1 px-2 sm:mt-12 sm:gap-2 sm:px-6 pb-2.5 sm:pb-4 shrink-0"
        style={{
          // GFX/status pills already eat ~32px below the inset. Push the
          // header below that so its logo + buttons don't collide with them.
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        }}
      >
         {/* Pablo is the homepage. The three explicit choices are the only
             front-door destinations: download the native world, enter the
             practical terminal, or stay with Pablo AI. */}
        {hasFinishedOnboarding ? (
          <Link
            href={pendingDestinationRef.current ?? "/"}
            className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
            data-testid="link-logo-loop"
            aria-label="Back to previous location"
            title="Return to Tower"
          >
            <PicassoLogo size={20} gap={2} glow />
            <span className="pablo-brand-wordmark font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
              SALARYMAN
            </span>
          </Link>
        ) : (
          <Link
            href="/pablo"
            className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
            data-testid="link-logo-loop"
          >
            <PicassoLogo size={20} gap={2} glow />
            <span className="pablo-brand-wordmark font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
              SALARYMAN
            </span>
          </Link>
        )}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <PabloControlsMenu showHummingbird={hasFinishedOnboarding} />
           <button
              type="button"
              data-testid="pablo-download-salaryman"
              onClick={(e) => {
                e.stopPropagation();
                if (window.matchMedia("(max-width: 640px)").matches) {
                  window.alert("DOWNLOAD is available on desktop only. Open SALARYMAN on a desktop browser to continue.");
                  return;
                }
                navigate("/desktop");
              }}
              className="pablo-download-control app-action pablo-header-action app-control mobile-tap-target border-lime-400/45 bg-lime-500/10 text-lime-200 hover:bg-lime-500/20"
              title="Download SALARYMAN desktop client"
              aria-label="Download SALARYMAN desktop client"
            >
              <Download className="w-3 h-3" />
              <span className="pablo-download-label">DOWNLOAD</span>
            </button>
          {!isLoading && !isAuthenticated && (
            <button
              type="button"
               onClick={(e) => { e.stopPropagation(); startWorkFromHomepage(); }}
              data-testid="pablo-sign-in"
                className="app-action pablo-header-action app-control mobile-tap-target border-cyan-400/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
               title="Start work in the terminal"
            >
              <LogIn className="w-3 h-3" />
               START WORK
            </button>
          )}
          {!isLoading && isAuthenticated && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startWorkFromHomepage(); }}
              data-testid="pablo-enter-tower"
              className="app-action pablo-header-action app-control mobile-tap-target border-cyan-400/50 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
               title="Start work in the terminal"
            >
              <LogIn className="w-3 h-3" />
              START WORK
            </button>
          )}
           <button
             type="button"
             onClick={(e) => { e.stopPropagation(); if (mode === "text") setMode("text"); else onOrbClick(); }}
             data-testid="pablo-ai-choice"
              className="pablo-mobile-secondary app-action pablo-header-action app-control mobile-tap-target border-violet-400/45 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
             title="Open Pablo AI"
           >
             <Sparkles className="w-3 h-3" />
             PABLO AI
           </button>
          {/* TEXT/VOICE toggle is now visible during the intro too. The
              session defaults to voice (autoListen on), but a user who
              prefers typing — or whose mic is dead — needs the button up
              here so they can flip without having to first unlock the
              door. The audio attach strip stays hidden during the intro
              because tapping it surfaces an unrelated file picker
              mid-story; that's a post-onboarding tool. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mode === "text" ? switchToVoice() : switchToText(); }}
            data-testid="pablo-mode-toggle"
              className="app-action pablo-header-action app-control mobile-tap-target border-pink-400/40 bg-black/60 text-pink-200 hover:bg-pink-500/15"
            title={mode === "text" ? "Switch to voice" : "Switch to text"}
          >
            {mode === "text" ? <Mic className="w-3 h-3" /> : <Send className="w-3 h-3" />}
            {mode === "text" ? "VOICE" : "TEXT"}
          </button>
          {/* No exit X — the SALARYMAN logo is the only authenticated exit,
              and the primary work handoff goes through the physical Tower. */}
        </div>
      </header>

      {/* Spacer so the rest of the column lays out at the bottom of the
          page even though the nebula is now an absolutely-positioned
          background. */}
      <div className="relative z-10 flex-1 pointer-events-none" />

      {/* Live status pill — LISTENING / THINKING / SPEAKING / IDLE. Used
          to be hidden during the storyteller intro so the lower edge stayed
          uncrowded, but the intro now covers the entire pre-auth chat
          phase, which meant the user lost ALL feedback that the mic was
          live and that flipping voice/text actually did anything. We pin
          it to the top-center as a fixed overlay (away from the GFX pill
          at top-right and the intro stack at the bottom) so it's visible
          across every phase except pure-text mode, where the mic state is
          irrelevant. */}
      {mode !== "text" && (
        <div
          className="fixed z-30 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-3 py-1 rounded-full border bg-black/60 backdrop-blur text-[10px] sm:text-[11px] font-mono tracking-[0.3em]"
          style={{
            color: STATUS_COLOR[status],
            borderColor: "rgba(236,72,153,0.30)",
            // Match the GFX pill — clear the iPhone notch / Android status bar
            // so the LISTENING/THINKING badge isn't hidden under the time +
            // battery icons.
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          }}
          data-testid="pablo-status-pill"
        >
          {status === "listening" ? <Mic className="w-3 h-3" /> : status === "idle" ? <MicOff className="w-3 h-3" /> : null}
          <span>{STATUS_LABEL[status]}</span>
        </div>
      )}

      {/* Shared conversation surface for visitors and returning users. */}
      {(transcript || reply || status === "thinking") && (
        <div
          className="mobile-scroll-region absolute inset-x-0 max-h-[42dvh] overflow-y-auto px-4 sm:px-8 flex flex-col items-center gap-2 pointer-events-none z-10"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${mode === "text" ? 96 : 140}px)` }}
        >
          {transcript && (
            <div
              className="pointer-events-auto w-full max-w-2xl rounded-lg bg-black/60 backdrop-blur px-3 py-2 border border-cyan-400/25"
              data-testid="pablo-user-transcript"
            >
              <div className="text-cyan-300/80 text-[9px] font-mono tracking-[0.3em] mb-0.5">YOU</div>
              <p className="text-zinc-100 text-sm leading-snug">{transcript}</p>
            </div>
          )}
          {(reply || status === "thinking") && (
            <div
              className={`pointer-events-auto w-full max-w-2xl rounded-lg bg-black/75 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 border ${persona === "mila" ? "border-teal-400/55" : "border-pink-400/55"}`}
              style={{ boxShadow: persona === "mila" ? "0 0 32px rgba(45,212,191,0.30)" : "0 0 32px rgba(236,72,153,0.32)" }}
              data-testid="pablo-reply-bubble"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-mono tracking-[0.3em] ${persona === "mila" ? "text-teal-200" : "text-pink-200"}`}>{personaLabel}</span>
                {status === "thinking" && (
                  <span className={`text-[9px] font-mono tracking-[0.3em] animate-pulse ${persona === "mila" ? "text-teal-300/60" : "text-pink-300/60"}`}>THINKING</span>
                )}
                {status === "speaking" && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${persona === "mila" ? "bg-teal-400" : "bg-pink-400"}`} style={{ boxShadow: persona === "mila" ? "0 0 6px #2dd4bf" : "0 0 6px #ec4899" }} aria-hidden="true" />
                )}
              </div>
              <p
                className="text-zinc-100 text-sm sm:text-base leading-snug sm:leading-relaxed"
                style={{ textShadow: persona === "mila" ? "0 0 14px rgba(45,212,191,0.30)" : "0 0 14px rgba(236,72,153,0.32)" }}
              >
                {reply || "…"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Idle Pablo bubble — one greeting per session, then slow lore drips
          on a doubling cadence (5→10→20→40 min…). Each lore drip carries
          two cheeky clickable reply tokens; tapping one fires it back as a
          normal Pablo message. */}
      {!reply && !transcript && idleLine && mode !== "text" && (
        <div className="absolute inset-x-0 bottom-44 sm:bottom-48 px-4 sm:px-8 flex flex-col items-center gap-2 pointer-events-none z-10">
          <div className={`pointer-events-auto w-full max-w-md rounded-lg border bg-black/55 backdrop-blur px-4 py-2.5 ${persona === "mila" ? "border-teal-500/25" : "border-purple-500/25"}`}>
            <div className="flex items-center justify-between mb-0.5">
              <div className={`text-[9px] font-mono tracking-[0.3em] ${persona === "mila" ? "text-teal-300/80" : "text-purple-300/80"}`}>{personaLabel}</div>
              <div className="text-zinc-600 text-[9px] font-mono tracking-[0.3em]">IDLE</div>
            </div>
            <p className="text-zinc-200 text-sm leading-snug">{idleLine}</p>
            {idleOptions.length === 2 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {idleOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIdleOptions([]); sendToPablo(opt); }}
                    className="mobile-tap-target px-3 py-2 rounded border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 text-[10px] font-mono tracking-[0.14em]"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Removed: persistent "UPGRADE TO PABLO PRIME" button.
              On mobile it sat directly over the text input box, and it
              shouldn't be the very first thing a brand-new arrival sees
              before they've even cleared immigration. The Prime upsell
              is now delivered as a one-shot TV-ad interstitial on /
              after onboarding (see PrimeAdInterstitial). */}
        </div>
      )}

      {/* Voice control is available from the first frame. */}
      {mode !== "text" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 px-4 w-full pointer-events-none z-20"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOrbClick(); }}
            data-testid="pablo-talk-button-main"
            aria-label="Tap to talk to Pablo"
            className="pointer-events-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border bg-pink-500/15 hover:bg-pink-500/25 active:bg-pink-500/30 text-pink-50 text-sm sm:text-base font-semibold transition-colors"
            style={{
              borderColor: status === "listening" ? "rgba(103,232,249,0.85)" : "rgba(236,72,153,0.75)",
              boxShadow: status === "listening" ? "0 0 26px rgba(103,232,249,0.40)" : "0 0 18px rgba(236,72,153,0.25)",
            }}
          >
            <Mic className={`w-4 h-4 ${status === "listening" ? "animate-pulse" : ""}`} />
            {status === "listening" ? "Listening — tap to stop"
              : status === "thinking" ? "One moment…"
              : "Tap to talk"}
          </button>
          <div className="pointer-events-none text-pink-100/75 text-xs text-center leading-snug">
            Tap the button and talk, or switch to typing up top.
          </div>
        </div>
      )}

      {/* Text and voice controls are mutually exclusive. */}
      {mode === "text" && (
        <form
          onSubmit={(e) => { e.preventDefault(); submitText(); }}
          className="absolute left-1/2 -translate-x-1/2 w-full max-w-xl px-4 sm:px-6 flex items-center gap-2"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
          data-testid="pablo-text-form"
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              interviewPhaseRef.current === 'asking-name' ? "Type your name"
                : interviewPhaseRef.current === 'asking-email' ? "Type your email"
                : "Type a message…"
            }
            className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-purple-500/60 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
            autoFocus
            data-testid="pablo-text-input"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status === "thinking"}
            className="mobile-tap-target px-3 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors"
            aria-label="Send"
            data-testid="pablo-text-send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Silent error indicator — tiny, doesn't interrupt the nebula */}
      {error && (
        <div
          className="pointer-events-none absolute left-1/2 z-30 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-center text-[10px] font-mono tracking-wider text-red-300/80 backdrop-blur"
          style={{
            bottom: mode === "text"
              ? "calc(env(safe-area-inset-bottom, 0px) + 82px)"
              : "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          {error}
        </div>
      )}

      {/* Camera + file + URL go live exclusively post-onboarding. */}
      {hasFinishedOnboarding && <VisionIntake />}

      {/* Sign-in method choice. Reached when onboarding hits the auth moment.
          Default path is Replit; Discord is the opt-in that also routes the
          user into their nearest SALARYMAN city server after they connect. */}
      <AnimatePresence>
        {authChoice && (
          <motion.div
            key="auth-choice"
            data-testid="pablo-auth-choice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed", inset: 0, zIndex: 100000,
              background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflowY: "auto",
              padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              style={{
                background: "#0a0a0b", border: "1px solid rgba(56,189,248,0.2)",
                padding: "2.25rem 1.75rem", maxWidth: 360, width: "100%", textAlign: "center",
                maxHeight: "calc(100svh - 2rem)", overflowY: "auto",
                boxShadow: "0 0 40px rgba(56,189,248,0.06)",
              }}
            >
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: "1.5rem", color: "#38bdf8",
                letterSpacing: "0.2em", marginBottom: "6px", textShadow: "0 0 15px rgba(56,189,248,0.3)",
              }}>
                 You're Late
              </div>
              <div style={{
                width: "60px", height: "1px", margin: "0 auto 16px",
                background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)",
              }} />
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: "0.62rem",
                color: "rgba(56,189,248,0.45)", letterSpacing: "0.08em", lineHeight: 1.7, marginBottom: "22px",
              }}>
                 Continue with secure SALARYMAN sign-in. One verified method keeps the front door fast and uncluttered.
              </div>

              <button
                onClick={() => {
                  const c = authChoice;
                  if (!c) return;
                  const ret = encodeURIComponent(c.dest);
                  const hint = c.hint ? `&login_hint=${encodeURIComponent(c.hint)}` : "";
                  window.location.href = `/sign-in?returnTo=${ret}${hint}`;
                }}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: "0.75rem", color: "#38bdf8",
                  border: "1px solid rgba(56,189,248,0.5)", padding: "10px 32px",
                  background: "rgba(56,189,248,0.08)", cursor: "pointer", letterSpacing: "0.15em",
                  width: "100%", transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(56,189,248,0.15)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.7)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(56,189,248,0.08)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.5)"; }}
              >
                 CONTINUE WITH SALARYMAN
              </button>

              <button
                onClick={() => setAuthChoice(null)}
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: "0.55rem",
                  color: "rgba(56,189,248,0.25)", background: "none", border: "none",
                  cursor: "pointer", marginTop: "16px", letterSpacing: "0.1em",
                  display: "block", width: "100%",
                }}
              >
                NOT NOW
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
