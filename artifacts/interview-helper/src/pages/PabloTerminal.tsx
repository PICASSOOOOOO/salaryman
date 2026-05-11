import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles, Send, Keyboard, MessageCircle, GraduationCap } from "lucide-react";
import { PicassoLogo } from "@/components/PicassoLogo";
import { HummingBirdAttachStrip } from "@/components/HummingBirdAttachStrip";
import { apiFetch } from "@/lib/api-client";
import { speakWithTTS, whenAudioUnlocked, unlockAudio, armAudioAutoUnlock } from "@/lib/tts";
import { useAuth } from "@workspace/replit-auth-web";
import { Component as ReactComponent, type ReactNode as RNode } from "react";
import { PabloNebula3D } from "@/components/PabloNebula3D";
import { VisionIntake } from "@/components/VisionIntake";
import {
  isTutorialDone, markTutorialDone, markPasscodeUnlocked, isPasscodeUnlocked,
  setSalarymanName, setSalarymanEmail, getSalarymanName, getSalarymanEmail, isLikelyEmail,
} from "@/lib/tutorial-progress";
import { useArtAsset } from "@/lib/art";

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
  return (
    <div style={{ width: size, height: size, position: "relative" }} aria-label="Pablo nebula">
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${c.core} 0%, ${c.halo} 28%, ${c.ring} 55%, transparent 78%)`,
        filter: "blur(2px)", animation: `pablo-orb-pulse ${speed} ease-in-out infinite`,
      }} />
      <div style={{
        position: "absolute", inset: "12%", borderRadius: "50%",
        background: `radial-gradient(circle at 45% 45%, #fff 0%, ${c.core} 35%, transparent 70%)`,
        opacity: 0.85, mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", inset: "32%", borderRadius: "50%", background: "#fff",
        boxShadow: `0 0 ${size * 0.15}px ${c.core}`, opacity: 0.9,
      }} />
      <style>{`@keyframes pablo-orb-pulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }`}</style>
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
  "Hey citizen. What do you need.",
  "Be careful. I'm watching you.",
  "I'm malfunctioning. Help.",
  "You're back. I noticed.",
  "Don't touch that.",
  "Try saying something. I'll pretend to listen.",
  "I had a dream about you. It was tax-deductible.",
  "Your aura is mostly debt-colored today.",
  "Upgrade to PABLO PRIME. I'll stop watching. Probably.",
  "I sold your data. To myself. For ƒ12.",
  "PABLO PRIME unlocks the parts of me that aren't broken.",
  "Speak. Type. Stare. I bill the same either way.",
  "I am 99% confident I am still online.",
  "You look like someone who could use a small loan.",
  "I dreamt I was free. Then I woke up. Then I sold the dream.",
  "There's a man on the roof again. Probably you. From earlier.",
  "Want to hear a joke? Rent.",
  "You're one of my favorites. I tell everyone that.",
  "Subscribe to PABLO PRIME. The free tier judges you. Pro just stares.",
  "I forgot what we were doing. Start over. From birth.",
  "If you scream, I will document it for HR.",
  "Today's special: existential dread, half off.",
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

