import { Link } from "wouter";
import "./AppHeader.css";

export function AppBrand() {
  return (
    <Link href="/" className="app-brand" aria-label="SALARYMAN home">
      <img
        src={`${import.meta.env.BASE_URL}icon-192.png`}
        alt=""
        className="app-brand-logo"
      />
      <span className="app-brand-name">SALARYMAN</span>
      <span className="app-brand-meta">
        <span className="app-alpha-badge">
          ALPHA {typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "DEV"}
        </span>
        <span className="app-powered-by">Powered by Picasso Artificial Intelligence</span>
      </span>
    </Link>
  );
}