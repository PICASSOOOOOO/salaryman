import { useState } from "react";
import { X } from "lucide-react";
import { MORE_NAV_ITEMS, PRIMARY_NAV_ITEMS, type AppNavItem } from "./_shared/nav-items";
import "./_group.css";

const dropdownItems = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS]
  .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

function LightweightNebula({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle, #e879f9 0%, #8b5cf6 38%, #312e81 68%, transparent 76%)",
        boxShadow: "0 0 8px rgba(236,72,153,.55)",
      }}
    />
  );
}

export function CurrentMiniNebula({ size }: { size: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: "rgba(0,0,0,0.35)",
        boxShadow: "0 0 8px rgba(236,72,153,0.35), 0 0 16px rgba(168,85,247,0.18)",
        border: "1px solid rgba(236,72,153,0.35)",
      }}
      data-testid="mini-nebula"
    >
      <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <LightweightNebula size={size} />
      </span>
    </span>
  );
}

function CurrentNavTile({ item, onSelect }: { item: AppNavItem; onSelect: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 text-left text-black hover:bg-gray-100"
    >
      <Icon className="h-5 w-5 shrink-0 text-gray-500" />
      <span className="text-[10px] font-bold uppercase tracking-widest">
        {item.boomerLabel ?? item.label}
      </span>
    </button>
  );
}

export function Current() {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/20"
          role="presentation"
          onPointerDown={() => setOpen(false)}
        >
          <div
            id="mobile-features-menu"
            className="max-h-[min(82svh,42rem)] overflow-y-auto rounded-t-xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-2 shadow-xl"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Workspace</span>
              <button type="button" onClick={() => setOpen(false)} className="p-2" aria-label="Close menu">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-lg bg-black p-3 text-left text-[#FAF7EF]"
              aria-label="Open Pablo nebula"
            >
              <CurrentMiniNebula size={38} />
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em]">PABLO AI</span>
                <span className="mt-0.5 block text-[9px] uppercase tracking-wider text-[#D8CBE6]">
                  CHAT + AUTOMATION
                </span>
              </span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              {dropdownItems.map((item) => (
                <CurrentNavTile key={item.id} item={item} onSelect={() => setOpen(false)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
