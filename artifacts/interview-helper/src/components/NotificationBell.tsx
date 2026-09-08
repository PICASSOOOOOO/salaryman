import { Bell } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useNotifications } from '../hooks/use-notifications';

// Self-contained notification bell + dropdown panel. Owns its own open-state
// and the data hook so it can be dropped into more than one place (desktop
// NavBar auth cluster AND the mobile primary module bar) without duplicating
// logic. The panel is portaled to <body> and anchored under the bell button,
// so it overlays everything regardless of the host's stacking context and
// works the same whether the bell sits in a static or sticky bar.
export function NotificationBell({
  buttonClassName = 'relative p-1.5 text-zinc-600 hover:text-sky-400 transition-colors rounded-md hover:bg-sky-500/8',
  iconClassName = 'w-3.5 h-3.5',
}: {
  buttonClassName?: string;
  iconClassName?: string;
}) {
  const [, navigate] = useLocation();
  const { notifications, unreadCount, markRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Anchor the panel under the bell trigger, keep it pinned if the layout shifts.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        className={buttonClassName}
      >
        <Bell className={iconClassName} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-1 border border-[#0a0a0b]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed w-[calc(100vw-16px)] sm:w-80 max-h-96 bg-[#111113] border border-white/10 rounded-lg shadow-2xl z-[9999] overflow-hidden flex flex-col"
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
            <span className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={() => markRead()}
                  className="text-xs font-mono text-sky-500 hover:text-sky-400 transition-colors"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => clearAll()}
                  className="text-xs font-mono text-red-500/80 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-600 text-xs font-mono">
                No notifications
              </div>
            ) : (
              notifications.slice(0, 30).map(n => (
                <div
                  key={n.id}
                  className={`group relative w-full border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${!n.read ? 'bg-sky-500/[0.04]' : ''}`}
                >
                  <button
                    onClick={() => {
                      if (!n.read) markRead([n.id]);
                      if (n.link) {
                        const target = n.link === '/comms' || n.link.startsWith('/phone')
                          ? '/tower/mezzanine?focus=phone'
                          : n.link;
                        navigate(target);
                        setOpen(false);
                      }
                    }}
                    className="w-full text-left px-3 py-2.5 pr-9"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-mono leading-tight truncate ${!n.read ? 'text-zinc-200' : 'text-zinc-500'}`}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2 leading-tight">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-600 mt-1 font-mono">
                          {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    aria-label="Dismiss notification"
                    onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded font-mono text-sm transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