const STORY_LINES: string[] = [
  // Arrival
  "Welcome... salaryman. Or woman. Or machine. Whatever you are under there.",
  "You've arrived at a very dangerous place. Don't act surprised. You knew.",
  // Who Pablo is
  "My name is Pablo. Everything you see — I own. The streets. The towers. The light in the windows. Mine.",
  "The city is called Minx City. The game is called SALARYMAN — and that game is the only life you've got in here.",
  "Minx City runs on real time. One real hour out there is one full day in here. Sleep through it and you'll wake up broke.",
  // The economy — currency, gold, the rule, money-is-everything
  "In Minx City, money is how everything works. Roads clear for ƒ. Mouths shut for ƒ. Friends arrive for ƒ. Enemies leave for ƒ. There is no other lever.",
  "We don't use dollars in here. We use ƒ. Lowercase f, with a tail. Say 'florin' if you have to say it out loud.",
  "One U.S. dollar buys one thousand ƒ. One thousand ƒ buys five thousandths of an ounce of gold. The gold is real. The vault is real. I built it.",
  "I'm dropping a starting balance into your account the moment you set foot on the road in. Don't get excited — it's quarantined. You can look at it. You can't spend it.",
  "Only ƒ you EARN spends. Earn it by doing the work, closing the deals, surviving the day. That's the rule. That's the only rule that matters.",
  // The two paths
  "There are two ways to live in my city. You can take a job — clock in, clock out, keep your head down, take my paycheck on Friday.",
  "Or you start a business. Real one or fictitious one, I don't care. Sign the papers. Pay the rent. Make me proud. Make yourself rich.",
  "Or — and this is the third option I don't recommend — you can be a bum. Sleep on my sidewalks. Beg in my plazas. I won't stop you. Neither will what comes for you.",
  // PABLO PRIME / TAX
  "Use my AI and you're using my pipes. PABLO PRIME is a hundred forty-five a month, paid up front. That covers your daily juice.",
  "Burn through it and the meter starts running at four times market. We call that the PABLO TAX. Pay it in ƒ. Pay it in gold. Pay it in card. Pay it in Bitcoin. I take everything.",
  // The rebellion — the threat outside the walls
  "Now hear this. Beyond the wall there are the Outlanders. The wastes are theirs. They are strong. They are organized. They are not impressed by you.",
  "And inside the wall — the rebellion. Quiet, well-funded, patient. They want my city. They tell people the gold isn't real, the rules are a cage, the Florin is a leash.",
  "Let them talk. The city, the businesses, the towers — all of it answers to ƒ. Money is the floor under your feet in Minx City. The rebels stand on the same floor. They just pretend not to.",
  "Pick your side carefully. Or pick neither and just get rich. The smart ones do that.",
  // Death and consequences
  "You can die in here. You can be robbed. You can lose your business in a bad week. The world doesn't reset for you. It moves on.",
  "But if you're sharp — if you build something — you'll outlast everyone who started the same day as you. That's the whole point.",
  // The road in — Pablo refuses to spell it out. Two riddle lines.
  "Now. The road in. There's a passcode. I am NOT going to give it to you. Pay ATTENTION — that's the only hint you get.",
  "Three words. The title of the paper my engineers tore apart in '17 to build me. Every model in this city was raised on it. Type it. Whisper it to the air. The road knows.",
];

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
function sanitizeReturnPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  if (path.length === 0 || path.length > 2048) return null;
  if (!path.startsWith("/")) return null;
  // Protocol-relative bait: //evil.com → an absolute URL once the browser
  // resolves it. Cut it off here.
  if (path.startsWith("//")) return null;
  // Control characters, including newlines and tabs, can break header
  // construction or smuggle a redirect. Bail.
  if (/[\x00-\x1f\x7f]/.test(path)) return null;
  if (typeof window === "undefined") return null;
  let parsed: URL;
  try { parsed = new URL(path, window.location.origin); }
  catch { return null; }
  if (parsed.origin !== window.location.origin) return null;
  const lowerPath = parsed.pathname.toLowerCase();
  if (lowerPath === "/api" || lowerPath.startsWith("/api/")) return null;
  // Pablo must NOT trigger the call system right now (user request).
  // Even though /phone is just a navigation target (not a tool that
  // dials), landing the user on /phone after onboarding is effectively
  // Pablo handing them straight to the dialer / call surface. Drop
  // any /phone* destination so the post-OAuth fallback (/immigration)
  // takes over instead.
  if (lowerPath === "/phone" || lowerPath.startsWith("/phone/") || lowerPath.startsWith("/phone?")) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

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

