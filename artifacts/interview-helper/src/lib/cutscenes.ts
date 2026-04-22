/**
 * Cutscene library: scripted dialogues between the player and an NPC / bot /
 * other user. Each cutscene ends with a set of "handoff" actions that open
 * the right comms channel (video call, SMS, phone, email, terminal).
 *
 * The renderer (CutsceneRunner) only needs:
 *   - partner: who you're talking to (art key + name + role)
 *   - lines:   ordered list of speech bubbles
 *   - actions: end-of-scene buttons that route to comms channels
 */

export type CutsceneSpeaker = "partner" | "player";

export type CutsceneActionKind =
  | "video"     // start a video call (uses /meet/:code)
  | "text"      // send an SMS
  | "phone"     // place a phone call
  | "email"     // compose an email
  | "terminal"  // open Pablo terminal
  | "dismiss";  // close the cutscene

export interface CutsceneAction {
  kind: CutsceneActionKind;
  label: string;
  /** Optional URL override; if omitted we build one from the kind. */
  href?: string;
  /** Optional channel/recipient hint baked into the URL. */
  hint?: string;
  /** For email actions only — pre-fills the compose modal. */
  subject?: string;
  body?: string;
}

export interface CutsceneLine {
  speaker: CutsceneSpeaker;
  text: string;
}

export interface CutscenePartner {
  /** Salaryman art-kit key for the portrait, e.g. "cutscene_receptionist". */
  artKey: string;
  name: string;
  role: string;
  /** Hex accent for name plate + bubble border. */
  accent?: string;
}

export interface Cutscene {
  id: string;
  title: string;
  partner: CutscenePartner;
  lines: CutsceneLine[];
  actions: CutsceneAction[];
}

/** Default URL builder for an action when no explicit href is supplied. */
export function resolveActionHref(action: CutsceneAction): string {
  if (action.href) return action.href;
  switch (action.kind) {
    case "video":
      return `/meet/${action.hint ?? randomMeetCode()}`;
    case "text":
      return `/phone?tab=cmd&compose=sms${action.hint ? `&to=${encodeURIComponent(action.hint)}` : ""}`;
    case "phone":
      return `/phone?tab=cmd&compose=call${action.hint ? `&to=${encodeURIComponent(action.hint)}` : ""}`;
    case "email": {
      const params = new URLSearchParams({ compose: "email" });
      if (action.hint)    params.set("to", action.hint);
      if (action.subject) params.set("subject", action.subject);
      if (action.body)    params.set("body", action.body);
      return `/business/contacts?${params.toString()}`;
    }
    case "terminal":
      return "/pablo";
    case "dismiss":
    default:
      return "/world/play";
  }
}

function randomMeetCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Built-in cutscene library. The runner can also accept ad-hoc scripts. */
export const CUTSCENE_LIBRARY: Record<string, Cutscene> = {
  "lobby-receptionist": {
    id: "lobby-receptionist",
    title: "Front Desk",
    partner: {
      artKey: "cutscene_receptionist",
      name: "EVELYN",
      role: "Lobby Receptionist",
      accent: "#22d3ee",
    },
    lines: [
      { speaker: "partner", text: "Oh. You're the new hire. Pablo said you'd wander in around lunch." },
      { speaker: "player",  text: "Where do I go?" },
      { speaker: "partner", text: "Up to you. Most people start by ringing somebody who already works here. Or you can just message the floor." },
      { speaker: "partner", text: "Don't bother HR. They're a chatbot. Literally." },
    ],
    actions: [
      { kind: "video",    label: "JOIN A FLOOR MEETING" },
      { kind: "text",     label: "MESSAGE THE FLOOR" },
      { kind: "phone",    label: "RING THE FLOOR" },
      { kind: "terminal", label: "TALK TO PABLO" },
      { kind: "dismiss",  label: "WALK AWAY" },
    ],
  },

  "pablo-intro": {
    id: "pablo-intro",
    title: "The Mogul",
    partner: {
      artKey: "cutscene_pablo",
      name: "PABLO",
      role: "Founder · CEO · Mogul",
      accent: "#ec4899",
    },
    lines: [
      { speaker: "partner", text: "You made it past the bathroom. Half of them don't." },
      { speaker: "partner", text: "Look — this place is a hub. Calls, video, mail, texts. The terminal does the rest." },
      { speaker: "player",  text: "And you?" },
      { speaker: "partner", text: "I'm always on. Pick a channel. Be safe. Have fun. Don't die." },
    ],
    actions: [
      { kind: "terminal", label: "OPEN TERMINAL" },
      { kind: "video",    label: "VIDEO CALL PABLO" },
      { kind: "text",     label: "TEXT PABLO" },
      { kind: "email",    label: "EMAIL PABLO",
        hint: "pablo@salaryman.app",
        subject: "Following up from the terminal",
        body: "Pablo,\n\nWe just talked. Picking up the thread:\n\n— " },
      { kind: "dismiss",  label: "BOW OUT" },
    ],
  },

  "courier-drop": {
    id: "courier-drop",
    title: "Rooftop Drop",
    partner: {
      artKey: "cutscene_courier",
      name: "WREN",
      role: "Drone Courier · Sector 9",
      accent: "#a855f7",
    },
    lines: [
      { speaker: "partner", text: "Package for you. Sealed. Don't open it on camera." },
      { speaker: "player",  text: "Who sent it?" },
      { speaker: "partner", text: "Anonymous. They left a callback number though. Your call." },
    ],
    actions: [
      { kind: "phone",   label: "CALL THE NUMBER" },
      { kind: "text",    label: "TEXT THE NUMBER" },
      { kind: "email",   label: "FORWARD TO LEGAL",
        hint: "legal@salaryman.app",
        subject: "Anonymous package — chain of custody",
        body: "Counsel,\n\nA courier (call sign WREN, Sector 9) just dropped a sealed anonymous package at my desk.\n\nKey facts:\n• Sender unknown; callback number on the outside\n• Unopened, unobserved on camera\n\nAdvise on next steps before I open it.\n\n— " },
      { kind: "dismiss", label: "POCKET IT" },
    ],
  },

  "recruiter-pitch": {
    id: "recruiter-pitch",
    title: "Headhunt",
    partner: {
      artKey: "cutscene_recruiter",
      name: "MARGOT",
      role: "Talent · Onyx Group",
      accent: "#f472b6",
    },
    lines: [
      { speaker: "partner", text: "I have three roles open this week. All remote. All terrifying." },
      { speaker: "partner", text: "Want the brief on a call, in writing, or do we just hop on video right now?" },
    ],
    actions: [
      { kind: "video", label: "VIDEO INTERVIEW NOW" },
      { kind: "phone", label: "CALL ME" },
      { kind: "email", label: "EMAIL THE BRIEF",
        hint: "margot@onyxgroup.app",
        subject: "Send the brief — three roles",
        body: "Margot,\n\nGood meeting you. Send the briefs for those three roles when you have a moment. Particularly interested in:\n\n1. Comp band\n2. Reporting line\n3. Whether the role is remote-first\n\nThanks,\n— " },
      { kind: "text",  label: "TEXT ME LATER" },
    ],
  },

  "banker-vault": {
    id: "banker-vault",
    title: "Private Banking",
    partner: {
      artKey: "cutscene_banker",
      name: "AUGUST",
      role: "Private Banker · Florin & Co.",
      accent: "#fbbf24",
    },
    lines: [
      { speaker: "partner", text: "Your line of credit cleared this morning. Congratulations." },
      { speaker: "player",  text: "How do we move it?" },
      { speaker: "partner", text: "Voice authorisation by phone, written instruction by email, or face-to-face on video. Your preference." },
    ],
    actions: [
      { kind: "phone", label: "AUTHORISE BY PHONE" },
      { kind: "email", label: "EMAIL INSTRUCTIONS",
        hint: "august@florinco.app",
        subject: "Wire instructions — line of credit",
        body: "August,\n\nWritten instructions for the LOC drawdown:\n\n• Amount: \n• Beneficiary: \n• Routing/SWIFT: \n• Reference: \n\nKindly confirm receipt and ETA.\n\n— " },
      { kind: "video", label: "VIDEO MEETING" },
    ],
  },

  "lawyer-papers": {
    id: "lawyer-papers",
    title: "Counsel",
    partner: {
      artKey: "cutscene_lawyer",
      name: "IRIS",
      role: "General Counsel",
      accent: "#22d3ee",
    },
    lines: [
      { speaker: "partner", text: "Sign nothing today. We talk first." },
      { speaker: "partner", text: "I can be on a call in two minutes or send you the redline tonight." },
    ],
    actions: [
      { kind: "video", label: "JUMP ON VIDEO" },
      { kind: "phone", label: "CALL HER" },
      { kind: "email", label: "GET THE REDLINE",
        hint: "iris@counsel.app",
        subject: "Send the redline tonight",
        body: "Iris,\n\nPlease send the redline before EOD. I won't sign anything until we've talked it through.\n\nFlag in particular:\n• Indemnification scope\n• Termination language\n• IP assignment\n\n— " },
    ],
  },
};

export function getCutscene(id: string): Cutscene | null {
  return CUTSCENE_LIBRARY[id] ?? null;
}

export function listCutscenes(): Cutscene[] {
  return Object.values(CUTSCENE_LIBRARY);
}
