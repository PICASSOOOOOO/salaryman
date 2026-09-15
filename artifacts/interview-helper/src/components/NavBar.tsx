import { AppBrand } from "./AppBrand";
import { StartWorkMenu } from "./StartWorkMenu";

export function NavBar({ previewMode = false }: { previewMode?: boolean } = {}) {
  return (
    <header className="app-header desktop-app-nav relative z-50 shrink-0 border-b border-[#D8D1C3] bg-[#FAF7EF]">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <AppBrand />
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <StartWorkMenu previewMode={previewMode} />
        </nav>
      </div>
    </header>
  );
}