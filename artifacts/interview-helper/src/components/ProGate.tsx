interface ProGateProps {
  children?: React.ReactNode;
  feature?: string;
  inline?: boolean;
}

export function ProGate({ children }: ProGateProps) {
  return <>{children}</>;
}

export function ProBadge() {
  return null;
}

export function TrialBadge() {
  return null;
}
