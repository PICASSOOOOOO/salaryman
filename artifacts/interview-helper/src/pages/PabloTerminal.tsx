import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Send, Keyboard, MessageCircle, GraduationCap, Map as MapIcon, LogIn } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { HummingBirdAttachStrip } from "@/components/HummingBirdAttachStrip";
import { apiFetch } from "@/lib/api-client";
import { sanitizeReturnPath } from "@/lib/safe-path";
import { speakWithTTS, whenAudioUnlocked, unlockAudio, armAudioAutoUnlock } from "@/lib/tts";
import { ensureOnboardingScore } from "@/lib/onboarding-score";
import { useAuth } from "@workspace/replit-auth-web";
import { Component as ReactComponent, type ReactNode as RNode } from "react";
import { PabloNebula3D, PABLO_VARIANT, MILA_VARIANT } from "@/components/PabloNebula3D";
import { SceneFX } from "@/components/SceneFX";
import { CinematicScene } from "@/components/CinematicScene";
import { useLowGfx } from "@/lib/lowGfx";
import { useBoomerMode } from "@/hooks/use-mobile";
import { VisionIntake } from "@/components/VisionIntake";
import {
  isTutorialDone, markTutorialDone, markPasscodeUnlocked, isPasscodeUnlocked,
  setSalarymanName, setSalarymanEmail, getSalarymanName, getSalarymanEmail, isLikelyEmail,
} from "@/lib/tutorial-progress";
import { useArtAsset } from "@/lib/art";
import { isReadyToEnter, isCostCurious, isShowPapers } from "@/lib/signup-intent";
import { TIMEZONE_CITIES } from "@/gameSystems";

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

const ONBOARD_KEY = "pablo-terminal-onboarded-v2";

// The storyteller intro. Pablo introduces himself, paints the world, then
// asks for the passcode. Each line is spoken sequentially with TTS. The
// user can interrupt at any time by tapping the nebula and asking a
// question — Pablo will answer via the normal /api/chat/pablo/command
// pipeline and then keep waiting for the passcode.
// Idle one-liners Pablo cycles through AFTER the user has completed the
// storyteller intro. The point is presence — Pablo always feels like he's
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
// dragged through the new-user passcode → puzzle → ask-name → ask-email
// sequence — OAuth covers the account half on its own. We bypass the
// intro entirely and hand them straight to /api/login. This also avoids
// a feedback loop where the LLM might return navigate to '/api/login',
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

// The nebula is no longer a centered orb — it's a full-bleed living
// background. We size the canvas to the viewport DIAGONAL so its particle
// field actually overflows the corners and feels free-flowing instead of
// boxed-in. Resize updates as the user rotates / changes window size.
function useNebulaSize() {
  const compute = () => {
    if (typeof window === "undefined") return 1200;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = Math.hypot(w, h);
    // Mobile: keep the nebula tighter to the viewport so we don't shade a
    // 1500-px canvas at dpr 2.5 on a phone GPU. Desktop: keep the generous
    // 1.2× overflow so the field bleeds past every edge.
    const isMobile = w < 640;
    const mult = isMobile ? 1.0 : 1.2;
    const min = isMobile ? 480 : 640;
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

// Pablo's intro lines, hoisted to module scope so callbacks defined
// early in the component (beginIntake) can reference QUESTION_LINE
// without TDZ errors. The text is content, not state — there's no
// reason for it to live inside the component closure.
const INTRO_LINES = [
  "Pablo. You came looking for work — sensible. This city runs on people who make themselves useful. Be one of them.",
];
// QUESTION_LINE is the persistent pinned caption — the always-on safety
// net shows it whenever the intro is visible (including return visits)
// so the screen is never a blank nebula. It is DELIBERATELY NOT the
// self-introduction: INTRO_LINES (Pablo naming himself) is spoken once
// per visitor and guarded by the persisted greeting flag, but the pinned
// caption re-renders whenever the reply bubble is cleared and a dep
// changes. If the caption WERE the self-intro, every re-pin would read as
// Pablo re-introducing himself in a loop. Keep this a short, neutral
// prompt so a re-pin never re-introduces him.
const QUESTION_LINE = "I'm listening.";
// Only fires when the user asks for a feature that requires an account
// (wantsTool match) — never as the default opener anymore.
const NAME_PROMPT_LINE = "What should I call you?";

export default function PabloTerminal() {
  const { isLoading } = useAuth();
  const [, navigateTop] = useLocation();
  useEffect(() => {
    // Pablo is now open to anonymous visitors. Sign-up is requested only
    // when an action actually needs a persistent account (covered downstream
    // by the email-verification deferral work).
    void navigateTop;
  }, [navigateTop]);
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-zinc-500 font-mono text-xs tracking-[0.3em]">
        BOOTING…
      </div>
    );
  }
  return <PabloTerminalAuthed />;
}