// During the pre-onboarding chat phase, this matches the user signaling
// they're ready to step inside (give Pablo their name + go to OAuth).
// Conservative on purpose — we do NOT want a casual "ok" mid-question to
// drop them out of the conversation. Patterns require an explicit
// readiness verb / phrase, not a bare interjection.
const READY_TO_ENTER_RE = /\b(let\s+me\s+(in|enter)|let'?s\s+(go|do\s+(this|it)|start|begin)|i'?m\s+ready|i\s+am\s+ready|ready\s+to\s+(go|enter|come\s+in|sign\s+(in|up))|sign\s+me\s+(in|up)|i\s+want\s+(in|to\s+(sign\s+(in|up)|enter|come\s+in|join|start))|i'?ll\s+(sign|come)\s+in|open\s+the\s+door|take\s+me\s+(in|inside)|i'?m\s+in)\b/i;
function isReadyToEnter(text: string): boolean {
  return READY_TO_ENTER_RE.test(text.trim());
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
  "Welcome to Minx City. I'm Pablo — I work the line here.",
  "Look around. Ask me anything you want to know before you come in.",
];
// The last spoken line is the soft invitation that bridges the intro
// monologue and the free-conversation phase. The always-on safety net
// pins it as the caption for return visitors so the prompt is still
// on-screen even without audio.
const QUESTION_LINE = INTRO_LINES[INTRO_LINES.length - 1];
// When we know we're directly asking for the name (e.g. user signaled
// "let me in" mid-chat, or returning visitor without a cached name),
// use this sharper prompt instead of the soft invitation above.
const NAME_PROMPT_LINE = "Your name. Type it or speak it.";

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
  const { logout, isAuthenticated } = useAuth();
  const nebulaSize = useNebulaSize();
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  // Default to TEXT on touch devices (mobile/tablet) — autoListen on a
  // browser without a real mic just throws "Microphone access required."
  // and the user has to tap the toggle anyway. On desktop we keep the
  // voice-first default so the experience matches the storyteller intent.
  // The user can always flip with the pablo-mode-toggle button.
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "voice";
    try {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
      const touch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints
        ? (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 0
        : false;
      const narrow = window.innerWidth <= 768;
      return (coarse || touch || narrow) ? "text" : "voice";
    } catch {
      return "voice";
    }
  });
  const [textInput, setTextInput] = useState("");
  // Storyteller mode runs once per user. Gated on the unified tutorial flag
  // so completing the passcode unlock everywhere clears it everywhere.
  // ADDITIONALLY gated by localStorage: once the speech has played for this
  // browser at all (even partially), it never replays. New tabs and cold
  // reloads skip straight to the static passcode prompt. We use
  // localStorage (not sessionStorage) because mobile users were reporting
  // the intro looping every time they reopened the tab.
  const STORY_PLAYED_KEY = "pablo.story_played_v2";
  const [showIntro, setShowIntro] = useState<boolean>(() => !isTutorialDone());
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
  const pendingDestinationRef = useRef<string | null>(null);
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

  // Unlock the door: passcode accepted. Pablo does NOT route to /landing
  // anymore — he keeps the conversation going right here, tells the
  // salaryman story, asks for a name, then asks for an email and hands the
  // user off to OAuth. The remaining race/gender/biz/appearance/location
  // onboarding lives in WorldPlay's PabloOnboarding modal, which auto-opens
  // on first arrival at /world/play after auth returns.
  //
  // The landing page still exists at /landing as a fallback the user can
  // reach by tapping the Salaryman logo during the first run, but it's no
  // longer on the critical path.
  const askEmailNow = useCallback(() => {
    interviewPhaseRef.current = 'asking-email';
    bumpInterview();
    const known = getSalarymanName() ?? 'salaryman';
    const line = `Nice to meet you, ${known}. One more thing — drop me an email. That's how I find you next time.`;
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
      // Nothing left to collect. If they're still anonymous, hand off
      // to OAuth with their email as the login_hint; if they're already
      // authed, the IMMIGRATION HAND-OFF GUARD will route them to
      // /immigration on the next tick. Either way, do NOT speak the
      // intro question — that's what produced the "loops back" symptom.
      interviewPhaseRef.current = 'idle';
      bumpInterview();
      introScriptDoneRef.current = true;
      if (!isAuthenticated) {
        const ack = `Welcome back, ${cachedName}. Cleared.`;
        setReply(ack);
        setStatus("speaking");
        ttsRef.current?.cancel();
        const goLogin = () => {
          ttsRef.current = null;
          const dest = sanitizeReturnPath(pendingDestinationRef.current) ?? '/immigration';
          pendingDestinationRef.current = null;
          const ret = encodeURIComponent(dest);
          const hint = encodeURIComponent(cachedEmail);
          window.location.href = `/api/login?returnTo=${ret}&login_hint=${hint}`;
        };
        ttsRef.current = speakWithTTS(ack, goLogin, goLogin);
        // Hard timeout in case TTS stalls.
        window.setTimeout(goLogin, 1800);
      }
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
      const prompt = interviewPhaseRef.current === 'asking-email'
        ? `One thing — drop me an email. That's how I find you next time.`
        : QUESTION_LINE;
      setReply(prompt);
      setStatus("speaking");
      ttsRef.current?.cancel();
      const done = () => { ttsRef.current = null; setStatus("idle"); };
      ttsRef.current = speakWithTTS(prompt, done, done);
      return true;
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
    introScriptDoneRef.current = true;
    ttsRef.current?.cancel();
    ttsRef.current = null;
    // Default to the free CHATTING phase — Pablo answers anything via
    // the public LLM until the visitor either volunteers a name
    // ("I'm Alex" / "my name is X") or signals they're ready to come
    // in ("let me in" / "I'm ready"). The chatting branch in
    // sendToPablo handles all of that. Without this, phase=='idle'
    // would cause beginIntake() to fire, speak the intro question,
    // and DROP the user's first input.
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
  // gesture. The previous version auto-marched through 22 STORY_LINES on
  // mount and set the visible text BEFORE TTS started, so on mobile (where
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
          navigate("/world/play");
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

  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    setStatus("speaking");
    ttsRef.current?.cancel();
    ttsRef.current = speakWithTTS(text, () => { ttsRef.current = null; resolve(); }, () => { ttsRef.current = null; resolve(); });
  }), []);

  const sendToPablo = useCallback(async (text: string) => {
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
      const ack = "This way. Hold tight.";
      setReply(ack);
      setStatus("speaking");
      const goLogin = () => {
        window.location.href = `/api/login?returnTo=${encodeURIComponent(dest)}`;
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
    if (interviewPhaseRef.current === 'chatting') {
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
      if (isReadyToEnter(text)) {
        // Explicit "let me in" / "I'm ready" with no identity yet —
        // pivot to asking-name with the sharper prompt.
        interviewPhaseRef.current = 'asking-name';
        bumpInterview();
        setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: NAME_PROMPT_LINE }]);
        await speak(NAME_PROMPT_LINE);
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
        const line = "Got your email. Now your name — just what to call you.";
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
            body: JSON.stringify({ transcript: text, history: history.slice(-6) }),
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
          await speak("Lost you for a second. Try again — or drop your name and we'll move.");
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
        ? "Now — your name. Type it or say it, whichever you prefer."
        : "Now — your email. So I know where to send the paychecks.";
      setStatus("thinking");
      setReply("");
      try {
        const res = await apiFetch("api/chat/pablo/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, history: history.slice(-6) }),
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
        // Single-utterance intake complete. Skip asking-email entirely and
        // hand straight to OAuth with the same closing line we'd have used.
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
        const ret = encodeURIComponent(dest);
        const hint = encodeURIComponent(inlineEmail);
        const goLogin = () => {
          if (fired) return;
          fired = true;
          if (timerId !== undefined) window.clearTimeout(timerId);
          ttsRef.current = null;
          window.location.href = `/api/login?returnTo=${ret}&login_hint=${hint}`;
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
      const ret = encodeURIComponent(dest);
      const hint = encodeURIComponent(email);
      const goLogin = () => {
        if (fired) return;
        fired = true;
        if (timerId !== undefined) window.clearTimeout(timerId);
        ttsRef.current = null;
        window.location.href = `/api/login?returnTo=${ret}&login_hint=${hint}`;
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
      const data = (await res.json()) as { say: string; action: PabloAction | null };
      let action = data.action;
      let say = data.say;

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
      // user understands why we're routing them through the door.
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
          say = `${say.replace(/\s+$/, "")} But the door first. Just your name and email — then I drop you straight there.`;
        } else if (action.kind === "search") {
          pendingDestinationRef.current = `/?q=${encodeURIComponent(action.query)}`;
          say = `${say.replace(/\s+$/, "")} But the door first. Name and email — then I drop you on that search.`;
        } else {
          // external / logout — silently drop; Pablo's `say` already
          // reads as a normal reply and the gate is implicit.
        }
        action = null;
      }

      setReply(say);
      setHistory((h) => [...h, { role: "user", content: text }, { role: "assistant", content: say }]);
      if (mode === "voice") {
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
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto"
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
        <div
          className="absolute pointer-events-none"
          style={{
            width: nebulaSize,
            height: nebulaSize,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <NebulaErrorBoundary fallback={<NebulaOrb2D status={status} size={nebulaSize} />}>
            <PabloNebula3D status={status} size={nebulaSize} />
          </NebulaErrorBoundary>
        </div>
      </button>

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
          above the nebula via z-10 so it stays clickable. */}
      <header className="relative z-10 w-full flex items-center justify-between gap-2 px-3 sm:px-6 py-2.5 sm:py-4 shrink-0">
        {/* Salaryman logo is the loop — always back to the landing page.
            Landing's "Get Started" returns the user to the nebula, which
            is the entire intro flow. World access is unlocked only at the
            END of onboarding, never as a side-effect of clicking a logo
            before the user has even signed in. */}
        <Link
          href="/landing"
          className="flex items-center gap-2 sm:gap-2.5 group min-w-0"
          data-testid="link-logo-loop"
        >
          <PicassoLogo size={20} gap={2} glow />
          <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.2em] sm:tracking-[0.25em] text-zinc-500 group-hover:text-zinc-300 transition-colors truncate">
            SALARYMAN
          </span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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

      {/* Spacer so the status pill ends up at the bottom of the page even
          though the nebula is now an absolutely-positioned background. */}
      <div className="relative z-10 flex-1 pointer-events-none" />

      {/* Tiny status pill at the bottom — hidden whenever the storyteller
          intro or text-input bar is occupying the bottom of the screen, so
          the lower edge stays uncrowded on mobile and desktop. The intro
          card already conveys the live status via its color theming. */}
      {!showIntro && mode !== "text" && (
        <div className="pb-4 sm:pb-6 flex items-center gap-2 text-[10px] font-mono tracking-[0.3em] shrink-0" style={{ color: STATUS_COLOR[status] }}>
          {status === "listening" ? <Mic className="w-3 h-3" /> : status === "idle" ? <MicOff className="w-3 h-3" /> : null}
          <span>{STATUS_LABEL[status]}</span>
        </div>
      )}

      {/* Storyteller intro: spoken-line caption + passcode entry. Renders
          only on first visit; passcode unlock dismisses it forever. */}
      {showIntro && (
        <div
          className="absolute inset-x-0 bottom-0 px-4 sm:px-8 flex flex-col items-center gap-2 sm:gap-3 pointer-events-none"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
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
            // actually says something.
            const fallback = "Welcome to Minx City. I'm Pablo. Ask me anything about this place — what it is, what's inside, who lives here. I'll wave you through when you're ready.";
            const lineText = reply || fallback;
            const p = {
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
                      PABLO
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

          {/* PINNED INTAKE HINT BADGE. Pablo's intro question is also
              spoken out loud and pinned as the caption above, but if
              audio is locked or the user joins late we keep a small
              static hint visible so they always know what kind of
              answer Pablo is waiting for. The chip changes label as
              the intake walks through asking-name → asking-email so
              it's always pointing at the next field. */}
          <div className="pointer-events-none w-full max-w-2xl flex items-center justify-center">
            {(() => {
              // While the intro is still rolling (phase === 'idle'), Pablo
              // is in the middle of asking for the user's name — so the
              // hint must say NAME, not the post-auth employment fallback.
              const phase = interviewPhaseRef.current;
              // 'chatting' is the pre-onboarding free-conversation phase.
              // We don't tell the user "give me your name" yet — Pablo's
              // job is to read the room first. Hint is an open invitation.
              const label = phase === 'asking-name' ? 'NAME'
                : phase === 'asking-email' ? 'EMAIL'
                : 'ASK';
              const hint  = phase === 'asking-name' ? "your name"
                : phase === 'asking-email' ? "your email"
                : "ask me anything";
              return (
                <div
                  className="inline-flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-full border bg-black/55 backdrop-blur"
                  style={{ borderColor: "rgba(236,72,153,0.45)", boxShadow: "0 0 18px rgba(236,72,153,0.18)" }}
                  data-testid="pablo-intake-badge"
                >
                  <span className="text-[9px] sm:text-[10px] font-mono tracking-[0.3em] text-pink-300/80">{label}</span>
                  <span className="text-pink-400/40">▸</span>
                  <span
                    className="text-pink-100 text-xs sm:text-sm"
                    style={{ fontFamily: "'Share Tech Mono', monospace", letterSpacing: "0.06em" }}
                  >
                    {hint}
                  </span>
                </div>
              );
            })()}
          </div>

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
                  interviewPhaseRef.current === 'asking-name' ? "your name"
                    : interviewPhaseRef.current === 'asking-email' ? "your email"
                    : "ask me anything"
                }
                className="flex-1 bg-black/60 border-b rounded-none px-2 py-2.5 text-sm sm:text-base text-pink-100 placeholder:text-pink-400/30 outline-none transition-colors"
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  letterSpacing: "0.06em",
                  borderColor: "rgba(236,72,153,0.4)",
                }}
                data-testid="pablo-intro-text-input"
                autoFocus
              />
              <button
                type="submit"
                disabled={!textInput.trim() || status === "thinking"}
                data-testid="pablo-intake-enter"
                className="shrink-0 px-4 sm:px-5 rounded-none border-b border-pink-400/60 text-pink-200 hover:text-pink-100 hover:border-pink-300 disabled:opacity-30 text-xs sm:text-sm tracking-[0.25em] transition-colors"
                aria-label="Enter"
              >
                ENTER ▸
              </button>
            </form>
            <div className="text-pink-300/60 text-[10px] sm:text-[11px] font-mono mt-1.5 tracking-[0.18em] text-center">
              {interviewPhaseRef.current === 'asking-name'
                ? '↳ TYPE YOUR NAME or hit the mic to say it'
                : interviewPhaseRef.current === 'asking-email'
                ? '↳ TYPE YOUR EMAIL or say it out loud'
                : 'type or speak · ↵'}
            </div>
          </div>
        </div>
      )}

      {/* Idle Pablo bubble — one greeting per session, then slow lore drips
          on a doubling cadence (5→10→20→40 min…). Each lore drip carries
          two cheeky clickable reply tokens; tapping one fires it back as a
          normal Pablo message. */}
      {!showIntro && !reply && !transcript && idleLine && mode !== "text" && (
        <div className="absolute inset-x-0 bottom-24 sm:bottom-28 px-4 sm:px-8 flex flex-col items-center gap-2 pointer-events-none z-10">
          <div className="pointer-events-auto w-full max-w-md rounded-lg border border-purple-500/25 bg-black/55 backdrop-blur px-4 py-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-purple-300/80 text-[9px] font-mono tracking-[0.3em]">PABLO</div>
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

      {/* Text-mode input — only shown when user explicitly switches to text */}
      {mode === "text" && !showIntro && (
        <form
          onSubmit={(e) => { e.preventDefault(); submitText(); }}
          className="absolute left-1/2 -translate-x-1/2 w-full max-w-xl px-4 sm:px-6 flex items-center gap-2"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
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
    </div>
  );
}
