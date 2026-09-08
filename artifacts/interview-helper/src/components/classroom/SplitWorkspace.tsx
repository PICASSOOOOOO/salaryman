import { useState, useEffect, useCallback } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { LayoutGrid } from 'lucide-react';

const CRT = '#38bdf8';
const FONT = "var(--font-sans)";

export interface SplitModule {
  id: string;
  label: string;
  render: () => React.ReactNode;
  /** If true, this module may only be shown in a single pane at a time. */
  singleton?: boolean;
}

// Responsive dual-window workspace. By default phones stack the panes
// (top/bottom) and desktop sits them side-by-side with a draggable divider.
// Pass `direction` to force a fixed orientation regardless of viewport
// (e.g. 'vertical' for a top/bottom office split). Each pane has its own
// module picker. Reusable beyond the classroom.
export default function SplitWorkspace({
  modules, initialLeft, initialRight, storageKey, height = '72vh', direction,
}: {
  modules: SplitModule[];
  initialLeft: string;
  initialRight: string;
  storageKey?: string;
  height?: string | number;
  /** Force a split orientation. Omit for the responsive default. */
  direction?: 'horizontal' | 'vertical';
}) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const read = (k: string, fallback: string) => {
    if (!storageKey) return fallback;
    try { return localStorage.getItem(`${storageKey}:${k}`) ?? fallback; } catch { return fallback; }
  };
  const write = (k: string, v: string) => {
    if (!storageKey) return;
    try { localStorage.setItem(`${storageKey}:${k}`, v); } catch { /* */ }
  };

  const singletons = new Set(modules.filter((m) => m.singleton).map((m) => m.id));

  // Persisted state could put a singleton (e.g. the translator) in BOTH panes.
  // Normalize on init: if both panes load the same singleton, bump the right
  // pane to a non-singleton fallback so it never renders twice.
  const [{ left, right }, setPanes] = useState(() => {
    const l = read('left', initialLeft);
    let r = read('right', initialRight);
    if (singletons.has(l) && r === l) {
      r = modules.find((m) => m.id !== l)?.id ?? r;
      write('right', r);
    }
    return { left: l, right: r };
  });
  const setLeft = (id: string) => setPanes((p) => ({ ...p, left: id }));
  const setRight = (id: string) => setPanes((p) => ({ ...p, right: id }));

  // Picking a singleton in one pane bumps it out of the other so it never
  // appears twice (the translator constraint).
  const pickLeft = useCallback((id: string) => {
    setLeft(id); write('left', id);
    if (singletons.has(id) && right === id) {
      const alt = modules.find((m) => m.id !== id)?.id ?? id;
      setRight(alt); write('right', alt);
    }
  }, [right, modules]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickRight = useCallback((id: string) => {
    setRight(id); write('right', id);
    if (singletons.has(id) && left === id) {
      const alt = modules.find((m) => m.id !== id)?.id ?? id;
      setLeft(alt); write('left', alt);
    }
  }, [left, modules]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderPane = (selected: string, onPick: (id: string) => void) => {
    const mod = modules.find((m) => m.id === selected) ?? modules[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(56,189,248,0.15)', background: 'rgba(56,189,248,0.04)' }}>
          <LayoutGrid size={13} color={CRT} />
          <select
            value={mod.id}
            onChange={(e) => onPick(e.target.value)}
            style={{ flex: 1, minWidth: 0, maxWidth: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: CRT, fontFamily: FONT, fontSize: '0.72rem', padding: '4px 8px', borderRadius: 5, outline: 'none' }}
          >
            {modules.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
          {mod.render()}
        </div>
      </div>
    );
  };

  return (
    <ResizablePanelGroup
      direction={direction ?? (isMobile ? 'vertical' : 'horizontal')}
      style={{ height, border: '1px solid rgba(56,189,248,0.18)', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}
    >
      <ResizablePanel defaultSize={50} minSize={20}>
        {renderPane(left, pickLeft)}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={20}>
        {renderPane(right, pickRight)}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