function PabloTerminalAuthed() {
  const [, navigate] = useLocation();
  const { logout, isAuthenticated, loginWithDiscord, loginWithGithub, user, isLoading } = useAuth();
  // Which third-party providers are actually configured for this host. Defaults
  // to shown so a slow/failed probe never strands the user without a button.
  const [authProviders, setAuthProviders] = useState<{ discord: boolean; github: boolean }>({
    discord: true,
    github: true,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/providers", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ discord?: boolean; github?: boolean }>;
      })
      .then((data) => {
        if (cancelled) return;
        setAuthProviders({ discord: !!data.discord, github: !!data.github });
      })
      .catch(() => {
        /* keep optimistic defaults so sign-in is never fully hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // When onboarding reaches the sign-in moment we no longer silently bounce the
  // user to Replit auth. Instead we surface a choice ("authentication method")
  // so they can opt into connecting their Discord. `authChoice` holds the
  // destination + email hint captured at that moment; the overlay reads it.
  const [authChoice, setAuthChoice] = useState<{ dest: string; hint: string | null } | null>(null);
  const nebulaSize = useNebulaSize();
  // GFX quality toggle — exposed in the top-right of the terminal so
  // visitors on slow phones / integrated GPUs can drop the WebGL nebula
  // for the static 2D fallback during onboarding without digging into
  // settings (the same toggle also lives in Profile for authed users).
  const [lowGfx, setLowGfxValue] = useLowGfx();
  // Boomer mode reskins the whole terminal into a simplified late-70s
  // green-phosphor computer terminal (flat black CRT, monospace, no glow /
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
  // Storyteller mode runs once per user. Gated on the unified tutorial flag
  // so completing the passcode unlock everywhere clears it everywhere.
  // ADDITIONALLY gated by localStorage: once the speech has played for this
  // browser at all (even partially), it never replays. New tabs and cold
  // reloads skip straight to the static passcode prompt. We use
  // localStorage (not sessionStorage) because mobile users were reporting
  // the intro looping every time they reopened the tab.
  const STORY_PLAYED_KEY = "pablo.story_played_v2";
  // Cached server-authoritative assistant persona, so the terminal paints the
  // right identity (Pablo vs Mila) on the first frame before the fetch resolves.
  const PERSONA_CACHE_KEY = "salaryman.persona";
  const [showIntro, setShowIntro] = useState<boolean>(() => !isTutorialDone());
  // The front-door scene opens with the welcome, then quietly yields to the
  // normal nebula once a visitor starts an actual conversation.
  const [frontDoorSceneActive, setFrontDoorSceneActive] = useState(true);
  const [storyIdx, setStoryIdx] = useState(0);
  // Cinematic gateway plate baked by Nano Banana. Loads asynchronously;
  // null until the CDN URL is ready.
  const doorArtUrl = useArtAsset("prop_door");
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

  // IMMIGRATION HAND-OFF GUARD. If the user is already authed but hasn't
  // cleared the immigration desk yet (tutorialDone=false), they must NOT
  // sit on the terminal — Pablo already collected name + email here, and
  // re-asking would be the loop. Push them straight to /immigration so
  // the dedicated intake gate finishes the filing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAuthenticated && !isTutorialDone()) {
      navigate("/immigration", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (showIntro) return;
    // Schedule the first lore drip 5 min after the intro ends; each subsequent
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
  }, [showIntro, fetchLoreDrip]);
  // Pre-seed the "already greeted" flag from localStorage so reloads and
  // new tabs don't restart the storyteller from line 0. The flag is set
  // the moment the first line begins; once it's there, future mounts in
  // ANY tab skip straight to "say the passcode" without re-running the
  // speech. Mobile users were reporting the intro replaying every time
  // they reopened the page; localStorage fixes that for good.
  const introGreetedRef = useRef<boolean>(
    typeof window !== "undefined" && window.localStorage.getItem(STORY_PLAYED_KEY) === "1"
  );
  // Audio unlocks itself the moment the user touches anything (handled by
  // the global armAudioAutoUnlock listener wired in App.tsx). Pablo's voice
  // is on by default and stays on; no manual unlock affordance needed.
  // External handle to cancel the storyteller mid-flight. Flipped to true
  // by the intake-start path so the storyteller's pending TTS chains
  // bail instead of overwriting Pablo's intake replies (name prompt,
  // email prompt) with a stale scripted line.
  const storyCancelledRef = useRef<boolean>(false);
  // True once the intro speech sequence has fully completed (all 3 lines
  // spoken) OR the user is a return visitor (introGreetedRef already
  // true at mount, so no sequence will play). Used by the intro safety
  // net to know when to pre-arm the intake for return visitors.
  const introScriptDoneRef = useRef<boolean>(
    typeof window !== "undefined" && window.localStorage.getItem(STORY_PLAYED_KEY) === "1"
  );
  // True when this Pablo session is in "guided tour" mode — the user came
  // back from landing via Get Started after already speaking the passcode.
  // Skips the storyteller, plays a short reveal, fades into the world.
  const [guidedActive, setGuidedActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return new URLSearchParams(window.location.search).get("guided") === "1"; }
    catch { return false; }
  });
  const guidedRanRef = useRef(false);
  const [revealOverlay, setRevealOverlay] = useState(false);
  // While true, the next user utterance is checked for the passcode before
  // being treated as a normal Pablo command.
  // When the user (still on the intro screen, not yet onboarded) asks Pablo
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
  const autoStartedRef = useRef(false);
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

  const persistOnboarded = useCallback(() => {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
  }, []);

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
            ttsRef.current = speakWithTTS(line, done, done);
          });
          const followUp = "If you have another address, let's hear it.";
          setReply(followUp);
          setStatus("speaking");
          await new Promise<void>((resolve) => {
            const done = () => { ttsRef.current = null; setStatus("idle"); resolve(); };
            ttsRef.current = speakWithTTS(followUp, done, done);
          });
          return false;
        }
        return true;
      } catch {
        return true;
      }
    };
  });

  // Camera/file/URL-vision UI lights up only when ALL of these are true:
  //   * user is authenticated (OAuth runs at the END of intake — pre-auth
  //     means name/email aren't even captured yet)
  //   * the guided tour has run to completion (markTutorialDone, only
  //     fired by the post-OAuth guided sequence on this page)
  //   * the storyteller intro card isn't currently on screen
  //
  // Earlier we keyed off the ONBOARD_KEY localStorage flag, but that flag
  // is set the MOMENT the user engages with intake (beginIntake /
  // switchToVoice / chooseTextMode) — not when onboarding finishes —
  // so the camera was leaking into mid-intake. Auth + tutorial-done is
  // the actual "post-onboarding" signal.
  const hasFinishedOnboarding = isAuthenticated && isTutorialDone() && !showIntro;

  // Try to unlock audio optimistically the moment we mount. If the user
  // arrived at /pablo from a clicked link or a button (the common case
  // — the SALARYMAN logo, the nebula nav button, the get-started CTA),
  // the browser still considers us inside the user's gesture and the
  // unlock succeeds. That makes Pablo greet immediately with his voice
  // instead of sitting silent until the user taps the screen again.
  // armAudioAutoUnlock keeps the existing tap-anywhere fallback alive
  // for cold direct-loads where no gesture is in flight.
  useEffect(() => {
    armAudioAutoUnlock();
    void unlockAudio();
  }, []);

  // Subtle continuous onboarding score. ONLY for new arrivals still in the
  // intro flow (showIntro = !tutorialDone) — returning visitors get no bed.
  // The bed is a singleton that carries seamlessly into /immigration and the
  // post-onboarding office intro, so we only START it and never stop it on
  // unmount; PostOnboardingIntro / the office page own the eventual stop.
  useEffect(() => {
    if (!showIntro) return;
    return ensureOnboardingScore();
  }, [showIntro]);

  const speakLine = useCallback((text: string, after?: () => void) => {
    setStatus("speaking");
    setReply(text);
    ttsRef.current?.cancel();
    const done = () => {
      ttsRef.current = null;
      setStatus("idle");
      after?.();
    };
    ttsRef.current = speakWithTTS(text, done, done);
  }, []);

  // Unlock the door: passcode accepted. Pablo keeps the conversation going
  // right here — he tells the salaryman story, asks for a name, then asks
  // for an email and hands the user off to OAuth. The remaining
  // race/gender/biz/appearance/location onboarding lives in WorldPlay's
  // PabloOnboarding modal, which auto-opens on first arrival at /world/play
  // after auth returns.
  //
  // There is no separate marketing/landing page: the Pablo nebula terminal
  // IS the door in. (A bold /landing Cover page was tried and removed.)
  const askEmailNow = useCallback(() => {
    interviewPhaseRef.current = 'asking-email';
    bumpInterview();
    const known = getSalarymanName() ?? 'friend';
    const line = `Nice to meet you, ${known}. What's a good email for your account?`;
    setReply(line);
    setStatus("speaking");
    // Force text mode for the email step — voice STT mangles "@" and dots.
    // We flip mode directly instead of going through chooseTextMode() to
    // avoid a forward declaration ordering issue inside the callback.
    setMode('text');
    autoListenRef.current = false;
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(line, () => { ttsRef.current = null; setStatus("idle"); }, () => { ttsRef.current = null; setStatus("idle"); });
  }, [bumpInterview]);

  // (Removed beginSalarymanStory, playPuzzleSequence, startPuzzle.
  // The post-passcode story drip and the Simon-says puzzle are gone
  // along with the passcode itself — the user moves directly from the
  // intro question into asking-name → asking-email → OAuth.)

  // Kick off the inline intake. There's no passcode anymore — the user
  // gets here by simply answering Pablo's intro question (or by typing
  // anything during/after the intro). We mark the door unlocked so that
  // any future Pablo flows that depended on `isPasscodeUnlocked` keep
  // working, then transition into the employment-question phase. The
  // intake stays inside the intro UI (showIntro stays true) so the
  // single text input below collects each answer in turn; we only flip
  // showIntro off at the very end, right before the OAuth redirect.
  // Returns true when it spoke the question (caller should NOT then try
  // to parse the user's interrupting input as the answer — they didn't
  // know we were asking yet). Returns false when the question was
  // already on screen / already spoken (return visitor or script
  // already finished), so the caller can fall through and parse.
  const beginIntake = useCallback((): boolean => {
    if (interviewPhaseRef.current !== 'idle') return false;
    persistOnboarded();
    markPasscodeUnlocked();
    // Tell the in-flight intro speech sequence (if any) to stop
    // marching forward. The per-line preemption checks already catch
    // most races, but this flag is a belt-and-suspenders guard for the
    // 280ms inter-line gap where a scheduled setTimeout could otherwise
    // start the next scripted line right after our intake reply lands.
    storyCancelledRef.current = true;

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
        introScriptDoneRef.current = true;
        const ack = `Welcome back, ${cachedName}. Signing you in.`;
        setReply(ack);
        setStatus("speaking");
        ttsRef.current?.cancel();
        // After the greeting, screen the cached email before opening OAuth.
        let fired = false;
        const openModal = () => {
          if (fired) return;
          fired = true;
          ttsRef.current = null;
          const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
          pendingDestinationRef.current = null;
          screenEmailBeforeAdmitRef.current(cachedEmail).then((ok) => {
            if (ok) setAuthChoice({ dest, hint: cachedEmail });
          });
        };
        ttsRef.current = speakWithTTS(ack, openModal, openModal);
        // Hard timeout in case TTS stalls.
        window.setTimeout(openModal, 1800);
        return true;
      }
      // No pending feature — let them chat freely. They'll be nudged
      // to log in only if/when they ask for a tool (wantsTool path).
      interviewPhaseRef.current = 'chatting';
      bumpInterview();
      introScriptDoneRef.current = true;
      const greet = `Hey ${cachedName}. Good to see you. What's on your mind?`;
      setReply(greet);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const done = () => { ttsRef.current = null; setStatus("idle"); };
      ttsRef.current = speakWithTTS(greet, done, done);
      return true;
    }

    // Brand-new visitor (no cached name) → enter the free CHATTING
    // phase, NOT asking-name. The user explicitly asked for Pablo to
    // be able to hold full conversations and act as an encyclopedia
    // before any onboarding happens. Pablo will transition to
    // asking-name once the visitor signals readiness ("let me in",
    // "I'm ready") or volunteers their name. If the user already
    // gave a name on a prior visit but no email, we go straight to
    // asking-email — they're not a new visitor, they're a return
    // visitor partway through, and re-entering the chat would feel
    // like a regression.
    if (!haveName) {
      interviewPhaseRef.current = 'chatting';
    } else {
      setSalarymanName(cachedName); // re-affirm in case storage was thrashed
      interviewPhaseRef.current = 'asking-email';
    }
    bumpInterview();

    // If the intro script never reached the question line (user
    // interrupted early — typed "hi" mid-monologue, etc.), speak the
    // appropriate prompt now so they actually know what we're asking.
    // Without this, their interrupting input gets stored as an
    // accidental name/email they didn't intend to give.
    if (!introScriptDoneRef.current) {
      introScriptDoneRef.current = true;
      // Brand-new visitor going into the free CHATTING phase: do NOT
      // speak QUESTION_LINE and do NOT drop the user's input. The
      // opener ("Hey, I'm Pablo. Ask me anything.") is fluff at this
      // point — the visitor is already asking. If we drop their
      // message here and only speak the opener, their tool request
      // (e.g. "I want to make a phone call") never reaches the
      // wantsTool branch in the chatting handler, so onboarding never
      // fires. Returning false lets sendToPablo continue and process
      // the input through the chatting → wantsTool path. We still
      // speak the asking-email prompt for the partial-return-visitor
      // case (name cached, email missing) — there we DO need to ask.
      if (interviewPhaseRef.current === 'asking-email') {
        const prompt = `What's a good email for your account?`;
        setReply(prompt);
        setStatus("speaking");
        ttsRef.current?.cancel();
        const done = () => { ttsRef.current = null; setStatus("idle"); };
        ttsRef.current = speakWithTTS(prompt, done, done);
        return true;
      }
      // chatting phase — silently drop into chatting and let the
      // caller process the user's input.
      return false;
    }
    return false;
  }, [persistOnboarded, bumpInterview, QUESTION_LINE, isAuthenticated]);

  // Intro form submit. There's no passcode anymore — whatever the user
  // typed is just the next answer in the intake (employment → name →
  // email). We hand it straight to sendToPablo, which routes on the
  // current interview phase. If the user types something before the
  // intro speech ends and we haven't entered intake yet, sendToPablo's
  // showIntro/intake guards take care of it.
  const submitIntro = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    setTranscript(text);
    // The intake form is an UNAMBIGUOUS name request — the field is
    // labeled "NAME ▸ your name" and the placeholder is "your name".
    // Whatever the user types here IS their name. Without this, the
    // generic sendToPablo flow would either:
    //   (a) call beginIntake() because phase is still 'idle', which
    //       speaks the name question and DROPS the user's input — they
    //       have to type their name a SECOND time before anything
    //       happens (reported as "Pablo isn't responsive"), or
    //   (b) route to the chatting branch, which only captures names
    //       with explicit "I'm X" / "my name is X" prefixes — bare
    //       "John" falls through to free-conversation chitchat and
    //       the name is never stored, so the user is stuck in a loop
    //       of Pablo replies that never advance to OAuth.
    // Force phase to asking-name so the name-extraction branch runs
    // on the user's input on the very first submission. Also stop any
    // in-flight greeting TTS so Pablo doesn't keep talking over the
    // intake response.
    storyCancelledRef.current = true;
    setFrontDoorSceneActive(false);
    introScriptDoneRef.current = true;
    ttsRef.current?.cancel();
    ttsRef.current = null;
    // Chat-first intake. The visitor can ask Pablo anything before
    // giving up identity. Force phase to 'chatting' so sendToPablo
    // routes the input to the public LLM endpoint. The chatting
    // branch in sendToPablo opportunistically promotes to asking-name
    // when the user volunteers ("I'm Alex" / "my name is X" / email)
    // or signals readiness ("let me in" / "I'm ready"). Without this
    // override, phase=='idle' would cause beginIntake() to fire and
    // DROP the user's first input.
    if (interviewPhaseRef.current === 'idle') {
      interviewPhaseRef.current = 'chatting';
      bumpInterview();
    }
    void sendToPablo(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  // (Removed onPuzzlePadTap. The Simon-says puzzle is gone.)

  const chooseTextMode = useCallback(() => {
    persistOnboarded();
    setMode("text");
    ttsRef.current?.cancel();
    cleanup();
    setStatus("idle");
    setReply("Text mode on. Type what you need.");
  }, [persistOnboarded, cleanup]);

  // Pablo's greeting — a SINGLE line, fired only on the user's first
  // gesture. An earlier version auto-marched through a long passcode
  // monologue on mount and set the visible text BEFORE TTS started, so on mobile (where
  // audio is locked until a user gesture) the user saw a long monologue
  // scroll past in dead silence. The user described it as "a dialog loop
  // that doesn't speak". Now: nothing visible, nothing audible, until the
  // user touches the screen or presses a key. At that gesture the audio
  // is already unlocked, so we set the caption AND start TTS in the same
  // tick — text and voice arrive together. After the line finishes, the
  // passcode listener arms and (in voice mode) the mic auto-opens.
  // Pablo greets automatically — no "tap to wake" affordance. He also says
  // the passcode out loud and in the caption, so the user doesn't have to
  // solve a riddle. The only thing that can delay him is iOS Safari's
  // audio lock, which the global armAudioAutoUnlock listener clears the
  // instant the user touches *anything* on the page (the road input, a
  // background swipe, a key — anything). We pipe through whenAudioUnlocked
  // so caption text and TTS appear together; we don't add our own gesture
  // listener (the previous build did, and it raced with the global unlock
  // listener: our handler fired first, started TTS into a still-locked
  // SpeechSynthesis, and the user saw text with no voice).
  // The intro greeting is now SEQUENCED — Pablo doesn't dump the whole
  // pitch in one breath any more. He leads the user in: a welcome, a
  // setup line, then the actual passcode reveal. Each line is spoken in
  // order; the *pinned* passcode badge below the caption stays visible
  // throughout so the user never misses the answer even if they tab away
  // during the speech. (User feedback: "Pablo won't tell me the
  // passcode" + "Pablo needs to lead the user into the intro".)
  //
  // No passcode anymore. Pablo's intro now ends with a direct question —
  // any answer (spoken or typed) drops the user into the onboarding
  // intake (employment path → name → email → OAuth). The post-OAuth
  // PabloOnboarding modal in WorldPlay handles deeper biz registration
  // (company name, industry, type) using the bizPath we capture here.
  // INTRO_LINES and QUESTION_LINE are defined at module scope above so
  // beginIntake (declared earlier in the component) can reference
  // QUESTION_LINE without a temporal dead zone error.
  // Caption is shown IMMEDIATELY on mount (no longer gated on greetingStarted),
  // because audio-unlock can take a long time on iOS and on cold loads — and
  // when it stalls, the user used to sit looking at a black nebula with no
  // dialog box, no passcode, no way forward. The TTS is still gated on
  // whenAudioUnlocked, but the *text* should never be — at minimum the user
  // can read the passcode and type it. (User feedback: "doesn't verbally
  // tell me the passcode or write it in the dialog. He needs to speak as
  // a greeting.")
  const greetingFiredRef = useRef(false);
  // Mode is read via a ref so the greeting effect doesn't tear down and
  // re-init when the user (or Pablo) flips voice/text mid-intro. Tearing
  // down used to leak the safety timer — a delayed cancel() could then
  // chop the head off a later, unrelated TTS line and make Pablo seem
  // mute again. (Architect-flagged race.)
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ALWAYS-ON intro-screen safety net (separate from the greeting effect):
  // pins the question line in the dialog bubble whenever the intro is
  // visible, even on a return visit where introGreetedRef is already
  // true and the greeting effect below early-returns. Without this,
  // returning users could see a black nebula with no dialog and no way
  // to know what Pablo expects from them.
  //
  // For return visitors who already cleared the intro once but somehow
  // landed back here (cleared storage, etc.), we also pre-arm the
  // intake at the asking-name phase so their first answer flows
  // straight into the parser instead of being dropped.
  useEffect(() => {
    if (!showIntro) return;
    if (guidedActive) return;
    setReply(prev => prev || QUESTION_LINE);
    if (introGreetedRef.current) {
      introScriptDoneRef.current = true;
      if (interviewPhaseRef.current === 'idle') beginIntake();
    }
    if (modeRef.current === "voice") autoListenRef.current = true;
  }, [showIntro, guidedActive, QUESTION_LINE, beginIntake]);

  useEffect(() => {
    if (!showIntro || introGreetedRef.current) return;
    if (guidedActive) return; // guided tour takes over instead
    let cancelled = false;
    let safetyTimer: number | null = null;

    const fireGreeting = () => {
      if (cancelled || greetingFiredRef.current) return;
      greetingFiredRef.current = true;
      introGreetedRef.current = true;
      try { window.localStorage.setItem(STORY_PLAYED_KEY, "1"); } catch {}
      setStatus("speaking");
      ttsRef.current?.cancel();
      // Sequenced greeting: walk INTRO_LINES, swapping the caption to the
      // line we're about to speak BEFORE TTS starts so audio + text stay
      // in sync (same contract the previous single-line version honored).
      // The passcode-bearing line is last; the always-on safety net's
      // QUESTION_LINE fallback in the safety net keeps it pinned in the bubble
      // after the sequence finishes.
      //
      // Race-safety contract (architect-flagged):
      //   - Each line owns its own TTS handle (`lineHandle`) captured
      //     in the closure. Timers only operate on lineHandle, never on
      //     the global `ttsRef.current` — that prevents a stale per-line
      //     timer from cross-cancelling an unrelated TTS that started
      //     after the user interrupted us.
      //   - If we detect ttsRef.current has changed out from under us
      //     (sendToPablo / passcode-unlock / mode-flip preempted the
      //     sequence), we mark `cancelled = true` and bail without
      //     touching status — the new owner manages that.
      //   - Per-line safety timers ONLY fire if the line is still ours
      //     AND hasn't already advanced. This eliminates the 5-14s
      //     "stuck on line 1" stall the architect identified.
      let perLineSafety: number | null = null;
      const speakIndex = (i: number) => {
        if (cancelled) return;
        // External intake-started signal: if Pablo's intake fired (any user
        // input during the intro), stop the scripted lines from advancing
        // so we don't stomp the asking-employment ack with the next intro
        // line during the 280ms inter-line gap.
        if (storyCancelledRef.current) { cancelled = true; return; }
        if (i >= INTRO_LINES.length) {
          // Sequence complete: clear timers, return to idle, arm passcode.
          // Mark the script as done so the brush-off branch in
          // sendToPablo stops firing — from this moment on, the user
          // can chat with Pablo freely while the passcode card stays
          // pinned on screen.
          if (perLineSafety !== null) { window.clearTimeout(perLineSafety); perLineSafety = null; }
          if (safetyTimer !== null) { window.clearTimeout(safetyTimer); safetyTimer = null; }
          ttsRef.current = null;
          setStatus("idle");
          introScriptDoneRef.current = true;
          if (modeRef.current === "voice") autoListenRef.current = true;
          return;
        }
        const line = INTRO_LINES[i];
        setReply(line);
        setStatus("speaking");
        let advanced = false;
        // We assign lineHandle BEFORE calling speakWithTTS isn't possible
        // (it returns the handle), so we use a let + closure read — both
        // `advance` and the per-line timer fire asynchronously, so by
        // the time they read `lineHandle` it has been assigned.
        let lineHandle: ReturnType<typeof speakWithTTS> | null = null;
        const advance = () => {
          if (advanced || cancelled) return;
          advanced = true;
          if (perLineSafety !== null) { window.clearTimeout(perLineSafety); perLineSafety = null; }
          // External preemption check: if ttsRef no longer points at our
          // line handle, somebody (sendToPablo, passcode-accept TTS,
          // mode-flip) has taken the floor. Abort the sequence quietly
          // and don't touch status — the new owner is in charge.
          if (lineHandle !== null && ttsRef.current !== lineHandle) {
            cancelled = true;
            return;
          }
          // Tiny breath between lines so they don't collide as one rush.
          // Re-check ownership inside the breath: external code (an
          // interrupt landing in this 280ms window) may have grabbed
          // ttsRef *after* our just-finished line released it. Without
          // this guard the next line would start, rebind ttsRef, and
          // stomp the new owner — overlapping audio + UI ownership theft
          // (architect-flagged "280ms gap" race).
          window.setTimeout(() => {
            if (cancelled) return;
            if (lineHandle !== null && ttsRef.current !== lineHandle) {
              cancelled = true;
              return;
            }
            speakIndex(i + 1);
          }, 280);
        };
        const cap = Math.max(5000, Math.min(14000, line.length * 70 + 2200));
        perLineSafety = window.setTimeout(() => {
          if (cancelled || advanced) return;
          // Only cancel OUR line's TTS — never the global ttsRef, which
          // may have been rebound to an unrelated, more recent handle
          // by an external interrupt.
          if (lineHandle !== null && ttsRef.current === lineHandle) {
            try { lineHandle.cancel(); } catch {}
          }
          advance();
        }, cap) as unknown as number;
        lineHandle = speakWithTTS(line, advance, advance);
        ttsRef.current = lineHandle;
      };
      // Master cap — protects the whole sequence in case per-line caps
      // somehow chain into a runaway. Generous because it covers all 3.
      // Mirrors the per-line timer's "only cancel if still ours" rule
      // by using the same ttsRef-identity check via a captured token
      // (lineHandle isn't in scope here, so we just no-op the cancel
      // and rely on speakIndex's own preemption check on next tick).
      safetyTimer = window.setTimeout(() => {
        if (cancelled) return;
        cancelled = true;
        if (perLineSafety !== null) { window.clearTimeout(perLineSafety); perLineSafety = null; }
        // Don't touch ttsRef here — if the sequence is still running,
        // speakIndex's preemption check handles abort. If something
        // else owns ttsRef, we shouldn't yank it.
        setStatus("idle");
        // Master safety fired: the sequence is done (one way or
        // another). Treat the script as complete so brush-offs in
        // sendToPablo don't strand the user "Quiet, I'm setting the
        // scene" forever after a TTS stall. Architect-flagged.
        introScriptDoneRef.current = true;
        if (modeRef.current === "voice") autoListenRef.current = true;
      }, 45_000) as unknown as number;
      speakIndex(0);
    };

    // Try right away (desktop, or any visit where audio was unlocked
    // earlier in the session). On a cold iOS visit this just queues until
    // the user taps anything — including the road input itself.
    const cancelWait = whenAudioUnlocked(fireGreeting);

    // Hard fallback: if audio never unlocks (user truly does nothing for
    // 12 s) we still need to let them in. Silently arm the passcode
    // listener and the mic so the road input + voice still work, even if
    // Pablo never gets to speak. Without this, a stuck-locked iOS would
    // leave the page completely inert.
    const muteFallback = window.setTimeout(() => {
      if (cancelled || greetingFiredRef.current) return;
      if (modeRef.current === "voice") autoListenRef.current = true;
    }, 12_000);

    return () => {
      cancelled = true;
      cancelWait();
      window.clearTimeout(muteFallback);
      if (safetyTimer !== null) { window.clearTimeout(safetyTimer); safetyTimer = null; }
      // Only cancel TTS if we ourselves haven't yet taken ownership of
      // ttsRef. Otherwise a remount could chop off a later, unrelated
      // line (passcode-accept, puzzle, story drip) and Pablo "goes mute".
      if (greetingFiredRef.current === false) ttsRef.current?.cancel();
    };
  }, [showIntro, guidedActive]);

  // Guided tour: triggered when user comes back to /pablo?guided=1 from the
  // landing page after speaking the passcode. Pablo plays a short reveal
  // sequence, fades the nebula into the office artwork, then drops them
  // into the world. This is the ONLY path that marks tutorial-done — the
  // passcode alone never opens the terminal.
  useEffect(() => {
    if (!guidedActive || guidedRanRef.current) return;
    if (!isPasscodeUnlocked()) {
      // Someone hit ?guided=1 without the passcode. Treat as fresh visit.
      setGuidedActive(false);
      return;
    }
    guidedRanRef.current = true;
    autoListenRef.current = false;
    setShowIntro(false);

    const TOUR_LINES = [
      "Knew you'd come back.",
      "Watch this.",
      "Welcome to the office. It's loud, it's pink, and it's yours.",
      "Pick a face, pick a fit. Let's move.",
    ];

    let cancelled = false;
    const speakIdx = (i: number) => {
      if (cancelled) return;
      if (i >= TOUR_LINES.length) {
        // Reveal: fade nebula → office, then enter
        setRevealOverlay(true);
        setTimeout(() => {
          if (cancelled) return;
          markTutorialDone();
          navigate("/office");
        }, 1500);
        return;
      }
      // Trigger overlay reveal partway through the tour for a felt transition
      if (i === 2) setRevealOverlay(true);
      const line = TOUR_LINES[i];
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const next = () => {
        if (cancelled) return;
        ttsRef.current = null;
        setTimeout(() => speakIdx(i + 1), 700);
      };
      ttsRef.current = speakWithTTS(line, next, next);
    };
    speakIdx(0);

    return () => {
      cancelled = true;
      ttsRef.current?.cancel();
    };
  }, [guidedActive, navigate]);

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
    // Explicit character wins (e.g. a Pablo intrusion during Mila mode); else
    // Mila uses her voice, and Pablo falls through to the unchanged default.
    const voice = character ?? (personaRef.current === "mila" ? "MILA" : undefined);
    const done = () => { ttsRef.current = null; resolve(); };
    ttsRef.current = speakWithTTS(text, done, done, voice ? { character: voice } : undefined);
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
    if (showIntro) setFrontDoorSceneActive(false);
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
      // Screen the cached email before committing to OAuth. Run async then
      // open the modal if cleared — the closing line plays while we wait.
      setReply(closingLine);
      setStatus('speaking');
      ttsRef.current?.cancel();
      let fired = false;
      let timerId: number | undefined;
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
      pendingDestinationRef.current = null;
      const openModal = () => {
        if (fired) return;
        fired = true;
        if (timerId !== undefined) window.clearTimeout(timerId);
        ttsRef.current = null;
        // Screen the email; open modal on pass, deflect in-character on block.
        screenEmailBeforeAdmitRef.current(cachedEmail).then((ok) => {
          if (ok) setAuthChoice({ dest, hint: cachedEmail });
        });
      };
      ttsRef.current = speakWithTTS(closingLine, openModal, openModal);
      timerId = window.setTimeout(openModal, 2200);
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
    // gets a chance to invent a /api/login navigate that would loop
    // through our new pre-onboarding gate.
    if (!isAuthenticated && detectSignInIntent(text)) {
      ttsRef.current?.cancel();
      ttsRef.current = null;
      // Honor a destination they asked Pablo for earlier in the same
      // session — otherwise default to the immigration desk (Pablo's
      // post-OAuth intake gate, outside GameLock). We deliberately do
      // NOT default to /world/play here: non-owner accounts can't pass
      // the city lock and would bounce back into the loop. Pass through
      // the sanitizer so a tampered or LLM-malformed pendingDestination
      // can never poison the OAuth returnTo.
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
      pendingDestinationRef.current = null;
      // Pre-fill the OAuth login_hint with their cached email when we
      // have one on file — returning players shouldn't retype it.
      const cachedEmail = (getSalarymanEmail() ?? '').trim();
      const hint = isLikelyEmail(cachedEmail) ? cachedEmail : null;
      const ack = "This way. Hold tight.";
      setReply(ack);
      setStatus("speaking");
      const goLogin = () => {
        setAuthChoice({ dest, hint });
      };
      ttsRef.current = speakWithTTS(ack, goLogin, goLogin);
      // Hard timeout in case TTS stalls (mic locked, ElevenLabs slow):
      // we still want the redirect to fire so the user isn't stranded.
      window.setTimeout(goLogin, 1800);
      return;
    }

    // No more passcode. While the intro card is up, ANY user input —
    // spoken or typed — drops them into the inline intake. If the
    // intro script never finished asking the question (user typed
    // "hi" mid-monologue), beginIntake speaks the question now and
    // returns true; we then DROP the interrupting input — they didn't
    // know we were asking yet, parsing it as the answer was the source
    // of the "Couldn't tell" loop. If the question was already on
    // screen (script done, or return visitor), beginIntake returns
    // false and we fall through to parse this input as the answer.
    if (showIntro && interviewPhaseRef.current === 'idle') {
      // The user typed something before we asked. beginIntake will
      // either speak the name question (and we DROP this input — they
      // didn't know we were asking yet, parsing it as a name would
      // store junk) or it'll fall through (return false) when the
      // intro script already finished asking, in which case the input
      // IS their name and we let it flow into asking-name below.
      const spokeQuestion = beginIntake();
      if (spokeQuestion) return;
      // fall through into the asking-name branch below
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
    // them into intake; we fall straight through to the authed terminal flow
    // (api/chat/pablo/command below) so Pablo just answers them in the terminal.
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
        if (admitIfKnown(known ? `Cleared, ${known}. Heading in.` : "Cleared. Heading in.")) return;
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
        if (admitIfKnown(known ? `On it, ${known}. Heading in.` : "On it. Heading in.")) return;
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
          ttsRef.current = speakWithTTS(said, done, done);
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
        ttsRef.current = speakWithTTS(combined, done, done);
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
        const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
        pendingDestinationRef.current = null;
        const goLogin = () => {
          if (fired) return;
          fired = true;
          if (timerId !== undefined) window.clearTimeout(timerId);
          ttsRef.current = null;
          setAuthChoice({ dest, hint: inlineEmail });
        };
        ttsRef.current = speakWithTTS(line, goLogin, goLogin);
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
      ttsRef.current = speakWithTTS(ack, () => { ttsRef.current = null; askEmailNow(); }, () => { ttsRef.current = null; askEmailNow(); });
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
      const known = getSalarymanName() ?? 'salaryman';
      const line = `Cleared, ${known}. Heading in.`;
      setReply(line);
      setStatus("speaking");
      ttsRef.current?.cancel();
      // Single-shot redirect (TTS callback OR 2.2s fallback, never both).
      // Capture dest/hint ONCE — a second invocation would otherwise see
      // pendingDestinationRef nulled and recompute /immigration, racing
      // the first window.location.href assignment.
      let fired = false;
      let timerId: number | undefined;
      const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
      pendingDestinationRef.current = null;
      const goLogin = () => {
        if (fired) return;
        fired = true;
        if (timerId !== undefined) window.clearTimeout(timerId);
        ttsRef.current = null;
        setAuthChoice({ dest, hint: email });
      };
      ttsRef.current = speakWithTTS(line, goLogin, goLogin);
      timerId = window.setTimeout(goLogin, 2200);
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

      // INTRO GATE: if the user hasn't been onboarded yet (passcode → puzzle
      // → name → email → OAuth) and Pablo decided to send them somewhere,
      // do NOT navigate / open / log out now. Auth-gated routes either
      // crash on missing user data or redirect through login with no
      // context — both look like a black screen to the user.
      //
      // We can't key the gate to `showIntro` alone, because `showIntro`
      // flips false the moment the passcode is accepted, even though the
      // user is still mid-puzzle / mid-name / mid-email and has no session
      // yet. So we treat the user as pre-onboarded any time they aren't
      // signed in OR the interview is still running OR the puzzle is up
      // OR the intro card is up. While that holds:
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
        showIntro ||
        interviewPhaseRef.current !== 'idle';
      if (isPreOnboarding && action) {
        if (action.kind === "navigate") {
          // Never stash a server/auth path as a destination — that becomes
          // the OAuth `returnTo` later, and pointing returnTo back at
          // /api/login or any /api/* endpoint creates a redirect loop or
          // a 404 page. If the LLM picked one of those (or anything
          // weirder, like a protocol-relative `//evil.com` open-redirect
          // bait), drop the path and let OAuth bounce them to the
          // default (/world/play).
          const safePath = sanitizeReturnPath(action.path);
          if (safePath) pendingDestinationRef.current = safePath;
          say = `${say.replace(/\s+$/, "")} But immigration first — the city's sealed under gas. Just your name and email, I process your paperwork, then I drop you straight there.`;
        } else if (action.kind === "search") {
          pendingDestinationRef.current = `/?q=${encodeURIComponent(action.query)}`;
          say = `${say.replace(/\s+$/, "")} But immigration first — name and email, I process your paperwork, then I drop you on that search.`;
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
        // Reset Pablo's loop: wipe onboarding + history so next session starts fresh.
        try { localStorage.removeItem(ONBOARD_KEY); } catch {}
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
  }, [history, navigate, speak, speakLine, mode, chooseTextMode, persistOnboarded, logout, showIntro, beginIntake, askEmailNow, isAuthenticated]);

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

  // On first mount: if there's no intro to play, start listening right away.
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (!showIntro && mode === "voice") autoListenRef.current = true;
  }, [showIntro, mode]);

  const switchToText = useCallback(() => chooseTextMode(), [chooseTextMode]);
  const switchToVoice = useCallback(() => {
    persistOnboarded();
    setMode("voice");
    ttsRef.current?.cancel();
    setStatus("idle");
    autoListenRef.current = true;
  }, [persistOnboarded]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center overflow-y-auto${boomerMode ? " boomer-terminal" : ""}`}
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
      }}
    >
      {showIntro && frontDoorSceneActive && (
        <CinematicScene scene="front-door" testId="pablo-frontdoor-scene" />
      )}
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
              // The arrival plate sits behind Pablo. On 2D/WebGL-fallback
              // browsers the oversized orb otherwise fills every pixel with
              // violet and visually erases that scene, so the welcome starts
              // as a layered composition instead of a purple void.
              opacity: showIntro && frontDoorSceneActive ? 0.32 : 1,
              transition: "opacity 900ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            <NebulaErrorBoundary fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
              <PabloNebula3D status={status} size={nebulaSize} variant={persona === "mila" ? MILA_VARIANT : PABLO_VARIANT} />
            </NebulaErrorBoundary>
          </div>
        )}
      </button>

      {/* Unified house grade — lays the same CRT scanline/grain/vignette skin
          over the smooth 3D nebula so it reads as part of the same world as the
          pixel office and cutscenes instead of a separate "spectral" layer.
          Fixed + pointer-events-none so it never blocks the orb click target.
          Always on now that the nebula always renders, so the orb reads as part
          of the same world as the pixel office and cutscenes. */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        <SceneFX intensity="subtle" />
      </div>

      {/* GFX quality toggle. Top-right corner, always reachable during the
          checkpoint / onboarding flow (and after) so visitors on weak GPUs
          or older phones can drop the animated WebGL nebula in favor of
          the cheap 2D radial-gradient fallback without leaving the page.
          Stops propagation so the click doesn't also wake the mic via the
          full-bleed orb button underneath. */}
      {!boomerMode && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setLowGfxValue(!lowGfx); }}
        className="fixed z-30 right-3 sm:right-4 pointer-events-auto px-2.5 py-1 rounded-full border bg-black/60 backdrop-blur text-[10px] sm:text-[11px] tracking-[0.22em] text-pink-200 hover:text-pink-100 transition-colors"
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          borderColor: lowGfx ? "rgba(236,72,153,0.55)" : "rgba(236,72,153,0.30)",
          boxShadow: lowGfx ? "0 0 12px rgba(236,72,153,0.25)" : "none",
          // Pull below iOS notch / Android status bar so the time + battery icons
          // never sit on top of the GFX toggle. 12px floor on devices with no
          // safe-area inset (desktop, older Android).
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        }}
        aria-pressed={lowGfx}
        title={lowGfx ? "Low graphics on — tap for high" : "High graphics — tap for low (recommended on slow phones)"}
        data-testid="pablo-gfx-toggle"
      >
        GFX · {lowGfx ? "LO" : "HI"}
      </button>
      )}

      {/* Guided-tour reveal overlay: nebula art cross-fades into the office
          artwork as Pablo narrates "watch this". Pixel-art frame stays hot-pink
          to preserve the Akira aesthetic. */}
      {guidedActive && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            opacity: revealOverlay ? 1 : 0,
            transition: "opacity 1400ms cubic-bezier(.22,1,.36,1)",
            backgroundImage:
              "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%), url('/api/art/asset/scene_office')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            imageRendering: "pixelated",
            mixBlendMode: "screen",
            filter: "saturate(1.15) contrast(1.05)",
          }}
        />
      )}
      {guidedActive && revealOverlay && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 6,
            pointerEvents: "none",
            background:
              "linear-gradient(180deg, rgba(244,114,182,0) 0%, rgba(244,114,182,0.08) 50%, rgba(56,189,248,0.10) 100%)",
            mixBlendMode: "overlay",
            animation: "salaryPulse 1.4s ease-out 1",
          }}
        />
      )}

      {/* Minimal top header — logo + visible TEXT/VOICE toggle + exit. Sits
          above the nebula via z-10 so it stays clickable. The header itself
          gets extra horizontal padding on mobile so the logo + buttons clear
          the curved corners + camera bumps of modern phones, and the
          GFX/status pills (which are fixed) get their own safe-area padding
          above. We also push the whole header down so it sits BELOW the
          GFX/status pills row instead of fighting them for the top edge. */}
      <header
        className="relative z-10 w-full flex items-center justify-between gap-2 px-4 sm:px-6 pb-2.5 sm:pb-4 shrink-0"
        style={{
          // GFX/status pills already eat ~32px below the inset. Push the
          // header below that so its logo + buttons don't collide with them.
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)",
        }}
      >
        {/* SALARYMAN logo behaviour:
            - Pre-onboarding (storyteller intro / unauthenticated): stays on
              the terminal so the visitor can't escape the onboarding funnel.
            - Post-onboarding (authenticated + tutorial done): jump back into
              the live world/play surface. The user explicitly asked for the
              icon to "return back to the terminal" — i.e. their actual
              destination, not the marketing page they no longer need. */}
        <Link
          href={hasFinishedOnboarding ? "/office" : "/pablo"}
          className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
          data-testid="link-logo-loop"
        >
          <PicassoLogo size={20} gap={2} glow />
          <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
            SALARYMAN
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Post-onboarding only: small WORLD + OFFICE entry pills so the
              terminal isn't a one-way trip. The user asked for "office
              experience straight from terminal like a surveillance tool for
              working bots" plus a way back to the world — these two pills
              cover both, gated on hasFinishedOnboarding so brand-new visitors
              don't get to bypass the intake. */}
          {hasFinishedOnboarding && (
            <>
              <Link
                href="/game/map"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-400/40 bg-black/60 hover:bg-emerald-500/15 text-emerald-200 text-[10px] tracking-[0.3em] font-mono transition-colors"
                title="Minx City visitor map"
                data-testid="pablo-nav-map"
              >
                <MapIcon className="w-3 h-3" />
                MAP
              </Link>
              {/* Mobile: icon-only version of MAP so it fits on a narrow
                  header without crowding TEXT/VOICE off-screen. */}
              <Link
                href="/game/map"
                className="sm:hidden inline-flex items-center justify-center w-8 h-8 rounded border border-emerald-400/40 bg-black/60 text-emerald-200"
                title="Minx City visitor map"
                aria-label="Minx City visitor map"
                data-testid="pablo-nav-map-mobile"
              >
                <MapIcon className="w-3.5 h-3.5" />
              </Link>
            </>
          )}
          {/* Always-visible sign-in affordance for returning users. The
              front door is a fullscreen route with no NavBar, so without
              this button a logged-out visitor has no obvious way to log in
              — they'd have to know to TYPE "log in" to Pablo. Opens the
              same APPLY FOR A VISA modal (Replit + Discord) the chat funnel
              uses, so the actual OAuth path is identical and well-tested. */}
          {!isLoading && !isAuthenticated && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAuthChoice({ dest: "/immigration", hint: null }); }}
              data-testid="pablo-sign-in"
              className="px-2.5 py-1 rounded border border-cyan-400/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-[10px] tracking-[0.3em] font-mono transition-colors flex items-center gap-1.5"
              title="Sign in"
            >
              <LogIn className="w-3 h-3" />
              SIGN IN
            </button>
          )}
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
            className="px-2.5 py-1 rounded border border-pink-400/40 bg-black/60 hover:bg-pink-500/15 text-pink-200 text-[10px] tracking-[0.3em] font-mono transition-colors flex items-center gap-1.5"
            title={mode === "text" ? "Switch to voice" : "Switch to text"}
          >
            {mode === "text" ? <Mic className="w-3 h-3" /> : <Send className="w-3 h-3" />}
            {mode === "text" ? "VOICE" : "TEXT"}
          </button>
          {hasFinishedOnboarding && (
            <HummingBirdAttachStrip toolKey="pablo-terminal" buttonStyle="icon" pickerTitle="ATTACH AUDIO TO COMMAND" />
          )}
          {/* No exit X — the SALARYMAN logo at the top-left already routes
              back to landing, so a second exit affordance is redundant and
              was causing a black-screen flash on mobile during the intro. */}
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

      {/* Storyteller intro: spoken-line caption + passcode entry. Renders
          only on first visit; passcode unlock dismisses it forever. */}
      {showIntro && (
        <div
          className="absolute inset-x-0 bottom-0 px-4 sm:px-8 flex flex-col items-center gap-2 sm:gap-3 pointer-events-none"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {/* Caption: only renders once Pablo has actually started speaking.
              Before the user's first gesture we show NOTHING up here — the
              previous build set the speech text on mount, so on iOS (where
              audio is locked until a user gesture) the caption scrolled past
              in silence and felt like a broken dialog loop. Now: gesture
              fires the greeting, audio plays, and the caption appears in
              sync. After the line finishes the bubble keeps showing Pablo's
              latest reply during normal conversation. */}
          {(() => {
            // Always show a Pablo bubble during the intro — even before
            // his greeting fires (audio locked on iOS until first gesture,
            // screenshot/preview environments with no audio device,
            // network blip on the TTS, etc.). Without a guaranteed
            // caption the page reads as "no welcome message or
            // instructions" — purple void with only a tiny NAME chip.
            // Fall back to the welcome + instructions until Pablo
            // actually says something. This MUST be the neutral pinned
            // caption (QUESTION_LINE), never a self-introduction: `reply`
            // is cleared to "" by many handlers, so a self-intro fallback
            // re-renders as Pablo re-introducing himself on every turn —
            // the "free assistant" intro loop. QUESTION_LINE is short,
            // in-character, and safe to re-pin indefinitely.
            const lineText = reply || QUESTION_LINE;
            const p = persona === "mila"
              ? {
                  border: "rgba(45,212,191,0.55)",
                  glow: "rgba(45,212,191,0.30)",
                  label: "rgb(153,246,228)",
                  bar: "#2dd4bf",
                }
              : {
                  border: "rgba(236,72,153,0.55)",
                  glow: "rgba(236,72,153,0.32)",
                  label: "rgb(251,207,232)",
                  bar: "#ec4899",
                };
            const isSpeaking = status === "speaking";
            return (
              <div
                className="pointer-events-auto w-full max-w-2xl rounded-lg bg-black/75 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 relative overflow-hidden"
                style={{ borderWidth: 1, borderStyle: "solid", borderColor: p.border, boxShadow: `0 0 32px ${p.glow}` }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-mono tracking-[0.3em]"
                      style={{ color: p.label }}
                    >
                      {personaLabel}
                    </span>
                    {isSpeaking && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: p.bar, boxShadow: `0 0 6px ${p.bar}` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
                <motion.p
                  key={lineText.slice(0, 32)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="text-zinc-100 text-sm sm:text-lg leading-snug sm:leading-relaxed"
                  style={{ textShadow: `0 0 14px ${p.glow}` }}
                >
                  {lineText}
                </motion.p>
              </div>
            );
          })()}

          {/* The pinned intake "chip" was removed: it repeated, in tiny
              cryptic monospace, the same prompt the input placeholder and
              the plain instruction below already state clearly. Two copies
              of the same ask in different wording is exactly the kind of
              competing text that trips up anyone who reads slowly, so the
              single clear input + instruction now carries it. */}

          {/* The ROAD IN. A single text input that submits whatever the
              user typed straight to Pablo. The first submission kicks
              off the intake at the asking-name phase; subsequent
              submissions answer email in turn, then hand off to OAuth.
              Voice works the same way — the mic auto-opens after Pablo
              finishes speaking and a recognised utterance flows
              through the same pipe. */}
          <div className="pointer-events-auto w-full max-w-2xl">
            <form
              onSubmit={(e) => { e.preventDefault(); submitIntro(); }}
              className="flex items-stretch gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  interviewPhaseRef.current === 'asking-name' ? "Type your name"
                    : interviewPhaseRef.current === 'asking-email' ? "Type your email"
                    : "Type your message"
                }
                className="flex-1 bg-black/60 border-2 rounded-xl px-4 py-3 text-base text-pink-50 placeholder:text-pink-300/45 outline-none transition-colors"
                style={{ borderColor: "rgba(236,72,153,0.5)" }}
                data-testid="pablo-intro-text-input"
                autoFocus
              />
              <button
                type="submit"
                disabled={!textInput.trim() || status === "thinking"}
                data-testid="pablo-intake-enter"
                className="shrink-0 inline-flex items-center gap-2 px-5 rounded-xl border-2 border-pink-400/70 bg-pink-500/15 text-pink-50 hover:bg-pink-500/25 disabled:opacity-30 text-base font-semibold transition-colors"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
            {mode !== "text" && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOrbClick(); }}
                  data-testid="pablo-talk-button"
                  aria-label="Tap to talk to Pablo"
                  className="pointer-events-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full border-2 bg-pink-500/15 hover:bg-pink-500/25 active:bg-pink-500/30 text-pink-50 text-base sm:text-lg font-semibold transition-colors"
                  style={{
                    borderColor: status === "listening" ? "rgba(103,232,249,0.85)" : "rgba(236,72,153,0.75)",
                    boxShadow: status === "listening" ? "0 0 26px rgba(103,232,249,0.40)" : "0 0 18px rgba(236,72,153,0.25)",
                  }}
                >
                  <Mic className={`w-5 h-5 ${status === "listening" ? "animate-pulse" : ""}`} />
                  {status === "listening" ? "Listening — tap to stop"
                    : status === "thinking" ? "One moment…"
                    : "Tap to talk"}
                </button>
              </div>
            )}
            <div className="text-pink-100/80 text-sm sm:text-base mt-3 text-center leading-snug">
              {mode !== "text"
                ? "Tap the button and talk, or type in the box above."
                : "Type your message in the box, then press Send."}
            </div>
          </div>
        </div>
      )}

      {/* POST-ONBOARDING reply bubble. The storyteller intro caption is
          gated on showIntro and disappears the moment onboarding completes,
          which left the post-onboarding terminal with NO visible surface
          for Pablo's responses — if TTS was locked (iOS audio policy, slow
          ElevenLabs, low-volume device) the user spoke to the orb and
          appeared to get nothing back. This bubble fills that gap: it
          shows the user's transcript + Pablo's reply text whenever there's
          activity in the terminal post-intro, regardless of TTS state. */}
      {!showIntro && (transcript || reply || status === "thinking") && (
        <div
          className="absolute inset-x-0 px-4 sm:px-8 flex flex-col items-center gap-2 pointer-events-none z-10"
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
      {!showIntro && !reply && !transcript && idleLine && mode !== "text" && (
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
                    className="px-2.5 py-1 rounded border border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-200 text-[10px] font-mono tracking-[0.18em]"
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

      {/* POST-ONBOARDING voice control. Returning users in voice mode used
          to have no visible way to talk — they had to somehow know to tap
          the (invisible) full-bleed nebula. This surfaces the same clear,
          labeled button the intro uses, so the action is never hidden. */}
      {!showIntro && mode !== "text" && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 px-4 w-full pointer-events-none z-20"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOrbClick(); }}
            data-testid="pablo-talk-button-main"
            aria-label="Tap to talk to Pablo"
            className="pointer-events-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full border-2 bg-pink-500/15 hover:bg-pink-500/25 active:bg-pink-500/30 text-pink-50 text-base sm:text-lg font-semibold transition-colors"
            style={{
              borderColor: status === "listening" ? "rgba(103,232,249,0.85)" : "rgba(236,72,153,0.75)",
              boxShadow: status === "listening" ? "0 0 26px rgba(103,232,249,0.40)" : "0 0 18px rgba(236,72,153,0.25)",
            }}
          >
            <Mic className={`w-5 h-5 ${status === "listening" ? "animate-pulse" : ""}`} />
            {status === "listening" ? "Listening — tap to stop"
              : status === "thinking" ? "One moment…"
              : "Tap to talk"}
          </button>
          <div className="pointer-events-none text-pink-100/75 text-sm text-center leading-snug">
            Tap the button and talk, or switch to typing up top.
          </div>
        </div>
      )}

      {/* Text-mode input — only shown when user explicitly switches to text */}
      {mode === "text" && !showIntro && (
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
            placeholder="Type a command…"
            className="flex-1 bg-zinc-950/70 border border-zinc-800 focus:border-purple-500/60 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
            autoFocus
            data-testid="pablo-text-input"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status === "thinking"}
            className="px-3 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors"
            aria-label="Send"
            data-testid="pablo-text-send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Silent error indicator — tiny, doesn't interrupt the nebula */}
      {error && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-red-400/60 tracking-wider">{error}</div>
      )}

      {/* Pablo's eyes: only AFTER the user has fully cleared onboarding
          (passcode + intake → ONBOARD_KEY persisted). Hiding showIntro
          alone wasn't enough — the storyteller can finish without the
          intake completing, and we'd surface a camera prompt mid-flow.
          Camera + file + URL go live exclusively post-onboarding. */}
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
            }}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              style={{
                background: "#0a0a0b", border: "1px solid rgba(56,189,248,0.2)",
                padding: "2.25rem 1.75rem", maxWidth: 360, width: "90%", textAlign: "center",
                boxShadow: "0 0 40px rgba(56,189,248,0.06)",
              }}
            >
              <div style={{
                fontFamily: "'VT323', monospace", fontSize: "1.5rem", color: "#38bdf8",
                letterSpacing: "0.2em", marginBottom: "6px", textShadow: "0 0 15px rgba(56,189,248,0.3)",
              }}>
                APPLY FOR A VISA
              </div>
              <div style={{
                width: "60px", height: "1px", margin: "0 auto 16px",
                background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)",
              }} />
              <div style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: "0.62rem",
                color: "rgba(56,189,248,0.45)", letterSpacing: "0.08em", lineHeight: 1.7, marginBottom: "22px",
              }}>
                Choose how you sign in. Connect Discord and we'll route you to your nearest SALARYMAN city server.
              </div>

              <button
                onClick={() => {
                  const c = authChoice;
                  if (!c) return;
                  const ret = encodeURIComponent(c.dest);
                  const hint = c.hint ? `&login_hint=${encodeURIComponent(c.hint)}` : "";
                  window.location.href = `/api/login?returnTo=${ret}${hint}`;
                }}
                style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: "0.75rem", color: "#38bdf8",
                  border: "1px solid rgba(56,189,248,0.5)", padding: "10px 32px",
                  background: "rgba(56,189,248,0.08)", cursor: "pointer", letterSpacing: "0.15em",
                  width: "100%", transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(56,189,248,0.15)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.7)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(56,189,248,0.08)"; e.currentTarget.style.borderColor = "rgba(56,189,248,0.5)"; }}
              >
                SIGN IN
              </button>

              {authProviders.discord && (
              <button
                onClick={() => {
                  const c = authChoice;
                  if (!c) return;
                  loginWithDiscord(c.dest);
                }}
                style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: "0.72rem", color: "#fff",
                  border: "1px solid #5865F2", padding: "10px 32px", marginTop: "10px",
                  background: "#5865F2", cursor: "pointer", letterSpacing: "0.12em",
                  width: "100%", transition: "all 0.2s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#4752c4"; e.currentTarget.style.borderColor = "#4752c4"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#5865F2"; e.currentTarget.style.borderColor = "#5865F2"; }}
              >
                <svg width={16} height={16} viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
                  <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
                </svg>
                CONNECT WITH DISCORD
              </button>
              )}

              {authProviders.github && (
              <button
                onClick={() => {
                  const c = authChoice;
                  if (!c) return;
                  loginWithGithub(c.dest);
                }}
                style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: "0.72rem", color: "#e6edf3",
                  border: "1px solid rgba(230,237,243,0.4)", padding: "10px 32px", marginTop: "10px",
                  background: "rgba(230,237,243,0.08)", cursor: "pointer", letterSpacing: "0.12em",
                  width: "100%", transition: "all 0.2s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "10px",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(230,237,243,0.18)"; e.currentTarget.style.borderColor = "rgba(230,237,243,0.7)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(230,237,243,0.08)"; e.currentTarget.style.borderColor = "rgba(230,237,243,0.4)"; }}
              >
                <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                CONTINUE WITH GITHUB
              </button>
              )}

              <button
                onClick={() => setAuthChoice(null)}
                style={{
                  fontFamily: "'Share Tech Mono', monospace", fontSize: "0.55rem",
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
