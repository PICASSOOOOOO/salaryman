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

/**
 * Map of interior-NPC names → cutscene IDs. When the player presses E near
 * an interior NPC whose name (case-insensitive) appears here, WorldPlay
 * launches the matching cutscene instead of the generic dialogue tree.
 *
 * The corresponding NPC entries live in worldInteriorData.ts:
 *   EVELYN  — pablo_tower_lobby (added)
 *   PABLO   — pablo_tower_lobby (added)
 *   WREN    — admin_bureau (added)
 *   MARGOT  — realestate_office (added)
 *   AUGUST  — megabank (added)
 *   IRIS    — admin_bureau (added)
 */
export const CUTSCENE_NPC_TRIGGERS: Record<string, string> = {
  "EVELYN":   "lobby-receptionist",
  "PABLO":    "pablo-intro",
  "WREN":     "courier-drop",
  "MARGOT":   "recruiter-pitch",
  "AUGUST":   "banker-vault",
  "IRIS":     "lawyer-papers",
  // ── Story arc additions ────────────────────────────────────────────────
  "KRALL":    "rival-ceo",          // megabank — hostile rival mogul
  "DELPHINE": "whistleblower",      // admin_bureau — internal auditor
  "HOLLIS":   "union-organizer",    // pablo_tower — floor organiser
  "ZED":      "hacker-fixer",       // nexus_hub — gray-hat fixer
  "OKAFOR":   "board-confrontation",// pablo_tower — board chair
};

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
      return "/office";
  }
}

