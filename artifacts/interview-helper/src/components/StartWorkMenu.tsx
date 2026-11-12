import { LogIn, Menu, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlan } from "@/hooks/use-plan";
import { requestWorkspaceFeatureAssignment } from "@/lib/workspace-events";
import "./AppHeader.css";
import { WorkspaceMenuOverlay } from "./WorkspaceMenuOverlay";

export function StartWorkMenu({ previewMode = false }: { previewMode?: boolean }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { isOwner } = usePlan();
  const [menuOpen, setMenuOpen] = useState(previewMode && isAuthenticated);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const go = useCallback((path: string) => {
    if (!previewMode) {
      if (location.split("?")[0] === "/workspace" && path !== "/workspace") {
        requestWorkspaceFeatureAssignment(path);
      } else {
        navigate(path);
      }
    }
    setMenuOpen(false);
  }, [location, previewMode, navigate]);
  const signOut = useCallback(() => {
    if (!previewMode) void logout();
    setMenuOpen(false);
  }, [logout, previewMode]);

  return (
    <div className="start-work-control">
      {isAuthenticated ? (
        <button
          type="button"
          className={`start-work-button${menuOpen ? " is-open" : ""}`}
          onClick={() => setMenuOpen(open => !open)}
          aria-expanded={menuOpen}
          aria-controls="workspace-navigation-menu"
          aria-label={menuOpen ? "Close start work" : "Open start work"}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
           <span>START WORK</span>
        </button>
      ) : (
        <Link
          href="/sign-in?returnTo=%2F"
          className="start-work-login home-login-link"
          aria-label="Log in to your SALARYMAN account"
        >
          <LogIn aria-hidden="true" />
          <span>LOG IN</span>
        </Link>
      )}

      <WorkspaceMenuOverlay
        open={isAuthenticated && menuOpen}
        pathname={location.split("?")[0]}
        canAccessStaff={isOwner}
        onClose={closeMenu}
        onNavigate={go}
        onSignOut={signOut}
      />
    </div>
  );
}