import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Brain, FolderOpen, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";

const MediaLibrary = lazy(() => import("@/pages/MediaLibrary"));
const KnowledgeVault = lazy(() => import("@/pages/KnowledgeVault"));

type VaultTab = "files" | "knowledge";

function readTabFromUrl(): VaultTab {
  return new URLSearchParams(window.location.search).get("tab") === "knowledge"
    ? "knowledge"
    : "files";
}

export default function DataVault() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, navigate] = useLocation();
  const [tab, setTab] = useState<VaultTab>(readTabFromUrl);

  useEffect(() => {
    setTab(readTabFromUrl());
  }, [location]);

  const selectTab = (nextTab: VaultTab) => {
    setTab(nextTab);
    navigate(nextTab === "knowledge" ? "/creative/media?tab=knowledge" : "/creative/media");
  };

  if (isLoading) {
    return <div role="status" style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" size={20} /></div>;
  }
  if (!isAuthenticated) {
    return <SignInPage context="Sign in to access your Data Vault." />;
  }

  return (
    <main style={{ minHeight: "100%", background: "#fafaf7", color: "#111", padding: "18px 16px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto 14px" }}>
        <h1 data-testid="heading-data-vault" style={{ margin: "0 0 12px", fontSize: 18, letterSpacing: "0.12em", fontWeight: 700 }}>
          DATA VAULT
        </h1>
        <div role="tablist" aria-label="Data Vault sections" style={{ display: "flex", gap: 8, borderBottom: "1px solid rgba(0,0,0,0.16)" }}>
          <button
            type="button"
            role="tab"
            data-testid="button-data-vault-files"
            aria-selected={tab === "files"}
            onClick={() => selectTab("files")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 12px",
              border: 0,
              borderBottom: tab === "files" ? "2px solid #111" : "2px solid transparent",
              background: "transparent",
              color: tab === "files" ? "#111" : "#686258",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
              letterSpacing: "0.06em",
            }}
          >
            <FolderOpen aria-hidden="true" size={15} />
            FILES
          </button>
          <button
            type="button"
            role="tab"
            data-testid="button-data-vault-knowledge"
            aria-selected={tab === "knowledge"}
            onClick={() => selectTab("knowledge")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 12px",
              border: 0,
              borderBottom: tab === "knowledge" ? "2px solid #111" : "2px solid transparent",
              background: "transparent",
              color: tab === "knowledge" ? "#111" : "#686258",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
              letterSpacing: "0.06em",
            }}
          >
            <Brain aria-hidden="true" size={15} />
            KNOWLEDGE
          </button>
        </div>
      </div>
      <Suspense fallback={<div role="status" style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" size={20} /></div>}>
        {tab === "files" ? <MediaLibrary /> : <KnowledgeVault />}
      </Suspense>
    </main>
  );
}
