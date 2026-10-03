import { Activity, CalendarClock, CheckCircle2, Circle, ShieldCheck, Zap } from "lucide-react";

export type WorkflowDomain = "business_ops" | "marketing" | "crm_calls" | "accounting";

const DOMAIN_FLOW: Record<WorkflowDomain, { guard: string; actions: string[] }> = {
  business_ops: {
    guard: "Organization permission · paid Prime schedule · per-tick action cap",
    actions: ["Advance tasks + staffing", "Close prior-day time entries", "Rate-limited ops update"],
  },
  marketing: {
    guard: "Organization permission · paid Prime + assistant battery for AI · action cap",
    actions: ["Draft with saved tone + topics", "Publish through social service", "Live or simulated outcome"],
  },
  crm_calls: {
    guard: "Organization permission · paid Prime schedule · consent + phone-system checks",
    actions: ["Select eligible due leads", "Suppress opted-out contacts", "Send consent-aware SMS only"],
  },
  accounting: {
    guard: "Organization permission · paid Prime schedule · action cap",
    actions: ["Review collections", "Pay due bills when cash permits", "Run payroll by saved period"],
  },
};

const DOMAIN_NAMES: Record<WorkflowDomain, string> = {
  business_ops: "Business Ops",
  marketing: "Marketing",
  crm_calls: "CRM & Calls",
  accounting: "Accounting",
};

export function AutopilotWorkflow({
  domain,
  enabled,
}: {
  domain: WorkflowDomain;
  enabled: boolean;
}) {
  const flow = DOMAIN_FLOW[domain];
  return (
    <section className="autopilot-flow" aria-label={`${DOMAIN_NAMES[domain]} workflow`} data-workflow-domain={domain}>
      <div className="autopilot-flow-frame">
        <div className={`autopilot-flow-node autopilot-flow-trigger ${enabled ? "is-enabled" : ""}`}>
          <span className="autopilot-flow-icon"><CalendarClock aria-hidden="true" /></span>
          <span className="autopilot-flow-copy">
            <span className="autopilot-flow-kicker">FIXED TRIGGER</span>
            <strong>Scheduled tick</strong>
            <small>Every saved cadence</small>
          </span>
          <span className={`autopilot-flow-state ${enabled ? "is-enabled" : ""}`}>{enabled ? "ARMED" : "PAUSED"}</span>
        </div>
        <span className="autopilot-flow-link" aria-hidden="true" />
        <div className="autopilot-flow-node autopilot-flow-guard">
          <span className="autopilot-flow-icon"><ShieldCheck aria-hidden="true" /></span>
          <span className="autopilot-flow-copy">
            <span className="autopilot-flow-kicker">POLICY GUARD</span>
            <strong>Check before work</strong>
            <small>{flow.guard}</small>
          </span>
        </div>
        <span className="autopilot-flow-link" aria-hidden="true" />
        <div className="autopilot-flow-actions" aria-label={`${DOMAIN_NAMES[domain]} fixed actions`}>
          {flow.actions.map((action, index) => (
            <div className="autopilot-flow-node autopilot-flow-action" key={action}>
              <span className="autopilot-flow-icon">
                {enabled ? <Zap aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="autopilot-flow-copy">
                <span className="autopilot-flow-kicker">ACTION 0{index + 1}</span>
                <strong>{action}</strong>
              </span>
            </div>
          ))}
        </div>
        <span className="autopilot-flow-link" aria-hidden="true" />
        <div className="autopilot-flow-node autopilot-flow-result">
          <span className="autopilot-flow-icon"><Activity aria-hidden="true" /></span>
          <span className="autopilot-flow-copy">
            <span className="autopilot-flow-kicker">AUDIT TRAIL</span>
            <strong>Outcome logged</strong>
            <small>Success · no-op · blocked · error</small>
          </span>
          <CheckCircle2 className="autopilot-flow-check" aria-hidden="true" />
        </div>
      </div>
      <p className="autopilot-flow-note">Fixed server workflow. Steps are descriptive, not reorderable or executable by user code.</p>
    </section>
  );
}