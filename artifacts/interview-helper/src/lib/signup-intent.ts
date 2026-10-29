// Pure intent detectors for the LOGGED-OUT pre-onboarding chat funnel in
// PabloTerminal. Extracted as helpers so the regex-heavy intent logic can be
// unit-tested without mounting the whole terminal component.
//
// These run while interviewPhaseRef.current === 'chatting' (the visitor has
// not authed yet). Readiness starts account intake; cost curiosity is answered
// publicly and must not itself collect identity or provision an account.

// Visitor signaling they're ready to step inside / sign up. Conservative on
// purpose — a casual "ok" mid-question must NOT drop them out of the chat.
// Requires an explicit readiness verb / phrase, not a bare interjection.
export const READY_TO_ENTER_RE =
  /\b(let\s+me\s+(in|enter)|let'?s\s+(go|do\s+(this|it)|start|begin)|i'?m\s+ready|i\s+am\s+ready|ready\s+to\s+(go|enter|come\s+in|sign\s+(in|up))|sign\s+me\s+(in|up)|sign\s*up|signup|(how\s+(do\s+i|can\s+i|to)|where\s+(do|can)\s+i)\s+(sign\s*up|join|get\s+started|start)|(create|make|set\s+up)\s+(an?\s+|my\s+)?account|i\s+want\s+(in|to\s+(sign\s+(in|up)|enter|come\s+in|join|start))|i'?ll\s+(sign|come)\s+in|open\s+the\s+door|take\s+me\s+(in|inside)|i'?m\s+in|can\s+i\s+(use|try|get\s+into|access|join|play)\s+(the\s+)?(app|apps|it|this|platform|game|salaryman))\b/i;

// Negated / refusal forms that LOOK like readiness but aren't:
// "I can't sign up", "don't want to join", "won't sign up", "never join".
const NEGATED_READY_RE =
  /\b(can'?t|cannot|can\s+not|don'?t|do\s+not|won'?t|will\s+not|never)\s+(want(ing)?\s+(to\s+)?|wanna\s+|gonna\s+|going\s+to\s+)?(sign\s*up|signup|sign\s+me\s+(in|up)|join|enter|come\s+in|get\s+started)\b/i;

export function isReadyToEnter(text: string): boolean {
  const t = text.trim();
  if (NEGATED_READY_RE.test(t)) return false;
  return READY_TO_ENTER_RE.test(t);
}

// Cost / "is it free" curiosity. The client answers these in public chat
// without starting account intake; only an explicit non-Pablo feature request
// or signup intent should lead to identity collection.
// Tightened so "how much"/"pay" only match WITH a product/cost object, to
// avoid hijacking ordinary chat like "how much time…" / "I have to pay rent".
export const COST_CURIOUS_RE =
  /\b(is\s+(it|this|salaryman)\s+free|it'?s\s+free|are\s+(you|these|they|the\s+apps?)\s+free|free\s+to\s+(join|use|sign\s*up|play|try|start)|how\s+much\s+(does|is|to|will|would)\s+(it|this|salaryman|sign\s*up|signup|join(ing)?|us(e|ing)|cost|(a|the|to)\s+(join|use|sign\s*up|plan|membership|sub(scription)?|app|apps|platform|game))|does\s+(it|this|salaryman)\s+cost|(do|will)\s+i\s+have\s+to\s+pay|i\s+have\s+to\s+pay\s+(to|for)\s+(join|use|sign\s*up|get\s+in|this|it)|(don'?t|do\s+not)\s+want\s+to\s+pay|won'?t\s+pay|(without|no)\s+pay(ing|ment)?|is\s+there\s+(a|any)\s+(cost|fee|charge|catch))\b/i;

export function isCostCurious(text: string): boolean {
  return COST_CURIOUS_RE.test(text.trim());
}

