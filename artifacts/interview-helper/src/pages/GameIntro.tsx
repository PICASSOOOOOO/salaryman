import { Redirect } from "wouter";

// /game/intro is deprecated. The Pablo storyteller in /pablo is now the
// single onboarding gate (gated by the "attention is all you need" passcode).
// Anything that lands here gets bounced to /pablo so the gate is never
// bypassed — tutorial completion is no longer set as a side effect of this
// page.
export default function GameIntro() {
  return <Redirect to="/pablo" />;
}
