import { motion } from 'framer-motion';
import { Lightbulb, Code2, MessageSquare, Zap, Mic, Play, Lock } from 'lucide-react';
import type { InterviewMode } from '@/hooks/use-interview';
import { PABLO_PRODUCTS } from '@/lib/product-names';

interface ActionPanelProps {
  onAction: (mode: InterviewMode) => void;
  isStreaming: boolean;
  isPro: boolean;
}

const actions = [
  {
    id: 'hint' as InterviewMode,
    label: PABLO_PRODUCTS.GET_HINT.name,
    description: PABLO_PRODUCTS.GET_HINT.desc,
    icon: Lightbulb,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    hover: 'hover:border-emerald-400/50 hover:bg-emerald-400/20',
  },
  {
    id: 'solution' as InterviewMode,
    label: PABLO_PRODUCTS.FULL_SOLUTION.name,
    description: PABLO_PRODUCTS.FULL_SOLUTION.desc,
    icon: Code2,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    hover: 'hover:border-blue-400/50 hover:bg-blue-400/20',
  },
  {
    id: 'explain' as InterviewMode,
    label: PABLO_PRODUCTS.EXPLAIN_APPROACH.name,
    description: PABLO_PRODUCTS.EXPLAIN_APPROACH.desc,
    icon: MessageSquare,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    hover: 'hover:border-purple-400/50 hover:bg-purple-400/20',
  },
  {
    id: 'complexity' as InterviewMode,
    label: PABLO_PRODUCTS.ANALYZE_COMPLEXITY.name,
    description: PABLO_PRODUCTS.ANALYZE_COMPLEXITY.desc,
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    hover: 'hover:border-amber-400/50 hover:bg-amber-400/20',
  },
];

const sayItAction = {
  id: 'say_it' as InterviewMode,
  label: PABLO_PRODUCTS.SAY_THIS.name,
  description: PABLO_PRODUCTS.SAY_THIS.desc,
  icon: Mic,
};

function ProLockBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-bold border border-primary/30 leading-none">
      <Lock className="w-2 h-2" /> {PABLO_PRODUCTS.PRO_TIER.short}
    </span>
  );
}

export function ActionPanel({ onAction, isStreaming, isPro }: ActionPanelProps) {
  const handleClick = (mode: InterviewMode) => {
    if (!isPro) {
      window.location.href = '/upgrade';
      return;
    }
    onAction(mode);
  };

  return (
    <div className="flex flex-col gap-3 mt-6">
      {/* Say This — full width, prominent */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        onClick={() => handleClick(sayItAction.id)}
        disabled={isPro && isStreaming}
        className={`
          relative flex items-center gap-4 p-4 text-left w-full
          rounded-xl border transition-all duration-300 group overflow-hidden
          ${isPro
            ? 'border-rose-500/50 bg-rose-500/20 hover:bg-rose-500/30 hover:border-rose-500 disabled:opacity-50 disabled:cursor-not-allowed'
            : 'border-primary/25 bg-primary/10 hover:bg-primary/15 hover:border-primary/40 cursor-pointer'
          }
        `}
      >
        <div className={`p-2 rounded-lg border shrink-0 group-hover:scale-110 transition-transform duration-300 ${isPro ? 'bg-rose-500/20 border-rose-500/40' : 'bg-primary/15 border-primary/30'}`}>
          {isPro ? <Mic className="w-5 h-5 text-rose-400" /> : <Lock className="w-5 h-5 text-primary/70" />}
        </div>
        <div className="flex-1">
          <h3 className={`font-bold text-base leading-none mb-1 flex items-center gap-2 ${isPro ? 'text-white' : 'text-foreground/70'}`}>
            {sayItAction.label}
            {isPro
              ? <span className="text-[10px] font-mono bg-rose-500/30 text-rose-300 px-1.5 py-0.5 rounded">QUICK READ</span>
              : <ProLockBadge />
            }
          </h3>
          <p className={`text-xs leading-relaxed ${isPro ? 'text-rose-300/80' : 'text-muted-foreground/60'}`}>
            {sayItAction.description}
          </p>
        </div>
        {!isPro && (
          <span className="text-[10px] text-primary font-semibold shrink-0">Upgrade →</span>
        )}
      </motion.button>

      {/* Other 4 buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 1) * 0.08 }}
              onClick={() => handleClick(action.id)}
              disabled={isPro && isStreaming}
              className={`
                relative flex flex-col items-start p-4 text-left
                rounded-xl border transition-all duration-300 group overflow-hidden
                ${isPro
                  ? `${action.border} ${action.bg} ${action.hover} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[initial] disabled:hover:bg-[initial]`
                  : 'border-border/50 bg-muted/20 hover:bg-primary/8 hover:border-primary/25 cursor-pointer'
                }
              `}
            >
              <div className={`p-2 rounded-lg border mb-3 group-hover:scale-110 transition-transform duration-300 ${isPro ? `bg-background/50 ${action.border}` : 'bg-muted/30 border-border/40'}`}>
                {isPro
                  ? <Icon className={`w-5 h-5 ${action.color}`} />
                  : <Lock className="w-5 h-5 text-muted-foreground/40" />
                }
              </div>
              <h3 className={`font-semibold mb-1 flex items-center gap-2 ${isPro ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                {action.label}
                {isPro
                  ? <Play className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                  : <ProLockBadge />
                }
              </h3>
              <p className="text-xs text-muted-foreground/50 leading-relaxed">
                {action.description}
              </p>
              {isPro && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {!isPro && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-[11px] text-muted-foreground/50 mt-1"
        >
          These modules require{' '}
          <a href="/upgrade" className="text-primary font-semibold hover:underline">{PABLO_PRODUCTS.PRO_TIER.name}</a>.
          {' '}PABLO chat is always free.
        </motion.p>
      )}
    </div>
  );
}
