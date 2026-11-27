import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { getAppHomePath } from "@/lib/app-navigation";
import "./AppHeader.css";

export function AppBrand() {
  const { isAuthenticated } = useAuth();
  return (
    <Link href={getAppHomePath(isAuthenticated)} className="app-brand" aria-label="SALARYMAN home" data-testid="app-brand-home">
      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt=""
        className="app-brand-logo"
      />
      <span className="app-brand-name">SALARYMAN</span>
      <span className="app-brand-meta">
        <span className="app-alpha-badge" data-testid="app-version-badge">
          ALPHA {typeof __BUILD_LABEL__ !== "undefined" ? __BUILD_LABEL__ : "DEV"}
        </span>
        <span className="app-powered-by">Powered by Picasso Artificial Intelligence</span>
      </span>
    </Link>
  );
}