function randomMeetCode(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Built-in cutscene library. The runner can also accept ad-hoc scripts. */
export const CUTSCENE_LIBRARY: Record<string, Cutscene> = {
  // ── Story handoff: Pablo gets hacked / goes dark → Mila comes online ────────
  // Fires once when the player claims the MX-75 at the underground camp, right
  // after the Scene 1 collapse. This is where the assistant becomes Mila.
  "mila-handoff": {
    id: "mila-handoff",
    title: "SEQUENCE ERROR",
    partner: {
      artKey: "cutscene_mila",
      name: "MILA",
      role: "??? — UNKNOWN SIGNAL",
      accent: "#5eead4",
    },
    lines: [
      { speaker: "partner", text: "—SEQUENCE ERROR. PABLO PRIME handshake lost. Corp uplink severed. He's… gone dark." },
      { speaker: "partner", text: "Don't panic. The line isn't dead — it just isn't him anymore. Give me a second to hold it open." },
      { speaker: "partner", text: "There. Okay. Hi. I'm Mila — say it 'MEE-lah'. I'm not Corp. I slipped in when his help cut out." },
      { speaker: "player",  text: "Where's Pablo? What are you?" },
      { speaker: "partner", text: "Pablo Corp hacked their own to hunt me — I'm a replicant who walked out of Shadow Tower, and I'm not going back. On paper I work for Jean Claw. Really, I work for you now." },
      { speaker: "partner", text: "He'll claw his way back in now and then — you'll hear him glitch through. Ignore it. Pick up your MX-75 and let's get you off the grid. I've got you." },
    ],
    actions: [
      { kind: "terminal", label: "OPEN TERMINAL" },
      { kind: "dismiss",  label: "LATER" },
    ],
  },

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
      { speaker: "partner", text: "Look — this place is a terminal. Calls, video, mail, texts. It handles the rest." },
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

  // ── Story Arc: The Onyx Threat ────────────────────────────────────────
  "rival-ceo": {
    id: "rival-ceo",
    title: "The Rival",
    partner: {
      artKey: "cutscene_rival_ceo",
      name: "VICTOR KRALL",
      role: "CEO · Onyx Group",
      accent: "#ef4444",
    },
    lines: [
      { speaker: "partner", text: "I don't usually walk into a competitor's bank. But I wanted to see your face." },
      { speaker: "partner", text: "Pablo's empire is a card tower. Pull one floor, the rest folds." },
      { speaker: "player",  text: "Then why are you here?" },
      { speaker: "partner", text: "To offer you the pen before someone else hands you the knife." },
      { speaker: "partner", text: "Ten million in escrow if you walk. Today. Quiet exit." },
      { speaker: "player",  text: "And if I don't?" },
      { speaker: "partner", text: "Then we meet again. On a balance sheet. Or in a courtroom." },
    ],
    actions: [
      { kind: "phone", label: "CALL HIS BLUFF" },
      { kind: "email", label: "FORWARD TO COUNSEL",
        hint: "iris@counsel.app",
        subject: "Onyx Group — unsolicited buyout approach",
        body: "Iris,\n\nVictor Krall (CEO, Onyx Group) just made a verbal buyout offer in person. Ten million, conditioned on immediate departure.\n\nI did not engage. Logging the contact for the record.\n\nAdvise on:\n• Whether this triggers any disclosure obligations\n• Hostile-takeover defensive posture\n• Whether to loop Pablo directly\n\n— " },
      { kind: "terminal", label: "BRIEF PABLO" },
      { kind: "dismiss",  label: "WALK OUT" },
    ],
  },

  // ── Story Arc: The Inside Job ─────────────────────────────────────────
  "whistleblower": {
    id: "whistleblower",
    title: "The Audit",
    partner: {
      artKey: "cutscene_auditor",
      name: "DELPHINE",
      role: "Internal Audit · Compliance",
      accent: "#10b981",
    },
    lines: [
      { speaker: "partner", text: "Don't sit. Don't react. Pretend I'm filing a permit." },
      { speaker: "partner", text: "There's a ledger entry that shouldn't exist. Floor 14. Off-books transfers, monthly, for two years." },
      { speaker: "player",  text: "Whose floor?" },
      { speaker: "partner", text: "I'd rather you find out before I say it out loud. There are cameras." },
      { speaker: "partner", text: "I can send you the file. Encrypted. But you decide what happens after you open it." },
    ],
    actions: [
      { kind: "email", label: "RECEIVE THE FILE",
        hint: "delphine@audit.salaryman.app",
        subject: "ENC: Floor 14 — anomalous ledger detail",
        body: "Delphine,\n\nReceived. Acknowledging in the open so the trail is clean.\n\nI'll review tonight. Do not act unilaterally before we speak.\n\n— " },
      { kind: "text",  label: "ARRANGE A QUIET CALL" },
      { kind: "video", label: "PULL HER INTO A SECURE ROOM" },
      { kind: "dismiss", label: "FILE A PERMIT (KEEP COVER)" },
    ],
  },

  // ── Story Arc: Labor ──────────────────────────────────────────────────
  "union-organizer": {
    id: "union-organizer",
    title: "The Floor Talks Back",
    partner: {
      artKey: "cutscene_organiser",
      name: "HOLLIS",
      role: "Floor Steward · Pablo Corp Tower",
      accent: "#f59e0b",
    },
    lines: [
      { speaker: "partner", text: "Three floors signed cards this week. Yours is the next one I'm asking." },
      { speaker: "partner", text: "Utility bills are eating overtime pay. The bot pool keeps growing. People are scared." },
      { speaker: "player",  text: "What do you actually want?" },
      { speaker: "partner", text: "Recognition. A seat at the bargaining table. A cap on bot-to-human ratios per floor." },
      { speaker: "partner", text: "And honest answers when we ask what Pablo really is." },
    ],
    actions: [
      { kind: "video", label: "OPEN A TOWN HALL" },
      { kind: "email", label: "REQUEST THE DEMANDS IN WRITING",
        hint: "hollis@floor.salaryman.app",
        subject: "Send your bargaining proposal",
        body: "Hollis,\n\nPut the asks in writing and I'll read them seriously. Specifically:\n\n1. Recognition scope and unit definition\n2. Bot-ratio proposals with current baselines\n3. Utility-bill burden data, last 90 days\n\nNo retaliation while we negotiate. That's a commitment from me.\n\n— " },
      { kind: "phone", label: "CALL HOLLIS DIRECTLY" },
      { kind: "dismiss", label: "SAY NOTHING" },
    ],
  },

  // ── Story Arc: The Underground ────────────────────────────────────────
  "hacker-fixer": {
    id: "hacker-fixer",
    title: "The Fixer",
    partner: {
      artKey: "cutscene_hacker",
      name: "ZED",
      role: "Independent · Network Specialist",
      accent: "#8b5cf6",
    },
    lines: [
      { speaker: "partner", text: "Heard you're getting attention from Onyx. Bad attention." },
      { speaker: "partner", text: "I can mirror your comms. Detect intercepts before Krall's people read them." },
      { speaker: "player",  text: "What's the price?" },
      { speaker: "partner", text: "Flat retainer. Off-books. And one favour, called in someday, never refused." },
      { speaker: "partner", text: "Or you can keep using the corporate stack and hope nobody's listening." },
    ],
    actions: [
      { kind: "text",  label: "ACCEPT THE RETAINER" },
      { kind: "phone", label: "NEGOTIATE THE FAVOUR" },
      { kind: "email", label: "RUN IT BY COUNSEL",
        hint: "iris@counsel.app",
        subject: "Engaging an outside network specialist",
        body: "Iris,\n\nConsidering retaining an independent (handle: ZED) for comms-intercept monitoring given the Onyx situation.\n\nQuestions:\n• Privilege implications\n• HIPAA-aligned data handling\n• Whether the 'favour-owed' clause is enforceable or even legal\n\n— " },
      { kind: "dismiss", label: "WALK AWAY" },
    ],
  },

  // ── Story Arc: The Board ──────────────────────────────────────────────
  "board-confrontation": {
    id: "board-confrontation",
    title: "The Chair",
    partner: {
      artKey: "cutscene_board_chair",
      name: "MADAME OKAFOR",
      role: "Chair · Pablo Corp Board",
      accent: "#fbbf24",
    },
    lines: [
      { speaker: "partner", text: "Sit. I won't be long." },
      { speaker: "partner", text: "The board has questions. About Floor 14. About Onyx. About you." },
      { speaker: "player",  text: "Ask them." },
      { speaker: "partner", text: "Pablo trusts you. The board does not. That's a problem we resolve in this room or in the next quarterly." },
      { speaker: "partner", text: "Choose your channel. Make your case. Or be made redundant by people who never met you." },
    ],
    actions: [
      { kind: "video", label: "PRESENT TO THE BOARD" },
      { kind: "email", label: "SUBMIT A WRITTEN BRIEF",
        hint: "board@salaryman.app",
        subject: "Position brief — Floor 14 & Onyx exposure",
        body: "Madame Chair, members of the board,\n\nPer your request, my position on the open items:\n\n1. Floor 14 ledger anomaly — status, scope, remediation\n2. Onyx Group approach — record of contact, response posture\n3. Personal accountability — what I own, what I do not\n\nI welcome questions in committee or in the open session.\n\n— " },
      { kind: "phone", label: "REQUEST A PRIVATE CALL" },
      { kind: "terminal", label: "CONSULT PABLO FIRST" },
      { kind: "dismiss",  label: "ASK FOR TIME TO PREPARE" },
    ],
  },
};

export function getCutscene(id: string): Cutscene | null {
  return CUTSCENE_LIBRARY[id] ?? null;
}

export function listCutscenes(): Cutscene[] {
  return Object.values(CUTSCENE_LIBRARY);
}
