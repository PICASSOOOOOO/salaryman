export type WriterGenre =
  | "fiction"
  | "nonfiction"
  | "screenplay"
  | "poetry"
  | "essay"
  | "memoir"
  | "journalism"
  | "technical"
  | "rap"
  | "song"
  | "proposal"
  | "business_plan"
  | "presentation";

export type WriterTemplate = {
  id: string;
  title: string;
  summary: string;
  genre: WriterGenre;
  projectTitle: string;
  synopsis: string;
  prompt: string;
  sections: string[];
  recommendedFor: WriterGenre[];
};

export const WRITER_TEMPLATES: WriterTemplate[] = [
  {
    id: "novel",
    title: "Novel idea map",
    summary: "Turn a premise into characters, setting, plot beats, and chapters.",
    genre: "fiction",
    projectTitle: "UNTITLED NOVEL",
    synopsis: "",
    prompt: "Help me develop the premise into a distinct story. Ask me to confirm missing facts; preserve my ideas and voice.",
    sections: ["PREMISE", "CHARACTERS", "SETTING", "PLOT ARC", "CHAPTER 1"],
    recommendedFor: ["fiction", "screenplay", "memoir"],
  },
  {
    id: "proposal",
    title: "Client proposal",
    summary: "Shape the need, approach, deliverables, timeline, and investment.",
    genre: "proposal",
    projectTitle: "UNTITLED PROPOSAL",
    synopsis: "",
    prompt: "Help me prepare a clear client proposal. Ask for the client, need, scope, dates, price, and proof points. Never invent commitments or figures; mark unknowns [CONFIRM ...].",
    sections: ["CLIENT & NEED", "GOALS", "APPROACH", "DELIVERABLES", "TIMELINE", "INVESTMENT", "NEXT STEP"],
    recommendedFor: ["proposal", "nonfiction", "technical"],
  },
  {
    id: "business-plan",
    title: "Business plan",
    summary: "Organize the offer, customer, market assumptions, operations, and finances.",
    genre: "business_plan",
    projectTitle: "UNTITLED BUSINESS PLAN",
    synopsis: "",
    prompt: "Help me build a reviewable business plan. Ask for the actual offer, customers, geography, costs, and goals. Separate supplied facts from assumptions, and never fabricate research or financial forecasts.",
    sections: ["EXECUTIVE SUMMARY", "CUSTOMER PROBLEM", "OFFER", "MARKET & ASSUMPTIONS", "GO-TO-MARKET", "OPERATIONS", "FINANCIAL PLAN", "RISKS & MILESTONES"],
    recommendedFor: ["business_plan", "proposal", "nonfiction"],
  },
  {
    id: "slideshow",
    title: "Slideshow outline",
    summary: "Build a focused slide-by-slide story with speaker notes.",
    genre: "presentation",
    projectTitle: "UNTITLED PRESENTATION",
    synopsis: "",
    prompt: "Help me make a presentation for a specific audience and outcome. Keep each slide focused, use short screen text and useful speaker notes, and mark facts that need confirmation instead of inventing them.",
    sections: ["OPENING", "THE AUDIENCE", "THE PROBLEM", "KEY IDEA", "EVIDENCE", "RECOMMENDATION", "NEXT STEPS", "CLOSE"],
    recommendedFor: ["presentation", "business_plan", "proposal", "technical"],
  },
  {
    id: "song",
    title: "Songwriting session",
    summary: "Develop a hook, verses, rhyme scheme, rhythm, and musical sketch.",
    genre: "song",
    projectTitle: "UNTITLED SONG",
    synopsis: "",
    prompt: "Help me shape an original song around my idea. Keep the hook memorable, respect the requested meter, and suggest alternatives without replacing my voice.",
    sections: ["SONG IDEA", "VERSE 1", "PRE-CHORUS", "CHORUS", "VERSE 2", "BRIDGE", "FINAL CHORUS"],
    recommendedFor: ["song", "rap", "poetry"],
  },
  {
    id: "freewrite",
    title: "Freewriting page",
    summary: "Start writing without choosing a structure first.",
    genre: "fiction",
    projectTitle: "FREEWRITE",
    synopsis: "",
    prompt: "",
    sections: ["FREEWRITE"],
    recommendedFor: ["fiction", "nonfiction", "memoir", "journalism", "poetry", "essay", "screenplay", "technical"],
  },
];

export function recommendWriterTemplates(genre: WriterGenre): WriterTemplate[] {
  return [...WRITER_TEMPLATES].sort((a, b) =>
    Number(b.recommendedFor.includes(genre)) - Number(a.recommendedFor.includes(genre)),
  );
}
